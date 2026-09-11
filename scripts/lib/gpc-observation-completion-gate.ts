/**
 * Diagnostic-only gate for a preregistered GPC observation calibration.
 *
 * This deliberately has no dependency on scanner or assessment contracts. It
 * measures whether a bounded observation was completed; it does not measure
 * opt-out success, legal compliance, or tracker suppression.
 */

export type GpcObservationTerminalStatus =
  | "observed"
  | "unsupported"
  | "unavailable"
  | "not_ready"
  | "incomplete";

export type GpcObservationCompletionRow = {
  scanId: string;
  observationScope: "main_document_and_retained_http_requests";
  /** Frozen, immutable cohort-manifest decision. Evidence quality never sets this. */
  manifestEligible: boolean;
  representativeAccess: "representative" | "non_representative" | "unknown";
  cohortSourceVerified: boolean;
  canary: boolean;
  retainedArtifactVerified: boolean;
  mainDocumentBindingVerified: boolean;
  delivery: {
    httpHeaderRetained: boolean;
    mainNavigatorReadbackRetained: boolean;
    fullContextVerified: boolean;
  };
  semanticProbe: {
    terminalStatus: GpcObservationTerminalStatus;
    started: boolean;
    ended: boolean;
  };
  requestCapture: {
    started: boolean;
    ended: boolean;
    noDrops: boolean;
  };
  observedFactsDirect: boolean;
};

export type GpcObservationCompletionGateOptions = {
  targetRate?: number;
  minimumRepresentativeRows?: number;
  confidenceLevel?: number;
};

export type GpcObservationCompletionGateResult = {
  diagnosticOnly: true;
  productionEligible: false;
  targetRate: number;
  minimumRepresentativeRows: number;
  confidenceLevel: number;
  allSubmittedCount: number;
  uniqueSubmittedCount: number;
  duplicateScanIds: string[];
  excludedNonRepresentativeCount: number;
  excludedCanaryCount: number;
  excludedUnverifiedCohortCount: number;
  accessCounts: { representative: number; nonRepresentative: number; unknown: number };
  includedNonRepresentativeFailureCount: number;
  representativeDenominator: number;
  completedRepresentativeCount: number;
  fullContextVerifiedCount: number;
  fullContextRate: number | null;
  completionRate: number | null;
  confidenceInterval: { lower: number | null; upper: number | null };
  pointEstimateAboveTarget: boolean;
  confidenceBoundAboveTarget: boolean;
  targetAchieved: boolean;
  allAttemptCompletedCount: number;
  allAttemptCompletionRate: number | null;
  failedRepresentativeRows: Array<{ scanId: string; reasons: string[] }>;
  gateReasons: string[];
  recommendation: string;
};

const TERMINAL_STATUSES = new Set<GpcObservationTerminalStatus>([
  "observed", "unsupported", "unavailable",
]);

function wilson(successes: number, total: number, confidence: number) {
  if (total === 0) return { lower: null, upper: null };
  // Normal quantiles needed by this diagnostic's supported confidence levels.
  const z = confidence >= 0.999 ? 3.291 : confidence >= 0.99 ? 2.576 : confidence >= 0.95 ? 1.96 : 1.645;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
  return { lower: Math.max(0, (centre - spread) / denominator), upper: Math.min(1, (centre + spread) / denominator) };
}

function completionReasons(row: GpcObservationCompletionRow): string[] {
  const reasons: string[] = [];
  if (row.observationScope !== "main_document_and_retained_http_requests") reasons.push("unsupported_observation_scope");
  if (row.representativeAccess !== "representative") reasons.push("representative_access_not_verified");
  if (!row.cohortSourceVerified) reasons.push("cohort_provenance_unverified");
  if (row.canary) reasons.push("canary_excluded");
  if (!row.retainedArtifactVerified) reasons.push("retained_artifact_unverified");
  if (!row.mainDocumentBindingVerified) reasons.push("main_document_binding_unverified");
  if (!row.delivery.httpHeaderRetained) reasons.push("http_delivery_not_retained");
  if (!row.delivery.mainNavigatorReadbackRetained) reasons.push("main_navigator_readback_not_retained");
  if (!TERMINAL_STATUSES.has(row.semanticProbe.terminalStatus)) reasons.push(`semantic_probe_${row.semanticProbe.terminalStatus}`);
  if (!row.semanticProbe.started) reasons.push("semantic_probe_not_started");
  if (!row.semanticProbe.ended) reasons.push("semantic_probe_not_ended");
  if (!row.requestCapture.started) reasons.push("request_capture_not_started");
  if (!row.requestCapture.ended) reasons.push("request_capture_not_ended");
  if (!row.requestCapture.noDrops) reasons.push("request_capture_drops_or_unknown");
  if (!row.observedFactsDirect) reasons.push("observed_facts_not_direct");
  return reasons;
}

export function evaluateGpcObservationCompletionGate(
  rows: readonly GpcObservationCompletionRow[],
  options: GpcObservationCompletionGateOptions = {},
): GpcObservationCompletionGateResult {
  const targetRate = options.targetRate ?? 0.95;
  const minimumRepresentativeRows = options.minimumRepresentativeRows ?? 100;
  const confidenceLevel = options.confidenceLevel ?? 0.95;
  if (!(targetRate > 0 && targetRate < 1) || !(Number.isInteger(minimumRepresentativeRows) && minimumRepresentativeRows > 0) || ![0.9, 0.95, 0.99, 0.999].includes(confidenceLevel)) {
    throw new Error("Invalid GPC completion gate options");
  }
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.scanId, (counts.get(row.scanId) ?? 0) + 1);
  const duplicateScanIds = [...counts].filter(([, count]) => count > 1).map(([scanId]) => scanId).sort();
  const uniqueRows = rows.filter(row => (counts.get(row.scanId) ?? 0) === 1);
  // The frozen manifest decides the submitted cohort. Within it, only a
  // canonically evidenced non-representative no-go is outside the
  // representative-page denominator. Unknown or unverifiable rows remain
  // denominator failures.
  const manifestRows = uniqueRows.filter(row => row.manifestEligible);
  const verifiedNonRepresentative = (row: GpcObservationCompletionRow) =>
    row.representativeAccess === "non_representative" && row.cohortSourceVerified && row.retainedArtifactVerified;
  const eligible = manifestRows.filter(row => !verifiedNonRepresentative(row));
  const excludedNonRepresentativeCount = manifestRows.filter(verifiedNonRepresentative).length;
  const excludedCanaryCount = uniqueRows.filter(row => !row.manifestEligible && row.canary).length;
  const excludedUnverifiedCohortCount = uniqueRows.filter(row => !row.manifestEligible && !row.cohortSourceVerified).length;
  const accessCounts = {
    representative: manifestRows.filter(row => row.representativeAccess === "representative").length,
    nonRepresentative: manifestRows.filter(row => row.representativeAccess === "non_representative").length,
    unknown: manifestRows.filter(row => row.representativeAccess === "unknown").length,
  };
  const failures = eligible.map(row => ({ scanId: row.scanId, reasons: completionReasons(row) })).filter(row => row.reasons.length > 0);
  const completedRepresentativeCount = eligible.length - failures.length;
  const representativeDenominator = eligible.length;
  const fullContextVerifiedCount = eligible.filter(row => row.delivery.fullContextVerified).length;
  const fullContextRate = representativeDenominator ? fullContextVerifiedCount / representativeDenominator : null;
  const completionRate = representativeDenominator ? completedRepresentativeCount / representativeDenominator : null;
  const confidenceInterval = wilson(completedRepresentativeCount, representativeDenominator, confidenceLevel);
  const pointEstimateAboveTarget = completionRate !== null && completionRate > targetRate;
  const confidenceBoundAboveTarget = confidenceInterval.lower !== null && confidenceInterval.lower > targetRate;
  const allAttemptCompletedCount = uniqueRows.filter(row => completionReasons(row).length === 0).length;
  const allAttemptCompletionRate = uniqueRows.length ? allAttemptCompletedCount / uniqueRows.length : null;
  const gateReasons: string[] = [];
  if (duplicateScanIds.length) gateReasons.push("duplicate_scan_ids");
  if (representativeDenominator < minimumRepresentativeRows) gateReasons.push("representative_sample_below_minimum");
  if (!pointEstimateAboveTarget) gateReasons.push("point_estimate_not_strictly_above_target");
  if (!confidenceBoundAboveTarget) gateReasons.push("lower_confidence_bound_not_above_target");
  const targetAchieved = gateReasons.length === 0;
  return {
    diagnosticOnly: true, productionEligible: false, targetRate, minimumRepresentativeRows, confidenceLevel,
    allSubmittedCount: rows.length, uniqueSubmittedCount: uniqueRows.length, duplicateScanIds,
    excludedNonRepresentativeCount, excludedCanaryCount, excludedUnverifiedCohortCount, accessCounts,
    includedNonRepresentativeFailureCount: eligible.filter(row => row.representativeAccess === "non_representative").length,
    representativeDenominator, completedRepresentativeCount, fullContextVerifiedCount, fullContextRate,
    completionRate, confidenceInterval,
    pointEstimateAboveTarget, confidenceBoundAboveTarget, targetAchieved,
    allAttemptCompletedCount, allAttemptCompletionRate, failedRepresentativeRows: failures,
    gateReasons,
    recommendation: targetAchieved
      ? "Hold out a preregistered representative cohort and repeat this gate before any product decision; this result is not an internet-wide reliability estimate."
      : "Do not treat this as a completion pass; increase the preregistered representative sample or fix the listed evidence gates before review.",
  };
}
