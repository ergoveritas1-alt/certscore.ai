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
  comparisonHeadline: string;
  coverageSummary: string;
  headline: string;
  summary: string;
};

function comparisonCoverageSummary(assessment: GpcResponseAssessment) {
  if (assessment.status !== "indeterminate") {
    return assessment.status === "responsive"
      ? "The matched passive comparison observed reduced classified tracking activity with GPC."
      : "The matched passive comparison did not observe a qualifying reduction in classified tracking activity with GPC.";
  }

  const limits = new Set(assessment.comparison.limitationKeys);
  const deliveryVerified = assessment.contractVersion !== "certscore.gpc-response-assessment.v1" &&
    assessment.comparison.delivery.status === "verified";
  const prefix = deliveryVerified
    ? "GPC signal delivery was verified. "
    : "GPC signal delivery or its paired evidence was not fully verified. ";

  if (limits.has("baseline_settle_not_completed") && limits.has("gpc_settle_not_completed")) {
    return `${prefix}Neither passive lane reached the required 250 ms quiet period within the existing capture cap, so no response conclusion was made.`;
  }
  if (limits.has("baseline_settle_not_completed")) {
    return `${prefix}The baseline lane did not reach the required 250 ms quiet period within the existing capture cap, so no response conclusion was made.`;
  }
  if (limits.has("gpc_settle_not_completed")) {
    return `${prefix}The GPC lane did not reach the required 250 ms quiet period within the existing capture cap, so no response conclusion was made.`;
  }
  if (limits.has("paired_observation_window_insufficient")) {
    return `${prefix}The shared observation interval was too short for a response comparison, so no response conclusion was made.`;
  }
  return `${prefix}The paired comparison did not meet the required evidence coverage, so no response conclusion was made.`;
}

function describeResponseComparison(assessment: GpcResponseAssessment) {
  if (assessment.status === "responsive") {
    return {
      coverageSummary: comparisonCoverageSummary(assessment),
      headline: "Response observed",
    };
  }
  if (assessment.status === "no_observable_response") {
    return {
      coverageSummary: comparisonCoverageSummary(assessment),
      headline: "No observable response",
    };
  }
  const signalVerified = assessment.contractVersion !== "certscore.gpc-response-assessment.v1" &&
    assessment.comparison.delivery.status === "verified";
  return {
    coverageSummary: comparisonCoverageSummary(assessment),
    headline: signalVerified ? "Signal verified · Comparison incomplete" : "Comparison incomplete",
  };
}

export function describeCanonicalGpcResponse(assessment: GpcResponseAssessment) {
  const comparison = describeResponseComparison(assessment);
  // v3 independently assesses completion of the GPC observation. A limited
  // paired comparison must not relabel a completed observation as incomplete.
  // This describes the persisted assessment; it does not change any finding or score.
  const headline = assessment.contractVersion === "certscore.gpc-response-assessment.v3"
    ? assessment.observation.status === "complete"
      ? "Observation complete"
      : assessment.observation.status === "limited"
        ? "Observation limited"
        : "Observation unavailable"
    : comparison.headline;
  return { ...comparison, comparisonHeadline: comparison.headline, headline };
}

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
  const presentation = describeCanonicalGpcResponse(parsedAssessment.data);

  return {
    assessment: parsedAssessment.data,
    californiaDeductionPoints: californiaDeduction
      ? CALIFORNIA_GPC_NO_SUPPRESSION_DEDUCTION_POINTS
      : 0,
    coverageSummary: presentation.coverageSummary,
    comparisonHeadline: presentation.comparisonHeadline,
    headline: presentation.headline,
    summary: finding.summary,
  };
}
