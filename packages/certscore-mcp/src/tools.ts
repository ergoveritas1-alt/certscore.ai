import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CertScoreError, type FindingList, type JobStatus, type PreConsentCookiesTrackers, type PulseDetail, type PulseFormat, type PulseResult, type ScanResource, type TopFinding } from "@certscore/sdk";

const MAX_ERROR_RESPONSE_BODY_CHARS = 2_000;
export const MAX_EVIDENCE_PACKET_CHARS = 250_000;
const EVIDENCE_STRING_CHARS = 4_000;
const EVIDENCE_ARRAY_ITEMS = 40;
const EVIDENCE_OBJECT_KEYS = 80;

function toolResultSummary(payload: unknown) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return "CertScore tool call completed. Read structuredContent for the result.";
  }
  const record = payload as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "result";
  const status = typeof record.status === "string" ? `; status=${record.status}` : "";
  const scanId = typeof record.scanId === "string" ? `; scanId=${record.scanId}` : "";
  const score = typeof record.score === "number" ? `; score=${record.score}` : "";
  return `CertScore ${type}${status}${scanId}${score}. Full result is in structuredContent.`;
}

export function toToolResult(payload: unknown): CallToolResult {
  const structuredContent = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { value: payload };
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: toolResultSummary(payload)
      }
    ]
  };
}

export function toToolError(error: unknown): CallToolResult {
  const responseRecord = error instanceof CertScoreError && error.responseBody && typeof error.responseBody === "object" && !Array.isArray(error.responseBody)
    ? error.responseBody as Record<string, unknown>
    : null;
  const terminalError = responseRecord?.error && typeof responseRecord.error === "object" && !Array.isArray(responseRecord.error)
    ? responseRecord.error as Record<string, unknown>
    : null;
  const payload = error instanceof CertScoreError
    ? {
        error: {
          name: error.name,
          message: error.message,
          status: error.status,
          code: error.code,
          retryAfterSeconds: "retryAfterSeconds" in error ? error.retryAfterSeconds : undefined,
          retryable: typeof terminalError?.retryable === "boolean" ? terminalError.retryable : undefined,
          recommendedNextAction: typeof terminalError?.recommendedNextAction === "string" ? terminalError.recommendedNextAction : undefined,
          responseBody: truncateErrorResponseBody(error.responseBody)
        }
      }
    : {
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : "Unknown CertScore MCP error."
        }
      };

  // MCP validates structuredContent against the tool's success output schema,
  // including for isError results. Keep errors in text content so a bounded
  // error envelope cannot be rejected as an invalid success resource.
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true
  };
}

export function boundEvidencePacket<T>(payload: T, maxSerializedChars = MAX_EVIDENCE_PACKET_CHARS): T | Record<string, unknown> {
  const originalSerializedChars = measureSerializedChars(payload);
  if (originalSerializedChars <= maxSerializedChars) {
    return payload;
  }

  const compacted = withMcpMetadata(compactEvidenceValue(payload, {
    arrayItems: EVIDENCE_ARRAY_ITEMS,
    depth: 8,
    objectKeys: EVIDENCE_OBJECT_KEYS,
    stringChars: EVIDENCE_STRING_CHARS
  }), {
    maxSerializedChars,
    originalSerializedChars,
    strategy: "compact_nested_values",
    truncated: true
  });
  if (measureSerializedChars(compacted) <= maxSerializedChars) {
    return compacted;
  }

  const minimal = withMcpMetadata(minimalEvidencePacket(payload), {
    maxSerializedChars,
    originalSerializedChars,
    strategy: "minimal_safe_summary",
    truncated: true
  });
  if (measureSerializedChars(minimal) <= maxSerializedChars) {
    return minimal;
  }

  return {
    type: "certscore_mcp_evidence_packet",
    scanId: extractScanId(payload),
    summary: "Evidence packet was too large for MCP transport and was reduced to metadata. Fetch API v2 directly for the full public-safe artifact.",
    mcpMetadata: {
      maxSerializedChars,
      originalSerializedChars,
      strategy: "metadata_only",
      truncated: true
    }
  };
}

function measureSerializedChars(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

function measureSerializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function updateBundleActualBytes(bundle: Record<string, any>) {
  bundle.mcpMetadata.actualBytes = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const measured = measureSerializedBytes(bundle);
    if (bundle.mcpMetadata.actualBytes === measured) {
      break;
    }
    bundle.mcpMetadata.actualBytes = measured;
  }
  return bundle.mcpMetadata.actualBytes as number;
}

function compactBundleFinding(finding: Record<string, any>) {
  const evidence = finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
    ? finding.evidence as Record<string, unknown>
    : null;
  return {
    ...finding,
    ...(evidence ? {
      evidence: {
        ...evidence,
        examples: undefined,
        projectionWarnings: undefined
      }
    } : {}),
    detail: undefined
  };
}

function compactEvidenceValue(
  value: unknown,
  options: { arrayItems: number; depth: number; objectKeys: number; stringChars: number }
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > options.stringChars ? `${value.slice(0, options.stringChars)}…[truncated]` : value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (options.depth <= 0) {
    return "[truncated: depth limit]";
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, options.arrayItems).map((item) => compactEvidenceValue(item, {
      ...options,
      depth: options.depth - 1
    }));
    if (value.length > options.arrayItems) {
      items.push({
        omittedItems: value.length - options.arrayItems,
        truncated: true
      });
    }
    return items;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const next: Record<string, unknown> = {};
  for (const [key, nested] of entries.slice(0, options.objectKeys)) {
    next[key] = compactEvidenceValue(nested, {
      ...options,
      depth: options.depth - 1
    });
  }
  if (entries.length > options.objectKeys) {
    next.__truncatedKeys = entries.length - options.objectKeys;
  }
  return next;
}

function withMcpMetadata(value: unknown, metadata: Record<string, unknown>) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const existing = record.mcpMetadata !== null && typeof record.mcpMetadata === "object" && !Array.isArray(record.mcpMetadata)
      ? record.mcpMetadata as Record<string, unknown>
      : {};
    return {
      ...record,
      mcpMetadata: {
        ...existing,
        ...metadata
      }
    };
  }
  return {
    type: "certscore_mcp_evidence_packet",
    value,
    mcpMetadata: metadata
  };
}

function minimalEvidencePacket(payload: unknown) {
  const record = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  return {
    type: typeof record.type === "string" ? record.type : "certscore_mcp_evidence_packet",
    scanId: extractScanId(record),
    scan_id: typeof record.scan_id === "string" ? record.scan_id : undefined,
    domain: typeof record.domain === "string" ? record.domain : null,
    summary: compactEvidenceValue(record.summary ?? null, {
      arrayItems: 20,
      depth: 4,
      objectKeys: 30,
      stringChars: 1_000
    }),
    findings: compactEvidenceValue(record.findings ?? record.topFindings ?? [], {
      arrayItems: 20,
      depth: 5,
      objectKeys: 40,
      stringChars: 1_000
    }),
    evidenceHighlights: compactEvidenceValue(record.evidenceHighlights ?? null, {
      arrayItems: 20,
      depth: 5,
      objectKeys: 40,
      stringChars: 1_000
    }),
    coverage: compactEvidenceValue(record.coverage ?? null, {
      arrayItems: 20,
      depth: 4,
      objectKeys: 30,
      stringChars: 1_000
    }),
    disclaimer: typeof record.disclaimer === "string" ? record.disclaimer : null
  };
}

function extractScanId(payload: unknown): string | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.scanId === "string") {
    return record.scanId;
  }
  if (typeof record.scan_id === "string") {
    return record.scan_id;
  }
  const scan = record.scan;
  const nestedScanId = scan !== null && typeof scan === "object" && !Array.isArray(scan)
    ? (scan as Record<string, unknown>).scanId
    : null;
  if (typeof nestedScanId === "string") {
    return nestedScanId;
  }
  return null;
}

function truncateErrorResponseBody(value: unknown): unknown {
  if (typeof value !== "string") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length <= MAX_ERROR_RESPONSE_BODY_CHARS) {
      return value;
    }
    return `${serialized.slice(0, MAX_ERROR_RESPONSE_BODY_CHARS)}…[truncated]`;
  }
  if (value.length <= MAX_ERROR_RESPONSE_BODY_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_ERROR_RESPONSE_BODY_CHARS)}…[truncated]`;
}

export function normalizeDetail(detail: PulseDetail | undefined): PulseDetail {
  return detail ?? "summary";
}

export function normalizeFormat(format: PulseFormat | undefined): PulseFormat {
  return format ?? "json";
}

export function scanIdFromStatus(status: JobStatus) {
  return status.scanId ?? status.scan_id ?? null;
}

export function scanIdFromPulse(report: PulseResult) {
  const nestedScan = "scan" in report && report.scan && typeof report.scan === "object" ? (report.scan as { scanId?: string }) : undefined;
  return report.scanId ?? report.scan_id ?? nestedScan?.scanId ?? null;
}

export function findingsFromReport(report: PulseResult): TopFinding[] {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const topFindings = Array.isArray(report.topFindings) ? report.topFindings : [];
  const byId = new Map<string, TopFinding>();
  for (const finding of [...findings, ...topFindings]) {
    byId.set(finding.id, finding);
  }
  return [...byId.values()];
}

export function exportFindings(report: PulseResult) {
  return {
    type: "certscore_mcp_findings_export",
    scanId: scanIdFromPulse(report),
    domain: report.domain ?? report.request?.domain ?? null,
    summary: report.summary ?? null,
    resultDisposition: report.resultDisposition ?? null,
    noGo: report.noGo ?? null,
    findings: findingsFromReport(report).map((finding) => ({
      id: finding.id,
      label: finding.label ?? null,
      criticality: finding.criticality ?? null,
      confidence: finding.confidence ?? null,
      plainEnglish: finding.plainEnglish ?? null,
      evidenceDigest: finding.evidenceDigest ?? null,
      evidenceSummary: finding.evidence?.summary ?? null,
      reviewLenses: finding.reviewLenses ?? [],
      anchorUrl: finding.anchorUrl ?? finding.evidence?.fullEvidenceUrl ?? null,
      nextStep: finding.nextStep ?? null
    })),
    disclaimer: report.disclaimer ?? null
  };
}

export function paginateFindingList<T extends Record<string, unknown>>(
  payload: T,
  options: { limit?: number; offset?: number } = {},
): T {
  const findings = Array.isArray(payload.findings) ? payload.findings : null;
  if (!findings) {
    return payload;
  }
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(200, Math.max(1, options.limit ?? 50));
  const paginatedFindings = findings.slice(offset, offset + limit);
  const next = {
    ...payload,
    findings: paginatedFindings,
    pagination: {
      limit,
      offset,
      returned: paginatedFindings.length,
      total: findings.length,
      truncated: offset + limit < findings.length
    }
  };
  return next as T;
}

export function limitPreConsentRows<T extends Record<string, unknown>>(
  payload: T,
  options: { maxRows?: number } = {},
): T {
  const rows = Array.isArray(payload.rows) ? payload.rows : null;
  if (!rows) {
    return payload;
  }
  const maxRows = Math.min(200, Math.max(1, options.maxRows ?? 200));
  const total = rows.length;
  const truncated = total > maxRows;
  return {
    ...payload,
    rows: rows.slice(0, maxRows),
    summary: {
      ...(payload.summary && typeof payload.summary === "object" && !Array.isArray(payload.summary) ? payload.summary : {}),
      totalRowCount: total,
      truncated
    }
  } as T;
}

export function buildScanBundle(input: {
  detail?: "summary" | "findings" | "evidence" | "full";
  evidence?: PulseResult | null;
  findings: FindingList;
  maxFindings?: number;
  maxBytes?: number;
  maxPreConsentRows?: number;
  preConsentCookiesTrackers?: PreConsentCookiesTrackers | null;
  report: PulseResult;
  scan: ScanResource;
}) {
  const detail = input.detail ?? "summary";
  const maxFindings = Math.min(50, Math.max(1, input.maxFindings ?? (detail === "summary" ? 5 : 20)));
  const maxPreConsentRows = Math.min(50, Math.max(1, input.maxPreConsentRows ?? 20));
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const report = input.report as Record<string, unknown>;
  const findings = Array.isArray(input.findings.findings)
    ? input.findings.findings.slice(0, maxFindings).map((finding) => detail === "summary" ? compactBundleFinding(finding) : finding)
    : [];
  const preConsentRows = Array.isArray(input.preConsentCookiesTrackers?.rows)
    ? input.preConsentCookiesTrackers.rows.slice(0, maxPreConsentRows)
    : [];
  const links = {
    ...(input.scan.links ?? {}),
    ...(report.links && typeof report.links === "object" && !Array.isArray(report.links) ? report.links : {})
  };

  const maxBytes = Math.min(200_000, Math.max(5_000, input.maxBytes ?? 50_000));
  const bundle: Record<string, any> = {
    type: "certscore_scan_bundle",
    scanId: input.scan.scanId,
    domain: input.scan.domain,
    url: input.scan.url ?? null,
    status: input.scan.status,
    score: input.scan.score ?? null,
    scoreStatus: input.scan.scoreStatus ?? "final",
    scoreVersion: input.scan.scoreVersion ?? null,
    scoreUpdatedAt: input.scan.scoreUpdatedAt ?? null,
    riskLevel: input.scan.riskLevel ?? null,
    resultDisposition: input.scan.resultDisposition ?? null,
    noGo: input.scan.noGo ?? null,
    coverage: input.scan.coverage ?? null,
    timing: {
      createdAt: input.scan.createdAt ?? null,
      startedAt: input.scan.startedAt ?? null,
      completedAt: input.scan.completedAt ?? null,
      scanTimeSeconds: input.scan.scanTimeSeconds ?? null
    },
    summary: {
      headline: report.summary && typeof report.summary === "object" && !Array.isArray(report.summary)
        ? (report.summary as Record<string, unknown>).headline ?? null
        : null,
      executiveSummary: report.executiveSummary ?? null,
      counts: report.counts ?? null,
      agentInterpretation: report.agentInterpretation ?? null
    },
    findings,
    findingsMetadata: {
      shown: findings.length,
      total: Array.isArray(input.findings.findings) ? input.findings.findings.length : 0,
      truncated: Array.isArray(input.findings.findings) && input.findings.findings.length > findings.length
    },
    ...(detail === "evidence" || detail === "full" ? { evidenceSummary: {
      evidenceSafetyNotes: evidence.evidenceSafetyNotes ?? null,
      projectionDiagnostics: evidence.projectionDiagnostics ?? null,
      projectedFindings: compactEvidenceValue(evidence.projectedFindings ?? [], {
        arrayItems: maxFindings,
        depth: 5,
        objectKeys: 40,
        stringChars: 1_000
      }),
      coverageDiagnostics: compactEvidenceValue(evidence.coverageDiagnostics ?? null, {
        arrayItems: 20,
        depth: 5,
        objectKeys: 40,
        stringChars: 1_000
      }),
      policySurfaceCoverage: compactEvidenceValue(evidence.policySurfaceCoverage ?? null, {
        arrayItems: 20,
        depth: 5,
        objectKeys: 40,
        stringChars: 1_000
      })
    } } : {}),
    ...(detail === "full" ? {
      fullReport: compactEvidenceValue(report, {
        arrayItems: 50,
        depth: 8,
        objectKeys: 100,
        stringChars: 4_000
      })
    } : {}),
    ...(input.preConsentCookiesTrackers ? { preConsentCookiesTrackers: {
      summary: input.preConsentCookiesTrackers.summary,
      rows: preConsentRows,
      shown: preConsentRows.length,
      total: Array.isArray(input.preConsentCookiesTrackers.rows) ? input.preConsentCookiesTrackers.rows.length : 0,
      truncated: Array.isArray(input.preConsentCookiesTrackers.rows) && input.preConsentCookiesTrackers.rows.length > preConsentRows.length
    } } : {}),
    links,
    reportUrl: input.scan.links?.report ?? (typeof links.report === "string" ? links.report : null),
    recommendedNextTool: null,
    recommendedNextAction: findings.length > 0
      ? "Review the returned findings and follow their evidence links. Use detail=evidence only when deeper retained context is needed."
      : "Review coverage and limitations before interpreting the absence of findings.",
    mcpMetadata: {
      detail,
      heavyEvidenceIncluded: detail === "evidence" || detail === "full",
      findingsTruncated: Array.isArray(input.findings.findings) && input.findings.findings.length > findings.length,
      requestedMaxBytes: maxBytes,
      actualBytes: 0,
      truncated: false,
      truncationReason: null
    },
    disclaimer: input.scan.disclaimer ?? input.report.disclaimer ?? null
  };

  updateBundleActualBytes(bundle);
  while (bundle.mcpMetadata.actualBytes > maxBytes && bundle.findings.length > 1) {
    bundle.findings.pop();
    bundle.findingsMetadata.shown = bundle.findings.length;
    bundle.findingsMetadata.truncated = true;
    bundle.mcpMetadata.findingsTruncated = true;
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "findings_reduced_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  const inventoryRows = bundle.preConsentCookiesTrackers?.rows;
  while (bundle.mcpMetadata.actualBytes > maxBytes && Array.isArray(inventoryRows) && inventoryRows.length > 0) {
    inventoryRows.pop();
    bundle.preConsentCookiesTrackers.shown = inventoryRows.length;
    bundle.preConsentCookiesTrackers.truncated = true;
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "evidence_inventory_reduced_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.fullReport) {
    delete bundle.fullReport;
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "full_report_omitted_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.evidenceSummary) {
    delete bundle.evidenceSummary;
    bundle.mcpMetadata.heavyEvidenceIncluded = false;
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "evidence_summary_omitted_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    bundle.summary = compactEvidenceValue(bundle.summary, {
      arrayItems: 8,
      depth: 4,
      objectKeys: 20,
      stringChars: 500
    });
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "summary_compacted_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    bundle.findings = [];
    bundle.findingsMetadata.shown = 0;
    bundle.findingsMetadata.truncated = bundle.findingsMetadata.total > 0;
    delete bundle.preConsentCookiesTrackers;
    bundle.coverage = compactEvidenceValue(bundle.coverage, {
      arrayItems: 4,
      depth: 3,
      objectKeys: 12,
      stringChars: 300
    });
    bundle.mcpMetadata.findingsTruncated = bundle.findingsMetadata.total > 0;
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason = "findings_and_inventory_omitted_to_byte_limit";
    updateBundleActualBytes(bundle);
  }
  updateBundleActualBytes(bundle);
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    const minimal: Record<string, any> = {
      type: bundle.type,
      scanId: bundle.scanId,
      domain: bundle.domain,
      url: bundle.url,
      status: bundle.status,
      score: bundle.score,
      scoreStatus: bundle.scoreStatus,
      scoreVersion: bundle.scoreVersion,
      scoreUpdatedAt: bundle.scoreUpdatedAt,
      riskLevel: bundle.riskLevel,
      resultDisposition: bundle.resultDisposition,
      noGo: bundle.noGo,
      coverage: null,
      timing: bundle.timing,
      summary: {
        headline: bundle.summary?.headline ?? null,
        executiveSummary: null,
        counts: bundle.summary?.counts ?? null,
        agentInterpretation: null
      },
      findings: [],
      findingsMetadata: {
        shown: 0,
        total: bundle.findingsMetadata.total,
        truncated: bundle.findingsMetadata.total > 0
      },
      links: Object.fromEntries(Object.entries(bundle.links ?? {}).filter(([key]) => ["docs", "report", "self"].includes(key))),
      reportUrl: bundle.reportUrl,
      recommendedNextTool: null,
      recommendedNextAction: "The response reached the requested byte limit. Increase maxBytes or follow the report link for more detail.",
      mcpMetadata: {
        detail,
        heavyEvidenceIncluded: false,
        findingsTruncated: bundle.findingsMetadata.total > 0,
        requestedMaxBytes: maxBytes,
        actualBytes: 0,
        truncated: true,
        truncationReason: "minimal_canonical_result_returned_to_byte_limit"
      },
      disclaimer: bundle.disclaimer
    };
    updateBundleActualBytes(minimal);
    return minimal;
  }

  return bundle;
}

export function explainFinding(report: PulseResult, findingId: string) {
  const finding = findingsFromReport(report).find((candidate) => candidate.id === findingId);
  if (!finding) {
    return {
      type: "certscore_mcp_finding_explanation",
      scanId: scanIdFromPulse(report),
      findingId,
      found: false,
      message: "Finding was not present in this Pulse report.",
      availableFindingIds: findingsFromReport(report).map((candidate) => candidate.id),
      disclaimer: report.disclaimer ?? null
    };
  }
  return {
    type: "certscore_mcp_finding_explanation",
    scanId: scanIdFromPulse(report),
    findingId,
    found: true,
    label: finding.label ?? finding.id,
    criticality: finding.criticality ?? null,
    confidence: finding.confidence ?? null,
    plainEnglish: finding.plainEnglish ?? null,
    evidenceSummary: finding.evidence?.summary ?? null,
    evidenceDigest: finding.evidenceDigest ?? null,
    exampleEvents: finding.evidence?.exampleEvents ?? [],
    reviewLenses: finding.reviewLenses ?? [],
    anchorUrl: finding.anchorUrl ?? finding.evidence?.fullEvidenceUrl ?? null,
    nextStep: finding.nextStep ?? null,
    resultDisposition: report.resultDisposition ?? null,
    noGo: report.noGo ?? null,
    caveats: report.coverage?.limitations ?? [],
    disclaimer: report.disclaimer ?? null
  };
}
