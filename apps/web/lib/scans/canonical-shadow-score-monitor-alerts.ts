import type { CanonicalShadowScoreLunaDecision } from "./canonical-shadow-score-luna-decision";
import {
  auditLunaScoreDecision,
  GDPR_EPRIVACY_SHADOW_LUNA_DECISION
} from "./canonical-shadow-score-luna-decision";
import type { summarizeStoredCanonicalShadowComparisons } from "./canonical-shadow-score-monitor";

type MonitoringSummary = ReturnType<typeof summarizeStoredCanonicalShadowComparisons>;

type MonitoringAlertCode =
  | "absolute_score_delta_p95_above_limit"
  | "contradiction_rate_above_limit"
  | "cross_region_range_above_limit"
  | "cross_source_range_above_limit"
  | "insufficient_comparable_count"
  | "insufficient_cross_region_groups"
  | "insufficient_cross_source_groups"
  | "insufficient_sample_count"
  | "model_version_mismatch"
  | "withheld_rate_above_limit";

type MonitoringAlert = {
  code: MonitoringAlertCode;
  observed: number | string;
  threshold: number | string;
};

export function evaluateCanonicalShadowScoreMonitoring(
  summary: MonitoringSummary,
  decision: CanonicalShadowScoreLunaDecision = GDPR_EPRIVACY_SHADOW_LUNA_DECISION
) {
  if (decision.monitoringBaselines.status !== "approved_by_luna") {
    return {
      alerts: [] as MonitoringAlert[],
      decisionEvidenceArtifact: decision.monitoringBaselines.decisionEvidenceArtifact,
      modelVersion: decision.modelVersion,
      reason: "monitoring_baselines_pending_luna" as const,
      status: "withheld" as const
    };
  }
  if (auditLunaScoreDecision(decision, decision.modelVersion).some((error) => error.startsWith("monitoringBaselines."))) {
    return {
      alerts: [] as MonitoringAlert[],
      decisionEvidenceArtifact: decision.monitoringBaselines.decisionEvidenceArtifact,
      modelVersion: decision.modelVersion,
      reason: "monitoring_baselines_invalid" as const,
      status: "withheld" as const
    };
  }

  const alerts: MonitoringAlert[] = [];
  const thresholds = decision.monitoringBaselines.thresholds;
  const addBelow = (code: MonitoringAlertCode, observed: number, threshold: number | null) => {
    if (threshold !== null && observed < threshold) alerts.push({ code, observed, threshold });
  };
  const addAbove = (code: MonitoringAlertCode, observed: number | null, threshold: number | null) => {
    if (threshold !== null && observed !== null && observed > threshold) alerts.push({ code, observed, threshold });
  };

  addBelow("insufficient_sample_count", summary.sampleCount, thresholds.minimumSampleCount);
  addBelow("insufficient_comparable_count", summary.comparison.comparableCount, thresholds.minimumComparableCount);
  addBelow("insufficient_cross_region_groups", summary.crossRegion.comparedGroupCount, thresholds.minimumCrossRegionGroupCount);
  addBelow("insufficient_cross_source_groups", summary.crossSource.comparedGroupCount, thresholds.minimumCrossSourceGroupCount);
  addAbove("absolute_score_delta_p95_above_limit", summary.comparison.absoluteDeltaP95, thresholds.maximumAbsoluteScoreDeltaP95);
  addAbove("contradiction_rate_above_limit", summary.contradictions.rate, thresholds.maximumContradictionRate);
  addAbove("withheld_rate_above_limit", summary.withheldRate, thresholds.maximumWithheldRate);
  addAbove("cross_region_range_above_limit", summary.crossRegion.maximumScoreRange, thresholds.maximumCrossRegionScoreRange);
  addAbove("cross_source_range_above_limit", summary.crossSource.maximumScoreRange, thresholds.maximumCrossSourceScoreRange);

  const unexpectedModelVersion = summary.modelVersions.find((version) => version !== decision.modelVersion);
  if (unexpectedModelVersion) {
    alerts.push({
      code: "model_version_mismatch",
      observed: unexpectedModelVersion,
      threshold: decision.modelVersion
    });
  }

  return {
    alerts,
    decisionEvidenceArtifact: decision.monitoringBaselines.decisionEvidenceArtifact,
    modelVersion: decision.modelVersion,
    reason: null,
    status: alerts.length === 0 ? "within_approved_baseline" as const : "pause_rollout" as const
  };
}
