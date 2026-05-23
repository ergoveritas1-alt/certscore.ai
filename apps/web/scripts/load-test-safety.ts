import {
  buildProductionLoadTestSource,
  isProductionLoadTestBatchId
} from "@website-signal-risk-scanner/shared";
import type {
  LoadTestEgressBudgetCheck,
  LoadTestEgressBudgetEvidence,
  LoadTestEgressBudgetPolicy
} from "@website-signal-risk-scanner/shared";
import * as egressBudgetModule from "../../../packages/shared/src/load-test-egress-budget";
import * as qualityWarningsModule from "../../../packages/shared/src/load-test-quality-warnings";
import { shouldBypassDnsValidationForProductionLoadTest } from "../app/api/full-scan/load-test-intake";

const { evaluateLoadTestQualityWarnings } = qualityWarningsModule;
const {
  assertLoadTestEgressBudgetAllowsEnqueue,
  DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY,
  evaluateLoadTestEgressBudget
} = egressBudgetModule;

export type LoadTestSummaryEntry = {
  accessPostureClass: string | null;
  completedAt: string | null;
  egressId: string | null;
  egressProvider?: string | null;
  errorCounters?: Record<string, number>;
  findingCounts: Record<string, number>;
  interruptionLabels: string[];
  pagesScanned: number | null;
  queueWaitMs: number | null;
  runDurationMs: number | null;
  scannerSlot: number | null;
  scannerTaskArn: string | null;
  status: string;
};

export type ProductionLoadTestEnqueueCommand = {
  body: {
    domain: string;
    forceNewScan: true;
  };
  headers: {
    "Content-Type": "application/json";
    "x-certscore-scan-source": string;
    "x-github-workflow": "production-load-test";
    "x-github-actor": "codex-ops";
    "x-github-sha": "manual";
    "x-github-run-id": string;
  };
  manifestRow: string;
  method: "POST";
  url: "https://certscore.ai/api/full-scan";
};

export type QueueMetadataCanaryRow = {
  id: string;
  queue_origin: string | null;
  queue_priority: number | null;
};

export type EgressBudgetScanCountsRow = {
  current_non_terminal_count: string | number | null;
  current_scanner_queue_count: string | number | null;
  recent_completed_count: string | number | null;
  recent_started_count: string | number | null;
};

function toNullableCount(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildEgressBudgetEvidenceFromScanCounts(row: EgressBudgetScanCountsRow | null): LoadTestEgressBudgetEvidence {
  if (!row) {
    return {
      currentNonTerminalCount: null,
      currentScannerQueueCount: null,
      recentCompletedCount: null,
      recentStartedCount: null
    };
  }

  return {
    currentNonTerminalCount: toNullableCount(row.current_non_terminal_count),
    currentScannerQueueCount: toNullableCount(row.current_scanner_queue_count),
    recentCompletedCount: toNullableCount(row.recent_completed_count),
    recentStartedCount: toNullableCount(row.recent_started_count)
  };
}

export function evaluateProductionLoadTestEgressBudget(input: {
  batchId: string;
  caveats?: string[];
  evidence: LoadTestEgressBudgetEvidence;
  policy?: Partial<LoadTestEgressBudgetPolicy> | null;
}): LoadTestEgressBudgetCheck {
  return evaluateLoadTestEgressBudget({
    batchId: input.batchId,
    caveats: input.caveats,
    evidence: input.evidence,
    policy: input.policy ?? DEFAULT_LOAD_TEST_EGRESS_BUDGET_POLICY
  });
}

export function assertProductionLoadTestEgressBudgetAllowsEnqueue(check: LoadTestEgressBudgetCheck) {
  assertLoadTestEgressBudgetAllowsEnqueue(check);
}

export function assertProductionLoadTestClassifierProof(input: {
  batchId: string;
  domain: string;
  manifestRow: string | number;
  trancoGenerated: string;
  trancoList: string;
  trancoRank: string | number;
}) {
  if (!isProductionLoadTestBatchId(input.batchId)) {
    throw new Error(`Invalid production load-test batch id: ${input.batchId}`);
  }

  const source = buildProductionLoadTestSource(input);
  const previous = process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
  process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS = "true";
  try {
    const classified = shouldBypassDnsValidationForProductionLoadTest({
      githubActor: "codex-ops",
      githubRunId: input.batchId,
      githubSha: "manual",
      githubWorkflow: "production-load-test",
      source
    });

    if (!classified) {
      throw new Error("Production load-test classifier proof failed for generated headers/source.");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS;
    } else {
      process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS = previous;
    }
  }

  return source;
}

export function buildProductionLoadTestEnqueueCommand(input: {
  batchId: string;
  domain: string;
  manifestRow: string | number;
  trancoGenerated: string;
  trancoList: string;
  trancoRank: string | number;
}): ProductionLoadTestEnqueueCommand {
  const source = assertProductionLoadTestClassifierProof(input);
  return {
    body: {
      domain: input.domain,
      forceNewScan: true
    },
    headers: {
      "Content-Type": "application/json",
      "x-certscore-scan-source": source,
      "x-github-workflow": "production-load-test",
      "x-github-actor": "codex-ops",
      "x-github-sha": "manual",
      "x-github-run-id": input.batchId
    },
    manifestRow: String(input.manifestRow),
    method: "POST",
    url: "https://certscore.ai/api/full-scan"
  };
}

export function assertDbBackedQueueMetadataCanary(input: {
  expectedScanIds: string[];
  rows: QueueMetadataCanaryRow[];
}) {
  if (input.expectedScanIds.length === 0) {
    throw new Error("DB-backed queue metadata canary cannot run without accepted scan ids.");
  }

  const expected = new Set(input.expectedScanIds);
  const seen = new Set(input.rows.map((row) => row.id));
  const missing = Array.from(expected).filter((scanId) => !seen.has(scanId));
  const unexpected = input.rows.filter((row) => !expected.has(row.id));
  const badRows = input.rows.filter(
    (row) => row.queue_origin !== "production_load_test" || row.queue_priority !== 90
  );

  if (missing.length > 0 || unexpected.length > 0 || badRows.length > 0) {
    throw new Error(
      `DB-backed queue metadata canary failed: checked=${input.rows.length}/${input.expectedScanIds.length}, missing=${missing.length}, unexpected=${unexpected.length}, bad=${badRows.length}`
    );
  }
}

export function assertQueueMetadataEvidenceIsDbBacked(input: { source: "db" | "scan-status" }) {
  if (input.source !== "db") {
    throw new Error("Queue metadata canary must use DB-backed evidence; scan-status does not expose queue_origin/queue_priority.");
  }
}

function timeBucket(value: string | null) {
  if (!value) {
    return "unknown";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "unknown";
  }

  date.setUTCMinutes(Math.floor(date.getUTCMinutes() / 15) * 15, 0, 0);
  return date.toISOString();
}

function groupKey(entry: LoadTestSummaryEntry) {
  return [
    entry.egressId ?? "unknown-egress",
    timeBucket(entry.completedAt),
    entry.scannerTaskArn ?? "unknown-task",
    entry.scannerSlot === null ? "unknown-slot" : `slot-${entry.scannerSlot}`
  ].join("|");
}

export function summarizeLoadTestQuality(entries: LoadTestSummaryEntry[]) {
  const groups = new Map<string, {
    accessPostureClasses: Record<string, number>;
    completedCount: number;
    completionTimeBucket: string;
    egressId: string;
    errorCounters: Record<string, number>;
    interruptionLabels: Record<string, number>;
    pagesScanned: number;
    queueWaitMsAverage: number | null;
    runDurationMsAverage: number | null;
    scannerSlot: string;
    scannerTaskArn: string;
    topFindingCount: number;
    zeroFindingCount: number;
    zeroFindingRate: number;
  } & { queueWaitValues: number[]; runDurationValues: number[] }>();

  for (const entry of entries) {
    const [egressId, completionTimeBucket, scannerTaskArn, scannerSlot] = groupKey(entry).split("|") as [
      string,
      string,
      string,
      string
    ];
    const group = groups.get(groupKey(entry)) ?? {
      accessPostureClasses: {},
      completedCount: 0,
      completionTimeBucket,
      egressId,
      errorCounters: {},
      interruptionLabels: {},
      pagesScanned: 0,
      queueWaitMsAverage: null,
      queueWaitValues: [],
      runDurationMsAverage: null,
      runDurationValues: [],
      scannerSlot,
      scannerTaskArn,
      topFindingCount: 0,
      zeroFindingCount: 0,
      zeroFindingRate: 0
    };

    const findingTotal = Object.values(entry.findingCounts).reduce((sum, value) => sum + Math.max(0, value), 0);

    if (entry.status === "completed") {
      group.completedCount += 1;
      group.topFindingCount += findingTotal;
      if (findingTotal === 0) {
        group.zeroFindingCount += 1;
      }
    }

    group.pagesScanned += Math.max(0, entry.pagesScanned ?? 0);

    const posture = entry.accessPostureClass ?? "unknown";
    group.accessPostureClasses[posture] = (group.accessPostureClasses[posture] ?? 0) + 1;

    for (const label of entry.interruptionLabels.length > 0 ? entry.interruptionLabels : ["none"]) {
      group.interruptionLabels[label] = (group.interruptionLabels[label] ?? 0) + 1;
    }

    for (const [key, value] of Object.entries(entry.errorCounters ?? {})) {
      group.errorCounters[key] = (group.errorCounters[key] ?? 0) + value;
    }

    if (entry.queueWaitMs !== null && Number.isFinite(entry.queueWaitMs)) {
      group.queueWaitValues.push(entry.queueWaitMs);
    }
    if (entry.runDurationMs !== null && Number.isFinite(entry.runDurationMs)) {
      group.runDurationValues.push(entry.runDurationMs);
    }

    groups.set(groupKey(entry), group);
  }

  return Array.from(groups.values()).map((group) => {
    const queueWaitMsAverage =
      group.queueWaitValues.length > 0
        ? group.queueWaitValues.reduce((sum, value) => sum + value, 0) / group.queueWaitValues.length
        : null;
    const runDurationMsAverage =
      group.runDurationValues.length > 0
        ? group.runDurationValues.reduce((sum, value) => sum + value, 0) / group.runDurationValues.length
        : null;

    return {
      accessPostureClasses: group.accessPostureClasses,
      completedCount: group.completedCount,
      completionTimeBucket: group.completionTimeBucket,
      egressId: group.egressId,
      errorCounters: group.errorCounters,
      interruptionLabels: group.interruptionLabels,
      pagesScanned: group.pagesScanned,
      queueWaitMsAverage,
      runDurationMsAverage,
      scannerSlot: group.scannerSlot,
      scannerTaskArn: group.scannerTaskArn,
      topFindingCount: group.topFindingCount,
      zeroFindingCount: group.zeroFindingCount,
      zeroFindingRate: group.zeroFindingCount / Math.max(1, group.completedCount)
    };
  });
}

export function evaluatePhase1BQualityWarnings(input: {
  baseline?: {
    blockerLabelRate?: number | null;
    completedCount?: number;
    findingsPerCompleted?: number;
    label?: string;
    pagesScanned?: number;
    runtimeErrorRate?: number | null;
    tier?: "same_row" | "rolling";
    zeroFindingRate?: number;
  };
  batchId: string;
  entries: LoadTestSummaryEntry[];
  generatedAt?: string;
  rollingBaselinesByEgress?: Record<string, NonNullable<Parameters<typeof evaluateLoadTestQualityWarnings>[0]["baseline"]>>;
}) {
  const byEgress = new Map<string, LoadTestSummaryEntry[]>();
  for (const entry of input.entries) {
    const key = entry.egressId ?? "unknown-egress";
    byEgress.set(key, [...(byEgress.get(key) ?? []), entry]);
  }

  const windows = Array.from(byEgress.entries()).map(([egressId, entries]) => {
    const completedEntries = entries.filter((entry) => entry.status === "completed");
    const findingTotal = completedEntries.reduce(
      (sum, entry) => sum + Object.values(entry.findingCounts).reduce((inner, value) => inner + Math.max(0, value), 0),
      0
    );
    const zeroFindingCount = completedEntries.filter(
      (entry) => Object.values(entry.findingCounts).reduce((sum, value) => sum + Math.max(0, value), 0) === 0
    ).length;
    const labelCounts: Record<string, number> = {};
    const errorCounters: Record<string, number> = {};
    let pagesScanned = 0;
    let egressProvider = "unknown";

    for (const entry of completedEntries) {
      pagesScanned += Math.max(0, entry.pagesScanned ?? 0);
      for (const label of entry.interruptionLabels.length > 0 ? entry.interruptionLabels : ["none"]) {
        labelCounts[label] = (labelCounts[label] ?? 0) + 1;
      }
      for (const [key, value] of Object.entries(entry.errorCounters ?? {})) {
        errorCounters[key] = (errorCounters[key] ?? 0) + value;
      }
      if (entry.egressId === egressId && egressProvider === "unknown" && entry.egressProvider) {
        egressProvider = entry.egressProvider;
      }
    }

    return {
      egressProvider,
      egress_id: egressId,
      labelCounts,
      metrics: {
        completedCount: completedEntries.length,
        findingsPerCompleted: findingTotal / Math.max(1, completedEntries.length),
        pagesScanned,
        zeroFindingRate: zeroFindingCount / Math.max(1, completedEntries.length)
      },
      runtimeErrorCounters: errorCounters
    };
  });

  return windows.flatMap((window) =>
    evaluateLoadTestQualityWarnings({
      baseline: input.rollingBaselinesByEgress?.[window.egress_id] ?? input.baseline,
      batchId: input.batchId,
      egressProvider: window.egressProvider,
      egress_id: window.egress_id,
      generatedAt: input.generatedAt,
      labelCounts: window.labelCounts,
      metrics: window.metrics,
      peerWindows: windows
        .filter((peer) => peer.egress_id !== window.egress_id)
        .map((peer) => ({
          egressProvider: peer.egressProvider,
          egress_id: peer.egress_id,
          metrics: peer.metrics
        })),
      runtimeErrorCounters: window.runtimeErrorCounters
    })
  );
}
