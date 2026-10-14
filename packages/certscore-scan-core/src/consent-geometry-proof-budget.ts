/** Partition an existing deadline without extending it or starving CDP when
 * the representative viewport uses the smaller 450 ms capture profile. */
export function consentGeometryProofCdpBudget(timeoutMs: number): number {
  const budget = Number.isFinite(timeoutMs) ? Math.max(2, Math.floor(timeoutMs)) : 2;
  const fallbackReserve = Math.min(750, Math.max(1, Math.floor(budget / 2)));
  return Math.max(1, Math.min(1_750, budget - fallbackReserve));
}

/** Owner-approved loading-consent settle: at most 3 seconds and 7.5 GB-seconds
 * per scan ($12.50 / 100k scans at $0.000016667 per GB-second), reserving
 * $2.50 of the approved $15 for retained images and requests. No new lane. */
export function consentProminenceSettleBudgetMs(memoryMb: number = 3008): number {
  const memory = Number.isFinite(memoryMb) && memoryMb >= 512 && memoryMb <= 10240 ? memoryMb : 10240;
  return Math.min(3000, Math.floor(7500 * 1024 / memory));
}
