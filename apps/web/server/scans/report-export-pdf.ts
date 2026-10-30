import { reportExecutiveSummary } from "./report-executive-summary";
import { REPORT_EXPORT_DISCLAIMER } from "./report-export-footer";
import { reportRequestInventory } from "./report-request-inventory";
import { pdfNarrativeFindings, scopeCanonicalReportPdf } from "./report-pdf-evidence";
import { reportSectionInFocus } from "../../lib/scans/report-framework-scope";
import { reportStatusLabel } from "../../lib/scans/report-status-presentation";
import { assertPublicReportPdfContent, publicReportPdfBaseUrl } from "./report-pdf-public-safety";
import { pdfTestedUrl, pdfRegionLabel, pdfPublicWords, pdfConfidenceLabel, pdfReviewGroups, pdfOtherReviewGroups, pdfReportCounts, pdfInventoryRows, pdfRelatedCookieServices, reportFormInventory } from "./report-pdf-reader";
import { reportFormPhaseLabel } from "../../lib/scans/report-form-inventory";
import { reportFormScopeNote } from "./report-form-inventory";
import { pdfConsentVisualFocus, type PdfVisualFocus } from "./report-pdf-visual";
import { createHash } from "node:crypto";
import { pdfLocalDate, pdfTimeZone } from "./report-pdf-time";
import { pdfFrontmatter } from "./report-pdf-frontmatter";
import { getGdprEprivacyPostureTone } from "../../lib/scans/regulatory-coverage-score";
import { pdfAppendixActions, PDF_TOPIC_VERIFICATION } from "./report-pdf-actions";
import { pdfSummaryTopics, type SummaryVisual } from "./report-pdf-summary";
import { appendixEvidenceLines, pdfEvidenceTable } from "./report-pdf-appendices";
import { normalizeReportHeaderTheme, REPORT_HEADER_PALETTES, type ReportHeaderTheme } from "../../lib/report-header-theme";
import { fitPdfText, pdfTextWidth, wrapPdfText } from "./report-pdf-fonts";
import { gpcReaderSummary } from "../../lib/scans/gpc-reader-summary";
import {hasNoQualifiedGpcActivity} from "../../lib/scans/gpc-response-projection";
import { describeGpcObservedFacts } from "../../lib/scans/gpc-observed-facts";
import { describeGpcActivityComparison,californiaCoverageFamilyLabel } from "@certscore/contracts";
import { projectConsentControlReport, consentControlReportLabels } from "../../lib/scans/consent-control-report";
import type { CanonicalReportExport } from "./report-export";
import { deflateSync, inflateSync } from "node:zlib";
import { isGdprTransparencyReportRowId } from "../../lib/scans/gdpr-transparency-report-contract";
import { PDF_REPORT_TOPICS, pdfTopicForRow, type PdfReportTopic } from "./report-pdf-topics";

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

function formatConfidence(value: unknown) {
  return pdfConfidenceLabel(value);
}

export type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapAfter?: number;
  indent?: number;
  pageBreakBefore?: boolean;
  kind?: "body" | "caption" | "coverDomain" | "coverMeta" | "coverTitle" | "fullImageSlice" | "image" | "imageFocus" | "itemHeading" | "actionHeading" | "section" | "appendixStage" | "chapterNavigation" | "summary" | "tableHeader" | "tableRow" | "evidenceChart" | "topicOverview" | "timeline";
  visualFocus?: PdfVisualFocus;
  timeline?: Array<{ label: string; milliseconds: number }>;
  timelineRelative?: boolean;
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
  continuationTitle?: string;
  tailGroup?: string;
  navigationTopic?: PdfReportTopic;
  href?: string;
  internalDestination?: string;
  tableId?: string;
  cells?: string[][];
  sourceCells?: string[];
  tableRowContinuation?: boolean;
  columnWidths?: number[];
  chart?: { title: string; bars: Array<{ label: string; value: number }> };
  overview?: { metrics: Array<{ label: string; value: string }>; observed: number; review: number; limited: number; checks: number };
};

const FULL_CAPTURE_INNER_WIDTH = 502;
const FULL_CAPTURE_SLICE_HEIGHT = 630;

function wrappedLines(value: unknown, options: Omit<PdfLine, "text"> = {}): PdfLine[] {
  // Wrap once, using actual font metrics, after all layout choices are known.
  return [{ text: ascii(typeof value === "string" ? reportStatusLabel(value) : value), ...options }];
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

function reportLines(report: CanonicalReportExport, image: PdfImage | null, appUrl: string, visualFocus: PdfVisualFocus | null, wrapText = true): PdfLine[] {
  const review = report.gdprEprivacyReview;
  const runtimeAppendix = report.appendix.cookieAndTrackerInventory;
  const collectionAppendix = report.appendix.dataCollectionSurfaces;
  const formInventory = reportFormInventory(report);
  const transportRows = review?.rows.filter((row) => isTransportSecurityRowId(row.id)) ?? [];
  const mainChecklistRows = review?.rows.filter((row) =>
    !isGdprTransparencyReportRowId(row.id) && !isTransportSecurityRowId(row.id)
  ) ?? [];
  const sections: Record<PdfReportTopic, PdfLine[]> = { consent: [], storage: [], policy: [], forms: [], security: [], external: [], tls: [], accessibility: [] };
  const consentControls: PdfLine[] = [];
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
  if(reportSectionInFocus("privacy",report.reviewFocus)) {
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
    if (audit.truncated) lines.push(...wrappedLines("Privacy workpaper display limits apply."));
  }
  }
  lines = sections.consent;
  if(reportSectionInFocus("gpc",report.reviewFocus)) {
  lines.push(sectionHeading("Other signals - GPC response"));
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
    lines.push(...wrappedLines("Signal-delivery proof and comparison deltas are available in the JSON workpaper.", { size: 9 }));
  } else lines.push(...wrappedLines("No verified GPC assessment available; response remains unknown."));
  }

  lines = sections.external;
  if(report.fullSite) {
    const f=report.fullSite, {state,counts,totals,timing}=f.summary;
    lines.push(...[
      sectionHeading("Scan scope and resource inventory"),
      ...wrappedLines(`${f.scope}. Additional pages: Not assessed for consent, CMP, policy, GDPR transparency or transport.`),
      ...(report.reviewFocus === "gdpr_eprivacy" ? wrappedLines(`${f.scoreScope} (overall, GDPR/ePrivacy-weighted): ${f.score?.value ?? "Unavailable"}/100. ${f.score?.scope ?? "Scored evidence unavailable."}`) : []),
      ...wrappedLines(`${f.condition} ${f.countingScope}`),
      ...wrappedLines(`Max pages including homepage: ${state.requested.maxPages}; requested concurrency: ${state.requested.concurrency}; wait between starts: ${state.requested.waitSeconds}s; region: ${state.region}.`),
      ...wrappedLines(`Effective concurrency: ${state.effective.concurrency}; effective wait: ${state.effective.waitSeconds}s. Status: ${state.status}; stop reason: ${state.stopReason??"In progress"}.`),
      ...(state.robotsRestriction ? wrappedLines(state.robotsRestriction) : []),
      ...wrappedLines(`Coverage: ${counts.completed} completed; ${counts.partial} partial; ${counts.blockedFailed} blocked/failed; ${counts.pending} pending; ${counts.excluded} excluded/unvisited.`),
      ...wrappedLines(`Across observed pages: ${totals.services} distinct services; ${totals.cookies} distinct cookies; ${totals.requestEvents} request events; ${totals.embedInstances} embed instances. Additional services: ${totals.additionalServices??"Homepage comparison unavailable"}.`),
      ...wrappedLines(`Started: ${state.startedAt}; ended: ${state.completedAt??"In progress"} (UTC). Homepage audit: ${formatDuration(state.homepageDurationMs)}. Median observation: ${formatDuration(timing.medianPageMs)} (${timing.sampleCount} samples); slowest: ${formatDuration(timing.slowestPageMs)}.`),
      ...(publicReportPdfBaseUrl(appUrl) ? wrappedLines(`Evidence: ${new URL(f.inventoryHref, appUrl).href}`) : []),
      ...f.pages.flatMap(page=>wrappedLines(`${page.url}${page.finalUrl&&page.finalUrl!==page.url?` -> ${page.finalUrl}`:""} | ${page.status} | ${page.services??"Unavailable"} services; ${page.cookies??"Unavailable"} cookies; ${page.requestEvents??"Unavailable"} request events; ${page.embedInstances??"Unavailable"} embed instances. ${page.limitations.join(", ")} Evidence page ID: ${page.id}`)),
      sectionHeading("Full-site resource inventory"),
      ...wrappedLines(`${f.resources.length} distinct resources across observed pages. Page IDs map to the coverage list above. The JSON download contains every resource row.`),
      ...f.resources.slice(0, 500).flatMap(row => wrappedLines(`${row.occurrence.kind}: ${row.occurrence.label} | ${row.occurrence.vendor ?? "Unknown vendor"} | ${row.purposes.join(", ")} | ${row.pageIds.length} page(s): ${row.pageIds.join(", ")}`)),
      ...(f.resources.length > 500 ? wrappedLines("This report shows the first 500 resources. Open the full-site JSON workpaper for the complete inventory.") : []),
      sectionHeading("Homepage audit"),
    ]);
  }

  const initialRequests = reportRequestInventory(report);
  lines = sections.external;
  if (initialRequests) {
    lines.push(sectionHeading("Initial-page request inventory"),
      ...wrappedLines(`${initialRequests.metric!.value} request events; ${initialRequests.totalResources} distinct request resources before a choice. ${initialRequests.metric!.overview?.identifiedServices ?? "Unavailable"} identified ${initialRequests.metric!.overview?.identifiedServices === 1 ? "service" : "services"} in the initial-page resource inventory.`),
      ...pdfEvidenceTable("initial-request-inventory", ["Method / resource", "Vendor / classification", "Events / first seen"], initialRequests.rows.map(row => [
        `${row.method ?? "Not retained"} ${row.resource}`, `${row.vendor ?? "Unidentified"}; ${row.classification}`,
        `${row.eventCount} events; ${row.firstSeenMs === null ? "Timing unavailable" : `+${row.firstSeenMs} ms`}`,
      ]), [270, 142, 100]));
    if (initialRequests.omittedResources) lines.push(...wrappedLines(`${initialRequests.omittedResources} additional resource rows are available in the online inventory.`, { size: 9 }));
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
      ...wrappedLines("Remediation: see Top issues and remediation.", { href: "#findings", size: 9 }),
      ...wrappedLines("Bounded source-page main-document capture only. Destination pages were not opened."),
      ...wrappedLines(`Evidence: ${evidence.evidenceRef}; source SHA-256: ${evidence.sourceHash}; observation SHA-256: ${evidence.observationHash}.`),
    );
  }

  lines = reportContext;
  lines.push(sectionHeading("Review scope"));
  if (review && report.reviewFocus === "gdpr_eprivacy") {
    lines.push(
      ...wrappedLines(review.reviewSummary.coverageText),
      ...wrappedLines(review.reviewSummary.priorityReviewText, { gapAfter: 3 }),
      {
        text: `Summary counts: ${review.summaryCounts.gap_observed} observed gaps; ${review.summaryCounts.potential_concern} potential concerns; ${review.summaryCounts.review_signal} review signals; ${review.summaryCounts.technical_limitation} technical limitations.`,
      },
    );
  } else if (report.reviewFocus === "gdpr_eprivacy") {
    lines.push({ text: "A persisted GDPR/ePrivacy checklist presentation was not available for this scan." });
  }

  lines = sections.consent;
  lines = consentControls;
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
    mainChecklistRows.filter(row => !pdfReviewGroups(report).some(group => group.observations.some(observation => observation.id === row.id))).forEach((row, index) => {
      if (pdfTopicForRow(row.id) === "policy") return;
      const controlIds = ["consent_surface_observed", "cmp_framework_signal_observed", "reject_all_path_availability", "accept_consent_control", "options_settings_preferences_control"];
      lines = controlIds.includes(row.id) ? consentControls : sections[pdfTopicForRow(row.id) ?? "policy"];
      lines.push({ text: `${row.label}: ${row.status}`, bold: true, gapAfter: 1, keepWithNextHeight: 18 });
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
  if (!initialRequests || pdfInventoryRows(report).external.length) sections.external.push(sectionHeading(initialRequests ? "Service observations" : "Service and domain inventory"), ...wrappedLines(runtimeAppendix.scopeNote, { size: 9 }),
    ...wrappedLines(`${pdfInventoryRows(report).external.length} service rows shown from ${runtimeAppendix.summary.trackerRows} source rows. ${runtimeAppendix.summary.omittedRows} inventory rows omitted by the export limit.`));
  const inventoryCounts = { storage: 0, external: 0 };
  const displayedServices = new Set<string>();
  for (const row of runtimeAppendix.rows) {
    const topic = row.type === "cookie" || row.type === "storage" ? "storage" : "external";
    const serviceIdentity = JSON.stringify([row.vendor, row.purpose, row.domains, row.cookieNames, row.requestDetails]);
    if (topic === "external" && displayedServices.has(serviceIdentity)) continue;
    if (topic === "external") displayedServices.add(serviceIdentity);
    const number = ++inventoryCounts[topic];
    const name = row.cookieNames.length ? row.cookieNames.join(", ") : row.storageDetails?.key ?? row.vendor;
    lines = sections[topic];
    lines.push({ text: `${number}. ${name}`, size: 10, bold: true, kind: "itemHeading", gapBefore: 8, gapAfter: 5 });
    lines.push(...wrappedLines(`Vendor: ${row.vendor}. Purpose: ${join(row.purpose)}. Classification: ${row.evidenceClassification}. First observed: ${formatTiming(row.firstSeenMs)}. Before choice: ${yesNo(row.preConsent)}.`, { size: 9 }));
    if (topic === "storage") {
      const related = pdfRelatedCookieServices(report, row.cookieNames);
      if (row.vendor === "Unknown" && related.length) lines.push(...wrappedLines(`Related service inventory: ${related.join("; ")}. Matched cookie name only; this cookie's purpose and setter remain unconfirmed.`, { size: 8 }));
      lines.push(...wrappedLines(`Domain / origin: ${join(row.domains)}. Setter attribution: ${row.setByThirdPartyScript === true ? "Third-party script observed" : "Not determined"}.`, { size: 8 }));
      for (const cookie of row.cookieDetails) {
        lines.push(...wrappedLines(`Cookie: ${cookie.cookieName}; path ${cookie.path ?? "unavailable"}; observed expiry ${cookie.expiresAt ?? "unavailable"}; remaining lifetime ${cookie.lifespanSeconds ?? "unavailable"} seconds.`, { size: 8 }));
        if (cookie.description) lines.push(...wrappedLines(cookie.description, { size: 8 }));
        if (cookie.setterScriptUrl || cookie.sourceRequestUrl) lines.push(...wrappedLines(`Initiator: ${cookie.setterScriptUrl ?? cookie.sourceRequestUrl}`, { size: 8 }));
      }
    } else {
      lines.push(...wrappedLines(`Observed domains: ${join(row.domains)}. Vendor attribution: ${titleCase(row.confidence)} confidence.`, { size: 8 }));
      if (row.requestDetails.length) lines.push(...pdfEvidenceTable(`service-requests-${number}`, ["Request", "Observed response / purpose"], row.requestDetails.map(request => [
        `${request.method ?? ""} ${request.hostname ?? ""}${request.path ?? ""}`,
        `${yesNo(request.responseObserved)}; ${titleCase(request.essentiality)}`,
      ]), [340, 172]));
    }
  }

  lines = sections.forms;
  lines.push(sectionHeading("Data collection surfaces"));
  lines.push(...wrappedLines(reportFormScopeNote(report), { size: 9, gapAfter: 4 }));
  lines.push(...wrappedLines(
    `Inventory summary: ${formInventory.totalForms} retained forms; ${formInventory.totalFields} retained fields. ${report.fullSite ? "Page inventories" : "Initial page"}: ${formInventory.initialForms ?? "unavailable"}; after Accept: ${formInventory.afterAcceptForms ?? "unavailable in this export"}.`,
    { bold: true, gapAfter: 3 },
  ));
  lines.push(...wrappedLines(`Initial-page assessment: ${collectionAppendix.presentationMessage}`, { gapAfter: 3 }));
  if (formInventory.afterAcceptForms !== null) lines.push(...wrappedLines(`After Accept: ${formInventory.afterAcceptForms} retained form observations. ${collectionAppendix.reportInventory?.afterAcceptLimited ? "After-Accept capture was limited; additional forms may not have been captured. " : ""}Capture phase is shown for each form; no form was submitted and field values were not retained.`, { size: 9, gapAfter: 4 }));
  if (collectionAppendix.pageUrl) {
    lines.push(...wrappedLines(`Assessed page: ${collectionAppendix.pageUrl}`, { size: 9, gapAfter: 2 }));
  }
  if (collectionAppendix.coverage) {
    lines.push(...wrappedLines(
      `Initial-page coverage: ${titleCase(collectionAppendix.coverage.status)}; document scope ${titleCase(collectionAppendix.coverage.documentScope)}; interaction mode ${titleCase(collectionAppendix.coverage.interactionMode)}; inspected ${collectionAppendix.coverage.inspectedFormCandidateCount} form candidates and ${collectionAppendix.coverage.inspectedFieldCandidateCount} field candidates.`,
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
  if (formInventory.rows.length === 0) {
    lines.push({
      text: collectionAppendix.assessmentStatus === "not_observed"
        ? "No forms found in the initial-page inventory."
        : "No form rows were retained; the assessment message above governs interpretation.",
    });
  }
  formInventory.rows.forEach((row, formIndex) => {
    const form = row.form;
    lines.push({
      text: `${formIndex + 1}. ${form.title ?? titleCase(form.surfaceType)} - ${reportFormPhaseLabel(row, Boolean(report.fullSite))}`,
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
    if (row.captureLimited) lines.push(...wrappedLines("Bounded form capture; missing forms and fields remain unknown.", { size: 9 }));
    lines.push(...wrappedLines(
      `Action: ${titleCase(form.actionRelationship)}${form.actionHostname ? ` (${form.actionHostname})` : ""} | Fields retained: ${form.retainedFieldCount} of ${form.candidateFieldCount} | Truncated: ${yesNo(form.fieldsTruncated)} | Confidence: ${formatConfidence(form.confidence)} | Basis: ${titleCase(form.directVsInferred)}`,
      { indent: 10, size: 9, gapAfter: 2 },
    ));
    form.fields.forEach((field, fieldIndex) => {
      const state = field.disabled ? "disabled" : field.readOnly ? "read-only" : "available";
      lines.push(...wrappedLines(
        `Field ${fieldIndex + 1}: ${field.label ?? "Label not retained"}; element ${titleCase(field.elementType)}; input type ${titleCase(field.inputType)}; category ${titleCase(field.semanticCategory)}; required ${yesNo(field.required)}; state ${state}; autocomplete ${field.autocompleteToken ?? "not retained"}; confidence ${formatConfidence(field.confidence)}; basis ${titleCase(field.directVsInferred)}.`,
        { indent: 18, size: 8, gapAfter: 1 },
      ));
    });
    lines.push({ text: "", gapAfter: 3 });
  });

  for (const id of ["security", "tls"] as const) {
    sections[id].push(...wrappedLines("Bounded starting-page transport evidence only. Missing evidence remains unknown; these checks do not establish complete server security.", { size: 9 }));
    if (!transportRows.some(row => pdfTopicForRow(row.id) === id)) sections[id].push({ text: "No persisted transport checklist rows were retained for this topic." });
  }
  transportRows.forEach((row, index) => {
    lines = sections[pdfTopicForRow(row.id) ?? "security"];
    lines.push({
      text: `${row.label}: ${row.status}`,
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
    const captureStart = lines.length;
    lines.push(sectionHeading("Captured page evidence"));
    lines.push({ text: "Captured page evidence - full capture", kind: "image", reservedHeight: Math.min(visualFocus ? 160 : 260, image.height * 512 / image.width + 20), gapAfter: 8 });
    if (visualFocus) lines.push(...wrappedLines("First-layer controls - detail from the same capture. Boxes mark observed Accept and Reject controls, not successful consent enforcement.", { size: 8 }),
      { text: "Verified first-layer control detail", kind: "imageFocus", visualFocus, reservedHeight: 155, gapAfter: 8 });
    if (report.postRefusalObservation) lines.push(...wrappedLines("No post-Reject screenshot is included. The post-Reject conclusion uses the measured request/write evidence, not this pre-choice image.", { size: 8 }));
    for (let index = captureStart; index < lines.length; index++) lines[index] = { ...lines[index]!, flowGroup: "consent-visual" };
  }

  lines = sections.accessibility;
  lines.push(...wrappedLines("Automated starting-page accessibility evidence supporting ADA/WCAG review. This is not an ADA compliance determination or a complete WCAG conformance audit. Inconclusive checks are listed separately.", { size: 9 }));
  const accessibility = report.accessibilityAudit;
  if (accessibility) lines.push(...wrappedLines(
    `Automated audit: ${accessibility.status}; engine ${accessibility.engine} ${accessibility.engineVersion ?? "version unavailable"}; failed rules ${accessibility.failedRuleCount ?? "unknown"}; affected nodes ${accessibility.affectedNodeCount ?? "unknown"}; rules needing review ${accessibility.reviewRuleCount ?? "unknown"}.`));
  else lines.push({ text: "Accessibility evidence unavailable; conformance remains unknown." });
  const accessibilityEvidence = report.accessibilityEvidence;
  if (accessibilityEvidence) {
    lines.push(...wrappedLines(`Assessed page: ${accessibilityEvidence.documentUrl}`, { size: 9 }),
      ...wrappedLines(`Captured: ${accessibilityEvidence.startedAt} to ${accessibilityEvidence.completedAt}; ${accessibilityEvidence.rulesEvaluated.length} rules evaluated.`, { size: 8 }),
      ...wrappedLines(`Limitations: ${join(accessibilityEvidence.limitations, "None recorded for this bounded audit")}`, { size: 9 }));
    for (const [label, rules] of [["Automated rule evidence", accessibilityEvidence.violations], ["Manual check evidence", accessibilityEvidence.reviewItems]] as const) {
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
  const publicBaseUrl = publicReportPdfBaseUrl(appUrl);
  const workpaper = publicBaseUrl ? new URL(`/api/scans/${encodeURIComponent(report.scan.id)}/report-export?format=json&reviewFocus=${report.reviewFocus}${report.fullSite ? "&scope=full-site" : ""}`, publicBaseUrl).href : undefined;
  const evidenceSections = appendixEvidenceLines(report, { text: (value, size = 9) => wrappedLines(String(value), { size }), heading: sectionHeading });
  const choiceIndex = evidenceSections.consent.findIndex(line => line.flowGroup === "consent-choice-results");
  evidenceSections.consent.splice(choiceIndex < 0 ? evidenceSections.consent.length : choiceIndex, 0, ...consentControls);
  sections.security.push(...sections.tls);
  evidenceSections.security.push(...evidenceSections.tls.filter(line => line.kind !== "topicOverview"));
  const actions = pdfAppendixActions(report);
  const appendixLines: PdfLine[] = PDF_REPORT_TOPICS.flatMap((topic, index) => {
    const letter = String.fromCharCode(65 + index);
    const topicActions = actions[topic.id];
    const actionLines = wrappedLines(topicActions.length ? "Remediation and re-test steps: see Top issues and remediation." : "No corrective action is listed for this topic in the report.",
      { size: 9, internalDestination: topicActions.length ? "findings" : undefined, destination: `${topic.id}-fixes`, gapAfter: 6 });
    const topicEvidence = [...evidenceSections[topic.id].filter(line => line.kind !== "topicOverview"), ...(topic.id === "policy" ? [] : sections[topic.id])];

    const chapter: PdfLine[] = [
      { ...sectionHeading(`Appendix ${letter}: ${topic.title}`, true), destination: topic.id, chapterTitle: `Appendix ${letter}: ${topic.title}`, size: 18, gapBefore: 8, gapAfter: 9, keepWithNextHeight: 190 },
      ...wrappedLines(`${report.scan.domainHostname ?? report.scan.id} | ${report.reviewFocusLabel} | Appendix ${letter}`, { size: 9, gapAfter: 5 }),
      ...evidenceSections[topic.id].filter(line => line.kind === "topicOverview").map(line => ({ ...line, destination: `${topic.id}-overview` })),
      ...actionLines,
      ...(topicActions.length > 2 ? [{ ...sectionHeading("Topic verification checklist"), kind: "itemHeading" as const, size: 10 }, ...wrappedLines(PDF_TOPIC_VERIFICATION[topic.id], { size: 9, gapAfter: 6 })] : []),
      { ...sectionHeading("Detailed evidence"), kind: "appendixStage", size: 11, destination: `${topic.id}-evidence`, gapBefore: 8, gapAfter: 8 },
      ...topicEvidence.map(line => line.kind === "section" ? { ...line, kind: "itemHeading" as const, size: 10, gapBefore: 12 } : line),
      ...(topicEvidence.length ? [] : [{ text: "No retained assessment for this topic. Status remains unknown." }]),
      ...(topic.id === "policy" && report.reviewFocus === "ccpa_cpra" ? reportContext.map(line => line.kind === "section" ? { ...line, kind: "itemHeading" as const, size: 10 } : line) : []),
    ];
    const evidenceIndex = chapter.findIndex(line => line.destination === `${topic.id}-evidence`);
    const firstEvidence = chapter[evidenceIndex + 1];
    if (firstEvidence) chapter[evidenceIndex]!.keepWithNextHeight = Math.max(110, firstEvidence.reservedHeight ?? 0);
    const lastEvidenceHeading = chapter.reduce((last, line, index) => index > evidenceIndex && line.kind === "itemHeading" ? index : last, -1);
    let inEvidence = false;
    return chapter.map((line, index) => {
      if (line.destination === `${topic.id}-evidence`) inEvidence = true;
      return inEvidence ? { ...line, flowGroup: line.flowGroup ?? `${topic.id}-evidence-and-sources`,
        ...(lastEvidenceHeading > evidenceIndex && index >= lastEvidenceHeading ? { tailGroup: `${topic.id}-last-evidence-and-sources` } : {}) } : line;
    });
  });
  const frontmatter = pdfFrontmatter(report, appUrl, { text: wrappedLines, heading: text => sectionHeading(text) });
  const methodology: PdfLine[] = [
    { text: "Methodology and limitations", chapterTitle: "Methodology and limitations", destination: "methodology", size: 18, bold: true, gapBefore: 20, gapAfter: 16, keepWithNextHeight: 100 },
    ...wrappedLines(report.notice, { size: 9 }), ...wrappedLines(report.reviewScope, { size: 9 }),
    ...report.limitations.map(limitation => limitation.detail).filter((detail): detail is string => Boolean(detail)).flatMap(detail => wrappedLines(detail, { size: 9 })),
    ...wrappedLines("Hashes, classifier versions, original evidence references, and full technical packets are available in the JSON workpaper. Source excerpts are quoted only when their policy-document provenance is available.", { size: 9 }),
    { ...sectionHeading("Sources and workpaper"), destination: "workpaper", keepWithNextHeight: 45 },
    ...wrappedLines(`Scan ID: ${report.scan.id}`, { size: 8 }),
    ...wrappedLines(workpaper ? "Open technical workpaper (JSON)" : "Download the technical workpaper (JSON) alongside this PDF from the scan report.", { size: 9, href: workpaper, gapAfter: 6 }),
  ];
  const allLines = [...frontmatter, ...appendixLines, ...methodology].map(line => ({ ...line, text: pdfPublicWords(line.text), cells: line.cells?.map(cell => cell.map(pdfPublicWords)), sourceCells: line.sourceCells?.map(pdfPublicWords) }));
  assertPublicReportPdfContent(allLines.flatMap(line => [line.text, line.href ?? "", ...(line.cells?.flat() ?? []), ...(line.sourceCells ?? [])]));
  if (!wrapText) return allLines;
  return allLines.flatMap((line, paragraphIndex) => {
    // Tables have a five-point bottom border offset. Give following prose a
    // real gutter rather than drawing its ascenders through that border.
    if (allLines[paragraphIndex - 1]?.cells && !line.cells && (line.gapBefore ?? 0) < 10) line = { ...line, gapBefore: 10 };
    if (line.kind === "chapterNavigation" || line.kind === "image" || line.kind === "imageFocus" || line.kind === "fullImageSlice" || line.cells || line.chart || line.overview) return [line];
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

/** Shared, scoped report paragraphs and evidence tables before PDF pagination.
 * Word consumes these same projected findings, statuses and remediation. */
export function canonicalReportDocumentContent(report: CanonicalReportExport, appUrl = "https://certscore.ai") {
  const scoped = scopeCanonicalReportPdf(report);
  return { report: scoped, lines: reportLines(scoped, null, appUrl, null, false) };
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = 790;
  let appendixTitle = "";
  let subsection = "";
  let actionTitle = "";
  let continuationTitle = "";
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
    if (actionTitle && line.flowGroup?.includes("-action-") && line.kind !== "actionHeading" && line.kind !== "appendixStage" && subsection === "02 Fixes and verification") {
      for (const text of wrapPdfText(`${actionTitle} (continued)`, 512, 8, true)) {
        const context: PdfLine = { text, size: 8, bold: true, kind: "caption", gapAfter: 4 };
        page.push(context); y -= height(context);
      }
    }
    if (continuationTitle && !line.continuationTitle && !line.chapterTitle) {
      for (const text of wrapPdfText(`${continuationTitle} - remediation continued`, 512, 8, true)) {
        const context: PdfLine = { text, size: 8, bold: true, kind: "caption", gapAfter: 5 };
        page.push(context); y -= height(context);
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
      const maximum = line.flowGroup === "consent-choice-results" ? 680 : line.flowGroup === "consent-visual" ? 520 : 320;
      if (groupHeight <= maximum && y - groupHeight < 48 && page.length > 0) newPage(line);
    }
    if (line.tailGroup && lines[index - 1]?.tailGroup !== line.tailGroup) {
      let tailHeight = height(line);
      for (let next = index + 1; lines[next]?.tailGroup === line.tailGroup; next++) tailHeight += height(lines[next]!);
      if (tailHeight <= 180 && y - tailHeight < 48 && page.length > 0) newPage(line);
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
    if (line.chapterTitle) { appendixTitle = line.chapterTitle; subsection = ""; actionTitle = ""; continuationTitle = ""; }
    if (line.continuationTitle) continuationTitle = line.continuationTitle;
    if (line.kind === "appendixStage") { subsection = line.text; actionTitle = ""; }
    if (line.kind === "actionHeading") actionTitle = line.text;
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
  const frame = { x: 50, y: 728, width: 80, height: 80 };
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
  const scale = Math.min(innerWidth / image.width, innerHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = innerX + (innerWidth - drawWidth) / 2;
  const drawY = innerBottom + (innerHeight - drawHeight) / 2;
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

function imageFocusCommands(image: PdfImage, focus: PdfVisualFocus, y: number, reservedHeight: number) {
  const scale = Math.min(502 / focus.crop.width, (reservedHeight - 20) / focus.crop.height);
  const width = focus.crop.width * scale;
  const height = focus.crop.height * scale;
  const left = 50 + (512 - width) / 2;
  const top = y - 5;
  const commands = ["q", `${left} ${top - height} ${width} ${height} re W n`,
    `${image.width * scale} 0 0 ${image.height * scale} ${left - focus.crop.x * scale} ${top + focus.crop.y * scale - image.height * scale} cm`, "/Im1 Do", "Q"];
  for (const control of focus.controls) {
    const [boundsX, boundsY, boundsWidth, boundsHeight] = control.bounds;
    const controlX = left + (boundsX - focus.crop.x) * scale;
    const controlY = top - (boundsY - focus.crop.y + boundsHeight) * scale;
    const color = control.intent === "accept" ? "0.04 0.47 0.64" : "0.55 0.30 0.63";
    commands.push(`${color} RG 1.5 w ${controlX} ${controlY} ${boundsWidth * scale} ${boundsHeight * scale} re S`,
      `BT /F2 8 Tf ${color} rg ${controlX} ${controlY + boundsHeight * scale + 5} Td (${control.intent === "accept" ? "Accept" : "Reject"}) Tj ET`);
  }
  return commands;
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

/** Executive page follows the retained reference design; data stays canonical. */
function executivePage(report: CanonicalReportExport, hasLogo: boolean, headerTheme: ReportHeaderTheme, topicPages: Map<string, number>, timeZone: string, brandName: string) {
  const model = reportExecutiveSummary(report), palette = REPORT_HEADER_PALETTES[headerTheme];
  const commands: string[] = [], links: Array<{ topic: string; rect: number[] }> = [];
  const ink = "0.07 0.10 0.16", muted = "0.30 0.35 0.42", accent = "0.04 0.44 0.60", orange = "0.58 0.24 0.02";
  const text = (value: unknown, x: number, y: number, size = 9, bold = false, color = ink, width = 562 - x) =>
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${pdfString(fitPdfText(ascii(String(value ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replaceAll("×", "x")), width, size, bold))}) Tj ET`);
  const box = (x: number, y: number, w: number, h: number, fill: string, border = "0.83 0.85 0.88") => {
    const r = 5, k = r * .55228475;
    commands.push(`${fill} rg ${border} RG 0.6 w ${x+r} ${y} m ${x+w-r} ${y} l ${x+w-r+k} ${y} ${x+w} ${y+r-k} ${x+w} ${y+r} c ${x+w} ${y+h-r} l ${x+w} ${y+h-r+k} ${x+w-r+k} ${y+h} ${x+w-r} ${y+h} c ${x+r} ${y+h} l ${x+r-k} ${y+h} ${x} ${y+h-r+k} ${x} ${y+h-r} c ${x} ${y+r} l ${x} ${y+r-k} ${x+r-k} ${y} ${x+r} ${y} c h B`);
  };
  const lines = (value: string, x: number, y: number, width: number, size = 9, maximum = 3, bold = false, color = muted) => {
    const wrapped = wrapPdfText(ascii(String(value ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replaceAll("×", "x")), width, size, bold);
    wrapped.slice(0, maximum).forEach((line, index) => text(index === maximum - 1 && wrapped.length > maximum ? `${line}...` : line, x, y - index * (size + 2), size, bold, color, width));
    return Math.min(wrapped.length, maximum) * (size + 2);
  };
  const titleX = hasLogo ? 144 : 50;
  const identityWidth = 392 - titleX;
  text("Executive Summary", 50, 805, 16, true, palette.foreground, 350);
  text(report.scan.domainHostname ?? "Website report", titleX, 772, 27, true, palette.foreground, identityWidth);
  text(brandName, titleX, 750, 8.5, false, palette.muted, identityWidth);
  text(`${report.reviewFocusLabel} | ${model.scoreScope}`, titleX, 735, 8.5, false, palette.muted, identityWidth);
  text(pdfLocalDate(report.scan.completedAt, timeZone), titleX, 722, 8.5, false, palette.muted, identityWidth);
  const cx = 530, cy = 760, radius = 28;
  commands.push(`q 0.89 0.90 0.92 RG 6 w ${chartArc(cx, cy, radius, Math.PI / 2, Math.PI / 2 - 2 * Math.PI)}\nS Q`);
  if (model.score !== null && model.score > 0) commands.push(`q ${accent} RG 6 w ${chartArc(cx, cy, radius, Math.PI / 2, Math.PI / 2 - 2 * Math.PI * model.score / 100)}\nS Q`);
  const score = model.score === null ? "N/A" : String(model.score);
  text(score, cx - pdfTextWidth(score, 23, true) / 2, cy - 4, 23, true, palette.foreground, 60);
  text("of 100", cx - 13, cy - 18, 8, false, palette.muted, 40);
  text("SCORE", 408, 775, 8, true, palette.muted, 85);
  lines(model.rating, 408, 757, 85, 10, 2, true, palette.foreground);
  lines(`Scan origination: ${pdfRegionLabel(report.scan.scanFrom)}`, 408, 722, 154, 8.5, 2, false, palette.muted);
  commands.push(`0.13 0.16 0.20 RG 1 w 50 716 m 562 716 l S`);
  const metricTop = 701, metricHeight = 64, tileWidth = 122, tileGap = 8;
  model.metrics.forEach((metric, index) => {
    const x = 50 + index * (tileWidth + tileGap), hot = metric.attention;
    box(x, metricTop - metricHeight, tileWidth, metricHeight, hot ? "1 0.96 0.90" : "0.95 0.96 0.97", hot ? "0.89 0.59 0.32" : "0.95 0.96 0.97");
    text(metric.value, x + 10, metricTop - 23, 21, true, hot ? orange : ink, tileWidth - 20);
    text(metric.label, x + 10, metricTop - 37, 8.5, true, ink, tileWidth - 20);
    lines(metric.note, x + 10, metricTop - 49, tileWidth - 20, 7.5, 2, false, hot ? orange : muted);
  });
  let y = metricTop - metricHeight - 24;
  text("Report findings", 50, y, 13, true);
  text(`${model.priorityCount} selected ${model.priorityCount === 1 ? "priority" : "priorities"}; ${model.findings.length} findings`, 335, y, 8, false, muted, 227);
  y -= 12;
  if (!model.findings.length) {
    box(50, y - 48, 512, 48, "0.97 0.98 0.99");
    text("No priority findings selected", 64, y - 20, 10, true);
    text("See the topic assessments and detailed evidence.", 64, y - 35, 9, false, muted);
    y -= 58;
  }
  const available = y - 201;
  const visible = model.findings.slice(0, Math.max(1, Math.min(4, Math.floor(available / 82))));
  const cardHeight = Math.min(92, available / Math.max(1, visible.length) - 7);
  visible.forEach((finding, index) => {
    const top = y, warm = ["high", "critical", "medium"].includes(finding.impact.toLowerCase());
    box(50, top - cardHeight, 512, cardHeight, warm ? "1 0.98 0.95" : "1 1 1", warm ? "0.90 0.60 0.34" : "0.80 0.82 0.86");
    commands.push(`${warm ? "0.77 0.36 0.06" : "0.61 0.65 0.71"} rg 50 ${top - cardHeight} 3 ${cardHeight} re f`);
    text(index + 1, 64, top - 22, 12, true);
    const titleHeight = lines(finding.title, 86, top - 18, 335, 10, 2, true, ink);
    const maxLines = Math.max(1, Math.min(4, Math.floor((cardHeight - titleHeight - 22) / 10.5)));
    lines(finding.summary, 86, top - 21 - titleHeight, 333, 8.5, maxLines);
    text(finding.priority ? "Selected priority" : finding.status === "For information" ? "For information" : "Other finding", 435, top - 18, 7.5, true, finding.priority ? orange : muted, 115);
    text(`${titleCase(finding.impact)} impact`, 435, top - 32, 7.5, true, muted, 115);
    lines(finding.confidence, 435, top - 46, 115, 7.5, 2);
    text(`Details p.${topicPages.get(finding.target) ?? "-"}`, 435, top - cardHeight + 10, 8, true, accent, 115);
    links.push({ topic: finding.target, rect: [50, top - cardHeight, 562, top] });
    y -= cardHeight + 7;
  });
  if (model.findings.length > visible.length) { text(`${visible.length} of ${model.findings.length} findings shown; all findings remain in Detailed evidence.`, 50, y - 3, 8, false, muted); y -= 17; }
  const topicTop = Math.min(y - 17, 195);
  text("Topic status", 50, topicTop, 12, true);
  const gap = 8, width = 122, height = 43;
  model.topics.forEach((topic, index) => {
    const x = 50 + index % 4 * (width + gap), top = topicTop - 10 - Math.floor(index / 4) * (height + gap);
    box(x, top - height, width, height, "1 1 1");
    lines(topic.title, x + 8, top - 13, width - 16, 8, 2, true, ink);
    text(topic.status, x + 8, top - 34, 7.5, true, ["Review", "Manual check", "Limited", "Partial"].includes(topic.status) ? orange : accent, width - 39);
    text(`p.${topicPages.get(topic.target) ?? "-"}`, x + width - 29, top - 34, 7.5, false, muted, 24);
    links.push({ topic: topic.target, rect: [x, top - height, x + width, top] });
  });
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
      commands.push(`0.95 0.97 0.98 rg ${x} ${y - 50} 164 52 re f`);
      text(fitPdfText(metric.label, 148, 8), x + 8, y - 13, 8, false, muted);
      text(fitPdfText(metric.value, 148, 16, true), x + 8, y - 37, 16, true);
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
      if (width) commands.push(`${status.color} rg ${x} ${y - 66} ${width} 6 re f`);
      x += width;
    }
    if (overview.checks) text(`${overview.checks} retained checks: ${statuses.filter(status => status.count).map(status => `${status.count} ${status.label.toLowerCase()}`).join(" / ")}`, 50, y - 82, 8, false, muted);
  }
  return commands;
}

function timelineCommands(events: Array<{ label: string; milliseconds: number }>, x: number, y: number, width = 512, relative = false) {
  const commands: string[] = [];
  const baseline = y - 15;
  const slot = width / events.length;
  commands.push(`0.45 0.61 0.69 RG 1 w ${x + slot / 2} ${baseline} m ${x + width - slot / 2} ${baseline} l S`);
  events.forEach((event, index) => {
    const position = x + slot * (index + 0.5);
    const labelX = x + slot * index;
    commands.push(`0.04 0.47 0.64 rg ${position - 2} ${baseline - 2} 4 4 re f`);
    commands.push(`BT /F2 7 Tf 0.12 0.18 0.27 rg ${labelX} ${baseline - 14} Td (${pdfString(relative ? `+${event.milliseconds} ms` : `${(event.milliseconds / 1000).toFixed(2)} s`)}) Tj ET`);
    commands.push(`BT /F1 7 Tf 0.25 0.31 0.39 rg ${labelX} ${baseline - 25} Td (${pdfString(event.label)}) Tj ET`);
  });
  return commands;
}

export function renderCanonicalReportPdf(
  report: CanonicalReportExport,
  options: {
    appUrl?: string;
    brandLogo?: ReportPdfVisualEvidence | null;
    brandName?: string;
    headerTheme?: ReportHeaderTheme;
    visualEvidence?: ReportPdfVisualEvidence | null;
    timeZone?: string;
  } = {},
) {
  report=scopeCanonicalReportPdf(report);
  const headerTheme = normalizeReportHeaderTheme(options.headerTheme);
  const palette = REPORT_HEADER_PALETTES[headerTheme];
  const image = decodePdfImage(options.visualEvidence);
  const brandLogo = decodePdfImage(options.brandLogo, options.brandName ? [255, 255, 255] : palette.matte);
  const brandName = options.brandName ? ascii(options.brandName).slice(0, 64) : "CertScore.ai";
  const visualFocus = image && options.visualEvidence ? pdfConsentVisualFocus(report, { width: image.width, height: image.height, sha256: createHash("sha256").update(options.visualEvidence.body).digest("hex") }) : null;
  const timeZone = pdfTimeZone(options.timeZone) ?? "UTC";
  const contentLines = reportLines(report, image, options.appUrl ?? "https://certscore.ai", visualFocus);
  assertPublicReportPdfContent(contentLines.flatMap(line => [line.text, line.href ?? "", ...(line.cells?.flat() ?? [])]));
  const pages: PdfLine[][] = [[], ...paginate(contentLines)];
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
      "1 1 1 rg 0 0 612 842 re f",
      pageIndex === 0
        ? `${palette.background} rg 0 716 612 126 re f`
        : `${palette.background} rg 0 812 612 30 re f\n0.055 0.647 0.914 rg 0 809 612 3 re f\nBT /F2 8 Tf ${palette.foreground} rg 50 823 Td (${pdfString(fitPdfText(`${brandName}  -  ${report.reviewFocusLabel} evidence report`, 512, 8, true))}) Tj ET`,
    ];
    if (pageIndex === 0 && brandLogo) {
      commands.push(brandLogoCommand(brandLogo));
    }
    const executive = pageIndex === 0 ? executivePage(report, Boolean(brandLogo), headerTheme, topicPages, timeZone, brandName) : null;
    if (executive) commands.push(...executive.commands);
    const annotations: number[] = (executive?.links ?? []).map(link =>
      add(`<< /Type /Annot /Subtype /Link /Rect [${link.rect.join(" ")}] /Border [0 0 0] /Dest (${link.topic}) >>`));
    for (const line of pageLines) {
      y -= line.gapBefore ?? 0;
      if (line.destination) destinations.set(line.destination, { pageIndex, y });
      if (line.internalDestination) annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [50 ${y - 3} 562 ${y + 10}] /Border [0 0 0] /Dest (${line.internalDestination}) >>`));
      if (line.href && /^https?:\/\//i.test(line.href)) annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [50 ${y - 3} 562 ${y + 10}] /Border [0 0 0] /A << /S /URI /URI (${pdfString(ascii(line.href))}) >> >>`));
      if (line.kind === "chapterNavigation") {
        ["Overview", "Plan", "Evidence", "Workpaper"].forEach((label, index) => {
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
      if (line.kind === "imageFocus" && image && line.visualFocus) {
        commands.push(...imageFocusCommands(image, line.visualFocus, y, line.reservedHeight ?? 155));
        y -= line.reservedHeight ?? 155;
        continue;
      }
      if (line.kind === "fullImageSlice" && image) {
        commands.push(fullImageSliceCommand(image, y, line.reservedHeight ?? 650, line.imageSliceIndex ?? 0));
        y -= line.reservedHeight ?? 650;
        continue;
      }
      if (line.kind === "timeline" && line.timeline) {
        commands.push(...timelineCommands(line.timeline, 50, y, 512, line.timelineRelative));
        y -= line.reservedHeight ?? 90;
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
    commands.push("0.796 0.835 0.882 RG 0.6 w 50 54 m 562 54 l S");
    commands.push(`BT /F1 8 Tf 0.392 0.455 0.545 rg 50 41 Td (${pdfString(fitPdfText(`${brandName}  |  ${report.scan.domainHostname ?? "Website report"}`, 370, 8))}) Tj ET`);
    commands.push(`BT /F1 7.5 Tf 0.392 0.455 0.545 rg 50 28 Td (${pdfString(`Scan ID: ${report.scan.id}`)}) Tj ET`);
    commands.push(`BT /F1 7.5 Tf 0.392 0.455 0.545 rg 50 15 Td (${pdfString(REPORT_EXPORT_DISCLAIMER)}) Tj ET`);
    if (pageIndex > 0) {
      commands.push("BT /F2 8 Tf 0.04 0.47 0.64 rg 440 41 Td (Summary) Tj ET");
      annotations.push(add("<< /Type /Annot /Subtype /Link /Rect [436 37 483 50] /Border [0 0 0] /Dest (executive) >>"));
    }
    commands.push(`BT /F2 8 Tf 0.278 0.333 0.412 rg 512 41 Td (Page ${pageIndex + 1} / ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    assertPublicReportPdfContent([content]);
    const contentId = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const xObjects = [
      imageId ? `/Im1 ${imageId} 0 R` : null,
      brandLogoId ? `/Logo ${brandLogoId} 0 R` : null,
    ].filter(Boolean).join(" ");
    const xObject = xObjects ? ` /XObject << ${xObjects} >>` : "";
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>${xObject} >> /Contents ${contentId} 0 R /Annots [${annotations.map(id => `${id} 0 R`).join(" ")}] >>`);
    pageIds.push(pageId);
  });

  const workpaperDestination = destinations.get("workpaper");
  if (workpaperDestination) for (const topic of PDF_REPORT_TOPICS) destinations.set(`${topic.id}-sources`, workpaperDestination);
  const destinationNames = [...destinations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, target]) => `(${name}) [${pageIds[target.pageIndex]} 0 R /XYZ null ${target.y + 20} null]`).join(" ");
  const outlineId = add("");
  const chapters = [{ id: "executive", title: "Executive summary" }, { id: "findings", title: "Top issues and remediation" }, { id: "retest", title: "How to re-test" }, ...(pdfOtherReviewGroups(report).length ? [{ id: "other-findings", title: "Other report findings" }] : []), ...PDF_REPORT_TOPICS.map((topic, index) => ({ id: topic.id, title: `Appendix ${String.fromCharCode(65 + index)}: ${topic.title}` })), { id: "methodology", title: "Methodology and limitations" }];
  const chapterIds = chapters.map(() => add(""));
  chapters.forEach((chapter, index) => {
    const id = chapterIds[index]!;
    const children = PDF_REPORT_TOPICS.some(topic => topic.id === chapter.id) ? ["overview", "fixes", "evidence", "sources"].map(() => add("")) : [];
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
