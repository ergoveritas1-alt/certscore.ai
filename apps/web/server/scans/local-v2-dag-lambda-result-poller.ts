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
import { resolveScanNoGoPresentation } from "@website-signal-risk-scanner/shared";
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

type RetainedScanCompletionDiagnostics = {
  noGo: boolean;
  pageState: string | null;
  reasonCode: string | null;
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

const RESULT_BATCH_CONCURRENCY = 3;
const RESULT_VISIBILITY_TIMEOUT_SECONDS = 60;

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

async function readRetainedScanCompletionDiagnostics(
  artifactMirror: Awaited<ReturnType<typeof mirrorLocalV2DagLambdaArtifacts>>,
): Promise<RetainedScanCompletionDiagnostics | null> {
  const scanArtifact = artifactMirror?.mirroredArtifacts.find(
    (artifact) => artifact.fileName === "CanonicalEvidenceBundle.json",
  );
  if (!scanArtifact) return null;
  const bundle = asRecord(JSON.parse(await readFile(scanArtifact.localPath, "utf8")));
  const assessment = asRecord(bundle.scanNoGoAssessment ?? bundle.scan_no_go_assessment);
  const visualReview = asRecord(bundle.visualAccessReview ?? bundle.visual_access_review);
  const reasonCodes = Array.isArray(assessment.reasonCodes ?? assessment.reason_codes)
    ? (assessment.reasonCodes ?? assessment.reason_codes) as unknown[]
    : [];
  const reasonCode = reasonCodes.find(
    (value) => typeof value === "string" && value !== "scan_no_go_corroborated",
  );
  const pageState = visualReview.pageState ?? visualReview.page_state;
  return {
    noGo:
      (assessment.decision ?? assessment.scan_no_go_decision) === "no_go" &&
      (visualReview.goNoGo ?? visualReview.go_no_go) === "NO_GO",
    pageState: typeof pageState === "string" ? pageState : null,
    reasonCode: typeof reasonCode === "string" ? reasonCode : null,
  };
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

export async function readLocalV2DagLambdaArtifactJson(input: {
  expectedSha256?: string | null;
  region: string;
  uri: string;
}) {
  const { bucket, key } = parseS3Uri(input.uri);
  const response = await new S3Client({ region: input.region }).send(new GetObjectCommand({
    Bucket: bucket,
    Key: key
  }));
  const body = await streamToBuffer(response.Body);
  if (input.expectedSha256 && createHash("sha256").update(body).digest("hex") !== input.expectedSha256) {
    throw new Error("Local v2 DAG Lambda JSON artifact checksum mismatch.");
  }
  return asRecord(JSON.parse(body.toString("utf8")));
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
    mirrorAuxiliaryArtifacts?: boolean;
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
  const retainedDiagnostics = artifactMirror
    ? await readRetainedScanCompletionDiagnostics(artifactMirror).catch(() => null)
    : null;
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
          ...(parsedMessage.scannerRuntimeProvenance
            ? { scannerRuntimeProvenance: parsedMessage.scannerRuntimeProvenance }
            : {}),
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
            egress_id = coalesce($5, egress_id),
            egress_provider = coalesce($6, egress_provider),
            scan_config_json = jsonb_set(
              scan_config_json,
              '{execution,v2DagLambda}',
              coalesce(scan_config_json #> '{execution,v2DagLambda}', '{}'::jsonb) || jsonb_build_object(
                'completedAt', $2::timestamptz,
                'dispatchState', case when $3 = 'failed' then 'failed' else 'completed' end,
                'runtimeProvenance', $7::jsonb
              ),
              true
            ),
            status = case when $3 = 'failed' then 'failed' else 'completed' end
      where id = $1
        and status in ('queued', 'running')`,
    [
      parsedMessage.scanId,
      parsedMessage.completedAt,
      parsedMessage.status,
      parsedMessage.error?.message ?? null,
      parsedMessage.scannerRuntimeProvenance?.egressId ?? null,
      parsedMessage.scannerRuntimeProvenance?.egressProvider ?? null,
      parsedMessage.scannerRuntimeProvenance
        ? JSON.stringify(parsedMessage.scannerRuntimeProvenance)
        : null,
    ]
  );
  if (parsedMessage.scannerRuntimeProvenance) {
    await query(
      `update scan_snapshots
          set egress_id = coalesce($2, egress_id),
              egress_type = coalesce($3, egress_type),
              public_ip_hash = coalesce($4, public_ip_hash),
              region = coalesce($5, region)
        where scan_id = $1`,
      [
        parsedMessage.scanId,
        parsedMessage.scannerRuntimeProvenance.egressId ?? null,
        parsedMessage.scannerRuntimeProvenance.egressProvider ?? null,
        parsedMessage.scannerRuntimeProvenance.publicIpHash ?? null,
        parsedMessage.scannerRuntimeProvenance.awsRegion,
      ],
    );
  }
  if (parsedMessage.status === "completed" && retainedDiagnostics) {
    const pagesScanned = retainedDiagnostics.noGo ? 0 : 1;
    await query(
      `update scans
          set pages_scanned = case when $2::int = 0 then 0 else greatest(pages_scanned, $2::int) end
        where id = $1`,
      [parsedMessage.scanId, pagesScanned]
    );
    if (retainedDiagnostics.noGo) {
      const presentation = resolveScanNoGoPresentation(
        retainedDiagnostics.reasonCode,
        retainedDiagnostics.pageState,
      );
      await query(
        `update scan_snapshots
            set access_posture_class = 'early_loss',
                blocked_flag = $5,
                captcha_flag = $6,
                coverage_level = 'limited_none',
                homepage_fetch_status = 'failed',
                pages_scanned = 0,
                scan_outcome = $2,
                stop_reason_code = $2,
                stop_reason_detail = $3,
                stop_reason_label = $4
          where scan_id = $1`,
        [
          parsedMessage.scanId,
          retainedDiagnostics.reasonCode ?? "unknown_access_limitation",
          presentation.explanation,
          presentation.snapshotStopReasonLabel,
          presentation.limitationKind === "scanner_access_limitation",
          presentation.code === "captcha_or_challenge",
        ]
      );
    }
  }
  if (parsedMessage.status === "completed" && !retainedDiagnostics?.noGo) {
    await query(
      `update scan_snapshots
          set scan_outcome = coalesce(scan_outcome, 'completed_partial')
        where scan_id = $1`,
      [parsedMessage.scanId]
    );
  }
  if (artifactMirror && options.mirrorAuxiliaryArtifacts !== false) {
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
  if (parsedMessage.status === "completed") {
    const { persistCompletedLegacyGdprEprivacyAssessment } = await import("./score-assessment-lifecycle");
    const scorePersistence = await persistCompletedLegacyGdprEprivacyAssessment({
      organizationId: context.organizationId,
      scanId: parsedMessage.scanId,
      scoredAt: parsedMessage.completedAt
    });
    assertLocalV2DagCompletionScorePersistence(scorePersistence);
    console.info(JSON.stringify({
      event: "scan.score_assessment.completion_persisted",
      legacyReason: scorePersistence.reason,
      scanId: parsedMessage.scanId,
      shadowModelVersion: "shadowModelVersion" in scorePersistence ? scorePersistence.shadowModelVersion : null,
      shadowReason: "shadowReason" in scorePersistence ? scorePersistence.shadowReason : null
    }));
  }
}

export function assertLocalV2DagCompletionScorePersistence(result: {
  reason: string;
  shadowModelVersion?: string | null;
  shadowReason?: string | null;
}) {
  const legacyPersisted = result.reason === "inserted" || result.reason === "already_persisted";
  const shadowPersisted = result.shadowReason === "inserted" || result.shadowReason === "already_persisted";
  if (!legacyPersisted || !shadowPersisted || !result.shadowModelVersion) {
    throw new Error(
      `Completed scan score persistence is incomplete (legacy=${result.reason}, shadow=${result.shadowReason ?? "missing"}, model=${result.shadowModelVersion ?? "missing"}).`
    );
  }
}

export async function handleLocalV2DagLambdaResultMessage(
  rawMessage: unknown,
  options: {
    consumer?: LocalV2DagLambdaResultConsumerMetadata;
    expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment;
    mirrorAuxiliaryArtifacts?: boolean;
    s3Client?: S3GetClient;
    workspaceRoot?: string;
  } = {}
) {
  const ingestion = ingestLocalV2DagLambdaResultMessage(rawMessage, options);
  await recordLocalV2DagLambdaResultEvent(ingestion.parsedMessage, {
    consumer: options.consumer,
    mirrorAuxiliaryArtifacts: options.mirrorAuxiliaryArtifacts,
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

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await run(value);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function pollLocalV2DagLambdaResultQueue(input: {
  env?: LocalV2DagLambdaResultPollerEnv;
  expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment;
  handleMessage?: typeof handleLocalV2DagLambdaResultMessage;
  maxMessages?: number;
  mirrorAuxiliaryArtifacts?: boolean;
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
      MaxNumberOfMessages: Math.min(Math.max(input.maxMessages ?? RESULT_BATCH_CONCURRENCY, 1), 10),
      MessageSystemAttributeNames: [
        "ApproximateReceiveCount",
        "SentTimestamp"
      ] satisfies MessageSystemAttributeName[],
      QueueUrl: queueUrl,
      VisibilityTimeout: input.visibilityTimeoutSeconds ?? RESULT_VISIBILITY_TIMEOUT_SECONDS,
      WaitTimeSeconds: Math.min(Math.max(input.waitTimeSeconds ?? 10, 0), 20)
    })) as ReceiveMessageCommandOutput;
    const messages = response.Messages ?? [];
    queueResult.received += messages.length;

    const messageResults = await mapWithConcurrency(messages, RESULT_BATCH_CONCURRENCY, async (message) => {
      const rawMessage = messageBody(message);
      const manualSmokeScanId = getManualSmokeResultScanId(rawMessage);
      if (manualSmokeScanId) {
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: getReceiptHandle(message)
        }));
        console.warn("[web] ignored manual local v2 DAG Lambda smoke result", {
          messageId: message.MessageId ?? null,
          queueRegion: getSqsQueueRegion(queueUrl),
          scanId: manualSmokeScanId
        });
        return { deleted: 1, failed: 0, handled: 0 };
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
          mirrorAuxiliaryArtifacts: input.mirrorAuxiliaryArtifacts,
          s3Client
        });
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: queueUrl,
          ReceiptHandle: getReceiptHandle(message)
        }));
        return { deleted: 1, failed: 0, handled: 1 };
      } catch (error) {
        console.error("[web] local v2 DAG Lambda result message rejected", {
          error: error instanceof Error ? error.message : String(error),
          messageId: message.MessageId ?? null,
          queueRegion: getSqsQueueRegion(queueUrl)
        });
        return { deleted: 0, failed: 1, handled: 0 };
      }
    });
    for (const messageResult of messageResults) {
      queueResult.deleted += messageResult.deleted;
      queueResult.failed += messageResult.failed;
      queueResult.handled += messageResult.handled;
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
