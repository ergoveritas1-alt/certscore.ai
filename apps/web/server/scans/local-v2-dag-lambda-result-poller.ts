import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type DeleteMessageCommandOutput,
  type Message,
  type ReceiveMessageCommandOutput
} from "@aws-sdk/client-sqs";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE,
  ingestLocalV2DagLambdaResultMessage,
  type LocalV2DagLambdaResultMessage
} from "./local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_LAMBDA_AWS_REGION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  getLocalV2DagLambdaTargetEnvironment,
  type LocalV2DagLambdaTargetEnvironment
} from "./local-v2-dag-scan-config";

type SqsPollClient = {
  send(command: DeleteMessageCommand | ReceiveMessageCommand): Promise<DeleteMessageCommandOutput | ReceiveMessageCommandOutput>;
};

export type LocalV2DagLambdaResultPollerEnv = {
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV?: string;
};

export type LocalV2DagLambdaPollResult = {
  deleted: number;
  failed: number;
  handled: number;
  received: number;
};

function compactEnvValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function messageBody(message: Message) {
  if (!message.Body) {
    throw new Error("Local v2 DAG Lambda result SQS message did not include a body.");
  }

  return message.Body;
}

function getReceiptHandle(message: Message) {
  if (!message.ReceiptHandle) {
    throw new Error("Local v2 DAG Lambda result SQS message did not include a receipt handle.");
  }

  return message.ReceiptHandle;
}

export async function recordLocalV2DagLambdaResultEvent(parsedMessage: LocalV2DagLambdaResultMessage) {
  const { query, queryOne } = await import("@website-signal-risk-scanner/db");
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
    throw new Error(`Cannot record local v2 DAG Lambda result for unknown scan ${parsedMessage.scanId}.`);
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
      ? LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE
      : LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE;
  const artifactPointers = parsedMessage.artifactPointers ?? {};
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
      LOCAL_V2_DAG_SCAN_PROCESSOR
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
      artifactPointers,
      completedAt: parsedMessage.completedAt,
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      resultStatus: parsedMessage.status,
      targetEnvironment: parsedMessage.targetEnvironment,
      v2ArtifactsRemainInternal: true,
      ...(parsedMessage.error ? { error: parsedMessage.error } : {})
      }
    ]
  );
}

export async function handleLocalV2DagLambdaResultMessage(
  rawMessage: unknown,
  options: { expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment } = {}
) {
  const ingestion = ingestLocalV2DagLambdaResultMessage(rawMessage, options);
  await recordLocalV2DagLambdaResultEvent(ingestion.parsedMessage);
  return ingestion;
}

export async function pollLocalV2DagLambdaResultQueue(input: {
  env?: LocalV2DagLambdaResultPollerEnv;
  expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment;
  handleMessage?: typeof handleLocalV2DagLambdaResultMessage;
  maxMessages?: number;
  queueUrl?: string;
  sqsClient?: SqsPollClient;
  visibilityTimeoutSeconds?: number;
  waitTimeSeconds?: number;
} = {}): Promise<LocalV2DagLambdaPollResult> {
  const env = input.env ?? process.env;
  const queueUrl = compactEnvValue(input.queueUrl ?? env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL);
  if (!queueUrl) {
    throw new Error("Local v2 DAG Lambda result polling requires CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL.");
  }

  const expectedTargetEnvironment =
    input.expectedTargetEnvironment ?? getLocalV2DagLambdaTargetEnvironment(env);
  const sqsClient = input.sqsClient ?? new SQSClient({ region: LOCAL_V2_DAG_LAMBDA_AWS_REGION });
  const response = await sqsClient.send(new ReceiveMessageCommand({
    MaxNumberOfMessages: Math.min(Math.max(input.maxMessages ?? 10, 1), 10),
    QueueUrl: queueUrl,
    VisibilityTimeout: input.visibilityTimeoutSeconds ?? 30,
    WaitTimeSeconds: Math.min(Math.max(input.waitTimeSeconds ?? 10, 0), 20)
  })) as ReceiveMessageCommandOutput;
  const messages = response.Messages ?? [];
  const result: LocalV2DagLambdaPollResult = {
    deleted: 0,
    failed: 0,
    handled: 0,
    received: messages.length
  };
  const handleMessage = input.handleMessage ?? handleLocalV2DagLambdaResultMessage;

  for (const message of messages) {
    try {
      await handleMessage(messageBody(message), { expectedTargetEnvironment });
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: getReceiptHandle(message)
      }));
      result.deleted += 1;
      result.handled += 1;
    } catch (error) {
      result.failed += 1;
      console.error("[web] local v2 DAG Lambda result message rejected", {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId ?? null
      });
    }
  }

  return result;
}
