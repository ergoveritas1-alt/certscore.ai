import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  FULL_SCAN_EVENT_TYPES,
  PREVIEW_SCAN_EVENT_TYPES,
  SCAN_EVENT_TYPES,
  SCAN_EXECUTION_CONTRACT_VERSION,
  categorizeScannerExecutionError,
  createScannerExecutionSummary,
  finalizeScannerExecutionSummary,
  isScannerExecutionErrorTransient,
  isScannerStageRecoverable,
  recordScannerStageOutcome,
  type CrawlSource,
  type ScanExecutionErrorCategory,
  type ScanExecutionStage,
  type ScannerExecutionSummary
} from "@website-signal-risk-scanner/shared";
import { classifyScanAccess } from "./access-classification";
import { getPreviousCompletedScan } from "./history/get-previous-scan";
import { getSnapshotBundle, replaceScanSignals, saveComplianceChangeEvents, saveSnapshotBundle } from "./persistence";
import { buildSnapshotBundle, diffSnapshots } from "./snapshot";

type ScanRow = {
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_requested: number;
  scan_config_json: Record<string, unknown> | null;
  status: string;
  scan_type: "preview" | "full" | "scheduled";
};

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
};

type SnapshotBundleResult = Awaited<ReturnType<typeof buildSnapshotBundle>>;
type SnapshotScanPlan = SnapshotBundleResult["scanPlan"];
type PreviousScanResult = Awaited<ReturnType<typeof getPreviousCompletedScan>>;
type SnapshotDiffResult = ReturnType<typeof diffSnapshots>;

type StagePhase = "started" | "completed" | "degraded" | "failed";

type StageContext = {
  domainRow: DomainRow;
  executionSummary: ScannerExecutionSummary;
  requestedPageCount: number;
  scanId: string;
  scanRow: ScanRow;
  startedAt: Date;
};

class StageExecutionError extends Error {
  category: ScanExecutionErrorCategory;
  stage: ScanExecutionStage;

  constructor(input: { stage: ScanExecutionStage; category: ScanExecutionErrorCategory; message: string }) {
    super(input.message);
    this.name = "StageExecutionError";
    this.category = input.category;
    this.stage = input.stage;
  }
}

async function insertScanEvent(input: {
  scanId: string;
  domainId: string | null;
  organizationId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    scan_id: input.scanId,
    domain_id: input.domainId,
    organization_id: input.organizationId,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null
  });

  if (error) {
    throw new Error(`Failed to insert scan event: ${error.message}`);
  }
}

async function insertScanEventSafely(input: {
  scanId: string;
  domainId: string | null;
  organizationId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await insertScanEvent(input);
  } catch (error) {
    console.error("[scan-event] failed", {
      error: error instanceof Error ? error.message : String(error),
      eventType: input.eventType,
      scanId: input.scanId
    });
  }
}

function buildStageMetadata(
  stage: ScanExecutionStage,
  phase: StagePhase,
  input: {
    attempts?: number;
    errorCategory?: ScanExecutionErrorCategory | null;
    metadata?: Record<string, unknown>;
    outcome?: "success" | "degraded" | "failed";
  } = {}
) {
  return {
    ...(input.metadata ?? {}),
    scannerExecution: {
      attempts: input.attempts ?? 1,
      contractVersion: SCAN_EXECUTION_CONTRACT_VERSION,
      errorCategory: input.errorCategory ?? null,
      outcome:
        input.outcome ??
        (phase === "completed" ? "success" : phase === "degraded" ? "degraded" : phase === "failed" ? "failed" : null),
      phase,
      stage
    }
  } satisfies Record<string, unknown>;
}

function getRequestedPageCount(scan: ScanRow, domain: DomainRow) {
  const configMaxPages =
    typeof scan.scan_config_json?.maxPages === "number" && Number.isFinite(scan.scan_config_json.maxPages)
      ? scan.scan_config_json.maxPages
      : null;

  return Math.max(1, domain.max_pages_override ?? configMaxPages ?? scan.pages_requested ?? 10);
}

function toCompatibilitySignalRows(input: {
  domainId: string;
  organizationId: string | null;
  scanId: string;
  signals: Array<{
    category: string;
    key: string;
    label: string;
    value: boolean | number | string | string[];
  }>;
}) {
  return input.signals.map((signal) => ({
    scan_id: input.scanId,
    organization_id: input.organizationId,
    domain_id: input.domainId,
    category: signal.category,
    signal_key: signal.key,
    signal_label: signal.label,
    signal_value_json: signal.value,
    value_type: Array.isArray(signal.value)
      ? "string_array"
      : typeof signal.value === "boolean"
        ? "boolean"
        : typeof signal.value === "number"
          ? "number"
          : "text"
  })) as Array<{
    category: string;
    domain_id: string;
    organization_id: string;
    scan_id: string;
    signal_key: string;
    signal_label: string;
    signal_value_json: boolean | number | string | string[];
    value_type: "boolean" | "number" | "text" | "string_array";
  }>;
}

function buildExecutionScanConfig(
  scanConfig: Record<string, unknown> | null,
  input: {
    executionSummary: ScannerExecutionSummary;
    pagesRequested: number;
    scanPlan?: SnapshotScanPlan | null;
  }
) {
  const existingExecution =
    scanConfig?.execution && typeof scanConfig.execution === "object"
      ? (scanConfig.execution as Record<string, unknown>)
      : null;

  return {
    ...(scanConfig ?? {}),
    execution: {
      ...(existingExecution ?? {}),
      pagesRequested: input.pagesRequested,
      scanPlan: input.scanPlan
        ? {
            profile: input.scanPlan.profile,
            prefetchTargetCount: input.scanPlan.prefetchTargetCount,
            expansionTargetCount: input.scanPlan.expansionTargetCount,
            staticFetchConcurrency: input.scanPlan.staticFetchConcurrency,
            browserNavigationTimeoutMs: input.scanPlan.browserNavigationTimeoutMs,
            browserPostLoadWaitMs: input.scanPlan.browserPostLoadWaitMs,
            blockStylesheetsInBrowser: input.scanPlan.blockStylesheetsInBrowser
          }
        : (existingExecution?.scanPlan ?? null),
      summary: input.executionSummary
    }
  } satisfies Record<string, unknown>;
}

function getTerminalFailureCategory(error: unknown) {
  if (error instanceof StageExecutionError) {
    return error.category;
  }

  return categorizeScannerExecutionError(error);
}

function getRetryDelayMs(attempt: number) {
  return Math.min(1_500, 250 * attempt);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeoutId: NodeJS.Timeout | null = null;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function persistExecutionSummary(input: {
  executionSummary: ScannerExecutionSummary;
  requestedPageCount: number;
  scanConfig: Record<string, unknown> | null;
  scanId: string;
  scanPlan?: SnapshotScanPlan | null;
}) {
  const supabase = createAdminClient();
  const nextScanConfig = buildExecutionScanConfig(input.scanConfig, {
    executionSummary: input.executionSummary,
    pagesRequested: input.requestedPageCount,
    scanPlan: input.scanPlan
  });
  const { error } = await supabase
    .from("scans")
    .update({
      scan_config_json: nextScanConfig
    })
    .eq("id", input.scanId);

  if (error) {
    throw new Error(`Failed to persist scan execution config: ${error.message}`);
  }

  return nextScanConfig;
}

async function persistExecutionSummarySafely(input: {
  executionSummary: ScannerExecutionSummary;
  requestedPageCount: number;
  scanConfig: Record<string, unknown> | null;
  scanId: string;
  scanPlan?: SnapshotScanPlan | null;
}) {
  try {
    return await persistExecutionSummary(input);
  } catch (error) {
    console.error("[scan-execution] failed to persist execution summary", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.scanId
    });
    return input.scanConfig;
  }
}

async function recordStageOutcome(input: {
  attempts?: number;
  context: StageContext;
  errorCategory?: ScanExecutionErrorCategory | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  outcome: "success" | "degraded" | "failed";
  scanConfig: Record<string, unknown> | null;
  scanPlan?: SnapshotScanPlan | null;
  stage: ScanExecutionStage;
  stageStartedAt: Date;
}) {
  const completedAt = new Date();
  const nextSummary = recordScannerStageOutcome(input.context.executionSummary, {
    attempts: input.attempts ?? 1,
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - input.stageStartedAt.getTime(),
    errorCategory: input.errorCategory ?? null,
    message: input.message ?? null,
    metadata: input.metadata ?? null,
    outcome: input.outcome,
    recoverable: input.outcome === "degraded",
    stage: input.stage,
    startedAt: input.stageStartedAt.toISOString()
  });

  input.context.executionSummary = nextSummary;
  return persistExecutionSummarySafely({
    executionSummary: nextSummary,
    requestedPageCount: input.context.requestedPageCount,
    scanConfig: input.scanConfig,
    scanId: input.context.scanId,
    scanPlan: input.scanPlan
  });
}

async function markScanAsRunning(context: StageContext) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("scans")
    .update({
      status: "running",
      started_at: context.startedAt.toISOString(),
      error_message: null
    })
    .eq("id", context.scanId);

  if (error) {
    throw new Error(`Failed to mark scan as running: ${error.message}`);
  }
}

async function retryTransientStageOperation<T>(input: {
  label: string;
  maxAttempts: number;
  operation: () => Promise<T>;
  timeoutMs: number;
}) {
  let attempt = 0;

  while (attempt < input.maxAttempts) {
    attempt += 1;

    try {
      const result = await withTimeout(input.operation(), input.timeoutMs, input.label);
      return { attempts: attempt, result } as const;
    } catch (error) {
      const category = categorizeScannerExecutionError(error);
      const shouldRetry = attempt < input.maxAttempts && isScannerExecutionErrorTransient(category);

      if (!shouldRetry) {
        throw {
          attempts: attempt,
          category,
          error
        };
      }

      await sleep(getRetryDelayMs(attempt));
    }
  }

  throw {
    attempts: input.maxAttempts,
    category: "unknown" as const,
    error: new Error(`${input.label} failed`)
  };
}

export const testInternals = {
  buildExecutionScanConfig,
  getRequestedPageCount,
  getTerminalFailureCategory,
  retryTransientStageOperation
};

async function runSetupStage(input: {
  context: StageContext;
  failedEventType: string;
  scanConfig: Record<string, unknown> | null;
  startedEventType: string;
}) {
  const stage: ScanExecutionStage = "setup_load";
  const stageStartedAt = new Date();

  try {
    await markScanAsRunning(input.context);
    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: input.startedEventType,
      message:
        input.context.scanRow.scan_type === "preview" ? "Live preview scan started." : "Structured snapshot scan started.",
      metadata: buildStageMetadata(stage, "started", {
        metadata: {
          pagesRequested: input.context.requestedPageCount
        }
      })
    });

    return await recordStageOutcome({
      context: input.context,
      metadata: {
        pagesRequested: input.context.requestedPageCount,
        scanType: input.context.scanRow.scan_type
      },
      outcome: "success",
      scanConfig: input.scanConfig,
      stage,
      stageStartedAt
    });
  } catch (error) {
    const category = getTerminalFailureCategory(error);
    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: input.failedEventType,
      message: "Scan setup failed before execution could begin.",
      metadata: buildStageMetadata(stage, "failed", {
        errorCategory: category,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown setup error"
        }
      })
    });

    await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: error instanceof Error ? error.message : "Unknown setup error",
      outcome: "failed",
      scanConfig: input.scanConfig,
      stage,
      stageStartedAt
    });

    throw new StageExecutionError({
      stage,
      category,
      message: error instanceof Error ? error.message : "Unknown setup error"
    });
  }
}

async function runBaselineLookupStage(input: {
  context: StageContext;
  crawlSource: CrawlSource;
  isPreview: boolean;
  scanConfig: Record<string, unknown> | null;
}) {
  const stage: ScanExecutionStage = "baseline_lookup";
  const stageStartedAt = new Date();
  let previousBundle: Awaited<ReturnType<typeof getSnapshotBundle>> | null = null;
  let previousScan: PreviousScanResult = null;

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.regressionStarted,
    message: input.isPreview
      ? "Looking for a previous completed snapshot so this preview can anchor itself against any existing baseline."
      : "Looking for a previous completed snapshot so this scan can compare against the latest baseline.",
    metadata: buildStageMetadata(stage, "started", {
      metadata: {
        requestedPageCount: input.context.requestedPageCount,
        scanType: input.context.scanRow.scan_type
      }
    })
  });

  try {
    previousScan = await withTimeout(
      getPreviousCompletedScan({
        currentScanId: input.context.scanId,
        domainId: input.context.domainRow.id,
        organizationId: input.context.scanRow.organization_id
      }),
      20_000,
      "Baseline lookup"
    );
    previousBundle = previousScan ? await withTimeout(getSnapshotBundle(previousScan.id), 20_000, "Baseline bundle load") : null;

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.regressionCompleted,
      message: previousScan
        ? "Previous snapshot context found. New observations will be compared against the earlier completed scan."
        : input.isPreview
          ? "No previous snapshot context found. This preview run is creating the first baseline for this domain."
          : "No previous snapshot context found. This run is creating the first baseline for this domain.",
      metadata: buildStageMetadata(stage, "completed", {
        metadata: {
          hasPreviousSnapshot: Boolean(previousScan),
          previousScanId: previousScan?.id ?? null
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      metadata: {
        hasPreviousSnapshot: Boolean(previousScan),
        previousScanId: previousScan?.id ?? null
      },
      outcome: "success",
      scanConfig: input.scanConfig,
      stage,
      stageStartedAt
    });

    return {
      nextScanConfig,
      previousBundle,
      previousScan
    };
  } catch (error) {
    const category = categorizeScannerExecutionError(error);
    const recoverable = isScannerStageRecoverable(stage, category);

    if (!recoverable) {
      await recordStageOutcome({
        context: input.context,
        errorCategory: category,
        message: error instanceof Error ? error.message : "Unknown baseline lookup error",
        outcome: "failed",
        scanConfig: input.scanConfig,
        stage,
        stageStartedAt
      });

      throw new StageExecutionError({
        stage,
        category,
        message: error instanceof Error ? error.message : "Unknown baseline lookup error"
      });
    }

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.regressionFailed,
      message: "Previous snapshot lookup failed. Continuing without a baseline for this run.",
      metadata: buildStageMetadata(stage, "degraded", {
        errorCategory: category,
        metadata: {
          crawlSource: input.crawlSource,
          error: error instanceof Error ? error.message : "Unknown baseline lookup error"
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: error instanceof Error ? error.message : "Unknown baseline lookup error",
      metadata: {
        fallbackUsed: true
      },
      outcome: "degraded",
      scanConfig: input.scanConfig,
      stage,
      stageStartedAt
    });

    return {
      nextScanConfig,
      previousBundle: null,
      previousScan: null
    };
  }
}

async function runCrawlDiscoveryStage(input: {
  context: StageContext;
  crawlSource: CrawlSource;
  isPreview: boolean;
  previousBundle: Awaited<ReturnType<typeof getSnapshotBundle>> | null;
  scanConfig: Record<string, unknown> | null;
}) {
  const stage: ScanExecutionStage = "crawl_discovery";
  const stageStartedAt = new Date();

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.crawlStarted,
    message: "Stage 1 started: crawl setup, robots, homepage fetch, and page discovery.",
    metadata: buildStageMetadata(stage, "started", {
      metadata: {
        requestedPageCount: input.context.requestedPageCount
      }
    })
  });

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.privacyAuditStarted,
    message: input.isPreview
      ? "Starting the lightweight live pass: homepage fetch, runtime/privacy checks, legal-link discovery, and signal normalization."
      : "Starting the full scan pass: homepage fetch, runtime/privacy checks, legal-link discovery, targeted page fetches, and signal normalization.",
    metadata: buildStageMetadata(stage, "started", {
      metadata: {
        crawlSource: input.crawlSource,
        requestedPageCount: input.context.requestedPageCount
      }
    })
  });

  try {
    const { attempts, result: bundle } = await retryTransientStageOperation({
      label: "Snapshot bundle build",
      maxAttempts: 2,
      operation: () =>
        buildSnapshotBundle({
          scanId: input.context.scanId,
          organizationId: input.context.scanRow.organization_id,
          domainId: input.context.domainRow.id,
          domain: input.context.domainRow.normalized_url || input.context.domainRow.hostname,
          previous: input.previousBundle,
          requestedPageCount: input.context.requestedPageCount,
          crawlSource: input.crawlSource
        }),
      timeoutMs: 240_000
    });

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.pageDiscoveryCompleted,
      message: "Stages 1-6 completed: static extraction, policy normalization, browser checks, enrichment, and scoring.",
      metadata: buildStageMetadata(stage, "completed", {
        attempts,
        metadata: {
          expansionTargetCount: bundle.scanPlan.expansionTargetCount,
          homepageFetchStatus: bundle.snapshot.homepageFetchStatus,
          pagesScanned: bundle.snapshot.pagesScanned,
          partialScan: bundle.snapshot.partialScan,
          prefetchTargetCount: bundle.scanPlan.prefetchTargetCount,
          scanPlanProfile: bundle.scanPlan.profile,
          staticFetchConcurrency: bundle.scanPlan.staticFetchConcurrency,
          trackerCountTotal: bundle.snapshot.trackerCountTotal,
          wcagErrorCountTotal: bundle.snapshot.wcagErrorCountTotal
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      attempts,
      context: input.context,
      metadata: {
        homepageFetchStatus: bundle.snapshot.homepageFetchStatus,
        pagesScanned: bundle.snapshot.pagesScanned,
        partialScan: bundle.snapshot.partialScan,
        scanPlanProfile: bundle.scanPlan.profile
      },
      outcome: "success",
      scanConfig: input.scanConfig,
      scanPlan: bundle.scanPlan,
      stage,
      stageStartedAt
    });

    return {
      bundle,
      nextScanConfig
    };
  } catch (failure) {
    const error = failure as { attempts?: number; category?: ScanExecutionErrorCategory; error?: unknown };
    const category = error.category ?? categorizeScannerExecutionError(error.error);
    const message = error.error instanceof Error ? error.error.message : "Unknown crawl discovery error";

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.pageDiscoveryFailed,
      message: "Snapshot discovery failed before a usable bundle could be assembled.",
      metadata: buildStageMetadata(stage, "failed", {
        attempts: error.attempts,
        errorCategory: category,
        metadata: {
          error: message
        }
      })
    });

    await recordStageOutcome({
      attempts: error.attempts,
      context: input.context,
      errorCategory: category,
      message,
      outcome: "failed",
      scanConfig: input.scanConfig,
      stage,
      stageStartedAt
    });

    throw new StageExecutionError({
      stage,
      category,
      message
    });
  }
}

async function runRuntimeSnapshotStage(input: {
  bundle: SnapshotBundleResult;
  context: StageContext;
  scanConfig: Record<string, unknown> | null;
}) {
  const stage: ScanExecutionStage = "runtime_snapshot_capture";
  const stageStartedAt = new Date();

  try {
    const accessClassification = classifyScanAccess({
      snapshot: input.bundle.snapshot,
      pages: input.bundle.pages,
      runtimeArtifacts: input.bundle.runtimeArtifacts
    });

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.homepageLoaded,
      message: "Homepage fetch and lightweight runtime pass completed.",
      metadata: buildStageMetadata(stage, "completed", {
        metadata: {
          cookieBannerPresent: input.bundle.snapshot.cookieBannerPresent,
          cookieCountTotal: input.bundle.snapshot.cookieCountTotal,
          homepageFetchStatus: input.bundle.snapshot.homepageFetchStatus,
          pagesScanned: input.bundle.snapshot.pagesScanned,
          thirdPartyCookieCount: input.bundle.snapshot.thirdPartyCookieCount,
          trackerCountTotal: input.bundle.snapshot.trackerCountTotal
        }
      })
    });

    if (accessClassification) {
      await insertScanEventSafely({
        scanId: input.context.scanId,
        domainId: input.context.domainRow.id,
        organizationId: input.context.scanRow.organization_id,
        eventType: SCAN_EVENT_TYPES.accessLimitationsDetected,
        message: accessClassification.message,
        metadata: buildStageMetadata(stage, "completed", {
          metadata: accessClassification.metadata
        })
      });
    }

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      metadata: {
        hasAccessLimitations: Boolean(accessClassification),
        runtimeArtifactsCaptured: Boolean(input.bundle.runtimeArtifacts)
      },
      outcome: "success",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    return {
      accessClassification,
      nextScanConfig
    };
  } catch (error) {
    const category = categorizeScannerExecutionError(error);
    const recoverable = isScannerStageRecoverable(stage, category);

    if (!recoverable) {
      await recordStageOutcome({
        context: input.context,
        errorCategory: category,
        message: error instanceof Error ? error.message : "Unknown runtime capture error",
        outcome: "failed",
        scanConfig: input.scanConfig,
        scanPlan: input.bundle.scanPlan,
        stage,
        stageStartedAt
      });

      throw new StageExecutionError({
        stage,
        category,
        message: error instanceof Error ? error.message : "Unknown runtime capture error"
      });
    }

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.privacyPageFailed,
      message: "Runtime snapshot capture degraded. The scan will continue with the bundle data already collected.",
      metadata: buildStageMetadata(stage, "degraded", {
        errorCategory: category,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown runtime capture error"
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: error instanceof Error ? error.message : "Unknown runtime capture error",
      metadata: {
        fallbackUsed: true
      },
      outcome: "degraded",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    return {
      accessClassification: null,
      nextScanConfig
    };
  }
}

async function runSignalDerivationStage(input: {
  bundle: SnapshotBundleResult;
  context: StageContext;
  isPreview: boolean;
  scanConfig: Record<string, unknown> | null;
}) {
  const stage: ScanExecutionStage = "signal_derivation";
  const stageStartedAt = new Date();

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.legalAuditStarted,
    message: input.isPreview
      ? "Runtime checks are back. Folding privacy-policy, terms, contact, and disclosure evidence into the preview bundle now."
      : "Runtime checks are back. Folding privacy-policy, terms, contact, and disclosure evidence into the full scan bundle now.",
    metadata: buildStageMetadata(stage, "started", {
      metadata: {
        contactPagePresent: input.bundle.snapshot.contactPagePresent,
        pagesScanned: input.bundle.snapshot.pagesScanned,
        privacyPolicyPresent: input.bundle.snapshot.privacyPolicyPresent,
        termsOfServicePresent: input.bundle.snapshot.termsOfServicePresent
      }
    })
  });

  try {
    const compatibilitySignals = toCompatibilitySignalRows({
      scanId: input.context.scanId,
      organizationId: input.context.scanRow.organization_id,
      domainId: input.context.domainRow.id,
      signals: input.bundle.compatibilitySignals
    });

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.legalAuditCompleted,
      message: input.isPreview
        ? "Canonical preview bundle assembled successfully. Persisting the snapshot rows and score summaries next."
        : "Canonical full scan bundle assembled successfully. Persisting the snapshot rows and score summaries next.",
      metadata: buildStageMetadata(stage, "completed", {
        metadata: {
          accessibilityScore: input.bundle.snapshot.accessibilityScore,
          certscoreOverall: input.bundle.snapshot.certscoreOverall,
          privacyScore: input.bundle.snapshot.privacyScore,
          totalSignals: input.bundle.snapshot.totalSignals
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      metadata: {
        compatibilitySignalCount: compatibilitySignals.length,
        totalSignals: input.bundle.snapshot.totalSignals
      },
      outcome: "success",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    return {
      compatibilitySignals,
      nextScanConfig
    };
  } catch (error) {
    const category = categorizeScannerExecutionError(error);
    const recoverable = isScannerStageRecoverable(stage, category);

    if (!recoverable) {
      await recordStageOutcome({
        context: input.context,
        errorCategory: category,
        message: error instanceof Error ? error.message : "Unknown signal derivation error",
        outcome: "failed",
        scanConfig: input.scanConfig,
        scanPlan: input.bundle.scanPlan,
        stage,
        stageStartedAt
      });

      throw new StageExecutionError({
        stage,
        category,
        message: error instanceof Error ? error.message : "Unknown signal derivation error"
      });
    }

    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.legalAuditFailed,
      message: "Compatibility signal derivation degraded. The canonical bundle will still be persisted.",
      metadata: buildStageMetadata(stage, "degraded", {
        errorCategory: category,
        metadata: {
          error: error instanceof Error ? error.message : "Unknown signal derivation error"
        }
      })
    });

    const nextScanConfig = await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: error instanceof Error ? error.message : "Unknown signal derivation error",
      metadata: {
        fallbackUsed: true
      },
      outcome: "degraded",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    return {
      compatibilitySignals: null,
      nextScanConfig
    };
  }
}

async function runPersistenceStage(input: {
  bundle: SnapshotBundleResult;
  compatibilitySignals:
    | Array<{
        category: string;
        domain_id: string;
        organization_id: string;
        scan_id: string;
        signal_key: string;
        signal_label: string;
        signal_value_json: boolean | number | string | string[];
        value_type: "boolean" | "number" | "text" | "string_array";
      }>
    | null;
  context: StageContext;
  isPreview: boolean;
  previousBundle: Awaited<ReturnType<typeof getSnapshotBundle>> | null;
  previousScan: PreviousScanResult;
  scanConfig: Record<string, unknown> | null;
}) {
  const supabase = createAdminClient();
  const stage: ScanExecutionStage = "persistence_diff_finalization";
  const stageStartedAt = new Date();
  const degradedIssues: Array<{ category: ScanExecutionErrorCategory; message: string }> = [];
  let diff: SnapshotDiffResult | null = null;

  try {
    await saveSnapshotBundle(input.bundle);
  } catch (error) {
    const category = categorizeScannerExecutionError(error) === "database" ? "persistence" : categorizeScannerExecutionError(error);
    await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: error instanceof Error ? error.message : "Unknown persistence error",
      outcome: "failed",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    throw new StageExecutionError({
      stage,
      category,
      message: error instanceof Error ? error.message : "Unknown persistence error"
    });
  }

  if (input.compatibilitySignals) {
    try {
      await replaceScanSignals({
        scanId: input.context.scanId,
        signals: input.compatibilitySignals
      });
    } catch (error) {
      degradedIssues.push({
        category: "persistence",
        message: error instanceof Error ? error.message : "Unknown compatibility signal persistence error"
      });
    }
  } else {
    degradedIssues.push({
      category: "signal_derivation",
      message: "Compatibility signals were unavailable, so signal persistence was skipped."
    });
  }

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.privacyAuditStarted,
    message: input.isPreview
      ? "Privacy and consent normalization completed. Persisting the preview snapshot next."
      : "Privacy and consent normalization completed. Persisting the full scan snapshot next.",
    metadata: buildStageMetadata(stage, "started", {
      metadata: {
        privacyPolicyPresent: input.bundle.snapshot.privacyPolicyPresent,
        thirdPartyCookieSetBeforeConsent: input.bundle.snapshot.thirdPartyCookieSetBeforeConsent,
        trackingBeforeConsentDetected: input.bundle.snapshot.trackingBeforeConsentDetected
      }
    })
  });

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.signalsPersisted,
    message: "Stage 7 completed: canonical snapshot, page metadata, vendor rows, accessibility counts, and compatibility signals persisted.",
    metadata: buildStageMetadata(stage, degradedIssues.length > 0 ? "degraded" : "completed", {
      errorCategory: degradedIssues[0]?.category ?? null,
      metadata: {
        accessibilityRuleRowsPersisted: input.bundle.accessibilityRuleCounts.length,
        pagesPersisted: input.bundle.pages.length,
        privacyScore: input.bundle.snapshot.privacyScore,
        totalSignals: input.bundle.snapshot.totalSignals,
        trackerRowsPersisted: input.bundle.trackerVendors.length,
        trackerVendorCount: input.bundle.snapshot.trackerVendorCount
      }
    })
  });

  try {
    diff = diffSnapshots({
      domain: input.context.domainRow.hostname,
      eventTimestamp: new Date().toISOString(),
      currentSnapshot: input.bundle.snapshot,
      currentTrackers: input.bundle.trackerVendors,
      previousScanId: input.previousScan?.id ?? null,
      previousSnapshot: input.previousBundle?.snapshot ?? null,
      previousTrackers: input.previousBundle?.trackers ?? []
    });
  } catch (error) {
    degradedIssues.push({
      category: "diff",
      message: error instanceof Error ? error.message : "Unknown diff computation error"
    });
  }

  if (diff && input.context.scanRow.organization_id) {
    try {
      await saveComplianceChangeEvents({
        scanIdCurrent: input.context.scanId,
        organizationId: input.context.scanRow.organization_id,
        domainId: input.context.domainRow.id,
        events: diff.events
      });
    } catch (error) {
      degradedIssues.push({
        category: "diff",
        message: error instanceof Error ? error.message : "Unknown change event persistence error"
      });
    }
  }

  await insertScanEventSafely({
    scanId: input.context.scanId,
    domainId: input.context.domainRow.id,
    organizationId: input.context.scanRow.organization_id,
    eventType: SCAN_EVENT_TYPES.accessibilityAuditCompleted,
    message: input.isPreview
      ? "Accessibility and disclosure summaries were finalized for the preview result."
      : "Accessibility and disclosure summaries were finalized for the full scan result.",
    metadata: buildStageMetadata(stage, diff ? "completed" : "degraded", {
      errorCategory: diff ? null : "diff",
      metadata: {
        accessibilityScore: input.bundle.snapshot.accessibilityScore,
        legalCoverageScore: input.bundle.snapshot.legalCoverageScore,
        wcagErrorCountTotal: input.bundle.snapshot.wcagErrorCountTotal
      }
    })
  });

  if (diff) {
    await insertScanEventSafely({
      scanId: input.context.scanId,
      domainId: input.context.domainRow.id,
      organizationId: input.context.scanRow.organization_id,
      eventType: SCAN_EVENT_TYPES.changesComputed,
      message: diff.summary.isBaseline ? "Baseline snapshot recorded." : "Stage 8 completed: rich snapshot diff and change events recorded.",
      metadata: buildStageMetadata(stage, "completed", {
        metadata: diff.summary
      })
    });
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - input.context.startedAt.getTime();
  const { error: completeError } = await supabase
    .from("scans")
    .update({
      status: "completed",
      pages_scanned: input.bundle.snapshot.pagesScanned,
      completed_at: completedAt.toISOString(),
      duration_ms: durationMs,
      error_message: null
    })
    .eq("id", input.context.scanId);

  if (completeError) {
    const category: ScanExecutionErrorCategory = "persistence";
    await recordStageOutcome({
      context: input.context,
      errorCategory: category,
      message: `Failed to mark scan as completed: ${completeError.message}`,
      outcome: "failed",
      scanConfig: input.scanConfig,
      scanPlan: input.bundle.scanPlan,
      stage,
      stageStartedAt
    });

    throw new StageExecutionError({
      stage,
      category,
      message: `Failed to mark scan as completed: ${completeError.message}`
    });
  }

  const { error: domainUpdateError } = await supabase
    .from("domains")
    .update({
      latest_scan_id: input.context.scanId,
      last_scanned_at: completedAt.toISOString()
    })
    .eq("id", input.context.domainRow.id);

  if (domainUpdateError) {
    degradedIssues.push({
      category: "database",
      message: `Failed to update domain latest scan pointers: ${domainUpdateError.message}`
    });
  }

  const nextScanConfig = await recordStageOutcome({
    context: input.context,
    errorCategory: degradedIssues[0]?.category ?? null,
    message: degradedIssues.length > 0 ? degradedIssues.map((issue) => issue.message).join(" | ") : null,
    metadata: {
      changeSummary: diff?.summary ?? null,
      degradedIssueCount: degradedIssues.length
    },
    outcome: degradedIssues.length > 0 ? "degraded" : "success",
    scanConfig: input.scanConfig,
    scanPlan: input.bundle.scanPlan,
    stage,
    stageStartedAt
  });

  return {
    completedAt,
    diff,
    durationMs,
    nextScanConfig
  };
}

export async function runFullScanJob(scanId: string) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .select("id, organization_id, domain_id, pages_requested, status, scan_config_json, scan_type")
    .eq("id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load scan ${scanId}: ${error.message}`);
  }

  if (!scan) {
    throw new Error(`Scan ${scanId} was not found.`);
  }

  const scanRow = scan as ScanRow;

  if (!scanRow.domain_id) {
    throw new Error(`Scan ${scanId} is missing a domain.`);
  }

  if (scanRow.status === "completed") {
    return;
  }

  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url, max_pages_override")
    .eq("id", scanRow.domain_id)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load domain for scan ${scanId}: ${domainError.message}`);
  }

  if (!domain) {
    throw new Error(`Domain for scan ${scanId} was not found.`);
  }

  const domainRow = domain as DomainRow;
  const requestedPageCount = getRequestedPageCount(scanRow, domainRow);
  const startedAt = new Date();
  const isPreview = scanRow.scan_type === "preview";
  const startedEventType = scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.started : FULL_SCAN_EVENT_TYPES.started;
  const completedEventType =
    scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.completed : FULL_SCAN_EVENT_TYPES.completed;
  const failedEventType = scanRow.scan_type === "preview" ? PREVIEW_SCAN_EVENT_TYPES.failed : FULL_SCAN_EVENT_TYPES.failed;
  const crawlSource: CrawlSource =
    scanRow.scan_type === "scheduled" ? "scheduled" : scanRow.scan_type === "preview" ? "preview" : "manual";
  const context: StageContext = {
    domainRow,
    executionSummary: createScannerExecutionSummary({
      startedAt: startedAt.toISOString()
    }),
    requestedPageCount,
    scanId,
    scanRow,
    startedAt
  };
  let currentScanConfig = scanRow.scan_config_json;

  try {
    currentScanConfig = await runSetupStage({
      context,
      failedEventType,
      scanConfig: currentScanConfig,
      startedEventType
    });

    const baselineResult = await runBaselineLookupStage({
      context,
      crawlSource,
      isPreview,
      scanConfig: currentScanConfig
    });
    currentScanConfig = baselineResult.nextScanConfig;

    const crawlResult = await runCrawlDiscoveryStage({
      context,
      crawlSource,
      isPreview,
      previousBundle: baselineResult.previousBundle,
      scanConfig: currentScanConfig
    });
    currentScanConfig = crawlResult.nextScanConfig;

    const runtimeResult = await runRuntimeSnapshotStage({
      bundle: crawlResult.bundle,
      context,
      scanConfig: currentScanConfig
    });
    currentScanConfig = runtimeResult.nextScanConfig;

    const signalResult = await runSignalDerivationStage({
      bundle: crawlResult.bundle,
      context,
      isPreview,
      scanConfig: currentScanConfig
    });
    currentScanConfig = signalResult.nextScanConfig;

    const persistenceResult = await runPersistenceStage({
      bundle: crawlResult.bundle,
      compatibilitySignals: signalResult.compatibilitySignals,
      context,
      isPreview,
      previousBundle: baselineResult.previousBundle,
      previousScan: baselineResult.previousScan,
      scanConfig: currentScanConfig
    });
    currentScanConfig = persistenceResult.nextScanConfig;

    context.executionSummary = finalizeScannerExecutionSummary(context.executionSummary, {
      completedAt: persistenceResult.completedAt.toISOString(),
      lifecycle: "completed"
    });
    currentScanConfig = await persistExecutionSummarySafely({
      executionSummary: context.executionSummary,
      requestedPageCount,
      scanConfig: currentScanConfig,
      scanId,
      scanPlan: crawlResult.bundle.scanPlan
    });

    await insertScanEventSafely({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: completedEventType,
      message: scanRow.scan_type === "preview" ? "Live preview scan completed." : "Structured snapshot scan completed.",
      metadata: {
        changeSummary: persistenceResult.diff?.summary ?? null,
        durationMs: persistenceResult.durationMs,
        executionSummary: context.executionSummary,
        pagesScanned: crawlResult.bundle.snapshot.pagesScanned,
        totalSignals: crawlResult.bundle.snapshot.totalSignals,
        certscoreOverall: crawlResult.bundle.snapshot.certscoreOverall
      }
    });
  } catch (jobError) {
    const errorMessage = jobError instanceof Error ? jobError.message : "Unknown full scan job error";
    const failureCategory = getTerminalFailureCategory(jobError);

    context.executionSummary = finalizeScannerExecutionSummary(context.executionSummary, {
      completedAt: new Date().toISOString(),
      failureCategory,
      lifecycle: "failed"
    });
    currentScanConfig = await persistExecutionSummarySafely({
      executionSummary: context.executionSummary,
      requestedPageCount,
      scanConfig: currentScanConfig,
      scanId
    });

    await supabase
      .from("scans")
      .update({
        status: "failed",
        error_message: errorMessage
      })
      .eq("id", scanId);

    await insertScanEventSafely({
      scanId,
      domainId: domainRow.id,
      organizationId: scanRow.organization_id,
      eventType: failedEventType,
      message: scanRow.scan_type === "preview" ? "Live preview scan failed." : "Structured snapshot scan failed.",
      metadata: {
        error: errorMessage,
        executionSummary: context.executionSummary,
        failureCategory
      }
    });

    throw jobError;
  }
}
