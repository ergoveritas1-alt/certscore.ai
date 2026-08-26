import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CertScoreError, type FindingList, type JobStatus, type PreConsentCookiesTrackers, type PulseDetail, type PulseFormat, type PulseResult, type ScanResource, type TopFinding } from "@certscore/sdk";

const MAX_ERROR_RESPONSE_BODY_CHARS = 2_000;
export const MAX_EVIDENCE_PACKET_CHARS = 250_000;
const EVIDENCE_STRING_CHARS = 4_000;
const EVIDENCE_ARRAY_ITEMS = 40;
const EVIDENCE_OBJECT_KEYS = 80;
const MAX_TOOL_TEXT_CHARS = 8_000;
const LEGAL_REVIEW_DISCLAIMER = "CertScore results are automated public-web observations for human and agentic review, not legal advice, certification, or a compliance determination.";
const SCAN_PROVENANCE_GROUNDING = "retrievalMode describes how the current tool response obtained the scan; creationDecision describes whether the original scan request created or reused a scan only when that decision is retained. Never infer an unknown creationDecision from scan_id_lookup. For a reused or retrieved existing scan, use only persisted scanFrom and timestamps. Never infer its original scan region from the current request, the user's location, or a default execution region. If persisted region or timestamps are unavailable, report them as unavailable.";
const INTERPRETATION_STATEMENT = "The CertScore score covers observable public-web scan signals only. Do not infer technologies that are not listed in the returned evidence or any legal compliance status.";
const SCAN_BUNDLE_RESPONSE_CONTRACT = `Response contract: Report only observed CertScore evidence and CertScore classifications. criticality, priority, and confidence are CertScore metadata; regulatory review lenses are non-determinative CertScore review context—not legal severity, legal exposure, or a compliance determination. Absence of captured consent-action evidence does not establish what happens after Accept, Reject, or Decline. Do not extrapolate an observed embed, vendor, or request into unobserved cookies, fingerprinting, tracking, or processing, and do not infer violations or compliance beyond what CertScore observed. ${SCAN_PROVENANCE_GROUNDING}`;
const SCAN_BUNDLE_INTERPRETATION_STATEMENT = "Report only observed CertScore evidence and persisted CertScore classifications. Without corresponding captured post-action evidence, do not infer what Accept, Reject, Decline, or another consent action would do; say the scan does not establish what happens after that action. Do not speculate that an observed embed, vendor, or request may cause additional cookies, fingerprinting, tracking, or processing unless CertScore observed that behavior. Treat returned priority or severity as a CertScore classification, not regulatory criticality or legal exposure; prefer ‘observed privacy risk signal’ or ‘CertScore finding’. Do not infer unobserved technologies, legal compliance, or a legal violation from scores or findings.";
const COMPACT_SCAN_BUNDLE_INTERPRETATION_STATEMENT = "Use only returned CertScore observations and classifications. Do not infer unobserved technologies, post-consent behavior, legal compliance, or violations. Treat priority and severity as CertScore metadata.";
const OBSERVATION_ONLY_DISCLAIMER = `${LEGAL_REVIEW_DISCLAIMER} No-go, not-observed, and limited-coverage results are not proof of compliance.`;
const COMPACT_OBSERVATION_ONLY_DISCLAIMER = "Automated public-web observation, not legal advice or a compliance determination; missing or limited evidence is not proof of compliance.";

type ScanProvenanceMode = "new_scan_started" | "existing_completed_scan_reused" | "existing_scan_retrieved" | "unknown";
type ScanRetrievalMode = "creation_response" | "scan_id_lookup" | "unknown";
type ScanCreationDecision = "new_scan" | "reused_scan" | "unknown";

function interpretationGuidance(statement = INTERPRETATION_STATEMENT) {
  return {
    scoreLabel: "CertScore score" as const,
    observableSignalsOnly: true as const,
    doNotInferUnobservedTechnologies: true as const,
    doNotInferLegalComplianceStatus: true as const,
    statement
  };
}

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
  const score = typeof record.score === "number" ? `; CertScore score=${record.score}` : "";
  const recordLinks = record.links && typeof record.links === "object" && !Array.isArray(record.links)
    ? record.links as Record<string, unknown>
    : null;
  const stableScanId = typeof record.scanId === "string" && record.scanId.trim()
    ? record.scanId.trim()
    : typeof record.scan_id === "string" && record.scan_id.trim()
      ? record.scan_id.trim()
      : null;
  const reportUrl = typeof record.reportUrl === "string" && record.reportUrl.trim()
    ? record.reportUrl.trim()
    : typeof recordLinks?.report === "string" && recordLinks.report.trim()
      ? recordLinks.report.trim()
      : stableScanId
        ? `https://certscore.ai/scan/${encodeURIComponent(stableScanId)}`
        : null;
  const report = reportUrl ? `; full report=${reportUrl}` : "";
  const provenanceRecord = record.provenance && typeof record.provenance === "object" && !Array.isArray(record.provenance)
    ? record.provenance as Record<string, unknown>
    : null;
  const retrieval = typeof provenanceRecord?.retrievalMode === "string" ? `; retrieval=${provenanceRecord.retrievalMode}` : "";
  const creation = typeof provenanceRecord?.creationDecision === "string" ? `; creation=${provenanceRecord.creationDecision}` : "";
  const provenance = retrieval || creation
    ? `${retrieval}${creation}`
    : typeof provenanceRecord?.mode === "string"
      ? `; provenance=${provenanceRecord.mode}`
      : "";
  return `CertScore ${type}${status}${scanId}${score}${provenance}${report}. Full result is in structuredContent.`;
}

export function toToolResult(payload: unknown, text?: string): CallToolResult {
  const structuredContent = payload !== null && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : { value: payload };
  return {
    structuredContent,
    content: [
      {
        type: "text",
        text: text ?? toolResultSummary(payload)
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
      ? "Provide the stable scanId returned by certscore_scan_site."
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
  const payload = tool === "certscore_scan_site"
    ? {
        type: "certscore_tool_error",
        status: "invalid_arguments",
        error,
        scoreLabel: "CertScore score",
        provenance: scanProvenance({}, "unknown"),
        interpretationGuidance: interpretationGuidance(),
        recommendedNextTool: null,
        recommendedNextAction,
        observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER
      }
    : { error };
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    ...(tool === "certscore_scan_site" ? { structuredContent: payload } : {}),
    isError: true
  };
}

export function toInvalidScanIdToolError(): CallToolResult {
  const error: ActionableError = {
    code: "invalid_scan_id",
    field: "scanId",
    message: "The scanId must be the canonical UUID returned by certscore_scan_site.",
    retryable: false,
    retryAfterSeconds: null,
    recommendedNextAction: "Use the unchanged scanId returned by certscore_scan_site. Do not use placeholders, report URLs, domains, or job IDs.",
    mcpCode: -32602
  };
  return {
    content: [{ type: "text", text: JSON.stringify({ error }) }],
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
          ? "Wait for the recommended delay, then retry certscore_scan_site with freshness=refresh."
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
      recommendedNextAction: "Wait 30 seconds, then retry certscore_scan_site with freshness=refresh. Stop if the failure repeats."
    },
    expired: {
      code: "scan_expired",
      message: "The scan expired before a canonical result was available.",
      retryable: true,
      retryAfterSeconds: 30,
      recommendedNextAction: "Wait 30 seconds, then retry certscore_scan_site with freshness=refresh."
    },
    rate_limited: {
      code: "rate_limited",
      message: "The scan is rate limited.",
      retryable: true,
      retryAfterSeconds: typeof value.retryAfterSeconds === "number" ? value.retryAfterSeconds : 30,
      recommendedNextAction: "Wait for the recommended delay, then retry the same certscore_scan_site request."
    }
  };
  return fallback[String(value.status)] ?? null;
}

function scanProvenance(value: Record<string, any>, fallbackMode: ScanProvenanceMode): {
  mode: ScanProvenanceMode;
  retrievalMode: ScanRetrievalMode;
  creationDecision: ScanCreationDecision;
  scanAgeSeconds: number | null;
  executionMode: "new_scan" | "reused_scan" | null;
  reused: boolean | null;
  freshnessDecision: string | null;
} {
  const executionMode = value.executionMode === "new_scan" || value.executionMode === "reused_scan"
    ? value.executionMode
    : null;
  const reused = typeof value.reused === "boolean" ? value.reused : executionMode === "reused_scan" ? true : executionMode === "new_scan" ? false : null;
  const mode = executionMode === "new_scan"
    ? "new_scan_started"
    : executionMode === "reused_scan" || reused === true
      ? "existing_completed_scan_reused"
      : fallbackMode;
  const retrievalMode = fallbackMode === "existing_scan_retrieved"
    ? "scan_id_lookup"
    : executionMode !== null || reused !== null
      ? "creation_response"
      : "unknown";
  const creationDecision = executionMode === "new_scan" || reused === false
    ? "new_scan"
    : executionMode === "reused_scan" || reused === true
      ? "reused_scan"
      : "unknown";
  const retainedAgeSeconds = typeof value.reusedScanAgeSeconds === "number" && Number.isFinite(value.reusedScanAgeSeconds) && value.reusedScanAgeSeconds >= 0
    ? Math.floor(value.reusedScanAgeSeconds)
    : null;
  const completedAtMs = typeof value.completedAt === "string" ? Date.parse(value.completedAt) : Number.NaN;
  const completedAgeSeconds = Number.isFinite(completedAtMs)
    ? Math.max(0, Math.floor((Date.now() - completedAtMs) / 1_000))
    : null;
  const scanAgeSeconds = retrievalMode === "creation_response"
    ? retainedAgeSeconds ?? completedAgeSeconds
    : completedAgeSeconds;
  return {
    mode,
    retrievalMode,
    creationDecision,
    scanAgeSeconds,
    executionMode,
    reused,
    freshnessDecision: typeof value.freshnessDecision === "string" ? value.freshnessDecision : null
  };
}

export function withMcpAgentGuidance<T extends Record<string, any>>(value: T, fallbackProvenanceMode: ScanProvenanceMode = "unknown"): T & {
  error: ActionableError | null;
  observationOnlyDisclaimer: string;
} {
  const status = String(value.status ?? "");
  const active = status === "queued" || status === "running" || status === "finalizing";
  const usable = status === "completed" || status === "completed_limited";
  const error = terminalErrorForResult(value);
  const stableScanId = typeof value.scanId === "string" && value.scanId.trim()
    ? value.scanId.trim()
    : typeof value.scan_id === "string" && value.scan_id.trim()
      ? value.scan_id.trim()
      : null;
  const reportUrl = typeof value.reportUrl === "string" && value.reportUrl.trim()
    ? value.reportUrl.trim()
    : typeof value.links?.report === "string" && value.links.report.trim()
      ? value.links.report.trim()
      : stableScanId
        ? `https://certscore.ai/scan/${encodeURIComponent(stableScanId)}`
        : null;
  return {
    ...value,
    error,
    reportUrl,
    scoreLabel: "CertScore score",
    provenance: scanProvenance(value, fallbackProvenanceMode),
    interpretationGuidance: interpretationGuidance(),
    recommendedNextTool: active ? "certscore_get_scan_status" : usable ? "certscore_get_scan_bundle" : null,
    recommendedNextAction: error?.recommendedNextAction ?? value.recommendedNextAction ?? (active
      ? `Poll certscore_get_scan_status with scanId ${value.scanId ?? value.jobId} after the recommended delay.`
      : usable
        ? `Call certscore_get_scan_bundle with scanId ${value.scanId ?? value.jobId} for the canonical findings and limitations.`
        : "Review the result and retained limitations."),
    observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER
  };
}

export function withMcpScanProvenanceGuidance(value: Record<string, any>, fallbackProvenanceMode: ScanProvenanceMode) {
  const guided = withMcpAgentGuidance(value, fallbackProvenanceMode);
  return {
    ...guided,
    interpretationGuidance: interpretationGuidance(`${INTERPRETATION_STATEMENT} ${SCAN_PROVENANCE_GROUNDING}`)
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
  if (value.length <= maxChars) {
    return value;
  }
  const marker = "…[truncated]";
  const contentLimit = Math.max(1, maxChars - marker.length);
  const candidate = value.slice(0, contentLimit);
  const boundary = candidate.search(/\s+\S*$/);
  const bounded = boundary >= Math.floor(contentLimit * 0.6)
    ? candidate.slice(0, boundary)
    : candidate;
  return `${bounded.trimEnd()}${marker}`;
}

function compactFindingLink(finding: Record<string, any>) {
  const self = typeof finding.links?.self === "string" && finding.links.self.trim()
    ? finding.links.self.trim()
    : typeof finding.evidence?.excerpt?.evidenceUrl === "string" && finding.evidence.excerpt.evidenceUrl.trim()
      ? finding.evidence.excerpt.evidenceUrl.trim()
      : null;
  return self ? { self: self.slice(0, 2_048) } : undefined;
}

function withoutFindingDisclaimer(finding: Record<string, any>) {
  const { disclaimer: _disclaimer, ...rest } = finding;
  return rest;
}

function compactBundleFinding(finding: Record<string, any>, tier: "standard" | "core" = "standard") {
  const evidence = finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
    ? finding.evidence as Record<string, unknown>
    : {};
  const core = tier === "core";
  const links = compactFindingLink(finding);
  if (core) {
    const compactNextStep = typeof finding.nextStep === "string" && finding.nextStep.trim().length <= 64
      ? finding.nextStep.trim()
      : null;
    return {
      type: finding.type,
      id: finding.id,
      label: boundedText(finding.label, 140),
      criticality: finding.criticality,
      confidence: finding.confidence,
      plainEnglish: boundedText(finding.plainEnglish, 180),
      ...(compactNextStep ? { nextStep: compactNextStep } : {}),
      evidenceUrl: links?.self ?? null
    };
  }
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
    ...(finding.nextStep !== undefined ? { nextStep: boundedText(finding.nextStep, 180) } : {}),
    ...(links ? { links } : {})
  };
}

function deduplicatedFullReport(input: {
  findings: Record<string, any>[];
  report: Record<string, unknown>;
  transportSecurity: Record<string, unknown>;
}) {
  const report = input.report;
  const residual = { ...report };
  const deduplicatedSections: string[] = [];
  const returnedFindings = new Map(input.findings.flatMap((finding) => typeof finding.id === "string" ? [[finding.id, finding] as const] : []));
  for (const key of ["findings", "topFindings"] as const) {
    const section = residual[key];
    const sectionFindingIds = Array.isArray(section)
      ? section.flatMap((finding) => finding && typeof finding === "object" && typeof (finding as Record<string, unknown>).id === "string"
        ? [(finding as Record<string, unknown>).id as string]
        : [])
      : [];
    const coveredByCanonicalProjection = sectionFindingIds.every((id) => {
      const finding = returnedFindings.get(id);
      return finding
        && typeof finding.plainEnglish === "string"
        && typeof finding.evidence?.summary === "string"
        && compactFindingLink(finding) !== undefined;
    });
    if (Array.isArray(section) && sectionFindingIds.length === section.length && coveredByCanonicalProjection) {
      delete residual[key];
      deduplicatedSections.push(`fullReport.${key}`);
    }
  }
  if ("transportSecurity" in residual && JSON.stringify(residual.transportSecurity) === JSON.stringify(input.transportSecurity)) {
    delete residual.transportSecurity;
    deduplicatedSections.push("fullReport.transportSecurity");
  }
  return { deduplicatedSections, residual };
}

function distinctSummaryFindings(findings: Record<string, any>[]) {
  const labels = new Set<string>();
  return findings.filter((finding) => {
    const key = typeof finding.label === "string" && finding.label.trim().length > 0
      ? finding.label.trim().toLocaleLowerCase()
      : typeof finding.id === "string"
        ? finding.id
        : JSON.stringify(finding);
    if (labels.has(key)) return false;
    labels.add(key);
    return true;
  });
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
  const reportedTotal = payload.summary && typeof payload.summary === "object" && !Array.isArray(payload.summary)
    && Number.isInteger((payload.summary as Record<string, unknown>).rowCount)
    ? Number((payload.summary as Record<string, unknown>).rowCount)
    : 0;
  const total = Math.max(rows.length, reportedTotal);
  const returnedRows = rows.slice(0, maxRows);
  const truncated = total > returnedRows.length;
  return {
    ...payload,
    rows: returnedRows,
    evidenceMetadata: {
      total,
      returned: returnedRows.length,
      truncated
    },
    summary: {
      ...(payload.summary && typeof payload.summary === "object" && !Array.isArray(payload.summary) ? payload.summary : {}),
      totalRowCount: total,
      truncated
    }
  } as T;
}

function uniqueBoundedStrings(values: unknown[], maxItems: number, maxChars: number) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0).map((value) => value.slice(0, maxChars)))].slice(0, maxItems);
}

function compactPreConsentRow(row: Record<string, any>) {
  const cookieDetails = Array.isArray(row.cookieDetails) ? row.cookieDetails : [];
  const domains = uniqueBoundedStrings([
    ...(Array.isArray(row.domains) ? row.domains : []),
    row.host,
    row.registrableDomain
  ], 12, 253);
  const purposes = Array.isArray(row.purposes) ? row.purposes : [];
  return {
    id: String(row.id ?? `${row.kind ?? "unknown"}:${row.name ?? row.vendor ?? row.host ?? "observed-item"}`).slice(0, 512),
    kind: ["cookie", "tracker", "request", "storage"].includes(row.kind) ? row.kind : "unknown",
    name: String(row.name ?? row.vendor ?? row.host ?? "Observed item").slice(0, 256),
    cookieNames: uniqueBoundedStrings(cookieDetails.map((cookie) => cookie && typeof cookie === "object" ? cookie.name : null), 24, 256),
    vendor: typeof row.vendor === "string" ? row.vendor.slice(0, 160) : null,
    purpose: typeof row.purpose === "string" ? row.purpose.slice(0, 160) : typeof purposes[0] === "string" ? purposes[0].slice(0, 160) : null,
    category: typeof row.category === "string" ? row.category.slice(0, 160) : null,
    confidence: ["high", "medium", "low"].includes(row.confidence) ? row.confidence : "unknown",
    firstObservedAtMs: Number.isInteger(row.firstObservedAtMs) && row.firstObservedAtMs >= 0 ? row.firstObservedAtMs : null,
    domains,
    requestCount: Number.isInteger(row.requestCount) && row.requestCount >= 0 ? row.requestCount : null,
    evidenceClassification: {
      basis: "public_report_projection",
      phase: "pre_consent",
      observedBeforeConsent: row.observedBeforeConsent !== false,
      party: ["first_party", "third_party", "mixed"].includes(row.party) ? row.party : "unknown",
      priority: ["high", "medium", "review_needed", "contextual"].includes(row.priority) ? row.priority : "unknown"
    }
  };
}

function preConsentBundleSection(payload: PreConsentCookiesTrackers, maxRows: number) {
  const sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
  const total = Math.max(sourceRows.length, Number.isInteger(payload.summary?.rowCount) ? payload.summary.rowCount : 0);
  const rows = sourceRows.slice(0, maxRows).map((row) => compactPreConsentRow(row as Record<string, any>));
  return {
    summary: {
      rowCount: total,
      trackerCount: Number.isInteger(payload.summary?.trackerCount) ? payload.summary.trackerCount : 0,
      cookieCount: Number.isInteger(payload.summary?.cookieCount) ? payload.summary.cookieCount : 0,
      requestCount: Number.isInteger(payload.summary?.requestCount) ? payload.summary.requestCount : 0,
      vendorCount: Number.isInteger(payload.summary?.vendorCount) ? payload.summary.vendorCount : 0,
      domainCount: Number.isInteger(payload.summary?.domainCount) ? payload.summary.domainCount : 0
    },
    rows,
    total,
    returned: rows.length,
    truncated: total > rows.length
  };
}

function neutralExecutiveSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const summary = value as Record<string, any>;
  const score = typeof summary.score === "number" ? summary.score : null;
  const scoreMetadata = summary.scoreMetadata && typeof summary.scoreMetadata === "object" && !Array.isArray(summary.scoreMetadata)
    ? { ...summary.scoreMetadata, metricLabel: "CertScore score" }
    : summary.scoreMetadata;
  const trackerFootprint = summary.trackerFootprint && typeof summary.trackerFootprint === "object" && !Array.isArray(summary.trackerFootprint)
    ? Object.fromEntries(Object.entries(summary.trackerFootprint).filter(([, entry]) => typeof entry === "number" || entry === null))
    : undefined;
  const policySurfaces = Array.isArray(summary.policySurfaces)
    ? summary.policySurfaces.slice(0, 5).flatMap((surface: unknown) => {
        if (!surface || typeof surface !== "object" || Array.isArray(surface)) return [];
        const row = surface as Record<string, unknown>;
        return [{
          type: boundedText(row.type, 80),
          title: boundedText(row.title, 160),
          url: boundedText(row.url, 2_048)
        }];
      })
    : undefined;
  return {
    completionSummary: boundedText(summary.completionSummary, 280),
    domain: boundedText(summary.domain, 253),
    score,
    scoreLabel: score === null ? "CertScore score" : `CertScore score: ${score}/100`,
    ...(scoreMetadata ? { scoreMetadata } : {}),
    riskLevel: summary.riskLevel,
    actionLabel: summary.actionLabel,
    issuesToReview: summary.issuesToReview,
    thirdPartyRequests: summary.thirdPartyRequests,
    trackingClassifiedThirdPartyRequests: summary.trackingClassifiedThirdPartyRequests,
    cookiesPreConsent: summary.cookiesPreConsent,
    nonEssentialPreConsentStorage: summary.nonEssentialPreConsentStorage,
    unclassifiedPreConsentStorageCount: summary.unclassifiedPreConsentStorageCount,
    storageMetricLabel: boundedText(summary.storageMetricLabel, 120),
    storageMetricScope: boundedText(summary.storageMetricScope, 120),
    storageMetricStatus: boundedText(summary.storageMetricStatus, 120),
    storageMetricExplanation: boundedText(summary.storageMetricExplanation, 280),
    consentPlatform: boundedText(summary.consentPlatform, 160),
    ...(trackerFootprint ? { trackerFootprint } : {}),
    ...(policySurfaces ? { policySurfaces } : {}),
    scanTimeSeconds: summary.scanTimeSeconds
  };
}

function findingText(finding: Record<string, any>, priorityLabel = "criticality") {
  const evidence = finding.evidence && typeof finding.evidence === "object" && !Array.isArray(finding.evidence)
    ? finding.evidence as Record<string, unknown>
    : {};
  const lenses = Array.isArray(finding.reviewLenses) && finding.reviewLenses.length > 0
    ? finding.reviewLenses.slice(0, 2).join(", ")
    : "not classified";
  const nextStep = typeof finding.nextStep === "string" && finding.nextStep.trim()
    ? `; canonical next step=${boundedText(finding.nextStep.trim(), 180)}`
    : "";
  return `- ${finding.label ?? finding.id ?? "Projected finding"}; ${priorityLabel}=${finding.criticality ?? "unknown"}; confidence=${finding.confidence ?? "unknown"}; observation=${finding.plainEnglish ?? evidence.summary ?? "No compact description available"}; evidence=${evidence.basis ?? "unknown"}/${evidence.phase ?? "phase unknown"}: ${evidence.summary ?? "No compact evidence summary available"}; review lenses=${lenses}${nextStep}.`;
}

function executiveOverviewText(summary: Record<string, any> | null | undefined) {
  if (!summary) return null;
  const tracker = summary.trackerFootprint && typeof summary.trackerFootprint === "object" && !Array.isArray(summary.trackerFootprint)
    ? summary.trackerFootprint as Record<string, unknown>
    : {};
  const policies = Array.isArray(summary.policySurfaces)
    ? summary.policySurfaces.flatMap((surface: unknown) => {
        if (!surface || typeof surface !== "object" || Array.isArray(surface)) return [];
        const row = surface as Record<string, unknown>;
        return typeof row.title === "string" ? [row.title] : typeof row.type === "string" ? [row.type] : [];
      }).slice(0, 5)
    : [];
  const values = [
    `CMP/consent platform=${summary.consentPlatform ?? "not returned"}`,
    `third-party requests=${summary.thirdPartyRequests ?? "unknown"}`,
    `non-essential pre-consent storage=${summary.nonEssentialPreConsentStorage ?? summary.cookiesPreConsent ?? "unknown"}`,
    `tracker vendors=${tracker.vendors ?? "unknown"}`,
    `tracker domains=${tracker.domains ?? "unknown"}`,
    `policy surfaces=${policies.length > 0 ? policies.join(", ") : "none returned"}`
  ];
  return `Canonical report overview: ${values.join("; ")}.`;
}

function preConsentRowText(row: Record<string, any>, priorityLabel = "priority") {
  const cookieNames = Array.isArray(row.cookieNames) && row.cookieNames.length > 0
    ? `; cookies=${row.cookieNames.slice(0, 8).join(", ")}${row.cookieNames.length > 8 ? ", …" : ""}`
    : "";
  const domains = Array.isArray(row.domains) && row.domains.length > 0
    ? `; domains=${row.domains.slice(0, 4).join(", ")}${row.domains.length > 4 ? ", …" : ""}`
    : "";
  const timing = typeof row.firstObservedAtMs === "number" ? `${(row.firstObservedAtMs / 1_000).toFixed(3)}s` : "unknown";
  const classification = row.evidenceClassification && typeof row.evidenceClassification === "object"
    ? row.evidenceClassification as Record<string, unknown>
    : {};
  return `- ${row.kind}: ${row.name}${cookieNames}; vendor=${row.vendor ?? "unknown"}; purpose=${row.purpose ?? "unknown"}; category=${row.category ?? "unknown"}; first observed=${timing}${domains}; evidence=${classification.basis ?? "unknown"}/${classification.phase ?? "unknown"}/${classification.party ?? "unknown"}; observedBeforeConsent=${classification.observedBeforeConsent ?? "unknown"}; ${priorityLabel}=${classification.priority ?? "unknown"}; confidence=${row.confidence ?? "unknown"}.`;
}

function reportUrlFor(value: Record<string, any>) {
  const scanId = extractScanId(value);
  return typeof value.reportUrl === "string" && value.reportUrl.trim()
    ? value.reportUrl.trim()
    : typeof value.links?.report === "string" && value.links.report.trim()
      ? value.links.report.trim()
      : scanId
        ? `https://certscore.ai/scan/${encodeURIComponent(scanId)}`
        : null;
}

function canonicalScanProvenanceText(value: Record<string, any>) {
  const present = (field: unknown) => typeof field === "string" && field.trim() ? field.trim() : "unavailable";
  const numeric = (field: unknown) => typeof field === "number" && Number.isFinite(field) ? String(field) : "unavailable";
  return `Canonical scan provenance: scanId=${present(extractScanId(value))}; scanFrom/execution region=${present(value.scanFrom)}; completedAt=${present(value.completedAt)}; startedAt=${present(value.startedAt)}; createdAt=${present(value.createdAt)}; retrieval mode=${present(value.provenance?.retrievalMode)}; original creation decision=${present(value.provenance?.creationDecision)}; scan age seconds=${numeric(value.provenance?.scanAgeSeconds)}; compatibility provenance mode=${present(value.provenance?.mode)}.`;
}

export function scanStatusText(value: Record<string, any>) {
  const reportUrl = reportUrlFor(value);
  return [
    `CertScore scan status: status=${value.status ?? "unknown"}.`,
    canonicalScanProvenanceText(value),
    `Full report: ${reportUrl ?? "not available"}.`,
    OBSERVATION_ONLY_DISCLAIMER,
    INTERPRETATION_STATEMENT,
    SCAN_PROVENANCE_GROUNDING
  ].join("\n");
}

function boundedResultText(header: string, bodyLines: string[], value: Record<string, any>) {
  const footer = [OBSERVATION_ONLY_DISCLAIMER, INTERPRETATION_STATEMENT];
  const reportUrl = reportUrlFor(value);
  const lines = [
    header,
    `Provenance: retrieval=${value.provenance?.retrievalMode ?? "unknown"}; original creation=${value.provenance?.creationDecision ?? "unknown"}; scan age seconds=${value.provenance?.scanAgeSeconds ?? "unavailable"}.`,
    `Full report: ${reportUrl ?? "not available"}.`
  ];
  let rendered = 0;
  for (const line of bodyLines) {
    if ([...lines, line, ...footer].join("\n").length > MAX_TOOL_TEXT_CHARS) break;
    lines.push(line);
    rendered += 1;
  }
  if (rendered < bodyLines.length) {
    const omitted = `${bodyLines.length - rendered} additional returned row${bodyLines.length - rendered === 1 ? " was" : "s were"} omitted from TextContent to preserve the size limit; use structuredContent or the report URL.`;
    if ([...lines, omitted, ...footer].join("\n").length <= MAX_TOOL_TEXT_CHARS) lines.push(omitted);
  }
  lines.push(...footer);
  return lines.join("\n");
}

export function findingListText(value: Record<string, any>, label = "Canonical projected findings") {
  const findings = Array.isArray(value.findings) ? value.findings : [];
  const pagination = value.pagination && typeof value.pagination === "object" && !Array.isArray(value.pagination)
    ? value.pagination as Record<string, unknown>
    : {};
  const total = typeof pagination.total === "number" ? pagination.total : findings.length;
  const returned = typeof pagination.returned === "number" ? pagination.returned : findings.length;
  const truncated = pagination.truncated === true;
  const scanId = extractScanId(value) ?? "unknown";
  return boundedResultText(
    `${label} for scanId=${scanId}: ${returned} of ${total} returned${truncated ? " (truncated)" : ""}. These are canonical projected review signals, not MCP-derived findings.`,
    findings.map((finding) => findingText(finding as Record<string, any>)),
    value
  );
}

export function preConsentInventoryText(value: Record<string, any>) {
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const metadata = value.evidenceMetadata && typeof value.evidenceMetadata === "object" && !Array.isArray(value.evidenceMetadata)
    ? value.evidenceMetadata as Record<string, unknown>
    : {};
  const total = typeof metadata.total === "number"
    ? metadata.total
    : typeof value.summary?.totalRowCount === "number"
      ? value.summary.totalRowCount
      : typeof value.summary?.rowCount === "number"
        ? value.summary.rowCount
        : rows.length;
  const returned = typeof metadata.returned === "number" ? metadata.returned : rows.length;
  const truncated = metadata.truncated === true || value.summary?.truncated === true;
  const scanId = extractScanId(value) ?? "unknown";
  const domain = typeof value.domain === "string" ? value.domain : "unknown domain";
  return boundedResultText(
    `Pre-consent cookie/tracker evidence for ${domain}; scanId=${scanId}; ${returned} of ${total} rows returned${truncated ? " (truncated)" : ""}. Enumerate only these observed rows.`,
    rows.map((row) => preConsentRowText(compactPreConsentRow(row as Record<string, any>))),
    value
  );
}

export function pulseReportText(value: Record<string, any>, label = "CertScore report") {
  const scanId = extractScanId(value) ?? "unknown";
  const domain = typeof value.domain === "string" ? value.domain : "unknown domain";
  const score = typeof value.summary?.score === "number"
    ? value.summary.score
    : typeof value.score === "number"
      ? value.score
      : null;
  const findings = findingsFromReport(value as PulseResult);
  const overview = executiveOverviewText(value.executiveSummary ?? value.summary?.executiveSummary);
  const body = [
    ...(overview ? [overview] : []),
    `Canonical projected findings returned in this ${label.toLocaleLowerCase()}: ${findings.length}.`,
    ...findings.map((finding) => findingText(finding as Record<string, any>))
  ];
  return boundedResultText(
    `${label} for ${domain}; scanId=${scanId}${score === null ? "" : `; CertScore score=${score}`}.`,
    body,
    value
  );
}

export function markdownReportText(value: Record<string, any>) {
  const markdown = typeof value.value === "string" ? value.value : "";
  const excerptLimit = Math.max(0, MAX_TOOL_TEXT_CHARS - 1_500);
  const excerpt = markdown.length > excerptLimit ? `${markdown.slice(0, excerptLimit)}\n…[markdown truncated for MCP TextContent]` : markdown;
  return boundedResultText(
    `CertScore report for scanId=${extractScanId(value) ?? "unknown"}. The following is a bounded canonical report excerpt.`,
    excerpt ? [excerpt] : ["No Markdown report body was returned."],
    value
  );
}

export function scanBundleText(bundle: Record<string, any>) {
  const score = typeof bundle.score === "number" ? `; CertScore score=${bundle.score}` : "";
  const footer = [OBSERVATION_ONLY_DISCLAIMER, SCAN_BUNDLE_INTERPRETATION_STATEMENT];
  const lines = [
    SCAN_BUNDLE_RESPONSE_CONTRACT,
    `CertScore scan bundle for ${bundle.domain ?? "unknown domain"}; status=${bundle.status ?? "unknown"}${score}; scanId=${bundle.scanId ?? "unknown"}.`,
    canonicalScanProvenanceText(bundle),
    `Full report: ${bundle.reportUrl ?? (bundle.scanId ? `https://certscore.ai/scan/${encodeURIComponent(String(bundle.scanId))}` : "not available")}.`
  ];
  const canAppend = (line: string) => [...lines, line, ...footer].join("\n").length <= MAX_TOOL_TEXT_CHARS;
  const append = (line: string) => {
    if (!canAppend(line)) return false;
    lines.push(line);
    return true;
  };
  const coverage = bundle.coverage && typeof bundle.coverage === "object" && !Array.isArray(bundle.coverage)
    ? bundle.coverage as Record<string, unknown>
    : null;
  if (coverage) {
    append(`Coverage: status=${coverage.status ?? "unknown"}; ${coverage.summary ?? "Review limitations before interpreting absence."}`);
  }
  const overview = executiveOverviewText(bundle.summary?.executiveSummary);
  if (overview) append(overview);

  const transportSecurity = bundle.transportSecurity && typeof bundle.transportSecurity === "object" && !Array.isArray(bundle.transportSecurity)
    ? bundle.transportSecurity as Record<string, any>
    : null;
  if (transportSecurity) {
    const counts = transportSecurity.observationCounts && typeof transportSecurity.observationCounts === "object"
      ? transportSecurity.observationCounts as Record<string, unknown>
      : {};
    append(`Transport security: status=${transportSecurity.status ?? "unavailable"}; retained evidence=${transportSecurity.evidenceRetained === true ? "yes" : "no"}; canonical observations=${counts.total ?? 0}; concerns/review=${counts.concernOrReview ?? 0}; unavailable=${counts.unavailable ?? 0}.`);
    for (const observation of Array.isArray(transportSecurity.observations) ? transportSecurity.observations : []) {
      append(`Transport observation: ${observation.label ?? observation.id ?? "unknown"}; status=${observation.status ?? "unknown"}; ${observation.summary ?? "Review the structured transport evidence."}`);
    }
    for (const limitation of Array.isArray(transportSecurity.limitations) ? transportSecurity.limitations.slice(0, 3) : []) {
      append(`Transport limitation: ${limitation}`);
    }
  }

  const findings = Array.isArray(bundle.findings) ? bundle.findings : [];
  const findingTotal = bundle.findingsMetadata?.total ?? findings.length;
  const findingReturned = bundle.findingsMetadata?.returned ?? bundle.findingsMetadata?.shown ?? findings.length;
  append(`Canonical projected findings: ${findingReturned} of ${findingTotal} returned${bundle.findingsMetadata?.truncated ? " (truncated)" : ""}. These are already-projected review signals, not inferred technologies or legal conclusions.`);
  let findingsRendered = 0;
  for (const [index, finding] of findings.entries()) {
    const next = findingText(finding, "CertScore priority/classification");
    const remaining = findings.length - index - 1;
    const reserve = remaining > 0
      ? `${remaining} additional returned finding${remaining === 1 ? " was" : "s were"} omitted from TextContent to preserve the size limit; see structuredContent or the report URL.`
      : null;
    if ([...lines, next, ...(reserve ? [reserve] : []), ...footer].join("\n").length > MAX_TOOL_TEXT_CHARS) break;
    lines.push(next);
    findingsRendered += 1;
  }
  if (findingsRendered < findings.length) {
    append(`${findings.length - findingsRendered} additional returned finding${findings.length - findingsRendered === 1 ? " was" : "s were"} omitted from TextContent to preserve the size limit; see structuredContent or the report URL.`);
  }

  const inventory = bundle.preConsentCookiesTrackers;
  if (inventory && typeof inventory === "object") {
    append(`Pre-consent cookie/tracker evidence: ${inventory.returned ?? 0} of ${inventory.total ?? 0} rows returned${inventory.truncated ? " (truncated)" : ""}.`);
    const rows = Array.isArray(inventory.rows) ? inventory.rows : [];
    let rowsRendered = 0;
    for (const [index, row] of rows.entries()) {
      const next = preConsentRowText(row, "CertScore priority");
      const remaining = rows.length - index - 1;
      const reserve = remaining > 0
        ? `${remaining} additional returned pre-consent row${remaining === 1 ? " was" : "s were"} omitted from TextContent to preserve the size limit; see structuredContent or the report URL.`
        : null;
      if ([...lines, next, ...(reserve ? [reserve] : []), ...footer].join("\n").length > MAX_TOOL_TEXT_CHARS) break;
      lines.push(next);
      rowsRendered += 1;
    }
    if (rowsRendered < rows.length) {
      append(`${rows.length - rowsRendered} additional returned pre-consent row${rows.length - rowsRendered === 1 ? " was" : "s were"} omitted from TextContent to preserve the size limit; see structuredContent or the report URL.`);
    }
  } else {
    append("No row-level pre-consent inventory was available for this result; review coverage and limitations before interpreting absence.");
  }
  lines.push(...footer);
  return lines.join("\n");
}

function scanBundleTransportSecurity(report: Record<string, unknown>, detail: "summary" | "findings" | "evidence" | "full") {
  const source = report.transportSecurity && typeof report.transportSecurity === "object" && !Array.isArray(report.transportSecurity)
    ? report.transportSecurity as Record<string, unknown>
    : null;
  if (!source) {
    return {
      status: "unavailable" as const,
      evidenceRetained: false,
      observationCounts: {
        total: 0,
        observedPositive: 0,
        concernOrReview: 0,
        notObserved: 0,
        unavailable: 0
      },
      observations: [],
      limitations: [
        "No canonical transport-security projection was available in this scan response. Do not infer a positive transport result."
      ]
    };
  }

  const observations = Array.isArray(source.observations) ? source.observations : [];
  const compactObservations = observations.slice(0, 8).map((observation) => {
    const row = observation && typeof observation === "object" && !Array.isArray(observation)
      ? observation as Record<string, unknown>
      : {};
    return {
      id: row.id,
      label: boundedText(row.label, 140),
      status: row.status,
      assessmentStatus: row.assessmentStatus,
      evidenceState: row.evidenceState,
      summary: boundedText(row.summary, 180),
      evidenceRefs: []
    };
  });
  return {
    status: source.status === "available" || source.status === "limited" ? source.status : "unavailable",
    evidenceRetained: source.evidenceRetained === true,
    observationCounts: source.observationCounts && typeof source.observationCounts === "object" && !Array.isArray(source.observationCounts)
      ? source.observationCounts
      : {
          total: observations.length,
          observedPositive: 0,
          concernOrReview: 0,
          notObserved: 0,
          unavailable: observations.length
        },
    observations: detail === "summary" || detail === "findings"
      ? compactObservations
      : observations.map((observation) => compactEvidenceValue(observation, {
          arrayItems: 6,
          depth: 4,
          objectKeys: 12,
          stringChars: 1_200
        })),
    limitations: Array.isArray(source.limitations)
      ? source.limitations.filter((value): value is string => typeof value === "string").slice(0, 8)
      : [],
    ...(detail === "full" && source.retainedSummary && typeof source.retainedSummary === "object" && !Array.isArray(source.retainedSummary)
      ? {
          retainedSummary: compactEvidenceValue(source.retainedSummary, {
            arrayItems: 20,
            depth: 4,
            objectKeys: 24,
            stringChars: 1_200
          })
        }
      : {})
  };
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
  requestedMaxBytes?: number;
  responseCeilingBytes?: number;
  scan: ScanResource;
}) {
  const detail = input.detail ?? "summary";
  const maxFindings = Math.min(50, Math.max(1, input.maxFindings ?? (detail === "summary" ? 5 : 20)));
  const maxPreConsentRows = Math.min(50, Math.max(1, input.maxPreConsentRows ?? 20));
  const evidence = (input.evidence ?? {}) as Record<string, unknown>;
  const report = (input.report ?? {}) as Record<string, unknown>;
  const transportSecurity = scanBundleTransportSecurity(report, detail);
  const allFindings = Array.isArray(input.findings.findings) ? input.findings.findings : [];
  const selectedFindings = detail === "summary" ? distinctSummaryFindings(allFindings) : allFindings;
  const selectedFindingRows = selectedFindings.slice(0, maxFindings);
  const findingDisclaimersDeduplicated = detail === "full"
    && selectedFindingRows.some((finding) => typeof finding.disclaimer === "string");
  const findings = selectedFindingRows
    .map((finding) => detail === "full" ? withoutFindingDisclaimer(finding) : compactBundleFinding(finding));
  const deduplicatedReport = deduplicatedFullReport({ findings, report, transportSecurity });
  const preConsentCookiesTrackers = input.preConsentCookiesTrackers
    ? preConsentBundleSection(input.preConsentCookiesTrackers, maxPreConsentRows)
    : null;
  const links: Record<string, unknown> = {
    ...(input.scan.links ?? {}),
    ...(report.links && typeof report.links === "object" && !Array.isArray(report.links) ? report.links : {})
  };
  const requestedMaxBytes = Math.min(200_000, Math.max(5_000, input.requestedMaxBytes ?? input.maxBytes ?? 50_000));
  const responseCeilingBytes = Math.min(200_000, Math.max(5_000, input.responseCeilingBytes ?? 200_000));
  const maxBytes = Math.min(requestedMaxBytes, responseCeilingBytes);
  const contentUrls = Object.fromEntries(Object.entries({
    report: input.scan.links?.report ?? links.report,
    findings: links.findings,
    evidence: links.pulse,
    preConsentCookiesTrackers: links.preConsentCookiesTrackers
  }).filter(([, value]) => typeof value === "string"));
  const intentionallyOmitted = new Set<string>();
  if (allFindings.length > findings.length) intentionallyOmitted.add("additionalFindings");
  if ((detail === "summary" || detail === "findings") && (Object.keys(evidence).length > 0 || allFindings.length > 0)) intentionallyOmitted.add("evidence");
  if (detail !== "full" && Object.keys(report).length > 0) intentionallyOmitted.add("fullReport");
  const guidedScan = withMcpAgentGuidance(input.scan as unknown as Record<string, any>);
  const bundle: Record<string, any> = {
    type: "certscore_scan_bundle",
    detail,
    scanId: input.scan.scanId,
    domain: input.scan.domain,
    url: input.scan.url ?? null,
    scanFrom: input.scan.scanFrom ?? null,
    status: input.scan.status,
    score: input.scan.score ?? null,
    scoreLabel: "CertScore score",
    scoreStatus: input.scan.scoreStatus ?? "final",
    scoreVersion: input.scan.scoreVersion ?? null,
    scoreUpdatedAt: input.scan.scoreUpdatedAt ?? null,
    riskLevel: input.scan.riskLevel ?? null,
    provenance: scanProvenance(input.scan as unknown as Record<string, any>, "existing_scan_retrieved"),
    interpretationGuidance: interpretationGuidance(SCAN_BUNDLE_INTERPRETATION_STATEMENT),
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
      executiveSummary: neutralExecutiveSummary(report.executiveSummary),
      counts: report.counts ?? null,
      agentInterpretation: report.agentInterpretation ?? null
    },
    findings,
    findingsMetadata: {
      shown: findings.length,
      returned: findings.length,
      total: allFindings.length,
      truncated: allFindings.length > findings.length
    },
    transportSecurity,
    ...(detail === "evidence" || detail === "full"
      ? { evidenceSummary: bundleEvidenceSummary(evidence, allFindings, links, detail === "full") }
      : {}),
    ...(detail === "full" ? {
      fullReport: compactEvidenceValue(deduplicatedReport.residual, {
        arrayItems: 50,
        depth: 8,
        objectKeys: 100,
        stringChars: 4_000
      })
    } : {}),
    ...(preConsentCookiesTrackers ? { preConsentCookiesTrackers } : {}),
    links,
    reportUrl: input.scan.links?.report ?? (typeof links.report === "string" ? links.report : `https://certscore.ai/scan/${encodeURIComponent(input.scan.scanId)}`),
    recommendedNextTool: null,
    recommendedNextAction: guidedScan.error?.recommendedNextAction ?? (detail === "summary" && allFindings.length > findings.length
      ? "Review the returned overview and findings, then request detail=findings or a larger maxFindings value for more projected findings."
      : findings.length > 0
        ? "Review the returned findings and follow their evidence references. Use detail=evidence only when deeper retained context is needed."
        : "Review coverage and limitations before interpreting the absence of findings."),
    error: guidedScan.error,
    mcpMetadata: {
      detail,
      heavyEvidenceIncluded: detail === "evidence" || detail === "full",
      findingsTruncated: allFindings.length > findings.length,
      requestedMaxBytes,
      effectiveMaxBytes: maxBytes,
      responseCeilingBytes,
      responseBudgetClamped: requestedMaxBytes > maxBytes,
      actualBytes: 0,
      fullPayloadBytes: 0,
      truncated: false,
      truncationReason: null,
      omittedSections: [...intentionallyOmitted],
      deduplicatedSections: detail === "full"
        ? [
            ...deduplicatedReport.deduplicatedSections,
            ...(findingDisclaimersDeduplicated ? ["findings[].disclaimer"] : [])
          ]
        : [],
      nextRecommendedMaxBytes: null,
      omittedContentAvailableViaUrl: intentionallyOmitted.size > 0 && Object.keys(contentUrls).length > 0,
      contentUrls
    },
    observationOnlyDisclaimer: OBSERVATION_ONLY_DISCLAIMER,
    disclaimer: LEGAL_REVIEW_DISCLAIMER
  };

  const markBudgetOmitted = (section: string, reason: string) => {
    bundle.mcpMetadata.truncated = true;
    bundle.mcpMetadata.truncationReason ??= reason;
    if (!bundle.mcpMetadata.omittedSections.includes(section)) {
      bundle.mcpMetadata.omittedSections.push(section);
    }
    bundle.mcpMetadata.omittedContentAvailableViaUrl = Object.keys(contentUrls).length > 0;
  };
  const refresh = () => updateBundleActualBytes(bundle);
  const captureFullPayloadBytes = () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      refresh();
      const measured = bundle.mcpMetadata.actualBytes;
      if (bundle.mcpMetadata.fullPayloadBytes === measured) break;
      bundle.mcpMetadata.fullPayloadBytes = measured;
    }
    refresh();
  };
  const refreshTruncationGuidance = () => {
    const completeBytes = bundle.mcpMetadata.fullPayloadBytes;
    bundle.mcpMetadata.nextRecommendedMaxBytes = completeBytes <= responseCeilingBytes
      ? Math.max(5_000, Math.ceil(completeBytes / 1_000) * 1_000)
      : null;
    bundle.recommendedNextAction = bundle.mcpMetadata.nextRecommendedMaxBytes
      ? `Retry with maxBytes=${bundle.mcpMetadata.nextRecommendedMaxBytes} to retrieve the complete requested tier, or open ${bundle.reportUrl ? "the report URL" : "an available content URL"}.`
      : `The complete requested tier exceeds the MCP byte ceiling; open ${bundle.reportUrl ? "the report URL" : "an available content URL"}.`;
    refresh();
  };

  captureFullPayloadBytes();
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
  if (
    bundle.mcpMetadata.actualBytes > maxBytes &&
    (bundle.transportSecurity?.observations?.length > 0 || bundle.transportSecurity?.retainedSummary)
  ) {
    markBudgetOmitted("transportSecurityDetail", "transport_security_detail_omitted_to_byte_limit");
    bundle.transportSecurity = {
      status: bundle.transportSecurity.status,
      evidenceRetained: bundle.transportSecurity.evidenceRetained,
      observationCounts: bundle.transportSecurity.observationCounts,
      observations: [],
      limitations: bundle.transportSecurity.limitations
    };
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.findings.length > 0) {
    markBudgetOmitted("findingDetail", "findings_compacted_to_preserve_core_rows");
    bundle.findings = bundle.findings.map((finding: Record<string, any>) => compactBundleFinding(finding, "core"));
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
  if (bundle.mcpMetadata.actualBytes > maxBytes) {
    markBudgetOmitted("duplicateGuidance", "guidance_compacted_to_preserve_priority_content");
    bundle.interpretationGuidance = interpretationGuidance(COMPACT_SCAN_BUNDLE_INTERPRETATION_STATEMENT);
    bundle.observationOnlyDisclaimer = COMPACT_OBSERVATION_ONLY_DISCLAIMER;
    bundle.disclaimer = null;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.evidenceSummary) {
    markBudgetOmitted("evidenceDetail", "evidence_compacted_to_preserve_priority_content");
    bundle.evidenceSummary = compactPriorityEvidenceSummary(bundle.evidenceSummary);
    refresh();
  }
  const inventoryRows = bundle.preConsentCookiesTrackers?.rows;
  while (bundle.mcpMetadata.actualBytes > maxBytes && Array.isArray(inventoryRows) && inventoryRows.length > 0) {
    markBudgetOmitted("additionalPreConsentRows", "evidence_inventory_reduced_to_preserve_findings");
    inventoryRows.pop();
    bundle.preConsentCookiesTrackers.returned = inventoryRows.length;
    bundle.preConsentCookiesTrackers.truncated = true;
    refresh();
  }
  if (
    bundle.mcpMetadata.actualBytes > maxBytes &&
    bundle.findings.length > 1 &&
    typeof contentUrls.findings === "string"
  ) {
    markBudgetOmitted("findingEvidenceUrls", "finding_evidence_urls_replaced_by_template");
    bundle.evidenceUrlTemplate = "{contentUrls.findings}/{findingId}";
    bundle.findings = bundle.findings.map((finding: Record<string, any>) => {
      const { evidenceUrl: _evidenceUrl, ...rest } = finding;
      return rest;
    });
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.preConsentCookiesTrackers) {
    markBudgetOmitted("preConsentCookiesTrackers", "pre_consent_summary_omitted_to_preserve_findings");
    delete bundle.preConsentCookiesTrackers;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.links) {
    markBudgetOmitted("links", "duplicate_links_omitted_to_preserve_findings");
    delete bundle.links;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.timing) {
    markBudgetOmitted("timing", "duplicate_timing_envelope_omitted_to_preserve_findings");
    delete bundle.timing;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.summary) {
    markBudgetOmitted("summary", "duplicate_summary_envelope_omitted_to_preserve_findings");
    delete bundle.summary;
    refresh();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.mcpMetadata.truncated) {
    refreshTruncationGuidance();
  }
  if (bundle.mcpMetadata.actualBytes > maxBytes && bundle.evidenceSummary) {
    markBudgetOmitted("evidence", "evidence_digest_omitted_to_byte_limit");
    delete bundle.evidenceSummary;
    bundle.mcpMetadata.heavyEvidenceIncluded = false;
    refresh();
  }
  while (bundle.mcpMetadata.actualBytes > maxBytes && bundle.findings.length > 1) {
    markBudgetOmitted("additionalFindings", "findings_reduced_to_byte_limit");
    bundle.findings.pop();
    bundle.findingsMetadata.shown = bundle.findings.length;
    bundle.findingsMetadata.returned = bundle.findings.length;
    bundle.findingsMetadata.truncated = true;
    bundle.mcpMetadata.findingsTruncated = true;
    refresh();
  }
  if (bundle.mcpMetadata.truncated) {
    refreshTruncationGuidance();
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
      scoreLabel: bundle.scoreLabel,
      scoreStatus: bundle.scoreStatus,
      scoreVersion: bundle.scoreVersion,
      scoreUpdatedAt: bundle.scoreUpdatedAt,
      riskLevel: bundle.riskLevel,
      provenance: bundle.provenance,
      interpretationGuidance: bundle.interpretationGuidance,
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
      findings: bundle.findings.slice(0, 1),
      findingsMetadata: {
        shown: Math.min(1, bundle.findings.length),
        returned: Math.min(1, bundle.findings.length),
        total: bundle.findingsMetadata.total,
        truncated: bundle.findingsMetadata.total > Math.min(1, bundle.findings.length)
      },
      transportSecurity: {
        status: bundle.transportSecurity.status,
        evidenceRetained: bundle.transportSecurity.evidenceRetained,
        observationCounts: bundle.transportSecurity.observationCounts,
        observations: [],
        limitations: bundle.transportSecurity.limitations.slice(0, 2)
      },
      ...(bundle.preConsentCookiesTrackers ? {
        preConsentCookiesTrackers: {
          summary: bundle.preConsentCookiesTrackers.summary,
          rows: [],
          total: bundle.preConsentCookiesTrackers.total,
          returned: 0,
          truncated: bundle.preConsentCookiesTrackers.total > 0
        }
      } : {}),
      links: Object.fromEntries(Object.entries(bundle.links ?? {}).filter(([key]) => ["docs", "report", "self"].includes(key))),
      reportUrl: bundle.reportUrl,
      recommendedNextTool: null,
      recommendedNextAction: bundle.recommendedNextAction,
      error: bundle.error,
      mcpMetadata: {
        detail,
        heavyEvidenceIncluded: false,
        findingsTruncated: bundle.findingsMetadata.total > Math.min(1, bundle.findings.length),
        requestedMaxBytes,
        effectiveMaxBytes: maxBytes,
        responseCeilingBytes,
        responseBudgetClamped: requestedMaxBytes > maxBytes,
        actualBytes: 0,
        fullPayloadBytes: bundle.mcpMetadata.fullPayloadBytes,
        truncated: true,
        truncationReason: "minimal_canonical_result_returned_to_byte_limit",
        omittedSections: [...new Set([
          ...bundle.mcpMetadata.omittedSections,
          "summaryDetail",
          "evidence",
          ...(bundle.findingsMetadata.total > Math.min(1, bundle.findings.length) ? ["additionalFindings"] : []),
          ...(bundle.preConsentCookiesTrackers?.total > 0 ? ["additionalPreConsentRows"] : [])
        ])],
        deduplicatedSections: bundle.mcpMetadata.deduplicatedSections,
        nextRecommendedMaxBytes: bundle.mcpMetadata.nextRecommendedMaxBytes,
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
