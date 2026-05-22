export type LoadTestQualityWarningSeverity = "info" | "warn" | "critical";

export type LoadTestQualityWarningCode =
  | "zero_finding_extreme"
  | "quality_regression_vs_baseline"
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
};

export type LoadTestQualityWarning = {
  baseline?: LoadTestQualityBaselineValues;
  batchId: string;
  code: LoadTestQualityWarningCode;
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

export function evaluateLoadTestQualityWarnings(input: LoadTestQualityWarningInput): LoadTestQualityWarning[] {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const egressId = input.egress_id ?? "unknown-egress";
  const egressProvider = input.egressProvider ?? "unknown";
  const completedCount = input.metrics.completedCount;
  const warnings: LoadTestQualityWarning[] = [];

  if (completedCount < 25) {
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

  if (metrics.zeroFindingRate > 0.8) {
    warnings.push(
      buildWarning({
        batchId: input.batchId,
        code: "zero_finding_extreme",
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

  if (
    input.baseline?.zeroFindingRate !== undefined &&
    input.baseline.findingsPerCompleted !== undefined &&
    metrics.zeroFindingRate >= input.baseline.zeroFindingRate + 0.2 &&
    metrics.findingsPerCompleted <= input.baseline.findingsPerCompleted * 0.7
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "quality_regression_vs_baseline",
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
    baselineBlockerLabelRate !== undefined &&
    baselineBlockerLabelRate !== null &&
    metrics.blockerLabelRate !== null &&
    metrics.blockerLabelRate !== undefined &&
    metrics.blockerLabelRate >= Math.max(0.5, baselineBlockerLabelRate + 0.25)
  ) {
    warnings.push(
      buildWarning({
        baseline: input.baseline,
        batchId: input.batchId,
        code: "access_blocker_label_spike",
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

  for (const peer of input.peerWindows ?? []) {
    if (peer.metrics.completedCount < 25) continue;
    const peerId = peer.egress_id ?? "unknown-egress";
    if (peerId === egressId) continue;
    const zeroDelta = metrics.zeroFindingRate - peer.metrics.zeroFindingRate;
    const findingRatio = metrics.findingsPerCompleted / Math.max(0.01, peer.metrics.findingsPerCompleted);
    if (zeroDelta >= 0.25 && findingRatio <= 0.7) {
      warnings.push(
        buildWarning({
          baseline: {
            findingsPerCompleted: peer.metrics.findingsPerCompleted,
            label: `peer:${peerId}`,
            zeroFindingRate: peer.metrics.zeroFindingRate
          },
          batchId: input.batchId,
          code: "egress_underperforms_peer",
          completedCount,
          egressId,
          egressProvider,
          explanation: `Egress ${egressId} materially underperformed comparable peer ${peerId}.`,
          generatedAt,
          metrics,
          severity: "warn",
          windowLabel: input.completionWindowLabel
        })
      );
    }
  }

  return warnings.sort((a, b) => a.warningId.localeCompare(b.warningId));
}

export function assertControlPlaneGate(result: ControlPlaneGateResult) {
  if (!result.ok) {
    throw new Error(`${result.gate} failed: ${result.error}`);
  }
}
