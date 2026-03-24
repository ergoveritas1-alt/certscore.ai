import { normalizeConcernFromPolicyReviewQueue } from "./normalized-concerns";

export function shouldSurfaceSupplementalPolicyReviewFinding(input: {
  evidence: Record<string, unknown> | null | undefined;
  reason: string;
  ruleKey: string;
}) {
  const concern = normalizeConcernFromPolicyReviewQueue({
    description: `Supplemental policy review signal for ${input.reason}.`,
    evidence: input.evidence,
    reason: input.reason,
    ruleKey: input.ruleKey,
    severity: "medium",
    title: input.ruleKey
  });

  return (
    concern.promotionEligibility === "eligible" &&
    concern.externalSurfacingEligibility === "eligible"
  );
}
