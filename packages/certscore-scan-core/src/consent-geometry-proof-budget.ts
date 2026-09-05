/** Partition an existing deadline without extending it or starving CDP when
 * the representative viewport uses the smaller 450 ms capture profile. */
export function consentGeometryProofCdpBudget(timeoutMs: number): number {
  const budget = Number.isFinite(timeoutMs) ? Math.max(2, Math.floor(timeoutMs)) : 2;
  const fallbackReserve = Math.min(750, Math.max(1, Math.floor(budget / 2)));
  return Math.max(1, Math.min(1_750, budget - fallbackReserve));
}
