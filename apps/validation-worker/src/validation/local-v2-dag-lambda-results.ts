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
import {
  VERIFIED_POLICY_EVIDENCE_PACKET_VERSION,
  classifyV2DagLambdaResultDisposition,
  verifiedPolicyEvidencePacketSchema,
  type VerifiedPolicyEvidencePacket,
} from "@certscore/contracts";
import { query, queryOne } from "@website-signal-risk-scanner/db";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getWorkerEnv } from "../env";
import {
  buildPolicyReviewPacketFromVerifiedPolicyEvidence,
} from "./model-policy-review";
import { runStaticPolicyReviewPacket } from "./model-policy-review-runner";

const PROCESSOR = "local-certscore-v2-dag-parallel-v1";
const RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
const POLICY_EVIDENCE_MESSAGE_VERSION = "certscore.v2.lambda-policy-evidence-ready.v1";
const POLICY_EVIDENCE_RECEIVED_EVENT_TYPE = "v2_policy_evidence.received";
const POLICY_EVIDENCE_REJECTED_EVENT_TYPE = "v2_policy_evidence.rejected";
const RESULT_RECEIVED_EVENT_TYPE = "v2_lambda_result.received";
const RESULT_FAILED_EVENT_TYPE = "v2_lambda_result.failed";
const RESULT_BATCH_CONCURRENCY = 3;
const RESULT_QUEUE_POLL_CONCURRENCY = 2;
// Canonical report publication performs CPU-heavy projection and bounded
// database writes in the public web task. Keep only two finalizations active
// so a burst of completed scanners cannot starve report-status reads.
const RESULT_FINALIZATION_BACKGROUND_CONCURRENCY = 2;
const POLICY_EVIDENCE_BACKGROUND_CONCURRENCY = 2;
const RESULT_VISIBILITY_TIMEOUT_SECONDS = 240;
const MATERIALIZATION_FINALIZING_WAIT_MS = 150_000;
const MATERIALIZATION_INPUT_POLL_MS = 250;
const MATERIALIZATION_RETRY_MS = 500;
const ORPHAN_RECONCILIATION_INTERVAL_MS = 10_000;
// A missing result at the expected envelope is an operational delay, not
// evidence that the scanner failed. The hard deadline follows the deployed
// 900s coordinator timeout plus a bounded delivery allowance.
const ORPHAN_DELAY_AGE_MS = 45_000;
const ORPHAN_TERMINAL_AGE_MS = 930_000;

type LambdaResultStatus = "completed" | "failed";
type LambdaTargetEnvironment = "local" | "production";
type LambdaAwsRegion = "eu-central-1" | "eu-west-1" | "us-west-2";

type ScannerRuntimeProvenance = {
  awsRegion: LambdaAwsRegion;
  dispatchVpcMode: "none" | "vpc";
  egressId?: string;
  egressProvider?: string;
  functionVersion?: string;
  imageDigest?: string;
  publicIpHash?: string;
  runtimeVpcMode: "none" | "unknown" | "vpc";
};

type LambdaResultMessage = {
  artifactMetadata?: Record<string, unknown>;
  artifactPointers?: Record<string, unknown>;
  completedAt: string;
  error?: { code?: string; message: string };
  handlerTiming?: LambdaHandlerTiming;
  phaseTimings?: unknown[];
  policyEvidence?: LambdaPolicyEvidenceMessage;
  scanId: string;
  scannerGitSha?: string;
  scannerImageTag?: string;
  scannerRuntimeProvenance?: ScannerRuntimeProvenance;
  scannerRuntimeVersion?: string;
  status: LambdaResultStatus;
  targetEnvironment: LambdaTargetEnvironment;
};

type LambdaPolicyEvidenceMessage = {
  artifactMetadata: { sha256: string; sizeBytes: number };
  artifactOnly: true;
  artifactPointer: string;
  contractVersion: typeof POLICY_EVIDENCE_MESSAGE_VERSION;
  generatedAt: string;
  messageKind: "policy_evidence_ready";
  policyContentHash: string;
  processor: typeof PROCESSOR;
  productionFindingIntegration: false;
  scanId: string;
  sourceHash: string;
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

export type VerifiedProductionArtifactChain = {
  manifest: { sha256: string; sizeBytes: number };
  scanArtifact: { sha256: string; sizeBytes: number };
  verifiedAt: string;
};

export type LocalV2DagLambdaResultPollerOptions = {
  enabled: boolean;
  pollMs: number;
  queueUrl?: string;
  queueUrls?: Array<string | null | undefined>;
  targetEnvironment: LambdaTargetEnvironment;
  webBaseUrl?: string;
};

async function completedScoreMaterializationExists(scanId: string) {
  const row = await queryOne<{ materialization_complete: boolean }>(
    `select exists (
              select 1
                from public.scan_score_materialization_requests
               where scan_id = $1::uuid
                 and status = 'completed'
            ) as materialization_complete`,
    [scanId],
    { readOnly: true }
  );
  return row?.materialization_complete === true;
}

async function canonicalReportInputsReady(scanId: string) {
  const row = await queryOne<{ report_inputs_ready: boolean }>(
    `select exists (
              select 1
                from public.scan_events merged
               where merged.scan_id = $1::uuid
                 and merged.event_type = 'signals.merge_completed'
            ) and exists (
              select 1
                from public.scan_events findings
               where findings.scan_id = $1::uuid
                 and findings.event_type = 'findings.unified_derivation_completed'
            ) as report_inputs_ready`,
    [scanId]
  );
  return row?.report_inputs_ready === true;
}

async function waitForCanonicalReportInputs(scanId: string, deadlineMs: number) {
  while (Date.now() < deadlineMs) {
    if (await canonicalReportInputsReady(scanId)) return;
    await sleep(Math.min(MATERIALIZATION_INPUT_POLL_MS, Math.max(1, deadlineMs - Date.now())));
  }
  throw new Error("Canonical report inputs were not ready before the materialization deadline.");
}

export async function ensureCompletedScanScoresPersisted(input: {
  fetchImpl?: typeof fetch;
  scanId: string;
  targetEnvironment: LambdaTargetEnvironment;
  webBaseUrl?: string;
}) {
  if (await completedScoreMaterializationExists(input.scanId)) return { alreadyPersisted: true };
  const finalizingDeadline = Date.now() + MATERIALIZATION_FINALIZING_WAIT_MS;
  if (!(await canonicalReportInputsReady(input.scanId))) {
    throw new Error("Canonical report inputs are not ready for materialization.");
  }
  const token = randomBytes(32).toString("base64url");
  const tokenSha256 = createHash("sha256").update(token).digest("hex");
  await query(
    `insert into public.scan_score_materialization_requests (
       scan_id, token_sha256, status, attempt_count, requested_at, completed_at, last_error
     ) values ($1::uuid, $2, 'pending', 1, now(), null, null)
     on conflict (scan_id) do update
       set token_sha256 = excluded.token_sha256,
           status = 'pending',
           attempt_count = public.scan_score_materialization_requests.attempt_count + 1,
           requested_at = now(),
           completed_at = null,
           last_error = null
       where public.scan_score_materialization_requests.status <> 'completed'`,
    [input.scanId, tokenSha256]
  );
  if (await completedScoreMaterializationExists(input.scanId)) return { alreadyPersisted: true };

  const baseUrl = input.webBaseUrl?.trim() ||
    (input.targetEnvironment === "production" ? "https://certscore.ai" : "http://localhost:3000");
  const fetchMaterialization = input.fetchImpl ?? fetch;
  const materializationUrl = new URL("/api/internal/scan-score-materialization", baseUrl);
  let finalizingAttempt = 0;
  for (const mode of ["publish_report", "finalize"] as const) {
    while (true) {
      finalizingAttempt += 1;
      const remainingMs = Math.max(1_000, finalizingDeadline - Date.now());
      const response = await fetchMaterialization(materializationUrl, {
        body: JSON.stringify({ mode, scanId: input.scanId, token }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(remainingMs)
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as {
          code?: unknown;
          retryAfterSeconds?: unknown;
          retryable?: unknown;
        } | null;
        if (response.status === 422 && failure?.retryable === false) {
          console.error("[validation-worker] terminal score materialization failure acknowledged", {
            code: typeof failure.code === "string" ? failure.code.slice(0, 120) : "contract_validation_failed",
            scanId: input.scanId,
          });
          return { alreadyPersisted: false, terminalFailure: true as const };
        }
        if (response.status === 503 && failure?.code === "materialization_not_ready" && failure.retryable === true) {
          if (Date.now() + MATERIALIZATION_RETRY_MS < finalizingDeadline) {
            console.info("[validation-worker] score materialization still finalizing", {
              attempt: finalizingAttempt,
              retryMs: MATERIALIZATION_RETRY_MS,
              scanId: input.scanId,
            });
            await waitForCanonicalReportInputs(input.scanId, finalizingDeadline);
            await sleep(MATERIALIZATION_RETRY_MS);
            continue;
          }
        }
        throw new Error(`Score materialization endpoint returned HTTP ${response.status}.`);
      }
      const result = await response.json() as { complete?: unknown; reportReady?: unknown };
      if (mode === "publish_report") {
        if (result.reportReady !== true) {
          throw new Error("Report materialization endpoint did not confirm canonical report readiness.");
        }
        break;
      }
      if (result.complete !== true || !(await completedScoreMaterializationExists(input.scanId))) {
        throw new Error("Score materialization endpoint did not confirm canonical materialization completion.");
      }
      break;
    }
  }
  return { alreadyPersisted: false, terminalFailure: false as const };
}

type LambdaResultConsumerMetadata = {
  approximateReceiveCount: number | null;
  consumerReceivedAt: string;
  queueRegion: string;
  sentAt: string | null;
  sqsMessageId: string | null;
};

class TerminalEarlyPolicyEvidenceError extends Error {
  readonly code: string;
  readonly scanId: string | null;

  constructor(code: string, message: string, scanId: string | null = null) {
    super(message);
    this.name = "TerminalEarlyPolicyEvidenceError";
    this.code = code;
    this.scanId = scanId;
  }
}

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

function isPolicyEvidenceReadyMessage(raw: string) {
  try {
    const record = asRecord(JSON.parse(raw));
    return record.contractVersion === POLICY_EVIDENCE_MESSAGE_VERSION &&
      record.messageKind === "policy_evidence_ready";
  } catch {
    return false;
  }
}

async function processPolicyEvidenceReadyMessageUncoalesced(input: {
  queueRegion: string;
  raw: string;
  s3Client?: S3GetClient;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  const message = asRecord(JSON.parse(input.raw));
  const messageScanId = stringValue(message.scanId);
  if (
    message.artifactOnly !== true ||
    message.productionFindingIntegration !== false ||
    message.processor !== PROCESSOR ||
    message.contractVersion !== POLICY_EVIDENCE_MESSAGE_VERSION
  ) {
    throw new TerminalEarlyPolicyEvidenceError(
      "message_identity_invalid",
      "Early policy evidence message identity is invalid.",
      messageScanId,
    );
  }
  const targetEnvironment = message.targetEnvironment === "production" ? "production" : "local";
  if (targetEnvironment !== input.targetEnvironment) {
    throw new Error("Early policy evidence target environment does not match this worker.");
  }
  const scanId = stringValue(message.scanId);
  const artifactPointer = stringValue(message.artifactPointer);
  const metadata = asRecord(message.artifactMetadata);
  const expectedSha256 = stringValue(metadata.sha256);
  const expectedSizeBytes = typeof metadata.sizeBytes === "number" && Number.isSafeInteger(metadata.sizeBytes)
    ? metadata.sizeBytes
    : null;
  if (
    !isUuid(scanId) ||
    !artifactPointer ||
    !expectedSha256 ||
    !/^[a-f0-9]{64}$/i.test(expectedSha256) ||
    expectedSizeBytes === null ||
    expectedSizeBytes <= 0
  ) {
    throw new TerminalEarlyPolicyEvidenceError(
      "pointer_metadata_invalid",
      "Early policy evidence message is missing its verified pointer metadata.",
      scanId,
    );
  }
  const existingScan = await queryOne<{ id: string }>(
    "select id::text as id from scans where id = $1::uuid limit 1",
    [scanId],
    { readOnly: true },
  );
  if (!existingScan) {
    throw new Error(`Cannot retain early policy evidence for unknown scan ${scanId}.`);
  }
  let bucket: string;
  let key: string;
  try {
    ({ bucket, key } = parseS3Uri(artifactPointer));
  } catch {
    throw new TerminalEarlyPolicyEvidenceError(
      "artifact_pointer_invalid",
      "Early policy evidence artifact pointer is invalid.",
      scanId,
    );
  }
  const s3Client = input.s3Client ?? new S3Client({ region: inferS3ArtifactRegion(bucket) });
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(response.Body);
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  if (bodySha256 !== expectedSha256 || body.byteLength !== expectedSizeBytes) {
    throw new Error("Early policy evidence artifact checksum or size did not verify.");
  }
  let packet: VerifiedPolicyEvidencePacket;
  try {
    packet = verifiedPolicyEvidencePacketSchema.parse(JSON.parse(body.toString("utf8")));
  } catch {
    throw new TerminalEarlyPolicyEvidenceError(
      "packet_contract_invalid",
      "Early policy evidence packet does not satisfy the verified contract.",
      scanId,
    );
  }
  if (
    packet.contractVersion !== VERIFIED_POLICY_EVIDENCE_PACKET_VERSION ||
    packet.scanId !== scanId ||
    packet.sourceHash !== stringValue(message.sourceHash) ||
    packet.policyContentHash !== stringValue(message.policyContentHash)
  ) {
    throw new TerminalEarlyPolicyEvidenceError(
      "packet_identity_mismatch",
      "Early policy evidence message does not match its retained packet.",
      scanId,
    );
  }
  const { sourceHash, ...unsignedPacket } = packet;
  const computedSourceHash = createHash("sha256")
    .update(JSON.stringify(unsignedPacket))
    .digest("hex");
  if (computedSourceHash !== sourceHash) {
    throw new TerminalEarlyPolicyEvidenceError(
      "packet_source_hash_invalid",
      "Early policy evidence packet source hash did not verify.",
      scanId,
    );
  }
  const existing = await queryOne<{ review_summary: unknown }>(
    `select metadata_json->'reviewSummary' as review_summary from scan_events
      where scan_id = $1::uuid
        and event_type = $2
        and metadata_json->>'sourceHash' = $3
      limit 1`,
    [scanId, POLICY_EVIDENCE_RECEIVED_EVENT_TYPE, packet.sourceHash],
    { readOnly: true },
  );
  if (existing) {
    return { packet, reviewSummary: asRecord(existing.review_summary) };
  }
  const env = getWorkerEnv();
  let reviewSummary: Record<string, unknown> = {
    reviewStatus: "disabled",
  };
  if (env.CERTSCORE_MINI_REVIEW_ENABLED && env.CERTSCORE_PARALLEL_POLICY_REVIEW_ENABLED) {
    const reviewPacket = buildPolicyReviewPacketFromVerifiedPolicyEvidence(packet);
    if (reviewPacket) {
      const review = await runStaticPolicyReviewPacket({
        apiKey: env.OPENAI_API_KEY,
        model: env.CERTSCORE_REVIEW_MODEL,
        packet: reviewPacket,
      });
      reviewSummary = {
        ...review.summary,
        policyContentHash: packet.policyContentHash,
        staticContentHash: review.staticPacket.contentHash,
      };
    } else {
      reviewSummary = { reviewStatus: "skipped", skipReason: "no_usable_policy_documents" };
    }
  }
  await query(
    `insert into scan_events (scan_id, event_type, message, metadata_json)
     values ($1::uuid, $2, $3, $4::jsonb)`,
    [
      scanId,
      POLICY_EVIDENCE_RECEIVED_EVENT_TYPE,
      "Verified policy evidence was retained for non-projectable early semantic review.",
      {
        artifactOnly: true,
        artifactPointer,
        policyContentHash: packet.policyContentHash,
        productionFindingIntegration: false,
        queueRegion: input.queueRegion,
        reviewSummary,
        sourceHash: packet.sourceHash,
      },
    ],
  );
  return { packet, reviewSummary };
}

type PolicyEvidenceProcessingResult = Awaited<ReturnType<typeof processPolicyEvidenceReadyMessageUncoalesced>>;
const policyEvidenceProcessingInFlight = new Map<string, Promise<PolicyEvidenceProcessingResult>>();
const policyEvidenceBackgroundTasks = new Set<Promise<void>>();
const resultFinalizationBackgroundTasks = new Set<Promise<void>>();
const resultFinalizationScanIds = new Set<string>();

async function processPolicyEvidenceReadyMessage(input: {
  queueRegion: string;
  raw: string;
  s3Client?: S3GetClient;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  const message = asRecord(JSON.parse(input.raw));
  const key = `${stringValue(message.scanId) ?? "unknown"}:${stringValue(message.sourceHash) ?? "unknown"}`;
  const existing = policyEvidenceProcessingInFlight.get(key);
  if (existing) return existing;

  const processing = processPolicyEvidenceReadyMessageUncoalesced(input);
  policyEvidenceProcessingInFlight.set(key, processing);
  try {
    return await processing;
  } finally {
    if (policyEvidenceProcessingInFlight.get(key) === processing) {
      policyEvidenceProcessingInFlight.delete(key);
    }
  }
}

function startPolicyEvidenceReadyMessageProcessing(input: {
  client: SQSClient;
  message: Message;
  queueRegion: string;
  queueUrl: string;
  raw: string;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  if (policyEvidenceBackgroundTasks.size >= POLICY_EVIDENCE_BACKGROUND_CONCURRENCY) {
    return false;
  }
  const task = (async () => {
    try {
      await processPolicyEvidenceReadyMessage({
        queueRegion: input.queueRegion,
        raw: input.raw,
        targetEnvironment: input.targetEnvironment,
      });
      await input.client.send(new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: receiptHandle(input.message),
      }));
    } catch (error) {
      const resultTargetEnvironment = getLambdaResultTargetEnvironment(input.raw);
      if (resultTargetEnvironment && resultTargetEnvironment !== input.targetEnvironment) {
        await input.client.send(new ChangeMessageVisibilityCommand({
          QueueUrl: input.queueUrl,
          ReceiptHandle: receiptHandle(input.message),
          VisibilityTimeout: 0,
        }));
        return;
      }
      if (error instanceof TerminalEarlyPolicyEvidenceError) {
        try {
          await recordTerminalPolicyEvidenceRejection({
            error,
            queueRegion: input.queueRegion,
            raw: input.raw,
          });
          await input.client.send(new DeleteMessageCommand({
            QueueUrl: input.queueUrl,
            ReceiptHandle: receiptHandle(input.message),
          }));
          console.warn("[validation-worker] acknowledged terminal early policy evidence rejection", {
            messageId: input.message.MessageId ?? null,
            queueRegion: input.queueRegion,
            reasonCode: error.code,
            scanId: error.scanId,
          });
          return;
        } catch (recordError) {
          console.error("[validation-worker] failed to retain terminal early policy evidence rejection", {
            error: recordError instanceof Error ? recordError.message : String(recordError),
            messageId: input.message.MessageId ?? null,
            queueRegion: input.queueRegion,
            reasonCode: error.code,
            scanId: error.scanId,
          });
          return;
        }
      }
      console.error("[validation-worker] early policy evidence message rejected", {
        error: error instanceof Error ? error.message : String(error),
        messageId: input.message.MessageId ?? null,
        queueRegion: input.queueRegion,
      });
    }
  })();
  policyEvidenceBackgroundTasks.add(task);
  void task
    .finally(() => policyEvidenceBackgroundTasks.delete(task))
    .catch((error) => {
      console.error("[validation-worker] policy evidence background task failed", {
        error: error instanceof Error ? error.message : String(error),
        messageId: input.message.MessageId ?? null,
        queueRegion: input.queueRegion,
      });
    });
  return true;
}

function isUuid(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function recordTerminalPolicyEvidenceRejection(input: {
  error: TerminalEarlyPolicyEvidenceError;
  queueRegion: string;
  raw: string;
}) {
  if (!isUuid(input.error.scanId)) return;
  const message = asRecord(JSON.parse(input.raw));
  const candidateSourceHash = stringValue(message.sourceHash);
  const sourceHash = candidateSourceHash && /^[a-f0-9]{64}$/i.test(candidateSourceHash)
    ? candidateSourceHash
    : null;
  const existingScan = await queryOne<{ id: string }>(
    "select id::text as id from scans where id = $1::uuid limit 1",
    [input.error.scanId],
    { readOnly: true },
  );
  if (!existingScan) return;
  await query(
    `insert into scan_events (scan_id, event_type, message, metadata_json)
     select $1::uuid, $2, $3, $4::jsonb
      where not exists (
        select 1 from scan_events
         where scan_id = $1::uuid
           and event_type = $2
           and metadata_json->>'reasonCode' = $5
           and coalesce(metadata_json->>'sourceHash', '') = coalesce($6, '')
      )`,
    [
      input.error.scanId,
      POLICY_EVIDENCE_REJECTED_EVENT_TYPE,
      "Early policy evidence failed closed before semantic review.",
      {
        artifactOnly: true,
        productionFindingIntegration: false,
        queueRegion: input.queueRegion,
        reasonCode: input.error.code,
        sourceHash,
      },
      input.error.code,
      sourceHash,
    ],
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseScannerRuntimeProvenance(value: unknown): ScannerRuntimeProvenance | undefined {
  const record = asRecord(value);
  const awsRegion =
    record.awsRegion === "eu-central-1" || record.awsRegion === "eu-west-1" || record.awsRegion === "us-west-2"
      ? record.awsRegion
      : null;
  const dispatchVpcMode = record.dispatchVpcMode === "vpc" || record.dispatchVpcMode === "none"
    ? record.dispatchVpcMode
    : null;
  const runtimeVpcMode =
    record.runtimeVpcMode === "vpc" || record.runtimeVpcMode === "none" || record.runtimeVpcMode === "unknown"
      ? record.runtimeVpcMode
      : null;
  if (!awsRegion || !dispatchVpcMode || !runtimeVpcMode) {
    return undefined;
  }
  const imageDigest = stringValue(record.imageDigest);
  const publicIpHash = stringValue(record.publicIpHash);
  return {
    awsRegion,
    dispatchVpcMode,
    ...(stringValue(record.egressId) ? { egressId: (stringValue(record.egressId) as string).slice(0, 128) } : {}),
    ...(stringValue(record.egressProvider)
      ? { egressProvider: (stringValue(record.egressProvider) as string).slice(0, 80) }
      : {}),
    ...(stringValue(record.functionVersion)
      ? { functionVersion: (stringValue(record.functionVersion) as string).slice(0, 80) }
      : {}),
    ...(imageDigest && /^sha256:[a-f0-9]{64}$/i.test(imageDigest) ? { imageDigest } : {}),
    ...(publicIpHash && /^sha256:[a-f0-9]{64}$/i.test(publicIpHash) ? { publicIpHash } : {}),
    runtimeVpcMode
  };
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

export function productionArtifactChainRejectReason(input: {
  artifactMetadata?: Record<string, unknown>;
  artifactPointers?: Record<string, unknown>;
}) {
  const artifactMetadata = input.artifactMetadata ?? {};
  const artifactPointers = input.artifactPointers ?? {};
  for (const field of ["manifestUri", "scanArtifactUri"] as const) {
    const uri = stringValue(artifactPointers[field]);
    if (!uri?.startsWith("s3://")) {
      return `${field} must be a durable s3:// pointer`;
    }
    const metadata = asRecord(artifactMetadata[field]);
    const sha256 = stringValue(metadata.sha256);
    if (!sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) {
      return `${field} must include a SHA-256 checksum`;
    }
    if (typeof metadata.sizeBytes !== "number" || !Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0) {
      return `${field} must include a positive byte size`;
    }
  }
  return null;
}

function parseEmbeddedPolicyEvidenceMessage(input: {
  expectedScanId: string;
  expectedTargetEnvironment: LambdaTargetEnvironment;
  value: unknown;
}): LambdaPolicyEvidenceMessage | undefined {
  if (input.value === undefined || input.value === null) return undefined;
  const record = asRecord(input.value);
  const metadata = asRecord(record.artifactMetadata);
  const scanId = stringValue(record.scanId);
  const targetEnvironment = record.targetEnvironment === "production"
    ? "production"
    : record.targetEnvironment === "local"
      ? "local"
      : null;
  const sha256 = stringValue(metadata.sha256);
  const sizeBytes = typeof metadata.sizeBytes === "number" && Number.isSafeInteger(metadata.sizeBytes)
    ? metadata.sizeBytes
    : null;
  const artifactPointer = stringValue(record.artifactPointer);
  const generatedAt = stringValue(record.generatedAt);
  const policyContentHash = stringValue(record.policyContentHash);
  const sourceHash = stringValue(record.sourceHash);
  if (
    record.artifactOnly !== true ||
    record.productionFindingIntegration !== false ||
    record.contractVersion !== POLICY_EVIDENCE_MESSAGE_VERSION ||
    record.messageKind !== "policy_evidence_ready" ||
    record.processor !== PROCESSOR ||
    scanId !== input.expectedScanId ||
    targetEnvironment !== input.expectedTargetEnvironment ||
    !artifactPointer?.startsWith("s3://") ||
    !generatedAt ||
    !policyContentHash ||
    !sourceHash ||
    !/^[a-f0-9]{64}$/i.test(sourceHash) ||
    !sha256 ||
    !/^[a-f0-9]{64}$/i.test(sha256) ||
    sizeBytes === null ||
    sizeBytes <= 0
  ) {
    throw new Error("Embedded early policy evidence pointer is invalid or does not match its terminal result.");
  }
  return {
    artifactMetadata: { sha256, sizeBytes },
    artifactOnly: true,
    artifactPointer,
    contractVersion: POLICY_EVIDENCE_MESSAGE_VERSION,
    generatedAt,
    messageKind: "policy_evidence_ready",
    policyContentHash,
    processor: PROCESSOR,
    productionFindingIntegration: false,
    scanId,
    sourceHash,
    targetEnvironment,
  };
}

export function parseLambdaResultMessage(
  raw: string,
  expectedTargetEnvironment: LambdaTargetEnvironment
): LambdaResultMessage {
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
  const artifactMetadata = asRecord(record.artifactMetadata);
  const artifactPointers = asRecord(record.artifactPointers);
  const scannerRuntimeProvenance = parseScannerRuntimeProvenance(record.scannerRuntimeProvenance);
  const policyEvidence = parseEmbeddedPolicyEvidenceMessage({
    expectedScanId: scanId,
    expectedTargetEnvironment: targetEnvironment,
    value: record.policyEvidence,
  });
  if (targetEnvironment === "production" && status === "completed") {
    const artifactChainRejectReason = productionArtifactChainRejectReason({ artifactMetadata, artifactPointers });
    if (artifactChainRejectReason) {
      throw new Error(`Production Lambda result artifact chain is not verifiable: ${artifactChainRejectReason}.`);
    }
  }

  return {
    artifactMetadata,
    artifactPointers,
    completedAt,
    ...(errorMessage
      ? { error: { ...(stringValue(errorRecord.code) ? { code: stringValue(errorRecord.code) as string } : {}), message: errorMessage } }
      : {}),
    ...(handlerTiming ? { handlerTiming } : {}),
    phaseTimings: Array.isArray(record.phaseTimings) ? record.phaseTimings : [],
    ...(policyEvidence ? { policyEvidence } : {}),
    scanId,
    ...(stringValue(record.scannerGitSha) ? { scannerGitSha: (stringValue(record.scannerGitSha) as string).slice(0, 80) } : {}),
    ...(stringValue(record.scannerImageTag) ? { scannerImageTag: (stringValue(record.scannerImageTag) as string).slice(0, 160) } : {}),
    ...(scannerRuntimeProvenance ? { scannerRuntimeProvenance } : {}),
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
  const disposition = classifyV2DagLambdaResultDisposition(rawMessage);
  return disposition.kind === "synthetic_verification" ? disposition.scanId : null;
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

async function readVerifiedProductionArtifact(input: {
  expected: Record<string, unknown>;
  label: "manifest" | "scanArtifact";
  s3Client?: S3GetClient;
  uri: string;
}) {
  const expectedSha256 = stringValue(input.expected.sha256);
  const expectedSizeBytes = typeof input.expected.sizeBytes === "number" && Number.isSafeInteger(input.expected.sizeBytes)
    ? input.expected.sizeBytes
    : null;
  if (!expectedSha256 || !/^[a-f0-9]{64}$/i.test(expectedSha256) || expectedSizeBytes === null || expectedSizeBytes <= 0) {
    throw new Error(`Production ${input.label} verification metadata is invalid.`);
  }
  if (expectedSizeBytes > 64 * 1024 * 1024) {
    throw new Error(`Production ${input.label} exceeds the bounded retained-artifact size.`);
  }
  const { bucket, key } = parseS3Uri(input.uri);
  const s3Client = input.s3Client ?? new S3Client({ region: inferS3ArtifactRegion(bucket) });
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (typeof response.ContentLength === "number" && response.ContentLength !== expectedSizeBytes) {
    throw new Error(`Production ${input.label} content length did not verify.`);
  }
  const body = await streamToBuffer(response.Body);
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (body.byteLength !== expectedSizeBytes || sha256 !== expectedSha256) {
    throw new Error(`Production ${input.label} checksum or size did not verify.`);
  }
  return { body, sha256, sizeBytes: body.byteLength };
}

export async function verifyProductionArtifactChain(
  parsedMessage: LambdaResultMessage,
  s3Client?: S3GetClient,
): Promise<VerifiedProductionArtifactChain | null> {
  if (parsedMessage.status !== "completed" || parsedMessage.targetEnvironment !== "production") return null;
  const pointers = parsedMessage.artifactPointers ?? {};
  const metadata = parsedMessage.artifactMetadata ?? {};
  const manifestUri = stringValue(pointers.manifestUri);
  const scanArtifactUri = stringValue(pointers.scanArtifactUri);
  if (!manifestUri || !scanArtifactUri) {
    throw new Error("Production retained-artifact pointers are incomplete.");
  }
  const [manifest, scanArtifact] = await Promise.all([
    readVerifiedProductionArtifact({
      expected: asRecord(metadata.manifestUri),
      label: "manifest",
      s3Client,
      uri: manifestUri,
    }),
    readVerifiedProductionArtifact({
      expected: asRecord(metadata.scanArtifactUri),
      label: "scanArtifact",
      s3Client,
      uri: scanArtifactUri,
    }),
  ]);
  let manifestJson: Record<string, unknown>;
  let scanArtifactJson: Record<string, unknown>;
  try {
    manifestJson = asRecord(JSON.parse(manifest.body.toString("utf8")));
    scanArtifactJson = asRecord(JSON.parse(scanArtifact.body.toString("utf8")));
  } catch {
    throw new Error("Production retained artifacts are not valid JSON.");
  }
  if (
    manifestJson.scanId !== parsedMessage.scanId ||
    manifestJson.processor !== PROCESSOR ||
    manifestJson.targetEnvironment !== parsedMessage.targetEnvironment ||
    scanArtifactJson.scanId !== parsedMessage.scanId
  ) {
    throw new Error("Production retained-artifact identity did not match the Lambda result.");
  }
  return {
    manifest: { sha256: manifest.sha256, sizeBytes: manifest.sizeBytes },
    scanArtifact: { sha256: scanArtifact.sha256, sizeBytes: scanArtifact.sizeBytes },
    verifiedAt: new Date().toISOString(),
  };
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
    fileName.endsWith(".txt") ||
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

export function isRecoverableLateResultFailure(
  eventType: string | null,
  metadata: Record<string, unknown> | null,
) {
  if (eventType === "ops.scan_marked_failed") {
    const reason = stringValue(metadata?.reason);
    return reason === "lambda_terminal_result_absent" ||
      reason === "lambda_terminal_result_absent_after_execution_deadline";
  }
  return eventType === "v2_lambda_dispatch.failed" && metadata?.dispatchState === "uncertain";
}

export async function recordLocalV2DagLambdaResult(
  parsedMessage: LambdaResultMessage,
  options: {
    artifactVerification?: VerifiedProductionArtifactChain | null;
    consumer?: LambdaResultConsumerMetadata;
    s3Client?: S3GetClient;
    workspaceRoot?: string;
  } = {}
) {
  const context = await queryOne<{
    domainId: string | null;
    latestFailureEventType: string | null;
    latestFailureMetadata: Record<string, unknown> | null;
    organizationId: string | null;
    scanConfigJson: Record<string, unknown> | null;
    scanStatus: string;
  }>(
    `select domain_id as "domainId",
            organization_id as "organizationId",
            scan_config_json as "scanConfigJson",
            status as "scanStatus",
            latest_failure.event_type as "latestFailureEventType",
            latest_failure.metadata_json as "latestFailureMetadata"
       from scans
       left join lateral (
         select event_type, metadata_json
           from scan_events
          where scan_id = scans.id
            and event_type in ('ops.scan_marked_failed', 'v2_lambda_dispatch.failed')
          order by created_at desc
          limit 1
       ) latest_failure on true
      where scans.id = $1
      limit 1`,
    [parsedMessage.scanId],
    { readOnly: true }
  );
  if (!context) {
    throw new Error(`Cannot record Lambda result for unknown scan ${parsedMessage.scanId}.`);
  }

  const lateResultRecoverable = parsedMessage.status === "completed" &&
    context.scanStatus === "failed" &&
    (parsedMessage.targetEnvironment === "local" || options.artifactVerification !== null && options.artifactVerification !== undefined) &&
    isRecoverableLateResultFailure(context.latestFailureEventType, context.latestFailureMetadata);
  const acceptedForCanonicalProcessing = parsedMessage.status === "completed" && (
    context.scanStatus === "queued" ||
    context.scanStatus === "running" ||
    context.scanStatus === "completed" ||
    lateResultRecoverable
  );

  const shouldMirrorArtifacts = parsedMessage.targetEnvironment === "local";
  const artifactMirror = shouldMirrorArtifacts
    ? await mirrorLocalV2DagLambdaArtifacts({
        mirrorAuxiliaryArtifacts: false,
        parsedMessage,
        s3Client: options.s3Client,
        workspaceRoot: options.workspaceRoot
      })
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
    if (options.artifactVerification || parsedMessage.policyEvidence) {
      await query(
        `update scan_events
            set metadata_json = metadata_json || jsonb_build_object(
              'artifactVerification', $2::jsonb,
              'policyEvidence', $3::jsonb
            )
          where id = $1`,
        [
          existingEvent.id,
          options.artifactVerification ? JSON.stringify(options.artifactVerification) : null,
          parsedMessage.policyEvidence ? JSON.stringify(parsedMessage.policyEvidence) : null,
        ]
      );
    }
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
          artifactAccess: {
            checksumSource: "lambda_result_artifact_metadata",
            localMirrorRequired: shouldMirrorArtifacts,
            productionReadMode: "verified_s3"
          },
          artifactOnly: true,
          artifactVerification: options.artifactVerification ?? null,
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
            artifactMirrorSkippedReason: shouldMirrorArtifacts ? null : "production_uses_verified_s3",
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
          policyEvidence: parsedMessage.policyEvidence ?? null,
          productionFindingIntegration: false,
          resultStatus: parsedMessage.status,
          ...(parsedMessage.scannerGitSha ? { scannerGitSha: parsedMessage.scannerGitSha } : {}),
          ...(parsedMessage.scannerImageTag ? { scannerImageTag: parsedMessage.scannerImageTag } : {}),
          ...(parsedMessage.scannerRuntimeProvenance
            ? { scannerRuntimeProvenance: parsedMessage.scannerRuntimeProvenance }
            : {}),
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
        set completed_at = case when $3 = 'completed' then $2::timestamptz else coalesce(completed_at, $2::timestamptz) end,
            error_message = case when $3 = 'failed' then $4 else null end,
            egress_id = coalesce($5, egress_id),
            egress_provider = coalesce($6, egress_provider),
            scan_config_json = jsonb_set(
              scan_config_json,
              '{execution,v2DagLambda}',
              coalesce(scan_config_json #> '{execution,v2DagLambda}', '{}'::jsonb) || jsonb_build_object(
                'completedAt', $2::timestamptz,
                'dispatchState', case when $3 = 'failed' then 'failed' else 'completed' end,
                'lateResultRecovered', $8::boolean,
                'runtimeProvenance', $7::jsonb
              ),
              true
            ),
            status = case when $3 = 'failed' then 'failed' else 'completed' end
      where id = $1
        and (status in ('queued', 'running') or $8::boolean)`,
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
      lateResultRecoverable,
    ]
  );
  if (lateResultRecoverable) {
    await query(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       values ($1::uuid, $2::uuid, $3::uuid, 'v2_lambda_result.late_reconciled',
               'A verified late Lambda result recovered a transient scanner-control-plane failure.',
               jsonb_build_object(
                 'priorEventType', $4::text,
                 'priorReason', $5::text,
                 'artifactVerification', $6::jsonb,
                 'processor', $7::text
               ))`,
      [
        parsedMessage.scanId,
        context.domainId,
        context.organizationId,
        context.latestFailureEventType,
        stringValue(context.latestFailureMetadata?.reason) ?? stringValue(context.latestFailureMetadata?.dispatchState),
        options.artifactVerification ? JSON.stringify(options.artifactVerification) : null,
        PROCESSOR,
      ]
    );
  }
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
        parsedMessage.scannerRuntimeProvenance.awsRegion
      ]
    );
  }
  await query(
    `update pulse_requests
        set status = case when $3 = 'failed' then 'failed' else 'completed' end,
            phase = case when $3 = 'failed' then 'failed' else 'completed' end,
            completed_at = case when $3 = 'completed' then $2::timestamptz else coalesce(completed_at, $2::timestamptz) end,
            elapsed_seconds = greatest(0, extract(epoch from (
              case when $3 = 'completed' then $2::timestamptz else coalesce(completed_at, $2::timestamptz) end - requested_at
            ))::int)
      where scan_id = $1::uuid
        and (status in ('queued', 'running', 'finalizing') or $4::boolean)`,
    [parsedMessage.scanId, parsedMessage.completedAt, parsedMessage.status, lateResultRecoverable]
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
  return { acceptedForCanonicalProcessing, lateResultRecoverable };
}

async function persistScannerRuntimeSnapshot(parsedMessage: LambdaResultMessage) {
  if (!parsedMessage.scannerRuntimeProvenance) {
    return;
  }
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
      parsedMessage.scannerRuntimeProvenance.awsRegion
    ]
  );
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

async function processEmbeddedPolicyEvidenceBeforeScoreMaterialization(input: {
  message: LambdaPolicyEvidenceMessage;
  queueRegion: string;
  targetEnvironment: LambdaTargetEnvironment;
}) {
  const raw = JSON.stringify(input.message);
  try {
    await processPolicyEvidenceReadyMessage({
      queueRegion: input.queueRegion,
      raw,
      targetEnvironment: input.targetEnvironment,
    });
  } catch (error) {
    if (error instanceof TerminalEarlyPolicyEvidenceError) {
      await recordTerminalPolicyEvidenceRejection({
        error,
        queueRegion: input.queueRegion,
        raw,
      });
    }
    console.warn("[validation-worker] terminal policy-evidence fallback failed closed", {
      error: error instanceof Error ? error.message : String(error),
      queueRegion: input.queueRegion,
      scanId: input.message.scanId,
    });
  }
}

async function pollOnce(input: {
  client: SQSClient;
  queueUrl: string;
  queueRegion: string;
  targetEnvironment: LambdaTargetEnvironment;
  webBaseUrl?: string;
}) {
  const response = await input.client.send(new ReceiveMessageCommand({
    MessageSystemAttributeNames: [
      "ApproximateReceiveCount",
      "SentTimestamp"
    ] satisfies MessageSystemAttributeName[],
    MaxNumberOfMessages: RESULT_BATCH_CONCURRENCY,
    QueueUrl: input.queueUrl,
    VisibilityTimeout: RESULT_VISIBILITY_TIMEOUT_SECONDS,
    WaitTimeSeconds: 10
  }));
  const messages = response.Messages ?? [];
  const outcomes = await mapWithConcurrency(messages, RESULT_BATCH_CONCURRENCY, async (message) => {
    const rawMessage = messageBody(message);
    if (isPolicyEvidenceReadyMessage(rawMessage)) {
      const started = startPolicyEvidenceReadyMessageProcessing({
        client: input.client,
        message,
        queueRegion: input.queueRegion,
        queueUrl: input.queueUrl,
        raw: rawMessage,
        targetEnvironment: input.targetEnvironment,
      });
      if (!started) {
        await input.client.send(new ChangeMessageVisibilityCommand({
          QueueUrl: input.queueUrl,
          ReceiptHandle: receiptHandle(message),
          VisibilityTimeout: 0,
        }));
      }
      return { deleted: 0, failed: 0, handled: started ? 1 : 0 };
    }
    const disposition = classifyV2DagLambdaResultDisposition(rawMessage);
    if (disposition.kind === "synthetic_verification") {
      await input.client.send(new DeleteMessageCommand({
        QueueUrl: input.queueUrl,
        ReceiptHandle: receiptHandle(message)
      }));
      console.warn("[validation-worker] acknowledged non-persistable v2 DAG Lambda result", {
        disposition: disposition.kind,
        messageId: message.MessageId ?? null,
        queueRegion: input.queueRegion,
        reason: disposition.reason,
        scanId: disposition.scanId
      });
      return { deleted: 1, failed: 0, handled: 0 };
    }
    if (disposition.kind === "invalid") {
      console.error("[validation-worker] rejected invalid v2 DAG Lambda result identity", {
        messageId: message.MessageId ?? null,
        queueRegion: input.queueRegion,
        reason: disposition.reason,
        scanId: disposition.scanId
      });
      return { deleted: 0, failed: 1, handled: 0 };
    }
    try {
      const parsed = parseLambdaResultMessage(rawMessage, input.targetEnvironment);
      const artifactVerification = await verifyProductionArtifactChain(parsed);
      const retention = await recordLocalV2DagLambdaResult(parsed, {
        artifactVerification,
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
      if (parsed.status === "completed" && retention.acceptedForCanonicalProcessing) {
        const started = await startCompletedResultFinalization({
          parsed,
          queueRegion: input.queueRegion,
          webBaseUrl: input.webBaseUrl,
        });
        if (!started) {
          console.info("[validation-worker] deferred persisted Lambda result finalization", {
            queueRegion: input.queueRegion,
            scanId: parsed.scanId,
          });
        }
        return { deleted: 1, failed: 0, handled: 1 };
      }
      return { deleted: 1, failed: 0, handled: 1 };
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
        return { deleted: 0, failed: 0, handled: 0 };
      }
      console.error("[validation-worker] v2 DAG Lambda result message rejected", {
        error: error instanceof Error ? error.message : String(error),
        messageId: message.MessageId ?? null
      });
      return { deleted: 0, failed: 1, handled: 0 };
    }
  });
  const { deleted, failed, handled } = outcomes.reduce(
    (total, outcome) => ({
      deleted: total.deleted + outcome.deleted,
      failed: total.failed + outcome.failed,
      handled: total.handled + outcome.handled
    }),
    { deleted: 0, failed: 0, handled: 0 }
  );

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

async function startCompletedResultFinalization(input: {
  parsed: LambdaResultMessage;
  queueRegion: string;
  webBaseUrl?: string;
}) {
  if (
    resultFinalizationBackgroundTasks.size >= RESULT_FINALIZATION_BACKGROUND_CONCURRENCY ||
    resultFinalizationScanIds.has(input.parsed.scanId) ||
    !(await canonicalReportInputsReady(input.parsed.scanId))
  ) {
    return false;
  }
  resultFinalizationScanIds.add(input.parsed.scanId);
  const task = (async () => {
    try {
      if (input.parsed.policyEvidence) {
        await processEmbeddedPolicyEvidenceBeforeScoreMaterialization({
          message: input.parsed.policyEvidence,
          queueRegion: input.queueRegion,
          targetEnvironment: input.parsed.targetEnvironment,
        });
      }
      await ensureCompletedScanScoresPersisted({
        scanId: input.parsed.scanId,
        targetEnvironment: input.parsed.targetEnvironment,
        webBaseUrl: input.webBaseUrl,
      });
      await persistScannerRuntimeSnapshot(input.parsed);
    } catch (error) {
      console.error("[validation-worker] persisted v2 DAG Lambda result finalization failed", {
        error: error instanceof Error ? error.message : String(error),
        queueRegion: input.queueRegion,
        scanId: input.parsed.scanId,
      });
    }
  })();
  resultFinalizationBackgroundTasks.add(task);
  void task
    .finally(() => {
      resultFinalizationBackgroundTasks.delete(task);
      resultFinalizationScanIds.delete(input.parsed.scanId);
    })
    .catch((error) => {
      console.error("[validation-worker] persisted Lambda result finalization background task failed", {
        error: error instanceof Error ? error.message : String(error),
        queueRegion: input.queueRegion,
        scanId: input.parsed.scanId,
      });
    });
  return true;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
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

export async function reconcilePersistedCompletedResultFinalizations(input: {
  webBaseUrl?: string;
} = {}) {
  const candidates = await query<{
    completed_at: string;
    metadata_json: Record<string, unknown>;
    scan_id: string;
  }>(
    `select distinct on (result.scan_id)
            result.scan_id::text,
            result.metadata_json->>'completedAt' as completed_at,
            result.metadata_json
       from scan_events result
       join scans scan on scan.id = result.scan_id
      where result.event_type = $1
        and result.metadata_json->>'resultStatus' = 'completed'
        and result.created_at >= now() - interval '7 days'
        and scan.status = 'completed'
        and (
          result.metadata_json->>'targetEnvironment' = 'local'
          or result.metadata_json #>> '{artifactVerification,verifiedAt}' is not null
        )
        and exists (
          select 1 from scan_events merged
           where merged.scan_id = result.scan_id
             and merged.event_type = 'signals.merge_completed'
        )
        and exists (
          select 1 from scan_events findings
           where findings.scan_id = result.scan_id
             and findings.event_type = 'findings.unified_derivation_completed'
        )
        and not exists (
          select 1 from scan_score_materialization_requests request
           where request.scan_id = result.scan_id
             and request.status in ('completed', 'terminal_failed')
        )
      order by result.scan_id, result.created_at desc
      limit 25`,
    [RESULT_RECEIVED_EVENT_TYPE],
  );
  let started = 0;
  for (const candidate of candidates.rows) {
    if (resultFinalizationBackgroundTasks.size >= RESULT_FINALIZATION_BACKGROUND_CONCURRENCY) break;
    const metadata = asRecord(candidate.metadata_json);
    const targetEnvironment = metadata.targetEnvironment === "production" ? "production" : "local";
    const policyEvidence = parseEmbeddedPolicyEvidenceMessage({
      expectedScanId: candidate.scan_id,
      expectedTargetEnvironment: targetEnvironment,
      value: metadata.policyEvidence,
    });
    const scannerRuntimeProvenance = parseScannerRuntimeProvenance(metadata.scannerRuntimeProvenance);
    const sqsConsumer = asRecord(metadata.sqsConsumer);
    const queueRegion = stringValue(sqsConsumer.queueRegion) ?? scannerRuntimeProvenance?.awsRegion ?? "unknown";
    const didStart = await startCompletedResultFinalization({
      parsed: {
        completedAt: candidate.completed_at,
        ...(policyEvidence ? { policyEvidence } : {}),
        scanId: candidate.scan_id,
        ...(scannerRuntimeProvenance ? { scannerRuntimeProvenance } : {}),
        status: "completed",
        targetEnvironment,
      },
      queueRegion,
      webBaseUrl: input.webBaseUrl,
    });
    if (didStart) started += 1;
  }
  return started;
}

export async function reconcileOrphanedLocalV2DagLambdaScans(input: {
  delayOlderThanMs?: number;
  terminalOlderThanMs?: number;
} = {}) {
  const delayOlderThanMs = Math.max(30_000, input.delayOlderThanMs ?? ORPHAN_DELAY_AGE_MS);
  const terminalOlderThanMs = Math.max(
    delayOlderThanMs,
    input.terminalOlderThanMs ?? ORPHAN_TERMINAL_AGE_MS,
  );
  const delayed = await query<{ scan_id: string }>(
    `with stale as (
       select s.id, s.domain_id, s.organization_id
         from scans s
        where s.status in ('queued', 'running')
          and s.scan_type = 'full'
          and s.scan_config_json #>> '{execution,v2DagLambda,processor}' = $1
          and coalesce(
                nullif(s.scan_config_json #>> '{execution,v2DagLambda,acceptedAt}', '')::timestamptz,
                s.started_at,
                s.created_at
              ) < now() - ($2::int * interval '1 millisecond')
          and exists (
            select 1 from scan_events accepted
             where accepted.scan_id = s.id
               and accepted.event_type = 'v2_lambda_dispatch.accepted'
          )
          and not exists (
            select 1 from scan_events terminal
             where terminal.scan_id = s.id
               and terminal.event_type in (
                 'v2_lambda_result.received',
                 'v2_lambda_result.failed',
                 'v2_lambda_dispatch.failed',
                 'ops.scan_marked_failed',
                 'v2_lambda_result.delayed'
               )
          )
        order by coalesce(s.started_at, s.created_at)
        limit 25
        for update of s skip locked
     ), updated as (
       update scans s
          set scan_config_json = jsonb_set(
                s.scan_config_json,
                '{execution,v2DagLambda}',
                coalesce(s.scan_config_json #> '{execution,v2DagLambda}', '{}'::jsonb) || jsonb_build_object(
                  'dispatchState', 'delayed',
                  'delayedAt', now(),
                  'delayReason', 'lambda_terminal_result_delayed'
                ),
                true
              ),
              updated_at = now()
         from stale
        where s.id = stale.id
          and s.status in ('queued', 'running')
       returning s.id, stale.domain_id, stale.organization_id
     )
     insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     select id,
            domain_id,
            organization_id,
            'v2_lambda_result.delayed',
            'The scanner result exceeded its expected delivery envelope and remains pending.',
            jsonb_build_object(
              'delayAgeMs', $2::int,
              'reason', 'lambda_terminal_result_delayed',
              'source', 'validation-worker-result-poller'
            )
       from updated
     returning scan_id::text`,
    [PROCESSOR, delayOlderThanMs]
  );
  const failed = await query<{ scan_id: string }>(
    `with stale as (
       select s.id, s.domain_id, s.organization_id
         from scans s
        where s.status in ('queued', 'running')
          and s.scan_type = 'full'
          and s.scan_config_json #>> '{execution,v2DagLambda,processor}' = $1
          and coalesce(
                nullif(s.scan_config_json #>> '{execution,v2DagLambda,acceptedAt}', '')::timestamptz,
                s.started_at,
                s.created_at
              ) < now() - ($2::int * interval '1 millisecond')
          and exists (
            select 1 from scan_events accepted
             where accepted.scan_id = s.id
               and accepted.event_type = 'v2_lambda_dispatch.accepted'
          )
          and not exists (
            select 1 from scan_events terminal
             where terminal.scan_id = s.id
               and terminal.event_type in (
                 'v2_lambda_result.received',
                 'v2_lambda_result.failed',
                 'v2_lambda_dispatch.failed',
                 'ops.scan_marked_failed'
               )
          )
        order by coalesce(s.started_at, s.created_at)
        limit 25
        for update of s skip locked
     ), updated as (
       update scans s
          set status = 'failed',
              completed_at = coalesce(s.completed_at, now()),
              error_message = 'The scanner did not return a terminal result before its execution and delivery deadline. No result was inferred; start a new scan.',
              scan_config_json = jsonb_set(
                s.scan_config_json,
                '{execution,v2DagLambda}',
                coalesce(s.scan_config_json #> '{execution,v2DagLambda}', '{}'::jsonb) || jsonb_build_object(
                  'dispatchState', 'failed',
                  'reconciledAt', now(),
                  'reconciliationReason', 'lambda_terminal_result_absent_after_execution_deadline'
                ),
                true
              ),
              updated_at = now()
         from stale
        where s.id = stale.id
          and s.status in ('queued', 'running')
       returning s.id, stale.domain_id, stale.organization_id
     )
     insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     select id,
            domain_id,
            organization_id,
            'ops.scan_marked_failed',
            'The scanner result remained absent after the execution and delivery deadline.',
            jsonb_build_object(
              'maxTerminalAgeMs', $2::int,
              'reason', 'lambda_terminal_result_absent_after_execution_deadline',
              'source', 'validation-worker-result-poller'
            )
       from updated
     returning scan_id::text`,
    [PROCESSOR, terminalOlderThanMs]
  );
  return { delayed: delayed.rows.length, failed: failed.rows.length };
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

  async function loopQueue(queueUrl: string) {
    const queueRegion = parseQueueRegion(queueUrl);
    let client = clients.get(queueRegion);
    if (!client) {
      client = new SQSClient({ region: queueRegion });
      clients.set(queueRegion, client);
    }
    while (!stopped) {
      try {
        await pollOnce({
          client,
          queueRegion,
          queueUrl,
          targetEnvironment: options.targetEnvironment,
          webBaseUrl: options.webBaseUrl
        });
      } catch (error) {
        console.error("[validation-worker] v2 DAG Lambda result poll failed", {
          error: error instanceof Error ? error.message : String(error),
          queueRegion
        });
      }
      await sleep(options.pollMs);
    }
  }

  async function loopReconciliation() {
    while (!stopped) {
      try {
        const orphaned = await reconcileOrphanedLocalV2DagLambdaScans();
        if (orphaned.delayed > 0 || orphaned.failed > 0) {
          console.warn("[validation-worker] reconciled delayed v2 DAG Lambda scans", orphaned);
        }
        const finalizationsStarted = await reconcilePersistedCompletedResultFinalizations({
          webBaseUrl: options.webBaseUrl,
        });
        if (finalizationsStarted > 0) {
          console.info("[validation-worker] resumed persisted Lambda result finalizations", {
            finalizationsStarted,
          });
        }
      } catch (error) {
        console.error("[validation-worker] v2 DAG Lambda orphan reconciliation failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await sleep(ORPHAN_RECONCILIATION_INTERVAL_MS);
    }
  }

  console.info("[validation-worker] v2 DAG Lambda result poller started", {
    pollMs: options.pollMs,
    pollConcurrency: RESULT_QUEUE_POLL_CONCURRENCY,
    queueRegions: queueUrls.map(parseQueueRegion),
    queueCount: queueUrls.length,
    targetEnvironment: options.targetEnvironment
  });
  for (const queueUrl of queueUrls) {
    for (let pollIndex = 0; pollIndex < RESULT_QUEUE_POLL_CONCURRENCY; pollIndex += 1) {
      void loopQueue(queueUrl);
    }
  }
  void loopReconciliation();

  return {
    stop() {
      stopped = true;
    }
  };
}
