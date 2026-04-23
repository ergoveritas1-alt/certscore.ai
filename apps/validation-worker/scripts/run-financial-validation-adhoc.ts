import { queryOne } from "@website-signal-risk-scanner/db";
import {
  createScanForValidationRun,
  createValidationRun,
  getValidationPipelineState,
  getValidationRun,
  loadValidationRunFindings,
  updateValidationRun
} from "../src/validation/repository";
import { processValidationRankJob, processValidationVerdictJob } from "../src/validation/pipeline";

type AdhocTarget = {
  hostname: string;
  label: string;
};

type AdhocResult = {
  financialFindings: Array<{
    ruleKey: string;
    severity: string;
    title: string;
  }>;
  hostname: string;
  label: string;
  retainedHomepageBody: boolean;
  runId: string;
  runStatus: string;
  scanId: string;
  scanOutcome: string | null;
  scanStatus: string;
};

const DEFAULT_POLL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_QUEUED_TIMEOUT_MS = 10 * 60_000;
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

function deriveLabel(hostname: string) {
  return hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function loadScanState(scanId: string) {
  const data = await queryOne<{
    completed_at: string | null;
    error_message: string | null;
    id: string;
    started_at: string | null;
    status: string;
  }>(
    `
      select id, status, started_at, completed_at, error_message
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
    errorMessage: data.error_message as string | null,
    id: data.id as string,
    startedAt: data.started_at as string | null,
    status: data.status as string
  };
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
        `[financial-adhoc] validation ${runId} status=${run.status} started_at=${run.started_at ?? "null"} completed_at=${run.completed_at ?? "null"}`
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

async function waitForScanCompletion(scanId: string, input: { pollMs: number; queuedTimeoutMs: number; timeoutMs: number }) {
  const deadline = Date.now() + input.timeoutMs;
  const queuedDeadline = Date.now() + input.queuedTimeoutMs;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const scan = await loadScanState(scanId);
    if (scan.status !== lastStatus) {
      console.error(
        `[financial-adhoc] scan ${scanId} status=${scan.status} started_at=${scan.startedAt ?? "null"} completed_at=${scan.completedAt ?? "null"}`
      );
      lastStatus = scan.status;
    }

    if (scan.status === "completed" || scan.status === "failed") {
      return scan;
    }

    if (scan.status === "queued" && !scan.startedAt && Date.now() >= queuedDeadline) {
      throw new Error(`Adhoc financial scan ${scanId} is still queued after ${input.queuedTimeoutMs}ms.`);
    }

    await sleep(input.pollMs);
  }

  throw new Error(`Timed out waiting for scan ${scanId} after ${input.timeoutMs}ms.`);
}

async function runAdhocTarget(
  target: AdhocTarget,
  options: { pollMs: number; queuedTimeoutMs: number; timeoutMs: number }
): Promise<AdhocResult> {
  const run = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: `https://${target.hostname}`,
    triggerMode: "manual"
  });

  const scanId = await createScanForValidationRun(run.id);
  const completedScan = await waitForScanCompletion(scanId, options);
  if (completedScan.status === "failed") {
    throw new Error(
      `Adhoc financial scan ${scanId} for ${target.hostname} failed: ${completedScan.errorMessage ?? "Unknown error"}`
    );
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
  const financialFindings = findings
    .filter((finding) => String(finding.rule_key ?? "").startsWith("financial_review."))
    .map((finding) => ({
      ruleKey: String(finding.rule_key ?? ""),
      severity: String(finding.severity ?? ""),
      title: String(finding.title ?? "")
    }));

  const snapshot = await loadSnapshot(scanId);

  return {
    financialFindings,
    hostname: target.hostname,
    label: target.label,
    retainedHomepageBody: typeof snapshot?.normalized_body_hash === "string" && snapshot.normalized_body_hash.length > 0,
    runId: run.id,
    runStatus: refreshedRun?.status ?? "unknown",
    scanId,
    scanOutcome: snapshot?.scan_outcome ?? null,
    scanStatus: completedScan.status
  };
}

async function main() {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    throw new Error(`Validation pipeline is ${state}; expected running.`);
  }

  const hostnames = getArgValues("--hostname");
  if (hostnames.length === 0) {
    throw new Error("Pass at least one --hostname.");
  }

  const pollMs = Number.parseInt(getArgValue("--poll-ms") ?? "", 10);
  const queuedTimeoutMs = Number.parseInt(getArgValue("--queued-timeout-ms") ?? "", 10);
  const timeoutMs = Number.parseInt(getArgValue("--timeout-ms") ?? "", 10);
  const options = {
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : DEFAULT_POLL_MS,
    queuedTimeoutMs:
      Number.isFinite(queuedTimeoutMs) && queuedTimeoutMs > 0 ? queuedTimeoutMs : DEFAULT_QUEUED_TIMEOUT_MS,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS
  };

  const targets = hostnames.map((hostname) => ({
    hostname,
    label: deriveLabel(hostname)
  }));

  const results: AdhocResult[] = [];
  for (const target of targets) {
    const result = await runAdhocTarget(target, options);
    results.push(result);

    console.log("");
    console.log(`[financial-adhoc] ${result.label} (${result.hostname})`);
    console.log(`scan ${result.scanId}`);
    console.log(`scan_status ${result.scanStatus}`);
    console.log(`scan_outcome ${result.scanOutcome ?? "null"}`);
    console.log(`retained_homepage_body ${result.retainedHomepageBody ? "yes" : "no"}`);
    console.log(`run ${result.runId}`);
    console.log(`status ${result.runStatus}`);
    console.log(
      `financial_findings ${
        result.financialFindings.length > 0
          ? result.financialFindings.map((finding) => `${finding.ruleKey}:${finding.severity}`).join(", ")
          : "none"
      }`
    );
  }

  console.log("");
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(
    "[validation-worker] failed to run adhoc financial validation",
    error instanceof Error ? error.message : String(error)
  );
  process.exitCode = 1;
});
