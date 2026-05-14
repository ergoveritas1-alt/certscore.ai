import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type BenchmarkRow = {
  domain?: string;
  iteration?: number;
  queueToCompletedMs?: number | null;
  queueToFindingsMs?: number | null;
  reportFindingCount?: number | null;
  scanId: string;
  status?: string | null;
  totalSignals?: number | null;
};

type AuditScanInput = {
  batch?: string;
  domain?: string;
  iteration?: number;
  scanId: string;
};

type TimingDiagnostic = {
  buildPhaseCount?: number | null;
  commitWaitMs?: number | null;
  domContentLoadedWaitMs?: number | null;
  durationMs?: number | null;
  homepageSetupWaitMs?: number | null;
  longestPhase?: string | null;
  longestPhaseDurationMs?: number | null;
  phaseDurationsMs?: Record<string, number>;
  phase?: string | null;
  phasesByDuration?: Array<{
    durationMs?: number | null;
    outcome?: string | null;
    phase?: string | null;
  }>;
  preflightAttemptFetchTimings?: Array<{
    durationMs?: number | null;
    fetchStatus?: string | null;
    source?: string | null;
    target?: string | null;
    verified?: boolean | null;
  }>;
  robotsFetchDurationMs?: number | null;
  robotsStateWaitMs?: number | null;
  totalTrackedDurationMs?: number | null;
};

type ScannerTimingRow = {
  runtimeBuildPhaseDiagnostics?: TimingDiagnostic[];
  scannerWallMs?: number | null;
  scanId: string;
};

type ContinuityRow = {
  scanId: string;
  signals?: {
    bySource?: Record<string, number>;
    total?: number;
  };
  snapshot?: {
    accessPostureClass?: string | null;
    reportFindingCount?: number | null;
    scanOutcome?: string | null;
    totalSignals?: number | null;
  };
  validationFindings?: {
    total?: number;
  };
};

const DEFAULT_DOMAINS = "kbdlab.io";
const DEFAULT_REPEAT = "5";
const DEFAULT_SOURCE = "ops-scan-timing-sample";
const DEFAULT_POLL_MS = "5000";
const DEFAULT_TIMEOUT_MS = "600000";
const DEFAULT_FINAL_READINESS_WAIT_MS = "15000";

function getArgValue(flag: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function parsePositiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function average(values: number[]) {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function summarize(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => Number.isFinite(value));
  return {
    avgMs: average(usable),
    count: usable.length,
    maxMs: usable.length > 0 ? Math.max(...usable) : null,
    minMs: usable.length > 0 ? Math.min(...usable) : null,
    p50Ms: percentile(usable, 50),
    p90Ms: percentile(usable, 90)
  };
}

function summarizeCounts(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => Number.isFinite(value));
  return {
    avg: average(usable),
    count: usable.length,
    max: usable.length > 0 ? Math.max(...usable) : null,
    min: usable.length > 0 ? Math.min(...usable) : null,
    p50: percentile(usable, 50),
    p90: percentile(usable, 90)
  };
}

function summarizeDurationRecords(records: Array<Record<string, number> | null | undefined>) {
  const durations = new Map<string, number[]>();

  for (const record of records) {
    if (!record) {
      continue;
    }
    for (const [key, value] of Object.entries(record)) {
      if (!Number.isFinite(value)) {
        continue;
      }
      const existing = durations.get(key) ?? [];
      existing.push(value);
      durations.set(key, existing);
    }
  }

  return Object.fromEntries(
    [...durations.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, summarize(values)])
  );
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  const directStart = trimmed.indexOf("{");
  if (directStart < 0) {
    throw new Error("Command output did not include a JSON object.");
  }
  return JSON.parse(trimmed.slice(directStart)) as T;
}

function parseAuditJson<T>(stdout: string): T {
  const match = stdout.match(/__PROD_DB_AUDIT_JSON_START__\n([\s\S]*?)\n__PROD_DB_AUDIT_JSON_END__/);
  if (!match?.[1]) {
    throw new Error("Prod DB audit output did not include a sanitized JSON payload marker.");
  }
  return JSON.parse(match[1]) as T;
}

async function runPnpm(args: string[]) {
  const { stdout } = await execFileAsync("pnpm", args, {
    env: process.env,
    maxBuffer: 100 * 1024 * 1024
  });
  return stdout;
}

function getLatestPhase(row: ScannerTimingRow, phase: string) {
  return [...(row.runtimeBuildPhaseDiagnostics ?? [])].reverse().find((diagnostic) => diagnostic.phase === phase) ?? null;
}

function sumVerifiedPreflightMs(row: ScannerTimingRow) {
  const phase = getLatestPhase(row, "urlscan_preflight_legal_fetch");
  return (phase?.preflightAttemptFetchTimings ?? [])
    .filter((timing) => timing.verified === true)
    .reduce((sum, timing) => sum + (Number.isFinite(timing.durationMs) ? timing.durationMs ?? 0 : 0), 0);
}

function maxVerifiedPreflightMs(row: ScannerTimingRow) {
  const phase = getLatestPhase(row, "urlscan_preflight_legal_fetch");
  const values = (phase?.preflightAttemptFetchTimings ?? [])
    .filter((timing) => timing.verified === true)
    .map((timing) => timing.durationMs)
    .filter((value): value is number => Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

function buildRecommendation(input: {
  browserRuntime: ReturnType<typeof summarize>;
  queueToCompleted: ReturnType<typeof summarize>;
  robotsFetch: ReturnType<typeof summarize>;
  sampleCount: number;
}) {
  const browserP50 = input.browserRuntime.p50Ms ?? 0;
  const robotsP50 = input.robotsFetch.p50Ms ?? 0;
  const queueP50 = input.queueToCompleted.p50Ms ?? 0;
  const possibleSavingsMs = Math.round(Math.min(queueP50 * 0.25, browserP50 * 0.35 + robotsP50 * 0.25));

  return {
    estimatedSafeSavingsMs: possibleSavingsMs > 0 ? possibleSavingsMs : null,
    posture:
      input.sampleCount < 5
        ? "sample_too_small"
        : possibleSavingsMs >= 5000
          ? "worth_focused_scanner_optimization"
          : possibleSavingsMs >= 2500
            ? "consider_only_if_scan_latency_is_top_priority"
            : "likely_diminishing_returns",
    rationale:
      "Estimate is constrained to current-live scanner runtime work only. It excludes shortcuts that would alter evidence, findings, projection, or report semantics."
  };
}

async function main() {
  const domains = getArgValue("--domains") ?? getArgValue("--domain") ?? DEFAULT_DOMAINS;
  const repeat = getArgValue("--repeat") ?? DEFAULT_REPEAT;
  const source = getArgValue("--source") ?? DEFAULT_SOURCE;
  const pollMs = getArgValue("--poll-ms") ?? DEFAULT_POLL_MS;
  const timeoutMs = getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS;
  const finalReadinessWaitMs = getArgValue("--final-readiness-wait-ms") ?? DEFAULT_FINAL_READINESS_WAIT_MS;

  const benchmark = parseJsonOutput<{
    auditInput?: { scans?: AuditScanInput[] };
    rows?: BenchmarkRow[];
  }>(
    await runPnpm([
      "ops:scan-acceleration:benchmark",
      `--domains=${domains}`,
      `--repeat=${repeat}`,
      `--source=${source}`,
      `--poll-ms=${pollMs}`,
      `--timeout-ms=${timeoutMs}`,
      `--final-readiness-wait-ms=${finalReadinessWaitMs}`
    ])
  );

  const scans = benchmark.auditInput?.scans ?? [];
  if (scans.length === 0) {
    throw new Error("Benchmark did not return any scan IDs to audit.");
  }

  const auditInput = JSON.stringify({
    notes: `bounded timing sample queued through ${source}`,
    scans
  });

  const [scannerAudit, continuityAudit] = await Promise.all([
    runPnpm(["ops:prod-db:audit", "--audit", "scanner-phase-timing", "--input-json", auditInput]).then((stdout) =>
      parseAuditJson<{ rows?: ScannerTimingRow[] }>(stdout)
    ),
    runPnpm(["ops:prod-db:audit", "--audit", "signal-finding-continuity", "--input-json", auditInput]).then((stdout) =>
      parseAuditJson<{ rows?: ContinuityRow[] }>(stdout)
    )
  ]);

  const timingRows = scannerAudit.rows ?? [];
  const continuityRows = continuityAudit.rows ?? [];
  const benchmarkRows = benchmark.rows ?? [];
  const timingByScan = new Map(timingRows.map((row) => [row.scanId, row]));

  const browserRuntime = timingRows.map((row) => getLatestPhase(row, "browser_runtime_capture")?.durationMs);
  const robotsSetup = timingRows.map((row) => getLatestPhase(row, "robots_homepage_setup")?.durationMs);
  const robotsFetch = timingRows.map((row) => getLatestPhase(row, "robots_homepage_setup")?.robotsFetchDurationMs);
  const robotsRemainingWait = timingRows.map((row) => getLatestPhase(row, "robots_homepage_setup")?.robotsStateWaitMs);
  const homepageSetup = timingRows.map((row) => getLatestPhase(row, "robots_homepage_setup")?.homepageSetupWaitMs);
  const preflightLegal = timingRows.map((row) => getLatestPhase(row, "urlscan_preflight_legal_fetch")?.durationMs);
  const crawlDiscoveryInternalBreakdowns = timingRows.map((row) => getLatestPhase(row, "crawl_discovery_internal_breakdown"));

  const queueToCompleted = summarize(benchmarkRows.map((row) => row.queueToCompletedMs));
  const reportFindingCounts = benchmarkRows.map((row) => row.reportFindingCount).filter((value): value is number => Number.isFinite(value));
  const persistedSignalCounts = continuityRows.map((row) => row.signals?.total).filter((value): value is number => Number.isFinite(value));

  const rows = benchmarkRows.map((row) => {
    const timing = timingByScan.get(row.scanId);
    const robotPhase = timing ? getLatestPhase(timing, "robots_homepage_setup") : null;
    const browserPhase = timing ? getLatestPhase(timing, "browser_runtime_capture") : null;
    const crawlBreakdown = timing ? getLatestPhase(timing, "crawl_discovery_internal_breakdown") : null;
    const legalPhase = timing ? getLatestPhase(timing, "urlscan_preflight_legal_fetch") : null;
    return {
      browserRuntimeMs: browserPhase?.durationMs ?? null,
      crawlDiscoveryInternalBreakdownMs: crawlBreakdown?.phaseDurationsMs ?? null,
      crawlDiscoveryInternalLongestPhase: crawlBreakdown?.longestPhase ?? null,
      crawlDiscoveryInternalLongestPhaseMs: crawlBreakdown?.longestPhaseDurationMs ?? null,
      crawlDiscoveryInternalTotalTrackedMs: crawlBreakdown?.totalTrackedDurationMs ?? null,
      domain: row.domain ?? null,
      iteration: row.iteration ?? null,
      legalPreflightMs: legalPhase?.durationMs ?? null,
      queueToCompletedMs: row.queueToCompletedMs ?? null,
      queueToFindingsMs: row.queueToFindingsMs ?? null,
      reportFindingCount: row.reportFindingCount ?? null,
      robotsFetchDurationMs: robotPhase?.robotsFetchDurationMs ?? null,
      robotsRemainingWaitMs: robotPhase?.robotsStateWaitMs ?? null,
      scanId: row.scanId,
      scannerWallMs: timing?.scannerWallMs ?? null,
      status: row.status ?? null,
      totalSignals: row.totalSignals ?? null
    };
  });

  const browserSummary = summarize(browserRuntime);
  const robotsFetchSummary = summarize(robotsFetch);
  const queueSummary = queueToCompleted;

  console.log(
    JSON.stringify(
      {
        auditInput: { scans },
        generatedAt: new Date().toISOString(),
        readScope: {
          scanCount: scans.length,
          source,
          tables: ["scans", "scan_events", "scan_signals", "scan_snapshots", "validation_runs", "validation_run_findings"]
        },
        recommendation: buildRecommendation({
          browserRuntime: browserSummary,
          queueToCompleted: queueSummary,
          robotsFetch: robotsFetchSummary,
          sampleCount: scans.length
        }),
        rows,
        summary: {
          browserRuntimeCapture: browserSummary,
          homepageSetup: summarize(homepageSetup),
          legalPreflight: summarize(preflightLegal),
          crawlDiscoveryInternalBreakdown: summarizeDurationRecords(
            crawlDiscoveryInternalBreakdowns.map((breakdown) => breakdown?.phaseDurationsMs)
          ),
          crawlDiscoveryInternalLongestPhase: summarize(
            crawlDiscoveryInternalBreakdowns.map((breakdown) => breakdown?.longestPhaseDurationMs)
          ),
          crawlDiscoveryInternalTotalTracked: summarize(
            crawlDiscoveryInternalBreakdowns.map((breakdown) => breakdown?.totalTrackedDurationMs)
          ),
          persistedSignalCount: summarizeCounts(persistedSignalCounts),
          queueToCompleted: queueSummary,
          queueToFindings: summarize(benchmarkRows.map((row) => row.queueToFindingsMs)),
          reportFindingCount: summarizeCounts(reportFindingCounts),
          robotsFetch: robotsFetchSummary,
          robotsRemainingWait: summarize(robotsRemainingWait),
          robotsSetup: summarize(robotsSetup),
          scannerWall: summarize(timingRows.map((row) => row.scannerWallMs)),
          verifiedLegalFetchMax: summarize(timingRows.map(maxVerifiedPreflightMs)),
          verifiedLegalFetchTotal: summarize(timingRows.map(sumVerifiedPreflightMs))
        }
      },
      null,
      2
    )
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
