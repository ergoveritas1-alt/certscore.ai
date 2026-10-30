import { adminOperationalSnapshotHref } from "./admin-operational-snapshot";

/** Recency at the same refresh as the displayed snapshot; missing is not zero. */
export function adminScanMinutesSince(lastScanAt: string | null | undefined, refreshedAt: string): number | null {
  if (!lastScanAt) return null;
  const elapsed = Date.parse(refreshedAt) - Date.parse(lastScanAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? Math.floor(elapsed / 60_000) : null;
}

export const ADMIN_SCAN_ACTIVITY_PERIODS = ["1h", "4h", "12h", "24h", "7d", "30d", "31d", "1y", "all"] as const;
export type AdminScanActivityPeriod = typeof ADMIN_SCAN_ACTIVITY_PERIODS[number];

// Operational ledger state captured with the counts, independent of later row
// enrichment. This does not alter report evidence, findings or score projections.
export function adminScanActivityOperationalStatus(row: { row_kind: "scan" | "request"; scan_id: string | null; status: string; no_go_flag: boolean | null; access_posture_class: string | null }) {
  const label = row.row_kind === "request" && !row.scan_id && ["rejected", "rate_limited", "failed", "expired"].includes(row.status)
    ? ({ rejected: "Rejected", rate_limited: "Rate limited", failed: "Failed", expired: "Expired" } as Record<string, string>)[row.status]!
    : row.no_go_flag ? "No-go"
    : row.status === "failed" ? "Failed"
    : row.status === "running" ? "Running"
    : row.status === "queued" ? "Queued"
    : row.status === "finalizing" ? "Finalizing"
    : ["degraded_but_useful", "robots_limited"].includes(row.access_posture_class ?? "") ? "Limited"
    : row.row_kind === "request" ? "Request"
    : row.status === "completed" ? "Completed" : "Unknown";
  const className = ["No-go", "Failed", "Rejected", "Rate limited", "Expired"].includes(label) ? "bg-rose-500"
    : ["Running", "Queued", "Finalizing", "Limited"].includes(label) ? "bg-amber-400"
    : label === "Request" ? "bg-sky-400" : label === "Completed" ? "bg-emerald-500" : "bg-slate-400";
  return { label, className };
}

export function resolveAdminScanActivityPeriod(params: { timeSpan?: string; snapshot?: string }): AdminScanActivityPeriod {
  // Explicit table scope wins for old URLs containing both independent periods.
  for (const value of [params.timeSpan, params.snapshot]) {
    if (ADMIN_SCAN_ACTIVITY_PERIODS.includes(value as AdminScanActivityPeriod)) return value as AdminScanActivityPeriod;
  }
  return "24h";
}

export function adminScanActivityPeriodLabel(period: AdminScanActivityPeriod) {
  return period === "all" ? "All time" : period === "1y" ? "Last 365 days" : `Last ${period.slice(0, -1)} ${period.endsWith("h") ? "hours" : "days"}`;
}

export function adminScanActivityWindow(period: AdminScanActivityPeriod, asOf = new Date()) {
  const hours = period === "all" ? null : period === "1y" ? 365 * 24 : Number.parseInt(period, 10) * (period.endsWith("d") ? 24 : 1);
  const end = asOf.toISOString();
  const start = hours === null ? null : new Date(asOf.getTime() - hours * 3_600_000).toISOString();
  const previousStart = hours === null ? null : new Date(asOf.getTime() - hours * 2 * 3_600_000).toISOString();
  return { end, start, previousStart };
}

export function adminScanActivityHref(params: Record<string, string | null | undefined>, changes: Record<string, string | null | undefined> = {}) {
  const { snapshot: _legacy, page: _page, ...scope } = params;
  return adminOperationalSnapshotHref("/app/admin/scans", { ...scope, timeSpan: resolveAdminScanActivityPeriod(params), ...changes });
}
