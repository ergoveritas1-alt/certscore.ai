export const USAGE_METRIC_KEYS = {
  manualFullScans: "manual_full_scans"
} as const;

export type UsageMetricKey = (typeof USAGE_METRIC_KEYS)[keyof typeof USAGE_METRIC_KEYS];
