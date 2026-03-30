import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type QueueRow = {
  batch_hint: string;
  domain: string;
  evaluation_status: string;
};

type BatchRunState = {
  batch: number;
  queuedAt: string;
  summarizedAt: string | null;
  summaryPath: string | null;
};

type SessionState = {
  batches: BatchRunState[];
  currentBatch: number;
  lastError: string | null;
  lastHeartbeatAt: string | null;
  pollIntervalMinutes?: number;
  status?: "finished" | "running" | "sleeping";
  startedAt: string;
};

type SummarizeRow = {
  blocked?: boolean | null;
  domain: string;
  homepageStatus?: number | null;
  pendingReason?: string;
  scanId: string | null;
  scanOutcome?: string | null;
  stopReason?: string | null;
  surfaced: Array<{
    decision?: string;
    id?: string;
    status?: string;
    summary?: string;
    url?: string | null;
  }>;
};

const DEFAULT_QUEUE_PATH = path.resolve(process.cwd(), "tmp/tranco-calibration/calibration_queue.csv");
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration/session");
const DEFAULT_BATCH_LIMIT = 20;
const DEFAULT_MAX_PENDING_BATCHES = 3;
const DEFAULT_POLL_INTERVAL_MINUTES = 5;
const DEFAULT_DURATION_HOURS = 2;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function parseCsv(input: string) {
  const lines = input.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(",");

  return dataLines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      return headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = values[index] ?? "";
        return acc;
      }, {});
    });
}

function readQueueRows(queuePath: string) {
  return parseCsv(fs.readFileSync(queuePath, "utf8")) as QueueRow[];
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeHeartbeat(outputDir: string, state: SessionState) {
  writeJsonFile(path.join(outputDir, "heartbeat.json"), {
    activeBatchCount: state.batches.length,
    currentBatch: state.currentBatch,
    lastError: state.lastError,
    lastHeartbeatAt: state.lastHeartbeatAt,
    pollIntervalMinutes: state.pollIntervalMinutes,
    queuedButUnsummarized: getQueuedButUnsummarizedCount(state),
    startedAt: state.startedAt,
    status: state.status ?? "running"
  });
}

function flushState(outputDir: string, statePath: string, state: SessionState) {
  writeJsonFile(statePath, state);
  writeHeartbeat(outputDir, state);
}

function appendLog(filePath: string, message: string) {
  fs.appendFileSync(filePath, `${new Date().toISOString()} ${message}\n`);
}

function runBatchCommand(args: string[], cwd: string) {
  const result = spawnSync(
    "node",
    ["--env-file=.env.local", "--enable-source-maps", "--import", "tsx", "./scripts/run-tranco-calibration-batch.ts", ...args],
    {
      cwd,
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error(stderr || stdout || `Batch command failed with status ${result.status ?? 1}`);
  }

  const stdout = result.stdout.trim();
  return stdout ? (JSON.parse(stdout) as SummarizeRow[] | Array<Record<string, unknown>>) : [];
}

function getQueuedButUnsummarizedCount(state: SessionState) {
  return state.batches.filter((batch) => batch.summarizedAt === null).length;
}

function getNextBatchToQueue(state: SessionState, queueRows: QueueRow[]) {
  const knownBatches = new Set(state.batches.map((batch) => batch.batch));
  const availableBatches = Array.from(new Set(queueRows.map((row) => Number(row.batch_hint)))).sort((a, b) => a - b);

  return availableBatches.find((batch) => !knownBatches.has(batch)) ?? null;
}

function summarizeAggregate(summaryRows: SummarizeRow[]) {
  const findingCounts = new Map<string, number>();
  const domainsByFinding = new Map<string, Set<string>>();
  let completedRows = 0;
  let pendingRows = 0;

  for (const row of summaryRows) {
    if (row.pendingReason) {
      pendingRows += 1;
      continue;
    }

    completedRows += 1;
    for (const finding of row.surfaced ?? []) {
      const findingId = finding.id ?? "unknown";
      findingCounts.set(findingId, (findingCounts.get(findingId) ?? 0) + 1);
      const existing = domainsByFinding.get(findingId) ?? new Set<string>();
      existing.add(row.domain);
      domainsByFinding.set(findingId, existing);
    }
  }

  return {
    completedRows,
    findingCounts: Array.from(findingCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([findingId, count]) => ({
        count,
        domains: Array.from(domainsByFinding.get(findingId) ?? []).sort(),
        findingId
      })),
    pendingRows
  };
}

function writeAggregateReport(outputDir: string, state: SessionState) {
  const summariesDir = path.join(outputDir, "summaries");
  const aggregateRows: Array<{ batch: number; rows: SummarizeRow[] }> = [];

  for (const batch of state.batches) {
    if (!batch.summaryPath || !fs.existsSync(batch.summaryPath)) {
      continue;
    }

    const rows = readJsonFile<SummarizeRow[]>(batch.summaryPath, []);
    aggregateRows.push({ batch: batch.batch, rows });
  }

  const allRows = aggregateRows.flatMap((entry) => entry.rows);
  const aggregate = summarizeAggregate(allRows);

  writeJsonFile(path.join(outputDir, "aggregate-summary.json"), {
    batches: aggregateRows.map((entry) => ({
      batch: entry.batch,
      summaryPath: path.relative(outputDir, path.join(summariesDir, `batch-${entry.batch}.json`))
    })),
    completedRows: aggregate.completedRows,
    findingCounts: aggregate.findingCounts,
    pendingRows: aggregate.pendingRows,
    totalRows: allRows.length
  });
}

async function main() {
  const cwd = process.cwd();
  const queuePath = path.resolve(getArgValue("--queue") ?? DEFAULT_QUEUE_PATH);
  const outputDir = path.resolve(getArgValue("--out-dir") ?? DEFAULT_OUTPUT_DIR);
  const batchLimit = Number(getArgValue("--batch-limit") ?? DEFAULT_BATCH_LIMIT);
  const maxPendingBatches = Number(getArgValue("--max-pending-batches") ?? DEFAULT_MAX_PENDING_BATCHES);
  const pollIntervalMinutes = Number(getArgValue("--poll-minutes") ?? DEFAULT_POLL_INTERVAL_MINUTES);
  const durationHours = Number(getArgValue("--hours") ?? DEFAULT_DURATION_HOURS);
  const statePath = path.join(outputDir, "session-state.json");
  const heartbeatPath = path.join(outputDir, "heartbeat.json");
  const eventLogPath = path.join(outputDir, "events.log");
  const summariesDir = path.join(outputDir, "summaries");
  const queueRows = readQueueRows(queuePath);

  ensureDir(outputDir);
  ensureDir(summariesDir);

  const state = readJsonFile<SessionState>(statePath, {
    batches: [],
    currentBatch: 0,
    lastError: null,
    lastHeartbeatAt: null,
    pollIntervalMinutes,
    status: "running",
    startedAt: new Date().toISOString()
  });

  state.pollIntervalMinutes = pollIntervalMinutes;
  state.status = "running";
  state.lastHeartbeatAt = new Date().toISOString();
  flushState(outputDir, statePath, state);
  appendLog(eventLogPath, "session_started");

  const deadline = Date.now() + durationHours * 60 * 60 * 1000;

  while (Date.now() < deadline) {
    state.status = "running";
    state.lastHeartbeatAt = new Date().toISOString();
    flushState(outputDir, statePath, state);

    try {
      const queuedButUnsummarized = getQueuedButUnsummarizedCount(state);

      if (queuedButUnsummarized < maxPendingBatches) {
        const nextBatch = getNextBatchToQueue(state, queueRows);
        if (nextBatch !== null) {
          runBatchCommand(["--batch", String(nextBatch), "--limit", String(batchLimit), "--queue-only"], cwd);
          state.batches.push({
            batch: nextBatch,
            queuedAt: new Date().toISOString(),
            summarizedAt: null,
            summaryPath: null
          });
          state.currentBatch = Math.max(state.currentBatch, nextBatch);
          appendLog(eventLogPath, `batch_queued batch=${nextBatch}`);
        }
      }

      for (const batch of state.batches) {
        if (batch.summarizedAt !== null) {
          continue;
        }

        const summaryRows = runBatchCommand(
          ["--batch", String(batch.batch), "--limit", String(batchLimit), "--summarize-only"],
          cwd
        ) as SummarizeRow[];
        const summaryPath = path.join(summariesDir, `batch-${batch.batch}.json`);

        writeJsonFile(summaryPath, summaryRows);

        const hasPendingRows = summaryRows.some((row) => row.pendingReason === "no_terminal_scan");
        if (!hasPendingRows) {
          batch.summarizedAt = new Date().toISOString();
          appendLog(eventLogPath, `batch_summarized batch=${batch.batch}`);
        }
        batch.summaryPath = summaryPath;
      }

      state.lastError = null;
      writeAggregateReport(outputDir, state);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      state.lastError = message;
      appendLog(eventLogPath, `error ${message}`);
    }

    state.status = "sleeping";
    state.lastHeartbeatAt = new Date().toISOString();
    flushState(outputDir, statePath, state);
    await sleep(pollIntervalMinutes * 60 * 1000);
  }

  appendLog(eventLogPath, "session_finished");
  state.status = "finished";
  state.lastHeartbeatAt = new Date().toISOString();
  flushState(outputDir, statePath, state);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
