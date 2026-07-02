import {
  apiV2DomainLatestScanSchema,
  apiV2EvidenceEventSummarySchema,
  apiV2FindingDetailSchema,
  apiV2FindingListSchema,
  apiV2FindingSummarySchema,
  apiV2PreConsentCookiesTrackersSchema,
  apiV2ScanJobSchema,
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
  type ApiV2ScanPulse,
  type ApiV2ScanResource
} from "@certscore/api-contracts";
import type { PulseResponse } from "@certscore/api-contracts";
import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import { derivePulseReportScore } from "../pulse/projection";
import { buildRuntimeInventoryProjectionFromScan, inventoryRegistrableDomain, type InventoryGroupRow } from "../scans/runtime-inventory-projection";
import { absoluteUrl } from "../seo";

export const API_V2_SCAN_ID_PATTERN = /^[0-9a-f-]{32,36}$/i;

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
  };
  evidenceDigest?: {
    basis?: string;
    phase?: string | null;
    exampleCount?: number;
    examplesShown?: number;
    hasTimingAnchor?: boolean;
    hasVendorAnchor?: boolean;
    hasConsentContext?: boolean;
    hasPolicyAnchor?: boolean;
  };
  reviewLenses?: string[];
  nextStep?: string;
};
type ApiV2FindingCriticalityValue = "critical" | "high" | "medium" | "low" | "info" | "unknown";
type ApiV2FindingConfidenceValue = "strong" | "moderate" | "weak" | "unknown";
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
  lastUpdatedAt?: string | null;
  completedAt?: string | null;
  retryAfterSeconds?: number | null;
  resultUrl?: string | null;
  reportUrl?: string | null;
  statusUrl?: string | null;
};
type PulseErrorLike = {
  error?: {
    code?: string;
    message?: string;
    retryAfterSeconds?: number | null;
  };
};

function finiteScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function finiteInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function riskLevelFromScore(score: number | null) {
  if (score === null) {
    return "unknown";
  }
  if (score < 45) {
    return "significant_review_recommended";
  }
  if (score < 75) {
    return "review_recommended";
  }
  return "monitor";
}

function publicScanFrom(value: string | null | undefined) {
  return value === "eu_ie" || value === "california" ? value : undefined;
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

function normalizeCriticality(value: unknown): ApiV2FindingCriticalityValue {
  return value === "critical" || value === "high" || value === "medium" || value === "low" || value === "info" ? value : "unknown";
}

function normalizeConfidence(value: unknown): ApiV2FindingConfidenceValue {
  return value === "strong" || value === "moderate" || value === "weak" ? value : "unknown";
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

function dateStringOrNull(value: unknown) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function eventObservedAtMs(event: Record<string, unknown>) {
  return finiteInt(event.observedAtMs) ?? finiteInt(event.timestampMs) ?? finiteInt(event.firstSeenMs);
}

function buildApiV2EvidenceExamples(finding: PulseFindingLike) {
  const events = Array.isArray(finding.evidence?.exampleEvents) ? finding.evidence.exampleEvents : [];
  return events.slice(0, 5).map((event) =>
    apiV2EvidenceEventSummarySchema.parse({
      type: normalizeEvidenceEventType(event.type),
      vendor: stringOrNull(event.vendor),
      urlHost: stringOrNull(event.urlHost),
      registrableDomain: stringOrNull(event.registrableDomain),
      observedAtMs: eventObservedAtMs(event),
      phase: stringOrNull(event.phase ?? finding.evidenceDigest?.phase ?? finding.evidence?.observedPhase)
    })
  );
}

function buildApiV2EvidenceSummary(finding: PulseFindingLike) {
  const examples = buildApiV2EvidenceExamples(finding);
  const exampleCount = finiteInt(finding.evidenceDigest?.exampleCount) ?? examples.length;
  const examplesShown = Math.min(finiteInt(finding.evidenceDigest?.examplesShown) ?? examples.length, examples.length);

  return {
    basis: normalizeEvidenceBasis(finding.evidenceDigest?.basis),
    summary: finding.evidence?.summary ?? finding.plainEnglish ?? finding.label ?? finding.id,
    phase: stringOrNull(finding.evidenceDigest?.phase ?? finding.evidence?.observedPhase),
    exampleCount,
    examplesShown,
    ...(examples.length > 0 ? { examples } : {}),
    ...(finding.evidenceDigest?.hasTimingAnchor !== undefined ? { hasTimingAnchor: finding.evidenceDigest.hasTimingAnchor } : {}),
    ...(finding.evidenceDigest?.hasVendorAnchor !== undefined ? { hasVendorAnchor: finding.evidenceDigest.hasVendorAnchor } : {}),
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

function deriveCoverage(scanRecord: ScanDetailResponse) {
  const posture = scanRecord.accessPostureSummary;
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
    limitations: ["Automated public-web scan only."]
  };
}

export function buildApiV2ScanResource(scanRecord: ScanDetailResponse): ApiV2ScanResource {
  const scan = scanRecord.scan;
  const domain = scan.domainHostname ?? "unknown";
  const score = derivePulseReportScore({ scanRecord });
  const resource = {
    type: "certscore_scan",
    scanId: scan.id,
    domain,
    url: domain === "unknown" ? null : `https://${domain}`,
    status: "completed",
    scanFrom: publicScanFrom(scan.scanFromValue),
    createdAt: dateStringOrNull(scan.createdAt),
    startedAt: dateStringOrNull(scan.startedAt),
    completedAt: dateStringOrNull(scan.completedAt),
    score,
    riskLevel: riskLevelFromScore(score),
    coverage: deriveCoverage(scanRecord),
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}`),
      status: absoluteUrl(`/api/v2/scans/${scan.id}/status`),
      findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`),
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

export function buildApiV2ScanStatus(scanRecord: ScanDetailResponse): ApiV2ScanJob {
  const scan = scanRecord.scan;
  const status = normalizeScanStatus(scan.status);
  const retryAfterSeconds = status === "completed" || status === "completed_limited" || status === "failed" || status === "expired" ? null : 30;
  const resource = {
    type: "certscore_scan_job",
    jobId: scan.id,
    scanId: scan.id,
    domain: scan.domainHostname ?? null,
    status,
    phase: status === "completed" || status === "completed_limited" ? "completed" : status === "failed" ? "failed" : "runtime_observation",
    createdAt: dateStringOrNull(scan.createdAt) ?? undefined,
    lastUpdatedAt: dateStringOrNull(scan.completedAt ?? scan.startedAt ?? scan.createdAt) ?? undefined,
    retryAfterSeconds,
    links: {
      self: absoluteUrl(`/api/v2/scans/${scan.id}/status`),
      ...(status === "completed" || status === "completed_limited" ? { findings: absoluteUrl(`/api/v2/scans/${scan.id}/findings`) } : {}),
      ...(status === "completed" || status === "completed_limited" ? { pulse: absoluteUrl(`/api/v2/scans/${scan.id}/pulse`) } : {}),
      ...(status === "completed" || status === "completed_limited" ? { report: absoluteUrl(`/scan/${scan.id}`) } : {}),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanJob;

  return apiV2ScanJobSchema.parse(resource);
}

export function buildApiV2ScanJobFromPulseStatus(status: PulseStatusLike): ApiV2ScanJob {
  const scanId = status.scanId ?? status.scan_id ?? null;
  const normalizedStatus = normalizeScanStatus(status.status);
  const resource = {
    type: "certscore_scan_job",
    jobId: status.jobId,
    scanId,
    domain: status.domain ?? null,
    status: normalizedStatus,
    phase: status.phase ?? (normalizedStatus === "completed" || normalizedStatus === "completed_limited" ? "completed" : "queued"),
    createdAt: dateStringOrNull(status.createdAt) ?? undefined,
    lastUpdatedAt: dateStringOrNull(status.lastUpdatedAt ?? status.completedAt ?? status.createdAt) ?? undefined,
    retryAfterSeconds: status.retryAfterSeconds ?? (normalizedStatus === "completed" || normalizedStatus === "completed_limited" ? null : 30),
    links: {
      self: scanId ? absoluteUrl(`/api/v2/scans/${scanId}/status`) : status.statusUrl ?? undefined,
      status: scanId ? absoluteUrl(`/api/v2/scans/${scanId}/status`) : status.statusUrl ?? undefined,
      findings: scanId && (normalizedStatus === "completed" || normalizedStatus === "completed_limited") ? absoluteUrl(`/api/v2/scans/${scanId}/findings`) : undefined,
      pulse: scanId && (normalizedStatus === "completed" || normalizedStatus === "completed_limited") ? absoluteUrl(`/api/v2/scans/${scanId}/pulse`) : undefined,
      report: status.reportUrl ?? (scanId ? absoluteUrl(`/scan/${scanId}`) : undefined),
      docs: absoluteUrl("/api/v2/openapi.json")
    },
    disclaimer: apiV2Disclaimer
  } satisfies ApiV2ScanJob;

  return apiV2ScanJobSchema.parse(resource);
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
  return buildApiV2Error({
    code: apiV2ErrorCodeFromPulse(input.body.error?.code, input.status),
    message: input.body.error?.message ?? input.fallbackMessage,
    retryAfterSeconds: input.body.error?.retryAfterSeconds
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
  retryAfterSeconds?: number | null;
}) {
  return {
    type: "certscore_api_error",
    error: {
      code: input.code,
      message: input.message,
      ...(input.retryAfterSeconds !== undefined ? { retryAfterSeconds: input.retryAfterSeconds } : {})
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
    reviewLenses: Array.isArray(finding.reviewLenses) ? finding.reviewLenses.filter((lens) => typeof lens === "string" && lens.trim().length > 0) : [],
    evidence: buildApiV2EvidenceSummary(finding),
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
}): ApiV2FindingList {
  const resource = {
    type: "certscore_finding_list",
    scanId: input.scanId,
    findings: input.findings.map((finding) => buildApiV2FindingSummary({ finding, scanId: input.scanId })),
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
  if (value === "third_party" || value === "3rd") {
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

function buildApiV2PreConsentRow(row: InventoryGroupRow, pageUrlHost: string | null) {
  const host = sanitizeHost(row.domains[0]);
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
    category: compactApiText(row.purpose),
    purpose: compactApiText(row.purpose),
    priority: normalizePreConsentPriority(row.priority),
    confidence: normalizePreConsentConfidence(row.confidence),
    party: normalizePreConsentParty(row.party),
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
  const rowsById = new Map<string, ReturnType<typeof buildApiV2PreConsentRow>>();

  for (const row of projection.groupedRows) {
    const safeRow = buildApiV2PreConsentRow(row, pageUrlHost);
    rowsById.set(safeRow.id, safeRow);
  }

  const rows = [...rowsById.values()];
  const resource = {
    type: "certscore_pre_consent_cookies_trackers",
    scanId: scan.id,
    domain,
    generatedAt: dateStringOrNull(scan.completedAt ?? scan.startedAt ?? scan.createdAt) ?? new Date(0).toISOString(),
    summary: {
      rowCount: rows.length,
      trackerCount: rows.filter((row) => row.kind === "tracker").length,
      cookieCount: rows.filter((row) => row.kind === "cookie").length,
      requestCount: rows.reduce((total, row) => total + (row.requestCount ?? 0), 0)
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
  headers.set("X-CertScore-API-Version", CERTSCORE_API_V2_VERSION);
  headers.set("X-CertScore-Route", input.route);
  headers.set("X-CertScore-Request-Id", input.requestId);
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(input.body), {
    headers,
    status: input.status
  });
}
