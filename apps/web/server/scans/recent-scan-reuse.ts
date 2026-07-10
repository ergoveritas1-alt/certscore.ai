import { queryOne } from "@website-signal-risk-scanner/db";
import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";

export const RECENT_SCAN_REUSE_WINDOW_HOURS = 24;

type CompletedScanCandidate = {
  completedAt: string | null;
  id: string;
  organizationId?: string | null;
};

type ScanHistoryCandidate = {
  completedAt: string | null;
  id?: string | null;
  status: string;
};

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

export function findRecentCompletedScanInHistory(scans: ScanHistoryCandidate[], now = new Date()): CompletedScanCandidate | null {
  return (
    scans
      .filter(
        (scan): scan is ScanHistoryCandidate & { id: string } =>
          typeof scan.id === "string" &&
          scan.id.length > 0 &&
          scan.status === "completed" &&
          isScanWithinReuseWindow({ completedAt: scan.completedAt, now })
      )
      .sort((left, right) => new Date(right.completedAt ?? 0).getTime() - new Date(left.completedAt ?? 0).getTime())[0] ?? null
  );
}

export async function findRecentCompletedScanForDomain(input: {
  minPagesRequested?: number;
  normalizedDomain: string;
  normalizedUrl: string;
  organizationId: string | null;
  scanFrom?: ScanFrom;
  windowHours?: number;
}) {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  const parameters: Array<string | number | null> = [
    input.organizationId,
    input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS,
    input.normalizedDomain,
    input.normalizedUrl,
    scanFrom
  ];
  const organizationParameter = "$1";
  const windowParameter = "$2";
  const domainParameter = "$3";
  const urlParameter = "$4";
  const scanFromParameter = "$5";
  const minPagesClause =
    typeof input.minPagesRequested === "number" && Number.isFinite(input.minPagesRequested)
      ? (() => {
          parameters.push(Math.floor(input.minPagesRequested));
          return `and s.pages_requested >= $${parameters.length}`;
        })()
      : "";

  return queryOne<CompletedScanCandidate>(
    `select s.id, s.organization_id as "organizationId", s.completed_at as "completedAt"
      from scans s
       join domains d on d.id = s.domain_id
      where 1 = 1
        and (
          (s.organization_id is null and d.organization_id is null)
          or (
            ${organizationParameter}::uuid is not null
            and s.organization_id is not distinct from ${organizationParameter}::uuid
            and d.organization_id is not distinct from ${organizationParameter}::uuid
          )
        )
        and s.status = 'completed'
        and coalesce(s.scan_type, 'full') = 'full'
        and s.completed_at is not null
        and s.completed_at >= timezone('utc', now()) - (${windowParameter}::int * interval '1 hour')
        and coalesce(s.scan_config_json->>'scanFrom', '${DEFAULT_SCAN_FROM}') = ${scanFromParameter}
        ${minPagesClause}
        and (lower(d.hostname) = lower(${domainParameter}) or lower(d.normalized_url) = lower(${urlParameter}))
      order by s.completed_at desc, s.created_at desc
      limit 1`,
    parameters,
    { readOnly: true }
  );
}
