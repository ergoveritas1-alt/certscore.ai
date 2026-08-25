export const ADMIN_OPERATIONAL_SNAPSHOT_PERIODS = ["1h", "24h", "7d", "30d", "1y"] as const;

export type AdminOperationalSnapshotPeriod = (typeof ADMIN_OPERATIONAL_SNAPSHOT_PERIODS)[number];

export const ADMIN_OPERATIONAL_SNAPSHOT_CONFIG = {
  "1h": {
    bucketEnd: "date_bin('5 minutes', now(), timestamptz '2001-01-01')",
    bucketLabel: "HH24:MI",
    bucketStart: "date_bin('5 minutes', now(), timestamptz '2001-01-01') - interval '55 minutes'",
    comparisonInterval: "2 hours",
    interval: "1 hour",
    label: "Last hour",
    previousStart: "date_bin('5 minutes', now(), timestamptz '2001-01-01') - interval '1 hour 55 minutes'",
    step: "5 minutes",
  },
  "24h": {
    bucketEnd: "date_trunc('hour', now())",
    bucketLabel: "Mon DD HH24:00",
    bucketStart: "date_trunc('hour', now()) - interval '23 hours'",
    comparisonInterval: "48 hours",
    interval: "24 hours",
    label: "Last 24 hours",
    previousStart: "date_trunc('hour', now()) - interval '47 hours'",
    step: "1 hour",
  },
  "7d": {
    bucketEnd: "date_trunc('day', now())",
    bucketLabel: "Mon DD",
    bucketStart: "date_trunc('day', now()) - interval '6 days'",
    comparisonInterval: "14 days",
    interval: "7 days",
    label: "Last 7 days",
    previousStart: "date_trunc('day', now()) - interval '13 days'",
    step: "1 day",
  },
  "30d": {
    bucketEnd: "date_trunc('day', now())",
    bucketLabel: "Mon DD",
    bucketStart: "date_trunc('day', now()) - interval '29 days'",
    comparisonInterval: "60 days",
    interval: "30 days",
    label: "Last 30 days",
    previousStart: "date_trunc('day', now()) - interval '59 days'",
    step: "1 day",
  },
  "1y": {
    bucketEnd: "date_trunc('month', now())",
    bucketLabel: "Mon YYYY",
    bucketStart: "date_trunc('month', now()) - interval '11 months'",
    comparisonInterval: "2 years",
    interval: "1 year",
    label: "Last year",
    previousStart: "date_trunc('month', now()) - interval '23 months'",
    step: "1 month",
  },
} as const;

export const ADMIN_OPERATIONAL_METRIC_DEFINITIONS = {
  active: "Requests or runs currently queued, running, or finalizing.",
  actors: "Distinct retained caller identities. Anonymous activity without a stable identifier is not counted.",
  authenticated: "Activity associated with a retained authenticated identity.",
  errors: "Terminal failures and expired requests. Quota denials are reported separately.",
  latency: "Median and 95th-percentile retained execution duration for completed observations.",
  requests: "Logical requests after grouped result-fetch follow-ups and traffic visibility filters are applied.",
  reuse: "Requests satisfied by a previously completed scan instead of starting a new scan.",
  scans: "Distinct canonical scans linked to visible activity.",
  sessions: "Distinct opaque retained session identifiers; these are not user identities.",
  successful: "Requests or runs that reached a completed or completed-limited terminal state.",
} as const;

export type AdminOperationalMetricDefinition = keyof typeof ADMIN_OPERATIONAL_METRIC_DEFINITIONS;

export type AdminOperationalSnapshotComparison = {
  changeRatio: number | null;
  previousValue: number | null;
};

export type AdminOperationalSnapshotHealth = {
  label: string;
  status: "current" | "quiet" | "delayed";
};

export type AdminOperationalSnapshotDelta = {
  anomaly: "good" | "warning" | "critical" | null;
  label: string;
};

export function adminOperationalSnapshotComparison(current: number, previous: number): AdminOperationalSnapshotComparison {
  return {
    changeRatio: previous > 0 ? (current - previous) / previous : current > 0 ? null : 0,
    previousValue: previous,
  };
}

export function adminOperationalSnapshotDelta(
  current: number,
  previous: number,
  direction: "neutral" | "higher_is_bad" | "higher_is_good" = "neutral",
): AdminOperationalSnapshotDelta {
  if (previous === 0) {
    return { anomaly: null, label: current === 0 ? "0%" : "new" };
  }
  const changeRatio = (current - previous) / previous;
  const magnitude = Math.abs(changeRatio);
  const label = `${changeRatio > 0 ? "+" : ""}${Math.round(changeRatio * 100)}%`;
  if (magnitude < 0.1 || direction === "neutral") return { anomaly: null, label };
  const improved = direction === "higher_is_good" ? changeRatio > 0 : changeRatio < 0;
  return { anomaly: improved ? "good" : magnitude >= 0.25 ? "critical" : "warning", label };
}

export function adminOperationalSnapshotHref(basePath: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function adminOperationalSnapshotHealth(newestAt: string | null, period: AdminOperationalSnapshotPeriod): AdminOperationalSnapshotHealth {
  if (!newestAt) return { label: "No retained activity", status: "quiet" };
  const timestamp = new Date(newestAt).getTime();
  if (!Number.isFinite(timestamp)) return { label: "Freshness unavailable", status: "quiet" };
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  const delayedAfterMinutes = period === "1h" ? 15 : period === "24h" ? 120 : period === "7d" ? 1_440 : period === "30d" ? 4_320 : 43_200;
  if (ageMinutes > delayedAfterMinutes) {
    const value = ageMinutes < 1_440 ? `${Math.max(1, Math.floor(ageMinutes / 60))}h` : `${Math.floor(ageMinutes / 1_440)}d`;
    return { label: `Last activity ${value} ago`, status: "delayed" };
  }
  const value = ageMinutes < 1 ? "just now" : ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`;
  return { label: `Updated ${value}`, status: "current" };
}
