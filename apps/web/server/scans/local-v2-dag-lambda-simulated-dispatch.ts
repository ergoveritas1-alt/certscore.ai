import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  VERIFIED_PRE_CONSENT_RUNTIME_PREVIEW_PACKET_VERSION,
  verifiedPreConsentRuntimePreviewPacketSchema,
} from "@certscore/contracts";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  buildLocalV2DagLambdaDispatchPayload,
  type LocalV2DagLambdaDispatchPayload,
  type LocalV2DagLambdaDispatchResult
} from "./local-v2-dag-lambda-dispatch";
import { handleLocalV2DagLambdaResultMessage } from "./local-v2-dag-lambda-result-poller";

const execFileAsync = promisify(execFile);
// Keep the local simulator inside the same bounded execution envelope as the
// deployed coordinator, while leaving enough time to persist a terminal
// result before the 930s orphan-reconciliation deadline.
export const LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS = 915_000;
const LOCAL_V2_DAG_RUNTIME_PREVIEW_MESSAGE_VERSION = "certscore.v2.lambda-runtime-preview-ready.v1";
const LOCAL_V2_DAG_RUNTIME_PREVIEW_RECEIVED_EVENT_TYPE = "v2_runtime_preview.received";
const LOCAL_V2_DAG_RUNTIME_PREVIEW_MAX_BYTES = 128_000;
const LOCAL_V2_DAG_SIMULATED_MESSAGE_POLL_MS = 50;

type LocalLambdaParitySummary = {
  fakeS3Root?: string;
  sqsMessages?: unknown[];
};

function simulatedMessageRecord(message: unknown) {
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return message && typeof message === "object" && !Array.isArray(message)
    ? message as Record<string, unknown>
    : null;
}

export function selectSimulatedLambdaTerminalResultMessages(messages: unknown[]) {
  const terminalResults = messages.filter((message) => (
    simulatedMessageRecord(message)?.contractVersion === LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION
  ));
  if (terminalResults.length !== 1) {
    throw new Error(
      `Simulated v2 DAG Lambda must emit exactly one terminal result message; received ${terminalResults.length}.`
    );
  }
  return terminalResults;
}

export function selectSimulatedLambdaRuntimePreviewMessages(messages: unknown[]) {
  return messages.filter((message) => {
    const record = simulatedMessageRecord(message);
    return record?.contractVersion === LOCAL_V2_DAG_RUNTIME_PREVIEW_MESSAGE_VERSION &&
      record.messageKind === "runtime_preview_ready";
  });
}

class LocalDiskS3ReadClient {
  constructor(private readonly fakeS3Root: string) {}

  async send(command: { input?: { Bucket?: unknown; Key?: unknown } }): Promise<any> {
    const bucket = requireString(command.input?.Bucket, "Bucket");
    const key = requireString(command.input?.Key, "Key");
    if (!/^[a-z0-9][a-z0-9.-]{1,62}$/i.test(bucket) || bucket === "." || bucket === "..") {
      throw new Error("Simulated v2 DAG Lambda local S3 bucket is unsafe.");
    }
    const keySegments = key.split("/");
    if (keySegments.some((segment) => !segment || segment === "." || segment === "..")) {
      throw new Error("Simulated v2 DAG Lambda local S3 key contains an unsafe path segment.");
    }
    return {
      $metadata: {},
      Body: await readFile(path.join(this.fakeS3Root, bucket, ...keySegments))
    };
  }
}

type LocalParityArgsPayload = Pick<
  LocalV2DagLambdaDispatchPayload,
  "awsRegion" | "debugOverrides" | "gpcObservation" | "postAcceptObservation" | "postRefusalObservation" | "profile" | "scanId" | "targetUrl"
>;

export function buildLocalV2DagSimulatedLambdaArgs(input: {
  artifactDir: string;
  messageStreamPath?: string | null;
  outPath: string;
  payload: LocalParityArgsPayload;
}) {
  const args = [
    "--env-file=apps/web/.env.local",
    "--import",
    "tsx",
    "scripts/run-local-v2-dag-lambda-parity.ts",
    "--",
    "--target-url",
    input.payload.targetUrl,
    "--aws-region",
    input.payload.awsRegion,
    "--profile",
    input.payload.profile,
    "--scan-id",
    input.payload.scanId,
    "--artifact-dir",
    input.artifactDir,
    "--out",
    input.outPath,
    "--variant",
    "wc01-local-simulated-lambda"
  ];

  if (input.messageStreamPath) {
    args.push("--message-stream", input.messageStreamPath);
  }

  if (input.payload.debugOverrides && Object.keys(input.payload.debugOverrides).length > 0) {
    args.push("--debug-overrides", JSON.stringify(input.payload.debugOverrides));
  }
  if (input.payload.gpcObservation?.enabled === true) {
    args.push("--gpc-config", JSON.stringify(input.payload.gpcObservation));
  }
  if (input.payload.postRefusalObservation?.enabled === true) {
    args.push("--post-refusal-config", JSON.stringify(input.payload.postRefusalObservation));
  }
  if (input.payload.postAcceptObservation?.enabled === true) {
    args.push("--post-accept-config", JSON.stringify(input.payload.postAcceptObservation));
  }
  return args;
}

export async function dispatchLocalV2DagSimulatedLambdaScan(input: {
  localCallbackUrl?: string | null;
  scanConfig: SharedScanConfig | Record<string, unknown>;
  scanId: string;
}): Promise<LocalV2DagLambdaDispatchResult> {
  const dispatchStartedAtMs = Date.now();
  const payload = buildLocalV2DagLambdaDispatchPayload(input);
  const root = workspaceRoot();
  const artifactDir = "artifacts/local-v2-dag-lambda-simulated";
  const outPath = `${artifactDir}/${payload.scanId}/summary.json`;
  const messageStreamPath = `${artifactDir}/${payload.scanId}/sqs-messages.ndjson`;
  const args = buildLocalV2DagSimulatedLambdaArgs({
    artifactDir,
    messageStreamPath,
    outPath,
    payload,
  });

  const execution = execFileAsync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
      PLAYWRIGHT_BROWSERS_PATH: "",
      TSX_TSCONFIG_PATH: "tsconfig.base.json"
    },
    killSignal: "SIGTERM",
    timeout: LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  });
  let executionSettled = false;
  void execution.then(
    () => { executionSettled = true; },
    () => { executionSettled = true; },
  );
  const fakeS3Root = path.join(root, artifactDir, "_fake-s3");
  const s3Client = new LocalDiskS3ReadClient(fakeS3Root);
  const messageStreaming = consumeSimulatedLambdaMessageStream({
    isExecutionSettled: () => executionSettled,
    messageStreamPath: path.join(root, messageStreamPath),
    onMessage: async (message) => {
      for (const runtimePreviewMessage of selectSimulatedLambdaRuntimePreviewMessages([message])) {
        try {
          await persistSimulatedRuntimePreviewMessage({
            message: runtimePreviewMessage,
            payload,
            s3Client,
          });
        } catch (error) {
          // The preview is optional and retrieval-only. Match the AWS path by
          // failing this handoff closed without blocking the terminal scan.
          console.warn(JSON.stringify({
            errorName: error instanceof Error ? error.name : "UnknownError",
            event: "v2_runtime_preview.local_simulator_rejected",
            scan_id: payload.scanId,
            target_environment: payload.targetEnvironment,
          }));
        }
      }
    },
  });
  let executionError: unknown = null;
  try {
    await execution;
  } catch (error) {
    executionError = error;
  }
  await messageStreaming;
  if (executionError) throw executionError;

  const summary = JSON.parse(await readFile(path.join(root, outPath), "utf8")) as LocalLambdaParitySummary;
  const messages = summary.sqsMessages ?? [];
  if (messages.length === 0) {
    throw new Error("Simulated v2 DAG Lambda completed without emitting a result message.");
  }
  if (!summary.fakeS3Root) {
    throw new Error("Simulated v2 DAG Lambda summary did not include a fake S3 root.");
  }

  const terminalS3Client = new LocalDiskS3ReadClient(summary.fakeS3Root);
  for (const message of selectSimulatedLambdaTerminalResultMessages(messages)) {
    await handleLocalV2DagLambdaResultMessage(message, {
      expectedTargetEnvironment: payload.targetEnvironment,
      s3Client: terminalS3Client as never,
      workspaceRoot: root
    });
  }

  return {
    dispatched: true,
    invocationRequestId: `local-simulated:${payload.scanId}`,
    invocationStatusCode: 200,
    invocationType: "Event",
    payload,
    timings: {
      clientReadyMs: 0,
      credentialResolutionMs: 0,
      dispatchTotalMs: Date.now() - dispatchStartedAtMs,
      requestSigningAndSendMs: 0,
      sdkImportMs: 0
    }
  };
}

export async function consumeSimulatedLambdaMessageStream(input: {
  isExecutionSettled: () => boolean;
  messageStreamPath: string;
  onMessage: (message: unknown) => Promise<void>;
  pollMs?: number;
}) {
  let processedLineCount = 0;
  const consumeAvailable = async () => {
    let contents = "";
    try {
      contents = await readFile(input.messageStreamPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
    const lastCompleteLineEnd = contents.lastIndexOf("\n");
    if (lastCompleteLineEnd < 0) return;
    const completeContents = contents.slice(0, lastCompleteLineEnd);
    const lines = completeContents ? completeContents.split("\n") : [];
    for (let index = processedLineCount; index < lines.length; index += 1) {
      const line = lines[index]?.trim();
      if (!line) continue;
      await input.onMessage(JSON.parse(line));
    }
    processedLineCount = lines.length;
  };

  while (!input.isExecutionSettled()) {
    await consumeAvailable();
    await delay(input.pollMs ?? LOCAL_V2_DAG_SIMULATED_MESSAGE_POLL_MS);
  }
  await consumeAvailable();
  return { processedLineCount };
}

async function persistSimulatedRuntimePreviewMessage(input: {
  message: unknown;
  payload: LocalV2DagLambdaDispatchPayload;
  s3Client: LocalDiskS3ReadClient;
}) {
  const message = requireSimulatedRuntimePreviewMessage(input.message, input.payload);
  const { bucket, key } = parseS3Uri(message.artifactPointer);
  const expectedKeySuffix = `/${message.scanId}/lanes/runtime_evidence/VerifiedPreConsentRuntimePreviewPacket.json`;
  if (!key.endsWith(expectedKeySuffix)) {
    throw new Error("Simulated runtime preview artifact pointer does not match its scan and lane identity.");
  }
  const response = await input.s3Client.send({ input: { Bucket: bucket, Key: key } });
  const body = Buffer.from(response.Body);
  if (
    body.byteLength !== message.artifactMetadata.sizeBytes ||
    createHash("sha256").update(body).digest("hex") !== message.artifactMetadata.sha256
  ) {
    throw new Error("Simulated runtime preview artifact checksum or size did not verify.");
  }
  const packet = verifiedPreConsentRuntimePreviewPacketSchema.parse(JSON.parse(body.toString("utf8")));
  if (
    packet.contractVersion !== VERIFIED_PRE_CONSENT_RUNTIME_PREVIEW_PACKET_VERSION ||
    packet.scanId !== message.scanId ||
    packet.sourceHash !== message.sourceHash
  ) {
    throw new Error("Simulated runtime preview packet identity does not match its message.");
  }
  const { sourceHash, ...unsignedPacket } = packet;
  if (createHash("sha256").update(JSON.stringify(unsignedPacket)).digest("hex") !== sourceHash) {
    throw new Error("Simulated runtime preview packet source hash did not verify.");
  }
  const scan = await queryOne<{ normalized_url: string | null }>(
    `select coalesce(nullif(s.scan_config_json->>'normalizedUrl', ''), d.normalized_url) as normalized_url
       from scans s
       left join domains d on d.id = s.domain_id
      where s.id = $1::uuid
      limit 1`,
    [message.scanId],
    { readOnly: true },
  );
  if (!scan?.normalized_url || scan.normalized_url !== packet.normalizedUrl) {
    throw new Error("Simulated runtime preview target does not match its persisted scan.");
  }
  await query(
    `insert into scan_events (scan_id, event_type, message, metadata_json)
     select $1::uuid, $2, $3, $4::jsonb
      where not exists (
        select 1 from scan_events existing
         where existing.scan_id = $1::uuid
           and existing.event_type = $2
           and existing.metadata_json->>'sourceHash' = $5
      )`,
    [
      message.scanId,
      LOCAL_V2_DAG_RUNTIME_PREVIEW_RECEIVED_EVENT_TYPE,
      "Verified preliminary passive pre-consent runtime observations were retained by the localhost Lambda simulator.",
      {
        artifactOnly: true,
        artifactPointer: message.artifactPointer,
        preview: packet.preview,
        productionFindingIntegration: false,
        queueRegion: input.payload.awsRegion,
        retainedAt: new Date().toISOString(),
        simulatedLocalLambda: true,
        sourceHash: packet.sourceHash,
        sqsMessageId: null,
      },
      packet.sourceHash,
    ],
  );
  console.info(JSON.stringify({
    event: "v2_runtime_preview.local_simulator_retained",
    scan_id: message.scanId,
    target_environment: input.payload.targetEnvironment,
  }));
}

function requireSimulatedRuntimePreviewMessage(
  value: unknown,
  payload: LocalV2DagLambdaDispatchPayload,
) {
  const record = simulatedMessageRecord(value);
  const metadata = simulatedMessageRecord(record?.artifactMetadata);
  const artifactPointer = typeof record?.artifactPointer === "string" ? record.artifactPointer : null;
  const sha256 = typeof metadata?.sha256 === "string" ? metadata.sha256 : null;
  const sourceHash = typeof record?.sourceHash === "string" ? record.sourceHash : null;
  const sizeBytes = typeof metadata?.sizeBytes === "number" && Number.isSafeInteger(metadata.sizeBytes)
    ? metadata.sizeBytes
    : null;
  if (
    record?.artifactOnly !== true ||
    record.productionFindingIntegration !== false ||
    record.processor !== payload.processor ||
    record.contractVersion !== LOCAL_V2_DAG_RUNTIME_PREVIEW_MESSAGE_VERSION ||
    record.messageKind !== "runtime_preview_ready" ||
    record.scanId !== payload.scanId ||
    record.targetEnvironment !== payload.targetEnvironment ||
    !artifactPointer?.startsWith("s3://") ||
    !sha256?.match(/^[a-f0-9]{64}$/i) ||
    !sourceHash?.match(/^[a-f0-9]{64}$/i) ||
    sizeBytes === null ||
    sizeBytes <= 0 ||
    sizeBytes > LOCAL_V2_DAG_RUNTIME_PREVIEW_MAX_BYTES
  ) {
    throw new Error("Simulated runtime preview message identity is invalid.");
  }
  return {
    artifactMetadata: { sha256, sizeBytes },
    artifactPointer,
    scanId: payload.scanId,
    sourceHash,
  };
}

function parseS3Uri(uri: string) {
  const match = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Simulated runtime preview artifact pointer is invalid.");
  }
  return { bucket: match[1], key: match[2] };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function workspaceRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}web`) ? path.resolve(cwd, "../..") : cwd;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Simulated v2 DAG Lambda local S3 read missing ${field}.`);
  }
  return value;
}
