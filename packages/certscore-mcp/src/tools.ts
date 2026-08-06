import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CertScoreError, type FindingList, type JobStatus, type PreConsentCookiesTrackers, type PulseDetail, type PulseFormat, type PulseResult, type ScanResource, type TopFinding } from "@certscore/sdk";

const MAX_ERROR_RESPONSE_BODY_CHARS = 2_000;
export const MAX_EVIDENCE_PACKET_CHARS = 250_000;
const EVIDENCE_STRING_CHARS = 4_000;
const EVIDENCE_ARRAY_ITEMS = 40;
const EVIDENCE_OBJECT_KEYS = 80;
const OBSERVATION_ONLY_DISCLAIMER = "Observation only: no-go, not-observed, and limited-coverage results are not proof of compliance.";

type ActionableError = {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds: number | null;
  recommendedNextAction: string;
  field?: string;
  mcpCode?: number;
};

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
  const status = error instanceof CertScoreError ? error.status : undefined;
  const retryable = typeof terminalError?.retryable === "boolean"
    ? terminalError.retryable
    : status === 429 || (typeof status === "number" && status >= 500);
  const retryAfterSeconds = typeof terminalError?.retryAfterSeconds === "number"
    ? terminalError.retryAfterSeconds
    : error instanceof CertScoreError && "retryAfterSeconds" in error && typeof error.retryAfterSeconds === "number"
      ? error.retryAfterSeconds
      : retryable
        ? 30
        : null;
  const code = error instanceof CertScoreError ? error.code : "internal_error";
  const message = error instanceof Error ? error.message : "Unknown CertScore MCP error.";
  const recommendedNextAction = typeof terminalError?.recommendedNextAction === "string"
    ? terminalError.recommendedNextAction
    : retryable
      ? `Wait ${retryAfterSeconds ?? 30} seconds, then retry the same request. Stop and contact CertScore support if the error repeats.`
      : "Correct the request using the error details, then retry only if the requested operation is still appropriate.";
  const payload = {
    error: {
      code,
      message,
      retryable,
      retryAfterSeconds,
      recommendedNextAction,
      ...(error instanceof CertScoreError ? {
        name: error.name,
        status: error.status,
        responseBody: truncateErrorResponseBody(error.responseBody)
      } : {})
    }
  };

  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true
  };
}

export function toInvalidArgumentsToolError(errorMessage: string): CallToolResult {
  const tool = errorMessage.match(/tool ([a-z_]+)/i)?.[1] ?? null;
  const field = errorMessage.match(/\bat ([a-zA-Z0-9_.-]+)/)?.[1]
    ?? (errorMessage.includes("url") ? "url" : errorMessage.includes("scanId") ? "scanId" : null);
  const missing = /required|expected string, received undefined/i.test(errorMessage);
  const message = field
    ? missing
      ? `The ${field} field is required.`
      : `The ${field} field is invalid.`
    : `The arguments for ${tool ?? "this tool"} are invalid.`;
  const recommendedNextAction = field === "url"
    ? "Provide a public URL or domain."
    : field === "scanId"
      ? "Provide the stable scanId returned by scan_site."
      : "Correct the named fields using the tool input schema, then retry.";
  const error: ActionableError = {
    code: "invalid_arguments",
    message,
    ...(field ? { field } : {}),
    retryable: false,
    retryAfterSeconds: null,
    recommendedNextAction,
    mcpCode: -32602
  };
  const payload = tool === "scan_site"
    ? {
        type: "certscore_tool_error",
        status: "invalid_arguments",
        error,
        recommendedNextTool: null,
        recommendedNextAction,
        observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER
      }
    : { error };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(tool === "scan_site" ? { structuredContent: payload } : {}),
    isError: true
  };
}

function terminalErrorForResult(value: Record<string, any>): ActionableError | null {
  const existing = value.error && typeof value.error === "object" && !Array.isArray(value.error)
    ? value.error as Record<string, unknown>
    : null;
  if (existing) {
    const retryable = existing.retryable === true;
    return {
      code: typeof existing.code === "string" ? existing.code : String(value.status ?? "scan_failed"),
      message: typeof existing.message === "string" ? existing.message : "The scan did not produce a canonical result.",
      retryable,
      retryAfterSeconds: typeof existing.retryAfterSeconds === "number" ? existing.retryAfterSeconds : retryable ? 30 : null,
      recommendedNextAction: typeof existing.recommendedNextAction === "string"
        ? existing.recommendedNextAction
        : retryable
          ? "Wait for the recommended delay, then retry scan_site with freshness=refresh."
          : "Stop and review the scan limitations before deciding whether to change the URL."
    };
  }
  if (value.status === "completed_limited" && value.noGo) {
    const retryable = value.noGo.retryLikelyToHelp === true;
    return {
      code: typeof value.noGo.reasonCode === "string" ? value.noGo.reasonCode : "completed_limited",
      message: typeof value.noGo.explanation === "string" ? value.noGo.explanation : "The scan completed with a no-go limitation.",
      retryable,
      retryAfterSeconds: retryable ? 30 : null,
      recommendedNextAction: typeof value.noGo.recommendedNextAction === "string"
        ? value.noGo.recommendedNextAction
        : "Review the retained limitation and change the URL or site state before retrying."
    };
  }
  const fallback: Record<string, ActionableError> = {
    failed: {
      code: "scanner_runtime_failure",
      message: "The scan ended before a canonical result could be produced.",
      retryable: true,
      retryAfterSeconds: 30,
      recommendedNextAction: "Wait 30 seconds, then retry scan_site with freshness=refresh. Stop if the failure repeats."
    },
    expired: {
      code: "scan_expired",
      message: "The scan expired before a canonical result was available.",
      retryable: true,
      retryAfterSeconds: 30,
      recommendedNextAction: "Wait 30 seconds, then retry scan_site with freshness=refresh."
    },
    rate_limited: {
      code: "rate_limited",
      message: "The scan is rate limited.",
      retryable: true,
      retryAfterSeconds: typeof value.retryAfterSeconds === "number" ? value.retryAfterSeconds : 30,
      recommendedNextAction: "Wait for the recommended delay, then retry the same scan_site request."
    }
  };
  return fallback[String(value.status)] ?? null;
}

export function withMcpAgentGuidance<T extends Record<string, any>>(value: T): T & {
  error: ActionableError | null;
  observationOnlyDisclaimer: string;
} {
  const status = String(value.status ?? "");
  const active = status === "queued" || status === "running" || status === "finalizing";
  const usable = status === "completed" || status === "completed_limited";
  const error = terminalErrorForResult(value);
  return {
    ...value,
    error,
    recommendedNextTool: active ? "get_scan_status" : usable ? "get_scan_bundle" : null,
    recommendedNextAction: error?.recommendedNextAction ?? value.recommendedNextAction ?? (active
      ? `Poll get_scan_status with scanId ${value.scanId ?? value.jobId} after the recommended delay.`
      : usable
        ? `Call get_scan_bundle with scanId ${value.scanId ?? value.jobId} for the canonical findings and limitations.`
        : "Review the result and retained limitations."),
    observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER
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

function boundedText(value: unknown, maxChars: number) {
  if (typeof value !== "string") {
    return value;
  }
  return value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value;
}

function compactBundleFinding(finding: Record<string, any>) {
  const evidence = finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
    ? finding.evidence as Record<string, unknown>
    : {};
  return {
    type: finding.type,
    id: finding.id,
    scanId: finding.scanId,
    label: boundedText(finding.label, 140),
    criticality: finding.criticality,
    confidence: finding.confidence,
    plainEnglish: boundedText(finding.plainEnglish, 280),
    ...(finding.resultDisposition ? { resultDisposition: finding.resultDisposition } : {}),
    ...(finding.noGo ? { noGo: finding.noGo } : {}),
    reviewLenses: Array.isArray(finding.reviewLenses) ? finding.reviewLenses.slice(0, 2) : [],
    evidence: {
      basis: evidence.basis,
      summary: boundedText(evidence.summary, 220),
      ...(evidence.phase !== undefined ? { phase: evidence.phase } : {}),
      exampleCount: evidence.exampleCount,
      examplesShown: evidence.examplesShown,
      ...(evidence.hasTimingAnchor !== undefined ? { hasTimingAnchor: evidence.hasTimingAnchor } : {}),
      ...(evidence.hasVendorAnchor !== undefined ? { hasVendorAnchor: evidence.hasVendorAnchor } : {}),
      ...(evidence.hasConsentContext !== undefined ? { hasConsentContext: evidence.hasConsentContext } : {}),
      ...(evidence.hasPolicyAnchor !== undefined ? { hasPolicyAnchor: evidence.hasPolicyAnchor } : {})
    },
    ...(finding.nextStep !== undefined ? { nextStep: boundedText(finding.nextStep, 180) } : {})
  };
}

function compactPriorityEvidenceSummary(summary: Record<string, any>) {
  const firstDigest = Array.isArray(summary.digests) ? summary.digests[0] : null;
  const firstReference = summary.references && typeof summary.references === "object" && !Array.isArray(summary.references)
    ? Object.entries(summary.references).find(([, value]) => typeof value === "string")
    : null;
  return {
    digests: firstDigest ? [{
      findingId: firstDigest.findingId,
      basis: firstDigest.basis ?? null,
      summary: boundedText(firstDigest.summary, 180) ?? null,
      phase: firstDigest.phase ?? null,
      evidenceUrl: firstDigest.evidenceUrl ?? firstReference?.[1] ?? null
    }] : [],
    evidenceAvailable: summary.evidenceAvailable === true,
    evidenceSafetyNotes: [],
    references: firstDigest ? {} : firstReference ? { [firstReference[0]]: firstReference[1] } : {}
  };
}

function bundleEvidenceSummary(
  evidence: Record<string, unknown>,
  findings: Record<string, any>[],
  links: Record<string, unknown>,
  includeDiagnostics: boolean
) {
  const digests = findings.slice(0, 3).map((finding) => {
    const findingEvidence = finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
      ? finding.evidence as Record<string, unknown>
      : {};
    return {
      findingId: finding.id,
      basis: findingEvidence.basis ?? null,
      summary: boundedText(findingEvidence.summary, 500) ?? null,
      phase: findingEvidence.phase ?? null,
      evidenceUrl: findingEvidence.excerpt && typeof findingEvidence.excerpt === "object" && !Array.isArray(findingEvidence.excerpt)
        ? (findingEvidence.excerpt as Record<string, unknown>).evidenceUrl ?? null
        : typeof links.findings === "string"
          ? links.findings
          : typeof links.report === "string"
            ? links.report
            : null
    };
  });
  return {
    digests,
    evidenceAvailable: digests.length > 0 || Object.keys(evidence).length > 0,
    evidenceSafetyNotes: Array.isArray(evidence.evidenceSafetyNotes)
      ? evidence.evidenceSafetyNotes.slice(0, 3).map((note) => boundedText(note, 300))
      : [],
    references: Object.fromEntries(Object.entries(links).filter(([key, value]) => ["findings", "pulse", "report", "preConsentCookiesTrackers"].includes(key) && typeof value === "string")),
    ...(includeDiagnostics ? {
      projectionDiagnostics: compactEvidenceValue(evidence.projectionDiagnostics ?? null, {
        arrayItems: 12,
        depth: 4,
        objectKeys: 24,
        stringChars: 600
      }),
      coverageDiagnostics: compactEvidenceValue(evidence.coverageDiagnostics ?? null, {
        arrayItems: 12,
        depth: 4,
        objectKeys: 24,
        stringChars: 600
      }),
      policySurfaceCoverage: compactEvidenceValue(evidence.policySurfaceCoverage ?? null, {
        arrayItems: 12,
        depth: 4,
        objectKeys: 24,
        stringChars: 600
      })
    } : {})
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
  report: PulseResult | null;
  scan: ScanResource;
}) {
  const detail = input.detail ?? "summary";
  const maxFindings = Math.min(50, Math.max(1, input.maxFindings ?? (detail === "summary" ? 5 : 20)));
  const maxPreConsentRows = Math.min(50, Math.max(1, input.maxPreConsentRows ?? 20));
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const report = (input.report ?? {}) as Record<string, unknown>;
  const allFindings = Array.isArray(input.findings.findings) ? input.findings.findings : [];
  const findings = detail === "summary"
    ? []
    : allFindings.slice(0, maxFindings).map((finding) => detail === "full" ? finding : compactBundleFinding(finding));
  const preConsentRows = Array.isArray(input.preConsentCookiesTrackers?.rows)
    ? input.preConsentCookiesTrackers.rows.slice(0, maxPreConsentRows)
    : [];
  const links: Record<string, unknown> = {
    ...(input.scan.links ?? {}),
    ...(report.links && typeof report.links === "object" && !Array.isArray(report.links) ? report.links : {})
  };
  const maxBytes = Math.min(200_000, Math.max(5_000, input.maxBytes ?? 50_000));
  const contentUrls = Object.fromEntries(Object.entries({
    report: input.scan.links?.report ?? links.report,
    findings: links.findings,
    evidence: links.pulse,
    preConsentCookiesTrackers: links.preConsentCookiesTrackers
  }).filter(([, value]) => typeof value === "string"));
  const intentionallyOmitted = new Set<string>();
  if (detail === "summary" && allFindings.length > 0) intentionallyOmitted.add("findings");
  if ((detail === "summary" || detail === "findings") && (Object.keys(evidence).length > 0 || allFindings.length > 0)) intentionallyOmitted.add("evidence");
  if (detail !== "full" && Object.keys(report).length > 0) intentionallyOmitted.add("fullReport");
  const guidedScan = withMcpAgentGuidance(input.scan as unknown as Record<string, any>);
  const bundle: Record<string, any> = {
    type: "certscore_scan_bundle",
    detail,
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
    createdAt: input.scan.createdAt ?? null,
    startedAt: input.scan.startedAt ?? null,
    completedAt: input.scan.completedAt ?? null,
    scanTimeSeconds: input.scan.scanTimeSeconds ?? null,
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
      total: allFindings.length,
      truncated: allFindings.length > findings.length
    },
    ...(detail === "evidence" || detail === "full"
      ? { evidenceSummary: bundleEvidenceSummary(evidence, allFindings, links, detail === "full") }
      : {}),
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
    recommendedNextAction: guidedScan.error?.recommendedNextAction ?? (detail === "summary" && allFindings.length > 0
      ? "Review this overview, then request detail=findings for bounded finding objects or open the report URL."
      : findings.length > 0
        ? "Review the returned findings and follow their evidence references. Use detail=evidence only when deeper retained context is needed."
        : "Review coverage and limitations before interpreting the absence of findings."),
    error: guidedScan.error,
    mcpMetadata: {
      detail,
      heavyEvidenceIncluded: detail === "evidence" || detail === "full",
      findingsTruncated: allFindings.length > findings.length,
      requestedMaxBytes: maxBytes,
      actualBytes: 0,
      truncated: false,
      truncationReason: null,
      omittedSections: [...intentionallyOmitted],
      nextRecommendedMaxBytes: null,
      omittedContentAvailableViaUrl: intentionallyOmitted.size > 0 && Object.keys(contentUrls).length > 0,
      contentUrls
    },
    observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER,
    disclaimer: input.scan.disclaimer ?? input.report?.disclaimer ?? OBSERVATION_ONLY_DISCLAIMER
  };

  const recommendationCandidates: number[] = [];
  const markBudgetOmitted = (section: string, reason: string, requiredBytes = bundle.mcpMetadata.actualBytes) => {
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason ??= reason;
    if (!bundle.mcpMetadata.omittedSections.includes(section)) {
      bundle.mcpMetadata.omittedSections.push(section);
    }
    recommendationCandidates.push(requiredBytes);
    bundle.mcpMetadata.omittedContentAvailableViaUrl = Object.keys(contentUrls).length > 0;
  };
  const refresh = () => updateBundleActualBytes(bundle);

  refresh();
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.fullReport) {
    markBudgetOmitted("fullReport", "full_report_omitted_to_byte_limit");
    delete bundle.fullReport;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && detail === "full" && bundle.evidenceSummary) {
    const compactSummary = bundleEvidenceSummary(evidence, allFindings, links, false);
    markBudgetOmitted("evidenceDiagnostics", "evidence_diagnostics_omitted_to_byte_limit");
    bundle.evidenceSummary = compactSummary;
    refresh();
  }
  const inventoryRows = bundle.preConsentCookiesTrackers?.rows;
  while (bundle.mcpMetadata.actualBytes > maxBytes && Array.isArray(inventoryRows) && inventoryRows.length > 0) {
    markBudgetOmitted("preConsentCookiesTrackers", "evidence_inventory_reduced_to_byte_limit");
    inventoryRows.pop();
    bundle.preConsentCookiesTrackers.shown = inventoryRows.length;
    bundle.preConsentCookiesTrackers.truncated = true;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.preConsentCookiesTrackers) {
    markBudgetOmitted("preConsentCookiesTrackers", "evidence_inventory_omitted_to_byte_limit");
    delete bundle.preConsentCookiesTrackers;
    refresh();
  }
  while (bundle.mcpMetadata.actualBytes > maxBytes && bundle.findings.length > 1) {
    markBudgetOmitted("additionalFindings", "findings_reduced_to_byte_limit");
    bundle.findings.pop();
    bundle.findingsMetadata.shown = bundle.findings.length;
    bundle.findingsMetadata.truncated = true;
    bundle.mcpMetadata.findingsTruncated = true;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    markBudgetOmitted("summaryDetail", "summary_compacted_to_byte_limit");
    bundle.summary = {
      headline: boundedText(bundle.summary?.headline, 240) ?? null,
      executiveSummary: null,
      counts: bundle.summary?.counts ? { totalAutomatedFindingCount: bundle.findingsMetadata.total } : null,
      agentInterpretation: null
    };
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    markBudgetOmitted("coverageDetail", "coverage_compacted_to_byte_limit");
    bundle.coverage = compactEvidenceValue(bundle.coverage, {
      arrayItems: 3,
      depth: 3,
      objectKeys: 8,
      stringChars: 240
    });
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.links) {
    markBudgetOmitted("additionalLinks", "links_compacted_to_byte_limit");
    bundle.links = Object.fromEntries(Object.entries(bundle.links).filter(([key]) => ["self", "report"].includes(key)));
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.evidenceSummary) {
    markBudgetOmitted("evidenceDetail", "evidence_compacted_to_preserve_priority_content");
    bundle.evidenceSummary = compactPriorityEvidenceSummary(bundle.evidenceSummary);
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.disclaimer === OBSERVATION_ONLY_DISCLAIMER) {
    markBudgetOmitted("duplicateDisclaimer", "duplicate_disclaimer_omitted_to_byte_limit");
    bundle.disclaimer = null;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.findings.length > 0) {
    markBudgetOmitted("findings", "finding_omitted_to_byte_limit");
    bundle.findings = [];
    bundle.findingsMetadata.shown = 0;
    bundle.findingsMetadata.truncated = bundle.findingsMetadata.total > 0;
    bundle.mcpMetadata.findingsTruncated = bundle.findingsMetadata.total > 0;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.evidenceSummary) {
    markBudgetOmitted("evidence", "evidence_digest_omitted_to_byte_limit");
    delete bundle.evidenceSummary;
    bundle.mcpMetadata.heavyEvidenceIncluded = false;
    refresh();
  }
  if (bundle.mcpMetadata.truncated) {
    const required = Math.min(...recommendationCandidates.filter((value) => Number.isFinite(value) && value > maxBytes));
    bundle.mcpMetadata.nextRecommendedMaxBytes = Math.min(200_000, Math.max(maxBytes + 1_000, Math.ceil((Number.isFinite(required) ? required : maxBytes + 1_000) / 1_000) * 1_000));
    bundle.recommendedNextAction = `Retry with maxBytes=${bundle.mcpMetadata.nextRecommendedMaxBytes} or open ${bundle.reportUrl ? "the report URL" : "an available content URL"}.`;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    const minimal: Record<string, any> = {
      type: bundle.type,
      detail: bundle.detail,
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
      createdAt: bundle.createdAt,
      startedAt: bundle.startedAt,
      completedAt: bundle.completedAt,
      scanTimeSeconds: bundle.scanTimeSeconds,
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
      recommendedNextAction: bundle.recommendedNextAction,
      error: bundle.error,
      mcpMetadata: {
        detail,
        heavyEvidenceIncluded: false,
        findingsTruncated: bundle.findingsMetadata.total > 0,
        requestedMaxBytes: maxBytes,
        actualBytes: 0,
        truncated: true,
        truncationReason: "minimal_canonical_result_returned_to_byte_limit",
        omittedSections: [...new Set([...bundle.mcpMetadata.omittedSections, "summaryDetail", "findings", "evidence"])],
        nextRecommendedMaxBytes: bundle.mcpMetadata.nextRecommendedMaxBytes ?? Math.min(200_000, maxBytes + 1_000),
        omittedContentAvailableViaUrl: Object.keys(contentUrls).length > 0,
        contentUrls
      },
      observationOnlyDisclaimer: bundle.observationOnlyDisclaimer,
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
