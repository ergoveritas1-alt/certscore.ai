import fs from "node:fs";
import path from "node:path";

const DEFAULT_SESSION_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration/session-30m");
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_DURATION_MINUTES = 30;

type SessionHeartbeat = {
  activeBatchCount?: number;
  currentBatch?: number;
  lastError?: string | null;
  lastHeartbeatAt?: string | null;
  queuedButUnsummarized?: number;
  startedAt?: string;
};

type AggregateSummary = {
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
  startedAt?: string;
};

type StatusSnapshot = {
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

function getCurrentWork(snapshot: StatusSnapshot) {
  if (snapshot.summary.pendingRows > 0) {
    return `Reviewing completed scans while batch ${snapshot.state.currentBatch ?? "-"} continues to finish (${snapshot.summary.pendingRows} rows still pending).`;
  }

  return `Batch ${snapshot.state.currentBatch ?? "-"} is fully summarized, so the next step is extracting the highest-value repeated failure shape from the aggregate output.`;
}

function getNextWork(snapshot: StatusSnapshot) {
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

  return [
    `[${current.checkedAt}]`,
    `Completed since last status: ${completedText} ${batchText} ${pendingText}`,
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

    const snapshot: StatusSnapshot = {
      checkedAt: new Date().toISOString(),
      heartbeat,
      sessionDir,
      state: {
        batchCount: state?.batches?.length ?? 0,
        currentBatch: state?.currentBatch ?? null,
        lastError: state?.lastError ?? null,
        lastHeartbeatAt: state?.lastHeartbeatAt ?? null,
        startedAt: state?.startedAt ?? null,
        summarizedBatches: (state?.batches ?? []).filter((batch) => batch.summarizedAt !== null).length
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
