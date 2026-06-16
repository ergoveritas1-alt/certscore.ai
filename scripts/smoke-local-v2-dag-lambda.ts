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

async function submitScan(input: { baseUrl: string; domain: string; profile: string }) {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/api/full-scan`, {
    body: JSON.stringify({
      domain: input.domain,
      forceNewScan: true,
      localV2RunViaLambda: true,
      localV2ScanProfile: input.profile
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

async function loadLambdaEvents(scanId: string) {
  const result = await query(
    `select event_type, message, metadata_json, created_at
       from scan_events
      where scan_id = $1
        and event_type like 'v2_lambda%'
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

async function main() {
  const baseUrl = getArgValue("--base-url") ?? "http://localhost:3000";
  const domain = getArgValue("--domain") ?? "example.com";
  const profile = getArgValue("--profile") ?? "tiny";
  const maxAttempts = parsePositiveIntegerArg("--attempts", 18);
  const waitSeconds = parsePositiveIntegerArg("--wait-seconds", 10);
  const scan = await submitScan({ baseUrl, domain, profile });
  const scanId = scan.scanId as string;

  let latestEvents = await loadLambdaEvents(scanId);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await pollLocalV2DagLambdaResultQueue({
      expectedTargetEnvironment: "local",
      maxMessages: 10,
      waitTimeSeconds: Math.min(waitSeconds, 20)
    });
    latestEvents = await loadLambdaEvents(scanId);
    const resultEvent = latestEvents.find((event) => event.event_type === "v2_lambda_result.received");
    if (resultEvent) {
      console.log(JSON.stringify({
        baseUrl,
        domain,
        lambdaResultStatus: resultEvent.metadata_json?.resultStatus ?? null,
        scanId,
        scanUrl: scan.scanUrl ?? `/scan/${scanId}`,
        status: "passed"
      }, null, 2));
      return;
    }

    const failedEvent = latestEvents.find((event) => event.event_type === "v2_lambda_result.failed");
    if (failedEvent) {
      throw new Error(`Local v2 DAG Lambda smoke returned failed result for ${scanId}: ${JSON.stringify(failedEvent.metadata_json)}`);
    }

    if (attempt < maxAttempts) {
      await sleep(1_000);
    }
  }

  throw new Error(`Timed out waiting for v2_lambda_result.received for ${scanId}; events=${JSON.stringify(latestEvents)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
