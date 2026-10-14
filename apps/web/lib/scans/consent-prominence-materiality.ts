import { consentVisualProminenceProjectionSchema, hasTypedConsentVisualProminence } from "@certscore/contracts";

/** WC01 review policy, not a regulatory or accessibility threshold.
 * Existing evidence measures fill/emphasis and geometry, not label legibility.
 * A styling difference alone stays informational. The initial conservative
 * geometry corroborator requires Accept to have at least twice Reject's area,
 * with neither Accept dimension smaller. Do not infer unreadability or hidden
 * placement from fill contrast. Future corroborators require retained proof.
 */
export const CONSENT_PROMINENCE_MATERIALITY_POLICY = "consent_prominence_materiality.v1";
export function assessConsentProminenceMateriality(value: unknown) {
  const parsed = consentVisualProminenceProjectionSchema.safeParse(value);
  if (!parsed.success || !hasTypedConsentVisualProminence(parsed.data)) return null;
  const { accept, reject } = parsed.data.comparison;
  const areaRatio = accept.bounds[2] * accept.bounds[3] / (reject.bounds[2] * reject.bounds[3]);
  const materiallySmallerReject = areaRatio >= 2 && accept.bounds[2] >= reject.bounds[2] && accept.bounds[3] >= reject.bounds[3];
  return { policyVersion: CONSENT_PROMINENCE_MATERIALITY_POLICY,
    outcome: materiallySmallerReject ? "material" as const : "styling_only" as const,
    reason: materiallySmallerReject ? "styling_and_substantially_smaller_reject" : "styling_without_verified_material_disadvantage" };
}
