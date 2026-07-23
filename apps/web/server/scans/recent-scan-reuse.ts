import { queryOne } from "@website-signal-risk-scanner/db";
import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";

export const RECENT_SCAN_REUSE_WINDOW_HOURS = 24;

export type RecentScanReuseCandidate = {
  accessPostureClass: string | null;
  completedAt: string | null;
  coverageLevel: string | null;
  hostname: string;
  id: string;
  normalizedUrl: string;
  noGoDecision?: string | null;
  organizationId: string | null;
  pagesRequested: number;
  pagesScanned: number;
  scanFrom: string | null;
  scanOutcome: string | null;
  scanType: string | null;
  status: string;
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
}) {
  if (scan.noGoDecision === "no_go") {
    return true;
  }
  return (
    (scan.pagesScanned === undefined || scan.pagesScanned === null || scan.pagesScanned > 0) &&
    scan.coverageLevel !== "limited_none" &&
    scan.accessPostureClass !== "early_loss" &&
    !NON_REUSABLE_SCAN_OUTCOMES.has(scan.scanOutcome ?? "")
  );
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
          isScanWithinReuseWindow({ completedAt: scan.completedAt, now })
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
        normalizeDomainForReuse(row.hostname) === requestedDomain ||
        normalizeUrlForReuse(row.normalizedUrl) === requestedUrl;

      return (
        scopeAllowed &&
        targetMatches &&
        row.status === "completed" &&
        hasReusableCoverage(row) &&
        (row.scanType ?? "full") === "full" &&
        isScanWithinReuseWindow({ completedAt: row.completedAt, now: input.now, windowHours: reuseWindowHours }) &&
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
    reuseWindowHours
  };
}

async function loadRecentScanReuseCandidates(input: RecentScanReuseInput) {
  const effectiveScanFrom = normalizeScanFrom(input.scanFrom);
  const minPagesRequested = Math.max(0, Math.floor(input.minPagesRequested));
  const windowHours = input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS;
  const now = input.now ?? new Date();

  const candidate = await queryOne<RecentScanReuseCandidate>(
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
            d.hostname,
            d.normalized_url as "normalizedUrl"
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
        and (
          coalesce(
            sra.scan_no_go_assessment->>'decision',
            ss.scan_no_go_assessment->>'decision'
          ) = 'no_go'
          or (
            s.pages_scanned > 0
            and coalesce(ss.coverage_level, '') <> 'limited_none'
            and coalesce(ss.access_posture_class, '') <> 'early_loss'
            and coalesce(ss.scan_outcome, '') not in (
              'navigation_transport_failure',
              'transport_failure',
              'timeout_navigation',
              'domain_inactive_or_unstable',
              'unknown_access_limitation',
              'verification_incomplete'
            )
          )
        )
        and (
          lower(regexp_replace(d.hostname, '^www\\.', '')) = lower(regexp_replace($6, '^www\\.', ''))
          or lower(regexp_replace(d.normalized_url, '^https?://www\\.', 'https://')) = lower(regexp_replace($7, '^https?://www\\.', 'https://'))
        )
      order by s.completed_at desc, s.created_at desc
      limit 1`,
    [input.organizationId, now.toISOString(), windowHours, effectiveScanFrom, minPagesRequested, input.normalizedDomain, input.normalizedUrl],
    { readOnly: true }
  );

  return candidate ? [candidate] : [];
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
