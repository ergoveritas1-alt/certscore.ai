import {
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput
} from "@aws-sdk/client-s3";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type MessageSystemAttributeName,
  type Message
} from "@aws-sdk/client-sqs";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

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
  handlerTiming?: LambdaHandlerTiming;
  phaseTimings?: unknown[];
  scanId: string;
  scannerGitSha?: string;
  scannerImageTag?: string;
  scannerRuntimeVersion?: string;
  status: LambdaResultStatus;
  targetEnvironment: LambdaTargetEnvironment;
};

type LambdaHandlerTiming = {
  artifactChainCompletedAt?: string;
  artifactChainDurationMs?: number;
  artifactChainStartedAt?: string;
  completedAt: string;
  firstPhaseLabel?: string;
  firstPhaseStartedAt?: string;
  handlerDurationMs: number;
  handlerStartedAt: string;
  scanPhaseCompletedAt?: string;
  scanPhaseDurationMs?: number;
  scanPhaseLabel?: string;
  scanPhaseStartedAt?: string;
};

type MirroredLambdaArtifact = {
  field: "manifestUri" | "scanArtifactUri" | "reviewArtifactUri" | "reportAdapterArtifactUri" | "auxiliaryArtifact";
  fileName: string;
  localPath: string;
  sha256: string;
  sizeBytes: number;
  sourceUri: string;
};

type S3GetClient = {
  send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
};

export type LocalV2DagLambdaResultPollerOptions = {
  enabled: boolean;
  pollMs: number;
  queueUrl?: string;
  queueUrls?: Array<string | null | undefined>;
  targetEnvironment: LambdaTargetEnvironment;
};

type LambdaResultConsumerMetadata = {
  approximateReceiveCount: number | null;
  consumerReceivedAt: string;
  queueRegion: string;
  sentAt: string | null;
  sqsMessageId: string | null;
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

function configuredQueueUrls(options: LocalV2DagLambdaResultPollerOptions) {
  return [
    ...(options.queueUrls ?? []),
    options.queueUrl
  ].reduce<string[]>((queueUrls, queueUrl) => {
    const normalized = typeof queueUrl === "string" && queueUrl.trim().length > 0 ? queueUrl.trim() : null;
    if (normalized && !queueUrls.includes(normalized)) {
      queueUrls.push(normalized);
    }
    return queueUrls;
  }, []);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseLambdaHandlerTiming(value: unknown): LambdaHandlerTiming | undefined {
  const record = asRecord(value);
  const handlerStartedAt = stringValue(record.handlerStartedAt);
  const completedAt = stringValue(record.completedAt);
  const handlerDurationMs = typeof record.handlerDurationMs === "number" && Number.isFinite(record.handlerDurationMs)
    ? Math.max(0, Math.round(record.handlerDurationMs))
    : null;
  if (!handlerStartedAt || !completedAt || handlerDurationMs === null) {
    return undefined;
  }
  const artifactChainDurationMs = typeof record.artifactChainDurationMs === "number" && Number.isFinite(record.artifactChainDurationMs)
    ? Math.max(0, Math.round(record.artifactChainDurationMs))
    : null;
  const scanPhaseDurationMs = typeof record.scanPhaseDurationMs === "number" && Number.isFinite(record.scanPhaseDurationMs)
    ? Math.max(0, Math.round(record.scanPhaseDurationMs))
    : null;
  const artifactChainCompletedAt = stringValue(record.artifactChainCompletedAt);
  const artifactChainStartedAt = stringValue(record.artifactChainStartedAt);
  const firstPhaseLabel = stringValue(record.firstPhaseLabel);
  const firstPhaseStartedAt = stringValue(record.firstPhaseStartedAt);
  const scanPhaseCompletedAt = stringValue(record.scanPhaseCompletedAt);
  const scanPhaseLabel = stringValue(record.scanPhaseLabel);
  const scanPhaseStartedAt = stringValue(record.scanPhaseStartedAt);
  return {
    ...(artifactChainCompletedAt ? { artifactChainCompletedAt } : {}),
    ...(artifactChainDurationMs !== null ? { artifactChainDurationMs } : {}),
    ...(artifactChainStartedAt ? { artifactChainStartedAt } : {}),
    completedAt,
    ...(firstPhaseLabel ? { firstPhaseLabel: firstPhaseLabel.slice(0, 80) } : {}),
    ...(firstPhaseStartedAt ? { firstPhaseStartedAt } : {}),
    handlerDurationMs,
    handlerStartedAt,
    ...(scanPhaseCompletedAt ? { scanPhaseCompletedAt } : {}),
    ...(scanPhaseDurationMs !== null ? { scanPhaseDurationMs } : {}),
    ...(scanPhaseLabel ? { scanPhaseLabel: scanPhaseLabel.slice(0, 80) } : {}),
    ...(scanPhaseStartedAt ? { scanPhaseStartedAt } : {})
  };
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
  const handlerTiming = parseLambdaHandlerTiming(record.handlerTiming);

  return {
    artifactMetadata: asRecord(record.artifactMetadata),
    artifactPointers: asRecord(record.artifactPointers),
    completedAt,
    ...(errorMessage
      ? { error: { ...(stringValue(errorRecord.code) ? { code: stringValue(errorRecord.code) as string } : {}), message: errorMessage } }
      : {}),
    ...(handlerTiming ? { handlerTiming } : {}),
    phaseTimings: Array.isArray(record.phaseTimings) ? record.phaseTimings : [],
    scanId,
    ...(stringValue(record.scannerGitSha) ? { scannerGitSha: (stringValue(record.scannerGitSha) as string).slice(0, 80) } : {}),
    ...(stringValue(record.scannerImageTag) ? { scannerImageTag: (stringValue(record.scannerImageTag) as string).slice(0, 160) } : {}),
    ...(stringValue(record.scannerRuntimeVersion)
      ? { scannerRuntimeVersion: (stringValue(record.scannerRuntimeVersion) as string).slice(0, 80) }
      : {}),
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

export function getManualSmokeResultScanId(rawMessage: unknown) {
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

export function getLambdaResultTargetEnvironment(rawMessage: unknown): LambdaTargetEnvironment | null {
  try {
    const record = asRecord(typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage);
    return record.targetEnvironment === "production" ? "production" : record.targetEnvironment === "local" ? "local" : null;
  } catch {
    return null;
  }
}

function receiptHandle(message: Message) {
  if (!message.ReceiptHandle) {
    throw new Error("Lambda result SQS message did not include a receipt handle.");
  }
  return message.ReceiptHandle;
}

function safeScanId(scanId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(scanId)) {
    throw new Error("Lambda artifact mirror received an unsafe scan ID.");
  }
  return scanId;
}

function localV2DagArtifactRoot(scanId: string, workspaceRoot = process.cwd()) {
  return path.resolve(workspaceRoot, "artifacts", "local-v2-dag-scans", safeScanId(scanId));
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error(`Lambda artifact URI must be durable s3://, got ${uri.slice(0, 24)}.`);
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error("Lambda artifact URI is missing bucket or key.");
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1)
  };
}

function inferS3ArtifactRegion(bucket: string) {
  const match = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-2)(?:-|$)/);
  return match?.[1] ?? "eu-central-1";
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Lambda artifact object did not include a body.");
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
  throw new Error("Unsupported Lambda artifact response body.");
}

function isSupportedAuxiliaryFileName(fileName: string) {
  return path.basename(fileName) === fileName && (
    fileName.endsWith(".json") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg")
  );
}

function artifactMetadataForField(
  artifactMetadata: Record<string, unknown> | undefined,
  field: string
) {
  return asRecord(artifactMetadata?.[field]);
}

async function mirrorS3Artifact(input: {
  artifactMetadata?: Record<string, unknown>;
  field: MirroredLambdaArtifact["field"];
  fileName: string;
  outDir: string;
  s3Client: S3GetClient;
  uri: string;
}) {
  const { bucket, key } = parseS3Uri(input.uri);
  const response = await input.s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(response.Body);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const expected = artifactMetadataForField(input.artifactMetadata, input.field);
  const expectedSha256 = stringValue(expected.sha256);
  const expectedSizeBytes = typeof expected.sizeBytes === "number" && Number.isFinite(expected.sizeBytes)
    ? expected.sizeBytes
    : null;
  if (expectedSha256 && expectedSha256 !== sha256) {
    throw new Error(`Lambda artifact checksum mismatch for ${input.fileName}.`);
  }
  if (expectedSizeBytes !== null && expectedSizeBytes !== body.byteLength) {
    throw new Error(`Lambda artifact size mismatch for ${input.fileName}.`);
  }
  const localPath = path.join(input.outDir, input.fileName);
  await writeFile(localPath, body);
  return {
    field: input.field,
    fileName: input.fileName,
    localPath,
    sha256,
    sizeBytes: body.byteLength,
    sourceUri: input.uri
  };
}

async function mirrorAuxiliaryArtifactsFromLambdaManifest(input: {
  manifestPath: string;
  outDir: string;
  s3Client: S3GetClient;
}) {
  const manifest = asRecord(JSON.parse(await readFile(input.manifestPath, "utf8")));
  const auxiliaryArtifacts = Array.isArray(manifest.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts : [];
  return Promise.all(auxiliaryArtifacts.flatMap((value) => {
    const artifact = asRecord(value);
    const fileName = stringValue(artifact.fileName) ?? "";
    const uri = stringValue(artifact.uri) ?? "";
    if (!isSupportedAuxiliaryFileName(fileName) || !uri) {
      return [];
    }
    return [async () => {
      const mirrored = await mirrorS3Artifact({
        field: "auxiliaryArtifact",
        fileName,
        outDir: input.outDir,
        s3Client: input.s3Client,
        uri
      });
      const expectedSha256 = stringValue(artifact.sha256);
      const expectedSizeBytes = typeof artifact.sizeBytes === "number" && Number.isFinite(artifact.sizeBytes)
        ? artifact.sizeBytes
        : null;
      if (expectedSha256 && expectedSha256 !== mirrored.sha256) {
        throw new Error(`Lambda auxiliary artifact checksum mismatch for ${fileName}.`);
      }
      if (expectedSizeBytes !== null && expectedSizeBytes !== mirrored.sizeBytes) {
        throw new Error(`Lambda auxiliary artifact size mismatch for ${fileName}.`);
      }
      return mirrored;
    }];
  }).map((mirror) => mirror()));
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

export async function mirrorLocalV2DagLambdaArtifacts(input: {
  mirrorAuxiliaryArtifacts?: boolean;
  parsedMessage: LambdaResultMessage;
  s3Client?: S3GetClient;
  workspaceRoot?: string;
}) {
  const pointers = input.parsedMessage.artifactPointers;
  if (input.parsedMessage.status !== "completed" || !pointers) {
    return null;
  }

  const scanArtifactUri = stringValue(pointers.scanArtifactUri);
  if (!scanArtifactUri) {
    return null;
  }

  const mirrorStartedAt = Date.now();
  const outDir = localV2DagArtifactRoot(input.parsedMessage.scanId, input.workspaceRoot);
  await mkdir(outDir, { recursive: true });
  const { bucket } = parseS3Uri(scanArtifactUri);
  const s3Client = input.s3Client ?? new S3Client({ region: inferS3ArtifactRegion(bucket) });
  const artifacts = [
    { field: "manifestUri" as const, fileName: "LocalV2DagLambdaManifest.json", uri: stringValue(pointers.manifestUri) },
    { field: "scanArtifactUri" as const, fileName: "CanonicalEvidenceBundle.json", uri: scanArtifactUri },
    { field: "reviewArtifactUri" as const, fileName: "ReviewResult.json", uri: stringValue(pointers.reviewArtifactUri) },
    { field: "reportAdapterArtifactUri" as const, fileName: "V2ReportProjectionDraft.json", uri: stringValue(pointers.reportAdapterArtifactUri) }
  ];
  const mirroredArtifacts: MirroredLambdaArtifact[] = await Promise.all(artifacts
    .filter((artifact): artifact is typeof artifact & { uri: string } => Boolean(artifact.uri))
    .map((artifact) => mirrorS3Artifact({
      artifactMetadata: input.parsedMessage.artifactMetadata,
      field: artifact.field,
      fileName: artifact.fileName,
      outDir,
      s3Client,
      uri: artifact.uri
    })));

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
    processor: PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.parsedMessage.scanId,
    source: "validation-worker-local-v2-dag-lambda-s3-handoff",
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
  parsedMessage: LambdaResultMessage;
  s3Client?: S3GetClient;
}) {
  const manifestArtifact = input.mirror.mirroredArtifacts.find((artifact) => artifact.fileName === "LocalV2DagLambdaManifest.json");
  if (!manifestArtifact) {
    return input.mirror;
  }

  const { bucket } = parseS3Uri(stringValue(input.parsedMessage.artifactPointers?.scanArtifactUri) ?? "");
  const s3Client = input.s3Client ?? new S3Client({ region: inferS3ArtifactRegion(bucket) });
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
    processor: PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.parsedMessage.scanId,
    source: "validation-worker-local-v2-dag-lambda-s3-handoff",
    targetEnvironment: input.parsedMessage.targetEnvironment
  }, null, 2)}\n`, "utf8");
  return input.mirror;
}

export async function recordLocalV2DagLambdaResult(
  parsedMessage: LambdaResultMessage,
  options: {
    consumer?: LambdaResultConsumerMetadata;
    s3Client?: S3GetClient;
    workspaceRoot?: string;
  } = {}
) {
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
    throw new Error(`Cannot record Lambda result for unknown scan ${parsedMessage.scanId}.`);
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
  let resultEventId = existingEvent?.id ?? null;
  if (existingEvent) {
    if (artifactMirror) {
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
  } else {
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
          artifactPointers: parsedMessage.artifactPointers ?? {},
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
          ...(parsedMessage.handlerTiming && Object.keys(parsedMessage.handlerTiming).length > 0
            ? { lambdaHandlerTiming: parsedMessage.handlerTiming }
            : {}),
          processor: PROCESSOR,
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
  }
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

async function pollOnce(input: {
  client: SQSClient;
  queueUrl: string;
  queueRegion: string;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  const response = await input.client.send(new ReceiveMessageCommand({
    MessageSystemAttributeNames: [
      "ApproximateReceiveCount",
      "SentTimestamp"
    ] satisfies MessageSystemAttributeName[],
    MaxNumberOfMessages: 10,
    QueueUrl: input.queueUrl,
    VisibilityTimeout: 5,
    WaitTimeSeconds: 10
  }));
  const messages = response.Messages ?? [];
  let deleted = 0;
  let handled = 0;
  let failed = 0;

  for (const message of messages) {
    const rawMessage = messageBody(message);
    const manualSmokeScanId = getManualSmokeResultScanId(rawMessage);
    if (manualSmokeScanId) {
      await input.client.send(new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: receiptHandle(message)
      }));
      deleted += 1;
      console.warn("[validation-worker] ignored manual v2 DAG Lambda smoke result", {
        messageId: message.MessageId ?? null,
        queueRegion: input.queueRegion,
        scanId: manualSmokeScanId
      });
      continue;
    }
    try {
      const parsed = parseLambdaResultMessage(rawMessage, input.targetEnvironment);
      await recordLocalV2DagLambdaResult(parsed, {
        consumer: {
          approximateReceiveCount: parseSqsInteger(message.Attributes?.ApproximateReceiveCount),
          consumerReceivedAt: new Date().toISOString(),
          queueRegion: input.queueRegion,
          sentAt: parseSqsEpochMillis(message.Attributes?.SentTimestamp),
          sqsMessageId: message.MessageId ?? null
        }
      });
      await input.client.send(new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: receiptHandle(message)
      }));
      deleted += 1;
      handled += 1;
    } catch (error) {
      const resultTargetEnvironment = getLambdaResultTargetEnvironment(rawMessage);
      if (resultTargetEnvironment && resultTargetEnvironment !== input.targetEnvironment) {
        await input.client.send(new ChangeMessageVisibilityCommand({
          QueueUrl: input.queueUrl,
          ReceiptHandle: receiptHandle(message),
          VisibilityTimeout: 0
        }));
        console.warn("[validation-worker] released wrong-target v2 DAG Lambda result", {
          expectedTargetEnvironment: input.targetEnvironment,
          messageId: message.MessageId ?? null,
          queueRegion: input.queueRegion,
          resultTargetEnvironment
        });
        continue;
      }
      failed += 1;
      console.error("[validation-worker] v2 DAG Lambda result message rejected", {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId ?? null
      });
    }
  }

  if (messages.length > 0) {
    console.info("[validation-worker] v2 DAG Lambda result poll complete", {
      deleted,
      failed,
      handled,
      received: messages.length
    });
  }

  return { deleted, failed, handled, received: messages.length };
}

export function startLocalV2DagLambdaResultPoller(options: LocalV2DagLambdaResultPollerOptions) {
  const queueUrls = configuredQueueUrls(options);
  if (!options.enabled || queueUrls.length === 0) {
    console.info("[validation-worker] v2 DAG Lambda result poller disabled", {
      enabled: options.enabled,
      queueConfigured: queueUrls.length > 0
    });
    return null;
  }

  const clients = new Map<string, SQSClient>();
  let stopped = false;

  async function loop() {
    while (!stopped) {
      try {
        const results = await Promise.all(queueUrls.map((queueUrl) => {
          const queueRegion = parseQueueRegion(queueUrl);
          let client = clients.get(queueRegion);
          if (!client) {
            client = new SQSClient({ region: queueRegion });
            clients.set(queueRegion, client);
          }
          return pollOnce({
            client,
            queueRegion,
            queueUrl,
            targetEnvironment: options.targetEnvironment
          });
        }));
        const result = results.reduce(
          (total, item) => ({
            failed: total.failed + item.failed,
            handled: total.handled + item.handled,
            received: total.received + item.received
          }),
          { failed: 0, handled: 0, received: 0 }
        );
        void result;
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
    queueRegions: queueUrls.map(parseQueueRegion),
    queueCount: queueUrls.length,
    targetEnvironment: options.targetEnvironment
  });
  void loop();

  return {
    stop() {
      stopped = true;
    }
  };
}
