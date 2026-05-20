import { queryOne } from "@website-signal-risk-scanner/db";

export const RECENT_SCAN_REUSE_WINDOW_HOURS = 24;

type CompletedScanCandidate = {
  completedAt: string | null;
  id: string;
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
  normalizedDomain: string;
  normalizedUrl: string;
  organizationId: string | null;
  windowHours?: number;
}) {
  return queryOne<CompletedScanCandidate>(
    `select s.id, s.completed_at as "completedAt"
       from scans s
       join domains d on d.id = s.domain_id
      where s.organization_id is not distinct from $1
        and d.organization_id is not distinct from $1
        and s.status = 'completed'
        and s.completed_at is not null
        and s.completed_at >= timezone('utc', now()) - ($2::int * interval '1 hour')
        and (lower(d.hostname) = lower($3) or lower(d.normalized_url) = lower($4))
      order by s.completed_at desc, s.created_at desc
      limit 1`,
    [input.organizationId, input.windowHours ?? RECENT_SCAN_REUSE_WINDOW_HOURS, input.normalizedDomain, input.normalizedUrl],
    { readOnly: true }
  );
}
