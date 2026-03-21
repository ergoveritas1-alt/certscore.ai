export const SCAN_EXECUTION_CONTRACT_VERSION = "scanner-execution.v1" as const;

export const SCAN_EXECUTION_STAGES = [
  "setup_load",
  "baseline_lookup",
  "crawl_discovery",
  "runtime_snapshot_capture",
  "signal_derivation",
  "persistence_diff_finalization"
] as const;

export const SCAN_STAGE_OUTCOME_KINDS = ["success", "degraded", "failed"] as const;

export const SCAN_EXECUTION_ERROR_CATEGORIES = [
  "missing_record",
  "database",
  "baseline_lookup",
  "browser_init",
  "navigation_timeout",
  "runtime_capture",
  "upstream_fetch",
  "signal_derivation",
  "persistence",
  "diff",
  "unknown"
] as const;

export type ScanExecutionStage = (typeof SCAN_EXECUTION_STAGES)[number];
export type ScanStageOutcomeKind = (typeof SCAN_STAGE_OUTCOME_KINDS)[number];
export type ScanExecutionErrorCategory = (typeof SCAN_EXECUTION_ERROR_CATEGORIES)[number];

export type ScannerExecutionLifecycle = "running" | "completed" | "failed";

export type ScannerStageOutcome = {
  attempts: number;
  completedAt: string;
  durationMs: number;
  errorCategory: ScanExecutionErrorCategory | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  outcome: ScanStageOutcomeKind;
  recoverable: boolean;
  stage: ScanExecutionStage;
  startedAt: string;
};

export type ScannerExecutionSummary = {
  completedAt: string | null;
  contractVersion: typeof SCAN_EXECUTION_CONTRACT_VERSION;
  degradedStages: ScanExecutionStage[];
  failureCategory: ScanExecutionErrorCategory | null;
  lifecycle: ScannerExecutionLifecycle;
  startedAt: string;
  stages: ScannerStageOutcome[];
  updatedAt: string;
};

export function createScannerExecutionSummary(input: {
  lifecycle?: ScannerExecutionLifecycle;
  startedAt?: string;
} = {}): ScannerExecutionSummary {
  const startedAt = input.startedAt ?? new Date().toISOString();

  return {
    completedAt: null,
    contractVersion: SCAN_EXECUTION_CONTRACT_VERSION,
    degradedStages: [],
    failureCategory: null,
    lifecycle: input.lifecycle ?? "running",
    startedAt,
    stages: [],
    updatedAt: startedAt
  };
}

export function recordScannerStageOutcome(
  summary: ScannerExecutionSummary,
  outcome: ScannerStageOutcome
): ScannerExecutionSummary {
  const remainingStages = summary.stages.filter((entry) => entry.stage !== outcome.stage);
  const stages = [...remainingStages, outcome].sort(
    (left, right) =>
      SCAN_EXECUTION_STAGES.indexOf(left.stage) - SCAN_EXECUTION_STAGES.indexOf(right.stage)
  );
  const degradedStages = stages
    .filter((entry) => entry.outcome === "degraded")
    .map((entry) => entry.stage);
  const failedStage = stages.find((entry) => entry.outcome === "failed");

  return {
    ...summary,
    degradedStages,
    failureCategory: failedStage?.errorCategory ?? summary.failureCategory,
    stages,
    updatedAt: outcome.completedAt
  };
}

export function finalizeScannerExecutionSummary(
  summary: ScannerExecutionSummary,
  input: {
    completedAt?: string;
    failureCategory?: ScanExecutionErrorCategory | null;
    lifecycle: ScannerExecutionLifecycle;
  }
): ScannerExecutionSummary {
  const completedAt = input.completedAt ?? new Date().toISOString();

  return {
    ...summary,
    completedAt,
    failureCategory: input.lifecycle === "failed" ? input.failureCategory ?? summary.failureCategory ?? "unknown" : null,
    lifecycle: input.lifecycle,
    updatedAt: completedAt
  };
}

function hasMatch(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

export function categorizeScannerExecutionError(error: unknown): ScanExecutionErrorCategory {
  const message =
    error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : String(error ?? "").toLowerCase();

  if (hasMatch(message, [/not found/, /missing a domain/, /missing domain/, /missing scan/])) {
    return "missing_record";
  }

  if (hasMatch(message, [/persist/, /supabase/, /insert .* event/, /mark scan/, /update .*scan/, /database/])) {
    return "database";
  }

  if (hasMatch(message, [/previous snapshot/, /baseline/, /regression/])) {
    return "baseline_lookup";
  }

  if (hasMatch(message, [/browser/, /context/, /playwright/, /page closed/, /target page/])) {
    return "browser_init";
  }

  if (hasMatch(message, [/timeout/, /timed out/, /navigation/])) {
    return "navigation_timeout";
  }

  if (hasMatch(message, [/save snapshot bundle/, /persist/, /replace scan signals/])) {
    return "persistence";
  }

  if (hasMatch(message, [/runtime/, /snapshot/, /consent/, /cookie/, /tracker/])) {
    return "runtime_capture";
  }

  if (hasMatch(message, [/fetch/, /dns/, /network/, /econn/, /socket/, /5\d\d/, /upstream/])) {
    return "upstream_fetch";
  }

  if (hasMatch(message, [/signal/, /taxonomy/, /classification/])) {
    return "signal_derivation";
  }

  if (hasMatch(message, [/change event/, /diff/, /changes computed/])) {
    return "diff";
  }

  return "unknown";
}

export function isScannerExecutionErrorTransient(category: ScanExecutionErrorCategory) {
  return (
    category === "browser_init" ||
    category === "navigation_timeout" ||
    category === "runtime_capture" ||
    category === "upstream_fetch"
  );
}

export function isScannerStageRecoverable(
  stage: ScanExecutionStage,
  category: ScanExecutionErrorCategory
) {
  if (stage === "baseline_lookup") {
    return category === "baseline_lookup" || category === "database" || category === "unknown";
  }

  if (stage === "runtime_snapshot_capture") {
    return (
      category === "navigation_timeout" ||
      category === "runtime_capture" ||
      category === "upstream_fetch" ||
      category === "unknown"
    );
  }

  if (stage === "signal_derivation") {
    return category === "signal_derivation" || category === "unknown";
  }

  return false;
}

export function getScannerExecutionSummary(
  scanConfig: Record<string, unknown> | null | undefined
): ScannerExecutionSummary | null {
  if (!scanConfig || typeof scanConfig !== "object") {
    return null;
  }

  const execution = scanConfig.execution;
  if (!execution || typeof execution !== "object") {
    return null;
  }

  const summary = (execution as { summary?: unknown }).summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  const candidate = summary as Partial<ScannerExecutionSummary>;

  if (
    candidate.contractVersion !== SCAN_EXECUTION_CONTRACT_VERSION ||
    typeof candidate.startedAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    !Array.isArray(candidate.stages)
  ) {
    return null;
  }

  return candidate as ScannerExecutionSummary;
}
