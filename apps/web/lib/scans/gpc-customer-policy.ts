import {gpcResponseAssessmentSchema} from "@certscore/contracts";

/** Owner-approved evidence restoration; California effects use canonical concern policy. */
export const GPC_CUSTOMER_RESULTS_ENABLED: boolean = true;
export const GPC_CUSTOMER_POLICY_VERSION = "gpc-verified-evidence.v2";

/** Stored numeric scores change only when their retained canonical policy effects
 * include GPC. Do not recompute unrelated historical scores or add 15 to a floor. */
export function hasSuspendedGpcScoreEffect(scanRecord: unknown): boolean {
  if (!scanRecord || typeof scanRecord !== "object") return false;
  const projection = (scanRecord as {canonicalReportProjection?: {globalUnifiedFindings?: unknown; ownerUnifiedFindings?: unknown}}).canonicalReportProjection;
  const rows = projection?.globalUnifiedFindings ?? projection?.ownerUnifiedFindings;
  return Array.isArray(rows) && rows.some(row => row?.unifiedFindingId === "gpc_response" && Array.isArray(row.scoreEffects) &&
    row.scoreEffects.some((effect: {appliesTo?: string; framework?: string; deductionPoints?: number}) => effect.appliesTo === "certscore_overall" && effect.framework === "california" && (effect.deductionPoints ?? 0) > 0));
}

/** Eligibility is decided once in concern policy; presentation repeats this
 * guard only to reject older persisted packets lacking verified signal proof. */
export function hasVerifiedCustomerGpcEvidence(value: unknown): boolean {
  const parsed = gpcResponseAssessmentSchema.safeParse(value);
  if (!parsed.success || parsed.data.contractVersion === "certscore.gpc-response-assessment.v1") return false;
  const a = parsed.data;
  const delivery = a.comparison.delivery;
  const main = delivery.gpc?.frames.filter(frame => frame.mainFrame);
  const pairedDelivery = delivery.status === "verified" && main?.length === 1 && main[0]?.navigatorValue === true &&
    a.comparison.enabledProof.secGpcHeaderValue === "1" && a.comparison.enabledProof.requestsWithSecGpc > 0;
  const boundedDelivery = a.contractVersion === "certscore.gpc-response-assessment.v3" &&
    a.observation.status !== "unavailable" && Boolean(a.observation.sourceSha256 && a.observation.sessionSha256 && a.observation.documentUrlSha256) &&
    a.observation.delivery.httpHeaderRetained && a.observation.delivery.mainNavigatorReadbackRetained;
  return Boolean(pairedDelivery || boundedDelivery);
}
