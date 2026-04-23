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

type FinancialFreshTarget = {
  expectedFindings: Array<{
    ruleKey: string;
    severity: string;
  }>;
  hostname: string;
  label: string;
};

type FinancialFreshResult = {
  findings: Array<{
    ruleKey: string;
    severity: string;
    title: string;
  }>;
  hostname: string;
  label: string;
  missingFindings: Array<{
    ruleKey: string;
    severity: string;
  }>;
  retainedHomepageBody: boolean;
  runId: string;
  runStatus: string;
  scanId: string;
  scanOutcome: string | null;
  scanStatus: string;
};

const FINANCIAL_TARGETS: FinancialFreshTarget[] = [
  {
    hostname: "backtestr.xyz",
    label: "backtestr",
    expectedFindings: [
      { ruleKey: "financial_review.simulated_performance_without_disclosure", severity: "high" },
      { ruleKey: "financial_review.pricing_or_fee_transparency_unclear", severity: "medium" }
    ]
  },
  {
    hostname: "fxculturetrading.com",
    label: "fxculturetrading",
    expectedFindings: [
      { ruleKey: "financial_review.earnings_claim_without_adjacent_disclosure", severity: "high" },
      { ruleKey: "financial_review.pricing_or_fee_transparency_unclear", severity: "medium" }
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    throw new Error(`Failed to load scan ${scanId}: Not found`);
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
        `[financial-fresh] validation ${runId} status=${run.status} started_at=${run.started_at ?? "null"} completed_at=${run.completed_at ?? "null"}`
      );
      lastStatus = run.status;
    }

    if (run.status === "completed" || run.status === "failed") {
      return run;
    }

    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for validation run ${runId} after ${input.timeoutMs}ms.`);
}

async function waitForScanCompletion(scanId: string, input: { pollMs: number; timeoutMs: number }) {
  const deadline = Date.now() + input.timeoutMs;
  const queuedDeadline = Date.now() + DEFAULT_QUEUED_TIMEOUT_MS;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const scan = await loadScanState(scanId);
    if (scan.status !== lastStatus) {
      console.error(
        `[financial-fresh] scan ${scanId} status=${scan.status} started_at=${scan.startedAt ?? "null"} completed_at=${scan.completedAt ?? "null"}`
      );
      lastStatus = scan.status;
    }

    if (scan.status === "completed" || scan.status === "failed") {
      return scan;
    }

    if (scan.status === "queued" && !scan.startedAt && Date.now() >= queuedDeadline) {
      throw new Error(`Fresh financial scan ${scanId} is still queued after ${DEFAULT_QUEUED_TIMEOUT_MS}ms.`);
    }

    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for scan ${scanId} after ${input.timeoutMs}ms.`);
}

async function loadSnapshot(scanId: string) {
  return await queryOne<{
    normalized_body_hash: string | null;
    scan_outcome: string | null;
  }>(
    `
      select normalized_body_hash, scan_outcome
      from scan_snapshots
      where scan_id = $1
    `,
    [scanId],
    { readOnly: true }
  );
}

function matchesExpectedFinding(
  actual: Array<{ ruleKey: string; severity: string }>,
  expected: { ruleKey: string; severity: string }
) {
  return actual.some((finding) => finding.ruleKey === expected.ruleKey && finding.severity === expected.severity);
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

async function runFreshFinancialTarget(
  target: FinancialFreshTarget,
  options: { pollMs: number; timeoutMs: number }
): Promise<FinancialFreshResult> {
  const run = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: `https://${target.hostname}`,
    triggerMode: "manual"
  });

  const scanId = await createScanForValidationRun(run.id);
  const completedScan = await waitForScanCompletion(scanId, options);
  if (completedScan.status === "failed") {
    throw new Error(`Fresh financial scan ${scanId} for ${target.hostname} failed: ${completedScan.errorMessage ?? "Unknown error"}`);
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
  const normalizedFindings = findings.map((finding) => ({
    ruleKey: String(finding.rule_key ?? ""),
    severity: String(finding.severity ?? ""),
    title: String(finding.title ?? "")
  }));
  const missingFindings = target.expectedFindings.filter(
    (expected) => !matchesExpectedFinding(normalizedFindings, expected)
  );
  const snapshot = await loadSnapshot(scanId);
  const scanEvents = await loadScanEvents(scanId);
  const degradedEventSeen = scanEvents.some((event) => event.event_type === SCAN_EVENT_TYPES.contentCaptureDegraded);

  return {
    findings: normalizedFindings,
    hostname: target.hostname,
    label: target.label,
    missingFindings,
    retainedHomepageBody: typeof snapshot?.normalized_body_hash === "string" && snapshot.normalized_body_hash.length > 0,
    runId: run.id,
    runStatus: String(refreshedRun.status ?? ""),
    scanId,
    scanOutcome: degradedEventSeen ? "content_capture_degraded" : (snapshot?.scan_outcome ?? null),
    scanStatus: completedScan.status
  };
}

async function main() {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    throw new Error(`Validation pipeline is ${state}; expected running.`);
  }

  const labels = new Set(getArgValues("--label"));
  const pollMs = Number(getArgValue("--poll-ms") ?? DEFAULT_POLL_MS);
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const targets = FINANCIAL_TARGETS.filter((target) => labels.size === 0 || labels.has(target.label));

  if (targets.length === 0) {
    throw new Error("No financial fresh targets selected.");
  }

  const results: FinancialFreshResult[] = [];
  for (const target of targets) {
    results.push(await runFreshFinancialTarget(target, { pollMs, timeoutMs }));
  }

  for (const result of results) {
    console.log(`\n[financial-fresh] ${result.label} (${result.hostname})`);
    console.log(`scan ${result.scanId}`);
    console.log(`scan_status ${result.scanStatus}`);
    console.log(`scan_outcome ${result.scanOutcome ?? "null"}`);
    console.log(`retained_homepage_body ${result.retainedHomepageBody ? "yes" : "no"}`);
    console.log(`run ${result.runId}`);
    console.log(`status ${result.runStatus}`);
    console.log(
      `findings ${result.findings.map((finding) => `${finding.ruleKey}:${finding.severity}`).sort((left, right) => left.localeCompare(right)).join(", ")}`
    );
    console.log(
      `missing ${result.missingFindings.length > 0 ? result.missingFindings.map((finding) => `${finding.ruleKey}:${finding.severity}`).join(", ") : "none"}`
    );
  }

  const failures = results.filter((result) => result.missingFindings.length > 0 || !result.retainedHomepageBody);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
