/** Owner decision, October 16, 2026. Evidence remains retained for internal diagnostics. */
export const GPC_CUSTOMER_RESULTS_ENABLED: boolean = false;
export const GPC_CUSTOMER_POLICY_VERSION = "gpc-customer-suspension.v1";

/** Stored numeric scores change only when their retained canonical policy effects
 * include GPC. Do not recompute unrelated historical scores or add 15 to a floor. */
export function hasSuspendedGpcScoreEffect(scanRecord: unknown): boolean {
  if (!scanRecord || typeof scanRecord !== "object") return false;
  const projection = (scanRecord as {canonicalReportProjection?: {globalUnifiedFindings?: unknown; ownerUnifiedFindings?: unknown}}).canonicalReportProjection;
  const rows = projection?.globalUnifiedFindings ?? projection?.ownerUnifiedFindings;
  return Array.isArray(rows) && rows.some(row => row?.unifiedFindingId === "gpc_response" && Array.isArray(row.scoreEffects) &&
    row.scoreEffects.some((effect: {appliesTo?: string; framework?: string; deductionPoints?: number}) => effect.appliesTo === "certscore_overall" && effect.framework === "california" && (effect.deductionPoints ?? 0) > 0));
}
