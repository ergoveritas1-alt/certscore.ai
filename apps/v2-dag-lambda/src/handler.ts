import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client, type GetObjectCommandOutput, type PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand, type SendMessageCommandOutput } from "@aws-sdk/client-sqs";
import { createHash } from "node:crypto";
import { request as httpRequest, type ClientRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { chromium } from "playwright";
import {
  VERIFIED_POLICY_EVIDENCE_PACKET_VERSION,
  POST_REFUSAL_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION,
  canonicalEvidenceBundleSchema,
  classifyV2DagLambdaResultDisposition,
  derivePolicySurfaceInspectionOutcome,
  postRefusalEvidencePacketSchema,
  postRefusalLambdaDispatchConfigSchema,
  postRefusalLambdaEvidenceDescriptorSchema,
  verifiedPolicyEvidencePacketSchema,
  type CanonicalEvidenceBundle,
  type ConsentFlowScenario,
  type ScanLaneRun,
  type ScanNoGoAssessment,
  type ScreenshotArtifact,
  type PostRefusalEvidencePacket,
  type PostRefusalLambdaDispatchConfig,
  type PostRefusalLambdaEvidenceDescriptor,
  type VerifiedPolicyEvidencePacket,
  type V2DagLambdaResultPurpose,
} from "@certscore/contracts";
import {
  applyGoverningPolicySelection,
  chromiumContextOptions,
  chromiumLaunchArgs,
  chromiumLaunchOptions,
  buildScanEvidenceLaneAssessment,
  buildCanonicalPostRefusalActionRecipes,
  buildPostRefusalCmpActionRecipe,
  canonicalSha256,
  assertPublicNetworkUrl,
  decidePostRefusalCooperativeAbort,
  isAwsLambdaRuntime,
  lambdaChromiumSingleProcessEnabled,
  mergePolicySurfaceObservations,
  POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS,
  runPostRefusalObserver,
  runScan,
  publicNetworkGuardEnabled,
  type RunScanInput
} from "@certscore/scan-core";
import {
  applyHomepageScreenshotSafetyGate,
  createHomepageScreenshotSafetyReviewCoordinator,
  type HomepageScreenshotSafetyReviewCoordinator,
} from "./screenshot-safety.js";

export const LOCAL_V2_DAG_LAMBDA_AWS_REGIONS = ["eu-central-1", "eu-west-1", "us-west-1"] as const;
export type LocalV2DagLambdaAwsRegion = (typeof LOCAL_V2_DAG_LAMBDA_AWS_REGIONS)[number];
export const LOCAL_V2_DAG_LAMBDA_AWS_REGION = "eu-central-1" satisfies LocalV2DagLambdaAwsRegion;
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";
export const LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
export const LOCAL_V2_DAG_LAMBDA_POLICY_EVIDENCE_MESSAGE_VERSION =
  "certscore.v2.lambda-policy-evidence-ready.v1" as const;
export const LOCAL_V2_DAG_SCAN_PROCESSOR = "local-certscore-v2-dag-parallel-v1";
export const LOCAL_V2_DAG_SCANNER_RUNTIME = "certscore-v2-dag-parallel-path";
export const POST_CONSENT_FLOW_SCANNING_ENABLED = false;
export const POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG =
  "CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED" as const;
export const POST_REFUSAL_REJECT_WORKER_DEFAULT_DISPATCH_DELAY_MS = 500;
export const POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS =
  POST_REFUSAL_CANONICAL_BARRIER_MAX_TAIL_WAIT_MS;
export const LOCAL_V2_DAG_LAMBDA_LANE_TIMING_CONTRACT_VERSION =
  "certscore.v2.lambda-lane-timing.v1" as const;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS = 15_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS = 15_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS = 30_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS = 23_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS = 28_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS = 2_000;
export const LOCAL_V2_DAG_LAMBDA_DURATION_WARNING_MS = 60_000;
export const LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS = 65_000;
export const LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_HANDLER_SAFETY_TIMEOUT_MS = 45_000;
export const LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS = 37_000;
export const LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_ARTIFACT_CHAIN_TIMEOUT_MS = 43_000;
export const LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_HANDLER_SAFETY_TIMEOUT_MS = 55_000;
export const LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS = 47_000;
export const LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_ARTIFACT_CHAIN_TIMEOUT_MS = 53_000;
export const LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS = 2_000;
const LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS = 10_000;
const LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS = 4_000;
const LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_FALLBACK_BUDGET_MS = 6_000;
const LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS = 4_000;
const LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS = 3;
const LOCAL_V2_DAG_LAMBDA_EGRESS_LIGHTWEIGHT_TOTAL_TIMEOUT_MS = 5_000;
const LOCAL_V2_DAG_LAMBDA_PRIMARY_EGRESS_REFLECTOR_URL =
  "https://checkip.amazonaws.com/";
const LOCAL_V2_DAG_LAMBDA_DEFAULT_EGRESS_FALLBACK_URL =
  "https://certscore.ai/.well-known/certscore-egress";

export type LocalV2DagLambdaDispatchPayload = {
  artifactOnly: true;
  awsRegion: LocalV2DagLambdaAwsRegion;
  callbackCorrelationId: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION;
  functionName: string;
  hostname: string;
  localCallbackUrl: string | null;
  orchestrationMode?: "single" | "sharded" | "worker";
  productionFindingIntegration: false;
  profile: "standard" | "tiny";
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  policySurfaceSeeds?: Array<{
    confidence?: number;
    hintType: string;
    source: "prior_scan_hint" | "canonical_legal_surface_hint";
    sourceCompletedAt: string;
    sourceScanId: string;
    url: string;
  }>;
  /** Exact digest of the coordinator dispatch, propagated only to workers. */
  parentDispatchSha256?: string;
  postRefusalObservation?: PostRefusalLambdaDispatchConfig;
  coordinatorPlanSummary?: LocalV2DagLambdaCoordinatorPlanSummary;
  debugOverrides?: LocalV2DagLambdaDebugOverrides;
  resultHandoff: "sqs";
  resultPurpose: V2DagLambdaResultPurpose;
  resultQueueUrl: string;
  scanId: string;
  scannerRuntime: typeof LOCAL_V2_DAG_SCANNER_RUNTIME;
  strongEvidenceMode?: "webmd";
  targetEnvironment: "local" | "production";
  targetUrl: string;
  vpcMode: "none" | "vpc";
  workerLane?: LocalV2DagLambdaWorkerLane;
};

export type LocalV2DagLambdaResultMessage = {
  artifactOnly: true;
  artifactMetadata?: {
    failureDiagnosticUri?: {
      sha256: string;
      sizeBytes: number;
    };
    manifestUri?: {
      sha256: string;
      sizeBytes: number;
    };
    reportAdapterArtifactUri?: {
      sha256: string;
      sizeBytes: number;
    };
    reviewArtifactUri?: {
      sha256: string;
      sizeBytes: number;
    };
    scanArtifactUri?: {
      sha256: string;
      sizeBytes: number;
    };
    postRefusalPacketUri?: {
      sha256: string;
      sizeBytes: number;
    };
  };
  artifactPointers?: {
    failureDiagnosticUri?: string;
    manifestUri?: string;
    reportAdapterArtifactUri?: string;
    reviewArtifactUri?: string;
    scanArtifactUri?: string;
    postRefusalPacketUri?: string;
  };
  completedAt: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION;
  error?: {
    code?: string;
    message: string;
  };
  handlerTiming?: LocalV2DagLambdaHandlerTiming;
  laneTimingSummary?: LocalV2DagLambdaLaneTimingSummary;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
  /**
   * Verified pointer fallback for consumers that receive this terminal message
   * before the separately published early-policy message. This remains
   * artifact-only and non-projectable until matched to terminal evidence.
   */
  policyEvidence?: LocalV2DagLambdaPolicyEvidenceMessage;
  /**
   * Cryptographically binds the optional reject-observation lane evidence to
   * the exact parent dispatch reconciled into this terminal result.
   */
  parentDispatchSha256?: string;
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  productionFindingIntegration: false;
  resultPurpose: V2DagLambdaResultPurpose;
  scanId: string;
  scannerGitSha?: string;
  scannerImageTag?: string;
  scannerRuntimeVersion?: string;
  scannerRuntimeProvenance?: {
    awsRegion: LocalV2DagLambdaAwsRegion;
    dispatchVpcMode: "none" | "vpc";
    egressId?: string;
    egressProvider?: string;
    functionVersion?: string;
    imageDigest?: string;
    publicIpHash?: string;
    runtimeVpcMode: "none" | "unknown" | "vpc";
  };
  status: "completed" | "failed";
  targetEnvironment: "local" | "production";
};

export type LocalV2DagLambdaPolicyEvidenceMessage = {
  artifactMetadata: { sha256: string; sizeBytes: number };
  artifactOnly: true;
  artifactPointer: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_POLICY_EVIDENCE_MESSAGE_VERSION;
  generatedAt: string;
  messageKind: "policy_evidence_ready";
  policyContentHash: string;
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  productionFindingIntegration: false;
  scanId: string;
  sourceHash: string;
  targetEnvironment: "local" | "production";
};

type LocalV2DagLambdaArtifactPointers = NonNullable<LocalV2DagLambdaResultMessage["artifactPointers"]>;
type LocalV2DagLambdaArtifactMetadata = NonNullable<LocalV2DagLambdaResultMessage["artifactMetadata"]>;

export function attachJoinedPostRefusalArtifactPointer<T extends {
    artifactMetadata: LocalV2DagLambdaArtifactMetadata;
    artifactPointers: LocalV2DagLambdaArtifactPointers;
    phaseTimings: LocalV2DagLambdaPhaseTiming[];
  }>(
  artifacts: T,
  result: Pick<LocalV2DagLambdaShardResult, "artifactMetadata" | "artifactPointers">,
): T {
  const packetMetadata = result.artifactMetadata?.postRefusalPacketUri;
  const packetPointer = result.artifactPointers?.postRefusalPacketUri;
  if (!packetMetadata || !packetPointer) return artifacts;
  return {
    ...artifacts,
    artifactMetadata: {
      ...artifacts.artifactMetadata,
      postRefusalPacketUri: packetMetadata,
    },
    artifactPointers: {
      ...artifacts.artifactPointers,
      postRefusalPacketUri: packetPointer,
    },
  } as T;
}
type LocalV2DagLambdaAuxiliaryArtifact = {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  uri: string;
};
type LocalV2DagLambdaPhaseTiming = {
  completedAt?: string;
  durationMs: number;
  label: string;
  memoryAfterMb?: number;
  memoryBeforeMb?: number;
  memoryLimitMb?: number;
  processRssAfterMb?: number;
  processRssBeforeMb?: number;
  startedAt?: string;
  status: "completed" | "failed" | "skipped";
};
type LocalV2DagLambdaHandlerTiming = {
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
export type LocalV2DagLambdaLaneTiming = {
  coordinatorElapsedMs: number | null;
  evidenceJoined: boolean;
  invocationStartedAt: string | null;
  lane: LocalV2DagLambdaEvidenceLane;
  outcome: "completed" | "disabled" | "failed" | "not_applicable" | "timed_out";
  terminalOutcomeDeltaFromPassiveBarrierMs: number | null;
  terminalOutcomeObservedAt: string | null;
  workerReportedCompletedAt: string | null;
  workerReportedHandlerDurationMs: number | null;
};
export type LocalV2DagLambdaLaneTimingSummary = {
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_LANE_TIMING_CONTRACT_VERSION;
  coordinatorStartedAt: string;
  generatedAt: string;
  lanes: LocalV2DagLambdaLaneTiming[];
  maxRejectTailWaitMs: number;
  passiveLaneBarrierCompletedAt: string;
  rejectCompletedBeforeOrAtPassiveBarrier: boolean | null;
  rejectLaneAddedWaitMs: number;
  rejectLaneJoin: "disabled" | "failed" | "joined" | "not_applicable" | "timed_out";
  rejectTailDeltaMs: number | null;
};
type LocalV2DagLambdaWorkerLane =
  | "coordinator"
  | "consent_proof"
  | "runtime_evidence"
  | "policy_evidence"
  | "consent_flows"
  | "accept_gpc"
  | "accept_only"
  | "reject_manage"
  | "reject_observation";
export const LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES = [
  "consent_proof",
  "runtime_evidence",
  "policy_evidence",
] as const satisfies readonly LocalV2DagLambdaWorkerLane[];
type LocalV2DagLambdaEvidenceLane =
  | (typeof LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES)[number]
  | "reject_observation";
type LocalV2DagLambdaDebugOverrides = {
  actionFinalSettleMs?: number;
  actionSearchDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
  lateConsentGateMs?: number;
  expectedConsentScenarios?: ConsentFlowScenario[];
  preActionObservationMs?: number;
  oneTrustHiddenActionMode?: "off" | "diagnostic";
  privacyControlUrls?: string[];
  scenarioConcurrency?: number;
  scenarioResourceMode?: "normal" | "lean" | "cmp_safe";
  strongEvidenceMode?: "webmd";
};
type LocalV2DagLambdaCoordinatorPlanSummary = {
  actionRecipe?: LocalV2DagLambdaConsentActionRecipe;
  artifactVersion: "certscore.v2.lambda.coordinator-plan-summary.v1";
  generatedAt: string;
  plannedScenarios: ConsentFlowScenario[];
  skippedScenarios: Array<{
    reasonCodes: string[];
    scenario: ConsentFlowScenario;
    skipReason: string;
  }>;
};
type LocalV2DagLambdaConsentActionRecipe = {
  artifactVersion: "certscore.v2.consent-action-recipe.v1";
  generatedAt: string;
  normalizedUrl: string;
  scenarios: Array<{
    actionType?: string;
    candidates: Array<{
      actionType?: string;
      confidence?: number;
      frameKind?: string;
      frameUrl?: string;
      labelText: string;
      selectorSummary?: string;
      visible?: boolean;
    }>;
    scenario: string;
    targetUrl?: string;
  }>;
};
type LocalV2DagLambdaShardResult = {
  artifactMetadata?: LocalV2DagLambdaArtifactMetadata;
  artifactPointers?: LocalV2DagLambdaArtifactPointers;
  completedAt?: string;
  coordinatorTiming?: {
    invocationStartedAt: string;
    responseReceivedAt: string;
    durationMs: number;
  };
  handlerTiming?: LocalV2DagLambdaHandlerTiming;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
  postRefusalEvidence?: PostRefusalLambdaEvidenceDescriptor;
  consentRejectAvailability?: {
    inventoryComplete: boolean;
    rejectControlObserved: boolean;
  };
  scanId: string;
  status: "completed" | "failed";
  workerLane: LocalV2DagLambdaWorkerLane;
};

type SqsSendClient = {
  send(command: SendMessageCommand, options?: { abortSignal?: AbortSignal }): Promise<SendMessageCommandOutput>;
};

type S3PutClient = {
  send(command: PutObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<PutObjectCommandOutput>;
};

type S3GetClient = {
  send(command: GetObjectCommand, options?: { abortSignal?: AbortSignal }): Promise<GetObjectCommandOutput>;
};

function localV2DagLambdaS3Client(region: string): S3Client {
  const endpoint = compactString(process.env.S3_ENDPOINT);
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true" ||
    process.env.S3_FORCE_PATH_STYLE === "1";
  const accessKeyId = compactString(process.env.S3_ACCESS_KEY_ID);
  const secretAccessKey = compactString(process.env.S3_SECRET_ACCESS_KEY);
  return new S3Client({
    ...(endpoint ? { endpoint } : {}),
    ...(endpoint || forcePathStyle ? { forcePathStyle } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    region: compactString(process.env.S3_REGION) ?? region,
  });
}

type LambdaInvokeClient = {
  send(command: InvokeCommand, options?: { abortSignal?: AbortSignal }): Promise<InvokeCommandOutput>;
};

type ArtifactChainResult = {
  artifactMetadata?: LocalV2DagLambdaResultMessage["artifactMetadata"];
  artifactPointers?: LocalV2DagLambdaResultMessage["artifactPointers"];
  laneTimingSummary?: LocalV2DagLambdaLaneTimingSummary;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
  postRefusalEvidence?: PostRefusalLambdaEvidenceDescriptor;
};

export type LocalV2DagLambdaRuntimeDiagnostics = ReturnType<typeof buildLocalV2DagLambdaRuntimeDiagnostics>;

type HandlerOptions = {
  artifactChainTimeoutMs?: number;
  awsRequestId?: string;
  handlerSafetyTimeoutMs?: number;
  lambdaClient?: LambdaInvokeClient;
  now?: () => Date;
  resultPublishTimeoutMs?: number;
  runArtifactChain?: (payload: LocalV2DagLambdaDispatchPayload, options: {
    artifactSignal?: AbortSignal;
    allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
    artifactRoot: string;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    physicalInvocationId?: string;
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
    preConsentVisualFallbackDeadlineAtMs?: number;
    signal?: AbortSignal;
  }) => Promise<ArtifactChainResult>;
  scannerWorkTimeoutMs?: number;
  s3GetClient?: S3GetClient;
  s3Client?: S3PutClient;
  sqsClient?: SqsSendClient;
  workspaceRoot?: string;
};

class LocalV2DagLambdaSafetyTimeoutError extends Error {
  readonly code = "v2_dag_lambda_safety_timeout";

  constructor(readonly timeoutMs: number) {
    super(`Scanner exceeded its ${timeoutMs}ms internal safety deadline before the Lambda hard timeout.`);
    this.name = "LocalV2DagLambdaSafetyTimeoutError";
  }
}

async function withHandlerSafetyTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new LocalV2DagLambdaSafetyTimeoutError(timeoutMs));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendWithBoundedRetries<T>(input: {
  attemptTimeoutMs: number;
  maxAttempts: number;
  operation: (signal: AbortSignal) => Promise<T>;
  operationLabel: string;
  signal?: AbortSignal;
  totalTimeoutMs: number;
}): Promise<T> {
  const startedAtMs = Date.now();
  const deadlineAtMs = startedAtMs + Math.max(10, input.totalTimeoutMs);
  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, input.maxAttempts); attempt += 1) {
    if (input.signal?.aborted) {
      throw input.signal.reason instanceof Error
        ? input.signal.reason
        : new Error(`${input.operationLabel} aborted.`);
    }
    const remainingMs = deadlineAtMs - Date.now();
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abortFromParent, { once: true });
    const attemptTimeoutMs = Math.max(10, Math.min(input.attemptTimeoutMs, remainingMs));
    try {
      return await withHandlerSafetyTimeout(
        input.operation(controller.signal),
        attemptTimeoutMs,
        () => controller.abort(new Error(`${input.operationLabel} attempt ${attempt} deadline reached.`)),
      );
    } catch (error) {
      lastError = error;
      if (input.signal?.aborted) {
        throw input.signal.reason instanceof Error ? input.signal.reason : error;
      }
      if (attempt < input.maxAttempts && deadlineAtMs - Date.now() > 10) {
        console.warn("[v2-lambda-aws] bounded send retry", {
          attempt,
          durationMs: Date.now() - startedAtMs,
          error: error instanceof Error ? error.message : String(error),
          operation: input.operationLabel,
        });
      }
    } finally {
      input.signal?.removeEventListener("abort", abortFromParent);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new LocalV2DagLambdaSafetyTimeoutError(Math.max(10, input.totalTimeoutMs));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseDebugOverrides(value: unknown): LocalV2DagLambdaDebugOverrides | undefined {
  const record = asRecord(value);
  const overrides: LocalV2DagLambdaDebugOverrides = {};
  if (record.scenarioResourceMode === "normal" || record.scenarioResourceMode === "lean" || record.scenarioResourceMode === "cmp_safe") {
    overrides.scenarioResourceMode = record.scenarioResourceMode;
  }
  if (record.strongEvidenceMode === "webmd") {
    overrides.strongEvidenceMode = "webmd";
  }
  if (record.oneTrustHiddenActionMode === "off" || record.oneTrustHiddenActionMode === "diagnostic") {
    overrides.oneTrustHiddenActionMode = record.oneTrustHiddenActionMode;
  }
  const privacyControlUrls = boundedDebugUrlList(record.privacyControlUrls, 3);
  if (privacyControlUrls.length > 0) {
    overrides.privacyControlUrls = privacyControlUrls;
  }
  const expectedConsentScenarios = parseConsentFlowScenarioList(record.expectedConsentScenarios)
    .filter((scenario) =>
      scenario === "accept_all_flow" ||
      scenario === "reject_all_flow" ||
      scenario === "privacy_opt_out_flow"
    )
    .slice(0, 4);
  if (expectedConsentScenarios.length > 0) {
    overrides.expectedConsentScenarios = [...new Set(expectedConsentScenarios)];
  }
  const actionFinalSettleMs = boundedDebugInteger(record.actionFinalSettleMs, 350, 10_000);
  if (actionFinalSettleMs !== undefined) {
    overrides.actionFinalSettleMs = actionFinalSettleMs;
  }
  const actionSearchDeadlineMs = boundedDebugInteger(record.actionSearchDeadlineMs, 1_000, 20_000);
  if (actionSearchDeadlineMs !== undefined) {
    overrides.actionSearchDeadlineMs = actionSearchDeadlineMs;
  }
  const consentFlowDeadlineMs = boundedDebugInteger(record.consentFlowDeadlineMs, 10_000, 90_000);
  if (consentFlowDeadlineMs !== undefined) {
    overrides.consentFlowDeadlineMs = consentFlowDeadlineMs;
  }
  const lateConsentGateMs = boundedDebugInteger(record.lateConsentGateMs, 3_000, 10_000);
  if (lateConsentGateMs !== undefined) {
    overrides.lateConsentGateMs = lateConsentGateMs;
  }
  const preActionObservationMs = boundedDebugInteger(record.preActionObservationMs, 0, 12_000);
  if (preActionObservationMs !== undefined) {
    overrides.preActionObservationMs = preActionObservationMs;
  }
  const scenarioConcurrency = boundedDebugInteger(record.scenarioConcurrency, 1, 4);
  if (scenarioConcurrency !== undefined) {
    overrides.scenarioConcurrency = scenarioConcurrency;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function boundedDebugInteger(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : undefined;
}

function boundedDebugUrlList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const urls: string[] = [];
  for (const entry of value) {
    const raw = compactString(entry);
    if (!raw) {
      continue;
    }
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        continue;
      }
      urls.push(url.toString());
    } catch {
      continue;
    }
    if (urls.length >= max) {
      break;
    }
  }
  return [...new Set(urls)];
}

function requireString(record: Record<string, unknown>, field: string) {
  const value = compactString(record[field]);
  if (!value) {
    throw new Error(`Local v2 DAG Lambda dispatch is missing ${field}.`);
  }
  return value;
}

function parseAwsRegion(value: unknown): LocalV2DagLambdaAwsRegion {
  if (typeof value === "string" && LOCAL_V2_DAG_LAMBDA_AWS_REGIONS.includes(value as LocalV2DagLambdaAwsRegion)) {
    return value as LocalV2DagLambdaAwsRegion;
  }
  throw new Error("Local v2 DAG Lambda dispatch must target eu-central-1, eu-west-1, or us-west-1.");
}

function parseQueueRegion(queueUrl: string): LocalV2DagLambdaAwsRegion {
  try {
    const hostname = new URL(queueUrl).hostname;
    const match = hostname.match(/^sqs\.([a-z0-9-]+)\.amazonaws\.com$/);
    return parseAwsRegion(match?.[1]);
  } catch {
    return LOCAL_V2_DAG_LAMBDA_AWS_REGION;
  }
}

export function parseLocalV2DagLambdaDispatchPayload(event: unknown): LocalV2DagLambdaDispatchPayload {
  const record = asRecord(typeof event === "string" ? JSON.parse(event) : event);
  const scanId = requireString(record, "scanId");
  const resultDisposition = classifyV2DagLambdaResultDisposition({
    resultPurpose: record.resultPurpose,
    scanId,
  });
  if (resultDisposition.kind === "invalid") {
    throw new Error(`Local v2 DAG Lambda dispatch has an invalid result identity: ${resultDisposition.reason}.`);
  }
  const coordinatorPlanSummary = parseCoordinatorPlanSummary(record.coordinatorPlanSummary);
  const debugOverrides = parseDebugOverrides(record.debugOverrides);
  const policySurfaceSeeds = parsePolicySurfaceSeeds(record.policySurfaceSeeds);
  const postRefusalObservation = record.postRefusalObservation === undefined
    ? undefined
    : postRefusalLambdaDispatchConfigSchema.parse(record.postRefusalObservation);
  const parentDispatchSha256 = compactString(record.parentDispatchSha256);
  if (parentDispatchSha256 && !/^[a-f0-9]{64}$/.test(parentDispatchSha256)) {
    throw new Error("Local v2 DAG Lambda parent dispatch checksum is invalid.");
  }
  const payload: LocalV2DagLambdaDispatchPayload = {
    artifactOnly: true,
    awsRegion: parseAwsRegion(record.awsRegion),
    callbackCorrelationId: requireString(record, "callbackCorrelationId"),
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: requireString(record, "functionName"),
    hostname: requireString(record, "hostname"),
    localCallbackUrl: compactString(record.localCallbackUrl),
    ...(record.orchestrationMode === "sharded" || record.orchestrationMode === "worker" || record.orchestrationMode === "single"
      ? { orchestrationMode: record.orchestrationMode }
      : {}),
    productionFindingIntegration: false,
    profile: record.profile === "tiny" ? "tiny" : "standard",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    ...(policySurfaceSeeds.length > 0 ? { policySurfaceSeeds } : {}),
    ...(parentDispatchSha256 ? { parentDispatchSha256 } : {}),
    ...(postRefusalObservation ? { postRefusalObservation } : {}),
    ...(coordinatorPlanSummary ? { coordinatorPlanSummary } : {}),
    ...(debugOverrides ? { debugOverrides } : {}),
    resultHandoff: "sqs",
    resultPurpose: resultDisposition.kind,
    resultQueueUrl: requireString(record, "resultQueueUrl"),
    scanId,
    scannerRuntime: LOCAL_V2_DAG_SCANNER_RUNTIME,
    ...(record.strongEvidenceMode === "webmd" || asRecord(record.debugOverrides).strongEvidenceMode === "webmd" ? { strongEvidenceMode: "webmd" as const } : {}),
    targetEnvironment: record.targetEnvironment === "production" ? "production" : "local",
    targetUrl: requireString(record, "targetUrl"),
    vpcMode: record.vpcMode === "vpc" ? "vpc" : "none",
    ...(isWorkerLane(record.workerLane) ? { workerLane: record.workerLane } : {})
  };

  if (record.contractVersion !== LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION) {
    throw new Error("Unsupported local v2 DAG Lambda dispatch contract version.");
  }
  if (record.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    throw new Error("Local v2 DAG Lambda dispatch came from an unexpected processor.");
  }
  if (record.scannerRuntime !== LOCAL_V2_DAG_SCANNER_RUNTIME) {
    throw new Error("Local v2 DAG Lambda dispatch must use the v2 DAG parallel-path scanner runtime.");
  }
  if (record.resultHandoff !== "sqs") {
    throw new Error("Local v2 DAG Lambda dispatch must hand results back through SQS.");
  }
  if (record.vpcMode !== "none" && record.vpcMode !== "vpc") {
    throw new Error("Local v2 DAG Lambda dispatch must declare a supported network mode.");
  }
  if (record.artifactOnly !== true || record.productionFindingIntegration !== false) {
    throw new Error("Local v2 DAG Lambda dispatch must remain artifact-only and non-production.");
  }
  if (payload.orchestrationMode === "worker" && !payload.workerLane) {
    throw new Error("Local v2 DAG Lambda worker dispatch requires a workerLane.");
  }
  if (payload.workerLane === "reject_observation" && !payload.parentDispatchSha256) {
    throw new Error("Reject-observation worker dispatch requires the exact parent dispatch checksum.");
  }

  return payload;
}

export function unwrapLocalV2DagLambdaDispatchEvent(event: unknown) {
  const record = asRecord(event);
  if (!Array.isArray(record.Records)) {
    return { payload: event, transport: "direct" as const };
  }
  if (record.Records.length !== 1) {
    throw new Error("Regional scanner dispatch requires exactly one FIFO SQS record per invocation.");
  }
  const sqsRecord = asRecord(record.Records[0]);
  if (sqsRecord.eventSource !== "aws:sqs" || typeof sqsRecord.body !== "string") {
    throw new Error("Regional scanner dispatch received an invalid SQS event envelope.");
  }
  return {
    payload: JSON.parse(sqsRecord.body) as unknown,
    transport: "sqs_fifo" as const,
  };
}

function parsePolicySurfaceSeeds(value: unknown): NonNullable<LocalV2DagLambdaDispatchPayload["policySurfaceSeeds"]> {
  if (!Array.isArray(value)) return [];
  const selected = new Map<string, NonNullable<LocalV2DagLambdaDispatchPayload["policySurfaceSeeds"]>[number]>();
  for (const item of value.slice(0, 24)) {
    const record = asRecord(item);
    const hintType = compactString(record.hintType);
    const source = record.source;
    const sourceCompletedAt = compactString(record.sourceCompletedAt);
    const sourceScanId = compactString(record.sourceScanId);
    const rawUrl = compactString(record.url);
    if (
      !hintType ||
      !["privacy_policy", "cookie_policy", "privacy_choice", "consent_preferences"].includes(hintType) ||
      (source !== "prior_scan_hint" && source !== "canonical_legal_surface_hint") ||
      !sourceCompletedAt ||
      !Number.isFinite(Date.parse(sourceCompletedAt)) ||
      !sourceScanId ||
      !rawUrl
    ) continue;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      parsed.hash = "";
      const url = parsed.toString();
      if (!selected.has(url)) {
        selected.set(url, {
          ...(typeof record.confidence === "number" && Number.isFinite(record.confidence)
            ? { confidence: Math.max(0, Math.min(1, record.confidence)) }
            : {}),
          hintType,
          source,
          sourceCompletedAt: new Date(sourceCompletedAt).toISOString(),
          sourceScanId: sourceScanId.slice(0, 160),
          url,
        });
      }
    } catch {
      // Ignore malformed hints. They are acceleration inputs, never evidence.
    }
    if (selected.size >= 12) break;
  }
  return [...selected.values()];
}

function isWorkerLane(value: unknown): value is LocalV2DagLambdaWorkerLane {
  return value === "coordinator" ||
    value === "consent_proof" ||
    value === "runtime_evidence" ||
    value === "policy_evidence" ||
    value === "consent_flows" ||
    value === "accept_gpc" ||
    value === "accept_only" ||
    value === "reject_manage" ||
    value === "reject_observation";
}

export function isPostRefusalRejectWorkerEnabled(
  payload: Pick<LocalV2DagLambdaDispatchPayload, "postRefusalObservation">,
  environment: NodeJS.ProcessEnv = process.env,
) {
  return payload.postRefusalObservation?.enabled === true &&
    environment[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] === "1";
}

function parseCoordinatorPlanSummary(value: unknown): LocalV2DagLambdaCoordinatorPlanSummary | undefined {
  const record = asRecord(value);
  if (record.artifactVersion !== "certscore.v2.lambda.coordinator-plan-summary.v1") {
    return undefined;
  }
  const actionRecipe = parseConsentActionRecipe(record.actionRecipe);
  return {
    ...(actionRecipe ? { actionRecipe } : {}),
    artifactVersion: "certscore.v2.lambda.coordinator-plan-summary.v1",
    generatedAt: compactString(record.generatedAt) ?? new Date(0).toISOString(),
    plannedScenarios: parseConsentFlowScenarioList(record.plannedScenarios),
    skippedScenarios: Array.isArray(record.skippedScenarios)
      ? record.skippedScenarios.flatMap((entry) => {
        const skipped = asRecord(entry);
        const scenario = parseConsentFlowScenario(skipped.scenario);
        const skipReason = compactString(skipped.skipReason);
        if (!scenario || !skipReason) {
          return [];
        }
        return [{
          reasonCodes: Array.isArray(skipped.reasonCodes)
            ? skipped.reasonCodes.flatMap((reason) => compactString(reason) ?? []).slice(0, 12)
            : [],
          scenario,
          skipReason: skipReason.slice(0, 80)
        }];
      }).slice(0, 12)
      : []
  };
}

function parseConsentActionRecipe(value: unknown): LocalV2DagLambdaConsentActionRecipe | undefined {
  const record = asRecord(value);
  if (record.artifactVersion !== "certscore.v2.consent-action-recipe.v1") {
    return undefined;
  }
  const normalizedUrl = compactString(record.normalizedUrl);
  if (!normalizedUrl) {
    return undefined;
  }
  const scenarios = Array.isArray(record.scenarios)
    ? record.scenarios.flatMap((entry) => {
      const scenario = asRecord(entry);
      const scenarioName = compactString(scenario.scenario);
      if (!scenarioName) {
        return [];
      }
      return [{
        ...(compactString(scenario.actionType) ? { actionType: compactString(scenario.actionType) ?? undefined } : {}),
        candidates: parseConsentActionRecipeCandidates(scenario.candidates),
        scenario: scenarioName.slice(0, 80),
        ...(compactString(scenario.targetUrl) ? { targetUrl: compactString(scenario.targetUrl) ?? undefined } : {})
      }];
    }).slice(0, 8)
    : [];
  return {
    artifactVersion: "certscore.v2.consent-action-recipe.v1",
    generatedAt: compactString(record.generatedAt) ?? new Date(0).toISOString(),
    normalizedUrl,
    scenarios
  };
}

function parseConsentActionRecipeCandidates(value: unknown): LocalV2DagLambdaConsentActionRecipe["scenarios"][number]["candidates"] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const candidate = asRecord(entry);
      const labelText = compactString(candidate.labelText);
      if (!labelText) {
        return [];
      }
      return [{
        ...(compactString(candidate.actionType) ? { actionType: compactString(candidate.actionType) ?? undefined } : {}),
        ...(typeof candidate.confidence === "number" ? { confidence: Math.max(0, Math.min(1, candidate.confidence)) } : {}),
        ...(compactString(candidate.frameKind) ? { frameKind: compactString(candidate.frameKind) ?? undefined } : {}),
        ...(compactString(candidate.frameUrl) ? { frameUrl: compactString(candidate.frameUrl) ?? undefined } : {}),
        labelText: labelText.slice(0, 160),
        ...(compactString(candidate.selectorSummary) ? { selectorSummary: compactString(candidate.selectorSummary) ?? undefined } : {}),
        ...(typeof candidate.visible === "boolean" ? { visible: candidate.visible } : {})
      }];
    }).slice(0, 24)
    : [];
}

function parseConsentFlowScenarioList(value: unknown): ConsentFlowScenario[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => parseConsentFlowScenario(entry) ?? [])
    : [];
}

function parseConsentFlowScenario(value: unknown): ConsentFlowScenario | undefined {
  return typeof value === "string" && [
    "baseline_pre_consent",
    "gpc_enabled",
    "reject_all_flow",
    "accept_all_flow",
    "privacy_opt_out_flow",
    "form_collection_probe",
    "accessibility_probe"
  ].includes(value)
    ? value as ConsentFlowScenario
    : undefined;
}

export function buildLocalV2DagLambdaArtifactRoot(input: {
  artifactBaseDir?: string;
  scanId: string;
  workspaceRoot: string;
}) {
  const baseDir = input.artifactBaseDir ?? process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR ?? "/tmp/certscore-v2-dag-lambda";
  return path.resolve(input.workspaceRoot, baseDir, input.scanId);
}

function sanitizedLaneUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.username = "";
    url.password = "";
    url.hash = "";
    url.search = "";
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

export function buildLocalV2DagLambdaLaneRun(input: {
  bundle: CanonicalEvidenceBundle;
  physicalInvocationId?: string;
  region: string;
  workerLane?: LocalV2DagLambdaWorkerLane;
}): ScanLaneRun | null {
  const laneId = input.workerLane === "consent_proof" ||
      input.workerLane === "runtime_evidence" ||
      input.workerLane === "policy_evidence"
    ? input.workerLane
    : null;
  if (!laneId) return null;

  const phaseName = laneId === "policy_evidence"
    ? "policySurfaceScanner" as const
    : "preConsentRuntimeScanner" as const;
  const moduleRun = input.bundle.modulesRun.find((run) => run.moduleName === phaseName);
  if (!moduleRun) return null;

  const siteFacingNavigation = moduleRun.siteFacingNavigation;
  const mainDocumentRequestIds = new Set(input.bundle.networkEvents
    .filter((event) => event.isMainFrame === true && event.resourceType === "document")
    .flatMap((event) => event.requestId ? [event.requestId] : []));
  const firstTopLevelResponse = [...input.bundle.networkResponseEvents]
    .filter((event) => Boolean(event.requestId && mainDocumentRequestIds.has(event.requestId)))
    .sort((left, right) => left.timestampMs - right.timestampMs)[0];
  const bundleStartedAtMs = Date.parse(input.bundle.startedAt);
  const derivedFirstResponseAt = firstTopLevelResponse && Number.isFinite(bundleStartedAtMs)
    ? new Date(bundleStartedAtMs + firstTopLevelResponse.timestampMs).toISOString()
    : null;
  const firstResponseAt = siteFacingNavigation?.firstResponseAt ?? derivedFirstResponseAt;
  const firstResponseOffsetMs = siteFacingNavigation?.firstResponseOffsetMs ??
    (firstTopLevelResponse ? Math.max(0, Math.round(firstTopLevelResponse.timestampMs)) : null);
  const firstHttpStatus = siteFacingNavigation?.firstHttpStatus ?? firstTopLevelResponse?.status ?? null;
  const firstEffectiveUrl = sanitizedLaneUrl(
    siteFacingNavigation?.firstEffectiveUrl ?? firstTopLevelResponse?.responseUrl,
  );
  const navigationCount = siteFacingNavigation?.navigationCount ??
    moduleRun.recoveryDiagnostics?.attempts?.length ??
    (firstTopLevelResponse ? 1 : 0);
  const navigationAttempts = (moduleRun.recoveryDiagnostics?.attempts ?? []).map((attempt, index) => ({
    sequence: index + 1,
    mode: attempt.mode,
    outcome: attempt.outcome,
    httpStatus: attempt.httpStatus ?? null,
    durationMs: attempt.durationMs,
    effectiveUrl: sanitizedLaneUrl(attempt.url),
  }));
  const noGoReason = input.bundle.scanNoGoAssessment?.reasonCodes[0] ?? null;
  const challengeDetected = siteFacingNavigation?.challengeDetected ?? Boolean(
    input.bundle.scanNoGoAssessment?.supportingSignals.challengeSignalsDetected ||
    noGoReason === "captcha_or_challenge" ||
    noGoReason === "potential_security_challenge"
  );
  const challengeType = siteFacingNavigation?.challengeType ?? (challengeDetected ? noGoReason : null);
  const executionOutcome: ScanLaneRun["executionOutcome"] = moduleRun.status === "completed"
    ? "success"
    : moduleRun.status === "failed" || moduleRun.status === "not_testable"
      ? "failed"
      : "degraded";
  const accessOutcome: ScanLaneRun["accessOutcome"] = challengeDetected
    ? "bot_challenge"
    : noGoReason === "access_denied_or_forbidden_page" ||
        noGoReason === "rate_limited_429" ||
        firstHttpStatus === 401 || firstHttpStatus === 403 || firstHttpStatus === 429 || firstHttpStatus === 451
      ? "access_denied"
      : noGoReason === "blank_or_unusable_page" || noGoReason === "loading_or_stalled"
        ? "blank_or_unusable"
        : executionOutcome === "failed" && firstHttpStatus === null
          ? "navigation_failed"
          : firstHttpStatus !== null && firstHttpStatus >= 200 && firstHttpStatus < 400
            ? "representative_page"
            : "unknown";
  const completedAt = moduleRun.completedAt ?? null;
  const durationMs = moduleRun.durationMs ?? (
    completedAt && Number.isFinite(Date.parse(completedAt)) && Number.isFinite(Date.parse(moduleRun.startedAt))
      ? Math.max(0, Date.parse(completedAt) - Date.parse(moduleRun.startedAt))
      : 0
  );
  const fallbackInvocationId = `local_${createHash("sha256")
    .update(`${input.bundle.scanId}:${laneId}:${moduleRun.startedAt}`)
    .digest("hex")
    .slice(0, 32)}`;

  return {
    laneId,
    physicalInvocationId: (input.physicalInvocationId?.trim() || fallbackInvocationId).slice(0, 160),
    region: input.region.slice(0, 80),
    phaseName,
    startedAt: moduleRun.startedAt,
    firstResponseAt,
    firstResponseOffsetMs,
    firstHttpStatus,
    firstEffectiveUrl,
    navigationCount,
    navigationAttempts,
    challengeDetected,
    challengeType,
    executionOutcome,
    accessOutcome,
    completedAt,
    durationMs,
  };
}

export async function runLocalV2DagLambdaArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    allowedConsentFlowScenarios?: ConsentFlowScenario[];
    artifactSignal?: AbortSignal;
    allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
    artifactRoot: string;
    externalBaselinePlanning?: "enrich" | "reuse_only";
    forceAllowedScenarioPlanning?: boolean;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    physicalInvocationId?: string;
    phaseLabelPrefix?: string;
    preConsentScreenshotMode?: "always" | "selective" | "never";
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
    preConsentVisualFallbackDeadlineAtMs?: number;
    s3Client?: S3PutClient;
    signal?: AbortSignal;
    workspaceRoot?: string;
  }
): Promise<{
  artifactMetadata: LocalV2DagLambdaArtifactMetadata;
  artifactPointers: LocalV2DagLambdaArtifactPointers;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
  shards?: LocalV2DagLambdaShardResult[];
}> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const artifactRoot = path.resolve(workspaceRoot, options.artifactRoot);
  const phaseTimings: LocalV2DagLambdaPhaseTiming[] = [];
  const scanTuning = buildLocalV2DagLambdaScanTuning();
  await mkdir(artifactRoot, { recursive: true });
  const screenshotSafetyReviewCoordinator = createHomepageScreenshotSafetyReviewCoordinator({
    artifactRoot,
    signal: options.artifactSignal ?? options.signal,
  });
  const egressPreflightPromise = timeLambdaPhase(
    phaseTimings,
    "egress_preflight",
    () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: false }),
  );
  const scanBundlePromise = runLocalV2DagLambdaScanBundle(payload, {
    allowRuntimeEvidenceFinalizationAfterAbort: options.allowRuntimeEvidenceFinalizationAfterAbort,
    artifactRoot,
    phaseLabelPrefix: options.phaseLabelPrefix,
    phaseTimings,
    preConsentScreenshotMode: options.preConsentScreenshotMode ?? scanTuning.preConsentScreenshotMode,
    preConsentModuleDeadlineMs: options.preConsentModuleDeadlineMs,
    preConsentVisualFallbackDeadlineMs: options.preConsentVisualFallbackDeadlineMs,
    preConsentVisualFallbackDeadlineAtMs: options.preConsentVisualFallbackDeadlineAtMs,
    onScanCoreComplete: options.onScanCoreComplete,
    onPolicySurfaceComplete: options.onPolicySurfaceComplete,
    physicalInvocationId: options.physicalInvocationId,
    scanTuning,
    screenshotSafetyReviewCoordinator,
    signal: options.signal,
    policySurfaceDeadlineAtMs: options.policySurfaceDeadlineAtMs,
  });
  const [egressAvailable, bundle] = await Promise.all([egressPreflightPromise, scanBundlePromise]);
  if (!egressAvailable) {
    const browserFallbackAvailable = await timeLambdaPhase(
      phaseTimings,
      "egress_preflight_browser_fallback",
      () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: true, skipLightweightProbe: true }),
    );
    if (!browserFallbackAvailable && regionalEgressRequired(process.env)) {
      throw new Error("Required regional scanner egress preflight did not verify the configured proxy and expected public region.");
    }
  }

  const artifacts = await writeAndUploadLocalV2DagLambdaArtifacts({
    artifactRoot,
    bundle,
    payload,
    phaseTimings,
    s3Client: options.s3Client,
    scanTuning,
    screenshotSafetyReviewCoordinator,
    signal: options.artifactSignal ?? options.signal
  });
  return artifacts;
}

async function runLocalV2DagLambdaScanBundle(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    allowRuntimeEvidenceFinalizationAfterAbort?: boolean;
    artifactRoot: string;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    physicalInvocationId?: string;
    phaseLabelPrefix?: string;
    phaseTimings: LocalV2DagLambdaPhaseTiming[];
    preConsentScreenshotMode?: "always" | "selective" | "never";
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
    preConsentVisualFallbackDeadlineAtMs?: number;
    scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
    screenshotSafetyReviewCoordinator: HomepageScreenshotSafetyReviewCoordinator;
    signal?: AbortSignal;
  }
) {
  return timeLambdaPhase(options.phaseTimings, phaseLabel(options.phaseLabelPrefix, "scan"), async () => {
    const resourceSampler = startRuntimeResourceSampler();
    const evidenceLane: NonNullable<RunScanInput["evidenceLane"]> =
      payload.workerLane === "consent_proof"
        ? "consent_proof"
        : payload.workerLane === "runtime_evidence"
          ? "runtime_evidence"
          : payload.workerLane === "policy_evidence"
            ? "policy_evidence"
            : "combined";
    try {
      const bundle = await runScan({
        allowRuntimeEvidenceFinalizationAfterAbort: options.allowRuntimeEvidenceFinalizationAfterAbort,
        browserReuseMode: "per_module",
        evidenceLane,
        outDir: options.artifactRoot,
        onPreConsentScreenshotCaptured: options.screenshotSafetyReviewCoordinator.schedule,
        onPolicySurfaceComplete: options.onPolicySurfaceComplete,
        policyOutputGraceMs: 1_000,
        policyPlanningDeadlineMs: 1_500,
        policySurfaceDeadlineAtMs: options.policySurfaceDeadlineAtMs,
        policySurfaceSeeds: payload.policySurfaceSeeds,
        postConsentFlowsEnabled: false,
        preConsentModuleDeadlineMs: options.preConsentModuleDeadlineMs,
        preConsentScreenshotMode: evidenceLane === "runtime_evidence" || evidenceLane === "policy_evidence"
          ? "never"
          : options.preConsentScreenshotMode,
        preConsentScreenshotTimeoutMs: options.scanTuning.preConsentScreenshotTimeoutMs,
        lateConsentGateMs: payload.targetEnvironment === "local"
          ? payload.debugOverrides?.lateConsentGateMs
          : undefined,
        preConsentVisualFallbackDeadlineMs:
          options.preConsentVisualFallbackDeadlineMs ?? options.scanTuning.preConsentVisualFallbackDeadlineMs,
        preConsentVisualFallbackDeadlineAtMs: options.preConsentVisualFallbackDeadlineAtMs,
        profile: payload.profile,
        region: payload.awsRegion,
        scenarioPlanningMode: "planned_parallel",
        scenarioResourceMode: effectiveScenarioResourceMode(payload, options.scanTuning),
        signal: options.signal,
        url: payload.targetUrl
      });
      options.onScanCoreComplete?.();
      const laneRun = buildLocalV2DagLambdaLaneRun({
        bundle,
        physicalInvocationId: options.physicalInvocationId,
        region: payload.awsRegion,
        workerLane: payload.workerLane,
      });
      return laneRun
        ? canonicalEvidenceBundleSchema.parse({
            ...bundle,
            scanLaneRuns: [...bundle.scanLaneRuns, laneRun],
          })
        : bundle;
    } finally {
      const telemetry = await resourceSampler.stop();
      await writeJson(path.join(options.artifactRoot, "V2RuntimeResourceTelemetry.json"), {
        artifactVersion: "certscore.v2_runtime_resource_telemetry.1",
        artifactOnly: true,
        browserIsolation: "per_module_context_isolation",
        generatedAt: new Date().toISOString(),
        maxConcurrentBrowserProcesses: 2,
        policyRenderedFallbackConcurrency: 1,
        productionFindingIntegration: false,
        ...telemetry,
      });
    }
  });
}

async function writeAndUploadLocalV2DagLambdaArtifacts(input: {
  artifactRoot: string;
  bundle: CanonicalEvidenceBundle;
  joinedPostRefusalArtifact?: Pick<LocalV2DagLambdaShardResult, "artifactMetadata" | "artifactPointers">;
  laneTimingSummary?: LocalV2DagLambdaLaneTimingSummary;
  payload: LocalV2DagLambdaDispatchPayload;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
  s3Client?: S3PutClient;
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
  screenshotSafetyReviewCoordinator?: HomepageScreenshotSafetyReviewCoordinator;
  signal?: AbortSignal;
}): Promise<{
  artifactMetadata: LocalV2DagLambdaArtifactMetadata;
  artifactPointers: LocalV2DagLambdaArtifactPointers;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
}> {
  const { artifactRoot, payload, phaseTimings, scanTuning } = input;
  const bundle = await timeLambdaPhase(
    phaseTimings,
    "screenshot_safety_gate",
    () => applyHomepageScreenshotSafetyGate({
      artifactRoot,
      bundle: input.bundle,
      reviewCoordinator: input.screenshotSafetyReviewCoordinator,
      signal: input.signal,
    }),
  );
  const scanArtifactPath = path.join(artifactRoot, "CanonicalEvidenceBundle.json");
  // The retained bundle remains byte-for-byte complete JSON, but compact
  // encoding avoids transferring hundreds of kilobytes of indentation to each
  // downstream verifier and projector.
  await timeLambdaPhase(phaseTimings, "scan_artifact_write", () => writeCompactJson(scanArtifactPath, bundle));

  const manifestPath = path.join(artifactRoot, "LocalV2DagLambdaManifest.json");
  const corePointers = artifactPointersFromS3Keys({
    bucket: requireArtifactBucket(),
    keyPrefix: artifactKeyPrefix(payload),
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const joinedPostRefusalPacketUri = input.joinedPostRefusalArtifact?.artifactPointers?.postRefusalPacketUri;
  const joinedPostRefusalPacketMetadata = input.joinedPostRefusalArtifact?.artifactMetadata?.postRefusalPacketUri;
  const pointers: LocalV2DagLambdaArtifactPointers = {
    ...corePointers,
    ...(joinedPostRefusalPacketUri ? { postRefusalPacketUri: joinedPostRefusalPacketUri } : {}),
  };
  // Make the canonical evidence bundle durable before auxiliary uploads start.
  // Large screenshot sets must not contend with or starve the core artifact.
  const scanArtifactMetadata = await timeLambdaPhase(phaseTimings, "scan_artifact_upload", () => uploadArtifactFiles({
    fields: ["scanArtifactUri"],
    manifestPath,
    payload,
    pointers,
    scanArtifactPath,
    s3Client: input.s3Client,
    signal: input.signal
  }));
  const auxiliaryArtifacts = await timeLambdaPhase(phaseTimings, "auxiliary_upload", () => uploadAuxiliaryArtifactFiles({
    artifactRoot,
    payload,
    s3Client: input.s3Client,
    signal: input.signal
  }));
  await timeLambdaPhase(phaseTimings, "manifest_write", () => writeManifest({
    artifactRoot,
    auxiliaryArtifacts,
    bundle,
    ...(joinedPostRefusalPacketMetadata ? {
      artifactMetadata: { postRefusalPacketUri: joinedPostRefusalPacketMetadata },
    } : {}),
    ...(input.laneTimingSummary ? { laneTimingSummary: input.laneTimingSummary } : {}),
    payload,
    phaseTimings,
    pointers,
    scanTuning
  }));
  const manifestArtifactMetadata = await timeLambdaPhase(phaseTimings, "core_artifact_upload", () => uploadArtifactFiles({
    fields: ["manifestUri"],
    manifestPath,
    payload,
    pointers,
    scanArtifactPath,
    s3Client: input.s3Client,
    signal: input.signal
  }));
  return {
    artifactMetadata: {
      ...scanArtifactMetadata,
      ...manifestArtifactMetadata,
      ...(joinedPostRefusalPacketMetadata
        ? { postRefusalPacketUri: joinedPostRefusalPacketMetadata }
        : {}),
    },
    artifactPointers: pointers,
    phaseTimings
  };
}

function phaseLabel(prefix: string | undefined, label: string) {
  return prefix ? `${prefix}_${label}` : label;
}

function writeJson(filePath: string, value: unknown) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeCompactJson(filePath: string, value: unknown) {
  return writeFile(filePath, serializeCanonicalEvidenceBundle(value), "utf8");
}

export function serializeCanonicalEvidenceBundle(value: unknown) {
  return JSON.stringify(value);
}

export type EgressProbeObservation = {
  asn?: string;
  country?: string;
  ip?: string;
  org?: string;
  region?: string;
  timezone?: string;
};

type EgressProbeAttempt = {
  completedAt: string;
  durationMs: number;
  error: string | null;
  mode: "lightweight_proxy" | "browser_fallback";
  observed: EgressProbeObservation | null;
  probeStatus: "available" | "failed" | "skipped";
  provider: string | null;
  regionVerificationSource?: "configured_exact_ip_binding" | "provider_observation" | "not_required";
  startedAt: string;
};

type EgressProbeAssessment = {
  error: string | null;
  ipMatches: boolean;
  probeStatus: "available" | "failed";
  regionMatches: boolean;
  regionVerificationSource: "configured_exact_ip_binding" | "provider_observation" | "not_required";
};

export async function writeEgressPreflightArtifact(
  artifactRoot: string,
  options: { allowBrowserFallback: boolean; skipLightweightProbe?: boolean },
): Promise<boolean> {
  const startedAt = Date.now();
  const egressLabel = firstTrimmedRuntimeEnv(process.env, [
    "SCAN_EGRESS_LABEL",
    "CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL",
  ]);
  const proxyServer = firstTrimmedRuntimeEnv(process.env, [
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
    "SCAN_PROXY_SERVER",
    "CERTSCORE_CHROMIUM_PROXY_SERVER",
  ]);
  const proxyEnabled = scanProxyEnabledEnv(process.env) && Boolean(proxyServer);
  const expectedEgressRegion = firstTrimmedRuntimeEnv(process.env, [
    "CERTSCORE_V2_DAG_LAMBDA_EXPECTED_EGRESS_REGION",
  ]);
  const expectedEgressPublicIpHash = firstTrimmedRuntimeEnv(process.env, [
    "CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH",
  ]);
  const requireRegionalEgress = regionalEgressRequired(process.env);
  const artifact = {
    artifactVersion: "certscore.v2.lambda-egress-preflight.v1",
    checkedAt: new Date().toISOString(),
    completedAt: null as string | null,
    durationMs: 0,
    egressLabel: egressLabel ? egressLabel.slice(0, 80) : null,
    expectedEgressRegion: expectedEgressRegion ? expectedEgressRegion.slice(0, 80) : null,
    expectedEgressPublicIpHash: expectedEgressPublicIpHash ? expectedEgressPublicIpHash.slice(0, 80) : null,
    proxyModeEnabled: proxyEnabled,
    probeStatus: "skipped" as "available" | "failed" | "skipped",
    provider: null as string | null,
    regionVerificationSource: "not_required" as EgressProbeAssessment["regionVerificationSource"],
    observed: null as EgressProbeObservation | null,
    startedAt: new Date(startedAt).toISOString(),
    error: null as null | string,
    attempts: options.skipLightweightProbe
      ? await readPriorEgressProbeAttempts(artifactRoot)
      : [] as EgressProbeAttempt[],
  };

  if (!proxyEnabled) {
    if (requireRegionalEgress) {
      artifact.probeStatus = "failed";
      artifact.error = "Required regional scanner proxy is not configured.";
    }
    const completedAt = Date.now();
    artifact.completedAt = new Date(completedAt).toISOString();
    artifact.durationMs = completedAt - startedAt;
    await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
    return !requireRegionalEgress;
  }

  if (!options.skipLightweightProbe && proxyServer) {
    const attemptStartedAt = Date.now();
    try {
      const response = await fetchEgressProbeThroughProxy(
        proxyServer,
        LOCAL_V2_DAG_LAMBDA_EGRESS_LIGHTWEIGHT_TOTAL_TIMEOUT_MS,
      );
      const parsed = parseEgressProbeResponse(response.text);
      const assessment = assessEgressProbeObservation({
        expectedEgressPublicIpHash,
        expectedEgressRegion,
        httpStatus: response.status,
        observed: parsed,
        provider: "checkip.amazonaws.com",
      });
      artifact.provider = "checkip.amazonaws.com";
      artifact.probeStatus = assessment.probeStatus;
      artifact.observed = parsed;
      artifact.error = assessment.error;
      artifact.regionVerificationSource = assessment.regionVerificationSource;
    } catch (error) {
      artifact.probeStatus = "failed";
      artifact.error = error instanceof Error ? error.message.slice(0, 240) : "unknown_lightweight_egress_preflight_error";
    }
    artifact.attempts.push(egressProbeAttempt(artifact, "lightweight_proxy", attemptStartedAt, Date.now()));
    if (artifact.probeStatus === "available") {
      const completedAt = Date.now();
      artifact.completedAt = new Date(completedAt).toISOString();
      artifact.durationMs = completedAt - startedAt;
      await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
      return true;
    }
  }

  if (!options.allowBrowserFallback) {
    const completedAt = Date.now();
    artifact.completedAt = new Date(completedAt).toISOString();
    artifact.durationMs = completedAt - startedAt;
    await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
    return false;
  }

  let browser;
  const browserAttemptStartedAt = Date.now();
  try {
    browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    const context = await browser.newContext(chromiumContextOptions());
    const page = await context.newPage();
    const fallbackUrl = firstTrimmedRuntimeEnv(process.env, [
      "CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_URL",
    ]) ?? LOCAL_V2_DAG_LAMBDA_DEFAULT_EGRESS_FALLBACK_URL;
    const response = await page.goto(fallbackUrl, {
      timeout: 7_500,
      waitUntil: "domcontentloaded"
    });
    const text = (await page.locator("body").textContent({ timeout: 2_000 })) ?? "";
    const parsed = parseEgressProbeResponse(text);
    const assessment = assessEgressProbeObservation({
      expectedEgressPublicIpHash,
      expectedEgressRegion,
      httpStatus: response?.status() ?? 0,
      observed: parsed,
      provider: "certscore.ai",
    });
    artifact.provider = "certscore.ai";
    artifact.probeStatus = assessment.probeStatus;
    artifact.observed = parsed;
    artifact.error = assessment.error;
    artifact.regionVerificationSource = assessment.regionVerificationSource;
    await context.close().catch(() => undefined);
  } catch (error) {
    artifact.probeStatus = "failed";
    artifact.error = error instanceof Error ? error.message.slice(0, 240) : "unknown_egress_preflight_error";
  } finally {
    await browser?.close().catch(() => undefined);
    const completedAt = Date.now();
    artifact.attempts.push(egressProbeAttempt(artifact, "browser_fallback", browserAttemptStartedAt, completedAt));
    artifact.completedAt = new Date(completedAt).toISOString();
    artifact.durationMs = completedAt - startedAt;
    await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
  }
  return artifact.probeStatus === "available";
}

function egressProbeAttempt(
  artifact: {
    error: string | null;
    observed: EgressProbeObservation | null;
    probeStatus: "available" | "failed" | "skipped";
    provider: string | null;
    regionVerificationSource?: EgressProbeAssessment["regionVerificationSource"];
  },
  mode: EgressProbeAttempt["mode"],
  startedAt: number,
  completedAt: number,
): EgressProbeAttempt {
  return {
    completedAt: new Date(completedAt).toISOString(),
    durationMs: Math.max(0, completedAt - startedAt),
    error: artifact.error,
    mode,
    observed: artifact.observed,
    probeStatus: artifact.probeStatus,
    provider: artifact.provider,
    ...(artifact.regionVerificationSource
      ? { regionVerificationSource: artifact.regionVerificationSource }
      : {}),
    startedAt: new Date(startedAt).toISOString(),
  };
}

async function readPriorEgressProbeAttempts(artifactRoot: string): Promise<EgressProbeAttempt[]> {
  try {
    const parsed = JSON.parse(await readFile(path.join(artifactRoot, "EgressPreflight.json"), "utf8")) as {
      attempts?: EgressProbeAttempt[];
    };
    return Array.isArray(parsed.attempts) ? parsed.attempts.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function egressRegionMatchesExpected(observedRegion: string | undefined, expectedRegion: string | undefined) {
  const expected = expectedRegion?.trim().toLocaleLowerCase();
  if (!expected) return true;
  return observedRegion?.trim().toLocaleLowerCase() === expected;
}

export function egressIpMatchesExpected(observedIp: string | undefined, expectedHash: string | undefined) {
  const expected = expectedHash?.trim().toLowerCase();
  if (!expected) return true;
  if (!observedIp?.trim()) return false;
  return `sha256:${createHash("sha256").update(observedIp.trim()).digest("hex")}` === expected;
}

export function assessEgressProbeObservation(input: {
  expectedEgressPublicIpHash?: string;
  expectedEgressRegion?: string;
  httpStatus: number;
  observed: EgressProbeObservation | null;
  provider: string;
}): EgressProbeAssessment {
  const ipMatches = egressIpMatchesExpected(input.observed?.ip, input.expectedEgressPublicIpHash);
  const providerRegionAvailable = Boolean(input.observed?.region?.trim());
  const regionVerificationSource: EgressProbeAssessment["regionVerificationSource"] =
    !input.expectedEgressRegion
      ? "not_required"
      : providerRegionAvailable
        ? "provider_observation"
        : input.expectedEgressPublicIpHash && ipMatches
          ? "configured_exact_ip_binding"
          : "provider_observation";
  const regionMatches = !input.expectedEgressRegion
    || (providerRegionAvailable
      ? egressRegionMatchesExpected(input.observed?.region, input.expectedEgressRegion)
      : regionVerificationSource === "configured_exact_ip_binding");
  const successfulHttp = input.httpStatus >= 200 && input.httpStatus < 300;
  const probeStatus = successfulHttp && Boolean(input.observed) && ipMatches && regionMatches
    ? "available"
    : "failed";
  const error = probeStatus === "available"
    ? null
    : !successfulHttp
      ? `Egress probe provider ${input.provider} returned HTTP ${input.httpStatus}.`
      : !input.observed
        ? `Egress probe provider ${input.provider} returned an unusable response.`
        : !ipMatches && input.expectedEgressPublicIpHash
          ? "Observed egress IP did not match the configured regional proxy public-IP hash."
          : !regionMatches && input.expectedEgressRegion
            ? `Observed egress region ${input.observed.region ?? "unknown"} did not match expected region ${input.expectedEgressRegion}.`
            : `Egress probe provider ${input.provider} did not satisfy the required identity checks.`;

  return { error, ipMatches, probeStatus, regionMatches, regionVerificationSource };
}

function regionalEgressRequired(env: NodeJS.ProcessEnv = process.env) {
  const value = env.CERTSCORE_V2_DAG_LAMBDA_REQUIRE_REGIONAL_EGRESS?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

export function parseEgressProbeResponse(text: string) {
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const record = value as Record<string, unknown>;
    const ip = compactString(record.ip);
    if (!ip) {
      return null;
    }
    return {
      ip: ip.slice(0, 80),
      ...(compactString(record.country) ? { country: compactString(record.country)!.slice(0, 24) } : {}),
      ...(compactString(record.region) ? { region: compactString(record.region)!.slice(0, 80) } : {}),
      ...(compactString(record.org) ? { org: compactString(record.org)!.slice(0, 160), asn: compactString(record.org)!.split(/\s+/)[0]?.slice(0, 40) } : {}),
      ...(compactString(record.timezone) ? { timezone: compactString(record.timezone)!.slice(0, 80) } : {})
    };
  } catch {
    const ip = text.trim();
    return isIP(ip) ? { ip } : null;
  }
}

export async function fetchEgressProbeThroughProxy(
  proxyServer: string,
  totalTimeoutMs = LOCAL_V2_DAG_LAMBDA_EGRESS_LIGHTWEIGHT_TOTAL_TIMEOUT_MS,
  probeUrlValue = LOCAL_V2_DAG_LAMBDA_PRIMARY_EGRESS_REFLECTOR_URL,
): Promise<{ status: number; text: string }> {
  const proxyUrl = new URL(proxyServer.includes("://") ? proxyServer : `http://${proxyServer}`);
  const probeUrl = new URL(probeUrlValue);
  if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
    throw new Error(`Unsupported lightweight egress proxy protocol: ${proxyUrl.protocol}`);
  }
  if (probeUrl.protocol !== "https:") {
    throw new Error(`Unsupported lightweight egress reflector protocol: ${probeUrl.protocol}`);
  }
  const proxyUsername = firstTrimmedRuntimeEnv(process.env, [
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME",
    "CERTSCORE_CHROMIUM_PROXY_USERNAME",
  ]) ?? decodeURIComponent(proxyUrl.username);
  const proxyPassword = firstTrimmedRuntimeEnv(process.env, [
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD",
    "CERTSCORE_CHROMIUM_PROXY_PASSWORD",
  ]) ?? decodeURIComponent(proxyUrl.password);
  const proxyAuthorization = proxyUsername
    ? `Basic ${Buffer.from(`${proxyUsername}:${proxyPassword}`).toString("base64")}`
    : undefined;
  const connectRequest = proxyUrl.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    let connectRequestHandle: ClientRequest | undefined;
    let probeAgent: HttpsAgent | undefined;
    let probeRequest: ClientRequest | undefined;
    let secureSocket: TLSSocket | undefined;
    let tunnelSocket: Duplex | undefined;
    let settled = false;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: { status: number; text: string }) => {
      if (settled) return;
      settled = true;
      if (totalTimer) clearTimeout(totalTimer);
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      if (totalTimer) clearTimeout(totalTimer);
      probeRequest?.destroy();
      probeAgent?.destroy();
      secureSocket?.destroy();
      tunnelSocket?.destroy();
      connectRequestHandle?.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    totalTimer = setTimeout(
      () => fail(new Error(`Lightweight egress proxy probe exceeded ${totalTimeoutMs}ms total deadline`)),
      totalTimeoutMs,
    );

    connectRequestHandle = connectRequest({
      hostname: proxyUrl.hostname,
      method: "CONNECT",
      path: `${probeUrl.hostname}:${probeUrl.port || "443"}`,
      port: proxyUrl.port ? Number(proxyUrl.port) : proxyUrl.protocol === "https:" ? 443 : 80,
      headers: {
        Host: `${probeUrl.hostname}:${probeUrl.port || "443"}`,
        ...(proxyAuthorization ? { "Proxy-Authorization": proxyAuthorization } : {}),
      },
    });
    connectRequestHandle.setTimeout(totalTimeoutMs, () => fail(new Error("Lightweight egress proxy CONNECT timed out")));
    connectRequestHandle.once("error", fail);
    connectRequestHandle.once("connect", (response, socket, head) => {
      tunnelSocket = socket;
      if (response.statusCode !== 200) {
        fail(new Error(`Lightweight egress proxy CONNECT failed: HTTP ${response.statusCode ?? 0}`));
        return;
      }
      if (head.length > 0) {
        socket.unshift(head);
      }
      secureSocket = tlsConnect({
        rejectUnauthorized: true,
        servername: probeUrl.hostname,
        socket,
      });
      secureSocket.once("error", fail);
      secureSocket.once("secureConnect", () => {
        if (settled || !secureSocket) return;
        probeAgent = new HttpsAgent({ keepAlive: false });
        // The HTTPS request must reuse the TLS socket established through the
        // regional proxy. Passing createConnection directly to https.request
        // with agent:false can be ignored by Node's one-shot Agent, causing a
        // second direct connection that cannot leave the scanner VPC.
        probeAgent.createConnection = () => secureSocket!;
        probeRequest = httpsRequest({
          agent: probeAgent,
          headers: {
            Accept: "text/plain, application/json;q=0.9",
            "User-Agent": "CertScore-Egress-Preflight/1.0",
          },
          hostname: probeUrl.hostname,
          method: "GET",
          path: `${probeUrl.pathname}${probeUrl.search}`,
          port: probeUrl.port ? Number(probeUrl.port) : 443,
        }, (probeResponse) => {
          const chunks: Buffer[] = [];
          let sizeBytes = 0;
          probeResponse.once("error", fail);
          probeResponse.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            sizeBytes += buffer.length;
            if (sizeBytes <= 64 * 1024) {
              chunks.push(buffer);
            } else {
              fail(new Error("Lightweight egress response exceeded 64 KiB"));
            }
          });
          probeResponse.once("end", () => finish({
            status: probeResponse.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }));
        });
        probeRequest.setTimeout(totalTimeoutMs, () => fail(new Error("Lightweight egress HTTPS probe timed out")));
        probeRequest.once("error", fail);
        probeRequest.end();
      });
    });
    connectRequestHandle.end();
  });
}

export function postRefusalParentDispatchSha256(
  payload: LocalV2DagLambdaDispatchPayload,
) {
  return canonicalSha256({
    artifactOnly: payload.artifactOnly,
    awsRegion: payload.awsRegion,
    callbackCorrelationId: payload.callbackCorrelationId,
    ...(payload.coordinatorPlanSummary
      ? { coordinatorPlanSummary: payload.coordinatorPlanSummary }
      : {}),
    contractVersion: payload.contractVersion,
    ...(payload.debugOverrides ? { debugOverrides: payload.debugOverrides } : {}),
    functionName: payload.functionName,
    hostname: payload.hostname,
    localCallbackUrl: payload.localCallbackUrl,
    orchestrationMode: payload.orchestrationMode ?? "single",
    ...(payload.policySurfaceSeeds ? { policySurfaceSeeds: payload.policySurfaceSeeds } : {}),
    ...(payload.postRefusalObservation
      ? { postRefusalObservation: payload.postRefusalObservation }
      : {}),
    processor: payload.processor,
    productionFindingIntegration: payload.productionFindingIntegration,
    profile: payload.profile,
    resultHandoff: payload.resultHandoff,
    resultPurpose: payload.resultPurpose,
    resultQueueUrl: payload.resultQueueUrl,
    scanId: payload.scanId,
    scannerRuntime: payload.scannerRuntime,
    ...(payload.strongEvidenceMode ? { strongEvidenceMode: payload.strongEvidenceMode } : {}),
    targetEnvironment: payload.targetEnvironment,
    targetUrl: payload.targetUrl,
    vpcMode: payload.vpcMode,
  });
}

function postRefusalDescriptorStatus(packet: PostRefusalEvidencePacket): PostRefusalLambdaEvidenceDescriptor["status"] {
  switch (packet.refusalRegistration.status) {
    case "confirmed":
      return packet.observations.length > 0 ? "confirmed_observation" : "confirmed_clean";
    case "unconfirmed":
      return "unconfirmed";
    case "not_attempted":
      return "not_attempted";
    case "unsupported":
      return "unsupported";
    case "aborted":
      return "aborted";
  }
}

function unsupportedPostRefusalPacket(input: {
  payload: LocalV2DagLambdaDispatchPayload;
  reason: string;
}): PostRefusalEvidencePacket {
  const completedAt = new Date();
  const config = input.payload.postRefusalObservation!;
  return postRefusalEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_refusal_evidence.v1",
    artifactOnly: true,
    productionProjectable: false,
    scanId: `${input.payload.scanId}:reject_observation`,
    parentScanId: input.payload.scanId,
    targetUrl: input.payload.targetUrl,
    normalizedUrl: new URL(input.payload.targetUrl).toString(),
    observationBranch: "reject_only",
    phase: "post_action",
    consentAction: "reject",
    startedAt: completedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    resolver: {
      found: false,
      method: "cmp_registry_recipe",
      confidence: 0,
      recipeId: config.resolver.kind === "canonical_cmp_registry"
        ? `${config.resolver.recipeSetId}:unsupported`
        : `canonical-cmp:${config.resolver.cmpCanonicalName}:reject:unsupported`,
      ...(config.resolver.kind === "named_cmp"
        ? { cmpId: config.resolver.cmpCanonicalName }
        : {}),
      reason: input.reason.slice(0, 240),
    },
    refusalRegistration: {
      status: "unsupported",
      refusalExercised: false,
      reason: input.reason.slice(0, 240),
      witnesses: [],
    },
    observationWindowMs: config.observationWindowMs,
    timing: {
      dispatchDelayMs: 0,
      navigationMs: 0,
      resolverMs: 0,
      confirmationMs: 0,
      observationMs: 0,
      totalMs: 0,
      readyAtMs: 0,
    },
    network: {
      requests: [],
      postRefusalNonEssentialRequests: [],
      activeRequestIdsAtRefusalRegistration: [],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [
      input.reason.slice(0, 240),
    ],
  });
}

export async function runLocalV2DagLambdaPostRefusalArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    artifactRoot: string;
    s3Client?: S3PutClient;
    signal?: AbortSignal;
  },
): Promise<ArtifactChainResult> {
  if (payload.workerLane !== "reject_observation" || !payload.postRefusalObservation) {
    throw new Error("Post-refusal artifact chain requires the reject_observation worker and typed configuration.");
  }
  if (!isPostRefusalRejectWorkerEnabled(payload)) {
    throw new Error(`Post-refusal worker requires ${POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG}=1.`);
  }
  const config = payload.postRefusalObservation;
  if (
    config.interactionAuthorization.kind === "loopback" && payload.targetEnvironment !== "local"
  ) {
    throw new Error("Loopback post-refusal authorization requires the local target environment.");
  }
  const phaseTimings: LocalV2DagLambdaPhaseTiming[] = [];
  await mkdir(options.artifactRoot, { recursive: true });
  const recipes = config.resolver.kind === "canonical_cmp_registry"
    ? buildCanonicalPostRefusalActionRecipes()
    : [buildPostRefusalCmpActionRecipe({
        cmpCanonicalName: config.resolver.cmpCanonicalName,
        confirmation: config.resolver.confirmation,
      })].flatMap((recipe) => recipe ? [recipe] : []);
  const packet = await timeLambdaPhase(phaseTimings, "post_refusal_observation", async () => {
    const recipe = recipes[0];
    if (!recipe) {
      return unsupportedPostRefusalPacket({
        payload,
        reason: "canonical_cmp_reject_recipe_not_found",
      });
    }
    return runPostRefusalObserver({
      allowCanonicalRejectDiscovery: config.resolver.kind === "canonical_cmp_registry",
      actionSearchTimeoutMs: config.actionSearchTimeoutMs,
      confirmationTimeoutMs: config.confirmationTimeoutMs,
      dispatchDelayMs: 0,
      interactionAuthorization: config.interactionAuthorization,
      observationWindowMs: config.observationWindowMs,
      outDir: options.artifactRoot,
      parentScanId: payload.scanId,
      productionProjectable: true,
      recipe,
      ...(recipes.length > 1
        ? {
            recipeCandidates: recipes,
            recipeSetId: config.resolver.kind === "canonical_cmp_registry"
              ? config.resolver.recipeSetId
              : undefined,
          }
        : {}),
      scanId: `${payload.scanId}:reject_observation`,
      signal: options.signal,
      url: payload.targetUrl,
    });
  });
  const body = Buffer.from(JSON.stringify(postRefusalEvidencePacketSchema.parse(packet)));
  const sha256 = createHash("sha256").update(body).digest("hex");
  const bucket = requireArtifactBucket();
  const key = `${artifactKeyPrefix(payload).replace(/^\/+|\/+$/g, "")}/PostRefusalEvidencePacket.json`;
  await timeLambdaPhase(phaseTimings, "post_refusal_artifact_upload", async () => {
    await (options.s3Client ?? localV2DagLambdaS3Client(payload.awsRegion)).send(new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
      Metadata: { sha256 },
    }), { abortSignal: options.signal });
  });
  const packetPointer = s3Uri(bucket, key);
  const descriptor = postRefusalLambdaEvidenceDescriptorSchema.parse({
    artifactOnly: true,
    contractVersion: POST_REFUSAL_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION,
    generatedAt: new Date().toISOString(),
    descriptorKind: "post_refusal_evidence_descriptor",
    packetMetadata: { sha256, sizeBytes: body.byteLength },
    packetPointer,
    parentDispatchSha256: payload.parentDispatchSha256!,
    parentScanId: payload.scanId,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: packet.productionProjectable,
    refusalExercised: packet.refusalRegistration.refusalExercised,
    observationCount: packet.observations.length,
    scanId: payload.scanId,
    status: postRefusalDescriptorStatus(packet),
    targetEnvironment: payload.targetEnvironment,
  });
  return {
    artifactMetadata: {
      postRefusalPacketUri: { sha256, sizeBytes: body.byteLength },
    },
    artifactPointers: { postRefusalPacketUri: packetPointer },
    phaseTimings,
    postRefusalEvidence: descriptor,
  };
}

export async function runLocalV2DagLambdaShardedArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    artifactSignal?: AbortSignal;
    artifactRoot: string;
    lambdaClient?: LambdaInvokeClient;
    s3Client?: S3PutClient;
    s3GetClient?: S3GetClient;
    signal?: AbortSignal;
    workspaceRoot?: string;
  }
): Promise<{
  artifactMetadata: LocalV2DagLambdaArtifactMetadata;
  artifactPointers: LocalV2DagLambdaArtifactPointers;
  laneTimingSummary: LocalV2DagLambdaLaneTimingSummary;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
}> {
  const coordinatorStartedAtMs = Date.now();
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const artifactRoot = path.resolve(workspaceRoot, options.artifactRoot);
  const phaseTimings: LocalV2DagLambdaPhaseTiming[] = [];
  const scanTuning = buildLocalV2DagLambdaScanTuning();
  await mkdir(artifactRoot, { recursive: true });
  const evidenceWorkerLanes = LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES;
  const postRefusalState: {
    cancelledNoReject: boolean;
    dispatchStartedAtMs?: number;
    error?: string;
    outcomeObservedAtMs?: number;
    result?: LocalV2DagLambdaShardResult;
    settled: boolean;
    started: boolean;
    timedOut: boolean;
  } = { cancelledNoReject: false, settled: false, started: false, timedOut: false };
  let postRefusalWorkerPromise: Promise<void> | undefined;
  const postRefusalAbortController = new AbortController();
  postRefusalAbortController.signal.addEventListener("abort", () => {
    postRefusalState.error = postRefusalState.cancelledNoReject
      ? "reject_control_not_observed"
      : "reject_path_exceeded_post_primary_join_budget";
    postRefusalState.outcomeObservedAtMs = Date.now();
    postRefusalState.settled = true;
    postRefusalState.timedOut = !postRefusalState.cancelledNoReject;
  }, { once: true });
  if (isPostRefusalRejectWorkerEnabled(payload)) {
    postRefusalState.started = true;
    const postRefusalWorkerSignal = options.signal
      ? AbortSignal.any([options.signal, postRefusalAbortController.signal])
      : postRefusalAbortController.signal;
    postRefusalWorkerPromise = waitForPostRefusalDispatchDelay(
      payload.postRefusalObservation?.dispatchDelayMs ??
        POST_REFUSAL_REJECT_WORKER_DEFAULT_DISPATCH_DELAY_MS,
      postRefusalWorkerSignal,
    )
      .then(() => {
        postRefusalState.dispatchStartedAtMs = Date.now();
        return invokeLocalV2DagLambdaWorker({
          lambdaClient: options.lambdaClient,
          parentPayload: payload,
          parentScanId: payload.scanId,
          signal: postRefusalWorkerSignal,
          workerLane: "reject_observation",
        });
      })
      .then((result) => {
        // RequestResponse cancellation stops the coordinator from accepting a
        // late lane result, but AWS may still finish an already-running worker.
        // Never let that late response reopen a terminal no-Reject or timeout
        // decision, and never give it an independent publication path.
        if (postRefusalState.cancelledNoReject || postRefusalState.timedOut) return;
        postRefusalState.result = result;
        postRefusalState.outcomeObservedAtMs = Date.now();
        postRefusalState.settled = true;
      })
      .catch((error) => {
        if (postRefusalState.timedOut || postRefusalState.cancelledNoReject) return;
        postRefusalState.error = error instanceof Error ? error.message : String(error);
        postRefusalState.outcomeObservedAtMs = Date.now();
        postRefusalState.settled = true;
        console.warn("[v2-lambda-post-refusal] worker failed closed", {
          error: postRefusalState.error,
          scanId: payload.scanId,
        });
      });
  }
  const workerResults = await timeLambdaPhase(phaseTimings, "worker_invocations", () =>
    invokeLocalV2DagLambdaWorkers({
      lambdaClient: options.lambdaClient,
      onWorkerResult: (result) => {
        if (
          result.workerLane !== "consent_proof" ||
          !postRefusalState.started ||
          postRefusalState.cancelledNoReject ||
          postRefusalState.timedOut ||
          !result.consentRejectAvailability
        ) return;
        const returnedRejectStatus = postRefusalState.result?.postRefusalEvidence?.status;
        const rejectActionMayHaveDispatched = returnedRejectStatus !== undefined &&
          returnedRejectStatus !== "not_attempted" &&
          returnedRejectStatus !== "unsupported";
        const cancellation = decidePostRefusalCooperativeAbort({
          consentInventoryComplete: result.consentRejectAvailability.inventoryComplete,
          rejectControlObserved: result.consentRejectAvailability.rejectControlObserved,
          rejectActionDispatched: rejectActionMayHaveDispatched,
        });
        if (!cancellation.abortRequested) return;
        postRefusalState.cancelledNoReject = true;
        postRefusalAbortController.abort(new Error(cancellation.reason));
        console.info("[v2-lambda-post-refusal] cooperative cancellation requested", {
          reason: cancellation.reason,
          scanId: payload.scanId,
        });
      },
      parentPayload: payload,
      parentScanId: payload.scanId,
      workerLanes: evidenceWorkerLanes,
    })
  );
  const passiveLaneBarrierCompletedAtMs = Date.now();
  const workerBundles = await timeLambdaPhase(phaseTimings, "worker_bundle_download", () =>
    Promise.all(workerResults.map((result) =>
      readWorkerBundleFromArtifactResult(result, { awsRegion: payload.awsRegion, s3GetClient: options.s3GetClient })
    ))
  );
  await timeLambdaPhase(phaseTimings, "worker_auxiliary_mirror", () =>
    mirrorWorkerArtifactsIntoFinalArtifactRoot({
      artifactRoot,
      awsRegion: payload.awsRegion,
      s3GetClient: options.s3GetClient,
      workerResults
    })
  );
  const bundlesByLane = new Map(workerResults.map((result, index) => [
    result.workerLane,
    workerBundles[index],
  ]));
  const consentProofBundle = bundlesByLane.get("consent_proof");
  const runtimeEvidenceBundle = bundlesByLane.get("runtime_evidence");
  const policyEvidenceBundle = bundlesByLane.get("policy_evidence");
  if (!consentProofBundle || !runtimeEvidenceBundle || !policyEvidenceBundle) {
    throw new Error("Three-lane Lambda evidence merge requires consent, runtime, and policy worker bundles.");
  }
  let bundle = await timeLambdaPhase(phaseTimings, "evidence_lane_bundle_merge", async () =>
    mergeLocalV2DagLambdaEvidenceLaneBundles({
      artifactRoot,
      consentProof: consentProofBundle,
      policyEvidence: policyEvidenceBundle,
      runtimeEvidence: runtimeEvidenceBundle,
      scanId: payload.scanId,
    })
  );
  let addedInitialBarrierWaitMs = 0;
  let postRefusalBarrierStartedAtMs: number | undefined;
  if (postRefusalWorkerPromise) {
    postRefusalBarrierStartedAtMs = Date.now();
    const completedInsideBarrier = await timeLambdaPhase(
      phaseTimings,
      "post_refusal_barrier_join",
      () => awaitPostRefusalWorkerWithinTailBudget({
        abortController: postRefusalAbortController,
        maxTailWaitMs: POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
        passiveLaneBarrierCompletedAtMs,
        workerPromise: postRefusalWorkerPromise!,
      }),
    );
    if (!completedInsideBarrier && !postRefusalState.cancelledNoReject) {
      postRefusalState.error = "reject_path_exceeded_post_primary_join_budget";
      postRefusalState.outcomeObservedAtMs = passiveLaneBarrierCompletedAtMs +
        POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS;
      postRefusalState.settled = true;
      postRefusalState.timedOut = true;
    }
  }
  let postRefusalJoin: "disabled" | "joined" | "failed" | "not_applicable" | "timed_out" =
    postRefusalState.started ? "failed" : "disabled";
  let joinedPostRefusalPacket: PostRefusalEvidencePacket | undefined;
  if (postRefusalState.cancelledNoReject) {
    postRefusalJoin = "not_applicable";
  } else if (postRefusalState.timedOut) {
    postRefusalJoin = "timed_out";
  }
  if (!postRefusalState.cancelledNoReject && !postRefusalState.timedOut && postRefusalState.result) {
    try {
      let packet: PostRefusalEvidencePacket | undefined;
      const packetJoinedInsideBarrier = await timeLambdaPhase(
        phaseTimings,
        "post_refusal_packet_join",
        () => awaitPostRefusalWorkerWithinTailBudget({
          abortController: postRefusalAbortController,
          maxTailWaitMs: POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
          passiveLaneBarrierCompletedAtMs,
          workerPromise: readPostRefusalPacketFromArtifactResult(postRefusalState.result!, {
            awsRegion: payload.awsRegion,
            s3GetClient: options.s3GetClient,
            signal: postRefusalAbortController.signal,
          }).then((verifiedPacket) => {
            packet = verifiedPacket;
          }),
        }),
      );
      if (packetJoinedInsideBarrier && packet) {
        joinedPostRefusalPacket = packet;
        postRefusalJoin = "joined";
      } else {
        postRefusalJoin = "timed_out";
      }
    } catch (error) {
      if (postRefusalState.timedOut) {
        postRefusalJoin = "timed_out";
      } else {
        postRefusalJoin = "failed";
        postRefusalState.error = error instanceof Error ? error.message : String(error);
      }
    }
  }
  if (postRefusalBarrierStartedAtMs !== undefined) {
    addedInitialBarrierWaitMs = Math.min(
      POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
      Math.max(0, Date.now() - postRefusalBarrierStartedAtMs),
    );
  }
  if (postRefusalState.started) {
    const outcomeCompletedAt = joinedPostRefusalPacket?.completedAt ?? new Date().toISOString();
    bundle = canonicalEvidenceBundleSchema.parse({
      ...bundle,
      completedAt: latestIsoTimestamp(bundle.completedAt, outcomeCompletedAt),
      ...(joinedPostRefusalPacket ? { postRefusalEvidence: joinedPostRefusalPacket } : {}),
      postRefusalLaneOutcome: {
        contractVersion: "certscore.post_refusal_lane_outcome.v1",
        completedAt: outcomeCompletedAt,
        evidenceJoined: postRefusalJoin === "joined",
        maxTailWaitMs: POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
        status: postRefusalJoin,
        ...(postRefusalJoin === "timed_out"
          ? { limitationCode: "reject_path_timeout" }
          : postRefusalJoin === "not_applicable"
            ? { limitationCode: "reject_control_not_observed" }
          : postRefusalJoin === "failed"
            ? { limitationCode: "reject_path_worker_failed" }
            : {}),
      },
    });
  }
  const allWorkerResults = postRefusalState.result
    ? [...workerResults, postRefusalState.result]
    : workerResults;
  const laneTimingSummary = buildLocalV2DagLambdaLaneTimingSummary({
    addedRejectWaitMs: addedInitialBarrierWaitMs,
    coordinatorStartedAtMs,
    generatedAtMs: Date.now(),
    passiveLaneBarrierCompletedAtMs,
    passiveWorkerResults: workerResults,
    postRefusal: {
      dispatchStartedAtMs: postRefusalState.dispatchStartedAtMs,
      join: postRefusalJoin,
      outcomeObservedAtMs: postRefusalState.outcomeObservedAtMs,
      result: postRefusalState.result,
    },
  });
  await writeJson(path.join(artifactRoot, "LocalV2DagLambdaShardSummary.json"), {
    artifactOnly: true,
    artifactVersion: "certscore.v2.lambda.evidence-lane-summary.v1",
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    laneTimingSummary,
    postRefusalObservation: {
      addedInitialBarrierWaitMs,
      featureEnabled: postRefusalState.started,
      join: postRefusalJoin,
      maxTailWaitMs: POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
      workerError: postRefusalState.error ?? null,
    },
    scanId: payload.scanId,
    workerLanes: postRefusalState.started
      ? [...evidenceWorkerLanes, "reject_observation"]
      : evidenceWorkerLanes,
    workerResults: allWorkerResults.map((result) => ({
      artifactPointers: result.artifactPointers,
      phaseTimings: result.phaseTimings ?? [],
      scanId: result.scanId,
      status: result.status,
      workerLane: result.workerLane
    }))
  });

  const artifacts = await writeAndUploadLocalV2DagLambdaArtifacts({
    artifactRoot,
    bundle,
    ...(postRefusalJoin === "joined" && postRefusalState.result
      ? { joinedPostRefusalArtifact: postRefusalState.result }
      : {}),
    laneTimingSummary,
    payload,
    phaseTimings,
    s3Client: options.s3Client,
    scanTuning,
    signal: options.artifactSignal ?? options.signal,
  });
  const artifactsWithLaneTimings = { ...artifacts, laneTimingSummary };
  if (postRefusalJoin !== "joined" || !postRefusalState.result) return artifactsWithLaneTimings;
  return attachJoinedPostRefusalArtifactPointer(artifactsWithLaneTimings, postRefusalState.result);
}

async function timeLambdaPhase<T>(
  phaseTimings: LocalV2DagLambdaPhaseTiming[],
  label: string,
  fn: () => Promise<T>
) {
  const memoryBefore = await runtimeMemorySnapshot();
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const logHandoffPhase = label.includes("artifact") || label === "auxiliary_upload" || label === "manifest_write";
  if (logHandoffPhase) {
    console.info("[v2-lambda-artifact] phase started", { label, startedAt: startedAtIso });
  }
  try {
    const value = await fn();
    const completedAt = Date.now();
    const memoryAfter = await runtimeMemorySnapshot();
    phaseTimings.push({
      completedAt: new Date(completedAt).toISOString(),
      durationMs: completedAt - startedAt,
      label,
      ...phaseMemoryTimingFields(memoryBefore, memoryAfter),
      startedAt: startedAtIso,
      status: "completed"
    });
    if (logHandoffPhase) {
      console.info("[v2-lambda-artifact] phase completed", { durationMs: completedAt - startedAt, label });
    }
    return value;
  } catch (error) {
    const completedAt = Date.now();
    const memoryAfter = await runtimeMemorySnapshot();
    phaseTimings.push({
      completedAt: new Date(completedAt).toISOString(),
      durationMs: completedAt - startedAt,
      label,
      ...phaseMemoryTimingFields(memoryBefore, memoryAfter),
      startedAt: startedAtIso,
      status: "failed"
    });
    if (logHandoffPhase) {
      console.warn("[v2-lambda-artifact] phase failed", {
        durationMs: completedAt - startedAt,
        error: error instanceof Error ? error.message : String(error),
        label,
      });
    }
    throw error;
  }
}

type RuntimeMemorySnapshot = {
  containerMb?: number;
  limitMb?: number;
  processRssMb: number;
};

async function runtimeMemorySnapshot(): Promise<RuntimeMemorySnapshot> {
  const [containerBytes, limitBytes] = await Promise.all([
    readFirstNumericFile([
      "/sys/fs/cgroup/memory.current",
      "/sys/fs/cgroup/memory/memory.usage_in_bytes",
    ]),
    readFirstNumericFile([
      "/sys/fs/cgroup/memory.max",
      "/sys/fs/cgroup/memory/memory.limit_in_bytes",
    ]),
  ]);
  return {
    ...(containerBytes !== undefined ? { containerMb: bytesToMegabytes(containerBytes) } : {}),
    ...(limitBytes !== undefined ? { limitMb: bytesToMegabytes(limitBytes) } : {}),
    processRssMb: bytesToMegabytes(process.memoryUsage.rss()),
  };
}

async function readFirstNumericFile(paths: string[]): Promise<number | undefined> {
  for (const filePath of paths) {
    const value = await readFile(filePath, "utf8").catch(() => "");
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < Number.MAX_SAFE_INTEGER) {
      return parsed;
    }
  }
  return undefined;
}

function bytesToMegabytes(value: number): number {
  return Math.round((value / 1024 / 1024) * 10) / 10;
}

function phaseMemoryTimingFields(
  before: RuntimeMemorySnapshot,
  after: RuntimeMemorySnapshot,
): Pick<
  LocalV2DagLambdaPhaseTiming,
  "memoryAfterMb" | "memoryBeforeMb" | "memoryLimitMb" | "processRssAfterMb" | "processRssBeforeMb"
> {
  return {
    ...(after.containerMb !== undefined ? { memoryAfterMb: after.containerMb } : {}),
    ...(before.containerMb !== undefined ? { memoryBeforeMb: before.containerMb } : {}),
    ...((after.limitMb ?? before.limitMb) !== undefined
      ? { memoryLimitMb: after.limitMb ?? before.limitMb }
      : {}),
    processRssAfterMb: after.processRssMb,
    processRssBeforeMb: before.processRssMb,
  };
}

function startRuntimeResourceSampler() {
  const startedAtMs = Date.now();
  const samples: Array<{
    containerMb?: number;
    elapsedMs: number;
    processRssMb: number;
  }> = [];
  let inFlight: Promise<void> | undefined;
  const sample = () => {
    if (inFlight) {
      return inFlight;
    }
    inFlight = runtimeMemorySnapshot()
      .then((memory) => {
        samples.push({
          ...(memory.containerMb !== undefined ? { containerMb: memory.containerMb } : {}),
          elapsedMs: Date.now() - startedAtMs,
          processRssMb: memory.processRssMb,
        });
        if (samples.length > 180) {
          samples.splice(1, 1);
        }
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
  void sample();
  const timer = setInterval(() => void sample(), 500);
  timer.unref?.();

  return {
    async stop() {
      clearInterval(timer);
      await sample();
      await inFlight;
      const containerReadings = samples.flatMap((entry) =>
        entry.containerMb === undefined ? [] : [entry.containerMb]
      );
      const processReadings = samples.map((entry) => entry.processRssMb);
      const finalMemory = await runtimeMemorySnapshot();
      return {
        durationMs: Date.now() - startedAtMs,
        memoryLimitMb: finalMemory.limitMb ?? null,
        peakContainerMemoryMb: containerReadings.length > 0 ? Math.max(...containerReadings) : null,
        peakProcessRssMb: processReadings.length > 0 ? Math.max(...processReadings) : finalMemory.processRssMb,
        sampleCount: samples.length,
        samples,
      };
    },
  };
}

function skippedLambdaPhaseTiming(label: string): LocalV2DagLambdaPhaseTiming {
  const now = new Date().toISOString();
  return {
    completedAt: now,
    durationMs: 0,
    label,
    startedAt: now,
    status: "skipped"
  };
}

export async function invokeLocalV2DagLambdaWorkers(input: {
  coordinatorPlanSummary?: LocalV2DagLambdaCoordinatorPlanSummary;
  lambdaClient?: LambdaInvokeClient;
  parentPayload: LocalV2DagLambdaDispatchPayload;
  parentScanId: string;
  onWorkerResult?: (result: LocalV2DagLambdaShardResult) => void;
  workerLanes: readonly LocalV2DagLambdaWorkerLane[];
}): Promise<LocalV2DagLambdaShardResult[]> {
  const lambdaClient = input.lambdaClient ?? new LambdaClient({ region: input.parentPayload.awsRegion });
  return Promise.all(input.workerLanes.map(async (workerLane) => {
    const result = await invokeLocalV2DagLambdaWorker({
    coordinatorPlanSummary: input.coordinatorPlanSummary,
    lambdaClient,
    parentPayload: input.parentPayload,
    parentScanId: input.parentScanId,
    workerLane,
    });
    input.onWorkerResult?.(result);
    return result;
  }));
}

export async function invokeLocalV2DagLambdaWorker(input: {
  coordinatorPlanSummary?: LocalV2DagLambdaCoordinatorPlanSummary;
  lambdaClient?: LambdaInvokeClient;
  parentPayload: LocalV2DagLambdaDispatchPayload;
  parentScanId: string;
  signal?: AbortSignal;
  workerLane: LocalV2DagLambdaWorkerLane;
}): Promise<LocalV2DagLambdaShardResult> {
  const lambdaClient = input.lambdaClient ?? new LambdaClient({ region: input.parentPayload.awsRegion });
  const workerLane = input.workerLane;
  const workerPayload: LocalV2DagLambdaDispatchPayload = {
    ...input.parentPayload,
    callbackCorrelationId: input.parentScanId,
    ...(input.coordinatorPlanSummary ? { coordinatorPlanSummary: input.coordinatorPlanSummary } : {}),
    ...(workerLane === "reject_observation" && input.parentPayload.postRefusalObservation
      ? {
          parentDispatchSha256: postRefusalParentDispatchSha256(input.parentPayload),
          postRefusalObservation: {
            ...input.parentPayload.postRefusalObservation,
            dispatchDelayMs: 0,
          },
        }
      : {}),
    orchestrationMode: "worker",
    scanId: input.parentScanId,
    workerLane
  };
  const invocationStartedAtMs = Date.now();
  const response = await lambdaClient.send(new InvokeCommand({
    FunctionName: input.parentPayload.functionName,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(JSON.stringify(workerPayload))
  }), { abortSignal: input.signal });
  const responseReceivedAtMs = Date.now();
  if ((response.StatusCode ?? 0) < 200 || (response.StatusCode ?? 0) >= 300) {
    throw new Error(`Local v2 DAG Lambda worker ${workerLane} was not accepted: status ${response.StatusCode ?? 0}.`);
  }
  if (response.FunctionError) {
    throw new Error(`Local v2 DAG Lambda worker ${workerLane} failed: ${response.FunctionError}.`);
  }
  return {
    ...parseLocalV2DagLambdaShardResult(response.Payload, workerLane),
    coordinatorTiming: {
      durationMs: Math.max(0, responseReceivedAtMs - invocationStartedAtMs),
      invocationStartedAt: new Date(invocationStartedAtMs).toISOString(),
      responseReceivedAt: new Date(responseReceivedAtMs).toISOString(),
    },
  };
}

async function waitForPostRefusalDispatchDelay(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Post-refusal worker dispatch aborted."));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error("Post-refusal worker dispatch aborted."));
    }, { once: true });
  });
}

export async function awaitPostRefusalWorkerWithinTailBudget(input: {
  abortController: AbortController;
  maxTailWaitMs?: number;
  passiveLaneBarrierCompletedAtMs: number;
  workerPromise: Promise<void>;
}): Promise<boolean> {
  if (input.abortController.signal.aborted) return false;
  const maxTailWaitMs = Math.max(0, Math.round(
    input.maxTailWaitMs ?? POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
  ));
  const remainingMs = input.passiveLaneBarrierCompletedAtMs + maxTailWaitMs - Date.now();
  if (remainingMs <= 0) {
    input.abortController.abort(new Error("Reject Path exceeded its post-primary join budget."));
    return false;
  }
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      input.workerPromise.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => {
          input.abortController.abort(new Error("Reject Path exceeded its post-primary join budget."));
          resolve(false);
        }, remainingMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function latestIsoTimestamp(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs)) return right;
  if (!Number.isFinite(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}

export function buildLocalV2DagLambdaLaneTimingSummary(input: {
  addedRejectWaitMs: number;
  coordinatorStartedAtMs: number;
  generatedAtMs: number;
  passiveLaneBarrierCompletedAtMs: number;
  passiveWorkerResults: LocalV2DagLambdaShardResult[];
  postRefusal: {
    dispatchStartedAtMs?: number;
    join: "disabled" | "failed" | "joined" | "not_applicable" | "timed_out";
    outcomeObservedAtMs?: number;
    result?: LocalV2DagLambdaShardResult;
  };
}): LocalV2DagLambdaLaneTimingSummary {
  const passiveLaneBarrierCompletedAtMs = Math.max(0, Math.round(input.passiveLaneBarrierCompletedAtMs));
  const timingFromResult = (
    lane: LocalV2DagLambdaEvidenceLane,
    result: LocalV2DagLambdaShardResult,
    evidenceJoined: boolean,
    outcome: LocalV2DagLambdaLaneTiming["outcome"] = "completed",
  ): LocalV2DagLambdaLaneTiming => {
    const invocationStartedAtMs = parseTimestampMs(result.coordinatorTiming?.invocationStartedAt)
      ?? parseTimestampMs(result.handlerTiming?.handlerStartedAt);
    const terminalOutcomeObservedAtMs = parseTimestampMs(result.coordinatorTiming?.responseReceivedAt)
      ?? parseTimestampMs(result.completedAt);
    const coordinatorElapsedMs = result.coordinatorTiming?.durationMs
      ?? (invocationStartedAtMs !== null && terminalOutcomeObservedAtMs !== null
        ? Math.max(0, terminalOutcomeObservedAtMs - invocationStartedAtMs)
        : result.handlerTiming?.handlerDurationMs ?? null);
    return {
      coordinatorElapsedMs,
      evidenceJoined,
      invocationStartedAt: invocationStartedAtMs === null ? null : new Date(invocationStartedAtMs).toISOString(),
      lane,
      outcome,
      terminalOutcomeDeltaFromPassiveBarrierMs: terminalOutcomeObservedAtMs === null
        ? null
        : terminalOutcomeObservedAtMs - passiveLaneBarrierCompletedAtMs,
      terminalOutcomeObservedAt: terminalOutcomeObservedAtMs === null
        ? null
        : new Date(terminalOutcomeObservedAtMs).toISOString(),
      workerReportedCompletedAt: result.completedAt ?? result.handlerTiming?.completedAt ?? null,
      workerReportedHandlerDurationMs: result.handlerTiming?.handlerDurationMs ?? null,
    };
  };

  const passiveResultsByLane = new Map(input.passiveWorkerResults.map((result) => [result.workerLane, result]));
  const lanes: LocalV2DagLambdaLaneTiming[] = LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES.map((lane) => {
    const result = passiveResultsByLane.get(lane);
    if (!result) {
      return {
        coordinatorElapsedMs: null,
        evidenceJoined: false,
        invocationStartedAt: null,
        lane,
        outcome: "failed",
        terminalOutcomeDeltaFromPassiveBarrierMs: null,
        terminalOutcomeObservedAt: null,
        workerReportedCompletedAt: null,
        workerReportedHandlerDurationMs: null,
      };
    }
    return timingFromResult(lane, result, true);
  });

  let rejectTiming: LocalV2DagLambdaLaneTiming;
  if (input.postRefusal.result && input.postRefusal.join !== "not_applicable") {
    rejectTiming = timingFromResult(
      "reject_observation",
      input.postRefusal.result,
      input.postRefusal.join === "joined",
      input.postRefusal.join === "joined" ? "completed" : input.postRefusal.join,
    );
  } else {
    const invocationStartedAtMs = input.postRefusal.dispatchStartedAtMs ?? null;
    const terminalOutcomeObservedAtMs = input.postRefusal.outcomeObservedAtMs ?? null;
    rejectTiming = {
      coordinatorElapsedMs: invocationStartedAtMs !== null && terminalOutcomeObservedAtMs !== null
        ? Math.max(0, terminalOutcomeObservedAtMs - invocationStartedAtMs)
        : null,
      evidenceJoined: false,
      invocationStartedAt: invocationStartedAtMs === null ? null : new Date(invocationStartedAtMs).toISOString(),
      lane: "reject_observation",
      outcome: input.postRefusal.join === "joined" ? "failed" : input.postRefusal.join,
      terminalOutcomeDeltaFromPassiveBarrierMs: terminalOutcomeObservedAtMs === null
        ? null
        : terminalOutcomeObservedAtMs - passiveLaneBarrierCompletedAtMs,
      terminalOutcomeObservedAt: terminalOutcomeObservedAtMs === null
        ? null
        : new Date(terminalOutcomeObservedAtMs).toISOString(),
      workerReportedCompletedAt: null,
      workerReportedHandlerDurationMs: null,
    };
  }
  lanes.push(rejectTiming);
  const rejectReturnedAtMs = input.postRefusal.join === "not_applicable" || !input.postRefusal.result
    ? input.postRefusal.outcomeObservedAtMs ?? null
    : parseTimestampMs(input.postRefusal.result.coordinatorTiming?.responseReceivedAt)
      ?? parseTimestampMs(input.postRefusal.result.completedAt);
  const rejectTailDeltaMs = rejectReturnedAtMs === null
    ? null
    : rejectReturnedAtMs - passiveLaneBarrierCompletedAtMs;

  return {
    contractVersion: LOCAL_V2_DAG_LAMBDA_LANE_TIMING_CONTRACT_VERSION,
    coordinatorStartedAt: new Date(input.coordinatorStartedAtMs).toISOString(),
    generatedAt: new Date(input.generatedAtMs).toISOString(),
    lanes,
    maxRejectTailWaitMs: POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
    passiveLaneBarrierCompletedAt: new Date(passiveLaneBarrierCompletedAtMs).toISOString(),
    rejectCompletedBeforeOrAtPassiveBarrier: rejectTailDeltaMs === null ? null : rejectTailDeltaMs <= 0,
    rejectLaneAddedWaitMs: Math.max(0, Math.round(input.addedRejectWaitMs)),
    rejectLaneJoin: input.postRefusal.join,
    rejectTailDeltaMs,
  };
}

function parseTimestampMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLocalV2DagLambdaShardResult(
  payload: Uint8Array | undefined,
  expectedWorkerLane: LocalV2DagLambdaWorkerLane
): LocalV2DagLambdaShardResult {
  if (!payload) {
    throw new Error(`Local v2 DAG Lambda worker ${expectedWorkerLane} returned no payload.`);
  }
  const parsed = asRecord(JSON.parse(Buffer.from(payload).toString("utf8")));
  const workerLane = parsed.workerLane;
  if (workerLane !== expectedWorkerLane || !isWorkerLane(workerLane)) {
    throw new Error(`Local v2 DAG Lambda worker response lane mismatch for ${expectedWorkerLane}.`);
  }
  if (parsed.status !== "completed") {
    const errorMessage = compactString(asRecord(parsed.error).message);
    throw new Error(`Local v2 DAG Lambda worker ${expectedWorkerLane} returned ${String(parsed.status)}${errorMessage ? `: ${errorMessage}` : "."}`);
  }
  const artifactPointers = parseArtifactPointersRecord(parsed.artifactPointers);
  const completedAt = compactString(parsed.completedAt) ?? undefined;
  const handlerTiming = parseLocalV2DagLambdaHandlerTimingRecord(parsed.handlerTiming);
  const postRefusalEvidence = parsed.postRefusalEvidence === undefined
    ? undefined
    : postRefusalLambdaEvidenceDescriptorSchema.parse(parsed.postRefusalEvidence);
  const consentRejectAvailabilityRecord = asRecord(parsed.consentRejectAvailability);
  const consentRejectAvailability =
    typeof consentRejectAvailabilityRecord.inventoryComplete === "boolean" &&
    typeof consentRejectAvailabilityRecord.rejectControlObserved === "boolean"
      ? {
          inventoryComplete: consentRejectAvailabilityRecord.inventoryComplete,
          rejectControlObserved: consentRejectAvailabilityRecord.rejectControlObserved,
        }
      : undefined;
  if (expectedWorkerLane === "reject_observation" && !artifactPointers.postRefusalPacketUri) {
    throw new Error("Local v2 DAG Lambda reject_observation worker did not return a post-refusal packet URI.");
  }
  if (expectedWorkerLane !== "reject_observation" && !artifactPointers.scanArtifactUri) {
    throw new Error(`Local v2 DAG Lambda worker ${expectedWorkerLane} did not return a scan artifact URI.`);
  }
  return {
    artifactMetadata: parseArtifactMetadataRecord(parsed.artifactMetadata),
    artifactPointers,
    ...(completedAt ? { completedAt } : {}),
    ...(handlerTiming ? { handlerTiming } : {}),
    phaseTimings: parsePhaseTimings(parsed.phaseTimings),
    ...(postRefusalEvidence ? { postRefusalEvidence } : {}),
    ...(consentRejectAvailability ? { consentRejectAvailability } : {}),
    scanId: requireString(parsed, "scanId"),
    status: "completed",
    workerLane
  };
}

function parseLocalV2DagLambdaHandlerTimingRecord(value: unknown): LocalV2DagLambdaHandlerTiming | undefined {
  const record = asRecord(value);
  const completedAt = compactString(record.completedAt);
  const handlerStartedAt = compactString(record.handlerStartedAt);
  const handlerDurationMs = finiteNonNegativeNumber(record.handlerDurationMs);
  if (!completedAt || !handlerStartedAt || handlerDurationMs === undefined) return undefined;
  const optionalDuration = (field: string) => finiteNonNegativeNumber(record[field]);
  const optionalString = (field: string) => compactString(record[field]);
  return {
    ...(optionalString("artifactChainCompletedAt")
      ? { artifactChainCompletedAt: optionalString("artifactChainCompletedAt")! }
      : {}),
    ...(optionalDuration("artifactChainDurationMs") !== undefined
      ? { artifactChainDurationMs: Math.round(optionalDuration("artifactChainDurationMs")!) }
      : {}),
    ...(optionalString("artifactChainStartedAt")
      ? { artifactChainStartedAt: optionalString("artifactChainStartedAt")! }
      : {}),
    completedAt,
    ...(optionalString("firstPhaseLabel") ? { firstPhaseLabel: optionalString("firstPhaseLabel")!.slice(0, 80) } : {}),
    ...(optionalString("firstPhaseStartedAt") ? { firstPhaseStartedAt: optionalString("firstPhaseStartedAt")! } : {}),
    handlerDurationMs: Math.round(handlerDurationMs),
    handlerStartedAt,
    ...(optionalString("scanPhaseCompletedAt") ? { scanPhaseCompletedAt: optionalString("scanPhaseCompletedAt")! } : {}),
    ...(optionalDuration("scanPhaseDurationMs") !== undefined
      ? { scanPhaseDurationMs: Math.round(optionalDuration("scanPhaseDurationMs")!) }
      : {}),
    ...(optionalString("scanPhaseLabel") ? { scanPhaseLabel: optionalString("scanPhaseLabel")!.slice(0, 80) } : {}),
    ...(optionalString("scanPhaseStartedAt") ? { scanPhaseStartedAt: optionalString("scanPhaseStartedAt")! } : {}),
  };
}

function parseArtifactPointersRecord(value: unknown): LocalV2DagLambdaArtifactPointers {
  const record = asRecord(value);
  return {
    failureDiagnosticUri: compactString(record.failureDiagnosticUri) ?? undefined,
    manifestUri: compactString(record.manifestUri) ?? undefined,
    reportAdapterArtifactUri: compactString(record.reportAdapterArtifactUri) ?? undefined,
    reviewArtifactUri: compactString(record.reviewArtifactUri) ?? undefined,
    scanArtifactUri: compactString(record.scanArtifactUri) ?? undefined,
    postRefusalPacketUri: compactString(record.postRefusalPacketUri) ?? undefined,
  };
}

function parseArtifactMetadataRecord(value: unknown): LocalV2DagLambdaArtifactMetadata {
  const record = asRecord(value);
  return {
    failureDiagnosticUri: parseArtifactMetadataEntry(record.failureDiagnosticUri),
    manifestUri: parseArtifactMetadataEntry(record.manifestUri),
    reportAdapterArtifactUri: parseArtifactMetadataEntry(record.reportAdapterArtifactUri),
    reviewArtifactUri: parseArtifactMetadataEntry(record.reviewArtifactUri),
    scanArtifactUri: parseArtifactMetadataEntry(record.scanArtifactUri),
    postRefusalPacketUri: parseArtifactMetadataEntry(record.postRefusalPacketUri),
  };
}

function parseArtifactMetadataEntry(value: unknown) {
  const record = asRecord(value);
  const sha256 = compactString(record.sha256);
  const sizeBytes = typeof record.sizeBytes === "number" ? record.sizeBytes : null;
  return sha256 && sizeBytes !== null ? { sha256, sizeBytes } : undefined;
}

function parseLaneTimingSummaryRecord(value: unknown): LocalV2DagLambdaLaneTimingSummary | undefined {
  const record = asRecord(value);
  if (record.contractVersion !== LOCAL_V2_DAG_LAMBDA_LANE_TIMING_CONTRACT_VERSION) return undefined;
  const coordinatorStartedAt = compactString(record.coordinatorStartedAt);
  const generatedAt = compactString(record.generatedAt);
  const passiveLaneBarrierCompletedAt = compactString(record.passiveLaneBarrierCompletedAt);
  const rejectLaneJoin = record.rejectLaneJoin;
  const integer = (candidate: unknown, nonnegative = false) => {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) return null;
    const rounded = Math.round(candidate);
    return nonnegative ? Math.max(0, rounded) : rounded;
  };
  const maxRejectTailWaitMs = integer(record.maxRejectTailWaitMs, true);
  const rejectLaneAddedWaitMs = integer(record.rejectLaneAddedWaitMs, true);
  if (
    !coordinatorStartedAt || !generatedAt || !passiveLaneBarrierCompletedAt ||
    !Number.isFinite(Date.parse(coordinatorStartedAt)) ||
    !Number.isFinite(Date.parse(generatedAt)) ||
    !Number.isFinite(Date.parse(passiveLaneBarrierCompletedAt)) ||
    maxRejectTailWaitMs === null || rejectLaneAddedWaitMs === null ||
    (rejectLaneJoin !== "disabled" && rejectLaneJoin !== "failed" &&
      rejectLaneJoin !== "joined" && rejectLaneJoin !== "not_applicable" &&
      rejectLaneJoin !== "timed_out") ||
    !Array.isArray(record.lanes)
  ) return undefined;
  const validLanes = new Set<LocalV2DagLambdaEvidenceLane>([
    "consent_proof",
    "runtime_evidence",
    "policy_evidence",
    "reject_observation",
  ]);
  const validOutcomes = new Set<LocalV2DagLambdaLaneTiming["outcome"]>([
    "completed",
    "disabled",
    "failed",
    "not_applicable",
    "timed_out",
  ]);
  const lanes = record.lanes.flatMap((candidate): LocalV2DagLambdaLaneTiming[] => {
    const laneRecord = asRecord(candidate);
    const lane = compactString(laneRecord.lane) as LocalV2DagLambdaEvidenceLane | null;
    const outcome = compactString(laneRecord.outcome) as LocalV2DagLambdaLaneTiming["outcome"] | null;
    if (!lane || !validLanes.has(lane) || !outcome || !validOutcomes.has(outcome)) return [];
    const nullableDate = (field: string) => {
      const parsed = compactString(laneRecord[field]);
      return parsed && Number.isFinite(Date.parse(parsed)) ? parsed : null;
    };
    const nullableInteger = (field: string, nonnegative = false) =>
      laneRecord[field] === null || laneRecord[field] === undefined
        ? null
        : integer(laneRecord[field], nonnegative);
    return [{
      coordinatorElapsedMs: nullableInteger("coordinatorElapsedMs", true),
      evidenceJoined: laneRecord.evidenceJoined === true,
      invocationStartedAt: nullableDate("invocationStartedAt"),
      lane,
      outcome,
      terminalOutcomeDeltaFromPassiveBarrierMs: nullableInteger("terminalOutcomeDeltaFromPassiveBarrierMs"),
      terminalOutcomeObservedAt: nullableDate("terminalOutcomeObservedAt"),
      workerReportedCompletedAt: nullableDate("workerReportedCompletedAt"),
      workerReportedHandlerDurationMs: nullableInteger("workerReportedHandlerDurationMs", true),
    }];
  });
  if (lanes.length !== 4 || new Set(lanes.map((lane) => lane.lane)).size !== 4) return undefined;
  const rejectCompleted = record.rejectCompletedBeforeOrAtPassiveBarrier;
  return {
    contractVersion: LOCAL_V2_DAG_LAMBDA_LANE_TIMING_CONTRACT_VERSION,
    coordinatorStartedAt,
    generatedAt,
    lanes,
    maxRejectTailWaitMs,
    passiveLaneBarrierCompletedAt,
    rejectCompletedBeforeOrAtPassiveBarrier: typeof rejectCompleted === "boolean" ? rejectCompleted : null,
    rejectLaneAddedWaitMs,
    rejectLaneJoin,
    rejectTailDeltaMs: integer(record.rejectTailDeltaMs),
  };
}

function parsePhaseTimings(value: unknown): LocalV2DagLambdaPhaseTiming[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const record = asRecord(entry);
      const label = compactString(record.label);
      const durationMs = typeof record.durationMs === "number" ? record.durationMs : null;
      const completedAt = compactString(record.completedAt);
      const startedAt = compactString(record.startedAt);
      const memoryAfterMb = finiteNonNegativeNumber(record.memoryAfterMb);
      const memoryBeforeMb = finiteNonNegativeNumber(record.memoryBeforeMb);
      const memoryLimitMb = finiteNonNegativeNumber(record.memoryLimitMb);
      const processRssAfterMb = finiteNonNegativeNumber(record.processRssAfterMb);
      const processRssBeforeMb = finiteNonNegativeNumber(record.processRssBeforeMb);
      const status =
        record.status === "failed" || record.status === "completed" || record.status === "skipped"
          ? record.status
          : null;
      return label && durationMs !== null && status
        ? [{
            ...(completedAt ? { completedAt } : {}),
            durationMs,
            label,
            ...(memoryAfterMb !== undefined ? { memoryAfterMb } : {}),
            ...(memoryBeforeMb !== undefined ? { memoryBeforeMb } : {}),
            ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {}),
            ...(processRssAfterMb !== undefined ? { processRssAfterMb } : {}),
            ...(processRssBeforeMb !== undefined ? { processRssBeforeMb } : {}),
            ...(startedAt ? { startedAt } : {}),
            status
          }]
        : [];
    })
    : [];
}

function finiteNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readWorkerBundleFromArtifactResult(
  result: LocalV2DagLambdaShardResult,
  options: { awsRegion?: LocalV2DagLambdaAwsRegion; s3GetClient?: S3GetClient }
) {
  const uri = result.artifactPointers?.scanArtifactUri;
  if (!uri) {
    throw new Error(`Local v2 DAG Lambda worker ${result.workerLane} did not include a scan artifact pointer.`);
  }
  const { bucket, key } = parseS3Uri(uri);
  const s3Client = options.s3GetClient ?? localV2DagLambdaS3Client(options.awsRegion ?? LOCAL_V2_DAG_LAMBDA_AWS_REGION);
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(response.Body);
  const expected = result.artifactMetadata?.scanArtifactUri;
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (expected?.sha256 && expected.sha256 !== sha256) {
    throw new Error(`Local v2 DAG Lambda worker ${result.workerLane} scan artifact checksum mismatch.`);
  }
  return canonicalEvidenceBundleSchema.parse(JSON.parse(body.toString("utf8")));
}

async function readConsentRejectAvailabilityFromArtifactRoot(artifactRoot: string) {
  try {
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(
      await readFile(path.join(artifactRoot, "CanonicalEvidenceBundle.json"), "utf8"),
    ));
    return {
      inventoryComplete: bundle.consentSurfaceInspection?.inspectionCompleted === true,
      rejectControlObserved: bundle.consentUiObservations.some((observation) =>
        observation.rejectControlObserved ||
        observation.controls.some((control) => control.actionType === "reject_all")
      ),
    };
  } catch {
    return undefined;
  }
}

async function readPostRefusalPacketFromArtifactResult(
  result: LocalV2DagLambdaShardResult,
  options: {
    awsRegion?: LocalV2DagLambdaAwsRegion;
    s3GetClient?: S3GetClient;
    signal?: AbortSignal;
  },
) {
  const uri = result.artifactPointers?.postRefusalPacketUri;
  if (!uri) {
    throw new Error("Local v2 DAG Lambda reject_observation worker did not include a packet pointer.");
  }
  const { bucket, key } = parseS3Uri(uri);
  const s3Client = options.s3GetClient ?? localV2DagLambdaS3Client(
    options.awsRegion ?? LOCAL_V2_DAG_LAMBDA_AWS_REGION,
  );
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { abortSignal: options.signal },
  );
  const body = await streamToBuffer(response.Body);
  const expected = result.artifactMetadata?.postRefusalPacketUri;
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (!expected || expected.sha256 !== sha256 || expected.sizeBytes !== body.byteLength) {
    throw new Error("Local v2 DAG Lambda post-refusal packet checksum or size mismatch.");
  }
  const packet = postRefusalEvidencePacketSchema.parse(JSON.parse(body.toString("utf8")));
  if (packet.parentScanId !== result.scanId) {
    throw new Error("Local v2 DAG Lambda post-refusal packet parent scan identity mismatch.");
  }
  return packet;
}

export async function mirrorWorkerArtifactsIntoFinalArtifactRoot(input: {
  artifactRoot: string;
  awsRegion?: LocalV2DagLambdaAwsRegion;
  s3GetClient?: S3GetClient;
  workerResults: LocalV2DagLambdaShardResult[];
}) {
  const s3Client = input.s3GetClient ?? localV2DagLambdaS3Client(input.awsRegion ?? LOCAL_V2_DAG_LAMBDA_AWS_REGION);
  await Promise.all(input.workerResults.map(async (result) => {
    const manifestUri = result.artifactPointers?.manifestUri;
    if (!manifestUri) {
      return;
    }
    const manifestBody = await readS3ObjectBody(manifestUri, s3Client);
    const manifestFileName = safeAuxiliaryFileName(`worker-${result.workerLane}-LocalV2DagLambdaManifest.json`);
    await writeFile(path.join(input.artifactRoot, manifestFileName), manifestBody);
    const manifest = asRecord(JSON.parse(manifestBody.toString("utf8")));
    const auxiliaryArtifacts = Array.isArray(manifest.auxiliaryArtifacts) ? manifest.auxiliaryArtifacts : [];
    await Promise.all(auxiliaryArtifacts.flatMap((value) => {
      const artifact = asRecord(value);
      const fileName = compactString(artifact.fileName);
      const uri = compactString(artifact.uri);
      if (!fileName || !uri || !isSupportedAuxiliaryFileName(fileName)) {
        return [];
      }
      return [async () => {
        const body = await readS3ObjectBody(uri, s3Client);
        const expectedSha256 = compactString(artifact.sha256);
        const sha256 = createHash("sha256").update(body).digest("hex");
        if (expectedSha256 && expectedSha256 !== sha256) {
          throw new Error(`Local v2 DAG Lambda worker ${result.workerLane} auxiliary artifact checksum mismatch for ${fileName}.`);
        }
        const expectedSizeBytes = typeof artifact.sizeBytes === "number" ? artifact.sizeBytes : null;
        if (expectedSizeBytes !== null && expectedSizeBytes !== body.byteLength) {
          throw new Error(`Local v2 DAG Lambda worker ${result.workerLane} auxiliary artifact size mismatch for ${fileName}.`);
        }
        const workerFileName = safeAuxiliaryFileName(`worker-${result.workerLane}-${fileName}`);
        await writeFile(path.join(input.artifactRoot, workerFileName), body);
        if (shouldPromoteEvidenceLaneArtifact(result.workerLane, fileName)) {
          await writeFile(path.join(input.artifactRoot, safeAuxiliaryFileName(fileName)), body);
        }
      }];
    }).map((mirror) => mirror()));
  }));
}

function shouldPromoteEvidenceLaneArtifact(
  workerLane: LocalV2DagLambdaWorkerLane,
  fileName: string,
) {
  if (workerLane === "consent_proof") {
    return fileName === "ConsentControlGeometryEvidence.json" ||
      fileName === "dom-text-pre-consent.txt" ||
      /^screenshot-pre-consent(?:-[a-z0-9-]+)?\.(?:png|jpe?g)$/i.test(fileName);
  }
  if (workerLane === "runtime_evidence") {
    return fileName === "TransportSecurityObservation.json";
  }
  if (workerLane === "policy_evidence") {
    return fileName === "PolicySurfaceCaptureDiagnostics.json" ||
      /^policy_(?:excerpt|surface_text)_[a-z0-9_-]+\.txt$/i.test(fileName);
  }
  return false;
}

async function readS3ObjectBody(uri: string, s3Client: S3GetClient) {
  const { bucket, key } = parseS3Uri(uri);
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return streamToBuffer(response.Body);
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Local v2 DAG Lambda shard artifact object did not include a body.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  if (typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  throw new Error("Unsupported local v2 DAG Lambda shard artifact response body.");
}

function safeAuxiliaryFileName(fileName: string) {
  if (!isSupportedAuxiliaryFileName(fileName)) {
    throw new Error(`Local v2 DAG Lambda auxiliary artifact file name is unsupported: ${fileName.slice(0, 80)}.`);
  }
  return fileName;
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

function mergeAutomatedAccessObservations(
  bundles: CanonicalEvidenceBundle[],
): CanonicalEvidenceBundle["automatedAccessObservation"] {
  const observations = bundles
    .map((bundle) => bundle.automatedAccessObservation)
    .filter((observation): observation is NonNullable<CanonicalEvidenceBundle["automatedAccessObservation"]> =>
      Boolean(observation)
    );
  if (observations.length === 0) return undefined;

  const enabled = observations.some((observation) => observation.webBotAuth.enabled);
  const signedHttpsRequestCount = Math.max(
    0,
    ...observations.map((observation) => observation.webBotAuth.signedHttpsRequestCount),
  );
  const signedNavigationRequestCount = Math.max(
    0,
    ...observations.map((observation) => observation.webBotAuth.signedNavigationRequestCount),
  );
  const providerCandidates = uniqueStrings(
    observations.flatMap((observation) => observation.targetInfrastructure.providerCandidates),
  ).filter((provider): provider is NonNullable<CanonicalEvidenceBundle["automatedAccessObservation"]>["targetInfrastructure"]["providerCandidates"][number] =>
    ["akamai", "cloudflare", "fastly", "imperva", "kasada"].includes(provider)
  ).slice(0, 5);
  return {
    status: "available",
    version: "automated-access-observation-v1",
    productionProjectable: false,
    webBotAuth: {
      enabled,
      signingOutcome: !enabled
        ? "disabled"
        : signedHttpsRequestCount > 0
          ? "applied"
          : "configured_no_https_request",
      signedHttpsRequestCount,
      signedNavigationRequestCount,
    },
    targetInfrastructure: {
      cloudflareObserved: providerCandidates.includes("cloudflare"),
      providerCandidates,
      signalCodes: uniqueStrings(
        observations.flatMap((observation) => observation.targetInfrastructure.signalCodes),
      ).slice(0, 16),
    },
  };
}

export function mergeLocalV2DagLambdaShardBundles(input: {
  base: CanonicalEvidenceBundle;
  scanId: string;
  workerBundles: CanonicalEvidenceBundle[];
}): CanonicalEvidenceBundle {
  const bundles = [input.base, ...input.workerBundles];
  const runtimeEvidenceBundle = bundles.find((bundle) =>
    bundle.scanLaneRuns.some((lane) => lane.laneId === "runtime_evidence")
  );
  const homepageScreenshot = bundles.find(
    (bundle) => bundle.homepageScreenshot?.status === "withheld" &&
      bundle.homepageScreenshot.reason === "sensitive_visual_content",
  )?.homepageScreenshot ?? bundles.find(
    (bundle) => bundle.homepageScreenshot?.status === "withheld",
  )?.homepageScreenshot ?? bundles.find(
    (bundle) => bundle.homepageScreenshot?.status === "available",
  )?.homepageScreenshot;
  const merged = {
    ...input.base,
    scanId: input.scanId,
    completedAt: new Date().toISOString(),
    modulesRun: dedupeByJson(bundles.flatMap((bundle) => bundle.modulesRun)),
    runtimeTimeline: dedupeByEventId(bundles.flatMap((bundle) => bundle.runtimeTimeline)),
    networkEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.networkEvents)),
    networkResponseEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.networkResponseEvents)),
    automatedAccessObservation: mergeAutomatedAccessObservations(bundles),
    cookieEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.cookieEvents)),
    cookieSnapshots: dedupeByArtifactId(bundles.flatMap((bundle) => bundle.cookieSnapshots)),
    storageSnapshots: dedupeByArtifactId(bundles.flatMap((bundle) => bundle.storageSnapshots)),
    scriptEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.scriptEvents)),
    iframeEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.iframeEvents)),
    collectionSurfaceInventory: runtimeEvidenceBundle?.collectionSurfaceInventory,
    consentUiObservations: dedupeByField(bundles.flatMap((bundle) => bundle.consentUiObservations), "observationId"),
    consentInteractionEvents: dedupeByField(bundles.flatMap((bundle) => bundle.consentInteractionEvents), "eventId"),
    consentFlowObservations: dedupeByField(bundles.flatMap((bundle) => bundle.consentFlowObservations), "observationId"),
    consentActionCandidates: dedupeByField(bundles.flatMap((bundle) => bundle.consentActionCandidates), "candidateId"),
    consentActionAttempts: dedupeByField(bundles.flatMap((bundle) => bundle.consentActionAttempts), "attemptId"),
    consentFlowComparisons: [] as CanonicalEvidenceBundle["consentFlowComparisons"],
    policySurfaceObservations: applyGoverningPolicySelection(
      bundles.reduce(
        (observations, bundle) => mergePolicySurfaceObservations(observations, bundle.policySurfaceObservations),
        [] as CanonicalEvidenceBundle["policySurfaceObservations"],
      ),
    ),
    cmpRuntimeObservations: dedupeByField(bundles.flatMap((bundle) => bundle.cmpRuntimeObservations), "observationId"),
    screenshots: selectDiagnosticScreenshot(bundles.flatMap((bundle) => bundle.screenshots)),
    ...(homepageScreenshot ? { homepageScreenshot } : {}),
    domSnapshots: dedupeByArtifactId(bundles.flatMap((bundle) => bundle.domSnapshots)),
    normalizedVendorObservations: dedupeByField(bundles.flatMap((bundle) => bundle.normalizedVendorObservations), "vendorObservationId"),
    observedJourneys: dedupeByField(bundles.flatMap((bundle) => bundle.observedJourneys), "journeyId"),
    artifactRefs: dedupeByField(bundles.flatMap((bundle) => bundle.artifactRefs), "artifactId"),
    derivedRuntimeSignals: mergeDerivedRuntimeSignals(bundles),
    runtimeCoverage: mergeRuntimeCoverage(bundles)
  };
  merged.consentFlowComparisons = mergeShardConsentFlowComparisons(bundles);
  return canonicalEvidenceBundleSchema.parse(merged);
}

export function mergeLocalV2DagLambdaEvidenceLaneBundles(input: {
  artifactRoot: string;
  consentProof: CanonicalEvidenceBundle;
  policyEvidence: CanonicalEvidenceBundle;
  runtimeEvidence: CanonicalEvidenceBundle;
  scanId: string;
}): CanonicalEvidenceBundle {
  const consentProof = rewriteEvidenceLaneArtifactPaths(input.consentProof, "consent_proof", input.artifactRoot);
  const runtimeEvidence = rewriteEvidenceLaneArtifactPaths(input.runtimeEvidence, "runtime_evidence", input.artifactRoot);
  const policyEvidence = rewriteEvidenceLaneArtifactPaths(input.policyEvidence, "policy_evidence", input.artifactRoot);
  const runtimeCoverage = runtimeEvidence.runtimeCoverage;
  if (!runtimeCoverage) {
    throw new Error("Three-lane Lambda evidence merge requires typed runtime coverage from the runtime-evidence lane.");
  }
  const policySurfaceObservations = policyEvidence.policySurfaceObservations;
  const transportSecurityObservations = runtimeEvidence.transportSecurityObservations ?? [];
  const consentProofVisualUsable = consentProof.visualCapture?.status === "available" &&
    consentProof.screenshots.some((screenshot) =>
      screenshot.captureMethod !== "primary_placeholder" &&
      screenshot.captureMethod !== "fresh_context_placeholder" &&
      screenshot.retentionStatus === "available"
    );
  const consentProofInspectionUsable = consentProof.consentSurfaceInspection?.inspectionCompleted === true &&
    consentProof.consentSurfaceInspection.coverageStatus === "complete";
  const noGoReconciliation = reconcileEvidenceLaneNoGoAssessment({
    consentProof,
    consentProofVisualUsable,
    runtimeEvidence,
  });
  const scanNoGoAssessment = noGoReconciliation.scanNoGoAssessment;
  const visualAccessReview = noGoReconciliation.visualAccessReview;
  const consentLaneStatus = (consentProof.scanNoGoAssessment ?? consentProof.scan_no_go_assessment)?.decision === "no_go"
    ? consentProof.screenshots.length > 0 || consentProof.consentUiObservations.length > 0
      ? "limited" as const
      : "not_testable" as const
    : consentProofVisualUsable && consentProofInspectionUsable
    ? "usable" as const
    : consentProof.screenshots.length > 0 || consentProof.consentUiObservations.length > 0
      ? "limited" as const
      : "not_testable" as const;
  const baseScanEvidenceLaneAssessment = buildScanEvidenceLaneAssessment({
    consentLaneStatus,
    consentLimitationKeys: [
      ...(!consentProofVisualUsable ? ["representative_pre_consent_screenshot_unavailable"] : []),
      ...(!consentProofInspectionUsable ? ["consent_control_inventory_incomplete"] : []),
    ],
    normalizedUrl: consentProof.normalizedUrl,
    policySurfaceObservations,
    runtimeCoverage,
    scanNoGoAssessment: scanNoGoAssessment ?? null,
    transportSecurityObservationCount: transportSecurityObservations.length,
  });
  const scanEvidenceLaneAssessment = noGoReconciliation.disagreement
    ? {
        ...baseScanEvidenceLaneAssessment,
        outcome: "partial_with_diagnostics" as const,
        limitationKeys: uniqueStrings([
          ...baseScanEvidenceLaneAssessment.limitationKeys,
          "evidence_lane_access_disagreement",
          `${noGoReconciliation.noGoLane}_lane_no_go`,
          `${noGoReconciliation.representativeLane}_lane_representative_page`,
        ]).slice(0, 24),
        evidenceRefs: uniqueStrings([
          ...baseScanEvidenceLaneAssessment.evidenceRefs,
          "scan_runtime_artifacts.scan_lane_runs",
        ]).slice(0, 24),
      }
    : baseScanEvidenceLaneAssessment;
  const artifactRefs = dedupeByField([
    ...consentProof.artifactRefs,
    ...runtimeEvidence.artifactRefs,
    ...policyEvidence.artifactRefs,
  ], "artifactId");
  const modulesRun = dedupeByJson([
    ...consentProof.modulesRun,
    ...runtimeEvidence.modulesRun,
    ...policyEvidence.modulesRun,
  ]);
  const merged = {
    ...consentProof,
    scanId: input.scanId,
    completedAt: new Date().toISOString(),
    scanProfile: {
      ...consentProof.scanProfile,
      enabledModules: ["preConsentRuntimeScanner", "policySurfaceScanner"],
      label: "Three-lane consent, runtime, and policy scan",
    },
    modulesRun,
    scanLaneRuns: [
      ...consentProof.scanLaneRuns,
      ...runtimeEvidence.scanLaneRuns,
      ...policyEvidence.scanLaneRuns,
    ],
    runtimeTimeline: runtimeEvidence.runtimeTimeline,
    networkEvents: runtimeEvidence.networkEvents,
    networkResponseEvents: runtimeEvidence.networkResponseEvents,
    automatedAccessObservation: runtimeEvidence.automatedAccessObservation,
    cookieEvents: runtimeEvidence.cookieEvents,
    cookieSnapshots: runtimeEvidence.cookieSnapshots,
    storageSnapshots: runtimeEvidence.storageSnapshots,
    scriptEvents: runtimeEvidence.scriptEvents,
    iframeEvents: runtimeEvidence.iframeEvents,
    collectionSurfaceInventory: runtimeEvidence.collectionSurfaceInventory,
    collectionSurfaceObservations: runtimeEvidence.collectionSurfaceObservations ?? [],
    consentUiObservations: consentProof.consentUiObservations,
    consentInteractionEvents: consentProof.consentInteractionEvents,
    consentFlowObservations: consentProof.consentFlowObservations,
    consentActionCandidates: consentProof.consentActionCandidates,
    consentActionAttempts: consentProof.consentActionAttempts,
    consentFlowComparisons: consentProof.consentFlowComparisons,
    cmpRuntimeObservations: consentProof.cmpRuntimeObservations,
    policySurfaceObservations,
    transportSecurityObservations,
    screenshots: consentProof.screenshots,
    domSnapshots: consentProof.domSnapshots,
    normalizedVendorObservations: runtimeEvidence.normalizedVendorObservations,
    observedJourneys: runtimeEvidence.observedJourneys,
    artifactRefs,
    derivedRuntimeSignals: {
      ...runtimeEvidence.derivedRuntimeSignals,
      consentBannerLikelyPresent: consentProof.derivedRuntimeSignals.consentBannerLikelyPresent,
      notes: uniqueStrings([
        ...(runtimeEvidence.derivedRuntimeSignals.notes ?? []),
        "Consent, runtime, and policy evidence were captured by independent bounded Lambda lanes.",
      ]),
    },
    runtimeCoverage,
    consentSurfaceInspection: consentProof.consentSurfaceInspection,
    policySurfaceInspection: policyEvidence.policySurfaceInspection,
    visualCapture: consentProof.visualCapture,
    ...(scanNoGoAssessment
      ? {
          scanNoGoAssessment,
          scan_no_go_assessment: scanNoGoAssessment,
        }
      : {}),
    ...(visualAccessReview
      ? {
          visualAccessReview,
          visual_access_review: visualAccessReview,
        }
      : {}),
    scanEvidenceLaneAssessment,
    scan_evidence_lane_assessment: scanEvidenceLaneAssessment,
  };
  return canonicalEvidenceBundleSchema.parse(merged);
}

function reconcileEvidenceLaneNoGoAssessment(input: {
  consentProof: CanonicalEvidenceBundle;
  consentProofVisualUsable: boolean;
  runtimeEvidence: CanonicalEvidenceBundle;
}): {
  disagreement: boolean;
  noGoLane: "consent_proof" | "runtime_evidence" | null;
  representativeLane: "consent_proof" | "runtime_evidence" | null;
  scanNoGoAssessment: ScanNoGoAssessment | null;
  visualAccessReview: CanonicalEvidenceBundle["visualAccessReview"] | null;
} {
  const consentAssessment = input.consentProof.scanNoGoAssessment ?? input.consentProof.scan_no_go_assessment;
  const runtimeAssessment = input.runtimeEvidence.scanNoGoAssessment ?? input.runtimeEvidence.scan_no_go_assessment;
  const consentVisualReview = input.consentProof.visualAccessReview ?? input.consentProof.visual_access_review;
  const runtimeVisualReview = input.runtimeEvidence.visualAccessReview ?? input.runtimeEvidence.visual_access_review;
  const consentNoGo = consentAssessment?.decision === "no_go";
  const runtimeNoGo = runtimeAssessment?.decision === "no_go";
  const consentRun = input.consentProof.scanLaneRuns.find((lane) => lane.laneId === "consent_proof");
  const runtimeRun = input.runtimeEvidence.scanLaneRuns.find((lane) => lane.laneId === "runtime_evidence");
  const consentRepresentative = input.consentProofVisualUsable &&
    consentRun?.executionOutcome === "success" &&
    consentRun.accessOutcome === "representative_page";
  const runtimeRepresentative = input.runtimeEvidence.runtimeCoverage?.coverageStatus !== "limited_none" &&
    runtimeRun?.executionOutcome === "success" &&
    runtimeRun.accessOutcome === "representative_page";
  const noGoLane = consentNoGo && !runtimeNoGo && runtimeRepresentative
    ? "consent_proof" as const
    : runtimeNoGo && !consentNoGo && consentRepresentative
      ? "runtime_evidence" as const
      : null;
  const representativeLane = noGoLane === "consent_proof"
    ? "runtime_evidence" as const
    : noGoLane === "runtime_evidence"
      ? "consent_proof" as const
      : null;
  const selectedAssessment = consentNoGo
    ? consentAssessment
    : runtimeNoGo
      ? runtimeAssessment
      : consentAssessment ?? runtimeAssessment;
  const selectedVisualReview = consentNoGo
    ? consentVisualReview
    : runtimeNoGo
      ? runtimeVisualReview
      : consentVisualReview ?? runtimeVisualReview;
  if (!selectedAssessment || !noGoLane || !representativeLane) {
    return {
      disagreement: false,
      noGoLane: null,
      representativeLane: null,
      scanNoGoAssessment: selectedAssessment ?? null,
      visualAccessReview: selectedVisualReview ?? null,
    };
  }
  return {
    disagreement: true,
    noGoLane,
    representativeLane,
    scanNoGoAssessment: {
      ...selectedAssessment,
      decision: "continue_with_diagnostics",
      scanNoGoConfidence: Math.min(selectedAssessment.scanNoGoConfidence, 0.72),
      contradictorCodes: uniqueStrings([
        ...selectedAssessment.contradictorCodes,
        `independent_${representativeLane}_representative_page`,
      ]).slice(0, 16),
      supportingSignals: {
        ...selectedAssessment.supportingSignals,
        evidenceLaneAccessDisagreement: true,
        noGoLane,
        representativeLane,
      },
      evidenceRefs: uniqueStrings([
        ...selectedAssessment.evidenceRefs,
        "scan_runtime_artifacts.scan_lane_runs",
      ]).slice(0, 16),
    },
    visualAccessReview: selectedVisualReview ?? null,
  };
}

function rewriteEvidenceLaneArtifactPaths<T>(
  value: T,
  workerLane: LocalV2DagLambdaWorkerLane,
  artifactRoot: string,
  ancestors: string[] = [],
): T {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteEvidenceLaneArtifactPaths(entry, workerLane, artifactRoot, ancestors)) as T;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const rewritten = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    if (key === "path" && typeof entry === "string" && isTypedEvidenceArtifactPath(ancestors)) {
      const fileName = path.basename(entry);
      const mirroredFileName = shouldPromoteEvidenceLaneArtifact(workerLane, fileName)
        ? safeAuxiliaryFileName(fileName)
        : safeAuxiliaryFileName(`worker-${workerLane}-${fileName}`);
      return [key, path.join(artifactRoot, mirroredFileName)];
    }
    return [key, rewriteEvidenceLaneArtifactPaths(entry, workerLane, artifactRoot, [...ancestors, key])];
  }));
  return rewritten as T;
}

function isTypedEvidenceArtifactPath(ancestors: string[]) {
  return ancestors.some((key) =>
    key === "artifactRefs" ||
    key === "evidenceRefs" ||
    key === "screenshots" ||
    key === "domSnapshots"
  );
}

function selectDiagnosticScreenshot(screenshots: ScreenshotArtifact[]): ScreenshotArtifact[] {
  const deduped = dedupeByArtifactId(screenshots);
  const baseline = [
    "screenshot_pre_consent_geometry_proof",
    "screenshot_pre_consent_settled",
    "screenshot_pre_consent_full_page",
    "screenshot_pre_consent",
    "screenshot_baseline_pre_consent_before",
  ].flatMap((artifactId) =>
    deduped.find((screenshot) => screenshot.artifactId === artifactId) ?? []
  )[0] ?? deduped.find((screenshot) => /pre[_-]?consent|baseline/i.test(screenshot.artifactId));
  const selected = baseline ?? deduped[0];
  return selected ? [selected] : [];
}

function mergeShardConsentFlowComparisons(
  bundles: CanonicalEvidenceBundle[],
): CanonicalEvidenceBundle["consentFlowComparisons"] {
  return dedupeByField(bundles.flatMap((bundle) => bundle.consentFlowComparisons), "comparisonId");
}

function dedupeByEventId<T extends { eventId?: string }>(items: T[]): T[] {
  return dedupeByField(items, "eventId");
}

function dedupeByArtifactId<T extends { artifactId?: string }>(items: T[]): T[] {
  return dedupeByField(items, "artifactId");
}

function dedupeByField<T extends Record<string, unknown>>(items: T[], field: string): T[] {
  const seen = new Set<string>();
  const values: T[] = [];
  for (const item of items) {
    const rawKey = item[field];
    const key = typeof rawKey === "string" && rawKey.length > 0 ? rawKey : JSON.stringify(item);
    if (!seen.has(key)) {
      seen.add(key);
      values.push(item);
    }
  }
  return values;
}

function dedupeByJson<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mergeDerivedRuntimeSignals(bundles: CanonicalEvidenceBundle[]): CanonicalEvidenceBundle["derivedRuntimeSignals"] {
  const [base] = bundles;
  if (!base) {
    throw new Error("Cannot merge local v2 DAG Lambda shards without a base bundle.");
  }
  const signal = base.derivedRuntimeSignals;
  return {
    ...signal,
    consentBannerLikelyPresent: bundles.some((bundle) => bundle.derivedRuntimeSignals.consentBannerLikelyPresent === true),
    preConsentTrackingObserved: bundles.some((bundle) => bundle.derivedRuntimeSignals.preConsentTrackingObserved),
    sessionReplayOrBehavioralAnalyticsObserved: bundles.some((bundle) => bundle.derivedRuntimeSignals.sessionReplayOrBehavioralAnalyticsObserved),
    thirdPartyCookiesPreConsentObserved: bundles.some((bundle) => bundle.derivedRuntimeSignals.thirdPartyCookiesPreConsentObserved),
    thirdPartyVendorsObserved: bundles.some((bundle) => bundle.derivedRuntimeSignals.thirdPartyVendorsObserved)
  };
}

function mergeRuntimeCoverage(bundles: CanonicalEvidenceBundle[]): CanonicalEvidenceBundle["runtimeCoverage"] {
  const coverages = bundles.map((bundle) => bundle.runtimeCoverage).filter((coverage): coverage is NonNullable<CanonicalEvidenceBundle["runtimeCoverage"]> => Boolean(coverage));
  if (coverages.length === 0) {
    return undefined;
  }
  const coverageStatus = coverages.some((coverage) => coverage.coverageStatus === "usable")
    ? "usable"
    : coverages.some((coverage) => coverage.coverageStatus === "limited_partial")
      ? "limited_partial"
      : coverages[0]?.coverageStatus ?? "not_applicable";
  return {
    coverageStatus,
    fallbackModesUsed: uniqueStrings(coverages.flatMap((coverage) => coverage.fallbackModesUsed)),
    limitationKeys: uniqueStrings(coverages.flatMap((coverage) => coverage.limitationKeys)),
    notes: uniqueStrings(coverages.flatMap((coverage) => coverage.notes)),
    observationCounts: coverages.reduce((counts, coverage) => ({
      cookieEvents: counts.cookieEvents + coverage.observationCounts.cookieEvents,
      cookiesBeforeConsent: counts.cookiesBeforeConsent + coverage.observationCounts.cookiesBeforeConsent,
      networkEvents: counts.networkEvents + coverage.observationCounts.networkEvents,
      normalizedVendors: counts.normalizedVendors + coverage.observationCounts.normalizedVendors,
      observedJourneys: counts.observedJourneys + coverage.observationCounts.observedJourneys,
      thirdPartyRequests: counts.thirdPartyRequests + coverage.observationCounts.thirdPartyRequests
    }), {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 0,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0
    }),
    silentEmpty: coverages.every((coverage) => coverage.silentEmpty)
  };
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

export function buildLocalV2DagLambdaRuntimeDiagnostics(env: NodeJS.ProcessEnv = process.env) {
  const memorySizeMb = Number.parseInt(env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE ?? "", 10);
  const proxyServer = firstTrimmedRuntimeEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
    "SCAN_PROXY_SERVER",
    "CERTSCORE_CHROMIUM_PROXY_SERVER",
  ]);
  const scanProxyEnabled = scanProxyEnabledEnv(env);
  const egressLabel = firstTrimmedRuntimeEnv(env, [
    "SCAN_EGRESS_LABEL",
    "CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL",
  ]);
  return {
    awsLambdaRuntime: isAwsLambdaRuntime(env),
    chromiumContextOptions: chromiumContextDiagnostics(env),
    chromiumLaunchArgs: chromiumLaunchArgs({ env }),
    chromiumProxyAuthConfigured: Boolean(firstTrimmedRuntimeEnv(env, [
      "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME",
      "CERTSCORE_CHROMIUM_PROXY_USERNAME",
      "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD",
      "CERTSCORE_CHROMIUM_PROXY_PASSWORD",
    ])),
    chromiumProxyConfigured: scanProxyEnabled && Boolean(proxyServer),
    chromiumSingleProcessEnabled: lambdaChromiumSingleProcessEnabled(env),
    egressLabel: egressLabel ? egressLabel.slice(0, 80) : null,
    expectedEgressRegion: firstTrimmedRuntimeEnv(env, [
      "CERTSCORE_V2_DAG_LAMBDA_EXPECTED_EGRESS_REGION",
    ])?.slice(0, 80) ?? null,
    egressPublicIpHashConfigured: Boolean(firstTrimmedRuntimeEnv(env, [
      "CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH",
    ])),
    memorySizeMb: Number.isFinite(memorySizeMb) ? memorySizeMb : null,
    nodeVersion: process.version,
    regionalEgressRequired: regionalEgressRequired(env),
    scanProxyEnabled,
    platform: process.platform,
    architecture: process.arch
  };
}

function scanProxyEnabledEnv(env: NodeJS.ProcessEnv = process.env) {
  const value = env.SCAN_PROXY_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

function chromiumContextDiagnostics(env: NodeJS.ProcessEnv) {
  const acceptLanguage = firstTrimmedRuntimeEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE",
    "CERTSCORE_CHROMIUM_ACCEPT_LANGUAGE",
  ]);
  const locale = firstTrimmedRuntimeEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE",
    "CERTSCORE_CHROMIUM_LOCALE",
  ]);
  const timezoneId = firstTrimmedRuntimeEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID",
    "CERTSCORE_CHROMIUM_TIMEZONE_ID",
  ]);
  const userAgent = firstTrimmedRuntimeEnv(env, [
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT",
    "CERTSCORE_CHROMIUM_USER_AGENT",
  ]);
  return {
    acceptLanguage: acceptLanguage ?? null,
    locale: locale ?? null,
    timezoneId: timezoneId ?? null,
    userAgent: userAgent ? userAgent.slice(0, 240) : null,
    userAgentConfigured: Boolean(userAgent),
    viewport: { width: 1366, height: 900 }
  };
}

function firstTrimmedRuntimeEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function buildLocalV2DagLambdaScanTuning(env: NodeJS.ProcessEnv = process.env) {
  return {
    actionFinalSettleMs: boundedIntegerEnv(env.CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS, {
      defaultValue: 350,
      max: 2_000,
      min: 350
    }),
    consentFlowScreenshotMode: consentFlowScreenshotModeEnv(env.CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE),
    evidenceDiagnosticMode: env.CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE === "webmd" ? "webmd" as const : "off" as const,
    preConsentScreenshotMode: preConsentScreenshotModeEnv(env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE),
    preConsentScreenshotTimeoutMs: boundedIntegerEnv(env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS, {
      defaultValue: LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS,
      max: 15_000,
      min: 500
    }),
    preConsentVisualFallbackDeadlineMs: boundedIntegerEnv(env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS, {
      defaultValue: LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS,
      max: 30_000,
      min: 1_000
    }),
    scenarioConcurrency: boundedIntegerEnv(env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY, {
      defaultValue: 1,
      max: 4,
      min: 1
    }),
    scenarioResourceMode: scenarioResourceModeEnv(env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE)
  };
}

function scenarioResourceModeEnv(value: string | undefined): "normal" | "lean" | "cmp_safe" {
  if (value === "normal" || value === "lean" || value === "cmp_safe") {
    return value;
  }
  return "cmp_safe";
}

function consentFlowScreenshotModeEnv(value: string | undefined): "auto" | "none" {
  return value === "auto" ? "auto" : "none";
}

function preConsentScreenshotModeEnv(value: string | undefined): "always" | "selective" | "never" {
  if (value === "selective" || value === "never") {
    return value;
  }
  return "always";
}

function effectiveActionFinalSettleMs(
  payload: LocalV2DagLambdaDispatchPayload,
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>
) {
  if (payload.debugOverrides?.actionFinalSettleMs !== undefined) {
    return payload.debugOverrides.actionFinalSettleMs;
  }
  if (isStrongWebMdEvidenceMode(payload, scanTuning)) {
    return Math.max(scanTuning.actionFinalSettleMs, 2_000);
  }
  return scanTuning.actionFinalSettleMs;
}

function effectiveActionSearchDeadlineMs(payload: LocalV2DagLambdaDispatchPayload) {
  return payload.debugOverrides?.actionSearchDeadlineMs;
}

function effectiveConsentFlowDeadlineMs(
  payload: LocalV2DagLambdaDispatchPayload,
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>
) {
  if (payload.debugOverrides?.consentFlowDeadlineMs !== undefined) {
    return payload.debugOverrides.consentFlowDeadlineMs;
  }
  return isStrongWebMdEvidenceMode(payload, scanTuning) ? 45_000 : 30_000;
}

function effectivePreActionObservationMs(payload: LocalV2DagLambdaDispatchPayload) {
  return payload.debugOverrides?.preActionObservationMs;
}

function effectiveOneTrustHiddenActionMode(payload: LocalV2DagLambdaDispatchPayload) {
  return payload.targetEnvironment === "local"
    ? payload.debugOverrides?.oneTrustHiddenActionMode
    : undefined;
}

function effectiveScenarioConcurrency(
  payload: LocalV2DagLambdaDispatchPayload,
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>
) {
  if (payload.debugOverrides?.scenarioConcurrency !== undefined) {
    return payload.debugOverrides.scenarioConcurrency;
  }
  return isStrongWebMdEvidenceMode(payload, scanTuning) ? 1 : scanTuning.scenarioConcurrency;
}

function effectiveScenarioResourceMode(
  payload: LocalV2DagLambdaDispatchPayload,
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>
) {
  return payload.debugOverrides?.scenarioResourceMode ?? scanTuning.scenarioResourceMode;
}

function isStrongWebMdEvidenceMode(
  payload: LocalV2DagLambdaDispatchPayload,
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>
) {
  return isWebMdTarget(payload.targetUrl) &&
    (payload.strongEvidenceMode === "webmd" || scanTuning.evidenceDiagnosticMode === "webmd");
}

function isWebMdTarget(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return hostname === "webmd.com" || hostname.endsWith(".webmd.com");
  } catch {
    return false;
  }
}

function boundedIntegerEnv(
  value: string | undefined,
  input: { defaultValue: number; max: number; min: number }
) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return input.defaultValue;
  }
  return Math.min(input.max, Math.max(input.min, parsed));
}

export function artifactPointersFromPaths(input: {
  artifactRoot: string;
  manifestPath: string;
  scanArtifactPath: string;
  workspaceRoot?: string;
}): LocalV2DagLambdaArtifactPointers {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  return {
    manifestUri: fileUri(input.manifestPath, workspaceRoot),
    scanArtifactUri: fileUri(input.scanArtifactPath, workspaceRoot)
  };
}

export function artifactPointersFromS3Keys(input: {
  bucket: string;
  keyPrefix: string;
  manifestFileName: string;
  scanArtifactFileName: string;
}): LocalV2DagLambdaArtifactPointers {
  const prefix = input.keyPrefix.replace(/^\/+|\/+$/g, "");
  return {
    manifestUri: s3Uri(input.bucket, `${prefix}/${input.manifestFileName}`),
    scanArtifactUri: s3Uri(input.bucket, `${prefix}/${input.scanArtifactFileName}`)
  };
}

function requireArtifactBucket() {
  const bucket = compactString(process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET);
  if (!bucket) {
    throw new Error("Local v2 DAG Lambda artifact handoff requires CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET.");
  }
  return bucket;
}

function artifactKeyPrefix(payload: LocalV2DagLambdaDispatchPayload) {
  const prefix = compactString(process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX) ?? "v2-dag-lambda/local";
  const scanPrefix = `${prefix.replace(/^\/+|\/+$/g, "")}/${payload.scanId}`;
  return payload.orchestrationMode === "worker" && payload.workerLane
    ? `${scanPrefix}/lanes/${payload.workerLane}`
    : scanPrefix;
}

function s3Uri(bucket: string, key: string) {
  return `s3://${bucket}/${key.replace(/^\/+/g, "")}`;
}

async function writeAndUploadFailureDiagnostic(input: {
  artifactChainTimeoutMs: number;
  artifactRoot: string;
  cancellationReason: string;
  cancellationObservedAt: Date;
  cancellationRequestedAt?: Date;
  handlerStartedAt: Date;
  payload: LocalV2DagLambdaDispatchPayload;
  s3Client?: S3PutClient;
  scannerWorkTimeoutMs: number;
  terminalPublicationReserveMs: number;
}): Promise<{ artifactMetadata: LocalV2DagLambdaArtifactMetadata; artifactPointers: LocalV2DagLambdaArtifactPointers }> {
  const phaseRecord: Record<string, unknown> = await readFile(path.join(input.artifactRoot, "V2ScanCorePhases.json"), "utf8")
    .then((value) => asRecord(JSON.parse(value)))
    .catch((): Record<string, unknown> => ({}));
  const checkpoints = Array.isArray(phaseRecord.checkpoints)
    ? phaseRecord.checkpoints.slice(0, 100).map((value) => {
      const row = asRecord(value);
      const detail = asRecord(row.detail);
      return {
        at: compactString(row.at) ?? undefined,
        elapsedMs: typeof row.elapsedMs === "number" ? row.elapsedMs : undefined,
        name: compactString(row.name) ?? "unknown",
        status: compactString(row.status) ?? "unknown",
        detail: {
          deadlineMs: typeof detail.deadlineMs === "number" ? detail.deadlineMs : undefined,
          durationMs: typeof detail.durationMs === "number" ? detail.durationMs : undefined,
          reason: compactString(detail.reason) ?? undefined,
          status: compactString(detail.status) ?? undefined,
        },
      };
    })
    : [];
  const egressRecord: Record<string, unknown> = await readFile(path.join(input.artifactRoot, "EgressPreflight.json"), "utf8")
    .then((value) => asRecord(JSON.parse(value)))
    .catch((): Record<string, unknown> => ({}));
  const egressAttempts = Array.isArray(egressRecord.attempts)
    ? egressRecord.attempts.slice(0, 4).map((value) => {
      const row = asRecord(value);
      const observed = asRecord(row.observed);
      const observedIp = compactString(observed.ip);
      return {
        durationMs: typeof row.durationMs === "number" ? row.durationMs : undefined,
        error: compactString(row.error)?.slice(0, 240) ?? null,
        mode: compactString(row.mode)?.slice(0, 40) ?? "unknown",
        observedPublicIpHash: observedIp
          ? `sha256:${createHash("sha256").update(observedIp).digest("hex")}`
          : null,
        probeStatus: compactString(row.probeStatus)?.slice(0, 40) ?? "unknown",
        provider: compactString(row.provider)?.slice(0, 80) ?? null,
        regionVerificationSource: compactString(row.regionVerificationSource)?.slice(0, 80) ?? null,
      };
    })
    : [];
  const egressPreflight = Object.keys(egressRecord).length > 0
    ? {
      artifactVersion: compactString(egressRecord.artifactVersion)?.slice(0, 80) ?? null,
      attempts: egressAttempts,
      error: compactString(egressRecord.error)?.slice(0, 240) ?? null,
      expectedEgressPublicIpHash: compactString(egressRecord.expectedEgressPublicIpHash)?.slice(0, 80) ?? null,
      expectedEgressRegion: compactString(egressRecord.expectedEgressRegion)?.slice(0, 80) ?? null,
      probeStatus: compactString(egressRecord.probeStatus)?.slice(0, 40) ?? null,
      provider: compactString(egressRecord.provider)?.slice(0, 80) ?? null,
      proxyModeEnabled: egressRecord.proxyModeEnabled === true,
      regionVerificationSource: compactString(egressRecord.regionVerificationSource)?.slice(0, 80) ?? null,
    }
    : null;
  const body = Buffer.from(`${JSON.stringify({
    artifactOnly: true,
    artifactVersion: "certscore.v2_lambda_failure_diagnostic.2",
    cancellationReason: input.cancellationReason.slice(0, 240),
    cancellationObservedAt: input.cancellationObservedAt.toISOString(),
    ...(input.cancellationRequestedAt ? {
      cancellationRequestedAt: input.cancellationRequestedAt.toISOString(),
      cancellationObservationDelayMs: Math.max(
        0,
        input.cancellationObservedAt.getTime() - input.cancellationRequestedAt.getTime(),
      ),
    } : {}),
    configuredBudgets: {
      artifactChainTimeoutMs: input.artifactChainTimeoutMs,
      scannerWorkTimeoutMs: input.scannerWorkTimeoutMs,
    },
    generatedAt: new Date().toISOString(),
    diagnosticUploadStartedAt: new Date().toISOString(),
    handlerElapsedMs: Date.now() - input.handlerStartedAt.getTime(),
    egressPreflight,
    lastCheckpoint: checkpoints.at(-1) ?? null,
    phaseCheckpoints: checkpoints,
    productionFindingIntegration: false,
    scanId: input.payload.scanId,
    terminalPublicationReserveMs: input.terminalPublicationReserveMs,
  })}\n`, "utf8");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const bucket = requireArtifactBucket();
  const key = `${artifactKeyPrefix(input.payload)}/failure/FailureDiagnostic.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Failure diagnostic upload deadline reached.")), 1_500);
  try {
    const s3Client = input.s3Client ?? localV2DagLambdaS3Client(input.payload.awsRegion);
    await s3Client.send(new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
      Metadata: {
        "certscore-artifact-field": "failureDiagnosticUri",
        "certscore-artifact-sha256": sha256,
        "certscore-artifact-size-bytes": String(body.byteLength),
        "certscore-production-finding-integration": "false",
        "certscore-v2-artifact-only": "true",
      },
    }), { abortSignal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  return {
    artifactMetadata: { failureDiagnosticUri: { sha256, sizeBytes: body.byteLength } },
    artifactPointers: { failureDiagnosticUri: s3Uri(bucket, key) },
  };
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error(`Local v2 DAG Lambda artifact URI must be s3://, got ${uri.slice(0, 24)}.`);
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

async function artifactObjectMetadata(filePath: string) {
  const body = await readFile(filePath);
  return {
    body,
    sha256: createHash("sha256").update(body).digest("hex"),
    sizeBytes: body.byteLength
  };
}

const CORE_ARTIFACT_FILE_NAMES = new Set([
  "CanonicalEvidenceBundle.json",
  "LambdaArtifactMirrorManifest.json",
  "LocalV2DagLambdaManifest.json"
]);

export async function uploadAuxiliaryArtifactFiles(input: {
  attemptTimeoutMs?: number;
  artifactRoot: string;
  maxAttempts?: number;
  payload: LocalV2DagLambdaDispatchPayload;
  s3Client?: S3PutClient;
  signal?: AbortSignal;
}): Promise<LocalV2DagLambdaAuxiliaryArtifact[]> {
  const entries = await readdir(input.artifactRoot, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => isSupportedAuxiliaryFileName(fileName) && !CORE_ARTIFACT_FILE_NAMES.has(fileName))
    .sort();
  if (fileNames.length === 0) {
    return [];
  }

  const bucket = requireArtifactBucket();
  const prefix = artifactKeyPrefix(input.payload).replace(/^\/+|\/+$/g, "");
  const maxAttempts = Math.max(1, input.maxAttempts ?? (
    input.s3Client ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS
  ));
  const attemptTimeoutMs = Math.max(10, input.attemptTimeoutMs ?? LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS);
  return Promise.all(fileNames.map(async (fileName) => {
    const object = await artifactObjectMetadata(path.join(input.artifactRoot, fileName));
    const key = `${prefix}/auxiliary/${fileName}`;
    const command = new PutObjectCommand({
      Body: object.body,
      Bucket: bucket,
      ContentType: auxiliaryContentType(fileName),
      Key: key,
      Metadata: {
        "certscore-artifact-field": "auxiliaryArtifact",
        "certscore-artifact-sha256": object.sha256,
        "certscore-artifact-size-bytes": String(object.sizeBytes),
        "certscore-production-finding-integration": "false",
        "certscore-v2-artifact-only": "true"
      }
    });
    await sendWithBoundedRetries({
      attemptTimeoutMs,
      maxAttempts,
      operation: (attemptSignal) => (
        input.s3Client ?? localV2DagLambdaS3Client(input.payload.awsRegion)
      ).send(command, { abortSignal: attemptSignal }),
      operationLabel: `S3 auxiliary upload ${fileName}`,
      signal: input.signal,
      totalTimeoutMs: attemptTimeoutMs * maxAttempts,
    });
    return {
      fileName,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      uri: s3Uri(bucket, key)
    };
  }));
}

function auxiliaryContentType(fileName: string) {
  if (fileName.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  if (fileName.endsWith(".png")) {
    return "image/png";
  }
  if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "application/json";
}

export async function uploadArtifactFiles(input: {
  attemptTimeoutMs?: number;
  fields?: Array<"manifestUri" | "scanArtifactUri">;
  manifestPath: string;
  maxAttempts?: number;
  payload: LocalV2DagLambdaDispatchPayload;
  pointers: LocalV2DagLambdaArtifactPointers;
  s3Client?: S3PutClient;
  scanArtifactPath: string;
  signal?: AbortSignal;
}): Promise<LocalV2DagLambdaArtifactMetadata> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? (
    input.s3Client ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS
  ));
  const attemptTimeoutMs = Math.max(10, input.attemptTimeoutMs ?? LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS);
  const artifacts = [
    { field: "manifestUri" as const, path: input.manifestPath },
    { field: "scanArtifactUri" as const, path: input.scanArtifactPath }
  ].filter((artifact) => !input.fields || input.fields.includes(artifact.field));
  const uploaded = await Promise.all(artifacts.map(async (artifact) => {
    const uri = input.pointers[artifact.field];
    if (!uri) {
      return null;
    }
    const { bucket, key } = parseS3Uri(uri);
    const object = await artifactObjectMetadata(artifact.path);
    const command = new PutObjectCommand({
      Body: object.body,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
      Metadata: {
        "certscore-artifact-field": artifact.field,
        "certscore-artifact-sha256": object.sha256,
        "certscore-artifact-size-bytes": String(object.sizeBytes),
        "certscore-production-finding-integration": "false",
        "certscore-v2-artifact-only": "true"
      }
    });
    await sendWithBoundedRetries({
      attemptTimeoutMs,
      maxAttempts,
      operation: (attemptSignal) => (
        input.s3Client ?? localV2DagLambdaS3Client(input.payload.awsRegion)
      ).send(command, { abortSignal: attemptSignal }),
      operationLabel: `S3 ${artifact.field} upload`,
      signal: input.signal,
      totalTimeoutMs: attemptTimeoutMs * maxAttempts,
    });
    return {
      field: artifact.field,
      metadata: {
        sha256: object.sha256,
        sizeBytes: object.sizeBytes
      }
    };
  }));

  const metadata: LocalV2DagLambdaArtifactMetadata = {};
  for (const artifact of uploaded) {
    if (artifact) {
      metadata[artifact.field] = artifact.metadata;
    }
  }

  return metadata;
}

async function writeManifest(input: {
  artifactRoot: string;
  artifactMetadata?: LocalV2DagLambdaArtifactMetadata;
  auxiliaryArtifacts: LocalV2DagLambdaAuxiliaryArtifact[];
  bundle: CanonicalEvidenceBundle;
  laneTimingSummary?: LocalV2DagLambdaLaneTimingSummary;
  payload: LocalV2DagLambdaDispatchPayload;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
  pointers: LocalV2DagLambdaArtifactPointers;
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
}) {
  const manifestPath = path.join(input.artifactRoot, "LocalV2DagLambdaManifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    artifactOnly: true,
    ...(input.artifactMetadata ? { artifactMetadata: input.artifactMetadata } : {}),
    auxiliaryArtifacts: input.auxiliaryArtifacts,
    contractVersion: "certscore.v2.lambda-dag-artifact-manifest.v1",
    generatedAt: new Date().toISOString(),
    ...(input.laneTimingSummary ? { laneTimingSummary: input.laneTimingSummary } : {}),
    modulesRun: input.bundle.modulesRun.map((moduleRun) => ({
      durationMs: moduleRun.durationMs,
      errorCount: (moduleRun.errors ?? []).length,
      moduleName: moduleRun.moduleName,
      status: moduleRun.status
    })),
    phaseTimings: input.phaseTimings,
    performanceDiagnostics: buildLambdaPerformanceDiagnostics(input.bundle, input.phaseTimings),
    pointers: input.pointers,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    runtimeDiagnostics: buildLocalV2DagLambdaRuntimeDiagnostics(),
    scanTuning: input.scanTuning,
    ...(input.payload.debugOverrides ? { debugOverrides: input.payload.debugOverrides } : {}),
    scanId: input.payload.scanId,
    ...(input.payload.coordinatorPlanSummary ? { coordinatorPlanSummary: input.payload.coordinatorPlanSummary } : {}),
    ...(input.payload.strongEvidenceMode ? { strongEvidenceMode: input.payload.strongEvidenceMode } : {}),
    targetEnvironment: input.payload.targetEnvironment,
    targetUrl: input.payload.targetUrl
  }, null, 2)}\n`, "utf8");
}

function buildLambdaPerformanceDiagnostics(
  bundle: CanonicalEvidenceBundle,
  phaseTimings: LocalV2DagLambdaPhaseTiming[],
) {
  const preConsent = bundle.modulesRun.find((moduleRun) => moduleRun.moduleName === "preConsentRuntimeScanner");
  const policy = bundle.modulesRun.find((moduleRun) => moduleRun.moduleName === "policySurfaceScanner");
  const criticalModule = [preConsent, policy]
    .filter((moduleRun): moduleRun is NonNullable<typeof moduleRun> => Boolean(moduleRun))
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))[0];
  const memoryReadings = phaseTimings.flatMap((phase) => [
    phase.memoryBeforeMb,
    phase.memoryAfterMb,
  ]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const memoryLimitMb = phaseTimings.find((phase) => phase.memoryLimitMb !== undefined)?.memoryLimitMb;
  const peakObservedMemoryMb = memoryReadings.length > 0 ? Math.max(...memoryReadings) : undefined;
  return {
    browserIsolation: "per_module_context_isolation",
    maxConcurrentBrowserProcesses: 2,
    policyRenderedFallbackConcurrency: 1,
    criticalModuleName: criticalModule?.moduleName ?? null,
    criticalModuleDurationMs: criticalModule?.durationMs ?? null,
    preConsentDurationMs: preConsent?.durationMs ?? null,
    policyDurationMs: policy?.durationMs ?? null,
    ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {}),
    ...(peakObservedMemoryMb !== undefined ? {
      peakObservedMemoryMb,
      ...(memoryLimitMb && memoryLimitMb > 0
        ? { peakObservedMemoryRatio: Math.round((peakObservedMemoryMb / memoryLimitMb) * 1_000) / 1_000 }
        : {}),
    } : {}),
  };
}

function fileUri(filePath: string, workspaceRoot: string) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
  return `file://${resolved}`;
}

export function buildLocalV2DagLambdaResultMessage(input: {
  artifactMetadata?: LocalV2DagLambdaResultMessage["artifactMetadata"];
  artifactPointers?: LocalV2DagLambdaResultMessage["artifactPointers"];
  completedAt: Date;
  error?: { code?: string; message: string };
  handlerTiming?: LocalV2DagLambdaHandlerTiming;
  laneTimingSummary?: LocalV2DagLambdaLaneTimingSummary;
  payload: LocalV2DagLambdaDispatchPayload;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
  policyEvidence?: LocalV2DagLambdaPolicyEvidenceMessage;
  status: "completed" | "failed";
}): LocalV2DagLambdaResultMessage {
  const scannerBuildProvenance = buildScannerBuildProvenance();
  const scannerRuntimeProvenance = buildScannerRuntimeProvenance(input.payload);
  return {
    artifactOnly: true,
    ...(input.artifactMetadata ? { artifactMetadata: input.artifactMetadata } : {}),
    ...(input.artifactPointers ? { artifactPointers: input.artifactPointers } : {}),
    completedAt: input.completedAt.toISOString(),
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    ...(input.error ? { error: sanitizeError(input.error) } : {}),
    ...(input.handlerTiming ? { handlerTiming: input.handlerTiming } : {}),
    ...(input.laneTimingSummary ? { laneTimingSummary: input.laneTimingSummary } : {}),
    ...(input.phaseTimings ? { phaseTimings: input.phaseTimings } : {}),
    ...(input.policyEvidence ? { policyEvidence: input.policyEvidence } : {}),
    ...(input.payload.postRefusalObservation
      ? { parentDispatchSha256: postRefusalParentDispatchSha256(input.payload) }
      : {}),
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    resultPurpose: input.payload.resultPurpose,
    scanId: input.payload.scanId,
    ...scannerBuildProvenance,
    scannerRuntimeProvenance,
    status: input.status,
    targetEnvironment: input.payload.targetEnvironment
  };
}

function boundedEnvString(name: string, maxLength: number) {
  const value = process.env[name]?.trim();
  return value ? value.slice(0, maxLength) : null;
}

function buildScannerBuildProvenance() {
  const scannerGitSha = boundedEnvString("BUILD_GIT_SHA", 80);
  const scannerImageTag = boundedEnvString("BUILD_IMAGE_TAG", 160);
  const scannerRuntimeVersion = boundedEnvString("SCANNER_RUNTIME_VERSION", 80);

  return {
    ...(scannerGitSha ? { scannerGitSha } : {}),
    ...(scannerImageTag ? { scannerImageTag } : {}),
    ...(scannerRuntimeVersion ? { scannerRuntimeVersion } : {})
  };
}

export function buildScannerRuntimeProvenance(
  payload: Pick<LocalV2DagLambdaDispatchPayload, "awsRegion" | "vpcMode">,
  env: NodeJS.ProcessEnv = process.env,
): NonNullable<LocalV2DagLambdaResultMessage["scannerRuntimeProvenance"]> {
  const runtimeVpcMode = env.CERTSCORE_V2_DAG_LAMBDA_VPC_MODE === "vpc"
    ? "vpc"
    : env.CERTSCORE_V2_DAG_LAMBDA_VPC_MODE === "none"
      ? "none"
      : "unknown";
  const bounded = (name: string, maxLength: number) => {
    const value = env[name]?.trim();
    return value ? value.slice(0, maxLength) : null;
  };
  const imageDigest = bounded("SCANNER_IMAGE_DIGEST", 80);
  const publicIpHash = bounded("CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH", 96);
  return {
    awsRegion: payload.awsRegion,
    dispatchVpcMode: payload.vpcMode,
    ...(bounded("CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID", 128)
      ? { egressId: bounded("CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID", 128) as string }
      : {}),
    ...(bounded("CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER", 80)
      ? { egressProvider: bounded("CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER", 80) as string }
      : {}),
    ...(bounded("AWS_LAMBDA_FUNCTION_VERSION", 80)
      ? { functionVersion: bounded("AWS_LAMBDA_FUNCTION_VERSION", 80) as string }
      : {}),
    ...(imageDigest && /^sha256:[a-f0-9]{64}$/i.test(imageDigest) ? { imageDigest } : {}),
    ...(publicIpHash && /^sha256:[a-f0-9]{64}$/i.test(publicIpHash) ? { publicIpHash } : {}),
    runtimeVpcMode,
  };
}

function sanitizeError(error: { code?: string; message: string }) {
  return {
    ...(error.code ? { code: error.code.slice(0, 80) } : {}),
    message: error.message.replace(/\s+/g, " ").slice(0, 500)
  };
}

function buildLocalV2DagLambdaHandlerTiming(input: {
  artifactChainCompletedAt?: Date;
  artifactChainStartedAt?: Date;
  completedAt: Date;
  handlerStartedAt: Date;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
}): LocalV2DagLambdaHandlerTiming {
  const firstPhase = input.phaseTimings?.find((phase) => phase.startedAt);
  const scanPhase = input.phaseTimings?.find((phase) => phase.label === "scan" || phase.label.endsWith("_scan"));
  const artifactChainDurationMs = input.artifactChainStartedAt && input.artifactChainCompletedAt
    ? Math.max(0, input.artifactChainCompletedAt.getTime() - input.artifactChainStartedAt.getTime())
    : undefined;
  return {
    ...(input.artifactChainCompletedAt ? { artifactChainCompletedAt: input.artifactChainCompletedAt.toISOString() } : {}),
    ...(artifactChainDurationMs !== undefined ? { artifactChainDurationMs } : {}),
    ...(input.artifactChainStartedAt ? { artifactChainStartedAt: input.artifactChainStartedAt.toISOString() } : {}),
    completedAt: input.completedAt.toISOString(),
    ...(firstPhase?.label ? { firstPhaseLabel: firstPhase.label.slice(0, 80) } : {}),
    ...(firstPhase?.startedAt ? { firstPhaseStartedAt: firstPhase.startedAt } : {}),
    handlerDurationMs: Math.max(0, input.completedAt.getTime() - input.handlerStartedAt.getTime()),
    handlerStartedAt: input.handlerStartedAt.toISOString(),
    ...(scanPhase?.completedAt ? { scanPhaseCompletedAt: scanPhase.completedAt } : {}),
    ...(scanPhase ? { scanPhaseDurationMs: Math.max(0, Math.round(scanPhase.durationMs)) } : {}),
    ...(scanPhase?.label ? { scanPhaseLabel: scanPhase.label.slice(0, 80) } : {}),
    ...(scanPhase?.startedAt ? { scanPhaseStartedAt: scanPhase.startedAt } : {})
  };
}

export async function sendLocalV2DagLambdaResultMessage(input: {
  attemptTimeoutMs?: number;
  maxAttempts?: number;
  message: LocalV2DagLambdaResultMessage;
  queueUrl: string;
  sqsClient?: SqsSendClient;
  timeoutMs?: number;
}) {
  const timeoutMs = Math.max(10, input.timeoutMs ?? LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS);
  const maxAttempts = Math.max(1, input.maxAttempts ?? (
    input.sqsClient ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS
  ));
  const attemptTimeoutMs = Math.max(10, input.attemptTimeoutMs ?? Math.floor(timeoutMs / maxAttempts));
  const command = new SendMessageCommand({
    MessageBody: JSON.stringify(input.message),
    QueueUrl: input.queueUrl
  });
  await sendWithBoundedRetries({
    attemptTimeoutMs,
    maxAttempts,
    operation: (attemptSignal) => (
      input.sqsClient ?? new SQSClient({ region: parseQueueRegion(input.queueUrl) })
    ).send(command, { abortSignal: attemptSignal }),
    operationLabel: "Terminal SQS publication",
    totalTimeoutMs: timeoutMs,
  });
}

function policyEvidenceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundPolicyModuleRun(
  moduleRun: Parameters<NonNullable<RunScanInput["onPolicySurfaceComplete"]>>[0]["moduleRun"],
) {
  const timingBreakdown = moduleRun.timingBreakdown;
  if (!timingBreakdown || timingBreakdown.length <= 40) {
    return moduleRun;
  }
  const omitted = timingBreakdown.slice(39);
  return {
    ...moduleRun,
    timingBreakdown: [
      ...timingBreakdown.slice(0, 39),
      {
        label: "timing entries truncated",
        durationMs: omitted.reduce((total, entry) => total + entry.durationMs, 0),
        detail: `${omitted.length} timing breakdown entries omitted from the early policy packet; the terminal canonical bundle retains its bounded diagnostic projection.`,
      },
    ],
  };
}

export function buildVerifiedPolicyEvidencePacket(input: {
  payload: LocalV2DagLambdaDispatchPayload;
  result: Parameters<NonNullable<RunScanInput["onPolicySurfaceComplete"]>>[0];
}): VerifiedPolicyEvidencePacket {
  const policySurfaceObservations = input.result.policySurfaceObservations;
  const policyContentHash = policyEvidenceHash(policySurfaceObservations);
  const generatedAt = input.result.moduleRun.completedAt ?? new Date().toISOString();
  const unsigned = {
    artifactOnly: true as const,
    contractVersion: VERIFIED_POLICY_EVIDENCE_PACKET_VERSION,
    generatedAt,
    moduleRun: boundPolicyModuleRun(input.result.moduleRun),
    normalizedUrl: input.payload.targetUrl,
    policyContentHash,
    policySurfaceInspection: derivePolicySurfaceInspectionOutcome({
      modulesRun: [input.result.moduleRun],
      policySurfaceObservations,
    }),
    policySurfaceObservations,
    productionFindingIntegration: false as const,
    region: input.payload.awsRegion,
    scanDate: generatedAt,
    scanId: input.payload.scanId,
    targetUrl: input.payload.targetUrl,
  };
  const normalized = verifiedPolicyEvidencePacketSchema.parse({
    ...unsigned,
    sourceHash: "0".repeat(64),
  });
  const { sourceHash: _placeholder, ...normalizedUnsigned } = normalized;
  return verifiedPolicyEvidencePacketSchema.parse({
    ...normalizedUnsigned,
    sourceHash: policyEvidenceHash(normalizedUnsigned),
  });
}

export async function publishVerifiedPolicyEvidence(input: {
  packet: VerifiedPolicyEvidencePacket;
  payload: LocalV2DagLambdaDispatchPayload;
  s3Client?: S3PutClient;
  sqsClient?: SqsSendClient;
}) {
  const body = Buffer.from(`${JSON.stringify(input.packet, null, 2)}\n`, "utf8");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const bucket = requireArtifactBucket();
  const key = `${artifactKeyPrefix(input.payload).replace(/^\/+|\/+$/g, "")}/VerifiedPolicyEvidencePacket.json`;
  await sendWithBoundedRetries({
    attemptTimeoutMs: LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS,
    maxAttempts: input.s3Client ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS,
    operation: (attemptSignal) => (
      input.s3Client ?? localV2DagLambdaS3Client(input.payload.awsRegion)
    ).send(new PutObjectCommand({
      Body: body,
      Bucket: bucket,
      ContentType: "application/json",
      Key: key,
      Metadata: {
        "certscore-artifact-field": "verifiedPolicyEvidencePacket",
        "certscore-artifact-sha256": sha256,
        "certscore-artifact-size-bytes": String(body.byteLength),
        "certscore-production-finding-integration": "false",
        "certscore-v2-artifact-only": "true",
      },
    }), { abortSignal: attemptSignal }),
    operationLabel: "S3 verified policy evidence upload",
    totalTimeoutMs: LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS *
      (input.s3Client ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS),
  });
  console.info(JSON.stringify({
    event: "v2_policy_evidence.artifact_retained",
    region: input.payload.awsRegion,
    scan_id: input.payload.scanId,
    size_bytes: body.byteLength,
    target_environment: input.payload.targetEnvironment,
  }));
  const message: LocalV2DagLambdaPolicyEvidenceMessage = {
    artifactMetadata: { sha256, sizeBytes: body.byteLength },
    artifactOnly: true,
    artifactPointer: s3Uri(bucket, key),
    contractVersion: LOCAL_V2_DAG_LAMBDA_POLICY_EVIDENCE_MESSAGE_VERSION,
    generatedAt: input.packet.generatedAt,
    messageKind: "policy_evidence_ready",
    policyContentHash: input.packet.policyContentHash,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.payload.scanId,
    sourceHash: input.packet.sourceHash,
    targetEnvironment: input.payload.targetEnvironment,
  };
  await sendWithBoundedRetries({
    attemptTimeoutMs: LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS,
    maxAttempts: input.sqsClient ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS,
    operation: (attemptSignal) => (
      input.sqsClient ?? new SQSClient({ region: parseQueueRegion(input.payload.resultQueueUrl) })
    ).send(new SendMessageCommand({
      MessageBody: JSON.stringify(message),
      QueueUrl: input.payload.resultQueueUrl,
    }), { abortSignal: attemptSignal }),
    operationLabel: "Verified policy evidence SQS publication",
    totalTimeoutMs: LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS *
      (input.sqsClient ? 1 : LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS),
  });
  console.info(JSON.stringify({
    event: "v2_policy_evidence.queue_published",
    region: input.payload.awsRegion,
    scan_id: input.payload.scanId,
    size_bytes: body.byteLength,
    target_environment: input.payload.targetEnvironment,
  }));
  return message;
}

function isMissingS3ObjectError(error: unknown) {
  const record = asRecord(error);
  const metadata = asRecord(record.$metadata);
  return record.name === "NoSuchKey" || record.name === "NotFound" || metadata.httpStatusCode === 404;
}

async function replayCompletedSqsDispatch(input: {
  payload: LocalV2DagLambdaDispatchPayload;
  s3GetClient?: S3GetClient;
  sqsClient?: SqsSendClient;
  timeoutMs: number;
}) {
  const bucket = requireArtifactBucket();
  const prefix = artifactKeyPrefix(input.payload).replace(/^\/+|\/+$/g, "");
  const manifestKey = `${prefix}/LocalV2DagLambdaManifest.json`;
  const scanArtifactKey = `${prefix}/CanonicalEvidenceBundle.json`;
  const s3Client = input.s3GetClient ?? localV2DagLambdaS3Client(input.payload.awsRegion);
  let manifestResponse: GetObjectCommandOutput;
  try {
    manifestResponse = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: manifestKey }));
  } catch (error) {
    if (isMissingS3ObjectError(error)) return null;
    throw error;
  }
  const [manifestBody, scanArtifactResponse] = await Promise.all([
    streamToBuffer(manifestResponse.Body),
    s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: scanArtifactKey })),
  ]);
  const scanArtifactBody = await streamToBuffer(scanArtifactResponse.Body);
  const manifest = asRecord(JSON.parse(manifestBody.toString("utf8")));
  const retainedArtifactMetadata = parseArtifactMetadataRecord(manifest.artifactMetadata);
  const retainedArtifactPointers = parseArtifactPointersRecord(manifest.pointers);
  const retainedLaneTimingSummary = parseLaneTimingSummaryRecord(manifest.laneTimingSummary);
  const generatedAt = compactString(manifest.generatedAt);
  const completedAt = generatedAt && Number.isFinite(new Date(generatedAt).getTime())
    ? new Date(generatedAt)
    : new Date();
  const result = buildLocalV2DagLambdaResultMessage({
    artifactMetadata: {
      manifestUri: {
        sha256: createHash("sha256").update(manifestBody).digest("hex"),
        sizeBytes: manifestBody.byteLength,
      },
      scanArtifactUri: {
        sha256: createHash("sha256").update(scanArtifactBody).digest("hex"),
        sizeBytes: scanArtifactBody.byteLength,
      },
      ...(retainedArtifactMetadata.postRefusalPacketUri
        ? { postRefusalPacketUri: retainedArtifactMetadata.postRefusalPacketUri }
        : {}),
    },
    artifactPointers: {
      manifestUri: s3Uri(bucket, manifestKey),
      scanArtifactUri: s3Uri(bucket, scanArtifactKey),
      ...(retainedArtifactPointers.postRefusalPacketUri
        ? { postRefusalPacketUri: retainedArtifactPointers.postRefusalPacketUri }
        : {}),
    },
    completedAt,
    payload: input.payload,
    ...(retainedLaneTimingSummary ? { laneTimingSummary: retainedLaneTimingSummary } : {}),
    phaseTimings: parsePhaseTimings(manifest.phaseTimings),
    status: "completed",
  });
  await sendLocalV2DagLambdaResultMessage({
    message: result,
    queueUrl: input.payload.resultQueueUrl,
    sqsClient: input.sqsClient,
    timeoutMs: input.timeoutMs,
  });
  console.info(JSON.stringify({
    event: "v2_lambda_dispatch_replayed_from_retained_artifacts",
    region: input.payload.awsRegion,
    scan_id: input.payload.scanId,
    transport: "sqs_fifo",
  }));
  return result;
}

export async function handler(event: unknown, options: HandlerOptions = {}) {
  let payload: LocalV2DagLambdaDispatchPayload | null = null;
  let handlerOutcome: "completed" | "failed" | "unknown" = "unknown";
  const now = options.now ?? (() => new Date());
  const handlerStartedAt = now();
  const handlerStartedAtMs = Date.now();
  let artifactChainStartedAt: Date | undefined;
  let artifactChainCompletedAt: Date | undefined;
  let phaseTimings: LocalV2DagLambdaPhaseTiming[] | undefined;
  let artifactRoot: string | undefined;
  let artifactAbortController: AbortController | undefined;
  let scannerAbortController: AbortController | undefined;
  let scannerCoreCompleted = false;
  let scannerCancellationRequestedAt: Date | undefined;
  let scannerDeadlineTimer: NodeJS.Timeout | undefined;
  let handlerSafetyTimeoutMs = LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS;
  let scannerWorkTimeoutMs = LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS;
  let artifactChainTimeoutMs = LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS;
  let resultPublishTimeoutMs = LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS;
  let policyEvidenceHandoff: Promise<LocalV2DagLambdaPolicyEvidenceMessage | undefined> | undefined;
  const dispatchEvent = unwrapLocalV2DagLambdaDispatchEvent(event);

  const remainingResultPublishMs = () => Math.max(
    10,
    Math.min(resultPublishTimeoutMs, handlerStartedAtMs + handlerSafetyTimeoutMs - Date.now())
  );

  try {
    payload = parseLocalV2DagLambdaDispatchPayload(dispatchEvent.payload);
    if (payload.targetEnvironment === "production" && !publicNetworkGuardEnabled(process.env)) {
      throw new Error("Production scanner network guard must remain enabled.");
    }
    const validatedTarget = await assertPublicNetworkUrl(payload.targetUrl);
    if (validatedTarget.hostname.toLowerCase() !== payload.hostname.toLowerCase()) {
      throw new Error("Lambda scan target hostname does not match its validated target URL.");
    }
    console.info(JSON.stringify({
      event: "v2_lambda_invocation_started",
      aws_request_id: options.awsRequestId ?? null,
      function_name: payload.functionName,
      hostname: payload.hostname,
      orchestration_mode: payload.orchestrationMode ?? "single",
      region: payload.awsRegion,
      scan_id: payload.scanId,
      target_environment: payload.targetEnvironment,
      worker_lane: payload.workerLane ?? null,
    }));
    if (dispatchEvent.transport === "sqs_fifo" && payload.orchestrationMode !== "worker") {
      const replayed = await replayCompletedSqsDispatch({
        payload,
        s3GetClient: options.s3GetClient,
        sqsClient: options.sqsClient,
        timeoutMs: remainingResultPublishMs(),
      });
      if (replayed) {
        handlerOutcome = "completed";
        return replayed;
      }
    }
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    const baseArtifactRoot = buildLocalV2DagLambdaArtifactRoot({
      scanId: payload.scanId,
      workspaceRoot
    });
    artifactRoot = payload.orchestrationMode === "worker" && payload.workerLane
      ? path.join(baseArtifactRoot, "lanes", payload.workerLane)
      : baseArtifactRoot;
    const runArtifactChain = options.runArtifactChain ?? ((dispatchPayload, runOptions) =>
      dispatchPayload.orchestrationMode === "worker" && dispatchPayload.workerLane === "reject_observation"
        ? runLocalV2DagLambdaPostRefusalArtifactChain(dispatchPayload, {
            artifactRoot: runOptions.artifactRoot,
            s3Client: options.s3Client,
            signal: runOptions.signal,
          })
        : dispatchPayload.orchestrationMode === "sharded"
        ? runLocalV2DagLambdaShardedArtifactChain(dispatchPayload, {
            artifactRoot: runOptions.artifactRoot,
            artifactSignal: runOptions.artifactSignal,
            lambdaClient: options.lambdaClient,
            s3Client: options.s3Client,
            s3GetClient: options.s3GetClient,
            signal: runOptions.signal,
            workspaceRoot,
          })
        : runLocalV2DagLambdaArtifactChain(dispatchPayload, {
            ...runOptions,
            s3Client: options.s3Client,
            workspaceRoot,
          }));
    artifactChainStartedAt = now();
    const evidenceCoordinator = payload.orchestrationMode === "sharded";
    const evidenceWorker = payload.orchestrationMode === "worker" && (
      payload.workerLane === "consent_proof" ||
      payload.workerLane === "runtime_evidence" ||
      payload.workerLane === "policy_evidence" ||
      payload.workerLane === "reject_observation"
    );
    const consentProofWorker = evidenceWorker && payload.workerLane === "consent_proof";
    const configuredHandlerSafetyTimeoutMs = options.handlerSafetyTimeoutMs ?? (
      Number(process.env.CERTSCORE_V2_DAG_LAMBDA_HANDLER_SAFETY_TIMEOUT_MS) ||
      (evidenceCoordinator
        ? LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS
        : evidenceWorker
          ? consentProofWorker
            ? LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_HANDLER_SAFETY_TIMEOUT_MS
            : LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_HANDLER_SAFETY_TIMEOUT_MS
          : LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS)
    );
    handlerSafetyTimeoutMs = Math.max(
      options.handlerSafetyTimeoutMs === undefined ? 5_000 : 10,
      Math.min(configuredHandlerSafetyTimeoutMs, 75_000)
    );
    scannerWorkTimeoutMs = Math.max(10, Math.min(
      options.scannerWorkTimeoutMs ?? (
        evidenceCoordinator
          ? 60_000
          : evidenceWorker
            ? consentProofWorker
              ? LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS
              : LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS
            : LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS
      ),
      Math.max(10, handlerSafetyTimeoutMs - 7_000)
    ));
    artifactChainTimeoutMs = Math.max(scannerWorkTimeoutMs, Math.min(
      options.artifactChainTimeoutMs ?? (
        evidenceCoordinator
          ? 70_000
          : evidenceWorker
            ? consentProofWorker
              ? LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_ARTIFACT_CHAIN_TIMEOUT_MS
              : LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_ARTIFACT_CHAIN_TIMEOUT_MS
            : LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS
      ),
      Math.max(scannerWorkTimeoutMs, handlerSafetyTimeoutMs - 2_000)
    ));
    resultPublishTimeoutMs = Math.max(10, Math.min(
      options.resultPublishTimeoutMs ?? LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS,
      Math.max(10, handlerSafetyTimeoutMs - artifactChainTimeoutMs)
    ));
    artifactAbortController = new AbortController();
    scannerAbortController = new AbortController();
    scannerDeadlineTimer = setTimeout(() => {
      scannerCancellationRequestedAt = now();
      scannerAbortController?.abort(new Error(`Scanner work exceeded its ${scannerWorkTimeoutMs}ms deadline.`));
    }, scannerWorkTimeoutMs);
    const artifactResult = await withHandlerSafetyTimeout(
      runArtifactChain(payload, {
        allowRuntimeEvidenceFinalizationAfterAbort:
          payload.workerLane === "runtime_evidence",
        artifactSignal: artifactAbortController.signal,
        artifactRoot,
        onScanCoreComplete: () => {
          if (scannerCoreCompleted) return;
          scannerCoreCompleted = true;
          if (scannerDeadlineTimer) {
            clearTimeout(scannerDeadlineTimer);
            scannerDeadlineTimer = undefined;
          }
          console.info("[v2-lambda-phase] scan core completed; artifact handoff reserve activated", {
            elapsedMs: Math.max(0, Date.now() - handlerStartedAtMs),
            scanId: payload?.scanId,
          });
        },
        onPolicySurfaceComplete: (result) => {
          if (payload?.orchestrationMode === "worker" && payload.workerLane !== "policy_evidence") return;
          if (policyEvidenceHandoff) return;
          try {
            const packet = buildVerifiedPolicyEvidencePacket({ payload: payload!, result });
            policyEvidenceHandoff = publishVerifiedPolicyEvidence({
              packet,
              payload: payload!,
              s3Client: options.s3Client,
              sqsClient: options.sqsClient,
            }).catch((error): undefined => {
              console.warn("[v2-lambda-policy] early verified evidence handoff failed closed", {
                error: error instanceof Error ? error.message : String(error),
                scanId: payload?.scanId,
              });
              return undefined;
            });
          } catch (error) {
            console.warn("[v2-lambda-policy] early verified evidence handoff failed closed", {
              error: error instanceof Error ? error.message : String(error),
              scanId: payload?.scanId,
            });
          }
        },
        physicalInvocationId: options.awsRequestId ?? undefined,
        policySurfaceDeadlineAtMs:
          handlerStartedAtMs + scannerWorkTimeoutMs - LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
        preConsentModuleDeadlineMs: Math.max(
          1_000,
          payload.workerLane === "consent_proof"
            ? scannerWorkTimeoutMs -
              LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS -
              LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS -
              LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_FALLBACK_BUDGET_MS
            : scannerWorkTimeoutMs - (
              payload.workerLane === "runtime_evidence"
                ? LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS
                : LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS
            ),
        ),
        preConsentVisualFallbackDeadlineMs: Math.max(
          1_000,
          Math.min(
            LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS,
            LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS -
              LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS,
          ),
        ),
        preConsentVisualFallbackDeadlineAtMs:
          handlerStartedAtMs + scannerWorkTimeoutMs -
          LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS -
          LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS,
        signal: scannerAbortController.signal,
      }),
      artifactChainTimeoutMs,
      () => {
        scannerCancellationRequestedAt ??= now();
        scannerAbortController?.abort(new Error(`Artifact chain exceeded its ${artifactChainTimeoutMs}ms deadline.`));
        artifactAbortController?.abort(new Error(`Artifact chain exceeded its ${artifactChainTimeoutMs}ms deadline.`));
      }
    );
    clearTimeout(scannerDeadlineTimer);
    scannerDeadlineTimer = undefined;
    artifactChainCompletedAt = now();
    if (payload.orchestrationMode === "worker") {
      // The dedicated policy worker preserves the existing early, verified
      // policy handoff. Await it before returning so Lambda freeze cannot drop
      // the S3 packet or its non-terminal SQS notification.
      await policyEvidenceHandoff;
      const consentRejectAvailability = payload.workerLane === "consent_proof" && artifactRoot
        ? await readConsentRejectAvailabilityFromArtifactRoot(artifactRoot)
        : undefined;
      const completedAt = now();
      const workerHandlerTiming = buildLocalV2DagLambdaHandlerTiming({
        artifactChainCompletedAt,
        artifactChainStartedAt,
        completedAt,
        handlerStartedAt,
        phaseTimings: artifactResult.phaseTimings,
      });
      handlerOutcome = "completed";
      return {
        artifactMetadata: artifactResult.artifactMetadata,
        artifactPointers: artifactResult.artifactPointers,
        completedAt: completedAt.toISOString(),
        handlerTiming: workerHandlerTiming,
        phaseTimings: artifactResult.phaseTimings,
        ...(artifactResult.postRefusalEvidence
          ? { postRefusalEvidence: artifactResult.postRefusalEvidence }
          : {}),
        ...(consentRejectAvailability ? { consentRejectAvailability } : {}),
        scanId: payload.scanId,
        status: "completed" as const,
        workerLane: payload.workerLane ?? "coordinator",
      };
    }
    const policyEvidence = await policyEvidenceHandoff;
    phaseTimings = artifactResult.phaseTimings;
    const completedAt = now();
    const result = buildLocalV2DagLambdaResultMessage({
      artifactMetadata: artifactResult.artifactMetadata,
      artifactPointers: artifactResult.artifactPointers,
      completedAt,
      handlerTiming: buildLocalV2DagLambdaHandlerTiming({
        artifactChainCompletedAt,
        artifactChainStartedAt,
        completedAt,
        handlerStartedAt,
        phaseTimings
      }),
      ...(artifactResult.laneTimingSummary
        ? { laneTimingSummary: artifactResult.laneTimingSummary }
        : {}),
      payload,
      phaseTimings,
      ...(policyEvidence ? { policyEvidence } : {}),
      status: "completed"
    });
    await sendLocalV2DagLambdaResultMessage({
      message: result,
      queueUrl: payload.resultQueueUrl,
      sqsClient: options.sqsClient,
      timeoutMs: remainingResultPublishMs()
    });
    handlerOutcome = "completed";
    return result;
  } catch (error) {
    const cancellationObservedAt = now();
    const scannerDeadlineAborted = scannerAbortController?.signal.aborted === true;
    if (scannerDeadlineTimer) clearTimeout(scannerDeadlineTimer);
    scannerAbortController?.abort(error);
    artifactAbortController?.abort(error);
    if (!payload) {
      throw error;
    }
    handlerOutcome = "failed";
    const handlerDeadlineAtMs = handlerStartedAtMs + handlerSafetyTimeoutMs;
    const terminalPublicationReserveMs = Math.max(10, resultPublishTimeoutMs);
    const diagnosticShutdownReserveMs = Math.min(
      2_000,
      Math.max(10, Math.floor(handlerSafetyTimeoutMs / 10)),
    );
    const diagnosticBudgetAvailable =
      handlerDeadlineAtMs - Date.now() >= terminalPublicationReserveMs + diagnosticShutdownReserveMs;
    let failureDiagnostic: Awaited<ReturnType<typeof writeAndUploadFailureDiagnostic>> | undefined;
    if (
      artifactRoot &&
      diagnosticBudgetAvailable
    ) {
      const diagnosticUploadStartedAt = now();
      console.info("[v2-lambda-terminal] failure diagnostic upload started", {
        diagnosticUploadStartedAt: diagnosticUploadStartedAt.toISOString(),
        scanId: payload.scanId,
      });
      try {
        const diagnosticUploadTimeoutMs = Math.max(
          10,
          Math.min(1_500, handlerDeadlineAtMs - Date.now() - terminalPublicationReserveMs),
        );
        failureDiagnostic = await withHandlerSafetyTimeout(
          writeAndUploadFailureDiagnostic({
            artifactRoot,
            artifactChainTimeoutMs,
            cancellationReason: error instanceof Error ? error.message : String(error),
            cancellationObservedAt,
            cancellationRequestedAt: scannerCancellationRequestedAt,
            handlerStartedAt,
            payload,
            scannerWorkTimeoutMs,
            s3Client: options.s3Client,
            terminalPublicationReserveMs,
          }),
          diagnosticUploadTimeoutMs,
        );
        console.info("[v2-lambda-terminal] failure diagnostic upload completed", {
          diagnosticUploadCompletedAt: now().toISOString(),
          durationMs: Math.max(0, now().getTime() - diagnosticUploadStartedAt.getTime()),
          scanId: payload.scanId,
        });
      } catch (diagnosticError) {
        console.warn("[v2-lambda-terminal] failure diagnostic upload failed", {
          durationMs: Math.max(0, now().getTime() - diagnosticUploadStartedAt.getTime()),
          error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
          scanId: payload.scanId,
        });
      }
    }
    if (payload.orchestrationMode === "worker") {
      return {
        artifactMetadata: failureDiagnostic?.artifactMetadata,
        artifactPointers: failureDiagnostic?.artifactPointers,
        error: sanitizeError({
          code: scannerDeadlineAborted
            ? "v2_dag_lambda_safety_timeout"
            : "v2_dag_lambda_worker_failed",
          message: error instanceof Error ? error.message : String(error)
        }),
        scanId: payload.scanId,
        status: "failed" as const,
        workerLane: payload.workerLane ?? "coordinator"
      };
    }
    const completedAt = now();
    const result = buildLocalV2DagLambdaResultMessage({
      artifactMetadata: failureDiagnostic?.artifactMetadata,
      artifactPointers: failureDiagnostic?.artifactPointers,
      completedAt,
      error: {
        code: error instanceof LocalV2DagLambdaSafetyTimeoutError
          ? error.code
          : scannerDeadlineAborted
            ? "v2_dag_lambda_safety_timeout"
          : "v2_dag_lambda_failed",
        message: error instanceof Error ? error.message : String(error)
      },
      handlerTiming: buildLocalV2DagLambdaHandlerTiming({
        artifactChainCompletedAt,
        artifactChainStartedAt,
        completedAt,
        handlerStartedAt,
        phaseTimings
      }),
      payload,
      status: "failed"
    });
    const terminalPublicationStartedAt = now();
    const terminalPublicationTimeoutMs = remainingResultPublishMs();
    console.info("[v2-lambda-terminal] publication started", {
      cancellationObservedAt: cancellationObservedAt.toISOString(),
      cancellationRequestedAt: scannerCancellationRequestedAt?.toISOString() ?? null,
      diagnosticBudgetAvailable,
      scanId: payload.scanId,
      terminalPublicationStartedAt: terminalPublicationStartedAt.toISOString(),
      terminalPublicationTimeoutMs,
    });
    try {
      await sendLocalV2DagLambdaResultMessage({
        message: result,
        queueUrl: payload.resultQueueUrl,
        sqsClient: options.sqsClient,
        timeoutMs: terminalPublicationTimeoutMs
      });
      console.info("[v2-lambda-terminal] publication completed", {
        durationMs: Math.max(0, now().getTime() - terminalPublicationStartedAt.getTime()),
        scanId: payload.scanId,
        terminalPublicationCompletedAt: now().toISOString(),
      });
    } catch (publicationError) {
      console.error("[v2-lambda-terminal] publication failed", {
        durationMs: Math.max(0, now().getTime() - terminalPublicationStartedAt.getTime()),
        error: publicationError instanceof Error ? publicationError.message : String(publicationError),
        scanId: payload.scanId,
      });
      throw publicationError;
    }
    return result;
  } finally {
    const durationMs = Math.max(0, Date.now() - handlerStartedAtMs);
    if (payload && durationMs >= LOCAL_V2_DAG_LAMBDA_DURATION_WARNING_MS) {
      console.warn(JSON.stringify({
        event: "v2_lambda_duration_warning",
        aws_request_id: options.awsRequestId ?? null,
        duration_ms: durationMs,
        function_name: payload.functionName,
        handler_outcome: handlerOutcome,
        hostname: payload.hostname,
        orchestration_mode: payload.orchestrationMode ?? "single",
        region: payload.awsRegion,
        scan_id: payload.scanId,
        target_environment: payload.targetEnvironment,
        threshold_ms: LOCAL_V2_DAG_LAMBDA_DURATION_WARNING_MS,
        worker_lane: payload.workerLane ?? null,
      }));
    }
  }
}

function consentScenariosForWorkerLane(workerLane: LocalV2DagLambdaWorkerLane): ConsentFlowScenario[] {
  switch (workerLane) {
    case "coordinator":
    case "consent_proof":
    case "runtime_evidence":
    case "policy_evidence":
    case "reject_observation":
      return [];
    case "consent_flows":
      return ["accept_all_flow", "gpc_enabled", "reject_all_flow", "privacy_opt_out_flow"];
    case "accept_gpc":
      return ["accept_all_flow", "gpc_enabled"];
    case "accept_only":
      return ["accept_all_flow"];
    case "reject_manage":
      return ["reject_all_flow", "privacy_opt_out_flow"];
  }
}

async function writePlannerHintUsageArtifact(input: {
  artifactRoot: string;
  payload: LocalV2DagLambdaDispatchPayload;
  workerLane: LocalV2DagLambdaWorkerLane;
}) {
  if (input.workerLane === "coordinator") {
    return;
  }
  await mkdir(input.artifactRoot, { recursive: true });
  const laneScenarios = consentScenariosForWorkerLane(input.workerLane);
  const planned = new Set(input.payload.coordinatorPlanSummary?.plannedScenarios ?? []);
  const recipeScenarios = new Set(input.payload.coordinatorPlanSummary?.actionRecipe?.scenarios
    .flatMap((scenario) => parseConsentFlowScenario(scenario.scenario) ?? []) ?? []);
  const plannedLaneScenarios = laneScenarios.filter((scenario) => planned.has(scenario) || recipeScenarios.has(scenario));
  const status = input.payload.coordinatorPlanSummary
    ? plannedLaneScenarios.length > 0 ? "used" : "present_but_no_lane_match"
    : "missing";
  await writeJson(path.join(input.artifactRoot, `LambdaPlannerHintUsage-${input.workerLane}.json`), {
    artifactOnly: true,
    artifactVersion: "certscore.v2.lambda.planner_hint_usage.v1",
    generatedAt: new Date().toISOString(),
    laneScenarios,
    plannedLaneScenarios,
    productionFindingIntegration: false,
    scanId: input.payload.scanId,
    source: "coordinatorPlanSummary",
    status,
    targetUrl: input.payload.targetUrl,
    workerLane: input.workerLane
  });
}

async function readCoordinatorPlanSummary(
  artifactRoot: string,
  expectedConsentScenarios?: ConsentFlowScenario[]
): Promise<LocalV2DagLambdaCoordinatorPlanSummary | undefined> {
  try {
    const artifact = asRecord(JSON.parse(await readFile(path.join(artifactRoot, "consent_scenario_plan.json"), "utf8")));
    const plannedScenarios = Array.isArray(artifact.plannedScenarios)
      ? artifact.plannedScenarios.flatMap((item) => parseConsentFlowScenario(asRecord(item).scenario) ?? [])
      : [];
    const skippedScenarios = Array.isArray(artifact.skippedScenarios)
      ? artifact.skippedScenarios.flatMap((item) => {
        const record = asRecord(item);
        const scenario = parseConsentFlowScenario(record.scenario);
        const skipReason = compactString(record.skipReason);
        if (!scenario || !skipReason) {
          return [];
        }
        return [{
          reasonCodes: Array.isArray(record.reasonCodes)
            ? record.reasonCodes.flatMap((reason) => compactString(reason) ?? []).slice(0, 12)
            : [],
          scenario,
          skipReason: skipReason.slice(0, 80)
        }];
      }).slice(0, 12)
      : [];
    const actionRecipe = await readCoordinatorActionRecipe(artifactRoot, artifact, expectedConsentScenarios);
    return {
      ...(actionRecipe ? { actionRecipe } : {}),
      artifactVersion: "certscore.v2.lambda.coordinator-plan-summary.v1",
      generatedAt: new Date().toISOString(),
      plannedScenarios,
      skippedScenarios
    };
  } catch {
    return undefined;
  }
}

async function readCoordinatorActionRecipe(
  artifactRoot: string,
  planArtifact: Record<string, unknown>,
  expectedConsentScenarios?: ConsentFlowScenario[]
): Promise<LocalV2DagLambdaConsentActionRecipe | undefined> {
  const normalizedUrl = compactString(planArtifact.normalizedUrl) ?? compactString(planArtifact.sourceUrl);
  if (!normalizedUrl) {
    return undefined;
  }
  const researchArtifact = await readOptionalJsonRecord(path.join(artifactRoot, "consent_action_recipe_research.json"));
  const baselineCandidates = parseRecipeResearchCandidates(asRecord(researchArtifact?.baseline).candidates);
  const plannedScenarios = Array.isArray(planArtifact.plannedScenarios) ? planArtifact.plannedScenarios : [];
  const scenarios = plannedScenarios.flatMap((item) => {
    const record = asRecord(item);
    const scenario = parseConsentFlowScenario(record.scenario);
    const actionType = compactString(record.actionType);
    if (!scenario || scenario === "baseline_pre_consent" || !actionType) {
      return [];
    }
    return [{
      actionType,
      candidates: baselineCandidates
        .filter((candidate) => !candidate.actionType || candidate.actionType === actionType)
        .slice(0, 12),
      scenario,
      ...(compactString(record.targetUrl) ? { targetUrl: compactString(record.targetUrl) ?? undefined } : {})
    }];
  });
  const existingScenarios = new Set<ConsentFlowScenario>(
    scenarios.flatMap((scenario) => parseConsentFlowScenario(scenario.scenario) ?? [])
  );
  const diagnosticExpectedScenarios = (expectedConsentScenarios ?? [])
    .filter((scenario) => !existingScenarios.has(scenario))
    .flatMap((scenario) => {
      const actionType = actionTypeForConsentScenario(scenario);
      if (!actionType) {
        return [];
      }
      return [{
        actionType,
        candidates: [],
        scenario
      }];
    });
  return {
    artifactVersion: "certscore.v2.consent-action-recipe.v1",
    generatedAt: new Date().toISOString(),
    normalizedUrl,
    scenarios: [...scenarios, ...diagnosticExpectedScenarios].slice(0, 8)
  };
}

function actionTypeForConsentScenario(scenario: ConsentFlowScenario): string | undefined {
  switch (scenario) {
    case "accept_all_flow":
      return "accept_all";
    case "reject_all_flow":
      return "reject_all";
    case "privacy_opt_out_flow":
      return "do_not_sell_share";
    default:
      return undefined;
  }
}

async function readOptionalJsonRecord(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    return asRecord(JSON.parse(await readFile(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

function parseRecipeResearchCandidates(value: unknown): LocalV2DagLambdaConsentActionRecipe["scenarios"][number]["candidates"] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const record = asRecord(entry);
      const labelText = compactString(record.labelText);
      if (!labelText) {
        return [];
      }
      return [{
        ...(compactString(record.actionType) ? { actionType: compactString(record.actionType) ?? undefined } : {}),
        ...(typeof record.confidence === "number" ? { confidence: Math.max(0, Math.min(1, record.confidence)) } : {}),
        ...(compactString(record.frameKind) ? { frameKind: compactString(record.frameKind) ?? undefined } : {}),
        ...(compactString(record.frameUrl) ? { frameUrl: compactString(record.frameUrl) ?? undefined } : {}),
        labelText: labelText.slice(0, 160),
        ...(compactString(record.selectorSummary) ? { selectorSummary: compactString(record.selectorSummary) ?? undefined } : {}),
        ...(typeof record.visible === "boolean" ? { visible: record.visible } : {})
      }];
    }).slice(0, 24)
    : [];
}

export async function readLocalManifest(pathOrUri: string) {
  const filePath = pathOrUri.startsWith("file://") ? new URL(pathOrUri) : pathOrUri;
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}
