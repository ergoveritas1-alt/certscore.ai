import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CertScoreError, type JobStatus, type PulseDetail, type PulseFormat, type PulseResult, type TopFinding } from "@certscore/sdk";

export function toToolResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ]
  };
}

export function toToolError(error: unknown): CallToolResult {
  if (error instanceof CertScoreError) {
    return toToolResult({
      error: {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
        retryAfterSeconds: "retryAfterSeconds" in error ? error.retryAfterSeconds : undefined,
        responseBody: error.responseBody
      }
    });
  }
  return toToolResult({
    error: {
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Unknown CertScore MCP error."
    }
  });
}

export function normalizeDetail(detail: PulseDetail | undefined): PulseDetail {
  return detail ?? "standard";
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
