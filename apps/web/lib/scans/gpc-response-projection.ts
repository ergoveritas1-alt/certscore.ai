import { gpcResponseAssessmentSchema, type GpcResponseAssessment } from "@certscore/contracts";
import {
  CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
  CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
  CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
} from "./california-gpc-response-policy";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

export type CanonicalGpcResponseProjection = {
  assessment: GpcResponseAssessment;
  californiaDeductionPoints: 0 | 15;
  summary: string;
};

/**
 * Projects GPC only from the canonical unified-finding output. Callers must
 * not rebuild a GPC result directly from raw lane artifacts.
 */
export function buildCanonicalGpcResponseProjection(
  findings: UnifiedFindingDisplayPacket[],
): CanonicalGpcResponseProjection | null {
  const finding = findings.find((candidate) =>
    candidate.unifiedFindingId === "gpc_response" &&
    candidate.presentationDecision.status === "surface"
  );
  if (!finding || finding.details?.family !== "privacy_signal" || finding.details.kind !== "gpc_response") {
    return null;
  }

  const parsedAssessment = gpcResponseAssessmentSchema.safeParse(finding.details.assessment);
  if (!parsedAssessment.success) {
    return null;
  }

  const californiaDeduction = finding.scoreEffects?.find((effect) =>
    effect.appliesTo === "certscore_overall" &&
    effect.framework === "california" &&
    effect.policyKey === CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY &&
    effect.policyVersion === CALIFORNIA_GPC_RESPONSE_POLICY_VERSION &&
    effect.deductionPoints === CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS
  );

  return {
    assessment: parsedAssessment.data,
    californiaDeductionPoints: californiaDeduction
      ? CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS
      : 0,
    summary: finding.summary,
  };
}
