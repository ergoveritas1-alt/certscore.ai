import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message
} from "@aws-sdk/client-sqs";
import { query, queryOne } from "@website-signal-risk-scanner/db";

const PROCESSOR = "local-certscore-v2-dag-parallel-v1";
const RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
const RESULT_RECEIVED_EVENT_TYPE = "v2_lambda_result.received";
const RESULT_FAILED_EVENT_TYPE = "v2_lambda_result.failed";

type LambdaResultStatus = "completed" | "failed";
type LambdaTargetEnvironment = "local" | "production";

type LambdaResultMessage = {
  artifactMetadata?: Record<string, unknown>;
  artifactPointers?: Record<string, unknown>;
  completedAt: string;
  error?: { code?: string; message: string };
  phaseTimings?: unknown[];
  scanId: string;
  status: LambdaResultStatus;
  targetEnvironment: LambdaTargetEnvironment;
};

export type LocalV2DagLambdaResultPollerOptions = {
  enabled: boolean;
  pollMs: number;
  queueUrl?: string;
  targetEnvironment: LambdaTargetEnvironment;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQueueRegion(queueUrl: string) {
  try {
    const hostname = new URL(queueUrl).hostname;
    const match = /^sqs[.-]([a-z0-9-]+)\.amazonaws\.com(?:\.cn)?$/.exec(hostname);
    return match?.[1] ?? "eu-central-1";
  } catch {
    return "eu-central-1";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseLambdaResultMessage(raw: string, expectedTargetEnvironment: LambdaTargetEnvironment): LambdaResultMessage {
  const record = asRecord(JSON.parse(raw));
  if (record.artifactOnly !== true || record.productionFindingIntegration !== false) {
    throw new Error("Lambda result must remain artifact-only with production finding integration disabled.");
  }
  if (record.contractVersion !== RESULT_CONTRACT_VERSION) {
    throw new Error("Unsupported Lambda result contract version.");
  }
  if (record.processor !== PROCESSOR) {
    throw new Error("Lambda result came from an unexpected processor.");
  }
  const targetEnvironment = record.targetEnvironment === "production" ? "production" : "local";
  if (targetEnvironment !== expectedTargetEnvironment) {
    throw new Error("Lambda result target environment does not match this worker.");
  }
  const status = record.status === "failed" ? "failed" : record.status === "completed" ? "completed" : null;
  if (!status) {
    throw new Error("Lambda result status is invalid.");
  }
  const scanId = stringValue(record.scanId);
  const completedAt = stringValue(record.completedAt);
  if (!scanId || !completedAt) {
    throw new Error("Lambda result is missing scanId or completedAt.");
  }
  const errorRecord = asRecord(record.error);
  const errorMessage = stringValue(errorRecord.message);

  return {
    artifactMetadata: asRecord(record.artifactMetadata),
    artifactPointers: asRecord(record.artifactPointers),
    completedAt,
    ...(errorMessage
      ? { error: { ...(stringValue(errorRecord.code) ? { code: stringValue(errorRecord.code) as string } : {}), message: errorMessage } }
      : {}),
    phaseTimings: Array.isArray(record.phaseTimings) ? record.phaseTimings : [],
    scanId,
    status,
    targetEnvironment
  };
}

function messageBody(message: Message) {
  if (!message.Body) {
    throw new Error("Lambda result SQS message did not include a body.");
  }
  return message.Body;
}

function receiptHandle(message: Message) {
  if (!message.ReceiptHandle) {
    throw new Error("Lambda result SQS message did not include a receipt handle.");
  }
  return message.ReceiptHandle;
}

export async function recordLocalV2DagLambdaResult(parsedMessage: LambdaResultMessage) {
  const context = await queryOne<{
    domainId: string | null;
    organizationId: string | null;
  }>(
    `select domain_id as "domainId",
            organization_id as "organizationId"
       from scans
      where id = $1
      limit 1`,
    [parsedMessage.scanId],
    { readOnly: true }
  );
  if (!context) {
    throw new Error(`Cannot record Lambda result for unknown scan ${parsedMessage.scanId}.`);
  }

  await query(
    `update scans
        set completed_at = coalesce(completed_at, $2::timestamptz),
            error_message = case when $3 = 'failed' then $4 else error_message end,
            status = case when $3 = 'failed' then 'failed' else 'completed' end
      where id = $1
        and status in ('queued', 'running')`,
    [
      parsedMessage.scanId,
      parsedMessage.completedAt,
      parsedMessage.status,
      parsedMessage.error?.message ?? null
    ]
  );

  const eventType =
    parsedMessage.status === "failed"
      ? RESULT_FAILED_EVENT_TYPE
      : RESULT_RECEIVED_EVENT_TYPE;
  const existingEvent = await queryOne<{ id: string }>(
    `select id
       from scan_events
      where scan_id = $1
        and event_type = $2
        and metadata_json->>'completedAt' = $3
        and metadata_json->>'resultStatus' = $4
        and metadata_json->>'processor' = $5
      limit 1`,
    [
      parsedMessage.scanId,
      eventType,
      parsedMessage.completedAt,
      parsedMessage.status,
      PROCESSOR
    ],
    { readOnly: true }
  );
  if (existingEvent) {
    return;
  }

  await query(
    `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      parsedMessage.scanId,
      context.domainId,
      context.organizationId,
      eventType,
      parsedMessage.status === "failed"
        ? "Local v2 DAG Lambda returned a failed artifact-only result."
        : "Local v2 DAG Lambda returned a completed artifact-only result.",
      {
        artifactOnly: true,
        artifactMetadata: parsedMessage.artifactMetadata ?? {},
        artifactPointers: parsedMessage.artifactPointers ?? {},
        completedAt: parsedMessage.completedAt,
        lambdaPhaseTimings: parsedMessage.phaseTimings ?? [],
        processor: PROCESSOR,
        productionFindingIntegration: false,
        resultStatus: parsedMessage.status,
        targetEnvironment: parsedMessage.targetEnvironment,
        v2ArtifactsRemainInternal: true,
        ...(parsedMessage.error ? { error: parsedMessage.error } : {})
      }
    ]
  );
}

async function pollOnce(input: {
  client: SQSClient;
  queueUrl: string;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  const response = await input.client.send(new ReceiveMessageCommand({
    MaxNumberOfMessages: 10,
    QueueUrl: input.queueUrl,
    VisibilityTimeout: 30,
    WaitTimeSeconds: 10
  }));
  const messages = response.Messages ?? [];
  let handled = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      const parsed = parseLambdaResultMessage(messageBody(message), input.targetEnvironment);
      await recordLocalV2DagLambdaResult(parsed);
      await input.client.send(new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: receiptHandle(message)
      }));
      handled += 1;
    } catch (error) {
      failed += 1;
      console.error("[validation-worker] v2 DAG Lambda result message rejected", {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId ?? null
      });
    }
  }

  if (messages.length > 0) {
    console.info("[validation-worker] v2 DAG Lambda result poll complete", {
      failed,
      handled,
      received: messages.length
    });
  }
}

export function startLocalV2DagLambdaResultPoller(options: LocalV2DagLambdaResultPollerOptions) {
  if (!options.enabled || !options.queueUrl) {
    console.info("[validation-worker] v2 DAG Lambda result poller disabled", {
      enabled: options.enabled,
      queueConfigured: Boolean(options.queueUrl)
    });
    return null;
  }

  const client = new SQSClient({ region: parseQueueRegion(options.queueUrl) });
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        await pollOnce({
          client,
          queueUrl: options.queueUrl as string,
          targetEnvironment: options.targetEnvironment
        });
      } catch (error) {
        console.error("[validation-worker] v2 DAG Lambda result poll failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await sleep(options.pollMs);
    }
  }

  console.info("[validation-worker] v2 DAG Lambda result poller started", {
    pollMs: options.pollMs,
    queueRegion: parseQueueRegion(options.queueUrl),
    targetEnvironment: options.targetEnvironment
  });
  void loop();

  return {
    stop() {
      stopped = true;
    }
  };
}
