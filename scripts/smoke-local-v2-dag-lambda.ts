import { query } from "../packages/db/src/postgres";
import { pollLocalV2DagLambdaResultQueue } from "../apps/web/server/scans/local-v2-dag-lambda-result-poller";

type ScanResponse = {
  scanId?: string;
  scanUrl?: string;
  warning?: string | null;
};

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parsePositiveIntegerArg(name: string, fallback: number) {
  const value = Number(getArgValue(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitScan(input: { baseUrl: string; domain: string; profile: string; scanFrom: string; lateConsentGateMs?: number }) {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/api/full-scan`, {
    body: JSON.stringify({
      domain: input.domain,
      forceNewScan: true,
      localV2RunViaLambda: true,
      localV2ScanProfile: input.profile,
      scanFrom: input.scanFrom,
      ...(input.lateConsentGateMs === undefined
        ? {}
        : { localV2DagLambdaDebugOverrides: { lateConsentGateMs: input.lateConsentGateMs } })
    }),
    headers: {
      "content-type": "application/json",
      "x-certscore-scan-source": "local-v2-dag-lambda-smoke"
    },
    method: "POST"
  });

  const body = (await response.json()) as ScanResponse;
  if (!response.ok || !body.scanId) {
    throw new Error(`Local v2 DAG Lambda smoke scan submission failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function loadScanEvents(scanId: string) {
  const result = await query(
    `select event_type, message, metadata_json, created_at
       from scan_events
      where scan_id = $1
      order by created_at asc`,
    [scanId],
    { readOnly: true }
  );
  return result.rows as Array<{
    created_at: string;
    event_type: string;
    message: string | null;
    metadata_json: Record<string, unknown> | null;
  }>;
}

async function loadLambdaResultQueueUrl(scanId: string) {
  const result = await query(
    `select scan_config_json
       from scans
      where id = $1
      limit 1`,
    [scanId],
    { readOnly: true }
  );
  const config = asRecord(result.rows[0]?.scan_config_json);
  const execution = asRecord(config.execution);
  const v2DagLambda = asRecord(execution.v2DagLambda);
  return typeof v2DagLambda.resultQueueUrl === "string" && v2DagLambda.resultQueueUrl.trim()
    ? v2DagLambda.resultQueueUrl.trim()
    : null;
}

function lambdaEvents(events: Awaited<ReturnType<typeof loadScanEvents>>) {
  return events.filter((event) => event.event_type.startsWith("v2_lambda"));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function findResultEvent(events: Awaited<ReturnType<typeof loadScanEvents>>) {
  return events.find((event) => event.event_type === "v2_lambda_result.received") ?? null;
}

function findFailedResultEvent(events: Awaited<ReturnType<typeof loadScanEvents>>) {
  return events.find((event) => event.event_type === "v2_lambda_result.failed") ?? null;
}

async function main() {
  const baseUrl = getArgValue("--base-url") ?? "http://localhost:3000";
  const domain = getArgValue("--domain") ?? "ergoveritas.com";
  const profile = getArgValue("--profile") ?? "tiny";
  const scanFrom = getArgValue("--scan-from") ?? "eu_de";
  const lateConsentGateMsValue = Number(getArgValue("--late-consent-gate-ms"));
  const lateConsentGateMs = Number.isInteger(lateConsentGateMsValue) && lateConsentGateMsValue > 0
    ? lateConsentGateMsValue
    : undefined;
  const maxAttempts = parsePositiveIntegerArg("--attempts", 18);
  const waitSeconds = parsePositiveIntegerArg("--wait-seconds", 10);
  const scan = await submitScan({ baseUrl, domain, profile, scanFrom, lateConsentGateMs });
  const scanId = scan.scanId as string;

  let latestEvents = await loadScanEvents(scanId);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let resultEvent = findResultEvent(latestEvents);
    if (resultEvent) {
      console.log(JSON.stringify({
        baseUrl,
        domain,
        lambdaDispatchRegion: lambdaEvents(latestEvents).find((event) => event.event_type === "v2_lambda_dispatch.started")?.metadata_json?.awsRegion ?? null,
        lambdaResultStatus: resultEvent.metadata_json?.resultStatus ?? null,
        scanFrom,
        scanId,
        scanUrl: scan.scanUrl ?? `/scan/${scanId}`,
        status: "passed"
      }, null, 2));
      return;
    }

    const existingFailedEvent = findFailedResultEvent(latestEvents);
    if (existingFailedEvent) {
      throw new Error(`Local v2 DAG Lambda smoke returned failed result for ${scanId}: ${JSON.stringify(existingFailedEvent.metadata_json)}`);
    }

    const queueUrl = await loadLambdaResultQueueUrl(scanId);
    await pollLocalV2DagLambdaResultQueue({
      expectedTargetEnvironment: "local",
      maxMessages: 10,
      queueUrl: queueUrl ?? undefined,
      waitTimeSeconds: queueUrl ? Math.min(waitSeconds, 2) : Math.min(waitSeconds, 20)
    });
    latestEvents = await loadScanEvents(scanId);
    const localWorkerStarted = latestEvents.find((event) => event.event_type === "full_scan.started");
    if (localWorkerStarted) {
      throw new Error(`Local v2 DAG Lambda smoke expected Lambda-only execution, but local worker started scan ${scanId}: ${JSON.stringify(localWorkerStarted.metadata_json)}`);
    }

    resultEvent = findResultEvent(latestEvents);
    if (resultEvent) {
      console.log(JSON.stringify({
        baseUrl,
        domain,
        lambdaDispatchRegion: lambdaEvents(latestEvents).find((event) => event.event_type === "v2_lambda_dispatch.started")?.metadata_json?.awsRegion ?? null,
        lambdaResultStatus: resultEvent.metadata_json?.resultStatus ?? null,
        scanFrom,
        scanId,
        scanUrl: scan.scanUrl ?? `/scan/${scanId}`,
        status: "passed"
      }, null, 2));
      return;
    }

    const failedEvent = findFailedResultEvent(latestEvents);
    if (failedEvent) {
      throw new Error(`Local v2 DAG Lambda smoke returned failed result for ${scanId}: ${JSON.stringify(failedEvent.metadata_json)}`);
    }

    if (attempt < maxAttempts) {
      await sleep(1_000);
    }
  }

  throw new Error(`Timed out waiting for v2_lambda_result.received for ${scanId}; events=${JSON.stringify(lambdaEvents(latestEvents))}`);
}

void main().then(
  () => {
    // The terminal Lambda result and its retained artifact pointers have been
    // persisted before main resolves. Report finalization is worker-owned, so
    // lingering AWS SDK sockets must not keep this local smoke command alive.
    process.exit(0);
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
