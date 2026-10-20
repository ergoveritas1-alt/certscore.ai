import { pdfAppendixActions, PDF_TOPIC_VERIFICATION } from "./report-pdf-actions";
import { formatScanFromLabel } from "@website-signal-risk-scanner/shared";
import { pdfSiteAssessment, pdfSummaryTopics, type SummaryVisual } from "./report-pdf-summary";
import { appendixEvidenceLines, pdfEvidenceTable } from "./report-pdf-appendices";
import { normalizeReportHeaderTheme, REPORT_HEADER_PALETTES, type ReportHeaderTheme } from "../../lib/report-header-theme";
import { fitPdfText, pdfTextWidth, wrapPdfText } from "./report-pdf-fonts";
import { topFindingWhyItMatters } from "../../lib/scans/top-finding-reader-summary";
import { gpcReaderSummary } from "../../lib/scans/gpc-reader-summary";
import {hasNoQualifiedGpcActivity} from "../../lib/scans/gpc-response-projection";
import { describeGpcObservedFacts } from "../../lib/scans/gpc-observed-facts";
import { describeGpcActivityComparison,californiaCoverageFamilyLabel } from "@certscore/contracts";
import { projectConsentControlReport, consentControlReportLabels } from "../../lib/scans/consent-control-report";
import type { CanonicalReportExport } from "./report-export";
import { deflateSync, inflateSync } from "node:zlib";
import { isGdprTransparencyReportRowId } from "../../lib/scans/gdpr-transparency-report-contract";
import { PDF_REPORT_TOPICS, pdfTopicForFinding, pdfTopicForRow, type PdfReportTopic } from "./report-pdf-topics";

const TRANSPORT_SECURITY_ROW_IDS = new Set([
  "transport_security_https_delivery",
  "transport_security_tls_certificate",
  "transport_security_http_redirect",
  "transport_security_mixed_content",
  "transport_security_form_transport",
]);

function isTransportSecurityRowId(id: unknown): id is string {
  return typeof id === "string" && TRANSPORT_SECURITY_ROW_IDS.has(id);
}

export type ReportPdfVisualEvidence = {
  body: Buffer;
  contentType: string;
};

type PdfImage = {
  bitsPerComponent: number;
  body: Buffer;
  colorSpace: "/DeviceGray" | "/DeviceRGB" | "/DeviceCMYK";
  filter: "/DCTDecode" | "/FlateDecode";
  height: number;
  width: number;
};

function decodeJpeg(body: Buffer): PdfImage | null {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1]!;
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > body.length) return null;
    const length = body.readUInt16BE(offset);
    if (length < 2 || offset + length > body.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 8) return null;
      const bitsPerComponent = body[offset + 2]!;
      const height = body.readUInt16BE(offset + 3);
      const width = body.readUInt16BE(offset + 5);
      const components = body[offset + 7]!;
      const colorSpace = components === 1 ? "/DeviceGray" : components === 4 ? "/DeviceCMYK" : "/DeviceRGB";
      return { bitsPerComponent, body, colorSpace, filter: "/DCTDecode", height, width };
    }
    offset += length;
  }
  return null;
}

function paeth(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance
      ? above
      : upperLeft;
}

function decodePng(body: Buffer, matte: readonly [number, number, number] = [255, 255, 255]): PdfImage | null {
  if (body.length < 33 || !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    const type = body.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > body.length) return null;
    if (type === "IHDR") {
      width = body.readUInt32BE(dataStart);
      height = body.readUInt32BE(dataStart + 4);
      bitDepth = body[dataStart + 8]!;
      colorType = body[dataStart + 9]!;
      interlace = body[dataStart + 12]!;
    } else if (type === "IDAT") {
      idat.push(body.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || channels === 0 || idat.length === 0) return null;
  const inflated = inflateSync(Buffer.concat(idat));
  const rowBytes = width * channels;
  if (inflated.length !== height * (rowBytes + 1)) return null;
  const decoded = Buffer.alloc(height * rowBytes);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++]!;
    const rowOffset = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const raw = inflated[sourceOffset++]!;
      const left = column >= channels ? decoded[rowOffset + column - channels]! : 0;
      const above = row > 0 ? decoded[rowOffset + column - rowBytes]! : 0;
      const upperLeft = row > 0 && column >= channels ? decoded[rowOffset + column - rowBytes - channels]! : 0;
      const value = filter === 0
        ? raw
        : filter === 1
          ? raw + left
          : filter === 2
            ? raw + above
            : filter === 3
              ? raw + Math.floor((left + above) / 2)
              : filter === 4
                ? raw + paeth(left, above, upperLeft)
                : Number.NaN;
      if (!Number.isFinite(value)) return null;
      decoded[rowOffset + column] = value & 0xff;
    }
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 3;
    const red = channels <= 2 ? decoded[source]! : decoded[source]!;
    const green = channels <= 2 ? decoded[source]! : decoded[source + 1]!;
    const blue = channels <= 2 ? decoded[source]! : decoded[source + 2]!;
    const alpha = channels === 2 ? decoded[source + 1]! : channels === 4 ? decoded[source + 3]! : 255;
    rgb[target] = Math.round((red * alpha + matte[0] * (255 - alpha)) / 255);
    rgb[target + 1] = Math.round((green * alpha + matte[1] * (255 - alpha)) / 255);
    rgb[target + 2] = Math.round((blue * alpha + matte[2] * (255 - alpha)) / 255);
  }
  return {
    bitsPerComponent: 8,
    body: deflateSync(rgb, { level: 6 }),
    colorSpace: "/DeviceRGB",
    filter: "/FlateDecode",
    height,
    width,
  };
}

function decodePdfImage(
  visualEvidence: ReportPdfVisualEvidence | null | undefined,
  matte?: readonly [number, number, number],
) {
  if (!visualEvidence?.body.length) return null;
  return decodeJpeg(visualEvidence.body) ?? decodePng(visualEvidence.body, matte);
}

function ascii(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function titleCase(value: unknown) {
  return ascii(value || "Not retained")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function join(values: unknown, empty = "Not retained") {
  return Array.isArray(values) && values.length > 0 ? values.map(ascii).filter(Boolean).join(", ") : empty;
}

function yesNo(value: unknown) {
  return value === true ? "Yes" : value === false ? "No" : "Not retained";
}

function formatTiming(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value / 1_000).toFixed(value < 10_000 ? 2 : 1)}s after scan start`
    : "Timing not retained";
}

function formatDuration(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${(value / 1_000).toFixed(1)} seconds`
    : "Not available";
}

function formatReportDate(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`
    : "Unavailable";
}

function formatConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "Not retained";
}

export type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapAfter?: number;
  indent?: number;
  pageBreakBefore?: boolean;
  kind?: "body" | "caption" | "coverDomain" | "coverMeta" | "coverTitle" | "fullImageSlice" | "image" | "itemHeading" | "actionHeading" | "section" | "appendixStage" | "chapterNavigation" | "summary" | "tableHeader" | "tableRow" | "evidenceChart" | "topicOverview";
  gapBefore?: number;
  keepWithNextHeight?: number;
  keepWithNextParagraph?: boolean;
  reservedHeight?: number;
  imageSliceIndex?: number;
  imageSliceCount?: number;
  destination?: string;
  chapterTitle?: string;
  paragraphId?: string;
  flowGroup?: string;
  tailGroup?: string;
  navigationTopic?: PdfReportTopic;
  href?: string;
  internalDestination?: string;
  tableId?: string;
  cells?: string[][];
  columnWidths?: number[];
  chart?: { title: string; bars: Array<{ label: string; value: number }> };
  overview?: { metrics: Array<{ label: string; value: string }>; observed: number; review: number; limited: number; checks: number };
};

const FULL_CAPTURE_INNER_WIDTH = 502;
const FULL_CAPTURE_SLICE_HEIGHT = 630;

function wrappedLines(value: unknown, options: Omit<PdfLine, "text"> = {}): PdfLine[] {
  // Wrap once, using actual font metrics, after all layout choices are known.
  return [{ text: ascii(value), ...options }];
}

function sectionHeading(text: string, pageBreakBefore = false): PdfLine {
  return {
    text,
    size: 14,
    bold: true,
    gapAfter: 7,
    gapBefore: 16,
    keepWithNextHeight: 42,
    kind: "section",
    pageBreakBefore,
  };
}

function findingDisplay(finding: Record<string, unknown>) {
  const presentation = record(finding.presentation);
  const description = presentation?.findingDescription ?? presentation?.description ?? finding.summary;
  return {
    name: presentation?.findingName ?? finding.title ?? finding.unifiedFindingId ?? "Finding",
    severity: finding.severity ?? "review",
    description: finding.unifiedFindingId === "gpc_response" && typeof description === "string" ? gpcReaderSummary(description) : description,
    why: presentation?.whyThisMatters ?? topFindingWhyItMatters({ id: String(finding.unifiedFindingId ?? ""), title: String(finding.title ?? ""), summary: String(finding.summary ?? "") }),
    fix: presentation?.suggestedFix,
    confidence: presentation?.confidenceScore,
  };
}

function reportLines(report: CanonicalReportExport, image: PdfImage | null): PdfLine[] {
  const review = report.gdprEprivacyReview;
  const transparencyAppendix = report.appendix.gdprTransparency;
  const runtimeAppendix = report.appendix.cookieAndTrackerInventory;
  const collectionAppendix = report.appendix.dataCollectionSurfaces;
  const transportRows = review?.rows.filter((row) => isTransportSecurityRowId(row.id)) ?? [];
  const mainChecklistRows = review?.rows.filter((row) =>
    !isGdprTransparencyReportRowId(row.id) && !isTransportSecurityRowId(row.id)
  ) ?? [];
  const sections: Record<PdfReportTopic, PdfLine[]> = { consent: [], storage: [], policy: [], forms: [], security: [], external: [], tls: [], accessibility: [] };
  const reportContext: PdfLine[] = [];
  let lines = reportContext;
  lines.push(...wrappedLines(`Scan ID: ${report.scan.id}. Completed: ${report.scan.completedAt ?? "Unavailable"}. Generated: ${report.generatedAt}. Duration: ${formatDuration(report.scan.durationMs)}.`, { size: 8, gapAfter: 5 }));
  lines.push(...wrappedLines(`${report.reviewFocusLabel} focus. ${report.reviewScope}`, { size: 9, gapAfter: 5 }));
  lines.push(
    ...(report.reviewFocus === "ccpa_cpra" ? wrappedLines(`California starting-page score: ${report.californiaScore.score === null ? "Unavailable" : `${report.californiaScore.score}/100`}.`, { size: 9, gapAfter: 5 }) : []),
    ...(report.reviewFocus === "ccpa_cpra" && report.californiaScore.reviewCoverage ? wrappedLines(
      `California coverage (assuming CCPA applies): ${report.californiaScore.reviewCoverage.families.map(row=>`${row.id.replaceAll("_"," ")}: ${californiaCoverageFamilyLabel(row)}`).join("; ")}.`, {size:9,gapAfter:5}) : []),
    ...(report.reviewFocus === "ccpa_cpra" && report.californiaScore.rightsAssessment ? report.californiaScore.rightsAssessment.topics.flatMap(topic=>[
      ...wrappedLines(`Rights clause - ${topic.topic.replaceAll("_"," ")}: ${topic.status.replaceAll("_"," ")}. ${topic.reason}`,{size:9,gapAfter:4}),
      ...topic.passages.flatMap(passage=>wrappedLines(passage.excerpt,{size:8,gapAfter:3})),
    ]) : []),
    ...(report.reviewFocus === "ccpa_cpra" && (report.californiaScore.collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v4" || report.californiaScore.collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v5") ? report.californiaScore.collectionNoticeAssessment.runtimePurposeAssessment.items.flatMap(item=>wrappedLines(`Storage purpose - ${item.name} (${item.kind}): ${item.purpose}; data source ${item.dataOrigin.replaceAll("_"," ")}. ${item.reason}`,{size:9,gapAfter:4})) : []),
    ...(report.reviewFocus === "ccpa_cpra" && report.californiaScore.collectionNoticeAssessment?.contractVersion === "certscore.california-collection-notice-matching.v5" ? report.californiaScore.collectionNoticeAssessment.runtimePurposeAssessment.items.flatMap(item=>[
      ...(item.declaredPurpose?wrappedLines(`Website declaration - ${item.name}: declared ${item.declaredPurpose.purpose}. ${item.declaredPurpose.passage.excerpt}`,{size:9,gapAfter:4}):[]),
      ...(item.readUse?wrappedLines(`Storage read/use - ${item.name}: ${item.readUse.reason} ${item.readUse.reads.map(read=>`${read.context.replaceAll("_"," ")}; ${read.count} reads; value ${read.valueState}`).join(". ")}`,{size:9,gapAfter:4}):[]),
    ]) : []),
    ...(report.reviewFocus === "ccpa_cpra" && report.californiaScore.collectionNoticeAssessment ? report.californiaScore.collectionNoticeAssessment.points.flatMap(point=>
      wrappedLines(`${"assessmentScope" in point && point.assessmentScope === "technical_context"?"Technical product lookup":"Collection-notice matching"} - ${point.label}: ${"categoryMatch" in point?`category ${point.categoryMatch.replaceAll("_"," ")}; purpose ${point.purposeMatch.replaceAll("_"," ")}`:point.status.replaceAll("_"," ")}. ${point.reason}`,{size:9,gapAfter:4})) : []),
    ...(report.reviewFocus === "ccpa_cpra" && report.californiaScore.saleSharingAssessment ? report.californiaScore.saleSharingAssessment.topics.flatMap(topic=>[
      ...wrappedLines(`Sale/sharing clause - ${topic.topic.replaceAll("_"," ")}: ${topic.status.replaceAll("_"," ")}. ${topic.reason}`,{size:9,gapAfter:4}),
      ...topic.passages.flatMap(passage=>wrappedLines(passage.excerpt,{size:8,gapAfter:3})),
    ]) : []),
  );
  lines = sections.consent;
  lines.push(sectionHeading("Privacy choices and notices"));
  if (!report.privacyAuditEvidence) lines.push(...wrappedLines("Unknown: verified privacy-choice and notice evidence was not retained. This does not establish absence."));
  else {
    const audit = report.privacyAuditEvidence;
    lines.push(...wrappedLines("Starting-page observations only. Opt-out execution and notice placement at collection points were not assessed. Topic passages are evidence aids, not disclosure-adequacy assessments."));
    for (const control of audit.controls) lines.push(...wrappedLines(`${control.kind.replaceAll("_", " ")}: ${control.label}. ${control.placement.replaceAll("_", " ")}. Destination: ${control.destinationUrl ?? "not retained"}. Evidence: ${control.evidenceRef}`));
    if (audit.contractVersion === "certscore.privacy-audit-evidence.v2") for (const candidate of audit.controlCandidates) {
      lines.push(...wrappedLines(`${candidate.kind.replaceAll("_", " ")}: link identified (${candidate.verification.replaceAll("_", " ")}); visitor-facing choice not confirmed. Destination: ${candidate.destinationUrl}. Evidence: ${candidate.evidenceRef}`));
    }
    if (!audit.controls.length && (audit.contractVersion !== "certscore.privacy-audit-evidence.v2" || !audit.controlCandidates.length)) lines.push(...wrappedLines("No verified privacy-choice surface retained; control absence remains unknown."));
    lines = sections.policy;
    lines.push(sectionHeading("Retained privacy notices"));
    for (const notice of audit.notices) {
      lines.push(...wrappedLines(`${notice.kind}: ${notice.url}. Text coverage: ${notice.coverage}. Evidence: ${notice.evidenceRef}`));
      for (const passage of notice.passages) lines.push(...wrappedLines(`${passage.topic.replaceAll("_", " ")} - passage for review: ${passage.excerpt}`, { size: 9 }));
    }
    if (audit.truncated) lines.push(...wrappedLines("Privacy workpaper display limits apply."));
  }
  lines = sections.consent;
  lines.push(sectionHeading("GPC observations"));
  if (report.gpcResponse) {
    const gpc = report.gpcResponse;
    const facts = describeGpcObservedFacts(gpc.observation);
    for (const fact of facts) lines.push(...wrappedLines(`${fact.label}: ${fact.value}`));
    if (gpc.activityComparison) lines.push(...wrappedLines(describeGpcActivityComparison(gpc.activityComparison)));
    if (gpc.comparison.comparable && gpc.status !== "indeterminate") {
      lines.push(...wrappedLines(hasNoQualifiedGpcActivity(gpc)
        ? "GPC comparison: No qualifying tracking activity observed in either completed matched visit."
        : `Comparison: ${gpc.status.replaceAll("_", " ")}. ${gpcReaderSummary(gpc.summary)}`, { size: facts.length ? 9 : 10 }));
    }
    lines.push(...wrappedLines(`Evidence: ${gpc.evidenceUrl}. Full delivery proof and comparison deltas are available in the JSON workpaper.`, { size: 9 }));
  } else lines.push(...wrappedLines("No verified GPC assessment available; response remains unknown."));
  for (const [label, observation] of [["Accept", report.postAcceptObservation], ["Reject", report.postRefusalObservation]] as const) {
    if (observation) lines.push(sectionHeading(`${label} observation`), ...wrappedLines(observation.interpretation ?? "See the typed JSON export for the retained outcome."));
  }

  lines = sections.external;
  if(report.fullSite) {
    const f=report.fullSite, {state,counts,totals,timing}=f.summary;
    lines.push(...[
      sectionHeading("Scan scope and resource inventory"),
      ...wrappedLines(`${f.scope}. Additional pages: Not assessed for consent, CMP, policy, GDPR transparency or transport.`),
      ...wrappedLines(`${f.scoreScope} (overall, GDPR/ePrivacy-weighted): ${f.score?.value ?? "Unavailable"}/100. ${f.score?.scope ?? "Scored evidence unavailable."}`),
      ...wrappedLines(`${f.condition} ${f.countingScope}`),
      ...wrappedLines(`Max pages including homepage: ${state.requested.maxPages}; requested concurrency: ${state.requested.concurrency}; wait between starts: ${state.requested.waitSeconds}s; region: ${state.region}.`),
      ...wrappedLines(`Effective concurrency: ${state.effective.concurrency}; effective wait: ${state.effective.waitSeconds}s. Status: ${state.status}; stop reason: ${state.stopReason??"In progress"}.`),
      ...(state.robotsRestriction ? wrappedLines(state.robotsRestriction) : []),
      ...wrappedLines(`Coverage: ${counts.completed} completed; ${counts.partial} partial; ${counts.blockedFailed} blocked/failed; ${counts.pending} pending; ${counts.excluded} excluded/unvisited.`),
      ...wrappedLines(`Across observed pages: ${totals.services} distinct services; ${totals.cookies} distinct cookies; ${totals.requestEvents} request events; ${totals.embedInstances} embed instances. Additional services: ${totals.additionalServices??"Homepage comparison unavailable"}.`),
      ...wrappedLines(`Started: ${state.startedAt}; ended: ${state.completedAt??"In progress"} (UTC). Homepage audit: ${formatDuration(state.homepageDurationMs)}. Median observation: ${formatDuration(timing.medianPageMs)} (${timing.sampleCount} samples); slowest: ${formatDuration(timing.slowestPageMs)}.`),
      ...wrappedLines(`Evidence: https://certscore.ai${f.inventoryHref}`),
      ...f.pages.flatMap(page=>wrappedLines(`${page.url}${page.finalUrl&&page.finalUrl!==page.url?` -> ${page.finalUrl}`:""} | ${page.status} | ${page.services??"Unavailable"} services; ${page.cookies??"Unavailable"} cookies; ${page.requestEvents??"Unavailable"} request events; ${page.embedInstances??"Unavailable"} embed instances. ${page.limitations.join(", ")} Evidence page ID: ${page.id}`)),
      sectionHeading("Full-site resource inventory"),
      ...wrappedLines(`${f.resources.length} distinct resources across observed pages. Page IDs map to the coverage list above. The JSON download contains every resource row.`),
      ...f.resources.slice(0, 500).flatMap(row => wrappedLines(`${row.occurrence.kind}: ${row.occurrence.label} | ${row.occurrence.vendor ?? "Unknown vendor"} | ${row.purposes.join(", ")} | ${row.pageIds.length} page(s): ${row.pageIds.join(", ")}`)),
      ...(f.resources.length > 500 ? wrappedLines("PDF shows the first 500 resources. Download the full-site JSON for the complete inventory.") : []),
      sectionHeading("Homepage audit"),
    ]);
  }

  lines = sections.security;
  const siteIntegrity = report.appendix.siteIntegritySite;
  if (siteIntegrity) lines.push(sectionHeading("Site integrity coverage"), ...wrappedLines(`${siteIntegrity.coverage.filter(page => page.status !== "unavailable").length} of ${siteIntegrity.coverage.length} scanned pages have retained capture.`), ...siteIntegrity.coverage.flatMap(page => wrappedLines(`${page.url} | ${page.status}`)));
  for (const integrity of siteIntegrity?.findings ?? (report.appendix.siteIntegrity ? [report.appendix.siteIntegrity] : [])) {
    const evidence = integrity.evidence;
    lines.push(sectionHeading("Site integrity - High priority"),
      ...wrappedLines(integrity.title, { bold: true }), ...wrappedLines(integrity.description),
      ...wrappedLines(`Source page: ${evidence.observation.documentUrl}. Captured: ${evidence.observation.capturedAt}.`),
      ...evidence.observation.links.flatMap(link => wrappedLines(`${link.destinationDomain} | ${titleCase(link.concealment)} | ${link.evidenceRef}`)),
      ...wrappedLines(integrity.action),
      ...wrappedLines("Bounded source-page main-document capture only. Destination pages were not opened."),
      ...wrappedLines(`Evidence: ${evidence.evidenceRef}; source SHA-256: ${evidence.sourceHash}; observation SHA-256: ${evidence.observationHash}.`),
    );
  }

  lines = reportContext;
  lines.push(sectionHeading("Review scope"));
  if (review) {
    lines.push(
      ...wrappedLines(review.reviewSummary.coverageText),
      ...wrappedLines(review.reviewSummary.priorityReviewText, { gapAfter: 3 }),
      {
        text: `Summary counts: ${review.summaryCounts.gap_observed} observed gaps; ${review.summaryCounts.potential_concern} potential concerns; ${review.summaryCounts.review_signal} review signals; ${review.summaryCounts.technical_limitation} technical limitations.`,
      },
    );
  } else {
    lines.push({ text: "A persisted GDPR/ePrivacy checklist presentation was not available for this scan." });
  }

  lines = sections.consent;
  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Consent control assessment"));
  const controlReport = projectConsentControlReport(report.consentControlAssessment, report.scan.id);
  if (controlReport) {
    const labels = consentControlReportLabels(controlReport);
    lines.push({ text: `Accept control: ${labels.accept}` }, { text: `Reject / necessary-only control: ${labels.reject}` },
      { text: `Options / settings control: ${labels.options}` }, { text: "Scope: initial visit, first layer." });
  } else lines.push({ text: "A usable consent-control summary is unavailable for this scan." });

  lines = sections.consent;

  if (!review || mainChecklistRows.length === 0) {
    lines.push({ text: "No main-checklist presentation rows were retained." });
  } else {
    mainChecklistRows.forEach((row, index) => {
      lines = sections[pdfTopicForRow(row.id) ?? "policy"];
      lines.push({ text: `${index + 1}. ${row.label}: ${row.evidenceLabel}`, bold: true, gapAfter: 1, keepWithNextHeight: 18 });
      lines.push(...wrappedLines(row.rationale, { indent: 10, size: 9, gapAfter: 3 }));
    });
  }

  lines = reportContext;
  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Scope and limitations"));
  report.limitations.forEach((limitation) => {
    lines.push(...wrappedLines(`${titleCase(limitation.code)}: ${limitation.detail ?? "No further detail retained."}`, {
      gapAfter: 2,
    }));
  });
  lines.push(
    ...wrappedLines(report.notice, { size: 9, gapAfter: 5 }),
  );

  lines = sections.storage;
  lines.push(sectionHeading("Cookie and storage inventory"));
  lines.push(...wrappedLines(runtimeAppendix.scopeNote, { size: 9, gapAfter: 4 }));
  lines.push(...wrappedLines(
    `Inventory summary: ${runtimeAppendix.summary.cookieRows} retained cookies; ${runtimeAppendix.summary.storageRows ?? 0} localStorage / sessionStorage rows. Service and domain observations are in Appendix F.`,
    { bold: true, gapAfter: 3 },
  ));
  if (runtimeAppendix.presentationMessage) {
    lines.push(...wrappedLines(runtimeAppendix.presentationMessage, { gapAfter: 3 }));
  }
  if (runtimeAppendix.summary.omittedRows > 0) {
    lines.push({ text: `${runtimeAppendix.summary.omittedRows} rows were omitted by the bounded 500-row export limit.`, gapAfter: 3 });
  }
  sections.external.push(sectionHeading("Service and domain inventory"), ...wrappedLines(runtimeAppendix.scopeNote, { size: 9 }),
    ...wrappedLines(`${runtimeAppendix.summary.trackerRows} retained service / tracker rows. ${runtimeAppendix.summary.omittedRows} total inventory rows omitted by the export limit. Zero retained rows do not establish absence.`));
  runtimeAppendix.rows.forEach((row) => {
    lines = sections[row.type === "cookie" || row.type === "storage" ? "storage" : "external"];
    lines.push({
      text: `${row.rowNumber}. ${titleCase(row.type)} - ${row.vendor}`,
      size: 11,
      bold: true,
      gapAfter: 1,
      gapBefore: 2,
      keepWithNextHeight: 38,
      kind: "itemHeading",
    });
    lines.push(...wrappedLines(
      `Purpose: ${join(row.purpose)} | Evidence: ${row.evidenceClassification} | Category: ${row.category} | Priority: ${titleCase(row.priority)} | Confidence: ${titleCase(row.confidence)}`,
      { indent: 10, size: 9 },
    ));
    lines.push(...wrappedLines(
      `Observed: ${formatTiming(row.firstSeenMs)} | Pre-consent: ${yesNo(row.preConsent)} | Party: ${titleCase(row.relationship.party)} | Site relationship: ${titleCase(row.relationship.site)} | Entity relationship: ${titleCase(row.relationship.entity)}`,
      { indent: 10, size: 9 },
    ));
    lines.push(...wrappedLines(`Name(s): ${join(row.cookieNames)} | Domain(s): ${join(row.domains)}`, {
      indent: 10,
      size: 9,
    }));
    lines.push(...wrappedLines(
      `Observed records: ${row.observedRecordCount}; requests: ${row.requestCount ?? "not retained"}; set by third-party script: ${yesNo(row.setByThirdPartyScript)}; timing basis: ${titleCase(row.timingEvidence)}`,
      { indent: 10, size: 9 },
    ));
    if (row.attributionSignatures.length > 0) {
      lines.push(...wrappedLines(`Attribution: ${join(row.attributionSignatures)}`, { indent: 10, size: 8 }));
    }
    if (row.regulatoryRelevance.length > 0) {
      lines.push(...wrappedLines(`Regulatory relevance: ${join(row.regulatoryRelevance)}`, { indent: 10, size: 8 }));
    }
    if (row.storageDetails) lines.push(...wrappedLines(
      `Storage: ${row.storageDetails.storageType}; key ${row.storageDetails.key}; origin ${row.storageDetails.origin ?? "not retained"}; identity ${row.storageDetails.identityBasis}; source SHA-256 ${row.storageDetails.sourceHash}.`, { indent: 10, size: 8 }));
    if (row.evidenceRefs?.length) lines.push(...wrappedLines(`Evidence references: ${join(row.evidenceRefs)}`, { indent: 10, size: 8 }));
    row.cookieDetails.forEach((cookie, index) => {
      lines.push(...wrappedLines(
        `Cookie detail ${index + 1}: ${cookie.cookieName}; domain ${cookie.domain ?? "not retained"}; path ${cookie.path ?? "not retained"}; essentiality ${titleCase(cookie.essentiality)}; first observed ${formatTiming(cookie.firstObservedAtMs)}; set method ${cookie.setMethod ?? "not retained"}; expires ${cookie.expiresAt ?? "not retained"}.`,
        { indent: 18, size: 8 },
      ));
      lines.push(...wrappedLines(`Retention: ${cookie.lifespanSeconds ?? "Not retained"} seconds; set at ${formatTiming(cookie.setAtMs)}; evidence grade ${cookie.evidenceGrade ?? "Not retained"}; timing ${titleCase(cookie.timingEvidence)}. Essentiality confidence: ${cookie.essentialityConfidence ?? "Not retained"}; basis: ${join(cookie.essentialityReasonCodes, "Not retained")}.`, { indent: 18, size: 8 }));
      if (cookie.description) {
        lines.push(...wrappedLines(`Description: ${cookie.description}`, { indent: 18, size: 8 }));
      }
      if (cookie.initiatorVendor || cookie.initiatorDomain || cookie.sourceRequestUrl || cookie.setterScriptUrl) {
        lines.push(...wrappedLines(
          `Initiator: ${cookie.initiatorVendor ?? cookie.initiatorDomain ?? "not retained"}; source request: ${cookie.sourceRequestUrl ?? "not retained"}; setter script: ${cookie.setterScriptUrl ?? "not retained"}.`,
          { indent: 18, size: 8 },
        ));
      }
    });
    row.requestDetails.forEach((request, index) => {
      lines.push(...wrappedLines(
        `Request detail ${index + 1}: ${request.method ?? "method not retained"} ${request.hostname ?? "host not retained"}${request.path ?? ""}; role ${titleCase(request.resourceRole)}; essentiality ${titleCase(request.essentiality)}; response observed ${yesNo(request.responseObserved)}; response storage attempted ${yesNo(request.responseStorageAttempted)}; cookies sent ${join(request.cookieNamesSent, "none retained")}; response cookies ${join(request.responseCookieNamesSet, "none retained")}; identifier parameters ${join(request.identifierParameterNames, "none retained")}.`,
        { indent: 18, size: 8 },
      ));
    });
    row.dataFlows.forEach((flow, index) => {
      lines.push(...wrappedLines(
        `Data flow ${index + 1}: ${flow.endpoint}; server/edge ${flow.networkDestination.ip ?? "IP not retained"} ${flow.networkDestination.countryCode ?? ""}; controlling entity ${flow.controllingEntity.legalEntity ?? "not retained"} ${flow.controllingEntity.headquartersCountry ?? ""}; network ${flow.networkDestination.country ?? "Country not retained"}; ASN ${flow.networkDestination.asn ?? "Not retained"}; provider ${flow.networkDestination.provider ?? "Not retained"}. ${flow.networkDestination.label}. Transfer context ${titleCase(flow.transferMechanism.mechanism)}; ${flow.transferMechanism.basis}; verified as of ${flow.transferMechanism.verifiedAsOf}; ID sync ${yesNo(flow.idSync)}.`,
        { indent: 18, size: 8 },
      ));
    });
    lines.push({ text: "", gapAfter: 3 });
  });

  lines = sections.forms;
  lines.push(sectionHeading("Data collection surfaces"));
  lines.push(...wrappedLines(collectionAppendix.scopeNote, { size: 9, gapAfter: 4 }));
  lines.push(...wrappedLines(
    `Inventory summary: ${collectionAppendix.summary.totalForms} retained forms; ${collectionAppendix.summary.totalFields} retained fields; assessment ${titleCase(collectionAppendix.assessmentStatus)}.`,
    { bold: true, gapAfter: 3 },
  ));
  lines.push(...wrappedLines(collectionAppendix.presentationMessage, { gapAfter: 3 }));
  if (collectionAppendix.pageUrl) {
    lines.push(...wrappedLines(`Assessed page: ${collectionAppendix.pageUrl}`, { size: 9, gapAfter: 2 }));
  }
  if (collectionAppendix.coverage) {
    lines.push(...wrappedLines(
      `Coverage: ${titleCase(collectionAppendix.coverage.status)}; document scope ${titleCase(collectionAppendix.coverage.documentScope)}; interaction mode ${titleCase(collectionAppendix.coverage.interactionMode)}; inspected ${collectionAppendix.coverage.inspectedFormCandidateCount} form candidates and ${collectionAppendix.coverage.inspectedFieldCandidateCount} field candidates.`,
      { size: 9, gapAfter: 2 },
    ));
  }
  if (collectionAppendix.summary.omittedForms > 0 || collectionAppendix.summary.omittedFields > 0) {
    lines.push(...wrappedLines(
      `Bounded retention omitted ${collectionAppendix.summary.omittedForms} forms and ${collectionAppendix.summary.omittedFields} fields from the candidate inventory.`,
      { size: 9, gapAfter: 2 },
    ));
  }
  if (collectionAppendix.limitationKeys.length > 0) {
    lines.push(...wrappedLines(`Limitations: ${join(collectionAppendix.limitationKeys)}`, {
      size: 8,
      gapAfter: 3,
    }));
  }
  if (collectionAppendix.forms.length === 0) {
    lines.push({
      text: collectionAppendix.assessmentStatus === "not_observed"
        ? "No forms found."
        : "No form rows were retained; the assessment message above governs interpretation.",
    });
  }
  collectionAppendix.forms.forEach((form, formIndex) => {
    lines.push({
      text: `${formIndex + 1}. ${form.title ?? titleCase(form.surfaceType)}`,
      size: 11,
      bold: true,
      gapAfter: 1,
      gapBefore: 2,
      keepWithNextHeight: 40,
      kind: "itemHeading",
    });
    lines.push(...wrappedLines(
      `Page: ${form.pageUrl} | Structure: ${titleCase(form.structure)} | Surface type: ${titleCase(form.surfaceType)} | Method: ${titleCase(form.method)}`,
      { indent: 10, size: 9 },
    ));
    lines.push(...wrappedLines(
      `Action: ${titleCase(form.actionRelationship)}${form.actionHostname ? ` (${form.actionHostname})` : ""} | Fields retained: ${form.retainedFieldCount} of ${form.candidateFieldCount} | Truncated: ${yesNo(form.fieldsTruncated)} | Confidence: ${formatConfidence(form.confidence)} | Basis: ${titleCase(form.directVsInferred)}`,
      { indent: 10, size: 9, gapAfter: 2 },
    ));
    if (form.evidenceRefs.length > 0) {
      lines.push(...wrappedLines(
        `Form evidence references: ${join(form.evidenceRefs.map((reference) => reference.refId))}`,
        { indent: 10, size: 8, gapAfter: 2 },
      ));
    }
    form.fields.forEach((field, fieldIndex) => {
      const state = field.disabled ? "disabled" : field.readOnly ? "read-only" : "available";
      lines.push(...wrappedLines(
        `Field ${fieldIndex + 1}: ${field.label ?? "Label not retained"}; element ${titleCase(field.elementType)}; input type ${titleCase(field.inputType)}; category ${titleCase(field.semanticCategory)}; required ${yesNo(field.required)}; state ${state}; autocomplete ${field.autocompleteToken ?? "not retained"}; confidence ${formatConfidence(field.confidence)}; basis ${titleCase(field.directVsInferred)}.`,
        { indent: 18, size: 8, gapAfter: 1 },
      ));
      if (field.evidenceRefs.length > 0) {
        lines.push(...wrappedLines(
          `Field evidence references: ${join(field.evidenceRefs.map((reference) => reference.refId))}`,
          { indent: 18, size: 8 },
        ));
      }
    });
    lines.push({ text: "", gapAfter: 3 });
  });

  lines = sections.policy;
  lines.push(sectionHeading("GDPR Transparency"));
  lines.push(...wrappedLines(transparencyAppendix.scopeNote, { size: 9, gapAfter: 4 }));
  lines.push(...wrappedLines(
    `Transparency summary: ${transparencyAppendix.summary.totalRows} rows; ${transparencyAppendix.summary.observedRows} observed; ${transparencyAppendix.summary.notConfirmedRows} not confirmed; ${transparencyAppendix.summary.noMatchRows} no match found.`,
    { bold: true, gapAfter: 5 },
  ));
  if (transparencyAppendix.rows.length === 0) {
    lines.push({ text: "No persisted GDPR Transparency checklist rows were retained." });
  }
  transparencyAppendix.rows.forEach((row, index) => {
    lines.push({
      text: `${index + 1}. ${row.label}: ${row.evidenceLabel}`,
      size: 11,
      bold: true,
      gapAfter: 1,
      gapBefore: 2,
      keepWithNextHeight: 28,
      kind: "itemHeading",
    });
    lines.push(...wrappedLines(row.rationale, { indent: 10, size: 9, gapAfter: 2 }));
    lines.push(...wrappedLines(
      `Assessment: ${titleCase(row.assessmentStatus)} | Evidence state: ${titleCase(row.evidenceState)} | Direction: ${titleCase(row.assessmentDirection)}${row.scannerCoverageGap ? " | Scanner coverage gap retained" : ""}`,
      { indent: 10, size: 8, gapAfter: 3 },
    ));
  });

  for (const id of ["security", "tls"] as const) {
    sections[id].push(...wrappedLines("Bounded starting-page transport evidence only. Missing evidence remains unknown; these checks do not establish complete server security.", { size: 9 }));
    if (!transportRows.some(row => pdfTopicForRow(row.id) === id)) sections[id].push({ text: "No persisted transport checklist rows were retained for this topic." });
  }
  transportRows.forEach((row, index) => {
    lines = sections[pdfTopicForRow(row.id) ?? "security"];
    lines.push({
      text: `${index + 1}. ${row.label}: ${row.evidenceLabel}`,
      size: 11,
      bold: true,
      gapAfter: 1,
      gapBefore: 2,
      keepWithNextHeight: 28,
      kind: "itemHeading",
    });
    lines.push(...wrappedLines(row.rationale, { indent: 10, size: 9, gapAfter: 2 }));
    lines.push(...wrappedLines(
      `Assessment: ${titleCase(row.assessmentStatus)} | Evidence state: ${titleCase(row.evidenceState)} | Direction: ${titleCase(row.assessmentDirection)}${row.scannerCoverageGap ? " | Scanner coverage gap retained" : ""}`,
      { indent: 10, size: 8, gapAfter: 3 },
    ));
  });

  lines = sections.consent;
  if (image) {
    const fullCaptureHeight = image.height * (FULL_CAPTURE_INNER_WIDTH / image.width);
    const sliceCount = Math.max(1, Math.ceil(fullCaptureHeight / FULL_CAPTURE_SLICE_HEIGHT));
    for (let index = 0; index < sliceCount; index += 1) {
      lines.push(sectionHeading(
        index === 0
          ? "Captured page evidence - full capture"
          : `Full captured page - continued (${index + 1} of ${sliceCount})`,
        true,
      ));
      if (index === 0) {
        lines.push(...wrappedLines(
          `Retained pre-interaction capture shown across ${sliceCount} PDF page${sliceCount === 1 ? "" : "s"} at a legible scale.`,
          { size: 9, gapAfter: 4 },
        ));
      }
      lines.push({
        text: `Full captured page segment ${index + 1} of ${sliceCount}`,
        kind: "fullImageSlice",
        reservedHeight: Math.min(
          FULL_CAPTURE_SLICE_HEIGHT,
          fullCaptureHeight - index * FULL_CAPTURE_SLICE_HEIGHT,
        ) + 20,
        imageSliceIndex: index,
        imageSliceCount: sliceCount,
      });
    }
  }
  lines = sections.accessibility;
  lines.push(...wrappedLines("Automated starting-page accessibility evidence supporting ADA/WCAG review. This is not an ADA compliance determination or a complete WCAG conformance audit. Manual review is required.", { size: 9 }));
  const accessibility = report.accessibilityAudit;
  if (accessibility) lines.push(...wrappedLines(
    `Automated audit: ${accessibility.status}; engine ${accessibility.engine} ${accessibility.engineVersion ?? "version unavailable"}; failed rules ${accessibility.failedRuleCount ?? "unknown"}; affected nodes ${accessibility.affectedNodeCount ?? "unknown"}; rules needing review ${accessibility.reviewRuleCount ?? "unknown"}.`));
  else lines.push({ text: "Accessibility evidence unavailable; conformance remains unknown." });
  const accessibilityEvidence = report.accessibilityEvidence;
  if (accessibilityEvidence) {
    lines.push(...wrappedLines(`Assessed page: ${accessibilityEvidence.documentUrl}`, { size: 9 }),
      ...wrappedLines(`Captured: ${accessibilityEvidence.startedAt} to ${accessibilityEvidence.completedAt}; document ${accessibilityEvidence.documentToken ?? "Not retained"}; evaluated rules: ${join(accessibilityEvidence.rulesEvaluated)}.`, { size: 8 }),
      ...wrappedLines(`Limitations: ${join(accessibilityEvidence.limitations, "None recorded for this bounded audit")}`, { size: 9 }));
    for (const [label, rules] of [["Automated rule evidence", accessibilityEvidence.violations], ["Manual review evidence", accessibilityEvidence.reviewItems]] as const) {
      for (const rule of rules) {
        lines.push(sectionHeading(`${label}: ${rule.ruleId}`), ...wrappedLines(`${rule.help}. ${rule.description}`),
          ...wrappedLines(`Tags: ${join(rule.tags)}; impact ${rule.impact}; ${rule.nodeCount} affected nodes.`, { size: 9 }),
          ...wrappedLines(`Guidance: ${rule.helpUrl}`, { size: 8, href: rule.helpUrl }));
        for (const [index, node] of rule.representativeNodes.entries()) {
          const contrast = node.colorContrast;
          lines.push(...pdfEvidenceTable(`accessibility-${rule.ruleId}-${index}`, ["Affected element", "Retained technical evidence"], [
            ["Selector", join(node.selectors)], ["Failure / required review", node.failureSummary], ["Sanitized element", node.htmlSnippet],
            ...(node.captureState ? [["Capture state", `${node.captureState}; main-document bound: ${node.mainDocumentBound ?? "Not retained"}`]] : []),
            ...(contrast ? [["Color contrast", `Foreground ${contrast.foregroundColor ?? "Not retained"}; background ${contrast.backgroundColor ?? "Not retained"}; measured ${contrast.contrastRatio === undefined ? "Not retained" : `${contrast.contrastRatio}:1`}; required ${contrast.requiredContrastRatio === undefined ? "Not retained" : `${contrast.requiredContrastRatio}:1`}; font ${contrast.fontSize ?? "Not retained"} ${contrast.fontWeight ?? ""}`]] : []),
          ], [130, 382]));
        }
      }
    }
    if (accessibility?.exampleCoverage) lines.push(...wrappedLines(`${accessibility.exampleCoverage.retainedNodeCount} examples retained; ${accessibility.exampleCoverage.omittedNodeCount} omitted. Example limits do not imply complete coverage.`, { size: 9 }));
  }
  const workpaper = `https://certscore.ai/api/scans/${encodeURIComponent(report.scan.id)}/report-export?format=json&reviewFocus=${report.reviewFocus}${report.fullSite ? "&scope=full-site" : ""}`;
  const evidenceSections = appendixEvidenceLines(report, { text: (value, size = 9) => wrappedLines(String(value), { size }), heading: sectionHeading });
  const actions = pdfAppendixActions(report);
  const stage = (text: string): PdfLine => ({ ...sectionHeading(text), size: 12, kind: "appendixStage" });
  const appendixLines: PdfLine[] = PDF_REPORT_TOPICS.flatMap((topic, index) => {
    const letter = String.fromCharCode(65 + index);
    const topicActions = actions[topic.id];
    const actionLines: PdfLine[] = topicActions.flatMap((action, actionIndex) => {
      const display = action.finding ? findingDisplay(action.finding) : null;
      const item: PdfLine[] = [
        { text: `${letter}${actionIndex + 1}. ${ascii(display?.name ?? action.title)} [${titleCase(action.status)}]`, kind: "actionHeading", size: 11, bold: true, gapBefore: 12, gapAfter: 6, keepWithNextHeight: 32 },
        ...wrappedLines(display?.description ?? action.explanation, { size: 9, gapAfter: 4 }),
        ...(action.finding && record(action.finding.presentation)?.whyThisMatters ? wrappedLines(`Why it matters: ${record(action.finding.presentation)?.whyThisMatters}`, { size: 9, gapAfter: 4 }) : []),
        ...wrappedLines("Where to investigate", { size: 9, bold: true, keepWithNextParagraph: true }),
        ...(action.affected.length ? action.affected : [`${report.scan.domainHostname ?? report.scan.id}; see the cited item in Detailed evidence.`]).flatMap(value => wrappedLines(value, { size: 9, gapAfter: 3 })),
        ...wrappedLines("What to change / review", { size: 9, bold: true, keepWithNextParagraph: true }),
        ...(action.steps.length ? action.steps : ["Review the cited evidence with the implementation owner and establish the required change before editing the site."]).flatMap((step, stepIndex) => wrappedLines(`${stepIndex + 1}. ${step}`, { size: 9, gapAfter: 3 })),
        ...(action.guidanceUrl ? wrappedLines(`Implementation reference: ${action.guidanceUrl}`, { size: 8, href: action.guidanceUrl, gapAfter: 4 }) : []),
        ...(action.additionalGuidanceUrl ? wrappedLines(`W3C implementation guidance: ${action.additionalGuidanceUrl}`, { size: 8, href: action.additionalGuidanceUrl, gapAfter: 4 }) : []),
        ...wrappedLines("How to verify", { size: 9, bold: true, keepWithNextParagraph: true }),
        ...wrappedLines(topicActions.length > 2 ? action.verification ?? "Repeat the cited check for this item using the topic verification checklist below; compare the new result with the evidence reference." : PDF_TOPIC_VERIFICATION[topic.id], { size: 9, gapAfter: 4, keepWithNextHeight: 18 }),
        ...wrappedLines(`Evidence / workpaper references: ${action.references.join(", ") || action.id}`, { size: 8, gapAfter: 5, internalDestination: `${topic.id}-evidence` }),
        ...(display?.confidence ? wrappedLines(`Retained confidence: ${display.confidence}`, { size: 8 }) : []),
      ];
      return item.map(line => ({ ...line, flowGroup: `${topic.id}-action-${actionIndex}` }));
    });
    const chapter: PdfLine[] = [
      { ...sectionHeading(`Appendix ${letter}: ${topic.title}`, true), destination: topic.id, chapterTitle: `Appendix ${letter}: ${topic.title}`, size: 18, gapBefore: 8, gapAfter: 9 },
      ...wrappedLines(`${report.scan.domainHostname ?? report.scan.id} | ${report.reviewFocusLabel} | Appendix ${letter}`, { size: 9, gapAfter: 5 }),
      { text: "Overview    /    Fixes    /    Evidence    /    Sources", kind: "chapterNavigation", reservedHeight: 26, navigationTopic: topic.id },
      { ...stage("01 Topic overview"), destination: `${topic.id}-overview` },
      ...evidenceSections[topic.id].filter(line => line.kind === "topicOverview"),
      { ...stage("02 Fixes and verification"), destination: `${topic.id}-fixes` },
      ...actionLines,
      ...(topicActions.length > 2 ? [{ ...sectionHeading("Topic verification checklist"), kind: "itemHeading" as const, size: 10 }, ...wrappedLines(PDF_TOPIC_VERIFICATION[topic.id], { size: 9, gapAfter: 6 })] : []),
      ...(topicActions.length ? [] : wrappedLines("No corrective action is listed for this topic in the retained report.", { size: 9, gapAfter: 5 })),
      { ...stage("03 Detailed evidence"), destination: `${topic.id}-evidence` },
      ...[...evidenceSections[topic.id].filter(line => line.kind !== "topicOverview"), ...sections[topic.id]]
        .map(line => line.kind === "section" ? { ...line, kind: "itemHeading" as const, size: 10, gapBefore: 12 } : line),
      ...(sections[topic.id].length ? [] : [{ text: "No retained assessment for this topic. Status remains unknown." }]),
      { ...stage("04 Sources and workpaper"), destination: `${topic.id}-sources`, keepWithNextHeight: 35 },
      ...(topic.id === "policy" ? reportContext.map(line => line.kind === "section" ? { ...line, kind: "itemHeading" as const, size: 10 } : line) : []),
      ...wrappedLines(`Scan ID: ${report.scan.id}`, { size: 8, gapAfter: 4, keepWithNextHeight: 20 }),
      ...wrappedLines("Open retained technical workpaper (JSON)", { size: 9, href: workpaper, gapAfter: 6 }),
    ];
    const sourceIndex = chapter.findIndex(line => line.destination === `${topic.id}-sources`);
    const evidenceIndex = chapter.findIndex(line => line.destination === `${topic.id}-evidence`);
    const lastEvidenceHeading = chapter.reduce((last, line, index) => index > evidenceIndex && index < sourceIndex && line.kind === "itemHeading" ? index : last, -1);
    let inEvidence = false;
    return chapter.map((line, index) => {
      if (line.destination === `${topic.id}-evidence`) inEvidence = true;
      return inEvidence ? { ...line, flowGroup: `${topic.id}-evidence-and-sources`,
        ...(lastEvidenceHeading > evidenceIndex && index >= lastEvidenceHeading ? { tailGroup: `${topic.id}-last-evidence-and-sources` } : {}) } : line;
    });
  });
  return appendixLines.flatMap((line, paragraphIndex) => {
    // Tables have a five-point bottom border offset. Give following prose a
    // real gutter rather than drawing its ascenders through that border.
    if (appendixLines[paragraphIndex - 1]?.cells && !line.cells && (line.gapBefore ?? 0) < 10) line = { ...line, gapBefore: 10 };
    if (line.kind === "chapterNavigation" || line.kind === "image" || line.kind === "fullImageSlice" || line.cells || line.chart || line.overview) return [line];
    const parts = wrapPdfText(ascii(line.text), 558 - lineX(line, false), line.size ?? 10, line.bold);
    return parts.map((text, index) => ({ ...line, text, paragraphId: `paragraph-${paragraphIndex}`,
      pageBreakBefore: index === 0 && line.pageBreakBefore,
      destination: index === 0 ? line.destination : undefined,
      chapterTitle: index === 0 ? line.chapterTitle : undefined,
      gapBefore: index === 0 ? (line.kind === "itemHeading" ? Math.max(12, line.gapBefore ?? 0) : line.gapBefore) : 0,
      gapAfter: index === parts.length - 1 ? line.gapAfter : 0,
      keepWithNextHeight: index === parts.length - 1 ? line.keepWithNextHeight : (line.size ?? 10) + 4,
    }));
  });
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = 790;
  let appendixTitle = "";
  let subsection = "";
  let tableHeader: PdfLine | undefined;
  const height = (line: PdfLine) => (line.gapBefore ?? 0) + (line.reservedHeight ?? ((line.size ?? 10) + 4 + (line.gapAfter ?? 0)));
  const newPage = (line: PdfLine) => {
    pages.push(page);
    page = [];
    y = 790;
    if (!line.chapterTitle && appendixTitle) {
      const caption: PdfLine = { text: `${appendixTitle} (continued)`, size: 9, bold: true, gapAfter: 10 };
      page.push(caption);
      y -= height(caption);
      if (subsection && line.kind !== "appendixStage") {
        const context: PdfLine = { text: subsection, size: 8, kind: "caption", gapAfter: 8 };
        page.push(context);
        y -= height(context);
      }
    }
    if (line.kind === "tableRow" && tableHeader && tableHeader.tableId === line.tableId) {
      page.push(tableHeader);
      y -= height(tableHeader);
    }
  };
  for (const [index, line] of lines.entries()) {
    if (line.pageBreakBefore && page.length > 0) newPage(line);
    // A small repair or evidence dossier should not leave a few orphan lines on
    // another page. Large dossiers retain normal, repeated-header pagination.
    if (line.flowGroup && lines[index - 1]?.flowGroup !== line.flowGroup) {
      let groupHeight = height(line);
      for (let next = index + 1; lines[next]?.flowGroup === line.flowGroup; next++) groupHeight += height(lines[next]!);
      const maximum = line.flowGroup.endsWith("-evidence-and-sources") ? 620 : 320;
      if (groupHeight <= maximum && y - groupHeight < 48 && page.length > 0) newPage(line);
    }
    if (line.tailGroup && lines[index - 1]?.tailGroup !== line.tailGroup) {
      let tailHeight = height(line);
      for (let next = index + 1; lines[next]?.tailGroup === line.tailGroup; next++) tailHeight += height(lines[next]!);
      if (tailHeight <= 500 && y - tailHeight < 48 && page.length > 0) newPage(line);
    }
    // Keep a compact evidence item, including its table, with its heading.
    // Longer inventories still paginate normally with repeated table headers.
    if (line.kind === "itemHeading" && lines[index - 1]?.paragraphId !== line.paragraphId) {
      let itemHeight = height(line);
      for (let next = index + 1; lines[next] && !lines[next]!.chapterTitle && lines[next]!.kind !== "appendixStage" && (lines[next]!.kind !== "itemHeading" || lines[next]!.paragraphId === line.paragraphId); next++) {
        itemHeight += height(lines[next]!);
      }
      if (itemHeight <= 260 && y - itemHeight < 48 && page.length > 0) newPage(line);
    }
    // Keep short paragraphs intact; long evidence still flows across pages.
    let paragraphHeight = height(line);
    if (line.paragraphId && lines[index - 1]?.paragraphId !== line.paragraphId) {
      for (let next = index + 1; lines[next]?.paragraphId === line.paragraphId; next++) paragraphHeight += height(lines[next]!);
    }
    let nextParagraphHeight = 0;
    if (line.keepWithNextParagraph && lines[index + 1]) {
      const nextId = lines[index + 1]!.paragraphId;
      for (let next = index + 1; lines[next] && (next === index + 1 || (nextId && lines[next]!.paragraphId === nextId)); next++) nextParagraphHeight += height(lines[next]!);
    }
    const needed = Math.max(height(line) + (line.keepWithNextHeight ?? 0), paragraphHeight <= 160 ? paragraphHeight : 0, height(line) + Math.min(160, nextParagraphHeight));
    if (y - needed < 48 && page.length > 0) newPage(line);
    if (line.chapterTitle) { appendixTitle = line.chapterTitle; subsection = ""; }
    if (line.kind === "appendixStage") subsection = line.text;
    if (line.kind === "tableHeader") tableHeader = line;
    else if (line.kind !== "tableRow") tableHeader = undefined;
    page.push(line);
    y -= height(line);
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[{ text: "CertScore.ai report" }]];
}

function textColor(line: PdfLine) {
  if (line.kind === "coverTitle" || line.kind === "coverDomain") return "1 1 1";
  if (line.kind === "coverMeta") return "0.733 0.894 0.976";
  if (line.kind === "caption") return "0.278 0.333 0.412";
  if (line.kind === "appendixStage") return "1 1 1";
  if (line.kind === "section") return "0.059 0.114 0.216";
  return "0.059 0.09 0.165";
}

function lineX(line: PdfLine, hasBrandLogo: boolean) {
  if (line.kind === "coverTitle" || line.kind === "coverDomain" || line.kind === "coverMeta") {
    return hasBrandLogo ? 126 : 50;
  }
  if (line.chapterTitle) return 50;
  if (line.kind === "section" || line.kind === "appendixStage") return 60;
  if (line.kind === "actionHeading") return 60;
  if (line.kind === "itemHeading") return 50;
  return 50 + (line.indent ?? 0);
}

function brandLogoCommand(image: PdfImage) {
  const frame = { x: 48, y: 733, width: 64, height: 64 };
  const scale = Math.min(frame.width / image.width, frame.height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = frame.x + (frame.width - drawWidth) / 2;
  const drawY = frame.y + (frame.height - drawHeight) / 2;
  return [
    "q",
    `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`,
    "/Logo Do",
    "Q",
  ].join("\n");
}

function imageCommand(image: PdfImage, y: number, reservedHeight: number) {
  const frameX = 50;
  const frameWidth = 512;
  const frameHeight = Math.max(80, reservedHeight - 10);
  const frameBottom = y - frameHeight;
  const innerX = frameX + 5;
  const innerBottom = frameBottom + 5;
  const innerWidth = frameWidth - 10;
  const innerHeight = frameHeight - 10;
  const imageRatio = image.width / image.height;
  const frameRatio = innerWidth / innerHeight;
  let drawWidth: number;
  let drawHeight: number;
  let drawX: number;
  let drawY: number;
  if (imageRatio < frameRatio * 0.55) {
    drawWidth = innerWidth;
    drawHeight = innerWidth / imageRatio;
    drawX = innerX;
    drawY = innerBottom + innerHeight - drawHeight;
  } else {
    const scale = Math.min(innerWidth / image.width, innerHeight / image.height);
    drawWidth = image.width * scale;
    drawHeight = image.height * scale;
    drawX = innerX + (innerWidth - drawWidth) / 2;
    drawY = innerBottom + (innerHeight - drawHeight) / 2;
  }
  return [
    "q",
    "0.929 0.953 0.976 rg",
    `${frameX} ${frameBottom} ${frameWidth} ${frameHeight} re f`,
    "0.733 0.827 0.914 RG 0.8 w",
    `${frameX} ${frameBottom} ${frameWidth} ${frameHeight} re S`,
    `${innerX} ${innerBottom} ${innerWidth} ${innerHeight} re W n`,
    `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm`,
    "/Im1 Do",
    "Q",
  ].join("\n");
}

function fullImageSliceCommand(image: PdfImage, y: number, reservedHeight: number, sliceIndex: number) {
  const frameX = 50;
  const frameWidth = 512;
  const frameHeight = Math.max(80, reservedHeight - 10);
  const frameBottom = y - frameHeight;
  const innerX = frameX + 5;
  const innerBottom = frameBottom + 5;
  const innerWidth = frameWidth - 10;
  const innerHeight = frameHeight - 10;
  const drawWidth = innerWidth;
  const drawHeight = image.height * (drawWidth / image.width);
  const sliceOffset = sliceIndex * FULL_CAPTURE_SLICE_HEIGHT;
  const drawY = innerBottom + innerHeight + sliceOffset - drawHeight;
  return [
    "q",
    "1 1 1 rg",
    `${frameX} ${frameBottom} ${frameWidth} ${frameHeight} re f`,
    "0.733 0.827 0.914 RG 0.8 w",
    `${frameX} ${frameBottom} ${frameWidth} ${frameHeight} re S`,
    `${innerX} ${innerBottom} ${innerWidth} ${innerHeight} re W n`,
    `${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${innerX.toFixed(2)} ${drawY.toFixed(2)} cm`,
    "/Im1 Do",
    "Q",
  ].join("\n");
}

function compactText(value: unknown, limit: number) {
  const text = ascii(value).replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 3).trimEnd()}...`;
}

/** Native vector arcs keep charts sharp in the downloaded PDF. */
function chartArc(cx: number, cy: number, radius: number, start: number, end: number) {
  const parts = [`${(cx + radius * Math.cos(start)).toFixed(3)} ${(cy + radius * Math.sin(start)).toFixed(3)} m`];
  const count = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
  for (let index = 0; index < count; index += 1) {
    const a = start + (end - start) * index / count;
    const b = start + (end - start) * (index + 1) / count;
    const k = 4 / 3 * Math.tan((b - a) / 4);
    parts.push([
      cx + radius * (Math.cos(a) - k * Math.sin(a)), cy + radius * (Math.sin(a) + k * Math.cos(a)),
      cx + radius * (Math.cos(b) + k * Math.sin(b)), cy + radius * (Math.sin(b) - k * Math.cos(b)),
      cx + radius * Math.cos(b), cy + radius * Math.sin(b),
    ].map(value => value.toFixed(3)).join(" ") + " c");
  }
  return parts.join("\n");
}

/** Fixed first page; charts summarize canonical scores and already-projected findings. */
function executivePage(report: CanonicalReportExport, hasLogo: boolean, headerTheme: ReportHeaderTheme, topicPages: Map<string, number>) {
  const palette = REPORT_HEADER_PALETTES[headerTheme];
  const commands: string[] = [];
  const links: Array<{ topic: string; rect: number[] }> = [];
  const accent = "0.04 0.47 0.64";
  const muted = "0.38 0.44 0.52";
  const text = (value: unknown, x: number, y: number, size = 10, bold = false, color = "0.12 0.18 0.27", width = 562 - x) => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfString(fitPdfText(ascii(value), width, size, bold))}) Tj ET`);
  };
  const center = (value: string, x: number, y: number, size: number, bold = false, color = "0.12 0.18 0.27") =>
    text(value, x - pdfTextWidth(value, size, bold) / 2, y, size, bold, color);
  const card = (x: number, y: number, width: number, height: number, background = "1 1 1") =>
    commands.push(`${background} rg ${x} ${y} ${width} ${height} re f\n0.86 0.90 0.93 RG 0.6 w ${x} ${y} ${width} ${height} re S`);
  const ring = (cx: number, cy: number, radius: number, width: number, start: number, end: number, color: string) => {
    if (Math.abs(end - start) < 0.00001) return;
    commands.push(`q ${color} RG ${width} w 0 J\n${chartArc(cx, cy, radius, start, end)}\nS Q`);
  };
  const titleX = hasLogo ? 126 : 50;
  text("Executive summary", titleX, 785, 23, true, palette.foreground);
  text(compactText(report.scan.domainHostname ?? "Website scan", 48), titleX, 762, 14, true, palette.foreground);
  text(`${report.fullSite ? "Website scan report | " : ""}${report.reviewFocusLabel} findings posture`, titleX, 741, 10, false, palette.muted);
  text(`Completed: ${formatReportDate(report.scan.completedAt)} | Region: ${report.scan.scanFrom ? formatScanFromLabel(report.scan.scanFrom) : "Unknown"}`, 50, 716, 8, false, palette.muted);

  const rawScore = report.score?.value;
  const score = typeof rawScore === "number" && Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 100 ? rawScore : null;
  const findings = report.projection.unifiedFindings as Array<Record<string, unknown>>;
  const topics = pdfSummaryTopics(report);
  const severityGroups = [
    { label: "High / critical", count: findings.filter(f => f.severity === "high" || f.severity === "critical").length, color: "0.76 0.24 0.22" },
    { label: "Medium", count: findings.filter(f => f.severity === "medium").length, color: "0.87 0.60 0.19" },
    { label: "Low / review", count: findings.filter(f => !["high", "critical", "medium"].includes(String(f.severity))).length, color: accent },
  ];

  const assessment = pdfSiteAssessment(report).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const assessmentHeight = Math.min(150, Math.max(124, 66 + wrapPdfText(ascii(assessment), 484, 10).length * 11.5));
  const assessmentBottom = 674 - assessmentHeight;
  const metricTop = assessmentBottom - 14;
  const metricHeight = metricTop - 370;
  const metricCenter = 370 + metricHeight / 2;
  card(50, assessmentBottom, 512, assessmentHeight);
  text("Site assessment", 64, 653, 12, true, accent);
  text(`${report.reviewFocusLabel} | ${titleCase(report.executiveSummary.posture)}`, 64, 636, 10, true);
  let narrativeSize = 10;
  let narrative = wrapPdfText(ascii(assessment), 484, narrativeSize);
  while ((narrative.length - 1) * (narrativeSize + 1.5) > 84 && narrativeSize > 7.5) {
    narrativeSize -= 0.25;
    narrative = wrapPdfText(ascii(assessment), 484, narrativeSize);
  }
  narrative.forEach((line, index) => text(line, 64, 620 - index * (narrativeSize + 1.5), narrativeSize, false, "0.25 0.31 0.39", 484));

  card(50, 370, 144, metricHeight);
  text("CertScore.ai score", 64, metricTop - 19, 10, true);
  ring(122, metricCenter, 34, 7, Math.PI / 2, Math.PI / 2 - 2 * Math.PI, "0.88 0.93 0.95");
  if (score !== null) ring(122, metricCenter, 34, 7, Math.PI / 2, Math.PI / 2 - 2 * Math.PI * score / 100, accent);
  const scoreText = score === null ? "N/A" : String(score);
  const scoreSize = score === null ? 26 : Math.min(35, 70 * 35 / pdfTextWidth(scoreText, 35, true));
  center(scoreText, 122, metricCenter - 6, scoreSize, true, accent);
  center(score === null ? "Unavailable" : "/ 100", 122, metricCenter - 21, 8, false, muted);
  center(report.score?.scope === "full_site" ? "Full-site score" : "Starting-page score", 122, 381, 7.5, false, muted);

  // One finding total, in the severity doughnut. No duplicate finding KPI.
  card(204, 370, 144, metricHeight);
  text("Findings by severity", 218, metricTop - 19, 10, true);
  text(report.fullSite ? "Starting-page findings" : "Retained findings", 218, metricTop - 32, 7, false, muted);
  ring(276, metricCenter + 5, 25, 9, Math.PI / 2, Math.PI / 2 - Math.PI * 2, "0.88 0.93 0.95");
  let angle = Math.PI / 2;
  for (const group of severityGroups) {
    const next = angle - (findings.length ? group.count / findings.length * 2 * Math.PI : 0);
    ring(276, metricCenter + 5, 25, 9, angle, next, group.color);
    angle = next;
  }
  center(String(findings.length), 276, metricCenter + 1, 20, true);
  center("findings", 276, metricCenter - 11, 6.5, false, muted);
  severityGroups.forEach((group, index) => {
    const y = 400 - index * 11;
    commands.push(`${group.color} rg 218 ${y} 5 5 re f`);
    text(group.label, 228, y, 7, false, muted, 92);
    text(group.count, 327, y, 7, true);
  });

  card(358, 370, 204, metricHeight);
  text("Priority findings and next actions", 370, metricTop - 19, 10, true, "0.12 0.18 0.27", 180);
  const topIds = new Set(report.projection.topFindingIds);
  const priority = findings.filter(finding => ["consent", "storage", "policy", "forms", "external"].includes(pdfTopicForFinding(finding) ?? ""))
    .sort((a, b) => {
      const rank = (f: Record<string, unknown>) => ({ critical: 4, high: 3, medium: 2, low: 1 }[String(f.severity)] ?? 0);
      return Number(topIds.has(String(b.unifiedFindingId))) - Number(topIds.has(String(a.unifiedFindingId))) || rank(b) - rank(a);
    }).slice(0, 3);
  if (!priority.length) {
    wrapPdfText("No GDPR/ePrivacy priority findings selected; review the detailed evidence.", 176, 9)
      .forEach((line, index) => text(line, 370, 466 - index * 12, 9, false, muted, 176));
  }
  priority.forEach((finding, index) => {
    const display = findingDisplay(finding);
    const y = metricTop - 36 - index * (metricHeight - 32) / 3;
    const topic = pdfTopicForFinding(finding) ?? "policy";
    const letter = String.fromCharCode(65 + PDF_REPORT_TOPICS.findIndex(item => item.id === topic));
    const title = wrapPdfText(ascii(`${index + 1}. ${display.name}`), 160, 8, true);
    const titleLines = (metricHeight - 32) / 3 >= 40 ? 2 : 1;
    title.slice(0, titleLines).forEach((line, lineIndex) => text(lineIndex === titleLines - 1 && title.length > titleLines ? `${line}...` : line, 370, y - lineIndex * 9, 8, true, "0.12 0.18 0.27", 160));
    text(letter, 542, y, 8, true, accent, 10);
    const action = wrapPdfText(ascii(display.fix ?? "Review the retained evidence and assign the implementation owner."), 180, 7.25);
    action.slice(0, 2).forEach((line, lineIndex) => text(lineIndex === 1 && action.length > 2 ? `${line}...` : line, 370, y - Math.min(titleLines, title.length) * 9 - 3 - lineIndex * 9, 7.25, false, muted, 180));
    links.push({ topic, rect: [358, y - 32, 562, y + 8] });
  });

  text("Topic evidence at a glance", 50, 350, 12, true);
  text("Select a topic for its appendix", 412, 350, 7.5, false, muted, 150);
  const observed = "0.09 0.55 0.45";
  const review = "0.82 0.48 0.12";
  const neutral = "0.72 0.77 0.82";
  const statusColor = (status: string) => status === "Observed" ? observed
    : ["Gap observed", "Potential gap", "Review signal", "Review recommended"].includes(status) ? review : neutral;
  const circle = (cx: number, cy: number, r: number, color: string) =>
    commands.push(`${color} rg ${chartArc(cx, cy, r, 0, Math.PI * 2)} h f`);
  const drawVisual = (visual: SummaryVisual, x: number, y: number) => {
    if (visual.kind === "choices" || visual.kind === "checks") {
      const choices = visual.kind === "choices" ? visual.choices : visual.checks;
      if (!choices) text("Unavailable", x + 8, y + 31, 8, false, muted, 105);
      else choices.forEach((choice, index) => {
        const left = x + 8 + index * 35;
        commands.push(`0.94 0.96 0.97 rg ${left} ${y + 25} 31 24 re f`);
        circle(left + 15.5, y + 42, 2.7, statusColor(choice.status));
        text(choice.label, left + 2, y + 29, 6.5, false, muted, 29);
      });
    } else if (visual.kind === "bars") {
      if (visual.unavailable) text("Unavailable", x + 8, y + 31, 8, false, muted, 105);
      else visual.bars.forEach((bar, index) => {
        const bottom = y + 41 - index * 15;
        text(bar.label, x + 8, bottom, 7, false, muted, 37);
        commands.push(`0.88 0.93 0.95 rg ${x + 47} ${bottom} 48 6 re f`);
        if (bar.value) commands.push(`${accent} rg ${x + 47} ${bottom} ${48 * bar.value / Math.max(1, ...visual.bars.map(item => item.value))} 6 re f`);
        text(bar.value, x + 100, bottom, 7, true, accent, 14);
      });
    } else if (visual.kind === "matrix") {
      commands.push(`0.65 0.74 0.80 RG 0.8 w ${x + 9} ${y + 24} 24 29 re S`);
      [[visual.observed, "Observed", observed], [visual.review, "To review", review], [visual.other, "Other", neutral]].forEach(([count, label, color], index) => {
        const baseline = y + 44 - index * 10;
        commands.push(`${color} RG 1.5 w ${x + 14} ${baseline + 1} m ${x + 28} ${baseline + 1} l S`);
        text(count, x + 43, baseline, 7, true, String(color), 17);
        text(label, x + 62, baseline, 6.5, false, muted, 51);
      });
    } else if (visual.kind === "flow") {
      [[visual.forms, "forms"], [visual.fields, "fields"]].forEach(([count, label], index) => {
        const left = x + 8 + index * 61;
        commands.push(`0.94 0.96 0.97 rg ${left} ${y + 24} 43 29 re f`);
        text(count, left + 6, y + 40, 12, true, accent, 31);
        text(label, left + 6, y + 29, 6.5, false, muted, 31);
      });
      commands.push(`${accent} RG 0.8 w ${x + 53} ${y + 38} m ${x + 65} ${y + 38} l S ${x + 62} ${y + 41} m ${x + 65} ${y + 38} l ${x + 62} ${y + 35} l S`);
    } else if (visual.kind === "network") {
      const cx = x + 58;
      if (!visual.unavailable) visual.domains.slice(0, 3).forEach((domain, index) => {
        const nx = x + [16, 101, 58][index]!;
        const ny = y + [46, 46, 27][index]!;
        commands.push(`${neutral} RG 0.7 w ${cx} ${y + 40} m ${nx} ${ny} l S`);
        circle(nx, ny, 4, accent);
      });
      circle(cx, y + 40, 8, "0.88 0.93 0.95");
      text("Site", cx - 6, y + 38, 6, true, accent, 18);
      if (visual.unavailable) text("Unavailable", x + 8, y + 25, 7, false, muted, 105);
    } else if (visual.kind === "certificate") {
      commands.push(`0.65 0.74 0.80 RG 0.8 w ${x + 9} ${y + 24} 22 29 re S ${x + 14} ${y + 46} m ${x + 26} ${y + 46} l S ${x + 14} ${y + 41} m ${x + 26} ${y + 41} l S`);
      circle(x + 20, y + 31, 3, statusColor(visual.status));
      wrapPdfText(visual.status, 72, 9).forEach((line, index) => text(line, x + 39, y + 40 - index * 10, 9, true, statusColor(visual.status), 72));
    } else if (visual.kind === "columns") {
      if (visual.unavailable) text("Unavailable", x + 8, y + 31, 8, false, muted, 105);
      else {
        text(visual.counts.length > 8 ? "Nodes by rule (largest 8)" : "Nodes by rule", x + 8, y + 55, 5.8, false, muted, 105);
        const values = [...visual.counts].sort((a, b) => b - a).slice(0, 8);
        const max = Math.max(1, ...values);
        commands.push(`${neutral} RG 0.5 w ${x + 8} ${y + 25} m ${x + 111} ${y + 25} l S`);
        values.forEach((count, index) => commands.push(`${accent} rg ${x + 11 + index * 13} ${y + 25} 9 ${25 * count / max} re f`));
      }
    }
    text(visual.caption, x + 8, y + 10, 6.8, false, muted, 105);
  };
  topics.forEach((topic, index) => {
    const x = 50 + index % 4 * 130.25;
    const y = index < 4 ? 251 : 157;
    card(x, y, 121.25, 84);
    wrapPdfText(ascii(topic.title), 97, 8).slice(0, 2).forEach((line, row) => text(line, x + 8, y + 70 - row * 9, 8, true, "0.12 0.18 0.27", 97));
    text(String.fromCharCode(65 + index), x + 109, y + 70, 7, true, accent, 8);
    text(`p.${topicPages.get(topic.id) ?? "-"}`, x + 99, y + 58, 6, false, muted, 20);
    drawVisual(topic.visual, x, y);
    links.push({ topic: topic.id, rect: [x, y, x + 121.25, y + 84] });
  });
  // Color is secondary to retained status labels/captions and the appendix evidence.
  circle(54, 142, 2.5, observed); text("Observed", 61, 139, 7, false, muted, 49);
  circle(117, 142, 2.5, review); text("To review", 124, 139, 7, false, muted, 50);
  circle(181, 142, 2.5, neutral); text("Other / unavailable", 188, 139, 7, false, muted, 100);
  const otherFindings = findings.filter(finding => !pdfTopicForFinding(finding)).length;
  if (otherFindings) {
    text(`Other retained report context: ${otherFindings} | App. C`, 358, 139, 7, false, muted, 204);
    links.push({ topic: "policy", rect: [358, 135, 562, 148] });
  }
  text(compactText(report.fullSite ? report.fullSite.scope : "Scope: retained starting-page evidence and bounded capture windows.", 108), 50, 114, 8, false, muted);
  text("Automated risk signals require verification. Detailed evidence and limitations follow.", 50, 100, 8, false, muted);

  return { commands, links };
}

function evidenceGraphicCommands(line: PdfLine, y: number) {
  const commands: string[] = [];
  const ink = "0.059 0.114 0.216";
  const muted = "0.278 0.333 0.412";
  const text = (value: string, x: number, baseline: number, size = 8, bold = false, color = ink) =>
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${baseline} Td (${pdfString(ascii(value))}) Tj ET`);
  if (line.cells) {
    const height = line.reservedHeight ?? 32;
    commands.push(`${line.kind === "tableHeader" ? "0.918 0.965 0.992" : "1 1 1"} rg 50 ${y - height + 5} 512 ${height} re f`);
    commands.push(`0.82 0.87 0.91 RG 0.5 w 50 ${y - height + 5} 512 ${height} re S`);
    let x = 50;
    line.cells.forEach((cell, index) => {
      cell.forEach((value, row) => text(value, x + 8, y - 8 - row * 11, 8, line.kind === "tableHeader"));
      x += line.columnWidths?.[index] ?? 512 / line.cells!.length;
      if (index < line.cells!.length - 1) commands.push(`0.82 0.87 0.91 RG ${x} ${y + 5} m ${x} ${y - height + 5} l S`);
    });
  } else if (line.chart) {
    text(line.chart.title, 50, y - 3, 10, true);
    const maximum = Math.max(1, ...line.chart.bars.map(bar => bar.value));
    line.chart.bars.forEach((bar, index) => {
      const baseline = y - 27 - index * 19;
      text(fitPdfText(bar.label, 223, 8), 50, baseline, 8);
      commands.push(`0.918 0.945 0.965 rg 282 ${baseline - 1} 232 9 re f`);
      if (bar.value > 0) commands.push(`0.055 0.647 0.914 rg 282 ${baseline - 1} ${232 * bar.value / maximum} 9 re f`);
      text(String(Math.round(bar.value * 100) / 100), 525, baseline, 8, true);
    });
  } else if (line.overview) {
    const overview = line.overview;
    overview.metrics.forEach((metric, index) => {
      const x = 50 + index * 174;
      commands.push(`0.95 0.97 0.98 rg ${x} ${y - 64} 164 66 re f`);
      text(fitPdfText(metric.label, 148, 8), x + 8, y - 13, 8, false, muted);
      text(fitPdfText(metric.value, 148, 20, true), x + 8, y - 43, 20, true);
    });
    // Statuses summarize retained checks; unclassified statuses stay separate.
    const other = Math.max(0, overview.checks - overview.observed - overview.review - overview.limited);
    const statuses = [
      { count: overview.observed, label: "Observed", color: "0.09 0.55 0.45" },
      { count: overview.review, label: "To review", color: "0.91 0.57 0.15" },
      { count: overview.limited, label: "Limited", color: "0.49 0.56 0.65" },
      { count: other, label: "Other retained states", color: "0.66 0.72 0.79" },
    ];
    let x = 50;
    for (const status of statuses) {
      const width = overview.checks ? 512 * status.count / overview.checks : 0;
      if (width) commands.push(`${status.color} rg ${x} ${y - 84} ${width} 8 re f`);
      x += width;
    }
    if (overview.checks) text(`${overview.checks} retained checks: ${statuses.filter(status => status.count).map(status => `${status.count} ${status.label.toLowerCase()}`).join(" / ")}`, 50, y - 102, 8, false, muted);
  }
  return commands;
}

export function renderCanonicalReportPdf(
  report: CanonicalReportExport,
  options: {
    brandLogo?: ReportPdfVisualEvidence | null;
    brandName?: string;
    headerTheme?: ReportHeaderTheme;
    visualEvidence?: ReportPdfVisualEvidence | null;
  } = {},
) {
  const headerTheme = normalizeReportHeaderTheme(options.headerTheme);
  const palette = REPORT_HEADER_PALETTES[headerTheme];
  const image = decodePdfImage(options.visualEvidence);
  const brandLogo = decodePdfImage(options.brandLogo, options.brandName ? [255, 255, 255] : palette.matte);
  const brandName = options.brandName ? ascii(options.brandName).slice(0, 64) : "CertScore.ai";
  const pages: PdfLine[][] = [[], ...paginate(reportLines(report, image))];
  const topicPages = new Map<string, number>();
  pages.forEach((lines, index) => lines.forEach(line => { if (line.chapterTitle && line.destination) topicPages.set(line.destination, index + 1); }));
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add("");
  const pagesId = add("");
  const regularFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const boldFontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const imageId = image
    ? add(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${image.colorSpace} /BitsPerComponent ${image.bitsPerComponent} /Filter ${image.filter} /Length ${image.body.byteLength}${image.colorSpace === "/DeviceCMYK" ? " /Decode [1 0 1 0 1 0 1 0]" : ""} >>\nstream\n${image.body.toString("latin1")}\nendstream`)
    : null;
  const brandLogoId = brandLogo
    ? add(`<< /Type /XObject /Subtype /Image /Width ${brandLogo.width} /Height ${brandLogo.height} /ColorSpace ${brandLogo.colorSpace} /BitsPerComponent ${brandLogo.bitsPerComponent} /Filter ${brandLogo.filter} /Length ${brandLogo.body.byteLength}${brandLogo.colorSpace === "/DeviceCMYK" ? " /Decode [1 0 1 0 1 0 1 0]" : ""} >>\nstream\n${brandLogo.body.toString("latin1")}\nendstream`)
    : null;
  const pageIds: number[] = [];
  const destinations = new Map<string, { pageIndex: number; y: number }>([["executive", { pageIndex: 0, y: 790 }]]);

  pages.forEach((pageLines, pageIndex) => {
    let y = 790;
    const commands: string[] = [
      pageIndex === 0 ? "0.973 0.98 0.988 rg 0 0 612 842 re f" : "1 1 1 rg 0 0 612 842 re f",
      pageIndex === 0
        ? `${palette.background} rg 0 690 612 152 re f\n0.055 0.647 0.914 rg 0 686 612 4 re f\nBT /F2 9 Tf ${palette.muted} rg ${options.brandName ? 50 : 485} 814 Td (${pdfString(fitPdfText(brandName, options.brandName ? 512 : 77, 9, true))}) Tj ET`
        : `${palette.background} rg 0 812 612 30 re f\n0.055 0.647 0.914 rg 0 809 612 3 re f\nBT /F2 8 Tf ${palette.foreground} rg 50 823 Td (${pdfString(fitPdfText(`${brandName}  -  ${report.reviewFocusLabel} evidence report`, 512, 8, true))}) Tj ET`,
    ];
    if (pageIndex === 0 && brandLogo) {
      if (options.brandName) commands.push("1 1 1 rg 48 733 64 64 re f");
      commands.push(brandLogoCommand(brandLogo));
    }
    const executive = pageIndex === 0 ? executivePage(report, Boolean(brandLogo), headerTheme, topicPages) : null;
    if (executive) commands.push(...executive.commands);
    const annotations: number[] = (executive?.links ?? []).map(link =>
      add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(" ")}] /Border [0 0 0] /Dest (${link.topic}) >>`));
    for (const line of pageLines) {
      y -= line.gapBefore ?? 0;
      if (line.destination) destinations.set(line.destination, { pageIndex, y });
      if (line.internalDestination) annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [50 ${y - 3} 562 ${y + 10}] /Border [0 0 0] /Dest (${line.internalDestination}) >>`));
      if (line.href && /^https?:\/\//i.test(line.href)) annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [50 ${y - 3} 562 ${y + 10}] /Border [0 0 0] /A << /S /URI /URI (${pdfString(ascii(line.href))}) >> >>`));
      if (line.kind === "chapterNavigation") {
        ["Overview", "Fixes", "Evidence", "Sources"].forEach((label, index) => {
          const x = 50 + index * 128;
          commands.push(`0.95 0.97 0.98 rg ${x} ${y - 12} 120 22 re f`);
          commands.push(`BT /F2 8 Tf 0.04 0.47 0.64 rg ${x + 8} ${y - 4} Td (${label}) Tj ET`);
          const suffix = ["overview", "fixes", "evidence", "sources"][index];
          annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [${x} ${y - 12} ${x + 120} ${y + 10}] /Border [0 0 0] /Dest (${line.navigationTopic}-${suffix}) >>`));
        });
        y -= line.reservedHeight ?? 26;
        continue;
      }
      if (line.kind === "image" && image) {
        commands.push(imageCommand(image, y, line.reservedHeight ?? 150));
        y -= line.reservedHeight ?? 150;
        continue;
      }
      if (line.kind === "fullImageSlice" && image) {
        commands.push(fullImageSliceCommand(image, y, line.reservedHeight ?? 650, line.imageSliceIndex ?? 0));
        y -= line.reservedHeight ?? 650;
        continue;
      }
      if (line.cells || line.chart || line.overview) {
        commands.push(...evidenceGraphicCommands(line, y));
        y -= line.reservedHeight ?? 0;
        continue;
      }
      const size = line.size ?? 10;
      if (line.chapterTitle) {
        commands.push(`0.055 0.647 0.914 RG 2 w 50 ${y - 9} m 562 ${y - 9} l S`);
      } else if (line.kind === "appendixStage") {
        commands.push(`0.059 0.114 0.216 rg 50 ${y - 6} 512 ${size + 13} re f`);
      } else if (line.kind === "actionHeading") {
        commands.push(`0.98 0.96 0.91 rg 50 ${y - 5} 512 ${size + 10} re f`);
        commands.push(`0.76 0.47 0.12 rg 50 ${y - 5} 3 ${size + 10} re f`);
      } else if (line.kind === "section" || line.kind === "itemHeading") {
        commands.push(`0.82 0.87 0.91 RG 0.5 w 50 ${y - 5} m 562 ${y - 5} l S`);
      } else if (line.kind === "summary") {
        commands.push(`0.941 0.976 0.996 rg 50 ${y - 4} 512 ${size + 8} re f`);
      }
      commands.push(`BT /${line.bold ? "F2" : "F1"} ${size} Tf ${textColor(line)} rg ${lineX(line, Boolean(brandLogo))} ${y} Td (${pdfString(line.text)}) Tj ET`);
      y -= size + 4 + (line.gapAfter ?? 0);
    }
    commands.push("0.796 0.835 0.882 RG 0.6 w 50 42 m 562 42 l S");
    commands.push(`BT /F1 8 Tf 0.392 0.455 0.545 rg 50 27 Td (${pdfString(fitPdfText(`${brandName}  |  ${report.scan.domainHostname ?? "Website report"}`, 370, 8))}) Tj ET`);
    if (pageIndex > 0) {
      commands.push("BT /F2 8 Tf 0.04 0.47 0.64 rg 440 27 Td (Summary) Tj ET");
      annotations.push(add("<< /Type /Annot /Subtype /Link /Rect [436 23 483 38] /Border [0 0 0] /Dest (executive) >>"));
    }
    commands.push(`BT /F2 8 Tf 0.278 0.333 0.412 rg 512 27 Td (Page ${pageIndex + 1} / ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const xObjects = [
      imageId ? `/Im1 ${imageId} 0 R` : null,
      brandLogoId ? `/Logo ${brandLogoId} 0 R` : null,
    ].filter(Boolean).join(" ");
    const xObject = xObjects ? ` /XObject << ${xObjects} >>` : "";
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>${xObject} >> /Contents ${contentId} 0 R /Annots [${annotations.map(id => `${id} 0 R`).join(" ")}] >>`);
    pageIds.push(pageId);
  });

  const destinationNames = [...destinations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, target]) => `(${name}) [${pageIds[target.pageIndex]} 0 R /XYZ null ${target.y + 20} null]`).join(" ");
  const outlineId = add("");
  const chapters = [{ id: "executive", title: "Executive summary" }, ...PDF_REPORT_TOPICS.map((topic, index) => ({ id: topic.id, title: `Appendix ${String.fromCharCode(65 + index)}: ${topic.title}` }))];
  const chapterIds = chapters.map(() => add(""));
  chapters.forEach((chapter, index) => {
    const id = chapterIds[index]!;
    const children = index === 0 ? [] : ["overview", "fixes", "evidence", "sources"].map(() => add(""));
    children.forEach((childId, childIndex) => {
      const suffix = ["overview", "fixes", "evidence", "sources"][childIndex];
      const title = ["Topic overview", "Fixes and verification", "Detailed evidence", "Sources and workpaper"][childIndex]!;
      objects[childId - 1] = `<< /Title (${title}) /Parent ${id} 0 R /Dest (${chapter.id}-${suffix})${childIndex ? ` /Prev ${children[childIndex - 1]} 0 R` : ""}${childIndex < children.length - 1 ? ` /Next ${children[childIndex + 1]} 0 R` : ""} >>`;
    });
    objects[id - 1] = `<< /Title (${pdfString(chapter.title)}) /Parent ${outlineId} 0 R /Dest (${chapter.id})${index ? ` /Prev ${chapterIds[index - 1]} 0 R` : ""}${index < chapterIds.length - 1 ? ` /Next ${chapterIds[index + 1]} 0 R` : ""}${children.length ? ` /First ${children[0]} 0 R /Last ${children.at(-1)} 0 R /Count -4` : ""} >>`;
  });
  objects[outlineId - 1] = `<< /Type /Outlines /First ${chapterIds[0]} 0 R /Last ${chapterIds.at(-1)} 0 R /Count ${chapters.length} >>`;
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlineId} 0 R /PageMode /UseOutlines /Names << /Dests << /Names [${destinationNames}] >> >> >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let output = "%PDF-1.4\n%CertScore\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}
