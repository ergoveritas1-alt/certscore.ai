import { projectExternalScanNoGo } from "@website-signal-risk-scanner/shared";

export type ScanReportAccessContext = {
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  snapshot?: Record<string, unknown> | null;
};

/** Consume the retained decision; never reconstruct access from page text or HTTP hints. */
export function projectScanReportNoGo(input: ScanReportAccessContext) {
  const runtime = input.runtimeArtifacts;
  return projectExternalScanNoGo({
    scan_no_go_assessment: runtime?.scan_no_go_assessment ?? runtime?.scanNoGoAssessment
      ?? input.snapshot?.scan_no_go_assessment,
    visual_access_review: runtime?.visual_access_review ?? runtime?.visualAccessReview
      ?? input.snapshot?.visual_access_review,
  });
}

/** A withheld score must not fall back to an older numeric snapshot. */
export function resolveScanReportScore(input: ScanReportAccessContext, score: number | null) {
  const confidence = input.runtimeArtifacts?.scoreConfidence ??
    input.runtimeArtifacts?.score_confidence ??
    input.snapshot?.score_confidence;
  return projectScanReportNoGo(input) ||
    confidence === "withheld_incomplete_runtime_coverage" ||
    confidence === "withheld_incomplete_critical_coverage"
    ? null
    : score;
}

/** Withhold ineligible report scores without rewriting retained evidence or assessment decisions. */
export function withScanReportDisposition<T extends ScanReportAccessContext>(input: T): T {
  const noGo = projectScanReportNoGo(input);
  if (!noGo && resolveScanReportScore(input, 0) !== null) return input;
  return {
    ...input,
    snapshot: {
      ...input.snapshot,
      certscore_overall: null,
      consent_maturity_score: null,
      consent_score: null,
      legal_coverage_score: null,
      privacy_score: null,
      ...(noGo ? { report_finding_count: 0, top_finding_count: 0 } : {}),
      score_source: null,
      score_version: null,
      score_scored_at: null,
    },
  };
}
