import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { pollLocalV2DagLambdaResultQueue } from "./local-v2-dag-lambda-result-poller";
import { getLocalV2DagResultQueueUrl } from "./local-v2-dag-status-handoff-core";

type LocalV2DagHandoffScanRow = {
  scanConfigJson: Record<string, unknown> | null;
  status: string;
};

function shouldNudgeLambdaHandoff(status: string) {
  return status === "queued" || status === "running" || status === "processing";
}

export async function nudgeLocalV2DagLambdaHandoffForScan(input: {
  organizationId: string | null;
  scanId: string;
}) {
  const scan = await queryOne<LocalV2DagHandoffScanRow>(
    `select status,
            scan_config_json as "scanConfigJson"
       from scans
      where id = $1
        and organization_id is not distinct from $2::uuid
      limit 1`,
    [input.scanId, input.organizationId],
    { readOnly: true }
  );

  if (!scan || !shouldNudgeLambdaHandoff(scan.status)) {
    return { handled: 0, nudged: false, received: 0, skipped: "not_pending" as const };
  }

  const queueUrl = getLocalV2DagResultQueueUrl(scan.scanConfigJson);
  if (!queueUrl) {
    return { handled: 0, nudged: false, received: 0, skipped: "no_lambda_result_queue" as const };
  }

  try {
    const result = await pollLocalV2DagLambdaResultQueue({
      maxMessages: 10,
      queueUrl,
      waitTimeSeconds: 0
    });
    return {
      handled: result.handled,
      nudged: true,
      received: result.received,
      skipped: null
    };
  } catch (error) {
    console.warn("[web] local v2 DAG Lambda status handoff nudge failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.scanId
    });
    return { handled: 0, nudged: false, received: 0, skipped: "poll_failed" as const };
  }
}
