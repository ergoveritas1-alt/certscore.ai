import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type MessageSystemAttributeName,
  type DeleteMessageCommandOutput,
  type Message,
  type ReceiveMessageCommandOutput
} from "@aws-sdk/client-sqs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE,
  ingestLocalV2DagLambdaResultMessage,
  type LocalV2DagLambdaResultMessage
} from "./local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  getSqsQueueRegion,
  getLocalV2DagLambdaTargetEnvironment,
  type LocalV2DagLambdaTargetEnvironment
} from "./local-v2-dag-scan-config";
import { buildScanTimingSummary, type ScanTimingSummary } from "@website-signal-risk-scanner/shared";

type SqsPollClient = {
  send(command: DeleteMessageCommand | ReceiveMessageCommand): Promise<DeleteMessageCommandOutput | ReceiveMessageCommandOutput>;
};

type S3GetClient = {
  send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
};

type MirroredLambdaArtifact = {
  field: "manifestUri" | "scanArtifactUri" | "reviewArtifactUri" | "reportAdapterArtifactUri" | "auxiliaryArtifact";
  fileName: string;
  localPath: string;
  sha256: string;
  sizeBytes: number;
  sourceUri: string;
};

export type LocalV2DagLambdaResultPollerEnv = {
  [key: string]: string | undefined;
  CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV?: string;
  CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL?: string;
};

export type LocalV2DagLambdaPollResult = {
  deleted: number;
  failed: number;
  handled: number;
  received: number;
};

type LocalV2DagLambdaResultConsumerMetadata = {
  approximateReceiveCount: number | null;
  consumerReceivedAt: string;
  queueRegion: string;
  sentAt: string | null;
  sqsMessageId: string | null;
};

function compactEnvValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getConfiguredLocalV2DagLambdaResultQueueUrls(env: LocalV2DagLambdaResultPollerEnv = process.env) {
  return [
    compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL),
    compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL),
    compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL),
    compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL)
  ].reduce<string[]>((queueUrls, queueUrl) => {
    if (queueUrl && !queueUrls.includes(queueUrl)) {
      queueUrls.push(queueUrl);
    }
    return queueUrls;
  }, []);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function readJsonFileIfPresent(filePath: string | null | undefined) {
  if (!filePath) {
    return null;
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function messageBody(message: Message) {
  if (!message.Body) {
    throw new Error("Local v2 DAG Lambda result SQS message did not include a body.");
  }

  return message.Body;
}

function getManualSmokeResultScanId(rawMessage: unknown) {
  try {
    const record = asRecord(typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage);
    const scanId = typeof record.scanId === "string" ? record.scanId : "";
    return (
      scanId.startsWith("manual-") ||
      scanId.startsWith("postdeploy-") ||
      scanId.startsWith("aro-gate-")
    ) ? scanId : null;
  } catch {
    return null;
  }
}

function getReceiptHandle(message: Message) {
  if (!message.ReceiptHandle) {
    throw new Error("Local v2 DAG Lambda result SQS message did not include a receipt handle.");
  }

  return message.ReceiptHandle;
}

function safeScanId(scanId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(scanId)) {
    throw new Error("Local v2 DAG Lambda artifact mirror received an unsafe scan ID.");
  }
  return scanId;
}

function localV2DagArtifactRoot(scanId: string, workspaceRoot = process.cwd()) {
  return path.resolve(workspaceRoot, "artifacts", "local-v2-dag-scans", safeScanId(scanId));
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error(`Local v2 DAG Lambda artifact URI must be durable s3://, got ${uri.slice(0, 24)}.`);
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error("Local v2 DAG Lambda artifact URI is missing bucket or key.");
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1)
  };
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Local v2 DAG Lambda artifact object did not include a body.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Unsupported local v2 DAG Lambda artifact response body.");
}

export async function mirrorLocalV2DagLambdaArtifacts(input: {
  mirrorAuxiliaryArtifacts?: boolean;
  parsedMessage: LocalV2DagLambdaResultMessage;
  s3Client?: S3GetClient;
  workspaceRoot?: string;
}) {
  const pointers = input.parsedMessage.artifactPointers;
  if (input.parsedMessage.status !== "completed" || !pointers) {
    return null;
  }

  const mirrorStartedAt = Date.now();
  const outDir = localV2DagArtifactRoot(input.parsedMessage.scanId, input.workspaceRoot);
  await mkdir(outDir, { recursive: true });
  const s3Client = input.s3Client ?? new S3Client({});
  const artifacts = [
    { field: "manifestUri" as const, fileName: "LocalV2DagLambdaManifest.json", uri: pointers.manifestUri },
    { field: "scanArtifactUri" as const, fileName: "CanonicalEvidenceBundle.json", uri: pointers.scanArtifactUri },
    { field: "reviewArtifactUri" as const, fileName: "ReviewResult.json", uri: pointers.reviewArtifactUri },
    { field: "reportAdapterArtifactUri" as const, fileName: "V2ReportProjectionDraft.json", uri: pointers.reportAdapterArtifactUri }
  ];
  const mirroredArtifacts: MirroredLambdaArtifact[] = await Promise.all(artifacts
    .filter((artifact): artifact is typeof artifact & { uri: string } => Boolean(artifact.uri))
    .map(async (artifact) => {
      const { bucket, key } = parseS3Uri(artifact.uri);
      const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await streamToBuffer(response.Body);
      const sha256 = createHash("sha256").update(body).digest("hex");
      const expected = input.parsedMessage.artifactMetadata?.[artifact.field];
      if (expected?.sha256 && expected.sha256 !== sha256) {
        throw new Error(`Local v2 DAG Lambda artifact checksum mismatch for ${artifact.fileName}.`);
      }
      if (typeof expected?.sizeBytes === "number" && expected.sizeBytes !== body.byteLength) {
        throw new Error(`Local v2 DAG Lambda artifact size mismatch for ${artifact.fileName}.`);
      }
      const localPath = path.join(outDir, artifact.fileName);
      await writeFile(localPath, body);
      return {
        field: artifact.field,
        fileName: artifact.fileName,
        localPath,
        sha256,
        sizeBytes: body.byteLength,
        sourceUri: artifact.uri
      };
    }));

  const manifestArtifact = mirroredArtifacts.find((artifact) => artifact.fileName === "LocalV2DagLambdaManifest.json");
  if (manifestArtifact && input.mirrorAuxiliaryArtifacts !== false) {
    const auxiliaryArtifacts = await mirrorAuxiliaryArtifactsFromLambdaManifest({
      manifestPath: manifestArtifact.localPath,
      outDir,
      s3Client
    });
    mirroredArtifacts.push(...auxiliaryArtifacts);
  }

  const manifestPath = path.join(outDir, "LambdaArtifactMirrorManifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    artifactOnly: true,
    durationMs: Date.now() - mirrorStartedAt,
    fetchedAt: new Date().toISOString(),
    mirroredArtifacts,
    outDir,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.parsedMessage.scanId,
    source: "local-v2-dag-lambda-s3-handoff",
    targetEnvironment: input.parsedMessage.targetEnvironment
  }, null, 2)}\n`, "utf8");

  return {
    durationMs: Date.now() - mirrorStartedAt,
    manifestPath,
    mirroredArtifacts,
    outDir
  };
}

async function mirrorLocalV2DagLambdaAuxiliaryArtifacts(input: {
  mirror: NonNullable<Awaited<ReturnType<typeof mirrorLocalV2DagLambdaArtifacts>>>;
  parsedMessage: LocalV2DagLambdaResultMessage;
  s3Client?: S3GetClient;
}) {
  const manifestArtifact = input.mirror.mirroredArtifacts.find((artifact) => artifact.fileName === "LocalV2DagLambdaManifest.json");
  if (!manifestArtifact) {
    return input.mirror;
  }

  const s3Client = input.s3Client ?? new S3Client({});
  const auxiliaryArtifacts = await mirrorAuxiliaryArtifactsFromLambdaManifest({
    manifestPath: manifestArtifact.localPath,
    outDir: input.mirror.outDir,
    s3Client
  });
  input.mirror.mirroredArtifacts.push(...auxiliaryArtifacts);
  await writeFile(input.mirror.manifestPath, `${JSON.stringify({
    artifactOnly: true,
    durationMs: input.mirror.durationMs,
    fetchedAt: new Date().toISOString(),
    mirroredArtifacts: input.mirror.mirroredArtifacts,
    outDir: input.mirror.outDir,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.parsedMessage.scanId,
    source: "local-v2-dag-lambda-s3-handoff",
    targetEnvironment: input.parsedMessage.targetEnvironment
  }, null, 2)}\n`, "utf8");
  return input.mirror;
}

function mirroredArtifactLocalPath(
  mirror: NonNullable<Awaited<ReturnType<typeof mirrorLocalV2DagLambdaArtifacts>>>,
  fileName: string
) {
  return mirror.mirroredArtifacts.find((artifact) => artifact.fileName === fileName)?.localPath ?? null;
}

async function buildScanTimingSummaryFromMirror(input: {
  artifactMirror: NonNullable<Awaited<ReturnType<typeof mirrorLocalV2DagLambdaArtifacts>>>;
  consumer?: LocalV2DagLambdaResultConsumerMetadata;
  lambdaToWc01ResultRecordedMs: number | null;
  parsedMessage: LocalV2DagLambdaResultMessage;
  wc01ResultRecordedAt: Date;
}): Promise<ScanTimingSummary> {
  const mirrorManifest = await readJsonFileIfPresent(input.artifactMirror.manifestPath);
  const manifest = await readJsonFileIfPresent(mirroredArtifactLocalPath(input.artifactMirror, "LocalV2DagLambdaManifest.json"));
  const canonicalEvidenceBundle = await readJsonFileIfPresent(mirroredArtifactLocalPath(input.artifactMirror, "CanonicalEvidenceBundle.json"));
  const scanCorePhases = await readJsonFileIfPresent(mirroredArtifactLocalPath(input.artifactMirror, "V2ScanCorePhases.json"));
  const handoffTiming = {
    artifactMirrorDurationMs: input.artifactMirror.durationMs,
    artifactMirroredAt: input.wc01ResultRecordedAt.toISOString(),
    lambdaCompletedAt: input.parsedMessage.completedAt,
    lambdaToWc01ResultRecordedMs: input.lambdaToWc01ResultRecordedMs,
    sqsApproximateReceiveCount: input.consumer?.approximateReceiveCount ?? null,
    sqsConsumerReceivedAt: input.consumer?.consumerReceivedAt ?? null,
    sqsMessageId: input.consumer?.sqsMessageId ?? null,
    sqsQueueRegion: input.consumer?.queueRegion ?? null,
    sqsSentAt: input.consumer?.sentAt ?? null,
    wc01ResultRecordedAt: input.wc01ResultRecordedAt.toISOString()
  };
  return buildScanTimingSummary({
    artifactMirror: input.artifactMirror,
    artifactPointers: input.parsedMessage.artifactPointers ?? {},
    canonicalEvidenceBundle,
    createdAt: input.wc01ResultRecordedAt.toISOString(),
    handoffTiming,
    lambdaCompletedAt: input.parsedMessage.completedAt,
    lambdaPhaseTimings: input.parsedMessage.phaseTimings ?? asRecord(manifest).phaseTimings ?? [],
    mirrorManifest,
    scanCorePhases
  });
}

async function persistScanTimingSummary(input: {
  context: {
    domainId: string | null;
    organizationId: string | null;
  };
  resultEventId: string | null;
  scanId: string;
  scanTimingSummary: ScanTimingSummary;
}) {
  const { query } = await import("@website-signal-risk-scanner/db");
  if (input.resultEventId) {
    await query(
      `update scan_events
          set metadata_json = jsonb_set(metadata_json, '{scanTimingSummary}', $2::jsonb, true)
        where id = $1`,
      [input.resultEventId, input.scanTimingSummary]
    );
  }
  if (!input.context.domainId || !input.context.organizationId) {
    return;
  }
  await query(
    `insert into scan_runtime_artifacts (scan_id, organization_id, domain_id, scan_timing_summary)
     values ($1, $2, $3, $4::jsonb)
     on conflict (scan_id) do update
       set scan_timing_summary = excluded.scan_timing_summary,
           updated_at = timezone('utc', now())`,
    [
      input.scanId,
      input.context.organizationId,
      input.context.domainId,
      input.scanTimingSummary
    ]
  );
}

async function recordScanTimingSummaryFailure(input: {
  error: unknown;
  resultEventId: string | null;
  stage: string;
}) {
  if (!input.resultEventId) {
    return;
  }
  const { query } = await import("@website-signal-risk-scanner/db");
  await query(
    `update scan_events
        set metadata_json = jsonb_set(metadata_json, '{scanTimingSummaryError}', $2::jsonb, true)
      where id = $1`,
    [
      input.resultEventId,
      {
        message: input.error instanceof Error ? input.error.message.replace(/\s+/g, " ").slice(0, 500) : String(input.error).replace(/\s+/g, " ").slice(0, 500),
        recordedAt: new Date().toISOString(),
        stage: input.stage.slice(0, 80)
      }
    ]
  );
}

async function persistScanTimingSummaryFromMirror(input: {
  artifactMirror: NonNullable<Awaited<ReturnType<typeof mirrorLocalV2DagLambdaArtifacts>>>;
  consumer?: LocalV2DagLambdaResultConsumerMetadata;
  context: {
    domainId: string | null;
    organizationId: string | null;
  };
  lambdaToWc01ResultRecordedMs: number | null;
  parsedMessage: LocalV2DagLambdaResultMessage;
  resultEventId: string | null;
  stage: string;
  wc01ResultRecordedAt: Date;
}) {
  try {
    const scanTimingSummary = await buildScanTimingSummaryFromMirror({
      artifactMirror: input.artifactMirror,
      consumer: input.consumer,
      lambdaToWc01ResultRecordedMs: input.lambdaToWc01ResultRecordedMs,
      parsedMessage: input.parsedMessage,
      wc01ResultRecordedAt: input.wc01ResultRecordedAt
    });
    await persistScanTimingSummary({
      context: input.context,
      resultEventId: input.resultEventId,
      scanId: input.parsedMessage.scanId,
      scanTimingSummary
    });
  } catch (error) {
    await recordScanTimingSummaryFailure({ error, resultEventId: input.resultEventId, stage: input.stage });
    console.warn("[local-v2-dag-lambda-result] scan timing summary persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.parsedMessage.scanId,
      stage: input.stage
    });
  }
}

async function mirrorAuxiliaryArtifactsFromLambdaManifest(input: {
  manifestPath: string;
  outDir: string;
  s3Client: S3GetClient;
}): Promise<MirroredLambdaArtifact[]> {
  const manifest = asRecord(JSON.parse(await readFile(input.manifestPath, "utf8")));
  const auxiliaryArtifacts = Array.isArray(manifest.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts : [];
  return Promise.all(auxiliaryArtifacts.flatMap((value) => {
    const artifact = asRecord(value);
    const fileName = typeof artifact.fileName === "string" ? artifact.fileName : "";
    const uri = typeof artifact.uri === "string" ? artifact.uri : "";
    if (!isSupportedAuxiliaryFileName(fileName) || !uri) {
      return [];
    }
    return [async () => {
    const { bucket, key } = parseS3Uri(uri);
    const response = await input.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await streamToBuffer(response.Body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const expectedSha256 = typeof artifact.sha256 === "string" ? artifact.sha256 : null;
    const expectedSizeBytes = typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : null;
    if (expectedSha256 && expectedSha256 !== sha256) {
      throw new Error(`Local v2 DAG Lambda auxiliary artifact checksum mismatch for ${fileName}.`);
    }
    if (expectedSizeBytes !== null && expectedSizeBytes !== body.byteLength) {
      throw new Error(`Local v2 DAG Lambda auxiliary artifact size mismatch for ${fileName}.`);
    }
    const localPath = path.join(input.outDir, fileName);
    await writeFile(localPath, body);
    return {
      field: "auxiliaryArtifact" as const,
      fileName,
      localPath,
      sha256,
      sizeBytes: body.byteLength,
      sourceUri: uri
    };
    }];
  }).map((mirror) => mirror()));
}

function isSupportedAuxiliaryFileName(fileName: string) {
  return path.basename(fileName) === fileName && (
    fileName.endsWith(".json") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg")
  );
}

function withLocalV2DagOutDir(scanConfigJson: Record<string, unknown> | null, outDir: string) {
  const config = { ...(scanConfigJson ?? {}) };
  const execution = config.execution && typeof config.execution === "object" && !Array.isArray(config.execution)
    ? { ...(config.execution as Record<string, unknown>) }
    : {};
  execution.localV2Dag = {
    ...(execution.localV2Dag && typeof execution.localV2Dag === "object" && !Array.isArray(execution.localV2Dag)
      ? execution.localV2Dag as Record<string, unknown>
      : {}),
    artifactOnly: true,
    lambdaMirrored: true,
    outDir,
    productionFindingIntegration: false
  };
  config.execution = execution;
  return config;
}

export async function recordLocalV2DagLambdaResultEvent(
  parsedMessage: LocalV2DagLambdaResultMessage,
  options: {
    consumer?: LocalV2DagLambdaResultConsumerMetadata;
    s3Client?: S3GetClient;
    workspaceRoot?: string;
  } = {}
) {
  const { query, queryOne } = await import("@website-signal-risk-scanner/db");
  const context = await queryOne<{
    domainId: string | null;
    organizationId: string | null;
    scanConfigJson: Record<string, unknown> | null;
  }>(
    `select domain_id as "domainId",
            organization_id as "organizationId",
            scan_config_json as "scanConfigJson"
       from scans
      where id = $1
      limit 1`,
    [parsedMessage.scanId],
    { readOnly: true }
  );
  if (!context) {
    throw new Error(`Cannot record local v2 DAG Lambda result for unknown scan ${parsedMessage.scanId}.`);
  }

  const artifactMirror = await mirrorLocalV2DagLambdaArtifacts({
    mirrorAuxiliaryArtifacts: false,
    parsedMessage,
    s3Client: options.s3Client,
    workspaceRoot: options.workspaceRoot
  });
  const wc01ResultRecordedAt = new Date();
  const lambdaCompletedAtMs = Date.parse(parsedMessage.completedAt);
  const lambdaToWc01ResultRecordedMs = Number.isFinite(lambdaCompletedAtMs)
    ? Math.max(0, wc01ResultRecordedAt.getTime() - lambdaCompletedAtMs)
    : null;
  if (artifactMirror) {
    await query(
      `update scans
          set scan_config_json = $2::jsonb
        where id = $1`,
      [
        parsedMessage.scanId,
        withLocalV2DagOutDir(context.scanConfigJson, artifactMirror.outDir)
      ]
    );
  }

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
  let resultEventId = existingEvent?.id ?? null;

  if (!existingEvent) {
    const insertedEvent = await queryOne<{ id: string }>(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
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
          artifactMirror: artifactMirror
            ? {
                durationMs: artifactMirror.durationMs,
                manifestPath: artifactMirror.manifestPath,
                mirroredArtifacts: artifactMirror.mirroredArtifacts.map((artifact) => ({
                  field: artifact.field,
                  fileName: artifact.fileName,
                  localPath: artifact.localPath,
                  sha256: artifact.sha256,
                  sizeBytes: artifact.sizeBytes,
                  sourceUri: artifact.sourceUri
                })),
                outDir: artifactMirror.outDir
              }
            : null,
          artifactPointers,
          completedAt: parsedMessage.completedAt,
          handoffTiming: {
            artifactMirrorDurationMs: artifactMirror?.durationMs ?? null,
            artifactMirroredAt: artifactMirror ? wc01ResultRecordedAt.toISOString() : null,
            lambdaCompletedAt: parsedMessage.completedAt,
            lambdaToWc01ResultRecordedMs,
            wc01ResultRecordedAt: wc01ResultRecordedAt.toISOString()
          },
          ...(options.consumer
            ? {
                sqsConsumer: {
                  approximateReceiveCount: options.consumer.approximateReceiveCount,
                  consumerReceivedAt: options.consumer.consumerReceivedAt,
                  queueRegion: options.consumer.queueRegion,
                  sentAt: options.consumer.sentAt,
                  sqsMessageId: options.consumer.sqsMessageId
                }
              }
            : {}),
          lambdaPhaseTimings: parsedMessage.phaseTimings ?? [],
          ...(parsedMessage.handlerTiming ? { lambdaHandlerTiming: parsedMessage.handlerTiming } : {}),
          processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          productionFindingIntegration: false,
          resultStatus: parsedMessage.status,
          ...(parsedMessage.scannerGitSha ? { scannerGitSha: parsedMessage.scannerGitSha } : {}),
          ...(parsedMessage.scannerImageTag ? { scannerImageTag: parsedMessage.scannerImageTag } : {}),
          ...(parsedMessage.scannerRuntimeVersion ? { scannerRuntimeVersion: parsedMessage.scannerRuntimeVersion } : {}),
          targetEnvironment: parsedMessage.targetEnvironment,
          v2ArtifactsRemainInternal: true,
          ...(parsedMessage.error ? { error: parsedMessage.error } : {})
        }
      ]
    );
    resultEventId = insertedEvent?.id ?? null;
  } else if (artifactMirror) {
    await query(
      `update scan_events
          set metadata_json = jsonb_set(metadata_json, '{artifactMirror}', $2::jsonb, true)
        where id = $1
          and (metadata_json->'artifactMirror' is null or metadata_json->'artifactMirror' = 'null'::jsonb)`,
      [
        existingEvent.id,
        {
          durationMs: artifactMirror.durationMs,
          manifestPath: artifactMirror.manifestPath,
          mirroredArtifacts: artifactMirror.mirroredArtifacts.map((artifact) => ({
            field: artifact.field,
            fileName: artifact.fileName,
            localPath: artifact.localPath,
            sha256: artifact.sha256,
            sizeBytes: artifact.sizeBytes,
            sourceUri: artifact.sourceUri
          })),
          outDir: artifactMirror.outDir
        }
      ]
    );
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
  if (artifactMirror) {
    await persistScanTimingSummaryFromMirror({
      artifactMirror,
      consumer: options.consumer,
      context,
      lambdaToWc01ResultRecordedMs,
      parsedMessage,
      resultEventId,
      stage: "core_artifacts_mirrored",
      wc01ResultRecordedAt
    });
    await mirrorLocalV2DagLambdaAuxiliaryArtifacts({
      mirror: artifactMirror,
      parsedMessage,
      s3Client: options.s3Client
    });
    if (resultEventId) {
      await query(
        `update scan_events
            set metadata_json = jsonb_set(metadata_json, '{artifactMirror}', $2::jsonb, true)
          where id = $1`,
        [
          resultEventId,
          {
            durationMs: artifactMirror.durationMs,
            manifestPath: artifactMirror.manifestPath,
            mirroredArtifacts: artifactMirror.mirroredArtifacts.map((artifact) => ({
              field: artifact.field,
              fileName: artifact.fileName,
              localPath: artifact.localPath,
              sha256: artifact.sha256,
              sizeBytes: artifact.sizeBytes,
              sourceUri: artifact.sourceUri
            })),
            outDir: artifactMirror.outDir
          }
        ]
      );
    }
    await persistScanTimingSummaryFromMirror({
      artifactMirror,
      consumer: options.consumer,
      context,
      lambdaToWc01ResultRecordedMs,
      parsedMessage,
      resultEventId,
      stage: "auxiliary_artifacts_mirrored",
      wc01ResultRecordedAt
    });
  }
}

export async function handleLocalV2DagLambdaResultMessage(
  rawMessage: unknown,
  options: {
    consumer?: LocalV2DagLambdaResultConsumerMetadata;
    expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment;
    s3Client?: S3GetClient;
    workspaceRoot?: string;
  } = {}
) {
  const ingestion = ingestLocalV2DagLambdaResultMessage(rawMessage, options);
  await recordLocalV2DagLambdaResultEvent(ingestion.parsedMessage, {
    consumer: options.consumer,
    s3Client: options.s3Client,
    workspaceRoot: options.workspaceRoot
  });
  return ingestion;
}

function parseSqsEpochMillis(value: string | undefined) {
  if (!value) {
    return null;
  }
  const millis = Number(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function parseSqsInteger(value: string | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function pollLocalV2DagLambdaResultQueue(input: {
  env?: LocalV2DagLambdaResultPollerEnv;
  expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment;
  handleMessage?: typeof handleLocalV2DagLambdaResultMessage;
  maxMessages?: number;
  queueUrl?: string;
  s3Client?: S3GetClient;
  sqsClient?: SqsPollClient;
  visibilityTimeoutSeconds?: number;
  waitTimeSeconds?: number;
} = {}): Promise<LocalV2DagLambdaPollResult> {
  const env = input.env ?? process.env;
  const queueUrls = input.queueUrl
    ? [input.queueUrl]
    : getConfiguredLocalV2DagLambdaResultQueueUrls(env);
  if (queueUrls.length === 0) {
    throw new Error("Local v2 DAG Lambda result polling requires CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL or regional result queue URLs.");
  }

  const expectedTargetEnvironment =
    input.expectedTargetEnvironment ?? getLocalV2DagLambdaTargetEnvironment(env);
  const result: LocalV2DagLambdaPollResult = {
    deleted: 0,
    failed: 0,
    handled: 0,
    received: 0
  };
  const handleMessage = input.handleMessage ?? handleLocalV2DagLambdaResultMessage;

  const pollQueue = async (queueUrl: string): Promise<LocalV2DagLambdaPollResult> => {
    const queueResult: LocalV2DagLambdaPollResult = {
      deleted: 0,
      failed: 0,
      handled: 0,
      received: 0
    };
    const queueRegion = getSqsQueueRegion(queueUrl) ?? "eu-west-1";
    const sqsClient = input.sqsClient ?? new SQSClient({ region: queueRegion });
    const s3Client = input.s3Client ?? new S3Client({ region: queueRegion });
    const response = await sqsClient.send(new ReceiveMessageCommand({
      MaxNumberOfMessages: Math.min(Math.max(input.maxMessages ?? 10, 1), 10),
      MessageSystemAttributeNames: [
        "ApproximateReceiveCount",
        "SentTimestamp"
      ] satisfies MessageSystemAttributeName[],
      QueueUrl: queueUrl,
      VisibilityTimeout: input.visibilityTimeoutSeconds ?? 30,
      WaitTimeSeconds: Math.min(Math.max(input.waitTimeSeconds ?? 10, 0), 20)
    })) as ReceiveMessageCommandOutput;
    const messages = response.Messages ?? [];
    queueResult.received += messages.length;

    for (const message of messages) {
      const rawMessage = messageBody(message);
      const manualSmokeScanId = getManualSmokeResultScanId(rawMessage);
      if (manualSmokeScanId) {
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: getReceiptHandle(message)
        }));
        queueResult.deleted += 1;
        console.warn("[web] ignored manual local v2 DAG Lambda smoke result", {
          messageId: message.MessageId ?? null,
          queueRegion: getSqsQueueRegion(queueUrl),
          scanId: manualSmokeScanId
        });
        continue;
      }
      try {
        await handleMessage(rawMessage, {
          consumer: {
            approximateReceiveCount: parseSqsInteger(message.Attributes?.ApproximateReceiveCount),
            consumerReceivedAt: new Date().toISOString(),
            queueRegion,
            sentAt: parseSqsEpochMillis(message.Attributes?.SentTimestamp),
            sqsMessageId: message.MessageId ?? null
          },
          expectedTargetEnvironment,
          s3Client
        });
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: getReceiptHandle(message)
        }));
        queueResult.deleted += 1;
        queueResult.handled += 1;
      } catch (error) {
        queueResult.failed += 1;
        console.error("[web] local v2 DAG Lambda result message rejected", {
          error: error instanceof Error ? error.message : String(error),
          messageId: message.MessageId ?? null,
          queueRegion: getSqsQueueRegion(queueUrl)
        });
      }
    }
    return queueResult;
  };

  const queueResults = await Promise.all(queueUrls.map((queueUrl) => pollQueue(queueUrl)));
  for (const queueResult of queueResults) {
    result.deleted += queueResult.deleted;
    result.failed += queueResult.failed;
    result.handled += queueResult.handled;
    result.received += queueResult.received;
  }

  return result;
}
