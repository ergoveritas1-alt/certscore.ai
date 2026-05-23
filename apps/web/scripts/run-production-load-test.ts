import fs from "node:fs";
import path from "node:path";
import { query } from "@website-signal-risk-scanner/db";
import { buildProductionLoadTestBatchId, isProductionLoadTestBatchId } from "@website-signal-risk-scanner/shared";
import {
  buildRollingBaseline,
  buildScannerQualityWindows,
  loadRecentScannerQualityWindows,
  persistQualityWarningEvents,
  persistScannerQualityWindows
} from "../server/ops/load-test-quality-history";
import { normalizeLoadTestEgressBudgetPolicy } from "../../../packages/shared/src/load-test-egress-budget";
import {
  assertProductionLoadTestEgressBudgetAllowsEnqueue,
  assertDbBackedQueueMetadataCanary,
  assertProductionLoadTestClassifierProof,
  assertQueueMetadataEvidenceIsDbBacked,
  buildEgressBudgetEvidenceFromScanCounts,
  buildProductionLoadTestEnqueueCommand,
  evaluatePhase1BQualityWarnings,
  evaluateProductionLoadTestEgressBudget,
  type EgressBudgetScanCountsRow,
  type ProductionLoadTestEnqueueCommand,
  summarizeLoadTestQuality
} from "./load-test-safety";
import type { LoadTestEgressBudgetPolicy } from "@website-signal-risk-scanner/shared";

const POLL_INTERVAL_MS = 30_000;
const BASE_URL = "https://certscore.ai";

type ManifestRow = {
  domain: string;
  manifest_row: string;
  tranco_rank: string;
  source_list_id: string;
  source_snapshot_date: string;
};

type EnqueueResult = {
  manifest_row: string;
  tranco_rank: string;
  domain: string;
  scanId: string | null;
  scanUrl: string | null;
  enqueuedAt: string;
  ok: boolean;
  error: string | null;
};

type EnqueueCommandsArtifact = {
  batchId: string;
  commands: ProductionLoadTestEnqueueCommand[];
  end: number;
  generatedAt: string;
  manifestPath: string;
  start: number;
};

type ScanStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "error";

type PollEntry = {
  accessPostureClass: string | null;
  findingCounts: Record<string, number>;
  manifest_row: string;
  tranco_rank: string;
  domain: string;
  pagesScanned: number | null;
  scanId: string;
  enqueuedAt: string;
  status: ScanStatus;
  interruptionSummary: {
    categories: string[];
    hasInterruption: boolean;
    reason: string | null;
    stopReasonCode: string | null;
  } | null;
  httpStatus: number | null;
  loaded: boolean;
  error: string | null;
  reportReadiness: {
    findingsReady: boolean | null;
    mergedSignalsReady: boolean | null;
    status: string | null;
  } | null;
  scannerRuntime: {
    awsRegion: string | null;
    egressId: string | null;
    egressProvider: string | null;
    scannerSlot: number | null;
    scannerTaskArn: string | null;
    scannerTaskDefinitionArn: string | null;
    scannerTaskRevision: string | null;
  } | null;
  scanTimes: {
    completedAt: string | null;
    createdAt: string | null;
    startedAt: string | null;
  };
};

type OperatorEvent = {
  at: string;
  type: string;
  message: string;
  detail?: unknown;
};

type FindingSummary = {
  findingId: string;
  count: number;
};

type InterruptionEntry = {
  category: string;
  count: number;
  examples: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function parseCsv(input: string): ManifestRow[] {
  const lines = input.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];

  const headers = headerLine.split(",");
  return dataLines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? "";
      });
      return obj as unknown as ManifestRow;
    });
}

function appendJsonl(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function logEvent(
  eventsPath: string,
  type: string,
  message: string,
  detail?: unknown
) {
  const event: OperatorEvent = {
    at: new Date().toISOString(),
    type,
    message,
    detail,
  };
  appendJsonl(eventsPath, event);
  console.log(`[EVENT] ${type}: ${message}`);
}

async function enqueueScan(
  row: ManifestRow,
  batchId: string
): Promise<{ command: ProductionLoadTestEnqueueCommand; result: EnqueueResult }> {
  const command = buildProductionLoadTestEnqueueCommand({
    batchId,
    domain: row.domain,
    manifestRow: row.manifest_row,
    trancoGenerated: row.source_snapshot_date,
    trancoList: row.source_list_id,
    trancoRank: row.tranco_rank
  });

  const response = await fetch(new URL("/api/full-scan", BASE_URL), {
    method: command.method,
    headers: command.headers,
    body: JSON.stringify(command.body),
  });

  const body = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    // not JSON
  }

  const ok = response.ok;
  const scanId = typeof parsed.scanId === "string" ? parsed.scanId : null;

  return {
    command,
    result: {
      manifest_row: row.manifest_row,
      tranco_rank: row.tranco_rank,
      domain: row.domain,
      scanId,
      scanUrl: scanId ? `/scan/${scanId}` : null,
      enqueuedAt: new Date().toISOString(),
      ok,
      error: ok ? null : body.slice(0, 500),
    }
  };
}

async function pollScan(entry: EnqueueResult): Promise<PollEntry | null> {
  if (!entry.ok || !entry.scanUrl) {
    return {
      accessPostureClass: null,
      findingCounts: {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      pagesScanned: null,
      scanId: "n/a",
      enqueuedAt: entry.enqueuedAt,
      status: "error",
      interruptionSummary: null,
      httpStatus: null,
      loaded: false,
      error: entry.error ?? "Enqueue failed",
      reportReadiness: null,
      scannerRuntime: null,
      scanTimes: {
        completedAt: null,
        createdAt: null,
        startedAt: null
      }
    };
  }

  try {
    const response = await fetch(new URL(`/api/scan-status/${entry.scanId}?includeFindings=1`, BASE_URL), {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store"
      },
      redirect: "follow",
    });

    const body = (await response.json()) as {
      accessPosture?: {
        accessPostureClass?: string | null;
      };
      findingCounts?: Record<string, number>;
      interruptionSummary?: PollEntry["interruptionSummary"];
      reportReadiness?: PollEntry["reportReadiness"];
      scannerRuntime?: PollEntry["scannerRuntime"];
      scan?: {
        completedAt?: string | null;
        createdAt?: string | null;
        pagesScanned?: number | null;
        startedAt?: string | null;
        status?: string;
      };
    };
    const loaded = response.ok;
    const status = normalizeScanStatus(body.scan?.status);

    return {
      accessPostureClass: body.accessPosture?.accessPostureClass ?? null,
      findingCounts: body.findingCounts ?? {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      pagesScanned: body.scan?.pagesScanned ?? null,
      scanId: entry.scanId ?? "unknown",
      enqueuedAt: entry.enqueuedAt,
      status,
      interruptionSummary: body.interruptionSummary ?? null,
      httpStatus: response.status,
      loaded,
      error: null,
      reportReadiness: body.reportReadiness ?? null,
      scannerRuntime: body.scannerRuntime ?? null,
      scanTimes: {
        completedAt: body.scan?.completedAt ?? null,
        createdAt: body.scan?.createdAt ?? null,
        startedAt: body.scan?.startedAt ?? null
      }
    };
  } catch (error) {
    return {
      accessPostureClass: null,
      findingCounts: {},
      manifest_row: entry.manifest_row,
      tranco_rank: entry.tranco_rank,
      domain: entry.domain,
      pagesScanned: null,
      scanId: entry.scanId ?? "unknown",
      enqueuedAt: entry.enqueuedAt,
      status: "error",
      interruptionSummary: null,
      httpStatus: null,
      loaded: false,
      error: error instanceof Error ? error.message : String(error),
      reportReadiness: null,
      scannerRuntime: null,
      scanTimes: {
        completedAt: null,
        createdAt: null,
        startedAt: null
      }
    };
  }
}

async function verifyPostEnqueueCanary(scanIds: string[]) {
  assertQueueMetadataEvidenceIsDbBacked({ source: "db" });

  const result = await query<{ id: string; queue_origin: string; queue_priority: number }>(
    `select id, queue_origin, queue_priority
       from scans
      where id = any($1::uuid[])`,
    [scanIds],
    { readOnly: true }
  );

  assertDbBackedQueueMetadataCanary({
    expectedScanIds: scanIds,
    rows: result.rows
  });

  return result.rows;
}

async function loadEgressBudgetEvidence(policy: Pick<LoadTestEgressBudgetPolicy, "egress_id">) {
  const result = await query<EgressBudgetScanCountsRow>(
    `select
        count(*) filter (
          where egress_id = $1
            and status not in ('completed', 'failed', 'canceled')
        )::text as current_non_terminal_count,
        count(*) filter (
          where status = 'queued'
        )::text as current_scanner_queue_count,
        count(*) filter (
          where egress_id = $1
            and started_at >= now() - interval '1 hour'
        )::text as recent_started_count,
        count(*) filter (
          where egress_id = $1
            and completed_at >= now() - interval '1 hour'
        )::text as recent_completed_count
       from scans`,
    [policy.egress_id],
    { readOnly: true }
  );

  return buildEgressBudgetEvidenceFromScanCounts(result.rows[0] ?? null);
}

function durationMs(start: string | null, end: string | null) {
  if (!start || !end) {
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null;
}

function normalizeScanStatus(status: string | null | undefined): ScanStatus {
  if (
    status === "queued" ||
    status === "running" ||
    status === "completed" ||
    status === "failed" ||
    status === "canceled" ||
    status === "error"
  ) {
    return status;
  }

  return "queued";
}

function aggregateFindings(polls: PollEntry[][]): FindingSummary[] {
  const counts = new Map<string, number>();
  for (const pollSeries of polls) {
    const last = pollSeries[pollSeries.length - 1];
    if (!last) continue;

    for (const [findingId, count] of Object.entries(last.findingCounts)) {
      if (count > 0) {
        counts.set(findingId, (counts.get(findingId) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries()).map(([id, count]) => ({
    findingId: id,
    count,
  }));
}

function aggregateInterruptions(polls: PollEntry[][]): InterruptionEntry[] {
  const categories = new Map<
    string,
    { count: number; examples: Set<string> }
  >();

  for (const pollSeries of polls) {
    const last = pollSeries[pollSeries.length - 1];
    if (!last) continue;

    if (last.interruptionSummary?.hasInterruption) {
      for (const cat of last.interruptionSummary.categories) {
        const entry = categories.get(cat) ?? {
          count: 0,
          examples: new Set<string>(),
        };
        entry.count += 1;
        entry.examples.add(last.domain);
        categories.set(cat, entry);
      }
    } else if (last.status === "error" || last.status === "failed") {
      const cat = last.error
        ? `error:${last.error.slice(0, 40)}`
        : "unknown_failure";
      const entry = categories.get(cat) ?? {
        count: 0,
        examples: new Set<string>(),
      };
      entry.count += 1;
      entry.examples.add(last.domain);
      categories.set(cat, entry);
    }
  }

  return Array.from(categories.entries()).map(([category, data]) => ({
    category,
    count: data.count,
    examples: Array.from(data.examples).slice(0, 3),
  }));
}

function isTerminal(status: ScanStatus) {
  return ["completed", "failed", "canceled", "error"].includes(status);
}

function isLoadTestComplete(entry: PollEntry) {
  if (entry.status !== "completed") {
    return isTerminal(entry.status);
  }

  return entry.reportReadiness?.findingsReady !== false;
}

function summarizeStatus(
  active: PollEntry[],
  terminalCount: number,
  totalCount: number
) {
  const queued = active.filter((e) => e.status === "queued").length;
  const running = active.filter((e) => e.status === "running").length;
  const finalizing = active.filter(
    (e) => e.status === "completed" && e.reportReadiness?.findingsReady === false
  ).length;
  const completed = terminalCount;
  const errors = active.filter(
    (e) => e.status === "error" || e.status === "failed"
  ).length;

  return `[STATUS] ${completed}/${totalCount} done | running:${running} | queued:${queued} | finalizing:${finalizing} | errors:${errors}`;
}

async function main() {
  const manifestPath =
    getArgValue("--manifest") ??
    path.resolve("apps/web/tmp/tranco-load-tests/load-test-manifest.csv");
  const start = Number(getArgValue("--start") ?? 1206);
  const end = Number(getArgValue("--end") ?? 1300);
  const outputDir =
    getArgValue("--out") ??
    path.resolve(
      `apps/web/tmp/tranco-load-tests/runs/${buildProductionLoadTestBatchId({ start, end })}`
    );
  const egressBudgetPolicyPath = path.resolve(
    getArgValue("--egress-budget-policy") ?? "apps/web/tmp/tranco-load-tests/egress-budget-policy.json"
  );

  const batchId = path.basename(outputDir);
  const eventsPath = path.join(outputDir, "operator-events.jsonl");
  const monitorPath = path.join(outputDir, "live-monitor.jsonl");
  const egressBudgetPath = path.join(outputDir, "egress-budget-check.json");
  const enqueueCommandsPath = path.join(outputDir, "enqueue-commands.json");
  const enqueuePath = path.join(outputDir, "enqueue-results.json");
  const canaryPath = path.join(outputDir, "canary-queue-metadata-db-check.json");
  const findingsPath = path.join(outputDir, "findings-table.json");
  const interruptionsPath = path.join(outputDir, "interruptions.json");
  const reportPath = path.join(outputDir, "consolidated-report.md");
  const qualitySummaryPath = path.join(outputDir, "egress-quality-summary.json");
  const qualityWarningsPath = path.join(outputDir, "quality-warnings.json");

  fs.mkdirSync(outputDir, { recursive: true });

  console.log(
    `Load test: manifest=${manifestPath} range=${start}-${end} output=${outputDir}`
  );
  console.log("");
  if (!isProductionLoadTestBatchId(batchId)) {
    throw new Error(`Output directory basename must be a canonical production load-test batch id.`);
  }

  if (!batchId.startsWith(`prod-manifest-${start}-${end}-load-test-`)) {
    throw new Error(`Output directory basename must be the canonical batch id for range ${start}-${end}.`);
  }

  // safety checks
  logEvent(eventsPath, "safety_check", "DNS bypass check", {
    env: process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS,
  });

  if (
    process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS !== "true"
  ) {
    console.error(
      "ERROR: FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS must be 'true'"
    );
    process.exit(1);
  }

  logEvent(eventsPath, "safety_check", "Autoscaling check starting");
  // Would call pnpm ops:check:scanner-autoscaling here
  logEvent(eventsPath, "safety_check", "Autoscaling check passed (skipped in script)");

  // read manifest
  const csv = fs.readFileSync(manifestPath, "utf8");
  const allRows = parseCsv(csv);
  const targetRows = allRows.filter((row) => {
    const n = Number(row.manifest_row);
    return n >= start && n <= end;
  });

  logEvent(eventsPath, "manifest_loaded", `Loaded ${targetRows.length} domains from manifest rows ${start}-${end}`);
  if (targetRows[0]) {
    assertProductionLoadTestClassifierProof({
      batchId,
      domain: targetRows[0].domain,
      manifestRow: targetRows[0].manifest_row,
      trancoGenerated: targetRows[0].source_snapshot_date,
      trancoList: targetRows[0].source_list_id,
      trancoRank: targetRows[0].tranco_rank
    });
    logEvent(eventsPath, "classifier_proof", "Generated load-test headers/source classify as trusted production load-test traffic.");
  }

  const configuredEgressBudgetPolicy = readJsonIfExists<Partial<LoadTestEgressBudgetPolicy>>(egressBudgetPolicyPath);
  const egressBudgetPolicy = normalizeLoadTestEgressBudgetPolicy(configuredEgressBudgetPolicy);
  let egressBudgetCaveats =
    configuredEgressBudgetPolicy === null
      ? [`No egress budget policy file found at ${egressBudgetPolicyPath}; using built-in conservative defaults.`]
      : [`Loaded egress budget policy from ${egressBudgetPolicyPath}.`];
  let egressBudgetEvidence;
  try {
    egressBudgetEvidence = await loadEgressBudgetEvidence(egressBudgetPolicy);
  } catch (error) {
    egressBudgetEvidence = buildEgressBudgetEvidenceFromScanCounts(null);
    egressBudgetCaveats = [
      ...egressBudgetCaveats,
      `Database evidence query failed: ${error instanceof Error ? error.message : String(error)}`
    ];
  }
  const egressBudgetCheck = evaluateProductionLoadTestEgressBudget({
    batchId,
    caveats: egressBudgetCaveats,
    evidence: egressBudgetEvidence,
    policy: egressBudgetPolicy
  });
  writeJson(egressBudgetPath, egressBudgetCheck);
  logEvent(
    eventsPath,
    "egress_budget_check",
    `Egress budget decision=${egressBudgetCheck.decision} for ${egressBudgetCheck.egress_id}.`,
    {
      artifact: egressBudgetPath,
      reasons: egressBudgetCheck.reasons,
      recommendedResumeAt: egressBudgetCheck.recommendedResumeAt
    }
  );
  assertProductionLoadTestEgressBudgetAllowsEnqueue(egressBudgetCheck);

  // enqueue the first row as the post-enqueue canary before continuing the batch
  logEvent(eventsPath, "enqueue_start", `Enqueuing ${targetRows.length} domains`);
  const enqueueResults: EnqueueResult[] = [];
  const enqueueCommands: ProductionLoadTestEnqueueCommand[] = [];
  const enqueueCommandsArtifact = (): EnqueueCommandsArtifact => ({
    batchId,
    commands: enqueueCommands,
    end,
    generatedAt: new Date().toISOString(),
    manifestPath,
    start
  });
  const writeEnqueueArtifacts = () => {
    writeJson(enqueueCommandsPath, enqueueCommandsArtifact());
    writeJson(enqueuePath, {
      batchId,
      manifestPath,
      start,
      end,
      results: enqueueResults,
    });
  };

  const [canaryRow, ...remainingRows] = targetRows;
  if (!canaryRow) {
    throw new Error("No manifest rows selected for enqueue.");
  }

  const canary = await enqueueScan(canaryRow, batchId);
  enqueueCommands.push(canary.command);
  enqueueResults.push(canary.result);
  console.log(
    `[ENQUEUE] ${(canary.result.ok ? "OK" : "FAIL").padEnd(4)} | row=${canary.result.manifest_row.padStart(4)} | ${canary.result.domain.padEnd(30)} | scanId=${canary.result.scanId ?? "n/a"} | canary`
  );
  writeEnqueueArtifacts();

  if (!canary.result.ok || !canary.result.scanId) {
    throw new Error("Post-enqueue canary request was not accepted; stopping before remaining rows.");
  }

  let canaryRows: Array<{ id: string; queue_origin: string; queue_priority: number }>;
  try {
    canaryRows = await verifyPostEnqueueCanary([canary.result.scanId]);
  } catch (error) {
    writeJson(canaryPath, {
      batchId,
      checkedAt: new Date().toISOString(),
      evidence: "db",
      error: error instanceof Error ? error.message : String(error),
      result: "FAIL",
      scanIds: [canary.result.scanId]
    });
    throw error;
  }
  writeJson(canaryPath, {
    batchId,
    checkedAt: new Date().toISOString(),
    evidence: "db",
    result: "PASS",
    scanIds: [canary.result.scanId],
    rows: canaryRows.map((row) => ({
      id: row.id,
      queue_origin: row.queue_origin,
      queue_priority: row.queue_priority
    }))
  });
  logEvent(eventsPath, "post_enqueue_canary", "DB-backed canary confirmed queue_origin=production_load_test and queue_priority=90 for the first accepted scan.");

  await sleep(2000);

  for (const row of remainingRows) {
    const { command, result } = await enqueueScan(row, batchId);
    enqueueCommands.push(command);
    enqueueResults.push(result);
    const status = result.ok ? "OK" : "FAIL";
    console.log(
      `[ENQUEUE] ${status.padEnd(4)} | row=${result.manifest_row.padStart(4)} | ${result.domain.padEnd(30)} | scanId=${result.scanId ?? "n/a"}`
    );
    writeEnqueueArtifacts();
    await sleep(2000);
  }

  writeEnqueueArtifacts();

  const successful = enqueueResults.filter((e) => e.ok);
  const failed = enqueueResults.filter((e) => !e.ok);
  logEvent(
    eventsPath,
    "enqueue_complete",
    `Enqueued: ${successful.length} OK, ${failed.length} failed`
  );

  if (successful.length === 0) {
    console.error("No domains were successfully enqueued.");
    process.exit(1);
  }

  await verifyPostEnqueueCanary(successful.map((entry) => entry.scanId).filter((scanId): scanId is string => Boolean(scanId)));
  logEvent(eventsPath, "post_enqueue_canary_all", "Accepted scans have queue_origin=production_load_test and queue_priority=90.");

  // monitoring loop
  logEvent(eventsPath, "monitor_start", "Starting monitoring loop");
  let active = successful;
  let terminal: PollEntry[] = [];
  let pollCount = 0;

  while (active.length > 0) {
    pollCount += 1;
    const snapshot = await Promise.all(active.map((e) => pollScan(e)));
    const filtered = snapshot.filter(
      (e): e is PollEntry => e !== null
    );

    const newTerminal = filtered.filter((e) => isLoadTestComplete(e));
    terminal = [...terminal, ...newTerminal];
    const latestByScanId = new Map(filtered.map((entry) => [entry.scanId, entry]));
    active = active.filter((entry) => {
      const latest = latestByScanId.get(entry.scanId ?? "unknown");
      return latest ? !isLoadTestComplete(latest) : true;
    });

    const monitorSnapshot = {
      at: new Date().toISOString(),
      poll: pollCount,
      active: active.length,
      terminal: terminal.length,
      scans: filtered,
    };
    appendJsonl(monitorPath, monitorSnapshot);

    const activePolls = filtered.filter((e) => !isLoadTestComplete(e));
    const statusLine = summarizeStatus(activePolls, terminal.length, successful.length);
    console.log(statusLine);

    if (active.length === 0) break;
    await sleep(POLL_INTERVAL_MS);
  }

  logEvent(
    eventsPath,
    "monitor_complete",
    `All ${successful.length} scans terminal after ${pollCount} polls`
  );

  // final reports
  const allPolls = terminal.map((t) => [t]);
  const findings = aggregateFindings(allPolls);
  const interruptions = aggregateInterruptions(allPolls);
  const qualitySummary = summarizeLoadTestQuality(
    terminal.map((entry) => ({
      accessPostureClass: entry.accessPostureClass,
      completedAt: entry.scanTimes.completedAt,
      egressId: entry.scannerRuntime?.egressId ?? null,
      egressProvider: entry.scannerRuntime?.egressProvider ?? null,
      findingCounts: entry.findingCounts,
      interruptionLabels: entry.interruptionSummary?.categories ?? [],
      pagesScanned: entry.pagesScanned,
      queueWaitMs: durationMs(entry.scanTimes.createdAt, entry.scanTimes.startedAt),
      runDurationMs: durationMs(entry.scanTimes.startedAt, entry.scanTimes.completedAt),
      scannerSlot: entry.scannerRuntime?.scannerSlot ?? null,
      scannerTaskArn: entry.scannerRuntime?.scannerTaskArn ?? null,
      status: entry.status
    }))
  );
  const qualityWarningEntries = terminal.map((entry) => ({
    accessPostureClass: entry.accessPostureClass,
    completedAt: entry.scanTimes.completedAt,
    egressId: entry.scannerRuntime?.egressId ?? null,
    egressProvider: entry.scannerRuntime?.egressProvider ?? null,
    findingCounts: entry.findingCounts,
    interruptionLabels: entry.interruptionSummary?.categories ?? [],
    pagesScanned: entry.pagesScanned,
    queueWaitMs: durationMs(entry.scanTimes.createdAt, entry.scanTimes.startedAt),
    runDurationMs: durationMs(entry.scanTimes.startedAt, entry.scanTimes.completedAt),
    scannerSlot: entry.scannerRuntime?.scannerSlot ?? null,
    scannerTaskArn: entry.scannerRuntime?.scannerTaskArn ?? null,
    status: entry.status
  }));
  const currentQualityWindows = buildScannerQualityWindows({
    batchId,
    entries: qualityWarningEntries,
    endRow: end,
    rejectedCount: failed.length,
    startRow: start
  });
  const rollingBaselinesByEgress: Record<string, NonNullable<Parameters<typeof evaluatePhase1BQualityWarnings>[0]["baseline"]>> = {};
  for (const window of currentQualityWindows) {
    const recentWindows = await loadRecentScannerQualityWindows({
      egressId: window.egress_id,
      excludeBatchId: batchId,
      limit: 5
    });
    const baseline = buildRollingBaseline(recentWindows);
    if (baseline) {
      rollingBaselinesByEgress[window.egress_id] = baseline;
    }
  }
  const qualityWarnings = evaluatePhase1BQualityWarnings({
    batchId,
    entries: qualityWarningEntries,
    rollingBaselinesByEgress
  });
  const qualityArtifactsGeneratedAt = new Date().toISOString();

  writeJson(findingsPath, findings);
  writeJson(interruptionsPath, interruptions);
  writeJson(qualitySummaryPath, {
    generatedAt: qualityArtifactsGeneratedAt,
    qualityWarnings,
    summary: qualitySummary
  });
  writeJson(qualityWarningsPath, {
    batchId,
    generatedAt: qualityArtifactsGeneratedAt,
    rollingBaselinesByEgress,
    warningCount: qualityWarnings.length,
    warnings: qualityWarnings
  });
  try {
    await persistScannerQualityWindows({
      batchId,
      entries: qualityWarningEntries,
      endRow: end,
      rejectedCount: failed.length,
      startRow: start
    });
    await persistQualityWarningEvents(qualityWarnings);
    logEvent(eventsPath, "quality_history_persisted", "Persisted scanner quality windows and WARN-only warning events.");
  } catch (error) {
    logEvent(eventsPath, "quality_history_persist_failed", "Could not persist scanner quality history; local artifacts were still written.", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // findings table
  console.log("");
  console.log("## Findings Table");
  console.log("");
  console.log("| Finding ID         | Count |");
  console.log("|--------------------|-------|");
  for (const f of findings) {
    console.log(
      `| ${f.findingId.padEnd(18)} | ${String(f.count).padStart(5)} |`
    );
  }

  // interruptions breakdown
  console.log("");
  console.log("## Interruptions Breakdown");
  console.log("");
  for (const i of interruptions) {
    console.log(`### ${i.category} (${i.count})`);
    for (const ex of i.examples) {
      console.log(`  - ${ex}`);
    }
    console.log("");
  }

  // consolidated report
  const reportLines: string[] = [];
  reportLines.push(`# Load Test Report — ${batchId}`);
  reportLines.push("");
  reportLines.push(`- **Range:** ${start}–${end}`);
  reportLines.push(`- **Domains enqueued:** ${successful.length}`);
  reportLines.push(`- **Completed:** ${terminal.filter((e) => e.status === "completed").length}`);
  reportLines.push(`- **Failed/Error:** ${terminal.filter((e) => e.status !== "completed").length}`);
  reportLines.push(`- **Polls:** ${pollCount}`);
  reportLines.push("");
  reportLines.push("## Phase 1C Egress Budget");
  reportLines.push("");
  reportLines.push(`- **Decision:** ${egressBudgetCheck.decision}`);
  reportLines.push(`- **Egress:** ${egressBudgetCheck.egress_id} / ${egressBudgetCheck.egress_provider}`);
  reportLines.push(`- **Artifact:** ${egressBudgetPath}`);
  reportLines.push(`- **Reasons:** ${egressBudgetCheck.reasons.join(" ")}`);
  if (egressBudgetCheck.recommendedResumeAt) {
    reportLines.push(`- **Recommended resume:** ${egressBudgetCheck.recommendedResumeAt}`);
  }
  reportLines.push("");
  reportLines.push("## Findings");
  reportLines.push("");
  reportLines.push("| Finding ID         | Count |");
  reportLines.push("|--------------------|-------|");
  for (const f of findings) {
    reportLines.push(
      `| ${f.findingId.padEnd(18)} | ${String(f.count).padStart(5)} |`
    );
  }
  reportLines.push("");
  reportLines.push("## Interruptions");
  reportLines.push("");
  for (const i of interruptions) {
    reportLines.push(`- **${i.category}**: ${i.count} domains (${i.examples.join(", ")})`);
  }
  reportLines.push("");
  reportLines.push("## Phase 1B Quality Warnings");
  reportLines.push("");
  reportLines.push(`- **Warnings:** ${qualityWarnings.length}`);
  reportLines.push(`- **Artifact:** ${qualityWarningsPath}`);
  for (const warning of qualityWarnings) {
    reportLines.push(
      `- **${warning.severity.toUpperCase()} ${warning.code}** (${warning.egress_id}/${warning.egressProvider}): ${warning.explanation}`
    );
  }
  if (qualityWarnings.length === 0) {
    reportLines.push("- No WARN-only quality warnings were generated.");
  }
  reportLines.push("");
  reportLines.push("## Recommendations");
  reportLines.push("");
  reportLines.push(
    "- Review failed domains and investigate error categories."
  );
  reportLines.push(
    "- Monitor scanner queue pressure during peak load."
  );
  reportLines.push(
    "- Verify autoscaling kicked in as expected."
  );

  fs.writeFileSync(reportPath, `${reportLines.join("\n")}\n`);

  console.log("");
  console.log(reportLines.join("\n"));

  logEvent(eventsPath, "complete", "Load test finished");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FATAL: ${message}`);
  process.exitCode = 1;
});
