import type { GpcResponseAssessment } from "@certscore/contracts";

export const CALIFORNIA_GPC_RESPONSE_POLICY_VERSION = "california-gpc-response.v1" as const;
export const CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS = 15 as const;
export const CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY =
  "california.gpc_response.qualifying_activity_not_suppressed" as const;
export const CANONICAL_OVERALL_SCORE_SOURCE = "canonical.multi_framework" as const;
export const CANONICAL_OVERALL_SCORE_VERSION = "overall-posture.v2" as const;

export type CaliforniaGpcResponsePolicyAssessment = {
  assessmentStatus: "checked" | "gap_observed" | "needs_evidence" | "not_applicable" | "review_signal";
  deductionPoints: 0 | typeof CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS;
  eligibleActivity: {
    baseline: string[];
    persistedUnderGpc: string[];
    suppressedUnderGpc: string[];
  };
  policyKey: typeof CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY;
  policyVersion: typeof CALIFORNIA_GPC_RESPONSE_POLICY_VERSION;
  reasonCode:
    | "comparable_gpc_no_qualifying_suppression"
    | "comparable_gpc_partial_qualifying_suppression"
    | "comparable_gpc_qualifying_activity_suppressed"
    | "gpc_comparison_not_determinate"
    | "no_qualifying_sale_share_activity_observed";
  scoreEffect: "deduction" | "none";
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].map((value) => value.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 100);
}

function isCaliforniaSaleShareCandidateIdentity(value: string) {
  return /\|(?:advertising|marketing)$/i.test(value.trim());
}

function qualifyingIdentities(values: Iterable<string>) {
  return uniqueSorted([...values].filter(isCaliforniaSaleShareCandidateIdentity));
}

/**
 * Applies California scoring policy to a jurisdiction-neutral GPC comparison.
 * The policy deliberately uses only directly classified advertising/marketing
 * identities. Analytics, measurement, cookies, and CMP changes alone cannot
 * create this deduction because they do not establish sale/share treatment.
 */
export function deriveCaliforniaGpcResponsePolicy(
  assessment: GpcResponseAssessment,
): CaliforniaGpcResponsePolicyAssessment {
  const base = {
    policyKey: CALIFORNIA_GPC_NO_SUPPRESSION_POLICY_KEY,
    policyVersion: CALIFORNIA_GPC_RESPONSE_POLICY_VERSION,
  } as const;
  const comparable = assessment.status !== "indeterminate" &&
    assessment.comparison.comparable &&
    assessment.comparison.enabledProof.secGpcHeaderValue === "1" &&
    assessment.comparison.enabledProof.requestsWithSecGpc > 0 &&
    assessment.comparison.enabledProof.requestEventIds.length > 0 &&
    assessment.comparison.enabledProof.navigatorGlobalPrivacyControl === true;
  if (!comparable) {
    return {
      ...base,
      assessmentStatus: "needs_evidence",
      deductionPoints: 0,
      eligibleActivity: { baseline: [], persistedUnderGpc: [], suppressedUnderGpc: [] },
      reasonCode: "gpc_comparison_not_determinate",
      scoreEffect: "none",
    };
  }

  const advertising = assessment.comparison.deltas.advertisingOrMeasurementActivity;
  const trackers = assessment.comparison.deltas.trackers;
  const suppressedUnderGpc = qualifyingIdentities([
    ...advertising.baselineOnly,
    ...trackers.baselineOnly,
  ]);
  const persistedUnderGpc = qualifyingIdentities([
    ...advertising.shared,
    ...trackers.shared,
  ]);
  const baseline = uniqueSorted([...suppressedUnderGpc, ...persistedUnderGpc]);

  if (baseline.length === 0) {
    return {
      ...base,
      assessmentStatus: "not_applicable",
      deductionPoints: 0,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "no_qualifying_sale_share_activity_observed",
      scoreEffect: "none",
    };
  }

  if (persistedUnderGpc.length > 0 && suppressedUnderGpc.length === 0) {
    return {
      ...base,
      assessmentStatus: "gap_observed",
      deductionPoints: CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "comparable_gpc_no_qualifying_suppression",
      scoreEffect: "deduction",
    };
  }

  if (persistedUnderGpc.length === 0 && suppressedUnderGpc.length > 0) {
    return {
      ...base,
      assessmentStatus: "checked",
      deductionPoints: 0,
      eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
      reasonCode: "comparable_gpc_qualifying_activity_suppressed",
      scoreEffect: "none",
    };
  }

  return {
    ...base,
    assessmentStatus: "review_signal",
    deductionPoints: 0,
    eligibleActivity: { baseline, persistedUnderGpc, suppressedUnderGpc },
    reasonCode: "comparable_gpc_partial_qualifying_suppression",
    scoreEffect: "none",
  };
}
