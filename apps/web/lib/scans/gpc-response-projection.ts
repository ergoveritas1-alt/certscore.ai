import { gpcReaderSummary } from "./gpc-reader-summary";
import {deriveCaliforniaGpcResponsePolicy} from "./california-gpc-response-policy";
import { GPC_CUSTOMER_RESULTS_ENABLED, hasVerifiedCustomerGpcEvidence } from "./gpc-customer-policy";
import { gpcResponseAssessmentSchema, type GpcResponseAssessment, type GpcActivityComparison } from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { describeGpcObservedFacts } from "./gpc-observed-facts";
import { readGpcActivityComparison } from "./gpc-activity-comparison";

export type CanonicalGpcResponseProjection = {
  vendorFindings?: ReturnType<typeof import("./choice-vendor-findings").gpcVendorFindings>;
  assessment: GpcResponseAssessment;
  californiaDeductionPoints: import("./california-choice-enforcement-policy").CaliforniaChoiceEnforcementPoints;
  comparisonHeadline: string;
  coverageSummary: string;
  headline: string;
  summary: string;
  observedFacts: ReturnType<typeof describeGpcObservedFacts>;
  activityComparison?: import("@certscore/contracts").GpcActivityComparison;
};

function comparisonCoverageSummary(assessment: GpcResponseAssessment) {
  if (assessment.status !== "indeterminate") {
    return assessment.status === "responsive"
      ? "The matched passive comparison observed reduced classified tracking activity with GPC."
      : "The matched passive comparison did not observe a qualifying reduction in classified tracking activity with GPC. This observation alone is not a legal compliance conclusion.";
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

export function hasNoQualifiedGpcActivity(assessment: {comparison:{comparable:boolean;deltas:{trackers:{baselineCount:number;gpcCount:number}}}}) {
  return assessment.comparison.comparable && assessment.comparison.deltas.trackers.baselineCount === 0 &&
    assessment.comparison.deltas.trackers.gpcCount === 0;
}

function describeResponseComparison(assessment: GpcResponseAssessment) {
  if (hasNoQualifiedGpcActivity(assessment)) return {
    headline:"No qualifying tracking activity observed",
    coverageSummary:"The completed matched visits observed no classified tracking activity in either condition. There was no qualifying activity whose suppression could be tested.",
  };
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

/** Describes the already-verified fixed-window measurement independently of
 * the historical whole-page quiet test. It never changes response eligibility. */
export function describeMeasuredGpcActivity(comparison?: GpcActivityComparison) {
  if (!comparison) return null;
  const seconds = comparison.durationMs / 1000;
  const { advertisingMarketing: ads, analyticsReplay: analytics } = comparison.activity;
  return {
    headline: `${seconds}-second matched comparison`,
    summary: `Over the same ${seconds}-second interval after page commit, advertising/marketing requests: ${ads.baselineRequests} without GPC and ${ads.gpcRequests} with GPC; analytics/replay requests: ${analytics.baselineRequests} without GPC and ${analytics.gpcRequests} with GPC.`,
  };
}

/**
 * Projects GPC only from the canonical unified-finding output. Callers must
 * not rebuild a GPC result directly from raw lane artifacts.
 */
export function buildCanonicalGpcResponseProjection(
  findings: UnifiedFindingDisplayPacket[],
): CanonicalGpcResponseProjection | null {
  if (!GPC_CUSTOMER_RESULTS_ENABLED) return null;
  const finding = findings.find((candidate) =>
    candidate.unifiedFindingId === "gpc_response" &&
    candidate.presentationDecision.status === "surface"
  );
  if (!finding || finding.details?.family !== "privacy_signal" || finding.details.kind !== "gpc_response") {
    return null;
  }

  const parsedAssessment = gpcResponseAssessmentSchema.safeParse(finding.details.assessment);
  if (!parsedAssessment.success || !hasVerifiedCustomerGpcEvidence(parsedAssessment.data)) {
    return null;
  }

  const policy=deriveCaliforniaGpcResponsePolicy(parsedAssessment.data);
  const deduction=finding.scoreEffects?.some(e=>e.appliesTo === "california_posture" && e.policyVersion === policy.policyVersion &&
    e.policyKey === policy.policyKey && e.deductionPoints === policy.deductionPoints) ? policy.deductionPoints : 0;
  const activityComparison = readGpcActivityComparison(finding.details.activityComparison, parsedAssessment.data);
  const measured = describeMeasuredGpcActivity(activityComparison);
  const presentation = describeCanonicalGpcResponse(parsedAssessment.data);
  const observedFacts = describeGpcObservedFacts(parsedAssessment.data.contractVersion === "certscore.gpc-response-assessment.v3"
    ? parsedAssessment.data.observation : undefined);
  if (finding.details.vendorFindings?.length) {
    observedFacts.unshift({label: "Advertising activity with GPC", value: finding.details.vendorFindings.map(row =>
      `${row.entity}${row.firstMs === undefined ? "" : ` · first observed +${row.firstMs} ms from GPC visit start`}`).join("; ")});
  }
  if (measured) {
    observedFacts.push({ label: measured.headline, value: measured.summary });
  } else if (observedFacts.length && parsedAssessment.data.comparison.comparable) {
    observedFacts.push({ label: "Matched comparison", value: presentation.comparisonHeadline });
  }

  return {
    assessment: parsedAssessment.data,
    vendorFindings: finding.details.vendorFindings,
    californiaDeductionPoints: deduction,
    coverageSummary: measured?.summary ?? presentation.coverageSummary,
    comparisonHeadline: measured?.headline ?? presentation.comparisonHeadline,
    headline: presentation.headline,
    summary: gpcReaderSummary(finding.summary),
    observedFacts,
    activityComparison,
  };
}
