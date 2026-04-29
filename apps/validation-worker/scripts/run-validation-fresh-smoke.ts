import { query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  createScanForValidationRun,
  createValidationRun,
  getValidationPipelineState,
  getValidationRun,
  loadValidationRunFindings,
  updateValidationRun
} from "../src/validation/repository";
import { processValidationRankJob, processValidationVerdictJob } from "../src/validation/pipeline";

type RepresentativeTarget = {
  expectedFindings?: Array<{
    ruleKey: string;
    severity: string;
  }>;
  hostname: string;
  label: string;
  maxRankMs?: number;
  maxValidationMsHard?: number;
  maxVerdictMs?: number;
};

type FreshSmokeResult = {
  expectedFindings: Array<{
    ruleKey: string;
    severity: string;
  }> | null;
  findings: Array<{
    ruleKey: string;
    severity: string;
    title: string;
  }>;
  hostname: string;
  label: string;
  runId: string;
  runStatus: string;
  scanId: string;
  scanStatus: string;
  shapeMatchesExpectation: boolean | null;
  timingWithinBudget: boolean | null;
  timings: {
    queueToFinalMs: number | null;
    rankMs: number | null;
    scanProcessingMs: number | null;
    validationMs: number | null;
    verdictMs: number | null;
  };
};

const REPRESENTATIVE_TARGETS: RepresentativeTarget[] = [
  {
    hostname: "lookout.com",
    label: "lookout",
    maxRankMs: 15_000,
    maxValidationMsHard: 30_000,
    maxVerdictMs: 20_000,
    expectedFindings: [
      { ruleKey: "cookie_runtime.disclosure_gap", severity: "high" },
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" }
    ]
  },
  {
    hostname: "adidas.com",
    label: "adidas",
    maxRankMs: 10_000,
    maxValidationMsHard: 15_000,
    maxVerdictMs: 10_000,
    expectedFindings: [{ ruleKey: "access_review.public_access_blocked", severity: "high" }]
  },
  {
    hostname: "fujifilm.com",
    label: "fujifilm",
    maxRankMs: 10_000,
    maxValidationMsHard: 20_000,
    maxVerdictMs: 10_000,
    expectedFindings: [
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" },
      { ruleKey: "access_review.legal_coverage_unverified", severity: "medium" }
    ]
  },
  {
    hostname: "hobbylobby.com",
    label: "hobbylobby",
    maxRankMs: 12_000,
    maxValidationMsHard: 25_000,
    maxVerdictMs: 15_000,
    expectedFindings: [
      { ruleKey: "access_review.public_access_blocked", severity: "high" },
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" }
    ]
  },
  {
    hostname: "dnb.com",
    label: "dnb",
    maxRankMs: 15_000,
    maxValidationMsHard: 30_000,
    maxVerdictMs: 15_000,
    expectedFindings: [
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "access_review.legal_coverage_unverified", severity: "medium" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "medium" }
    ]
  },
  {
    hostname: "alz.org",
    label: "alz",
    maxRankMs: 15_000,
    maxValidationMsHard: 25_000,
    maxVerdictMs: 15_000,
    expectedFindings: [
      { ruleKey: "runtime_privacy.consent_interface_obstructive", severity: "high" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" }
    ]
  },
  {
    hostname: "kurier.at",
    label: "kurier",
    maxRankMs: 15_000,
    maxValidationMsHard: 30_000,
    maxVerdictMs: 15_000,
    expectedFindings: [
      { ruleKey: "access_review.public_access_blocked", severity: "high" },
      { ruleKey: "runtime_privacy.preconsent_tracking_observed", severity: "high" },
      { ruleKey: "access_review.legal_coverage_unverified", severity: "medium" }
    ]
  }
];

const DEFAULT_POLL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_QUEUED_TIMEOUT_MS = 2 * 60_000;
const WORKER_HEARTBEAT_WINDOW_MS = 90_000;

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function getArgValues(flag: string) {
  const values: string[] = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag) {
      const value = process.argv[index + 1];
      if (value) {
        values.push(value);
      }
    }
  }

  return values;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFindingShape(findings: Array<{ ruleKey: string; severity: string }>) {
  return [...findings]
    .map((finding) => `${finding.ruleKey}:${finding.severity}`)
    .sort((left, right) => left.localeCompare(right));
}

function findingShapeMatches(
  actual: Array<{ ruleKey: string; severity: string }>,
  expected: Array<{ ruleKey: string; severity: string }> | null | undefined
) {
  if (!expected) {
    return null;
  }

  const normalizedActual = normalizeFindingShape(actual);
  const normalizedExpected = normalizeFindingShape(expected);

  if (normalizedActual.length !== normalizedExpected.length) {
    return false;
  }

  return normalizedActual.every((value, index) => value === normalizedExpected[index]);
}

function timingWithinBudget(validationMs: number | null, maxValidationMs: number | null | undefined) {
  if (maxValidationMs == null) {
    return null;
  }

  if (validationMs == null) {
    return false;
  }

  return validationMs <= maxValidationMs;
}

function latestEventMs(
  events: Array<{ created_at: string; event_type: string }>,
  eventTypes: string[]
) {
  let latest: number | null = null;

  for (const event of events) {
    if (!eventTypes.includes(event.event_type)) {
      continue;
    }

    const timestamp = parseIsoMs(event.created_at);
    if (timestamp === null) {
      continue;
    }

    if (latest === null || timestamp > latest) {
      latest = timestamp;
    }
  }

  return latest;
}

async function loadScanEvents(scanId: string) {
  return await query<{ created_at: string; event_type: string }>(
    `
      select event_type, created_at
      from scan_events
      where scan_id = $1
      order by created_at asc
    `,
    [scanId],
    { readOnly: true }
  ).then((result) => result.rows);
}

function formatDurationMs(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "—";
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

function parseIsoMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function loadScanState(scanId: string) {
  const data = await queryOne<{
    completed_at: string | null;
    created_at: string;
    error_message: string | null;
    id: string;
    started_at: string | null;
    status: string;
  }>(
    `
      select id, status, created_at, started_at, completed_at, error_message
      from scans
      where id = $1
    `,
    [scanId],
    { readOnly: true }
  );

  if (!data) {
    throw new Error(`Failed to load fresh smoke scan ${scanId}: Not found`);
  }

  return {
    completedAt: data.completed_at as string | null,
    createdAt: data.created_at as string,
    errorMessage: data.error_message as string | null,
    id: data.id as string,
    startedAt: data.started_at as string | null,
    status: data.status as string
  };
}

async function hasHealthyValidationWorker() {
  const settings = await queryOne<{ last_worker_heartbeat_at: string | null }>(
    `
      select last_worker_heartbeat_at
      from validation_settings
      where singleton_key = 'default'
    `,
    [],
    { readOnly: true }
  );

  if (!settings?.last_worker_heartbeat_at) {
    return false;
  }

  const heartbeatAt = Date.parse(settings.last_worker_heartbeat_at);
  return Number.isFinite(heartbeatAt) && Date.now() - heartbeatAt <= WORKER_HEARTBEAT_WINDOW_MS;
}

async function waitForValidationCompletion(runId: string, input: { pollMs: number; timeoutMs: number }) {
  const deadline = Date.now() + input.timeoutMs;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const run = await getValidationRun(runId);
    if (!run) {
      throw new Error(`Validation run ${runId} disappeared while waiting for completion.`);
    }

    if (run.status !== lastStatus) {
      console.error(
        `[fresh-smoke] validation ${runId} status=${run.status} started_at=${run.started_at ?? "null"} completed_at=${run.completed_at ?? "null"}`
      );
      lastStatus = run.status;
    }

    if (run.status === "completed" || run.status === "failed") {
      return run;
    }

    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for validation run ${runId} after ${formatDurationMs(input.timeoutMs)}.`);
}

async function waitForScanCompletion(scanId: string, input: { pollMs: number; timeoutMs: number }) {
  const deadline = Date.now() + input.timeoutMs;
  const queuedDeadline = Date.now() + DEFAULT_QUEUED_TIMEOUT_MS;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const scan = await loadScanState(scanId);
    if (scan.status !== lastStatus) {
      console.error(
        `[fresh-smoke] scan ${scanId} status=${scan.status} started_at=${scan.startedAt ?? "null"} completed_at=${scan.completedAt ?? "null"}`
      );
      lastStatus = scan.status;
    }

    if (scan.status === "completed" || scan.status === "failed") {
      return scan;
    }

    if (scan.status === "queued" && !scan.startedAt && Date.now() >= queuedDeadline) {
      throw new Error(
        `Fresh smoke scan ${scanId} is still queued after ${formatDurationMs(DEFAULT_QUEUED_TIMEOUT_MS)}. WS01 scanner worker may be unavailable.`
      );
    }

    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for scan ${scanId} after ${formatDurationMs(input.timeoutMs)}.`);
}

function summarizeFindings(result: FreshSmokeResult) {
  if (result.findings.length === 0) {
    return "none";
  }

  return result.findings.map((finding) => `${finding.ruleKey} (${finding.severity})`).join(", ");
}

function printMarkdown(results: FreshSmokeResult[]) {
  console.log("| Label | Hostname | Scan Status | Shape | Timing | Rank | Verdict | Validation | Scan | Findings |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const result of results) {
    const shape = result.shapeMatchesExpectation === null ? "n/a" : result.shapeMatchesExpectation ? "match" : "mismatch";
    const budget =
      result.timingWithinBudget === null ? "n/a" : result.timingWithinBudget ? "within" : "exceeded";
    console.log(
      `| ${result.label} | ${result.hostname} | ${result.scanStatus} | ${shape} | ${budget} | ${formatDurationMs(result.timings.rankMs)} | ${formatDurationMs(result.timings.verdictMs)} | ${formatDurationMs(result.timings.validationMs)} | ${formatDurationMs(result.timings.scanProcessingMs)} | ${summarizeFindings(result)} |`
    );
  }
}

async function runFreshSmokeForTarget(
  target: RepresentativeTarget,
  options: { pollMs: number; timeoutMs: number }
) {
  const run = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: `https://${target.hostname}`,
    triggerMode: "manual"
  });

  const scanId = await createScanForValidationRun(run.id);
  const completedScan = await waitForScanCompletion(scanId, options);
  if (completedScan.status === "failed") {
    throw new Error(`Fresh smoke scan ${scanId} for ${target.hostname} failed: ${completedScan.errorMessage ?? "Unknown error"}`);
  }

  const validationStartedAtIso = new Date().toISOString();
  const workerHealthy = await hasHealthyValidationWorker();

  let refreshedRun;
  if (workerHealthy) {
    refreshedRun = await waitForValidationCompletion(run.id, options);
  } else {
    await updateValidationRun(run.id, {
      started_at: validationStartedAtIso,
      status: "ranking"
    });
    await processValidationRankJob(run.id);

    refreshedRun = await getValidationRun(run.id);
    if (!refreshedRun) {
      throw new Error(`Validation run ${run.id} disappeared after ranking.`);
    }

    if (refreshedRun.status === "validating") {
      await processValidationVerdictJob(run.id);
      refreshedRun = await getValidationRun(run.id);
    }

    if (!refreshedRun) {
      throw new Error(`Validation run ${run.id} disappeared after verdicting.`);
    }
  }

  const findings = await loadValidationRunFindings(run.id);
  const scanEvents = await loadScanEvents(scanId);
  const validationStartedAtMs = parseIsoMs(validationStartedAtIso);
  const rankCompletedAtMs = latestEventMs(scanEvents, [SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted]);
  const validationCompletedAtMs = parseIsoMs(refreshedRun.completed_at);
  const rankMs =
    validationStartedAtMs !== null && rankCompletedAtMs !== null ? rankCompletedAtMs - validationStartedAtMs : null;
  const validationMs = (() => {
    return validationStartedAtMs !== null && validationCompletedAtMs !== null
      ? validationCompletedAtMs - validationStartedAtMs
      : null;
  })();
  const verdictMs = (() => {
    if (findings.length === 0 && rankCompletedAtMs !== null && validationCompletedAtMs !== null) {
      return Math.max(0, validationCompletedAtMs - rankCompletedAtMs);
    }

    return rankCompletedAtMs !== null && validationCompletedAtMs !== null
      ? Math.max(0, validationCompletedAtMs - rankCompletedAtMs)
      : null;
  })();
  const rankWithinBudget = timingWithinBudget(rankMs, target.maxRankMs);
  const verdictWithinBudget = timingWithinBudget(verdictMs, target.maxVerdictMs);
  const hardMaxWithinBudget = timingWithinBudget(validationMs, target.maxValidationMsHard);
  const timingWithinPolicy =
    [rankWithinBudget, verdictWithinBudget, hardMaxWithinBudget].every((value) => value !== false) &&
    [rankWithinBudget, verdictWithinBudget, hardMaxWithinBudget].some((value) => value !== null)
      ? true
      : [rankWithinBudget, verdictWithinBudget, hardMaxWithinBudget].some((value) => value === false)
        ? false
        : null;

  const result: FreshSmokeResult = {
    expectedFindings: target.expectedFindings ?? null,
    findings: findings.map((finding) => ({
      ruleKey: String(finding.rule_key ?? ""),
      severity: String(finding.severity ?? ""),
      title: String(finding.title ?? "")
    })),
    hostname: target.hostname,
    label: target.label,
    runId: run.id,
    runStatus: String(refreshedRun.status ?? ""),
    scanId,
    scanStatus: completedScan.status,
    shapeMatchesExpectation: findingShapeMatches(
      findings.map((finding) => ({
        ruleKey: String(finding.rule_key ?? ""),
        severity: String(finding.severity ?? "")
      })),
      target.expectedFindings
    ),
    timingWithinBudget: timingWithinPolicy,
    timings: {
      queueToFinalMs: (() => {
        const start = parseIsoMs(completedScan.createdAt);
        const end = parseIsoMs(refreshedRun.completed_at);
        return start !== null && end !== null ? end - start : null;
      })(),
      rankMs,
      scanProcessingMs: (() => {
        const start = parseIsoMs(completedScan.startedAt);
        const end = parseIsoMs(completedScan.completedAt);
        return start !== null && end !== null ? end - start : null;
      })(),
      validationMs,
      verdictMs
    }
  };

  return result;
}

async function main() {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    throw new Error(`Validation pipeline is ${state}; expected running.`);
  }

  const allowMismatch = hasFlag("--allow-mismatch");
  const allowTimingRegression = hasFlag("--allow-timing-regression");
  const json = hasFlag("--json");
  const labels = new Set(getArgValues("--label"));
  const markdown = hasFlag("--markdown");
  const pollMs = Number(getArgValue("--poll-ms") ?? DEFAULT_POLL_MS);
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const targets = REPRESENTATIVE_TARGETS.filter((target) => labels.size === 0 || labels.has(target.label));

  if (targets.length === 0) {
    throw new Error("No fresh smoke targets selected.");
  }

  const results: FreshSmokeResult[] = [];
  for (const target of targets) {
    results.push(await runFreshSmokeForTarget(target, { pollMs, timeoutMs }));
  }

  const mismatches = results.filter((result) => result.shapeMatchesExpectation === false);
  const timingRegressions = results.filter((result) => result.timingWithinBudget === false);

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (markdown) {
    printMarkdown(results);
  } else {
    printMarkdown(results);
  }

  if ((mismatches.length > 0 && !allowMismatch) || (timingRegressions.length > 0 && !allowTimingRegression)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
