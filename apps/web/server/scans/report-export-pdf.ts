import type { CanonicalReportExport } from "./report-export";
import { deflateSync, inflateSync } from "node:zlib";
import { isGdprTransparencyReportRowId } from "../../lib/scans/gdpr-transparency-report-contract";

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

function isTransportSecurityFinding(finding: Record<string, unknown>) {
  const presentation = record(finding.presentation);
  return [
    finding.id,
    finding.unifiedFindingId,
    finding.findingId,
    finding.checklistRowId,
    presentation?.findingId,
    presentation?.checklistRowId,
  ].some(isTransportSecurityRowId);
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

function wrap(value: unknown, width = 92) {
  const words = ascii(value).split(" ").filter(Boolean).flatMap((word) => {
    if (word.length <= width) return [word];
    return Array.from({ length: Math.ceil(word.length / width) }, (_, index) =>
      word.slice(index * width, (index + 1) * width)
    );
  });
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
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

function formatConfidence(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value * 100)}%`
    : "Not retained";
}

type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapAfter?: number;
  indent?: number;
  pageBreakBefore?: boolean;
  kind?: "body" | "caption" | "coverDomain" | "coverMeta" | "coverTitle" | "fullImageSlice" | "image" | "itemHeading" | "section" | "summary";
  gapBefore?: number;
  keepWithNextHeight?: number;
  reservedHeight?: number;
  imageSliceIndex?: number;
  imageSliceCount?: number;
};

const FULL_CAPTURE_INNER_WIDTH = 502;
const FULL_CAPTURE_SLICE_HEIGHT = 630;

function wrappedLines(
  value: unknown,
  options: Omit<PdfLine, "text"> & { width?: number } = {},
): PdfLine[] {
  const { width = Math.max(48, 94 - Math.round((options.indent ?? 0) / 4)), ...lineOptions } = options;
  return wrap(value, width).map((text, index, values) => ({
    text,
    ...lineOptions,
    gapAfter: index === values.length - 1 ? options.gapAfter : 0,
  }));
}

function sectionHeading(text: string, pageBreakBefore = false): PdfLine {
  return {
    text,
    size: 14,
    bold: true,
    gapAfter: 7,
    gapBefore: 6,
    keepWithNextHeight: 42,
    kind: "section",
    pageBreakBefore,
  };
}

function findingDisplay(finding: Record<string, unknown>) {
  const presentation = record(finding.presentation);
  return {
    name: presentation?.findingName ?? finding.title ?? finding.unifiedFindingId ?? "Finding",
    severity: finding.severity ?? "review",
    description: presentation?.findingDescription ?? presentation?.description ?? finding.summary,
    why: presentation?.whyThisMatters,
    fix: presentation?.suggestedFix,
    confidence: presentation?.confidenceScore,
  };
}

function reportLines(report: CanonicalReportExport, image: PdfImage | null): PdfLine[] {
  const findings = report.projection.unifiedFindings as Array<Record<string, unknown>>;
  const mainFindings = findings.filter((finding) => !isTransportSecurityFinding(finding));
  const transportFindings = findings.filter(isTransportSecurityFinding);
  const review = report.gdprEprivacyReview;
  const transparencyAppendix = report.appendix.gdprTransparency;
  const runtimeAppendix = report.appendix.cookieAndTrackerInventory;
  const collectionAppendix = report.appendix.dataCollectionSurfaces;
  const transportRows = review?.rows.filter((row) => isTransportSecurityRowId(row.id)) ?? [];
  const mainChecklistRows = review?.rows.filter((row) =>
    !isGdprTransparencyReportRowId(row.id) && !isTransportSecurityRowId(row.id)
  ) ?? [];
  const lines: PdfLine[] = [
    { text: report.fullSite ? "Full site scan" : "GDPR / ePrivacy evidence report", size: 21, bold: true, gapAfter: 5, kind: "coverTitle" },
    { text: report.scan.domainHostname ?? "Website scan", size: 14, bold: true, gapAfter: 8, kind: "coverDomain" },
    { text: `Scan ID: ${report.scan.id}`, size: 8, kind: "coverMeta" },
    { text: `Completed: ${report.scan.completedAt ?? "Not available"}`, size: 8, gapAfter: 35, kind: "coverMeta" },
    { text: `Scan region: ${report.scan.scanFrom || "Not retained"}  |  Duration: ${formatDuration(report.scan.durationMs)}`, size: 9, kind: "caption" },
    { text: `Report generated: ${report.generatedAt}`, size: 9, kind: "caption", gapAfter: image ? 6 : 11 },
    ...(image
      ? [
          { text: "Captured page evidence", size: 9, bold: true, kind: "caption" as const, gapAfter: 3 },
          { text: "Representative retained pre-interaction image - top of capture shown", kind: "image" as const, reservedHeight: 132, gapAfter: 9 },
        ]
      : []),
    sectionHeading("Executive summary"),
    { text: `Evidence-based posture: ${titleCase(report.executiveSummary.posture)}`, size: 11, bold: true, gapAfter: 4, kind: "summary" },
    ...report.executiveSummary.sentences.flatMap((sentence) => wrappedLines(sentence, { size: 10, gapAfter: 4, kind: "summary" })),
  ];

  if(report.fullSite) {
    const f=report.fullSite, {state,counts,totals,timing}=f.summary;
    lines.splice(0,0,...[
      sectionHeading("Full site scope and resource inventory"),
      ...wrappedLines(`${f.scope}. Additional pages: Not assessed for consent, CMP, policy, GDPR transparency or transport. ${f.scoreScope} remains unchanged.`),
      ...wrappedLines(`${f.condition} ${f.countingScope}`),
      ...wrappedLines(`Max pages including homepage: ${state.requested.maxPages}; requested concurrency: ${state.requested.concurrency}; wait between starts: ${state.requested.waitSeconds}s; region: ${state.region}.`),
      ...wrappedLines(`Effective concurrency: ${state.effective.concurrency}; effective wait: ${state.effective.waitSeconds}s. Status: ${state.status}; stop reason: ${state.stopReason??"In progress"}.`),
      ...(state.robotsRestriction ? wrappedLines(state.robotsRestriction) : []),
      ...wrappedLines(`Coverage: ${counts.completed} completed; ${counts.partial} partial; ${counts.blockedFailed} blocked/failed; ${counts.pending} pending; ${counts.excluded} excluded/unvisited.`),
      ...wrappedLines(`Across observed pages: ${totals.services} distinct services; ${totals.cookies} distinct cookies; ${totals.requestEvents} request events; ${totals.embedInstances} embed instances. Additional services: ${totals.additionalServices??"Homepage comparison unavailable"}.`),
      ...wrappedLines(`Started: ${state.startedAt}; ended: ${state.completedAt??"In progress"} (UTC). Homepage audit: ${formatDuration(state.homepageDurationMs)}. Median observation: ${formatDuration(timing.medianPageMs)} (${timing.sampleCount} samples); slowest: ${formatDuration(timing.slowestPageMs)}.`),
      ...wrappedLines(`Evidence: https://certscore.ai${f.inventoryHref}`),
      ...f.pages.flatMap(page=>wrappedLines(`${page.url}${page.finalUrl&&page.finalUrl!==page.url?` -> ${page.finalUrl}`:""} | ${page.status} | ${page.services??"Unavailable"} services; ${page.cookies??"Unavailable"} cookies; ${page.requestEvents??"Unavailable"} request events; ${page.embedInstances??"Unavailable"} embed instances. ${page.limitations.join(", ")} Evidence page ID: ${page.id}`)),
      sectionHeading("Homepage audit"),
    ]);
  }

  lines.push(sectionHeading("GDPR / ePrivacy evidence overview"));
  if (review) {
    lines.push(
      { text: `Evidence review score: ${review.checklistScore.score}/100 (evidence coverage indicator, not a compliance score)`, bold: true },
      ...wrappedLines(review.checklistScore.summary, { gapAfter: 2 }),
      ...wrappedLines(review.reviewSummary.coverageText),
      ...wrappedLines(review.reviewSummary.priorityReviewText, { gapAfter: 3 }),
      {
        text: `Summary counts: ${review.summaryCounts.gap_observed} observed gaps; ${review.summaryCounts.potential_concern} potential concerns; ${review.summaryCounts.review_signal} review signals; ${review.summaryCounts.technical_limitation} technical limitations.`,
      },
    );
  } else {
    lines.push({ text: "A persisted GDPR/ePrivacy checklist presentation was not available for this scan." });
  }

  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Consent control assessment"));
  const assessment = report.consentControlAssessment;
  if (assessment) {
    lines.push(
      { text: `Accept control: ${titleCase(assessment.controls.accept.state)}` },
      { text: `Reject / necessary-only control: ${titleCase(assessment.controls.reject.state)}` },
      { text: `Options / settings control: ${titleCase(assessment.controls.options.state)}` },
      { text: `Privacy opt-out control: ${titleCase(assessment.controls.privacyOptOut.state)}` },
    );
  } else {
    lines.push({ text: "A canonical consent-control assessment was not retained for this scan." });
  }

  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Key findings"));
  if (mainFindings.length === 0) lines.push({ text: "No non-transport owner-projected unified findings were retained." });
  mainFindings.forEach((finding, index) => {
    const display = findingDisplay(finding);
    lines.push({
      text: `${index + 1}. ${ascii(display.name)} [${titleCase(display.severity)}]`,
      bold: true,
      gapAfter: 1,
      keepWithNextHeight: 22,
    });
    if (display.description) lines.push(...wrappedLines(display.description, { indent: 10 }));
    if (display.why) lines.push(...wrappedLines(`Why it matters: ${display.why}`, { indent: 10 }));
    if (display.fix) lines.push(...wrappedLines(`Suggested review action: ${display.fix}`, { indent: 10 }));
    if (display.confidence) lines.push({ text: `Retained confidence: ${display.confidence}`, indent: 10, gapAfter: 3 });
  });

  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Detailed GDPR / ePrivacy checklist"));
  lines.push(...wrappedLines("GDPR Transparency and Transport Security rows are presented separately in their dedicated appendices.", {
    size: 9,
    gapAfter: 3,
  }));
  if (!review || mainChecklistRows.length === 0) {
    lines.push({ text: "No main-checklist presentation rows were retained." });
  } else {
    mainChecklistRows.forEach((row, index) => {
      lines.push({ text: `${index + 1}. ${row.label}: ${row.evidenceLabel}`, bold: true, gapAfter: 1, keepWithNextHeight: 18 });
      lines.push(...wrappedLines(row.rationale, { indent: 10, size: 9, gapAfter: 3 }));
    });
  }

  lines.push({ text: "", gapAfter: 2 }, sectionHeading("Scope and limitations"));
  report.limitations.forEach((limitation) => {
    lines.push(...wrappedLines(`${titleCase(limitation.code)}: ${limitation.detail ?? "No further detail retained."}`, {
      gapAfter: 2,
    }));
  });
  lines.push(
    ...wrappedLines("Method: the report projects persisted scanner evidence through normalized concerns, concern policy, unified findings, and the GDPR/ePrivacy checklist. The download does not create or upgrade findings from display context.", { size: 9, gapAfter: 3 }),
    ...wrappedLines(report.notice, { size: 9, gapAfter: 5 }),
  );

  lines.push(sectionHeading(runtimeAppendix.title, true));
  lines.push(...wrappedLines(runtimeAppendix.scopeNote, { size: 9, gapAfter: 4 }));
  lines.push(...wrappedLines(
    `Inventory summary: ${runtimeAppendix.summary.totalRows} retained rows (${runtimeAppendix.summary.cookieRows} cookies, ${runtimeAppendix.summary.trackerRows} trackers); ${runtimeAppendix.summary.groupedEntities} grouped entities; ${runtimeAppendix.summary.requestEvidenceRows} sanitized request-evidence rows; ${runtimeAppendix.summary.dataFlowRows} data-flow rows.`,
    { bold: true, gapAfter: 3 },
  ));
  if (runtimeAppendix.presentationMessage) {
    lines.push(...wrappedLines(runtimeAppendix.presentationMessage, { gapAfter: 3 }));
  }
  if (runtimeAppendix.summary.omittedRows > 0) {
    lines.push({ text: `${runtimeAppendix.summary.omittedRows} rows were omitted by the bounded 500-row export limit.`, gapAfter: 3 });
  }
  runtimeAppendix.rows.forEach((row) => {
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
    row.cookieDetails.forEach((cookie, index) => {
      lines.push(...wrappedLines(
        `Cookie detail ${index + 1}: ${cookie.cookieName}; domain ${cookie.domain ?? "not retained"}; path ${cookie.path ?? "not retained"}; essentiality ${titleCase(cookie.essentiality)}; first observed ${formatTiming(cookie.firstObservedAtMs)}; set method ${cookie.setMethod ?? "not retained"}; expires ${cookie.expiresAt ?? "not retained"}.`,
        { indent: 18, size: 8 },
      ));
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
        `Request detail ${index + 1}: ${request.method ?? "method not retained"} ${request.hostname ?? "host not retained"}${request.path ?? ""}; response observed ${yesNo(request.responseObserved)}; response storage attempted ${yesNo(request.responseStorageAttempted)}; cookies sent ${join(request.cookieNamesSent, "none retained")}; response cookies ${join(request.responseCookieNamesSet, "none retained")}; identifier parameters ${join(request.identifierParameterNames, "none retained")}.`,
        { indent: 18, size: 8 },
      ));
    });
    row.dataFlows.forEach((flow, index) => {
      lines.push(...wrappedLines(
        `Data flow ${index + 1}: ${flow.endpoint}; server/edge ${flow.networkDestination.ip ?? "IP not retained"} ${flow.networkDestination.countryCode ?? ""}; controlling entity ${flow.controllingEntity.legalEntity ?? "not retained"} ${flow.controllingEntity.headquartersCountry ?? ""}; transfer context ${titleCase(flow.transferMechanism.mechanism)}; ID sync ${yesNo(flow.idSync)}.`,
        { indent: 18, size: 8 },
      ));
    });
    lines.push({ text: "", gapAfter: 3 });
  });

  lines.push(sectionHeading(collectionAppendix.title, true));
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

  lines.push(sectionHeading(transparencyAppendix.title, true));
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

  lines.push(sectionHeading("Appendix: Transport Security", true));
  lines.push(...wrappedLines(
    "These rows reproduce the persisted Transport Security checklist projection. They describe bounded HTTPS, TLS certificate, HTTP redirect, mixed-content, and form-transport observations without changing the canonical findings or evidence.",
    { size: 9, gapAfter: 4 },
  ));
  lines.push(...wrappedLines(
    `Transport Security summary: ${transportRows.length} checklist rows; ${transportFindings.length} projected findings.`,
    { bold: true, gapAfter: 5 },
  ));
  if (transportRows.length === 0) {
    lines.push({ text: "No persisted Transport Security checklist rows were retained." });
  }
  transportRows.forEach((row, index) => {
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
  transportFindings.forEach((finding, index) => {
    const display = findingDisplay(finding);
    lines.push({
      text: `Finding ${index + 1}. ${ascii(display.name)} [${titleCase(display.severity)}]`,
      size: 11,
      bold: true,
      gapAfter: 1,
      gapBefore: 3,
      keepWithNextHeight: 28,
      kind: "itemHeading",
    });
    if (display.description) lines.push(...wrappedLines(display.description, { indent: 10, size: 9 }));
    if (display.why) lines.push(...wrappedLines(`Why it matters: ${display.why}`, { indent: 10, size: 9 }));
    if (display.fix) lines.push(...wrappedLines(`Suggested review action: ${display.fix}`, { indent: 10, size: 9 }));
    if (display.confidence) lines.push({ text: `Retained confidence: ${display.confidence}`, indent: 10, size: 8, gapAfter: 3 });
  });

  if (image) {
    const fullCaptureHeight = image.height * (FULL_CAPTURE_INNER_WIDTH / image.width);
    const sliceCount = Math.max(1, Math.ceil(fullCaptureHeight / FULL_CAPTURE_SLICE_HEIGHT));
    for (let index = 0; index < sliceCount; index += 1) {
      lines.push(sectionHeading(
        index === 0
          ? "Appendix: Full captured page"
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
  return lines;
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = 790;
  for (const line of lines) {
    if (line.pageBreakBefore && page.length > 0) {
      pages.push(page);
      page = [];
      y = 790;
    }
    const height = (line.gapBefore ?? 0) + (line.reservedHeight ?? ((line.size ?? 10) + 4 + (line.gapAfter ?? 0)));
    if (y - height - (line.keepWithNextHeight ?? 0) < 48 && page.length > 0) {
      pages.push(page);
      page = [];
      y = 790;
    }
    page.push(line);
    y -= height;
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[{ text: "CertScore report" }]];
}

function textColor(line: PdfLine) {
  if (line.kind === "coverTitle" || line.kind === "coverDomain") return "1 1 1";
  if (line.kind === "coverMeta") return "0.733 0.894 0.976";
  if (line.kind === "caption") return "0.278 0.333 0.412";
  if (line.kind === "section") return "0.059 0.114 0.216";
  return "0.059 0.09 0.165";
}

function lineX(line: PdfLine, hasBrandLogo: boolean) {
  if (line.kind === "coverTitle" || line.kind === "coverDomain" || line.kind === "coverMeta") {
    return hasBrandLogo ? 126 : 50;
  }
  if (line.kind === "section") return 64;
  if (line.kind === "itemHeading") return 60;
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

export function renderCanonicalReportPdf(
  report: CanonicalReportExport,
  options: {
    brandLogo?: ReportPdfVisualEvidence | null;
    visualEvidence?: ReportPdfVisualEvidence | null;
  } = {},
) {
  const image = decodePdfImage(options.visualEvidence);
  const brandLogo = decodePdfImage(options.brandLogo, [9, 20, 45]);
  const pages = paginate(reportLines(report, image));
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

  pages.forEach((pageLines, pageIndex) => {
    let y = 790;
    const commands: string[] = [
      "0.973 0.98 0.988 rg 0 0 612 842 re f",
      pageIndex === 0
        ? "0.035 0.078 0.176 rg 0 690 612 152 re f\n0.055 0.647 0.914 rg 0 686 612 4 re f\nBT /F2 9 Tf 0.733 0.894 0.976 rg 485 814 Td (CERTSCORE.AI) Tj ET"
        : "0.035 0.078 0.176 rg 0 812 612 30 re f\n0.055 0.647 0.914 rg 0 809 612 3 re f\nBT /F2 8 Tf 1 1 1 rg 50 823 Td (CERTSCORE.AI  -  GDPR / ePrivacy evidence report) Tj ET",
    ];
    if (pageIndex === 0 && brandLogo) {
      commands.push(brandLogoCommand(brandLogo));
    }
    for (const line of pageLines) {
      y -= line.gapBefore ?? 0;
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
      const size = line.size ?? 10;
      if (line.kind === "section") {
        commands.push(`0.918 0.965 0.992 rg 50 ${y - 5} 512 ${size + 10} re f`);
        commands.push(`0.055 0.647 0.914 rg 50 ${y - 5} 4 ${size + 10} re f`);
      } else if (line.kind === "itemHeading") {
        commands.push(`0.945 0.961 0.98 rg 50 ${y - 4} 512 ${size + 8} re f`);
        commands.push(`0.055 0.647 0.914 rg 50 ${y - 4} 3 ${size + 8} re f`);
      } else if (line.kind === "summary") {
        commands.push(`0.941 0.976 0.996 rg 50 ${y - 4} 512 ${size + 8} re f`);
      }
      commands.push(`BT /${line.bold ? "F2" : "F1"} ${size} Tf ${textColor(line)} rg ${lineX(line, Boolean(brandLogo))} ${y} Td (${pdfString(line.text)}) Tj ET`);
      y -= size + 4 + (line.gapAfter ?? 0);
    }
    commands.push("0.796 0.835 0.882 RG 0.6 w 50 42 m 562 42 l S");
    commands.push("BT /F1 8 Tf 0.392 0.455 0.545 rg 50 27 Td (CertScore.ai  -  retained technical evidence) Tj ET");
    commands.push(`BT /F2 8 Tf 0.278 0.333 0.412 rg 512 27 Td (Page ${pageIndex + 1} / ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    const xObjects = [
      imageId ? `/Im1 ${imageId} 0 R` : null,
      brandLogoId ? `/Logo ${brandLogoId} 0 R` : null,
    ].filter(Boolean).join(" ");
    const xObject = xObjects ? ` /XObject << ${xObjects} >>` : "";
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>${xObject} >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
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
