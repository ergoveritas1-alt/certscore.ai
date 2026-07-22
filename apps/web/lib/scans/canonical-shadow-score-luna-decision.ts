import decisionJson from "./gdpr-eprivacy-shadow-luna-decision.json";
import { LUNA_EXPECTED_BAND_LANE_IDS } from "./canonical-shadow-score-benchmark-lanes";

export { LUNA_EXPECTED_BAND_LANE_IDS } from "./canonical-shadow-score-benchmark-lanes";

export const LUNA_COVERAGE_METRIC_IDS = [
  "model_eligibility_coverage",
  "report_usable_evidence"
] as const;

type LunaDecisionStatus = "pending_luna" | "approved_by_luna";

export type CanonicalShadowScoreLunaDecision = {
  schemaVersion: "gdpr-eprivacy-shadow-luna-decision.v1";
  modelVersion: string;
  decisionStatus: LunaDecisionStatus;
  coverageSemantics: {
    status: LunaDecisionStatus;
    selectedCustomerFacingMetric: string | null;
    recommendedCustomerFacingMetric: string;
    options: Array<{ metricId: string; label: string; meaning: string }>;
    decisionEvidenceArtifact: string | null;
  };
  benchmarkCorpus: {
    status: LunaDecisionStatus;
    corpusId: string | null;
    centralContactHistoryExportArtifact: string | null;
    canonicalSelectorArtifact: string | null;
    retainedReplayArtifact: string | null;
    ownedCanaryArtifact: string | null;
    governedPublicSampleArtifact: string | null;
  };
  expectedBandLanes: Array<{
    laneId: string;
    status: LunaDecisionStatus;
    expectedPostureBand: string | null;
    evidenceArtifact: string | null;
  }>;
  modelParameters: {
    status: LunaDecisionStatus;
    approvedModelArtifact: string | null;
    decisionEvidenceArtifact: string | null;
  };
  signOff: {
    status: LunaDecisionStatus;
    approvedBy: string | null;
    approvedAt: string | null;
    approvalEvidenceArtifact: string | null;
  };
};

function populated(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function auditLunaScoreDecision(
  decision: CanonicalShadowScoreLunaDecision,
  expectedModelVersion = decision.modelVersion
) {
  const errors: string[] = [];
  const metricIds = decision.coverageSemantics.options.map((option) => option.metricId).sort();
  const laneIds = decision.expectedBandLanes.map((lane) => lane.laneId).sort();
  const validStatuses = new Set<LunaDecisionStatus>(["pending_luna", "approved_by_luna"]);

  if (decision.schemaVersion !== "gdpr-eprivacy-shadow-luna-decision.v1") errors.push("schemaVersion");
  if (decision.modelVersion !== expectedModelVersion) errors.push("modelVersion");
  if (!validStatuses.has(decision.decisionStatus)) errors.push("decisionStatus");
  if (new Set(metricIds).size !== metricIds.length) errors.push("coverageSemantics.duplicateMetricId");
  if (metricIds.join("|") !== [...LUNA_COVERAGE_METRIC_IDS].sort().join("|")) {
    errors.push("coverageSemantics.metricIds");
  }
  if (!decision.coverageSemantics.options.every((option) => populated(option.label) && populated(option.meaning))) {
    errors.push("coverageSemantics.options");
  }
  if (new Set(laneIds).size !== laneIds.length) errors.push("expectedBandLanes.duplicateLaneId");
  if (laneIds.join("|") !== [...LUNA_EXPECTED_BAND_LANE_IDS].sort().join("|")) {
    errors.push("expectedBandLanes.laneIds");
  }

  if (decision.decisionStatus === "approved_by_luna") {
    const selectedMetric = decision.coverageSemantics.selectedCustomerFacingMetric;
    if (decision.coverageSemantics.status !== "approved_by_luna") errors.push("coverageSemantics.status");
    if (!selectedMetric || !metricIds.includes(selectedMetric)) errors.push("coverageSemantics.selectedCustomerFacingMetric");
    if (!populated(decision.coverageSemantics.decisionEvidenceArtifact)) errors.push("coverageSemantics.decisionEvidenceArtifact");

    if (decision.benchmarkCorpus.status !== "approved_by_luna") errors.push("benchmarkCorpus.status");
    for (const field of [
      "corpusId",
      "centralContactHistoryExportArtifact",
      "canonicalSelectorArtifact",
      "retainedReplayArtifact",
      "ownedCanaryArtifact",
      "governedPublicSampleArtifact"
    ] as const) {
      if (!populated(decision.benchmarkCorpus[field])) errors.push(`benchmarkCorpus.${field}`);
    }

    for (const lane of decision.expectedBandLanes) {
      if (lane.status !== "approved_by_luna") errors.push(`expectedBandLanes.${lane.laneId}.status`);
      if (!populated(lane.expectedPostureBand)) errors.push(`expectedBandLanes.${lane.laneId}.expectedPostureBand`);
      if (!populated(lane.evidenceArtifact)) errors.push(`expectedBandLanes.${lane.laneId}.evidenceArtifact`);
    }

    if (decision.modelParameters.status !== "approved_by_luna") errors.push("modelParameters.status");
    if (!populated(decision.modelParameters.approvedModelArtifact)) errors.push("modelParameters.approvedModelArtifact");
    if (!populated(decision.modelParameters.decisionEvidenceArtifact)) errors.push("modelParameters.decisionEvidenceArtifact");
    if (decision.signOff.status !== "approved_by_luna") errors.push("signOff.status");
    if (!populated(decision.signOff.approvedBy)) errors.push("signOff.approvedBy");
    if (!populated(decision.signOff.approvedAt) || Number.isNaN(Date.parse(decision.signOff.approvedAt ?? ""))) {
      errors.push("signOff.approvedAt");
    }
    if (!populated(decision.signOff.approvalEvidenceArtifact)) errors.push("signOff.approvalEvidenceArtifact");
  }

  return [...new Set(errors)].sort();
}

export function isLunaScoreDecisionApprovedForModel(
  decision: CanonicalShadowScoreLunaDecision,
  modelVersion: string
) {
  return decision.decisionStatus === "approved_by_luna" && auditLunaScoreDecision(decision, modelVersion).length === 0;
}

export const GDPR_EPRIVACY_SHADOW_LUNA_DECISION = decisionJson as CanonicalShadowScoreLunaDecision;
