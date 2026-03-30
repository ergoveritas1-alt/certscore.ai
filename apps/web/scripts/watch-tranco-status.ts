import fs from "node:fs";
import path from "node:path";

const DEFAULT_SESSION_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration/session-2h");
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_DURATION_MINUTES = 120;

type SessionHeartbeat = {
  activeBatchCount?: number;
  currentBatch?: number;
  lastError?: string | null;
  lastHeartbeatAt?: string | null;
  queuedButUnsummarized?: number;
  startedAt?: string;
  status?: "finished" | "running" | "sleeping";
};

type AggregateSummary = {
  batches?: Array<{
    batch: number;
    summaryPath: string;
  }>;
  completedRows?: number;
  findingCounts?: Array<{
    count: number;
    domains: string[];
    findingId: string;
  }>;
  pendingRows?: number;
  totalRows?: number;
};

type SessionState = {
  batches?: Array<{
    batch: number;
    queuedAt: string;
    summarizedAt: string | null;
    summaryPath: string | null;
  }>;
  currentBatch?: number;
  lastError?: string | null;
  lastHeartbeatAt?: string | null;
  status?: "finished" | "running" | "sleeping";
  startedAt?: string;
};

type StatusSnapshot = {
  activity: {
    heartbeatAgeSeconds: number | null;
    isFinished: boolean;
    isStale: boolean;
  };
  checkedAt: string;
  heartbeat: SessionHeartbeat | null;
  sessionDir: string;
  state: {
    batchCount: number;
    currentBatch: number | null;
    lastError: string | null;
    lastHeartbeatAt: string | null;
    startedAt: string | null;
    summarizedBatches: number;
  };
  summary: {
    completedRows: number;
    pendingRows: number;
    topFindings: Array<{ count: number; domains: string[]; findingId: string }>;
    totalRows: number;
  };
};

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

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function appendLine(filePath: string, value: unknown) {
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function summarizeTopFindings(aggregate: AggregateSummary | null) {
  return (aggregate?.findingCounts ?? []).slice(0, 10).map((entry) => ({
    count: entry.count,
    domains: entry.domains.slice(0, 5),
    findingId: entry.findingId
  }));
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getHeartbeatAgeSeconds(checkedAt: string, lastHeartbeatAt: string | null) {
  const checkedAtMs = parseTimestamp(checkedAt);
  const lastHeartbeatAtMs = parseTimestamp(lastHeartbeatAt);

  if (checkedAtMs === null || lastHeartbeatAtMs === null) {
    return null;
  }

  return Math.max(0, Math.round((checkedAtMs - lastHeartbeatAtMs) / 1000));
}

function getPriorityReason(topFinding: { count: number; domains: string[]; findingId: string } | undefined) {
  if (!topFinding) {
    return "No repeated finding cluster is available yet, so the run is still collecting baseline calibration signal.";
  }

  if (topFinding.findingId === "contact_support_path_present") {
    return "Contact/support positives are a high-priority cluster because false positives here directly reduce trust in surfaced findings and usually point to generic URL or evidence-quality rules.";
  }

  if (topFinding.findingId === "surface_title_mismatch") {
    return "Title-mismatch findings are high priority because they often reveal integrity problems or bad attribution that can distort multiple surfaced positives at once.";
  }

  if (topFinding.findingId === "targeted_advertising_choices_present") {
    return "Privacy-choice positives are high priority because they are easy to overclaim from generic privacy text, so tightening them improves calibration quickly across many domains.";
  }

  return `${topFinding.findingId} is the highest repeated cluster right now, which makes it the best source of the next transferable calibration improvement.`;
}

function formatAge(seconds: number | null) {
  if (seconds === null) {
    return "unknown time";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function getCurrentWork(snapshot: StatusSnapshot) {
  if (snapshot.activity.isFinished) {
    return `The 30-minute calibration session has finished. The remaining pending rows are unresolved from the final summarized batch, not evidence of an actively running worker.`;
  }

  if (snapshot.activity.isStale) {
    return `The session has not updated its heartbeat for ${formatAge(snapshot.activity.heartbeatAgeSeconds)}, so it is likely stalled or waiting on external scan completion rather than actively summarizing new results.`;
  }

  if (snapshot.summary.pendingRows > 0) {
    return `Reviewing completed scans while batch ${snapshot.state.currentBatch ?? "-"} continues to finish (${snapshot.summary.pendingRows} rows still pending).`;
  }

  return `Batch ${snapshot.state.currentBatch ?? "-"} is fully summarized, so the next step is extracting the highest-value repeated failure shape from the aggregate output.`;
}

function getNextWork(snapshot: StatusSnapshot) {
  if (snapshot.activity.isFinished) {
    return "Next: start a fresh calibration session if you want more scans queued, or inspect the remaining repeated finding clusters from this finished run.";
  }

  if (snapshot.activity.isStale) {
    return "Next: refresh or restart the calibration session so the pending batch can resume and new completed scans can flow into the summaries.";
  }

  const topFinding = snapshot.summary.topFindings[0];
  if (!topFinding) {
    return "Next: wait for more completed scans and then rank repeated finding clusters.";
  }

  return `Next: inspect the ${topFinding.findingId} cluster across ${topFinding.count} domains and decide whether it justifies a generic fix in the canonical concern or surfacing pipeline.`;
}

function formatStatusMessage(current: StatusSnapshot, previous: StatusSnapshot | null) {
  const completedDelta = current.summary.completedRows - (previous?.summary.completedRows ?? 0);
  const pendingDelta = current.summary.pendingRows - (previous?.summary.pendingRows ?? 0);
  const summarizedBatchDelta = current.state.summarizedBatches - (previous?.state.summarizedBatches ?? 0);
  const topFinding = current.summary.topFindings[0];

  const completedText =
    completedDelta > 0
      ? `Completed ${completedDelta} additional scan${completedDelta === 1 ? "" : "s"} since the last update.`
      : "No new completed scans since the last update.";
  const batchText =
    summarizedBatchDelta > 0
      ? `Fully summarized ${summarizedBatchDelta} more batch${summarizedBatchDelta === 1 ? "" : "es"}.`
      : "No additional batches fully summarized in this interval.";
  const pendingText =
    pendingDelta !== 0
      ? `Pending rows changed by ${pendingDelta > 0 ? "+" : ""}${pendingDelta}, now at ${current.summary.pendingRows}.`
      : `Pending rows remain at ${current.summary.pendingRows}.`;
  const activityText = current.activity.isFinished
    ? "Session has finished."
    : current.activity.isStale
      ? `No session heartbeat update has landed for ${formatAge(current.activity.heartbeatAgeSeconds)}.`
      : "Session heartbeat is current.";

  return [
    `[${current.checkedAt}]`,
    `Completed since last status: ${completedText} ${batchText} ${pendingText} ${activityText}`,
    `Working on now: ${getCurrentWork(current)}`,
    `Why this is high priority: ${getPriorityReason(topFinding)}`,
    `Working on next: ${getNextWork(current)}`
  ].join("\n");
}

async function main() {
  const sessionDir = path.resolve(getArgValue("--session-dir") ?? DEFAULT_SESSION_DIR);
  const intervalSeconds = Number(getArgValue("--interval-seconds") ?? DEFAULT_INTERVAL_SECONDS);
  const durationMinutes = Number(getArgValue("--duration-minutes") ?? DEFAULT_DURATION_MINUTES);
  const outputDir = path.join(sessionDir, "minute-status");
  const latestPath = path.join(outputDir, "latest.json");
  const historyPath = path.join(outputDir, "history.jsonl");
  let previousSnapshot: StatusSnapshot | null = null;

  fs.mkdirSync(outputDir, { recursive: true });

  const deadline = Date.now() + durationMinutes * 60 * 1000;

  while (Date.now() < deadline) {
    const heartbeat = readJson<SessionHeartbeat | null>(path.join(sessionDir, "heartbeat.json"), null);
    const aggregate = readJson<AggregateSummary | null>(path.join(sessionDir, "aggregate-summary.json"), null);
    const state = readJson<SessionState | null>(path.join(sessionDir, "session-state.json"), null);
    const checkedAt = new Date().toISOString();
    const aggregateBatchCount = aggregate?.batches?.length ?? 0;
    const stateBatchCount = state?.batches?.length ?? 0;
    const stateSummarizedBatches = (state?.batches ?? []).filter((batch) => batch.summarizedAt !== null).length;
    const aggregateSummarizedBatches = aggregateBatchCount > 0 ? aggregateBatchCount : 0;
    const inferredCurrentBatch = Math.max(state?.currentBatch ?? 0, heartbeat?.currentBatch ?? 0, aggregateBatchCount);
    const lastHeartbeatAt = heartbeat?.lastHeartbeatAt ?? state?.lastHeartbeatAt ?? null;
    const heartbeatAgeSeconds = getHeartbeatAgeSeconds(checkedAt, lastHeartbeatAt);
    const runnerStatus = heartbeat?.status ?? state?.status ?? null;
    const isFinished = runnerStatus === "finished";
    const isStale = !isFinished && heartbeatAgeSeconds !== null && heartbeatAgeSeconds > intervalSeconds * 2;

    const snapshot: StatusSnapshot = {
      activity: {
        heartbeatAgeSeconds,
        isFinished,
        isStale
      },
      checkedAt,
      heartbeat,
      sessionDir,
      state: {
        batchCount: Math.max(stateBatchCount, aggregateBatchCount),
        currentBatch: inferredCurrentBatch > 0 ? inferredCurrentBatch : null,
        lastError: state?.lastError ?? null,
        lastHeartbeatAt,
        startedAt: state?.startedAt ?? null,
        summarizedBatches: Math.max(stateSummarizedBatches, aggregateSummarizedBatches)
      },
      summary: {
        completedRows: aggregate?.completedRows ?? 0,
        pendingRows: aggregate?.pendingRows ?? 0,
        topFindings: summarizeTopFindings(aggregate),
        totalRows: aggregate?.totalRows ?? 0
      }
    };

    writeJson(latestPath, snapshot);
    appendLine(historyPath, snapshot);
    console.log(formatStatusMessage(snapshot, previousSnapshot));
    console.log("");
    previousSnapshot = snapshot;
    await sleep(intervalSeconds * 1000);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
