import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CertScoreError, type JobStatus, type PulseDetail, type PulseFormat, type PulseResult, type TopFinding } from "@certscore/sdk";

const MAX_ERROR_RESPONSE_BODY_CHARS = 2_000;
export const MAX_EVIDENCE_PACKET_CHARS = 250_000;
const EVIDENCE_STRING_CHARS = 4_000;
const EVIDENCE_ARRAY_ITEMS = 40;
const EVIDENCE_OBJECT_KEYS = 80;

export function toToolResult(payload: unknown): CallToolResult {
  const structuredContent = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { value: payload };
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload)
      }
    ]
  };
}

export function toToolError(error: unknown): CallToolResult {
  if (error instanceof CertScoreError) {
    return {
      ...toToolResult({
        error: {
          name: error.name,
          message: error.message,
          status: error.status,
          code: error.code,
          retryAfterSeconds: "retryAfterSeconds" in error ? error.retryAfterSeconds : undefined,
          responseBody: truncateErrorResponseBody(error.responseBody)
        }
      }),
      isError: true
    };
  }
  return {
    ...toToolResult({
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : "Unknown CertScore MCP error."
      }
    }),
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
    caveats: report.coverage?.limitations ?? [],
    disclaimer: report.disclaimer ?? null
  };
}
