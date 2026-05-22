export type LoadTestQualityWarningSeverity = "info" | "warn" | "critical";

export type LoadTestQualityWarningCode =
  | "zero_finding_extreme"
  | "findings_per_completed_extreme_low"
  | "pages_scanned_extreme_low"
  | "early_loss_extreme"
  | "quality_regression_vs_baseline"
  | "pages_regression_vs_baseline"
  | "access_blocker_label_spike"
  | "runtime_error_counter_spike"
  | "egress_underperforms_peer";

export type LoadTestQualityMetricValues = {
  blockerLabelRate?: number | null;
  completedCount: number;
  findingsPerCompleted: number;
  pagesScanned: number;
  runtimeErrorRate?: number | null;
  zeroFindingRate: number;
};

export type LoadTestQualityBaselineValues = Partial<LoadTestQualityMetricValues> & {
  label?: string;
  tier?: "same_row" | "rolling";
};

export type LoadTestQualityWarning = {
  baseline?: LoadTestQualityBaselineValues;
  batchId: string;
  code: LoadTestQualityWarningCode;
  comparisonTier?: "no_baseline" | "same_row" | "rolling" | "peer";
  completionWindow: {
    completedCount: number;
    label?: string;
  };
  egressProvider: string;
  egress_id: string;
  explanation: string;
  generatedAt: string;
  metrics: LoadTestQualityMetricValues;
  severity: LoadTestQualityWarningSeverity;
  warningId: string;
};

export type LoadTestQualityWarningInput = {
  baseline?: LoadTestQualityBaselineValues;
  batchId: string;
  blockerLabels?: string[];
  completionWindowLabel?: string;
  egressProvider?: string | null;
  egress_id?: string | null;
  generatedAt?: string;
  labelCounts?: Record<string, number>;
  metrics: LoadTestQualityMetricValues;
  peerWindows?: Array<{
    egressProvider?: string | null;
    egress_id?: string | null;
    metrics: LoadTestQualityMetricValues;
  }>;
  runtimeErrorCounters?: Record<string, number>;
};

export type ControlPlaneGateResult =
  | { gate: "classifier_proof" | "db_queue_metadata_canary"; ok: true }
  | { error: string; gate: "classifier_proof" | "db_queue_metadata_canary"; ok: false };

const DEFAULT_BLOCKER_LABELS = [
  "authentication_wall",
  "bot_block_or_forbidden",
  "captcha_or_security_challenge",
  "early_loss",
  "robots_or_policy_block",
  "timeout_or_navigation_failure"
];

const MIN_COMPLETED_WARNING_WINDOW = 25;

function round(value: number) {
  return Number(value.toFixed(4));
}

function warningId(input: {
  batchId: string;
  code: LoadTestQualityWarningCode;
  egressId: string;
}) {
  return [input.batchId, input.egressId, input.code].join(":");
}

function buildWarning(input: {
  baseline?: LoadTestQualityBaselineValues;
  batchId: string;
  code: LoadTestQualityWarningCode;
  comparisonTier?: LoadTestQualityWarning["comparisonTier"];
  completedCount: number;
  egressProvider: string;
  egressId: string;
  explanation: string;
  generatedAt: string;
  metrics: LoadTestQualityMetricValues;
  severity: LoadTestQualityWarningSeverity;
  windowLabel?: string;
}): LoadTestQualityWarning {
  return {
    baseline: input.baseline,
    batchId: input.batchId,
    code: input.code,
    comparisonTier: input.comparisonTier ?? input.baseline?.tier ?? "no_baseline",
    completionWindow: {
      completedCount: input.completedCount,
      label: input.windowLabel
    },
    egressProvider: input.egressProvider,
    egress_id: input.egressId,
    explanation: input.explanation,
    generatedAt: input.generatedAt,
    metrics: input.metrics,
    severity: input.severity,
    warningId: warningId({
      batchId: input.batchId,
      code: input.code,
      egressId: input.egressId
    })
  };
}

function sumCounts(counts: Record<string, number> | undefined, keys: string[]) {
  if (!counts) return 0;
  return keys.reduce((sum, key) => sum + Math.max(0, counts[key] ?? 0), 0);
}

function runtimeErrorTotal(counters: Record<string, number> | undefined) {
  if (!counters) return 0;
  return Object.entries(counters).reduce((sum, [key, value]) => {
    return /runtime|browser|cdp|playwright|navigation|timeout|crash|protocol/i.test(key)
      ? sum + Math.max(0, value)
      : sum;
  }, 0);
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint] ?? null;
  }
  const left = sorted[midpoint - 1];
  const right = sorted[midpoint];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function averagePagesPerCompleted(metrics: LoadTestQualityMetricValues) {
  return metrics.pagesScanned / Math.max(1, metrics.completedCount);
}

function relativeDrop(current: number, baseline: number | undefined | null) {
  if (baseline === undefined || baseline === null || baseline <= 0) return null;
  return (baseline - current) / baseline;
}

/**
 * Phase 1B quality warnings are WARN-only and baseline-optional:
 * same-row/same-cohort and rolling baselines use material regression checks,
 * peer checks only compare multiple egresses in the same completed batch, and
 * no-baseline windows only warn on conservative absolute extremes.
 */
export function evaluateLoadTestQualityWarnings(input: LoadTestQualityWarningInput): LoadTestQualityWarning[] {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const egressId = input.egress_id ?? "unknown-egress";
  const egressProvider = input.egressProvider ?? "unknown";
  const completedCount = input.metrics.completedCount;
  const warnings: LoadTestQualityWarning[] = [];

  if (completedCount < MIN_COMPLETED_WARNING_WINDOW) {
    return warnings;
  }

  const metrics: LoadTestQualityMetricValues = {
    ...input.metrics,
    blockerLabelRate:
      input.metrics.blockerLabelRate ??
      round(sumCounts(input.labelCounts, input.blockerLabels ?? DEFAULT_BLOCKER_LABELS) / Math.max(1, completedCount)),
    runtimeErrorRate:
      input.metrics.runtimeErrorRate ??
      round(runtimeErrorTotal(input.runtimeErrorCounters) / Math.max(1, completedCount))
  };
  const baselineBlockerLabelRate = input.baseline?.blockerLabelRate;
  const baselineRuntimeErrorRate = input.baseline?.runtimeErrorRate;
  const baselineFindingsDrop = relativeDrop(metrics.findingsPerCompleted, input.baseline?.findingsPerCompleted);
  const baselinePagesDrop = relativeDrop(metrics.pagesScanned, input.baseline?.pagesScanned);
  const baselineZeroFindingRise =
    input.baseline?.zeroFindingRate === undefined ? null : metrics.zeroFindingRate - input.baseline.zeroFindingRate;
  const baselineBlockerRise =
    baselineBlockerLabelRate === undefined || baselineBlockerLabelRate === null || metrics.blockerLabelRate === null || metrics.blockerLabelRate === undefined
      ? null
      : metrics.blockerLabelRate - baselineBlockerLabelRate;

  if (metrics.zeroFindingRate > 0.8) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "zero_finding_extreme",
        comparisonTier: "no_baseline",
        completedCount,
        egressId,
        egressProvider,
        explanation: `Zero-finding rate ${Math.round(metrics.zeroFindingRate * 100)}% exceeds the 80% extreme threshold over ${completedCount} completed scans.`,
        generatedAt,
        metrics,
        severity: "critical",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (metrics.findingsPerCompleted < 0.5) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "findings_per_completed_extreme_low",
        comparisonTier: "no_baseline",
        completedCount,
        egressId,
        egressProvider,
        explanation: `Findings/completed ${metrics.findingsPerCompleted.toFixed(2)} is below the conservative no-baseline floor of 0.5 over ${completedCount} completed scans.`,
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (averagePagesPerCompleted(metrics) < 1.1) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "pages_scanned_extreme_low",
        comparisonTier: "no_baseline",
        completedCount,
        egressId,
        egressProvider,
        explanation: `Average pages scanned ${averagePagesPerCompleted(metrics).toFixed(2)} is below the conservative no-baseline floor of 1.1 over ${completedCount} completed scans.`,
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  const earlyLossRate = (input.labelCounts?.early_loss ?? 0) / Math.max(1, completedCount);
  if (earlyLossRate > 0.4) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "early_loss_extreme",
        comparisonTier: "no_baseline",
        completedCount,
        egressId,
        egressProvider,
        explanation: `Early-loss rate ${Math.round(earlyLossRate * 100)}% exceeds the conservative no-baseline threshold over ${completedCount} completed scans.`,
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if ((metrics.runtimeErrorRate ?? 0) >= 0.25) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "runtime_error_counter_spike",
        comparisonTier: "no_baseline",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Runtime/browser/CDP error counters exceeded the conservative no-baseline threshold.",
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (
    input.baseline?.findingsPerCompleted !== undefined &&
    baselineFindingsDrop !== null &&
    baselineFindingsDrop >= 0.7
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "quality_regression_vs_baseline",
        comparisonTier: input.baseline.tier ?? "same_row",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Findings/completed dropped by at least 70% versus baseline.",
        generatedAt,
        metrics,
        severity: "critical",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (
    input.baseline?.zeroFindingRate !== undefined &&
    input.baseline.findingsPerCompleted !== undefined &&
    baselineZeroFindingRise !== null &&
    baselineFindingsDrop !== null &&
    baselineZeroFindingRise >= 0.2 &&
    baselineFindingsDrop >= 0.4
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "quality_regression_vs_baseline",
        comparisonTier: input.baseline.tier ?? "same_row",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Zero-finding rate increased materially while findings/completed dropped materially versus baseline.",
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (
    input.baseline?.pagesScanned !== undefined &&
    input.baseline.findingsPerCompleted !== undefined &&
    baselinePagesDrop !== null &&
    baselineFindingsDrop !== null &&
    baselinePagesDrop >= 0.35 &&
    baselineFindingsDrop >= 0.3
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "pages_regression_vs_baseline",
        comparisonTier: input.baseline.tier ?? "same_row",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Pages scanned dropped materially while findings/completed also dropped versus baseline.",
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (
    baselineBlockerLabelRate !== undefined &&
    baselineBlockerLabelRate !== null &&
    metrics.blockerLabelRate !== null &&
    metrics.blockerLabelRate !== undefined &&
    baselineBlockerRise !== null &&
    baselineBlockerRise >= 0.25 &&
    baselineFindingsDrop !== null &&
    baselineFindingsDrop >= 0.3
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "access_blocker_label_spike",
        comparisonTier: input.baseline?.tier ?? "same_row",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Access-blocker/challenge labels spiked materially versus baseline.",
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  if (
    baselineRuntimeErrorRate !== undefined &&
    baselineRuntimeErrorRate !== null &&
    metrics.runtimeErrorRate !== null &&
    metrics.runtimeErrorRate !== undefined &&
    metrics.runtimeErrorRate >= Math.max(0.25, baselineRuntimeErrorRate + 0.2)
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "runtime_error_counter_spike",
        comparisonTier: input.baseline?.tier ?? "same_row",
        completedCount,
        egressId,
        egressProvider,
        explanation: "Runtime/browser/CDP error counters spiked materially versus baseline.",
        generatedAt,
        metrics,
        severity: "warn",
        windowLabel: input.completionWindowLabel
      })
    );
  }

  const comparablePeers = (input.peerWindows ?? []).filter((peer) => {
    const peerId = peer.egress_id ?? "unknown-egress";
    return peerId !== egressId && peer.metrics.completedCount >= MIN_COMPLETED_WARNING_WINDOW;
  });
  const peerFindingsMedian = median(comparablePeers.map((peer) => peer.metrics.findingsPerCompleted));
  const peerZeroFindingMedian = median(comparablePeers.map((peer) => peer.metrics.zeroFindingRate));
  const peerPagesMedian = median(comparablePeers.map((peer) => averagePagesPerCompleted(peer.metrics)));
  const currentPagesAverage = averagePagesPerCompleted(metrics);
  if (
    peerFindingsMedian !== null &&
    peerZeroFindingMedian !== null &&
    peerPagesMedian !== null &&
    metrics.findingsPerCompleted <= peerFindingsMedian * 0.5 &&
    metrics.zeroFindingRate >= peerZeroFindingMedian + 0.2 &&
    currentPagesAverage >= peerPagesMedian * 0.8 &&
    currentPagesAverage <= peerPagesMedian * 1.25
  ) {
    const peerId = `peer-median:${comparablePeers.map((peer) => peer.egress_id ?? "unknown-egress").sort().join(",")}`;
      warnings.push(
        buildWarning({
          baseline: {
            findingsPerCompleted: peerFindingsMedian,
            label: peerId,
            pagesScanned: peerPagesMedian * completedCount,
            zeroFindingRate: peerZeroFindingMedian
          },
          batchId: input.batchId,
          code: "egress_underperforms_peer",
          comparisonTier: "peer",
          completedCount,
          egressId,
          egressProvider,
          explanation: `Egress ${egressId} materially underperformed comparable peer median.`,
          generatedAt,
          metrics,
          severity: "warn",
          windowLabel: input.completionWindowLabel
        })
      );
  }

  const deduped = new Map<string, LoadTestQualityWarning>();
  for (const warning of warnings) {
    const key = [warning.warningId, warning.severity, warning.explanation].join("|");
    deduped.set(key, warning);
  }
  return Array.from(deduped.values()).sort((a, b) => a.warningId.localeCompare(b.warningId));
}

export function assertControlPlaneGate(result: ControlPlaneGateResult) {
  if (!result.ok) {
    throw new Error(`${result.gate} failed: ${result.error}`);
  }
}
