import {
  CANONICAL_SCAN_ID_PATTERN,
  apiV2DomainLatestScanSchema,
  apiV2EvidenceEventSummarySchema,
  apiV2FindingDetailSchema,
  apiV2FindingListSchema,
  apiV2FindingSummarySchema,
  apiV2PreConsentCookiesTrackersSchema,
  apiV2ScanJobSchema,
  apiV2ScanDiagnosticsSchema,
  apiV2ScanLaneRunSchema,
  apiV2ScanPulseSchema,
  apiV2ScanResourceSchema,
  apiV2Disclaimer,
  CERTSCORE_API_V2_VERSION,
  type ApiV2DomainLatestScan,
  type ApiV2FindingDetail,
  type ApiV2FindingList,
  type ApiV2FindingSummary,
  type ApiV2PreConsentCookiesTrackers,
  type ApiV2ScanJob,
  type ApiV2ScanDiagnostics,
  type ApiV2ScanPulse,
  type ApiV2ScanResource,
  type ScanNoGoResult
} from "@certscore/api-contracts";
import type { PulseResponse } from "@certscore/api-contracts";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { projectExternalScanNoGo } from "@website-signal-risk-scanner/shared";
import { derivePulseReportScore } from "../pulse/projection";
import {
  buildRuntimeInventoryProjectionFromScan,
  inventoryRegistrableDomain,
  isInventoryDisplayHostname,
  type InventoryGroupRow
} from "../scans/runtime-inventory-projection";
import { GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION } from "../scans/regulatory-coverage-score";
import { SITE_URL } from "../seo";

function absoluteUrl(path: string) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL?.trim() || SITE_URL).toString();
}

export const API_V2_SCAN_ID_PATTERN = CANONICAL_SCAN_ID_PATTERN;
const API_V2_MAX_ACTIVE_SCAN_RETRY_AFTER_SECONDS = 5;
const API_V2_STALLED_AFTER_MS = 120_000;

type PulseFindingLike = {
  id: string;
  label?: string;
  criticality?: string;
  confidence?: string;
  plainEnglish?: string;
  evidence?: {
    summary?: string;
    observedPhase?: string | null;
    exampleEvents?: Array<Record<string, unknown>>;
    projectionWarnings?: string[];
  };
  evidenceDigest?: {
    basis?: string;
    phase?: string | null;
    exampleCount?: number;
    examplesShown?: number;
    examplesAvailable?: number;
    authRequiredForExamples?: boolean;
    hasTimingAnchor?: boolean;
    hasVendorAnchor?: boolean;
    hasConsentContext?: boolean;
    hasPolicyAnchor?: boolean;
    projectionWarnings?: string[];
  };
  reviewLenses?: string[];
  nextStep?: string;
};
type ApiV2FindingCriticalityValue = "critical" | "high" | "medium" | "low" | "info" | "unknown";
type ApiV2FindingConfidenceValue = "strong" | "good" | "moderate" | "weak" | "unknown";
type ApiV2EvidenceBasisValue = "runtime_observation" | "policy_surface_detection" | "accessibility_check" | "public_report_projection";
type ApiV2EvidenceEventTypeValue = "request" | "page" | "accessibility_check" | "policy_surface";
type PulseStatusLike = {
  jobId: string;
  scanId?: string | null;
  scan_id?: string | null;
  domain?: string | null;
  status?: string;
  phase?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
  phaseStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  progressPercent?: number;
  stalled?: boolean;
  completedAt?: string | null;
  scanTimeSeconds?: number | null;
  retryAfterSeconds?: number | null;
  resultUrl?: string | null;
  reportUrl?: string | null;
  riskLevel?: string | null;
  scanFrom?: string | null;
  score?: number | null;
  scoreStatus?: "provisional" | "final";
  scoreUpdatedAt?: string | null;
  scoreVersion?: string | null;
  coverage?: ApiV2ScanJob["coverage"];
  resultDisposition?: "no_go";
  noGo?: ScanNoGoResult;
  postRefusalObservation?: ApiV2ScanResource["postRefusalObservation"];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterSeconds: number | null;
    recommendedNextAction: string;
  };
  statusUrl?: string | null;
};
type PulseErrorLike = {
  error?: {
    code?: string;
    reasonCode?: "non_public_target" | null;
    message?: string;
    retryAfterSeconds?: number | null;
    creationRateLimit?: {
      kind: "new_scan" | "concurrency";
      limit: number;
      remaining: number;
      scope: "session" | "ip" | "surface" | "requester";
      used: number;
      windowId: "burst" | "daily" | "concurrent";
      windowSeconds: number | null;
    } | null;
  };
};

function finiteScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function finiteInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function diagnosticLane(name: string): "scanner" | "browser" | "policy" | "persistence" {
  if (/policy|discovery|crawl/i.test(name)) {
    return /policy/i.test(name) ? "policy" : "scanner";
  }
  if (/browser|runtime|visual|network/i.test(name)) {
    return "browser";
  }
  if (/persist|diff|artifact/i.test(name)) {
    return "persistence";
  }
  return "scanner";
}

function diagnosticOffset(value: unknown, startedAtMs: number | null) {
  const timestampValue = dateStringOrNull(value);
  if (!timestampValue || startedAtMs === null) {
    return null;
  }
  const timestamp = Date.parse(timestampValue);
  return Number.isFinite(timestamp) ? Math.max(0, Math.round(timestamp - startedAtMs)) : null;
}

function diagnosticOutcome(value: unknown): "success" | "degraded" | "failed" | "unknown" {
  return value === "success" || value === "degraded" || value === "failed" ? value : "unknown";
}

function riskLevelFromScore(score: number | null) {
  if (score === null) {
    return "unknown";
  }
  if (score < 40) {
    return "significant_review_recommended";
  }
  if (score < 85) {
    return "review_recommended";
  }
  return "monitor";
}

function publicScanFrom(value: string | null | undefined) {
  return value === "eu_de" || value === "eu_ie" || value === "california" ? value : undefined;
}

function normalizeScanStatus(value: string | null | undefined) {
  if (
    value === "queued" ||
    value === "running" ||
    value === "finalizing" ||
    value === "completed" ||
    value === "completed_limited" ||
    value === "failed" ||
    value === "expired" ||
    value === "rate_limited"
  ) {
    return value;
  }
  return "running";
}

export function apiV2CanonicalResultState(scanRecord: ScanDetailResponse): "finalizing" | "final" | "failed" {
  if (projectExternalScanNoGo(scanRecord.runtimeArtifacts)) {
    return "final";
  }
  const scanStatus = normalizeScanStatus(scanRecord.scan.status);
  if (scanStatus === "failed" || scanStatus === "expired") {
    return "failed";
  }
  if (scanStatus !== "completed" && scanStatus !== "completed_limited") {
    return "finalizing";
  }
  const projectionStatus = stringOrNull(scanRecord.snapshot?.report_projection_status);
  if (projectionStatus === "failed") {
    return "failed";
  }
  if (projectionStatus === "ready") {
    return "final";
  }
  // Older retained scans predate explicit report-projection status but may
  // already carry an immutable persisted score.
  if (!projectionStatus && finiteScore(scanRecord.snapshot?.certscore_overall) !== null) {
    return "final";
  }
  return "finalizing";
}

function statusProgressPercent(status: ReturnType<typeof normalizeScanStatus>) {
  if (status === "queued") return 5;
  if (status === "running") return 35;
  if (status === "finalizing") return 85;
  return 100;
}

function estimatedStatusProgressPercent(
  status: ReturnType<typeof normalizeScanStatus>,
  phaseStartedAt: string | null,
  nowMs = Date.now()
) {
  if (status !== "running" && status !== "finalizing") {
    return statusProgressPercent(status);
  }
  const phaseStartedMs = Date.parse(phaseStartedAt ?? "");
  const elapsedSeconds = Number.isFinite(phaseStartedMs) ? Math.max(0, (nowMs - phaseStartedMs) / 1_000) : 0;
  if (status === "finalizing") {
    return Math.min(99, 85 + Math.floor(elapsedSeconds / 5));
  }
  return Math.min(80, 20 + Math.floor(elapsedSeconds / 5));
}

function latestScanHeartbeat(scanRecord: ScanDetailResponse) {
  const eventTimes = scanRecord.events
    .map((event) => dateStringOrNull(event.createdAt))
    .filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return eventTimes[0] ?? dateStringOrNull(scanRecord.scan.completedAt) ?? dateStringOrNull(scanRecord.scan.startedAt) ?? dateStringOrNull(scanRecord.scan.createdAt);
}

function terminalScanFailure(scanRecord: ScanDetailResponse, status: ReturnType<typeof normalizeScanStatus>) {
  if (status !== "failed" && status !== "expired" && status !== "rate_limited") {
    return undefined;
  }
  if (status === "rate_limited") {
    return {
      code: "rate_limited",
      message: "The scan is rate limited.",
      retryable: true,
      retryAfterSeconds: 60,
      recommendedNextAction: "Wait for the recommended delay, then retry certscore_scan_site with the same URL."
    };
  }
  if (status === "expired") {
    return {
      code: "scan_expired",
      message: "The scan expired before a canonical result was available.",
      retryable: true,
      retryAfterSeconds: 30,
      recommendedNextAction: "Retry certscore_scan_site with freshness=refresh."
    };
  }
  if (scanRecord.snapshot?.report_projection_status === "failed") {
    return {
      code: "report_projection_failed",
      message: "The scan completed, but its canonical report result could not be finalized.",
      retryable: true,
      retryAfterSeconds: 30,
      recommendedNextAction: "Retry certscore_scan_site with freshness=refresh. If the failure repeats, stop and contact CertScore support."
    };
  }

  const detail = scanRecord.scan.errorMessage?.toLowerCase() ?? "";
  const classification =
    /navigation.*timeout|timeout.*navigation/.test(detail)
      ? { code: "navigation_timeout", message: "The public site did not finish navigation within the scan budget.", retryable: true }
      : /dns|enotfound|name.*resol/.test(detail)
        ? { code: "dns_resolution_failed", message: "The public hostname could not be resolved during the scan.", retryable: true }
        : /tls|certificate|ssl/.test(detail)
          ? { code: "tls_connection_failed", message: "A secure connection to the public site could not be established.", retryable: true }
          : /forbidden|access denied|\b403\b/.test(detail)
            ? { code: "target_access_denied", message: "The target denied scanner access before usable evidence could be retained.", retryable: false }
            : /\b5\d\d\b|server error/.test(detail)
              ? { code: "target_server_error", message: "The target returned a server error during the scan.", retryable: true }
              : { code: "scanner_runtime_failure", message: "The scan ended before a canonical result could be produced.", retryable: true };

  return {
    ...classification,
    retryAfterSeconds: classification.retryable ? 30 : null,
    recommendedNextAction: classification.retryable
      ? "Retry certscore_scan_site with freshness=refresh after the recommended delay."
      : "Review the target's access controls or report URL before retrying."
  };
}

function normalizeCriticality(value: unknown): ApiV2FindingCriticalityValue {
  return value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info" ? value : "unknown";
}

function normalizeConfidence(value: unknown): ApiV2FindingConfidenceValue {
  return value === "strong" || value === "good" || value === "moderate" || value === "weak" ? value : "unknown";
}

function normalizeEvidenceBasis(value: unknown): ApiV2EvidenceBasisValue {
  return value === "runtime_observation" || value === "policy_surface_detection" || value === "accessibility_check" || value === "public_report_projection"
    ? value
    : "public_report_projection";
}

function normalizeEvidenceEventType(value: unknown): ApiV2EvidenceEventTypeValue {
  return value === "request" || value === "accessibility_check" || value === "policy_surface" ? value : "page";
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function boundedStringOrNull(value: unknown, maxLength = 2048) {
  const stringValue = stringOrNull(value);
  if (!stringValue) {
    return null;
  }
  return stringValue.length > maxLength ? stringValue.slice(0, maxLength) : stringValue;
}

function boundedStrings(value: unknown, limit: number, maxLength = 120) {
  if (!Array.isArray(value)) {
    return [];
  }
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const stringValue = boundedStringOrNull(item, maxLength);
    if (!stringValue || seen.has(stringValue)) {
      continue;
    }
    seen.add(stringValue);
    output.push(stringValue);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function safeApiUrl(value: unknown) {
  const url = stringOrNull(value);
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.search) {
      parsed.search = "?redacted=1";
    }
    parsed.hash = "";
    return boundedStringOrNull(parsed.toString(), 2048);
  } catch {
    return null;
  }
}

function safeDocumentApiUrl(value: unknown) {
  const url = safeApiUrl(value);
  return url && !/\.(?:avif|bmp|css|gif|ico|jpe?g|js|mjs|map|mp3|mp4|ogg|pdf|png|svg|webm|webp|woff2?)(?:$|[?#])/i.test(url)
    ? url
    : null;
}

function dateStringOrNull(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function scanTimeSecondsFromTimestamps(startedAt: unknown, completedAt: unknown) {
  const started = dateStringOrNull(startedAt);
  const completed = dateStringOrNull(completedAt);
  if (!started || !completed) {
    return null;
  }

  const startedMs = new Date(started).getTime();
  const completedMs = new Date(completed).getTime();
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) {
    return null;
  }

  return Math.max(0, Number(((completedMs - startedMs) / 1000).toFixed(1)));
}

function eventObservedAtMs(event: Record<string, unknown>) {
  return finiteInt(event.observedAtMs) ?? finiteInt(event.timestampMs) ?? finiteInt(event.firstSeenMs);
}

function eventVendor(event: Record<string, unknown>) {
  return (
    stringOrNull(event.vendor) ??
    stringOrNull(event.vendorName) ??
    stringOrNull(event.endpointVendor) ??
    stringOrNull(event.initiatingVendor) ??
    stringOrNull(event.sourceVendor)
  );
}

function buildApiV2EvidenceExamples(finding: PulseFindingLike) {
  const events = Array.isArray(finding.evidence?.exampleEvents) ? finding.evidence.exampleEvents : [];
  return events.slice(0, 5).map((event) => {
    const redirectChain = boundedStrings(event.redirectChain, 10, 2048).map((url) => safeApiUrl(url)).filter((url): url is string => url !== null);
    const documentUrl = safeDocumentApiUrl(event.documentUrl ?? event.pageUrl ?? event.scannedPageUrl);
    return apiV2EvidenceEventSummarySchema.parse({
      type: normalizeEvidenceEventType(event.type),
      vendor: eventVendor(event),
      urlHost: stringOrNull(event.urlHost),
      registrableDomain: stringOrNull(event.registrableDomain),
      observedAtMs: eventObservedAtMs(event),
      phase: stringOrNull(event.phase ?? finding.evidenceDigest?.phase ?? finding.evidence?.observedPhase),
      documentUrl,
      pageContextId: boundedStringOrNull(event.pageContextId, 120),
      requestUrl: safeApiUrl(event.requestUrl ?? event.url),
      rawObservedVendor: boundedStringOrNull(event.rawObservedVendor, 160),
      rawObservedVendorCategory: boundedStringOrNull(event.rawObservedVendorCategory, 120),
      resolvedEndpointVendor: boundedStringOrNull(event.resolvedEndpointVendor, 160),
      resolvedEndpointVendorCategory: boundedStringOrNull(event.resolvedEndpointVendorCategory, 120),
      vendorAttributionBasis: boundedStringOrNull(event.vendorAttributionBasis, 120),
      relatedOrInitiatingVendor: boundedStringOrNull(event.relatedOrInitiatingVendor, 160),
      resourceType: boundedStringOrNull(event.resourceType, 80),
      scannedPageUrl: documentUrl,
      frameUrl: safeApiUrl(event.frameUrl),
      finalUrl: safeApiUrl(event.finalUrl),
      initiatorHost: boundedStringOrNull(event.initiatorHost, 253),
      initiatorType: boundedStringOrNull(event.initiatorType, 80),
      initiatorUrl: safeApiUrl(event.initiatorUrl),
      ...(redirectChain.length > 0 ? { redirectChain } : {}),
      projectionWarnings: boundedStrings(event.projectionWarnings, 12, 120)
    });
  });
}

function buildApiV2EvidenceSummary(finding: PulseFindingLike, scanId: string) {
  const examples = buildApiV2EvidenceExamples(finding);
  const exampleCount = finiteInt(finding.evidenceDigest?.exampleCount) ?? examples.length;
  const examplesShown = examples.length;
  const examplesAvailable = finiteInt(finding.evidenceDigest?.examplesAvailable) ?? exampleCount;
  const eventTimingAnchor = examples.some((example) => finiteInt(example.observedAtMs) !== null);
  const sourceEvents = Array.isArray(finding.evidence?.exampleEvents) ? finding.evidence.exampleEvents : [];
  const eventVendorAnchor = sourceEvents.some((event) => eventVendor(event) !== null);
  const firstExamplePhase = examples.map((example) => stringOrNull(example.phase)).find((phase): phase is string => phase !== null);
  const projectionWarnings = boundedStrings([...(finding.evidenceDigest?.projectionWarnings ?? []), ...(finding.evidence?.projectionWarnings ?? [])], 20, 120);
  const evidenceSummary = finding.evidence?.summary ?? finding.plainEnglish ?? finding.label ?? finding.id;
  const truncationMarker = evidenceSummary.match(/(?:\.\.\.|…)?\[(?:more in evidence packet|truncated)[^\]]*\]/i)?.[0] ?? null;
  const sourceUrl = examples
    .map((example) => example.documentUrl ?? example.scannedPageUrl ?? example.requestUrl ?? null)
    .find((value): value is string => typeof value === "string") ?? null;

  return {
    basis: normalizeEvidenceBasis(finding.evidenceDigest?.basis),
    summary: evidenceSummary,
    phase: stringOrNull(finding.evidenceDigest?.phase) ?? firstExamplePhase ?? stringOrNull(finding.evidence?.observedPhase),
    exampleCount,
    examplesShown,
    examplesAvailable,
    authRequiredForExamples: finding.evidenceDigest?.authRequiredForExamples === true,
    ...(examples.length > 0 ? { examples } : {}),
    ...(projectionWarnings.length > 0 ? { projectionWarnings } : {}),
    excerpt: {
      excerpt: evidenceSummary,
      isTruncated: truncationMarker !== null,
      truncationMarker,
      sourceUrl,
      evidenceUrl: absoluteUrl(`/api/v2/scans/${scanId}/findings/${encodeURIComponent(finding.id)}`)
    },
    hasTimingAnchor: eventTimingAnchor || finding.evidenceDigest?.hasTimingAnchor === true,
    hasVendorAnchor: eventVendorAnchor || finding.evidenceDigest?.hasVendorAnchor === true,
    ...(finding.evidenceDigest?.hasConsentContext !== undefined ? { hasConsentContext: finding.evidenceDigest.hasConsentContext } : {}),
    ...(finding.evidenceDigest?.hasPolicyAnchor !== undefined ? { hasPolicyAnchor: finding.evidenceDigest.hasPolicyAnchor } : {})
  };
}

export function projectedFindingsFromPulse(pulse: PulseResponse): PulseFindingLike[] {
  const report = pulse as PulseResponse & {
    findings?: PulseFindingLike[];
    topFindings?: PulseFindingLike[];
  };
  const byId = new Map<string, PulseFindingLike>();

  for (const finding of [...(Array.isArray(report.findings) ? report.findings : []), ...(Array.isArray(report.topFindings) ? report.topFindings : [])]) {
    if (finding && typeof finding.id === "string") {
      byId.set(finding.id, finding);
    }
  }

  return [...byId.values()];
}

function deriveApiV2PostRefusalObservation(scanRecord: ScanDetailResponse) {
  const supportedStatuses = new Set([
    "confirmed_observation",
    "confirmed_clean",
    "unconfirmed",
    "not_attempted",
    "unsupported",
    "aborted",
  ]);
  const event = [...scanRecord.events]
    .filter((candidate) =>
      candidate.eventType === "v2_post_refusal_evidence.reconciled" ||
      candidate.eventType === "v2_post_refusal_evidence.received"
    )
    .sort((left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id)
    )[0];
  const metadata = plainRecord(event?.metadataJson);
  const runtimeArtifacts = plainRecord(scanRecord.runtimeArtifacts);
  const projection = plainRecord(
    runtimeArtifacts?.postRefusalEvidenceProjection ??
    runtimeArtifacts?.post_refusal_evidence_projection ??
    metadata?.postRefusalReportProjection,
  );
  const status = stringOrNull(projection?.status);
  if (!status || !supportedStatuses.has(status)) {
    const coverage = plainRecord(
      runtimeArtifacts?.postRefusalObservationCoverage ??
      runtimeArtifacts?.post_refusal_observation_coverage,
    );
    const limitationCode = stringOrNull(coverage?.limitationCode);
    if (coverage?.status !== "limited" || !limitationCode) return null;
    const interpretation = limitationCode === "reject_path_timeout"
      ? "Reject Path did not complete within the six-second post-primary allowance, so no post-refusal verdict was established."
      : "Reject Path worker failed before verified evidence could be joined, so no post-refusal verdict was established.";
    const coverageLimitations = [interpretation];
    return {
      status: "aborted" as const,
      refusalExercised: false,
      observationCount: 0,
      productionProjectable: false,
      verdict: "no_confirmed_post_refusal_verdict" as const,
      interpretation,
      observationStrategy: "not_applicable" as const,
      termination: {
        kind: "unavailable" as const,
        intentional: false,
        trigger: limitationCode === "reject_path_timeout"
          ? "reject_path_timeout" as const
          : "worker_failed" as const,
      },
      completedAt: dateStringOrNull(coverage.completedAt),
      coverageLimitations,
      limitations: coverageLimitations,
    };
  }
  const rawLimitations = Array.isArray(projection?.limitations)
    ? projection.limitations.filter((value): value is string => typeof value === "string").slice(0, 24)
    : [];
  const earlyExit = rawLimitations
    .find((value) => value.startsWith("observation_early_exit:"))
    ?.slice("observation_early_exit:".length);
  const supportedEarlyExitTriggers = new Set([
    "non_essential_request_observed",
    "non_essential_storage_write_observed",
    "refusal_signal_contradiction_observed",
  ]);
  const evidenceSatisfied = Boolean(earlyExit && supportedEarlyExitTriggers.has(earlyExit));
  const coverageLimitations = [...new Set(rawLimitations
    .filter((value) => !value.startsWith("observation_early_exit:") || !evidenceSatisfied)
    .map((value) => value === "persistence_observation_not_settled_due_to_early_exit"
      ? "The remainder of the persistence window was not measured."
      : value))].slice(0, 24);
  const activityRows = Array.isArray(projection?.postRefusalActivity)
    ? projection.postRefusalActivity.filter((value) => value && typeof value === "object" && !Array.isArray(value)) as Record<string, unknown>[]
    : [];
  const storageObserved = activityRows.some((row) => row.activityType === "storage_write");
  const networkObserved = activityRows.some((row) => row.activityType === "network_request");
  const contradictionObserved = projection?.contradictionObserved === true;
  const verdict = status === "confirmed_observation"
    ? activityRows.length > 0
      ? "eligible_nonessential_activity_observed_after_confirmed_refusal" as const
      : contradictionObserved
        ? "retained_consent_signal_contradiction_observed_after_confirmed_refusal" as const
        : "eligible_nonessential_activity_observed_after_confirmed_refusal" as const
    : status === "confirmed_clean"
      ? "no_eligible_nonessential_activity_observed_during_completed_window" as const
      : "no_confirmed_post_refusal_verdict" as const;
  const interpretation = status === "confirmed_observation"
    ? storageObserved && networkObserved
      ? "Reject was confirmed, and eligible non-essential network and storage activity was observed afterward."
      : storageObserved
        ? "Reject was confirmed, and eligible non-essential storage activity was observed afterward."
        : networkObserved
          ? "Reject was confirmed, and eligible non-essential network activity was observed afterward."
          : contradictionObserved
            ? "Reject was confirmed, and a retained consent signal contradicted the refusal afterward."
            : "Reject was confirmed, and an eligible post-refusal observation was retained afterward."
    : status === "confirmed_clean"
      ? "Reject was confirmed. No eligible non-essential activity was observed during the completed bounded window."
      : "No confirmed post-refusal verdict was established.";
  const confirmed = status === "confirmed_observation" || status === "confirmed_clean";
  return {
    status: status as
      | "confirmed_observation"
      | "confirmed_clean"
      | "unconfirmed"
      | "not_attempted"
      | "unsupported"
      | "aborted",
    refusalExercised: projection?.refusalExercised === true,
    observationCount: Math.max(0, finiteInt(projection?.observationCount) ?? 0),
    productionProjectable: projection?.productionProjectable === true,
    verdict,
    interpretation,
    observationStrategy: confirmed ? "stop_on_first_eligible_activity" as const : "not_applicable" as const,
    termination: confirmed
      ? evidenceSatisfied
        ? {
            kind: "evidence_satisfied" as const,
            intentional: true,
            trigger: earlyExit as
              | "non_essential_request_observed"
              | "non_essential_storage_write_observed"
              | "refusal_signal_contradiction_observed",
          }
        : earlyExit
          ? {
              kind: "unavailable" as const,
              intentional: false,
              trigger: "unavailable" as const,
            }
          : {
            kind: "window_elapsed" as const,
            intentional: true,
            trigger: "window_elapsed" as const,
            }
      : {
          kind: "unavailable" as const,
          intentional: false,
          trigger: "unavailable" as const,
        },
    completedAt: dateStringOrNull(projection?.completedAt),
    coverageLimitations,
    limitations: coverageLimitations,
  };
}

function deriveCoverage(scanRecord: ScanDetailResponse) {
  const noGoProjection = projectExternalScanNoGo(scanRecord.runtimeArtifacts);
  if (noGoProjection) {
    return {
      status: noGoProjection.noGo.limitationKind,
      summary: noGoProjection.noGo.summary,
      limitations: [noGoProjection.noGo.explanation]
    };
  }
  const posture = scanRecord.accessPostureSummary;
  const runtimeArtifacts = plainRecord(scanRecord.runtimeArtifacts);
  const postRefusalCoverage = plainRecord(
    runtimeArtifacts?.postRefusalObservationCoverage ??
    runtimeArtifacts?.post_refusal_observation_coverage,
  );
  const postRefusalLimitationCode = stringOrNull(postRefusalCoverage?.limitationCode);
  const postRefusalLimitation = postRefusalCoverage?.status === "limited"
    ? postRefusalLimitationCode === "reject_path_timeout"
      ? "Reject Path did not complete within the six-second post-primary allowance."
      : "Reject Path worker failed before verified evidence could be joined."
    : null;
  const homepageObserved = scanRecord.scan.pagesScanned > 0 || posture.homepageFetchStatus === "ok";
  const limited =
    scanRecord.scan.status !== "completed" ||
    scanRecord.scan.pagesScanned < Math.max(1, scanRecord.scan.pagesRequested) ||
    Boolean(posture.stopReason || posture.interruptionReason);
  const blocked = `${posture.accessPostureClass ?? ""} ${posture.stopReason ?? ""}`.toLowerCase().includes("block");
  const status = blocked ? "blocked" : limited ? "partial" : "complete";
  const summary =
    status === "complete"
      ? "Automated public-web scan completed for the observed public surfaces."
      : homepageObserved
        ? "Automated public-web scan completed with coverage limitations."
        : "Coverage was limited; absence of findings should not be interpreted as absence of risk.";

  return {
    status,
    summary,
    limitations: [
      "Automated public-web scan only.",
      ...(postRefusalLimitation ? [postRefusalLimitation] : []),
    ]
  };
}

export function buildApiV2ScanResource(
  scanRecord: ScanDetailResponse,
  options: { requestedUrl?: string | null } = {}
): ApiV2ScanResource {
  const scan = scanRecord.scan;
  const domain = scan.domainHostname ?? "unknown";
  const score = derivePulseReportScore({ scanRecord });
  const scanTimeSeconds = scanTimeSecondsFromTimestamps(scan.startedAt, scan.completedAt);
  const noGoProjection = projectExternalScanNoGo(scanRecord.runtimeArtifacts);
  const canonicalResultState = apiV2CanonicalResultState(scanRecord);
  const scoreStatus = canonicalResultState === "final" ? "final" : "provisional";
  const scoreVersion = stringOrNull(scanRecord.snapshot?.score_version) ?? GDPR_EPRIVACY_EVIDENCE_SCORE_VERSION;
  const scoreUpdatedAt = dateStringOrNull(scanRecord.snapshot?.score_scored_at ?? scan.completedAt);
  const postRefusalObservation = deriveApiV2PostRefusalObservation(scanRecord);
  const configuredUrl = typeof scan.scanConfigJson?.normalizedUrl === "string"
    ? scan.scanConfigJson.normalizedUrl
    : null;
  const resource = {
    type: "certscore_scan",
    scanId: scan.id,
    domain,
    // Preserve the caller's exact page URL when the resource is returned from
    // the create endpoint. A domain-only fallback makes path-specific scans
    // look interchangeable to clients and masks identity regressions.
    url: options.requestedUrl ?? configuredUrl ?? (domain === "unknown" ? null : `https://${domain}`),
    status: noGoProjection
      ? "completed_limited"
      : canonicalResultState === "failed"
        ? "failed"
        : canonicalResultState === "finalizing"
          ? "finalizing"
          : "completed",
    ...(noGoProjection ?? {}),
    scanFrom: publicScanFrom(scan.scanFromValue),
    createdAt: dateStringOrNull(scan.createdAt),
    startedAt: dateStringOrNull(scan.startedAt),
    completedAt: dateStringOrNull(scan.completedAt),
    scanTimeSeconds,
    score: noGoProjection ? null : score,
    scoreStatus,
    scoreVersion,
    scoreUpdatedAt,
    riskLevel: noGoProjection ? null : riskLevelFromScore(score),
    postRefusalObservation,
    coverage: deriveCoverage(scanRecord),
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}`),
      status: absoluteUrl(`/api/v2/scans/${scan.id}/status`),
      findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`),
      diagnostics: absoluteUrl(`/api/v2/scans/${scan.id}/diagnostics`),
      preConsentCookiesTrackers: absoluteUrl(`/api/v2/scans/${scan.id}/pre-consent-cookies-trackers`),
      pulse: absoluteUrl(`/api/v2/scans/${scan.id}/pulse`),
      report: absoluteUrl(`/scan/${scan.id}`),
      latestDomainScan: domain === "unknown" ? undefined : absoluteUrl(`/api/v2/domains/${encodeURIComponent(domain)}/latest`),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanResource;

  return apiV2ScanResourceSchema.parse(resource);
}

export function buildApiV2ScanDiagnostics(scanRecord: ScanDetailResponse): ApiV2ScanDiagnostics {
  const scan = scanRecord.scan;
  const startedAt = dateStringOrNull(scan.startedAt);
  const completedAt = dateStringOrNull(scan.completedAt);
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const scanStart = Number.isFinite(startedAtMs) ? startedAtMs : null;
  const totalWallMs = scanStart !== null && completedAt && Number.isFinite(Date.parse(completedAt))
    ? Math.max(0, Math.round(Date.parse(completedAt) - scanStart))
    : null;
  const executionStages = scan.executionSummary?.stages ?? [];
  const runtimeArtifacts = plainRecord(scanRecord.runtimeArtifacts);
  const buildPhaseSummaries = Array.isArray(runtimeArtifacts?.buildPhaseSummaries)
    ? runtimeArtifacts.buildPhaseSummaries.map(plainRecord).filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const lanes = (Array.isArray(runtimeArtifacts?.scanLaneRuns) ? runtimeArtifacts.scanLaneRuns : [])
    .flatMap((value) => {
      const lane = plainRecord(value);
      if (!lane) return [];
      const firstResponseAt = boundedStringOrNull(lane.firstResponseAt, 80);
      const firstResponseOffsetMs = finiteInt(lane.firstResponseOffsetMs);
      const firstHttpStatus = finiteInt(lane.firstHttpStatus);
      const parsed = apiV2ScanLaneRunSchema.safeParse({
        laneId: lane.laneId,
        physicalInvocationId: lane.physicalInvocationId,
        region: lane.region,
        phaseName: lane.phaseName,
        startedAt: lane.startedAt,
        firstResponse: firstResponseAt !== null && firstResponseOffsetMs !== null && firstHttpStatus !== null
          ? {
              at: firstResponseAt,
              offsetMs: firstResponseOffsetMs,
              httpStatus: firstHttpStatus,
              effectiveUrl: boundedStringOrNull(lane.firstEffectiveUrl, 500),
            }
          : null,
        navigationCount: finiteInt(lane.navigationCount) ?? 0,
        challengeDetection: {
          detected: lane.challengeDetected === true,
          type: boundedStringOrNull(lane.challengeType, 120),
        },
        executionOutcome: lane.executionOutcome,
        accessOutcome: lane.accessOutcome,
        completedAt: boundedStringOrNull(lane.completedAt, 80),
        durationMs: finiteInt(lane.durationMs) ?? 0,
      });
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 8);
  const phases = [
    ...executionStages.map((stage) => ({
      name: stage.stage,
      lane: diagnosticLane(stage.stage),
      startedAtMs: diagnosticOffset(stage.startedAt, scanStart),
      completedAtMs: diagnosticOffset(stage.completedAt, scanStart),
      durationMs: finiteInt(stage.durationMs) ?? 0,
      outcome: diagnosticOutcome(stage.outcome)
    })),
    ...buildPhaseSummaries.map((phase) => {
      const name = typeof phase.phase === "string" ? phase.phase : "unknown_phase";
      return {
        name,
        lane: diagnosticLane(name),
        startedAtMs: diagnosticOffset(phase.startedAt, scanStart),
        completedAtMs: diagnosticOffset(phase.completedAt, scanStart),
        durationMs: finiteInt(phase.durationMs) ?? 0,
        outcome: diagnosticOutcome(phase.outcome)
      };
    })
  ]
    .sort((left, right) => (left.startedAtMs ?? Number.MAX_SAFE_INTEGER) - (right.startedAtMs ?? Number.MAX_SAFE_INTEGER))
    .slice(0, 20);

  const discoveryEvent = [...scanRecord.events].reverse().find((event) => {
    const metadata = plainRecord(event.metadataJson);
    return event.eventType === "runtime.build_phase_diagnostic" && metadata?.phase === "page_discovery_fetch" && metadata?.status === "ok";
  });
  const discoveryMetadata = plainRecord(discoveryEvent?.metadataJson);
  const discoveryDebug = plainRecord(discoveryMetadata?.discoveryDebug);
  const subtimings = plainRecord(discoveryMetadata?.subtimings);
  const v2PolicyDiagnostics = plainRecord(runtimeArtifacts?.v2DagPolicyDiscoveryDiagnostics);
  const prefetchTargets = Array.isArray(discoveryDebug?.prefetchTargets) ? discoveryDebug.prefetchTargets : [];
  const uniquePrefetchUrls = new Set(
    prefetchTargets.flatMap((target) => {
      const record = plainRecord(target);
      return typeof record?.url === "string" ? [record.url] : [];
    })
  );
  const policyPhase = phases.find((phase) => phase.name === "policy_enrichment");

  return apiV2ScanDiagnosticsSchema.parse({
    type: "certscore_scan_diagnostics",
    schemaVersion: "scan-diagnostics.v1",
    scanId: scan.id,
    generatedAt: completedAt,
    totalWallMs,
    phases,
    lanes,
    policyDiscovery: {
      candidatesDiscovered: finiteInt(v2PolicyDiagnostics?.candidatesDiscovered) ?? finiteInt(discoveryDebug?.candidateCount),
      candidatesAfterDeduplication: finiteInt(v2PolicyDiagnostics?.candidatesAfterDeduplication) ?? (uniquePrefetchUrls.size > 0 ? uniquePrefetchUrls.size : null),
      requestsStarted: finiteInt(v2PolicyDiagnostics?.requestsStarted) ?? finiteInt(discoveryDebug?.prefetchTargetCount) ?? finiteInt(discoveryMetadata?.prefetchTargetCount) ?? (uniquePrefetchUrls.size > 0 ? uniquePrefetchUrls.size : null),
      successfulDocuments: finiteInt(v2PolicyDiagnostics?.successfulDocuments) ?? finiteInt(subtimings?.prefetchedPageCount),
      timeouts: finiteInt(v2PolicyDiagnostics?.timeouts) ?? finiteInt(discoveryMetadata?.timeoutCount),
      phaseWallMs: finiteInt(v2PolicyDiagnostics?.phaseWallMs) ?? policyPhase?.durationMs ?? null,
      maxConcurrency: finiteInt(v2PolicyDiagnostics?.maxConcurrency) ?? finiteInt(discoveryMetadata?.staticFetchConcurrency),
      shortCircuitReason: boundedStringOrNull(v2PolicyDiagnostics?.shortCircuitReason, 160) ?? boundedStringOrNull(discoveryMetadata?.skipReason, 160)
    },
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}/diagnostics`),
      scan: absoluteUrl(`/api/v2/scans/${scan.id}`),
      findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`)
    },
    disclaimer: apiV2Disclaimer
  });
}

export function buildApiV2ScanStatus(
  scanRecord: ScanDetailResponse,
  options: { canonicalScan?: ApiV2ScanResource; nowMs?: number } = {}
): ApiV2ScanJob {
  const scan = scanRecord.scan;
  const noGoProjection = projectExternalScanNoGo(scanRecord.runtimeArtifacts);
  const normalizedScanStatus = normalizeScanStatus(scan.status);
  const canonicalResultState = apiV2CanonicalResultState(scanRecord);
  const status = noGoProjection && scan.status === "completed"
    ? "completed_limited"
    : canonicalResultState === "failed"
      ? "failed"
      : normalizedScanStatus === "completed" && canonicalResultState === "finalizing"
        ? "finalizing"
        : normalizedScanStatus;
  const failure = terminalScanFailure(scanRecord, status);
  const retryAfterSeconds = failure?.retryAfterSeconds ?? (
    status === "completed" || status === "completed_limited" || status === "failed" || status === "expired"
      ? null
      : apiV2ActiveScanRetryAfterSeconds({
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
    })
  );
  const scanTimeSeconds = scanTimeSecondsFromTimestamps(scan.startedAt, scan.completedAt);
  const terminal = status === "completed" || status === "completed_limited" || status === "failed" || status === "expired" || status === "rate_limited";
  const lastHeartbeatAt = terminal ? dateStringOrNull(scan.completedAt) : latestScanHeartbeat(scanRecord);
  const heartbeatMs = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : Number.NaN;
  const stalled = !terminal && Number.isFinite(heartbeatMs) && (options.nowMs ?? Date.now()) - heartbeatMs > API_V2_STALLED_AFTER_MS;
  const canonicalScan = options.canonicalScan ?? buildApiV2ScanResource(scanRecord);
  const phaseStartedAt = status === "queued"
    ? dateStringOrNull(scan.createdAt)
    : status === "finalizing"
      ? dateStringOrNull(scan.completedAt ?? scan.startedAt)
      : dateStringOrNull(scan.startedAt);
  const reportUrl = absoluteUrl(`/scan/${scan.id}`);
  const recommendedNextAction = failure?.recommendedNextAction ?? noGoProjection?.noGo.recommendedNextAction ?? (
    terminal
      ? `Call certscore_get_scan_bundle with scanId ${scan.id} for the canonical findings and limitations.`
      : `Poll certscore_get_scan_status with scanId ${scan.id} after the recommended delay.`
  );
  const resource = {
    type: "certscore_scan_job",
    jobId: scan.id,
    scanId: scan.id,
    domain: scan.domainHostname ?? null,
    url: canonicalScan.url ?? null,
    scanFrom: canonicalScan.scanFrom,
    status,
    ...(noGoProjection ?? {}),
    phase: status === "completed" || status === "completed_limited"
      ? "completed"
      : status === "failed"
        ? "failed"
        : status === "expired" || status === "rate_limited"
          ? status
          : status === "finalizing"
            ? "report_finalization"
            : status === "queued"
              ? "queued"
              : "runtime_observation",
    createdAt: dateStringOrNull(scan.createdAt) ?? undefined,
    startedAt: dateStringOrNull(scan.startedAt),
    completedAt: dateStringOrNull(scan.completedAt),
    scanTimeSeconds,
    score: canonicalScan.score ?? null,
    scoreStatus: canonicalScan.scoreStatus,
    scoreVersion: canonicalScan.scoreVersion ?? null,
    scoreUpdatedAt: canonicalScan.scoreUpdatedAt ?? null,
    riskLevel: canonicalScan.riskLevel ?? null,
    postRefusalObservation: canonicalScan.postRefusalObservation ?? null,
    coverage: canonicalScan.coverage ?? null,
    lastUpdatedAt: lastHeartbeatAt ?? undefined,
    phaseStartedAt,
    lastHeartbeatAt,
    progressPercent: estimatedStatusProgressPercent(status, phaseStartedAt, options.nowMs),
    progressIsEstimate: !terminal,
    estimatedRemainingSeconds: null,
    stalled,
    retryAfterSeconds,
    ...(failure ? { error: failure } : {}),
    reportUrl,
    recommendedNextAction,
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}/status`),
      ...(status === "completed" || status === "completed_limited" ? { findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`) } : {}),
      ...(status === "completed" || status === "completed_limited" ? { pulse: absoluteUrl(`/api/v2/scans/${scan.id}/pulse`) } : {}),
      ...(status === "completed" || status === "completed_limited" ? { report: reportUrl } : {}),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanJob;

  return apiV2ScanJobSchema.parse(resource);
}

export function buildApiV2ScanJobFromPulseStatus(
  status: PulseStatusLike,
  options: { requestedUrl?: string } = {}
): ApiV2ScanJob {
  const scanId = status.scanId ?? status.scan_id ?? null;
  const normalizedStatus = normalizeScanStatus(status.status);
  const terminal = normalizedStatus === "completed" || normalizedStatus === "completed_limited" || normalizedStatus === "failed" || normalizedStatus === "expired" || normalizedStatus === "rate_limited";
  const terminalError = status.error ?? (
    normalizedStatus === "rate_limited"
      ? {
          code: "rate_limited",
          message: "The scan is rate limited.",
          retryable: true,
          retryAfterSeconds: status.retryAfterSeconds ?? 60,
          recommendedNextAction: "Wait for the recommended delay, then retry certscore_scan_site with the same URL."
        }
      : normalizedStatus === "expired"
        ? {
            code: "scan_expired",
            message: "The scan expired before a canonical result was available.",
            retryable: true,
            retryAfterSeconds: 30,
            recommendedNextAction: "Retry certscore_scan_site with freshness=refresh."
          }
        : normalizedStatus === "failed"
          ? {
              code: "scanner_runtime_failure",
              message: "The scan ended before a canonical result could be produced.",
              retryable: true,
              retryAfterSeconds: 30,
              recommendedNextAction: "Retry certscore_scan_site with freshness=refresh after the recommended delay."
            }
          : undefined
  );
  const activeRetryAfterSeconds = apiV2ActiveScanRetryAfterSeconds({
    createdAt: status.createdAt,
    startedAt: status.startedAt,
  });
  const scanTimeSeconds = finiteNumber(status.scanTimeSeconds) ?? scanTimeSecondsFromTimestamps(status.startedAt, status.completedAt);
  const reportUrl = status.reportUrl ?? (scanId ? absoluteUrl(`/scan/${scanId}`) : null);
  const recommendedNextAction = terminalError?.recommendedNextAction ?? (
    normalizedStatus === "completed" || normalizedStatus === "completed_limited"
      ? `Call certscore_get_scan_bundle with scanId ${scanId ?? status.jobId} for the canonical findings and limitations.`
      : `Poll certscore_get_scan_status with scanId ${scanId ?? status.jobId} after the recommended delay.`
  );
  const resource = {
    type: "certscore_scan_job",
    jobId: status.jobId,
    scanId,
    domain: status.domain ?? null,
    url: options.requestedUrl ?? (status.domain ? `https://${status.domain}` : null),
    scanFrom: publicScanFrom(status.scanFrom),
    status: normalizedStatus,
    ...(status.resultDisposition ? { resultDisposition: status.resultDisposition } : {}),
    ...(status.noGo ? { noGo: status.noGo } : {}),
    phase: status.phase ?? (
      normalizedStatus === "completed" || normalizedStatus === "completed_limited"
        ? "completed"
        : normalizedStatus === "failed" || normalizedStatus === "expired" || normalizedStatus === "rate_limited"
          ? normalizedStatus
          : normalizedStatus === "finalizing"
            ? "report_finalization"
            : "queued"
    ),
    createdAt: dateStringOrNull(status.createdAt) ?? undefined,
    startedAt: dateStringOrNull(status.startedAt),
    completedAt: dateStringOrNull(status.completedAt),
    scanTimeSeconds,
    score: finiteScore(status.score),
    scoreStatus: status.scoreStatus,
    scoreVersion: status.scoreVersion ?? null,
    scoreUpdatedAt: dateStringOrNull(status.scoreUpdatedAt),
    riskLevel: status.riskLevel ?? null,
    coverage: status.coverage ?? null,
    lastUpdatedAt: dateStringOrNull(status.lastUpdatedAt ?? status.completedAt ?? status.createdAt) ?? undefined,
    phaseStartedAt: dateStringOrNull(status.phaseStartedAt ?? status.startedAt ?? status.createdAt),
    lastHeartbeatAt: dateStringOrNull(status.lastHeartbeatAt ?? status.lastUpdatedAt ?? status.completedAt ?? status.createdAt),
    progressPercent: finiteInt(status.progressPercent) ?? statusProgressPercent(normalizedStatus),
    progressIsEstimate: !terminal,
    estimatedRemainingSeconds: null,
    stalled: status.stalled === true,
    retryAfterSeconds: terminalError?.retryAfterSeconds ?? (terminal
      ? null
      : Math.min(status.retryAfterSeconds ?? activeRetryAfterSeconds, activeRetryAfterSeconds)
    ),
    ...(terminalError ? { error: terminalError } : {}),
    reportUrl,
    recommendedNextAction,
    links: {
      self: scanId ? absoluteUrl(`/api/v2/scans/${scanId}/status`) : status.statusUrl ?? undefined,
      status: scanId ? absoluteUrl(`/api/v2/scans/${scanId}/status`) : status.statusUrl ?? undefined,
      findings: scanId && (normalizedStatus === "completed" || normalizedStatus === "completed_limited") ? absoluteUrl(`/api/v2/scans/${scanId}/findings`) : undefined,
      pulse: scanId && (normalizedStatus === "completed" || normalizedStatus === "completed_limited") ? absoluteUrl(`/api/v2/scans/${scanId}/pulse`) : undefined,
      report: reportUrl ?? undefined,
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanJob;

  return apiV2ScanJobSchema.parse(resource);
}

export function apiV2ActiveScanRetryAfterSeconds(input: {
  createdAt?: string | null;
  nowMs?: number;
  startedAt?: string | null;
}): number {
  const referenceMs = Date.parse(input.startedAt ?? input.createdAt ?? "");
  if (!Number.isFinite(referenceMs)) {
    return API_V2_MAX_ACTIVE_SCAN_RETRY_AFTER_SECONDS;
  }
  const elapsedMs = Math.max(0, (input.nowMs ?? Date.now()) - referenceMs);
  if (elapsedMs < 15_000) {
    return 1;
  }
  if (elapsedMs < 45_000) {
    return 2;
  }
  return API_V2_MAX_ACTIVE_SCAN_RETRY_AFTER_SECONDS;
}

function apiV2ErrorCodeFromPulse(code: string | undefined, status: number) {
  if (code === "invalid_url") {
    return "invalid_url";
  }
  if (code === "not_found") {
    return "not_found";
  }
  if (code === "unauthorized" || status === 401) {
    return "unauthorized";
  }
  if (code === "forbidden" || status === 403) {
    return "forbidden";
  }
  if (code === "pulse_throttled" || code === "rate_limited" || status === 429) {
    return "rate_limited";
  }
  if (code === "scan_unavailable") {
    return "scan_unavailable";
  }
  return status >= 500 ? "internal_error" : "invalid_request";
}

export function buildApiV2ErrorFromPulse(input: {
  body: PulseErrorLike;
  fallbackMessage: string;
  status: number;
}) {
  const code = apiV2ErrorCodeFromPulse(input.body.error?.code, input.status);
  return buildApiV2Error({
    code,
    reasonCode: input.body.error?.reasonCode,
    message: input.body.error?.message ?? input.fallbackMessage,
    retryAfterSeconds: input.body.error?.retryAfterSeconds,
    creationRateLimit: input.body.error?.creationRateLimit ?? undefined,
    retryable: code === "rate_limited" || code === "scan_unavailable" || code === "internal_error"
  });
}

export function buildApiV2DomainLatestScan(input: {
  domain: string;
  scanRecord: ScanDetailResponse | null;
}): ApiV2DomainLatestScan {
  const resource = {
    type: "certscore_domain_latest_scan",
    domain: input.domain,
    scan: input.scanRecord ? buildApiV2ScanResource(input.scanRecord) : null,
    links: {
      self: absoluteUrl(`/api/v2/domains/${encodeURIComponent(input.domain)}/latest`),
      ...(input.scanRecord ? { status: absoluteUrl(`/api/v2/scans/${input.scanRecord.scan.id}/status`) } : {}),
      ...(input.scanRecord ? { findings: absoluteUrl(`/api/v2/scans/${input.scanRecord.scan.id}/findings`) } : {}),
      ...(input.scanRecord ? { preConsentCookiesTrackers: absoluteUrl(`/api/v2/scans/${input.scanRecord.scan.id}/pre-consent-cookies-trackers`) } : {}),
      ...(input.scanRecord ? { pulse: absoluteUrl(`/api/v2/scans/${input.scanRecord.scan.id}/pulse`) } : {}),
      ...(input.scanRecord ? { report: absoluteUrl(`/scan/${input.scanRecord.scan.id}`) } : {}),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2DomainLatestScan;

  return apiV2DomainLatestScanSchema.parse(resource);
}

export function buildApiV2Error(input: {
  code: "invalid_request" | "invalid_url" | "not_found" | "rate_limited" | "unauthorized" | "forbidden" | "scan_unavailable" | "internal_error";
  message: string;
  reasonCode?: "non_public_target" | null;
  retryable?: boolean;
  retryAfterSeconds?: number | null;
  recommendedNextAction?: string;
  rateLimit?: {
    limitUnits: number;
    policyVersion: string;
    profile: "terminal" | "status";
    requestedUnits: number;
    scope: "callerTarget" | "target" | "caller";
    usedUnits: number;
    windowId: "burst" | "daily";
    windowSeconds: number;
  };
  creationRateLimit?: {
    kind: "new_scan" | "concurrency";
    limit: number;
    remaining: number;
    scope: "session" | "ip" | "surface" | "requester";
    used: number;
    windowId: "burst" | "daily" | "concurrent";
    windowSeconds: number | null;
  };
}) {
  const retryable = input.retryable ?? (input.code === "rate_limited" || input.code === "scan_unavailable" || input.code === "internal_error");
  const retryAfterSeconds = input.retryAfterSeconds ?? (retryable ? 30 : null);
  const recommendedNextAction = input.recommendedNextAction ?? (
    input.code === "rate_limited"
      ? "Wait for the recommended delay, then retry the same request."
      : retryable
        ? "Retry after the recommended delay. If the error repeats, stop and contact CertScore support."
        : input.code === "invalid_url" || input.code === "invalid_request"
          ? "Correct the request or public URL before retrying."
          : "Stop and review the request, access requirements, or target URL before retrying."
  );
  return {
    type: "certscore_api_error",
    error: {
      code: input.code,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      message: input.message,
      retryable,
      retryAfterSeconds,
      recommendedNextAction,
      ...(input.rateLimit ? { rateLimit: input.rateLimit } : {}),
      ...(input.creationRateLimit ? { creationRateLimit: input.creationRateLimit } : {})
    },
    links: {
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  };
}

export function buildApiV2FindingSummary(input: {
  finding: PulseFindingLike;
  scanId: string;
  resultDisposition?: "no_go";
  noGo?: ScanNoGoResult;
}): ApiV2FindingSummary {
  const finding = input.finding;
  const resource = {
    type: "certscore_finding",
    id: finding.id,
    scanId: input.scanId,
    label: finding.label ?? finding.id,
    criticality: normalizeCriticality(finding.criticality),
    confidence: normalizeConfidence(finding.confidence),
    plainEnglish: finding.plainEnglish ?? finding.evidence?.summary ?? finding.label ?? finding.id,
    ...(input.resultDisposition ? { resultDisposition: input.resultDisposition } : {}),
    ...(input.noGo ? { noGo: input.noGo } : {}),
    reviewLenses: Array.isArray(finding.reviewLenses) ? finding.reviewLenses.filter((lens) => typeof lens === "string" && lens.trim().length > 0) : [],
    evidence: buildApiV2EvidenceSummary(finding, input.scanId),
    nextStep: finding.nextStep ?? null,
    links: {
      self: absoluteUrl(`/api/v2/scans/${input.scanId}/findings/${encodeURIComponent(finding.id)}`),
      pulse: absoluteUrl(`/api/v2/scans/${input.scanId}/pulse`),
      report: absoluteUrl(`/scan/${input.scanId}#finding-${finding.id}`),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2FindingSummary;

  return apiV2FindingSummarySchema.parse(resource);
}

export function buildApiV2FindingList(input: {
  findings: PulseFindingLike[];
  scanId: string;
  resultDisposition?: "no_go";
  noGo?: ScanNoGoResult;
}): ApiV2FindingList {
  const resource = {
    type: "certscore_finding_list",
    scanId: input.scanId,
    findings: input.findings.map((finding) => buildApiV2FindingSummary({
      finding,
      scanId: input.scanId,
      resultDisposition: input.resultDisposition,
      noGo: input.noGo
    })),
    links: {
      self: absoluteUrl(`/api/v2/scans/${input.scanId}/findings`),
      pulse: absoluteUrl(`/api/v2/scans/${input.scanId}/pulse`),
      report: absoluteUrl(`/scan/${input.scanId}`),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2FindingList;

  return apiV2FindingListSchema.parse(resource);
}

export function buildApiV2FindingDetail(input: {
  finding: PulseFindingLike;
  scanId: string;
  caveats?: string[];
  resultDisposition?: "no_go";
  noGo?: ScanNoGoResult;
}): ApiV2FindingDetail {
  const detail = {
    ...buildApiV2FindingSummary(input),
    detail: {
      caveats: input.caveats ?? ["Automated public-web scan evidence can be incomplete; use this as a review signal, not a legal determination."]
    }
  } satisfies ApiV2FindingDetail;

  return apiV2FindingDetailSchema.parse(detail);
}

export function buildApiV2ScanPulse(input: {
  pulse: PulseResponse;
  scanId: string;
}): ApiV2ScanPulse {
  const resource = {
    type: "certscore_scan_pulse",
    scanId: input.scanId,
    ...(input.pulse.resultDisposition ? { resultDisposition: input.pulse.resultDisposition } : {}),
    ...(input.pulse.noGo ? { noGo: input.pulse.noGo } : {}),
    pulse: input.pulse,
    links: {
      self: absoluteUrl(`/api/v2/scans/${input.scanId}/pulse`),
      status: absoluteUrl(`/api/v2/scans/${input.scanId}/status`),
      findings: absoluteUrl(`/api/v2/scans/${input.scanId}/findings`),
      report: absoluteUrl(`/scan/${input.scanId}`),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanPulse;

  return apiV2ScanPulseSchema.parse(resource);
}

function compactApiText(value: unknown, fallback = "unknown") {
  const text = typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
  return text.replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 160);
}

function sanitizeHost(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return null;
  }
  const candidate = text.includes("://") ? text : `https://${text}`;
  try {
    const hostname = new URL(candidate).hostname.replace(/^www\./, "").toLowerCase();
    return hostname || null;
  } catch {
    return text.split(/[/?#]/, 1)[0]?.replace(/^www\./, "").toLowerCase() || null;
  }
}

function normalizePreConsentPriority(value: unknown): "high" | "medium" | "review_needed" | "contextual" | "unknown" {
  return value === "high" || value === "medium" || value === "review_needed" || value === "contextual" ? value : "unknown";
}

function normalizePreConsentConfidence(value: unknown): "high" | "medium" | "low" | "unknown" {
  return value === "high" || value === "medium" || value === "low" ? value : "unknown";
}

function normalizePreConsentParty(value: InventoryGroupRow["party"]): "first_party" | "third_party" | "mixed" | "unknown" {
  if (value === "first_party") {
    return "first_party";
  }
  if (value === "third_party") {
    return "third_party";
  }
  if (value === "mixed") {
    return "mixed";
  }
  return "unknown";
}

function stableInventoryRowId(row: InventoryGroupRow, host: string | null) {
  return [row.type, row.vendor, row.purpose, host ?? "no-host"]
    .map((part) => compactApiText(part).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown")
    .join(":")
    .slice(0, 220);
}

function isTokenOnlyPreConsentLabel(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith(".") || trimmed.startsWith("_") || trimmed.startsWith("#");
}

function safeInventoryScriptUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 2_000);
  } catch {
    return null;
  }
}

function buildApiV2PreConsentRow(row: InventoryGroupRow, pageUrlHost: string | null) {
  const host = row.domains.map((domain) => sanitizeHost(domain)).find(isInventoryDisplayHostname) ?? null;
  if (!host && isTokenOnlyPreConsentLabel(row.vendor)) {
    return null;
  }
  const registrableDomain = host ? inventoryRegistrableDomain(host) : null;
  const requestCount = row.type === "tracker" && typeof row.requestCount === "number" && Number.isFinite(row.requestCount)
    ? Math.max(0, Math.round(row.requestCount))
    : null;

  return {
    id: stableInventoryRowId(row, host),
    kind: row.type,
    name: compactApiText(row.vendor),
    vendor: compactApiText(row.vendor),
    host,
    registrableDomain,
    category: compactApiText(row.macroCategory),
    purpose: compactApiText(row.purpose),
    priority: normalizePreConsentPriority(row.priority),
    confidence: normalizePreConsentConfidence(row.confidence),
    party: normalizePreConsentParty(row.party),
    canonicalEntity: row.canonicalEntity,
    purposes: row.purposes,
    domains: row.domains.map(sanitizeHost).filter((value): value is string => Boolean(value)),
    products: row.rawProducts,
    dataFlows: row.dataFlows,
    setByThirdPartyScript: row.setByThirdPartyScript,
    set_by_third_party_script: row.setByThirdPartyScript,
    cookieDetails: row.cookieDetails.map((cookie) => ({
      name: cookie.cookieName,
      domain: cookie.domain,
      category: cookie.category,
      essentiality: cookie.essentiality ?? "unknown",
      essentialityConfidence: cookie.essentialityConfidence ?? null,
      essentialityReasonCodes: (cookie.essentialityReasonCodes ?? []).slice(0, 20),
      essentialitySource: cookie.essentialitySource ?? "unknown",
      description: cookie.description ?? "Purpose is not yet classified; manual review is recommended.",
      dataTypes: cookie.dataTypes ?? [],
      expiresAt: cookie.expiresAt ?? null,
      lifespanSeconds: cookie.lifespanSeconds ?? null,
      lifespanSource: cookie.lifespanSource ?? null,
      longLived: cookie.longLived === true,
      setByThirdPartyScript: cookie.setByThirdPartyScript === true,
      set_by_third_party_script: cookie.setByThirdPartyScript === true,
      setterScriptUrl: safeInventoryScriptUrl(cookie.setterScriptUrl),
      initiatorChain: (cookie.initiatorChain ?? []).map(safeInventoryScriptUrl).filter((value): value is string => Boolean(value)).slice(0, 12)
    })),
    requestDetails: (row.requestDetails ?? []).slice(0, 50).map((request) => ({
      cookieNamesSent: request.cookieNamesSent.slice(0, 24).map((value) => value.slice(0, 256)),
      essentiality: request.essentiality,
      hostname: request.hostname?.slice(0, 253) ?? null,
      identifierParameterNames: request.identifierParameterNames.slice(0, 24).map((value) => value.slice(0, 256)),
      initiatorUrl: request.initiatorUrl?.slice(0, 500) ?? null,
      method: request.method?.slice(0, 24) ?? null,
      path: request.path?.slice(0, 2_000) ?? null,
      responseCookieNamesSet: request.responseCookieNamesSet.slice(0, 24).map((value) => value.slice(0, 256)),
      responseObserved: request.responseObserved,
      responseStorageAttempted: request.responseStorageAttempted,
      vendor: request.vendor?.slice(0, 160) ?? null
    })),
    requestCount,
    phase: "pre_consent" as const,
    observedBeforeConsent: true,
    evidenceBasis: "public_report_projection" as const,
    firstObservedAtMs: finiteInt(row.firstSeenMs),
    pageUrlHost
  };
}

export function buildApiV2PreConsentCookiesTrackers(scanRecord: ScanDetailResponse): ApiV2PreConsentCookiesTrackers {
  const scan = scanRecord.scan;
  const domain = scan.domainHostname ?? "unknown";
  const pageUrlHost = sanitizeHost(domain);
  const projection = buildRuntimeInventoryProjectionFromScan(scanRecord);
  const rowsById = new Map<string, NonNullable<ReturnType<typeof buildApiV2PreConsentRow>>>();

  for (const row of projection.groupedRows) {
    const safeRow = buildApiV2PreConsentRow(row, pageUrlHost);
    if (safeRow) {
      rowsById.set(safeRow.id, safeRow);
    }
  }

  const rows = [...rowsById.values()];
  const uniqueCookieKeys = new Set(rows.flatMap((row) =>
    (row.cookieDetails ?? []).map((cookie) => `${cookie.name}\u0000${cookie.domain ?? ""}`)
  ));
  const uniqueDomains = new Set(rows.flatMap((row) => row.domains ?? (row.host ? [row.host] : [])));
  const resource = {
    type: "certscore_pre_consent_cookies_trackers",
    scanId: scan.id,
    domain,
    generatedAt: dateStringOrNull(scan.completedAt ?? scan.startedAt ?? scan.createdAt) ?? new Date(0).toISOString(),
    summary: {
      rowCount: rows.length,
      trackerCount: rows.filter((row) => row.kind === "tracker").length,
      cookieCount: uniqueCookieKeys.size,
      requestCount: rows.reduce((total, row) => total + (row.requestCount ?? 0), 0),
      vendorCount: rows.length,
      domainCount: uniqueDomains.size
    },
    rows,
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}/pre-consent-cookies-trackers`),
      scan: absoluteUrl(`/api/v2/scans/${scan.id}`),
      status: absoluteUrl(`/api/v2/scans/${scan.id}/status`),
      findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`),
      pulse: absoluteUrl(`/api/v2/scans/${scan.id}/pulse`),
      report: absoluteUrl(`/scan/${scan.id}`),
      latestDomainScan: domain === "unknown" ? undefined : absoluteUrl(`/api/v2/domains/${encodeURIComponent(domain)}/latest/pre-consent-cookies-trackers`),
      docs: absoluteUrl("/developers/examples#pre-consent-cookies-trackers-json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2PreConsentCookiesTrackers;

  return apiV2PreConsentCookiesTrackersSchema.parse(resource);
}

export function apiV2JsonResponse(input: {
  body: unknown;
  headers?: Record<string, string>;
  requestId: string;
  route: string;
  status: number;
}) {
  const headers = new Headers(input.headers);
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-CertScore.ai-API-Version", CERTSCORE_API_V2_VERSION);
  headers.set("X-CertScore.ai-Route", input.route);
  headers.set("X-CertScore.ai-Request-Id", input.requestId);
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(input.body), {
    headers,
    status: input.status
  });
}
