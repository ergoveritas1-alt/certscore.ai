import { query } from "@website-signal-risk-scanner/db";
import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  getLocalV2DagLambdaAwsRegionForScanFrom
} from "./local-v2-dag-scan-config";

export const RECENT_SCAN_REUSE_WINDOW_HOURS = 24;
export const NO_GO_REUSE_WINDOW_HOURS = {
  accessDenied: 0.5,
  tls: 1,
  transport: 1 / 6
} as const;

export type RecentScanReuseCandidate = {
  accessPostureClass: string | null;
  completedAt: string | null;
  coverageLevel: string | null;
  hostname: string;
  id: string;
  normalizedUrl: string;
  noGoDecision?: string | null;
  noGoReasonCodes?: string[] | null;
  organizationId: string | null;
  pagesRequested: number;
  pagesScanned: number;
  scanFrom: string | null;
  scanOutcome: string | null;
  scanType: string | null;
  status: string;
  v2LambdaResultEvents?: unknown;
  v2ParallelArtifactOnly?: boolean | null;
  v2ParallelLocalOnly?: boolean | null;
  v2ReportProcessor?: string | null;
};

export type RecentScanReuseInput = {
  minPagesRequested: number;
  normalizedDomain: string;
  normalizedUrl: string;
  now?: Date;
  organizationId: string | null;
  scanFrom?: ScanFrom;
  windowHours?: number;
};

export type RecentScanReuseEligibility =
  | {
      candidate: RecentScanReuseCandidate;
      eligible: true;
      effectiveScanFrom: ScanFrom;
      minPagesRequested: number;
      reuseWindowHours: number;
    }
  | {
      candidate: null;
      eligible: false;
      effectiveScanFrom: ScanFrom;
      minPagesRequested: number;
      reason: "no_eligible_completed_full_scan";
      reuseWindowHours: number;
    };

export type RecentScanReuseDecision =
  | { action: "reuse"; eligibility: Extract<RecentScanReuseEligibility, { eligible: true }>; forceNewScan: false }
  | {
      action: "queue_fresh";
      eligibility: RecentScanReuseEligibility | null;
      forceNewScan: boolean;
      reason: "fresh_rescan_requested" | "no_eligible_scan";
    };

type ScanHistoryCandidate = {
  accessPostureClass?: string | null;
  completedAt: string | null;
  coverageLevel?: string | null;
  id?: string | null;
  pagesScanned?: number | null;
  noGoDecision?: string | null;
  scanOutcome?: string | null;
  status: string;
};

const NON_REUSABLE_SCAN_OUTCOMES = new Set([
  "navigation_transport_failure",
  "transport_failure",
  "timeout_navigation",
  "domain_inactive_or_unstable",
  "unknown_access_limitation",
  "verification_incomplete",
]);

function hasReusableCoverage(scan: {
  accessPostureClass?: string | null;
  coverageLevel?: string | null;
  noGoDecision?: string | null;
  pagesScanned?: number | null;
  scanOutcome?: string | null;
  scanFrom?: string | null;
  v2LambdaResultEvents?: unknown;
  v2ParallelArtifactOnly?: boolean | null;
  v2ParallelLocalOnly?: boolean | null;
  v2ReportProcessor?: string | null;
}) {
  if (scan.noGoDecision === "no_go") {
    return true;
  }
  const hasLegacyCoverage = (
    (scan.pagesScanned === undefined || scan.pagesScanned === null || scan.pagesScanned > 0) &&
    scan.coverageLevel !== "limited_none" &&
    scan.accessPostureClass !== "early_loss" &&
    !NON_REUSABLE_SCAN_OUTCOMES.has(scan.scanOutcome ?? "")
  );
  return hasLegacyCoverage || hasReusableV2LambdaArtifact(scan);
}

const ACCESS_DENIED_NO_GO_OUTCOMES = new Set([
  "access_denied_or_forbidden_page",
  "captcha_or_challenge",
  "homepage_access_blocked",
  "homepage_rate_limited_429",
  "homepage_security_challenge",
  "rate_limited_429"
]);
const TLS_NO_GO_OUTCOMES = new Set(["homepage_tls_or_certificate_error", "tls_or_certificate_error"]);
const TRANSPORT_NO_GO_OUTCOMES = new Set(["navigation_transport_failure", "timeout_navigation", "transport_failure"]);

export function reuseWindowHoursForCandidate(
  scan: { noGoDecision?: string | null; noGoReasonCodes?: string[] | null; scanOutcome?: string | null },
  requestedWindowHours = RECENT_SCAN_REUSE_WINDOW_HOURS
) {
  if (scan.noGoDecision !== "no_go") {
    return requestedWindowHours;
  }
  const outcome = scan.noGoReasonCodes?.find((code) => code !== "scan_no_go_corroborated") ?? scan.scanOutcome ?? "";
  if (TRANSPORT_NO_GO_OUTCOMES.has(outcome)) {
    return Math.min(requestedWindowHours, NO_GO_REUSE_WINDOW_HOURS.transport);
  }
  if (ACCESS_DENIED_NO_GO_OUTCOMES.has(outcome)) {
    return Math.min(requestedWindowHours, NO_GO_REUSE_WINDOW_HOURS.accessDenied);
  }
  if (TLS_NO_GO_OUTCOMES.has(outcome)) {
    return Math.min(requestedWindowHours, NO_GO_REUSE_WINDOW_HOURS.tls);
  }
  return requestedWindowHours;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRecord(value: unknown, key: string) {
  if (!isRecord(value)) {
    return null;
  }
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function getS3ArtifactRegion(uri: string) {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  const bucket = match?.[1];
  const key = match?.[2];
  if (!bucket || !key?.endsWith("/CanonicalEvidenceBundle.json")) {
    return null;
  }
  return bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-1)(?:-|$)/)?.[1] ?? null;
}

function hasReusableV2LambdaArtifact(scan: {
  scanFrom?: string | null;
  v2LambdaResultEvents?: unknown;
  v2ParallelArtifactOnly?: boolean | null;
  v2ParallelLocalOnly?: boolean | null;
  v2ReportProcessor?: string | null;
}) {
  if (
    scan.v2ReportProcessor !== LOCAL_V2_DAG_SCAN_PROCESSOR ||
    scan.v2ParallelArtifactOnly !== true ||
    scan.v2ParallelLocalOnly !== true ||
    !Array.isArray(scan.v2LambdaResultEvents)
  ) {
    return false;
  }

  const expectedRegion = getLocalV2DagLambdaAwsRegionForScanFrom(scan.scanFrom);
  return scan.v2LambdaResultEvents.some((value) => {
    if (!isRecord(value)) {
      return false;
    }
    const artifactAccess = getRecord(value, "artifactAccess");
    const artifactPointers = getRecord(value, "artifactPointers");
    const scanArtifactMetadata = getRecord(getRecord(value, "artifactMetadata"), "scanArtifactUri");
    const scannerRuntimeProvenance = getRecord(value, "scannerRuntimeProvenance");
    const scanArtifactUri = artifactPointers?.scanArtifactUri;
    const sha256 = scanArtifactMetadata?.sha256;
    const sizeBytes = scanArtifactMetadata?.sizeBytes;

    return (
      value.artifactOnly === true &&
      value.productionFindingIntegration === false &&
      value.processor === LOCAL_V2_DAG_SCAN_PROCESSOR &&
      value.resultStatus === "completed" &&
      value.targetEnvironment === "production" &&
      artifactAccess?.productionReadMode === "verified_s3" &&
      typeof scanArtifactUri === "string" &&
      getS3ArtifactRegion(scanArtifactUri) === expectedRegion &&
      scannerRuntimeProvenance?.awsRegion === expectedRegion &&
      typeof sha256 === "string" &&
      /^[a-f0-9]{64}$/i.test(sha256) &&
      typeof sizeBytes === "number" &&
      Number.isSafeInteger(sizeBytes) &&
      sizeBytes > 0
    );
  });
}

function normalizeDomainForReuse(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

function normalizeUrlForReuse(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    if (url.pathname === "") {
      url.pathname = "/";
    }
    return url.toString();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\/www\./, "https://");
  }
}

function normalizedPathForReuse(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return path.length > 1 ? path.replace(/\/$/, "") : "/";
  } catch {
    return "/";
  }
}

export function isScanWithinReuseWindow(input: { completedAt: string | null; now?: Date; windowHours?: number }) {
  if (!input.completedAt) {
    return false;
  }

  const completedAtMs = new Date(input.completedAt).getTime();
  if (!Number.isFinite(completedAtMs)) {
    return false;
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const windowMs = (input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS) * 60 * 60 * 1000;
  return completedAtMs <= nowMs && nowMs - completedAtMs <= windowMs;
}

export function findRecentCompletedScanInHistory(scans: ScanHistoryCandidate[], now = new Date()) {
  return (
    scans
      .filter(
        (scan): scan is ScanHistoryCandidate & { id: string } =>
          typeof scan.id === "string" &&
          scan.id.length > 0 &&
          scan.status === "completed" &&
          hasReusableCoverage(scan) &&
          isScanWithinReuseWindow({
            completedAt: scan.completedAt,
            now,
            windowHours: reuseWindowHoursForCandidate(scan)
          })
      )
      .sort((left, right) => new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime())[0] ?? null
  );
}

export function evaluateRecentScanReuseCandidates(
  input: RecentScanReuseInput,
  candidates: RecentScanReuseCandidate[]
): RecentScanReuseEligibility {
  const effectiveScanFrom = normalizeScanFrom(input.scanFrom);
  const minPagesRequested = Math.max(0, Math.floor(input.minPagesRequested));
  const reuseWindowHours = input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS;
  const requestedDomain = normalizeDomainForReuse(input.normalizedDomain);
  const requestedUrl = normalizeUrlForReuse(input.normalizedUrl);

  const candidate = candidates
    .filter((row) => {
      const scopeAllowed = input.organizationId === null
        ? row.organizationId === null
        : row.organizationId === null || row.organizationId === input.organizationId;
      const targetMatches =
        normalizeDomainForReuse(row.hostname) === requestedDomain &&
        normalizedPathForReuse(row.normalizedUrl) === normalizedPathForReuse(requestedUrl);

      return (
        scopeAllowed &&
        targetMatches &&
        row.status === "completed" &&
        hasReusableCoverage(row) &&
        (row.scanType ?? "full") === "full" &&
        isScanWithinReuseWindow({
          completedAt: row.completedAt,
          now: input.now,
          windowHours: reuseWindowHoursForCandidate(row, reuseWindowHours)
        }) &&
        normalizeScanFrom(row.scanFrom) === effectiveScanFrom &&
        Number.isFinite(row.pagesRequested) &&
        row.pagesRequested >= minPagesRequested
      );
    })
    .sort((left, right) => new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime())[0] ?? null;

  if (!candidate) {
    return {
      candidate: null,
      effectiveScanFrom,
      eligible: false,
      minPagesRequested,
      reason: "no_eligible_completed_full_scan",
      reuseWindowHours
    };
  }

  return {
    candidate,
    effectiveScanFrom,
    eligible: true,
    minPagesRequested,
    reuseWindowHours: reuseWindowHoursForCandidate(candidate, reuseWindowHours)
  };
}

async function loadRecentScanReuseCandidates(input: RecentScanReuseInput) {
  const effectiveScanFrom = normalizeScanFrom(input.scanFrom);
  const minPagesRequested = Math.max(0, Math.floor(input.minPagesRequested));
  const windowHours = input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS;
  const now = input.now ?? new Date();

  const candidates = await query<RecentScanReuseCandidate>(
    `select s.id,
            s.organization_id as "organizationId",
            s.completed_at as "completedAt",
            s.pages_requested as "pagesRequested",
            s.pages_scanned as "pagesScanned",
            s.status,
            s.scan_type as "scanType",
            s.scan_config_json->>'scanFrom' as "scanFrom",
            ss.access_posture_class as "accessPostureClass",
            ss.coverage_level as "coverageLevel",
            ss.scan_outcome as "scanOutcome",
            coalesce(
              sra.scan_no_go_assessment->>'decision',
              ss.scan_no_go_assessment->>'decision'
            ) as "noGoDecision",
            coalesce(
              sra.scan_no_go_assessment->'reasonCodes',
              ss.scan_no_go_assessment->'reasonCodes',
              '[]'::jsonb
            ) as "noGoReasonCodes",
            d.hostname,
            coalesce(s.scan_config_json->>'normalizedUrl', d.normalized_url) as "normalizedUrl",
            s.scan_config_json->>'processor' as "v2ReportProcessor",
            (s.scan_config_json #>> '{execution,v2DagParallel,artifactOnly}') = 'true' as "v2ParallelArtifactOnly",
            (s.scan_config_json #>> '{execution,v2DagParallel,localOnly}') = 'true' as "v2ParallelLocalOnly",
            coalesce(
              (
                select jsonb_agg(se.metadata_json order by se.created_at desc)
                  from scan_events se
                 where se.scan_id = s.id
                   and se.event_type = 'v2_lambda_result.received'
              ),
              '[]'::jsonb
            ) as "v2LambdaResultEvents"
       from scans s
       join domains d on d.id = s.domain_id
       left join scan_snapshots ss on ss.scan_id = s.id
       left join scan_runtime_artifacts sra on sra.scan_id = s.id
      where (
          (s.organization_id is null and d.organization_id is null)
          or (
            $1::uuid is not null
            and s.organization_id is not distinct from $1::uuid
            and d.organization_id is not distinct from $1::uuid
          )
        )
        and s.status = 'completed'
        and coalesce(s.scan_type, 'full') = 'full'
        and s.completed_at is not null
        and s.completed_at >= $2::timestamptz - ($3::int * interval '1 hour')
        and s.completed_at <= $2::timestamptz
        and case coalesce(s.scan_config_json->>'scanFrom', '${DEFAULT_SCAN_FROM}')
              when 'eu' then 'eu_de'
              when 'uk' then 'eu_ie'
              else coalesce(s.scan_config_json->>'scanFrom', '${DEFAULT_SCAN_FROM}')
            end = $4
        and s.pages_requested >= $5
        and lower(regexp_replace(d.hostname, '^www\\.', '')) = lower(regexp_replace($6, '^www\\.', ''))
      order by s.completed_at desc, s.created_at desc
      limit 200`,
    [input.organizationId, now.toISOString(), windowHours, effectiveScanFrom, minPagesRequested, input.normalizedDomain],
    { readOnly: true }
  );

  return candidates.rows;
}

export async function getRecentScanReuseEligibility(
  input: RecentScanReuseInput,
  dependencies: { loadCandidates?: (value: RecentScanReuseInput) => Promise<RecentScanReuseCandidate[]> } = {}
) {
  const candidates = await (dependencies.loadCandidates ?? loadRecentScanReuseCandidates)(input);
  return evaluateRecentScanReuseCandidates(input, candidates);
}

export async function resolveRecentScanReuseDecision(
  input: RecentScanReuseInput & { forceNewScan?: boolean },
  dependencies: { getEligibility?: (value: RecentScanReuseInput) => Promise<RecentScanReuseEligibility> } = {}
): Promise<RecentScanReuseDecision> {
  if (input.forceNewScan === true) {
    return {
      action: "queue_fresh",
      eligibility: null,
      forceNewScan: true,
      reason: "fresh_rescan_requested"
    };
  }

  const getEligibility = dependencies.getEligibility ?? getRecentScanReuseEligibility;
  const eligibility = await getEligibility(input);
  return eligibility.eligible
    ? { action: "reuse", eligibility, forceNewScan: false }
    : { action: "queue_fresh", eligibility, forceNewScan: false, reason: "no_eligible_scan" };
}

export async function findRecentCompletedScanForDomain(input: RecentScanReuseInput) {
  const eligibility = await getRecentScanReuseEligibility(input);
  return eligibility.eligible ? eligibility.candidate : null;
}
