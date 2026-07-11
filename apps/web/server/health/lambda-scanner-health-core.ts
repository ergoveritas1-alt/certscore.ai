export type LambdaScannerRegionStatus = "healthy" | "unavailable" | "unknown";

export function classifyLambdaScannerFleet(regions: Array<{ status: LambdaScannerRegionStatus }>) {
  const healthy = regions.filter((region) => region.status === "healthy").length;
  const unknown = regions.filter((region) => region.status === "unknown").length;
  if (healthy === regions.length && regions.length > 0) return "healthy" as const;
  if (healthy > 0) return "degraded" as const;
  if (unknown > 0) return "unknown" as const;
  return "unavailable" as const;
}

export function isLambdaScannerHealthStale(checkedAt: string, nowMs = Date.now(), maxAgeMs = 2 * 60_000) {
  const checkedAtMs = new Date(checkedAt).getTime();
  return !Number.isFinite(checkedAtMs) || nowMs - checkedAtMs > maxAgeMs;
}
