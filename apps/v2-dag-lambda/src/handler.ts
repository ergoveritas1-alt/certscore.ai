import { InvokeCommand, LambdaClient, type InvokeCommandOutput } from "@aws-sdk/client-lambda";
import { GetObjectCommand, PutObjectCommand, S3Client, type GetObjectCommandOutput, type PutObjectCommandOutput } from "@aws-sdk/client-s3";
import { SQSClient, SendMessageCommand, type SendMessageCommandOutput } from "@aws-sdk/client-sqs";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { connect as tlsConnect } from "node:tls";
import { chromium } from "playwright";
import {
  VERIFIED_POLICY_EVIDENCE_PACKET_VERSION,
  canonicalEvidenceBundleSchema,
  classifyV2DagLambdaResultDisposition,
  derivePolicySurfaceInspectionOutcome,
  verifiedPolicyEvidencePacketSchema,
  type CanonicalEvidenceBundle,
  type ConsentFlowScenario,
  type ScreenshotArtifact,
  type VerifiedPolicyEvidencePacket,
  type V2DagLambdaResultPurpose,
} from "@certscore/contracts";
import {
  chromiumContextOptions,
  chromiumLaunchArgs,
  chromiumLaunchOptions,
  isAwsLambdaRuntime,
  lambdaChromiumSingleProcessEnabled,
  mergePolicySurfaceObservations,
  runScan,
  type RunScanInput
} from "@certscore/scan-core";

export const LOCAL_V2_DAG_LAMBDA_AWS_REGIONS = ["eu-central-1", "eu-west-1", "us-west-2"] as const;
export type LocalV2DagLambdaAwsRegion = (typeof LOCAL_V2_DAG_LAMBDA_AWS_REGIONS)[number];
export const LOCAL_V2_DAG_LAMBDA_AWS_REGION = "eu-central-1" satisfies LocalV2DagLambdaAwsRegion;
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";
export const LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
export const LOCAL_V2_DAG_LAMBDA_POLICY_EVIDENCE_MESSAGE_VERSION =
  "certscore.v2.lambda-policy-evidence-ready.v1" as const;
export const LOCAL_V2_DAG_SCAN_PROCESSOR = "local-certscore-v2-dag-parallel-v1";
export const LOCAL_V2_DAG_SCANNER_RUNTIME = "certscore-v2-dag-parallel-path";
export const POST_CONSENT_FLOW_SCANNING_ENABLED = false;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS = 15_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS = 15_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS = 60_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS = 45_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS = 48_000;
export const LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS = 12_000;
export const LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS = 2_000;
const LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS = 10_000;
const LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS = 4_000;
const LOCAL_V2_DAG_LAMBDA_AWS_SEND_ATTEMPT_TIMEOUT_MS = 4_000;
const LOCAL_V2_DAG_LAMBDA_AWS_SEND_MAX_ATTEMPTS = 3;

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
    url: string;
  }>;
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
  };
  artifactPointers?: {
    failureDiagnosticUri?: string;
    manifestUri?: string;
    reportAdapterArtifactUri?: string;
    reviewArtifactUri?: string;
    scanArtifactUri?: string;
  };
  completedAt: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION;
  error?: {
    code?: string;
    message: string;
  };
  handlerTiming?: LocalV2DagLambdaHandlerTiming;
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
  /**
   * Verified pointer fallback for consumers that receive this terminal message
   * before the separately published early-policy message. This remains
   * artifact-only and non-projectable until matched to terminal evidence.
   */
  policyEvidence?: LocalV2DagLambdaPolicyEvidenceMessage;
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
type LocalV2DagLambdaWorkerLane = "coordinator" | "consent_flows" | "accept_gpc" | "accept_only" | "reject_manage";
type LocalV2DagLambdaDebugOverrides = {
  actionFinalSettleMs?: number;
  actionSearchDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
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
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
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
  send(command: GetObjectCommand): Promise<GetObjectCommandOutput>;
};

type LambdaInvokeClient = {
  send(command: InvokeCommand): Promise<InvokeCommandOutput>;
};

type ArtifactChainResult = {
  artifactMetadata?: LocalV2DagLambdaResultMessage["artifactMetadata"];
  artifactPointers?: LocalV2DagLambdaResultMessage["artifactPointers"];
  phaseTimings?: LocalV2DagLambdaPhaseTiming[];
};

export type LocalV2DagLambdaRuntimeDiagnostics = ReturnType<typeof buildLocalV2DagLambdaRuntimeDiagnostics>;

type HandlerOptions = {
  artifactChainTimeoutMs?: number;
  handlerSafetyTimeoutMs?: number;
  lambdaClient?: LambdaInvokeClient;
  now?: () => Date;
  resultPublishTimeoutMs?: number;
  runArtifactChain?: (payload: LocalV2DagLambdaDispatchPayload, options: {
    artifactSignal?: AbortSignal;
    artifactRoot: string;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
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
  throw new Error("Local v2 DAG Lambda dispatch must target eu-central-1, eu-west-1, or us-west-2.");
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

  return payload;
}

function parsePolicySurfaceSeeds(value: unknown): NonNullable<LocalV2DagLambdaDispatchPayload["policySurfaceSeeds"]> {
  if (!Array.isArray(value)) return [];
  const selected = new Map<string, NonNullable<LocalV2DagLambdaDispatchPayload["policySurfaceSeeds"]>[number]>();
  for (const item of value.slice(0, 24)) {
    const record = asRecord(item);
    const hintType = compactString(record.hintType);
    const source = record.source;
    const rawUrl = compactString(record.url);
    if (
      !hintType ||
      !["privacy_policy", "cookie_policy", "privacy_choice", "consent_preferences"].includes(hintType) ||
      (source !== "prior_scan_hint" && source !== "canonical_legal_surface_hint") ||
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
  return value === "coordinator" || value === "consent_flows" || value === "accept_gpc" || value === "accept_only" || value === "reject_manage";
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

export async function runLocalV2DagLambdaArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    allowedConsentFlowScenarios?: ConsentFlowScenario[];
    artifactSignal?: AbortSignal;
    artifactRoot: string;
    externalBaselinePlanning?: "enrich" | "reuse_only";
    forceAllowedScenarioPlanning?: boolean;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    phaseLabelPrefix?: string;
    preConsentScreenshotMode?: "always" | "selective" | "never";
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
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
  const egressPreflightPromise = timeLambdaPhase(
    phaseTimings,
    "egress_preflight",
    () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: false }),
  );
  const scanBundlePromise = runLocalV2DagLambdaScanBundle(payload, {
    artifactRoot,
    phaseLabelPrefix: options.phaseLabelPrefix,
    phaseTimings,
    preConsentScreenshotMode: options.preConsentScreenshotMode ?? scanTuning.preConsentScreenshotMode,
    preConsentModuleDeadlineMs: options.preConsentModuleDeadlineMs,
    preConsentVisualFallbackDeadlineMs: options.preConsentVisualFallbackDeadlineMs,
    onScanCoreComplete: options.onScanCoreComplete,
    onPolicySurfaceComplete: options.onPolicySurfaceComplete,
    scanTuning,
    signal: options.signal,
    policySurfaceDeadlineAtMs: options.policySurfaceDeadlineAtMs,
  });
  const [egressAvailable, bundle] = await Promise.all([egressPreflightPromise, scanBundlePromise]);
  if (!egressAvailable) {
    await timeLambdaPhase(
      phaseTimings,
      "egress_preflight_browser_fallback",
      () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: true, skipLightweightProbe: true }),
    );
  }

  return writeAndUploadLocalV2DagLambdaArtifacts({
    artifactRoot,
    bundle,
    payload,
    phaseTimings,
    s3Client: options.s3Client,
    scanTuning,
    signal: options.artifactSignal ?? options.signal
  });
}

async function runLocalV2DagLambdaScanBundle(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    artifactRoot: string;
    onScanCoreComplete?: () => void;
    onPolicySurfaceComplete?: NonNullable<RunScanInput["onPolicySurfaceComplete"]>;
    phaseLabelPrefix?: string;
    phaseTimings: LocalV2DagLambdaPhaseTiming[];
    preConsentScreenshotMode?: "always" | "selective" | "never";
    policySurfaceDeadlineAtMs?: number;
    preConsentModuleDeadlineMs?: number;
    preConsentVisualFallbackDeadlineMs?: number;
    scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
    signal?: AbortSignal;
  }
) {
  return timeLambdaPhase(options.phaseTimings, phaseLabel(options.phaseLabelPrefix, "scan"), async () => {
    const resourceSampler = startRuntimeResourceSampler();
    try {
      const bundle = await runScan({
        browserReuseMode: "per_module",
        outDir: options.artifactRoot,
        onPolicySurfaceComplete: options.onPolicySurfaceComplete,
        policyOutputGraceMs: 1_000,
        policyPlanningDeadlineMs: 1_500,
        policySurfaceDeadlineAtMs: options.policySurfaceDeadlineAtMs,
        policySurfaceSeeds: payload.policySurfaceSeeds,
        postConsentFlowsEnabled: false,
        preConsentModuleDeadlineMs: options.preConsentModuleDeadlineMs,
        preConsentScreenshotMode: options.preConsentScreenshotMode,
        preConsentScreenshotTimeoutMs: options.scanTuning.preConsentScreenshotTimeoutMs,
        preConsentVisualFallbackDeadlineMs:
          options.preConsentVisualFallbackDeadlineMs ?? options.scanTuning.preConsentVisualFallbackDeadlineMs,
        profile: payload.profile,
        scenarioPlanningMode: "planned_parallel",
        scenarioResourceMode: effectiveScenarioResourceMode(payload, options.scanTuning),
        signal: options.signal,
        url: payload.targetUrl
      });
      options.onScanCoreComplete?.();
      return bundle;
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
  payload: LocalV2DagLambdaDispatchPayload;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
  s3Client?: S3PutClient;
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
  signal?: AbortSignal;
}): Promise<{
  artifactMetadata: LocalV2DagLambdaArtifactMetadata;
  artifactPointers: LocalV2DagLambdaArtifactPointers;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
}> {
  const { artifactRoot, bundle, payload, phaseTimings, scanTuning } = input;
  const scanArtifactPath = path.join(artifactRoot, "CanonicalEvidenceBundle.json");
  await timeLambdaPhase(phaseTimings, "scan_artifact_write", () => writeJson(scanArtifactPath, bundle));

  const manifestPath = path.join(artifactRoot, "LocalV2DagLambdaManifest.json");
  const pointers = artifactPointersFromS3Keys({
    bucket: requireArtifactBucket(),
    keyPrefix: artifactKeyPrefix(payload),
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
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
      ...manifestArtifactMetadata
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

async function writeEgressPreflightArtifact(
  artifactRoot: string,
  options: { allowBrowserFallback: boolean; skipLightweightProbe?: boolean },
): Promise<boolean> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
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
  const artifact = {
    artifactVersion: "certscore.v2.lambda-egress-preflight.v1",
    checkedAt: new Date().toISOString(),
    completedAt: null as string | null,
    durationMs: 0,
    egressLabel: egressLabel ? egressLabel.slice(0, 80) : null,
    proxyModeEnabled: proxyEnabled,
    probeStatus: "skipped" as "available" | "failed" | "skipped",
    provider: null as string | null,
    observed: null as null | {
      asn?: string;
      country?: string;
      ip?: string;
      org?: string;
      region?: string;
      timezone?: string;
    },
    startedAt: startedAtIso,
    error: null as null | string
  };

  if (!proxyEnabled) {
    const completedAt = Date.now();
    artifact.completedAt = new Date(completedAt).toISOString();
    artifact.durationMs = completedAt - startedAt;
    await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
    return true;
  }

  if (!options.skipLightweightProbe && proxyServer) {
    try {
      const response = await fetchEgressProbeThroughProxy(proxyServer);
      const parsed = parseEgressProbeResponse(response.text);
      artifact.provider = "ipinfo.io";
      artifact.probeStatus = response.status >= 200 && response.status < 300 && parsed ? "available" : "failed";
      artifact.observed = parsed;
      if (artifact.probeStatus === "available") {
        const completedAt = Date.now();
        artifact.completedAt = new Date(completedAt).toISOString();
        artifact.durationMs = completedAt - startedAt;
        await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
        return true;
      }
      artifact.error = `Unexpected lightweight egress preflight response: HTTP ${response.status}`;
    } catch (error) {
      artifact.error = error instanceof Error ? error.message.slice(0, 240) : "unknown_lightweight_egress_preflight_error";
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
  try {
    browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    const context = await browser.newContext(chromiumContextOptions());
    const page = await context.newPage();
    const response = await page.goto("https://ipinfo.io/json", {
      timeout: 7_500,
      waitUntil: "domcontentloaded"
    });
    const text = (await page.locator("body").textContent({ timeout: 2_000 })) ?? "";
    const parsed = parseEgressProbeResponse(text);
    artifact.provider = "ipinfo.io";
    artifact.probeStatus = response && response.ok() && parsed ? "available" : "failed";
    artifact.observed = parsed;
    if (artifact.probeStatus === "available") {
      artifact.error = null;
    }
    if (!parsed) {
      artifact.error = `Unexpected egress preflight response: HTTP ${response?.status() ?? 0}`;
    }
    await context.close().catch(() => undefined);
  } catch (error) {
    artifact.probeStatus = "failed";
    artifact.error = error instanceof Error ? error.message.slice(0, 240) : "unknown_egress_preflight_error";
  } finally {
    await browser?.close().catch(() => undefined);
    const completedAt = Date.now();
    artifact.completedAt = new Date(completedAt).toISOString();
    artifact.durationMs = completedAt - startedAt;
    await writeJson(path.join(artifactRoot, "EgressPreflight.json"), artifact);
  }
  return artifact.probeStatus === "available";
}

function parseEgressProbeResponse(text: string) {
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
    return null;
  }
}

async function fetchEgressProbeThroughProxy(
  proxyServer: string,
): Promise<{ status: number; text: string }> {
  const proxyUrl = new URL(proxyServer.includes("://") ? proxyServer : `http://${proxyServer}`);
  if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
    throw new Error(`Unsupported lightweight egress proxy protocol: ${proxyUrl.protocol}`);
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
    const request = connectRequest({
      hostname: proxyUrl.hostname,
      method: "CONNECT",
      path: "ipinfo.io:443",
      port: proxyUrl.port ? Number(proxyUrl.port) : proxyUrl.protocol === "https:" ? 443 : 80,
      headers: {
        Host: "ipinfo.io:443",
        ...(proxyAuthorization ? { "Proxy-Authorization": proxyAuthorization } : {}),
      },
    });
    const fail = (error: unknown) => {
      request.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    request.setTimeout(5_000, () => fail(new Error("Lightweight egress proxy CONNECT timed out")));
    request.once("error", fail);
    request.once("connect", (response, socket, head) => {
      request.removeListener("error", fail);
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Lightweight egress proxy CONNECT failed: HTTP ${response.statusCode ?? 0}`));
        return;
      }
      if (head.length > 0) {
        socket.unshift(head);
      }
      const secureSocket = tlsConnect({
        rejectUnauthorized: true,
        servername: "ipinfo.io",
        socket,
      });
      const probeRequest = httpsRequest({
        agent: false,
        createConnection: () => secureSocket,
        headers: {
          Accept: "application/json",
          "User-Agent": "CertScore-Egress-Preflight/1.0",
        },
        hostname: "ipinfo.io",
        method: "GET",
        path: "/json",
        port: 443,
      }, (probeResponse) => {
        const chunks: Buffer[] = [];
        let sizeBytes = 0;
        probeResponse.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          sizeBytes += buffer.length;
          if (sizeBytes <= 64 * 1024) {
            chunks.push(buffer);
          } else {
            probeRequest.destroy(new Error("Lightweight egress response exceeded 64 KiB"));
          }
        });
        probeResponse.once("end", () => resolve({
          status: probeResponse.statusCode ?? 0,
          text: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      probeRequest.setTimeout(5_000, () => probeRequest.destroy(new Error("Lightweight egress HTTPS probe timed out")));
      probeRequest.once("error", reject);
      probeRequest.end();
    });
    request.end();
  });
}

export async function runLocalV2DagLambdaShardedArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: {
    artifactRoot: string;
    lambdaClient?: LambdaInvokeClient;
    s3Client?: S3PutClient;
    s3GetClient?: S3GetClient;
    workspaceRoot?: string;
  }
): Promise<{
  artifactMetadata: LocalV2DagLambdaArtifactMetadata;
  artifactPointers: LocalV2DagLambdaArtifactPointers;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
}> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const artifactRoot = path.resolve(workspaceRoot, options.artifactRoot);
  const phaseTimings: LocalV2DagLambdaPhaseTiming[] = [];
  const scanTuning = buildLocalV2DagLambdaScanTuning();
  await mkdir(artifactRoot, { recursive: true });
  const egressPreflightPromise = timeLambdaPhase(
    phaseTimings,
    "egress_preflight",
    () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: false }),
  );
  const strongWebMdMode = isStrongWebMdEvidenceMode(payload, scanTuning);
  const coordinatorBundlePromise = runLocalV2DagLambdaScanBundle(payload, {
    artifactRoot,
    phaseLabelPrefix: "coordinator",
    phaseTimings,
    preConsentScreenshotMode: scanTuning.preConsentScreenshotMode,
    scanTuning
  });
  const [egressAvailable, coordinatorBundle] = await Promise.all([
    egressPreflightPromise,
    coordinatorBundlePromise,
  ]);
  if (!egressAvailable) {
    await timeLambdaPhase(
      phaseTimings,
      "egress_preflight_browser_fallback",
      () => writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: true, skipLightweightProbe: true }),
    );
  }
  if (!POST_CONSENT_FLOW_SCANNING_ENABLED) {
    phaseTimings.push(skippedLambdaPhaseTiming("worker_invocations"));
    await writeJson(path.join(artifactRoot, "LocalV2DagLambdaShardSummary.json"), {
      artifactOnly: true,
      generatedAt: new Date().toISOString(),
      productionFindingIntegration: false,
      scanId: payload.scanId,
      skippedReason: "post_consent_flow_scanning_deferred_from_production_scanner",
      workerResults: []
    });

    return writeAndUploadLocalV2DagLambdaArtifacts({
      artifactRoot,
      bundle: coordinatorBundle,
      payload,
      phaseTimings,
      s3Client: options.s3Client,
      scanTuning
    });
  }
  const coordinatorPlanSummary = await readCoordinatorPlanSummary(
    artifactRoot,
    payload.debugOverrides?.expectedConsentScenarios
  );
  if (coordinatorPlanSummary) {
    await writeJson(path.join(artifactRoot, "LocalV2DagLambdaCoordinatorPlanSummary.json"), coordinatorPlanSummary);
  }
  const workerResults = await timeLambdaPhase(phaseTimings, "worker_invocations", () =>
    invokeLocalV2DagLambdaWorkers({
      coordinatorPlanSummary,
      lambdaClient: options.lambdaClient,
      parentPayload: strongWebMdMode ? { ...payload, strongEvidenceMode: "webmd" } : payload,
      parentScanId: payload.scanId,
      workerLanes: strongWebMdMode ? ["accept_only", "reject_manage"] : ["accept_gpc", "reject_manage"]
    })
  );
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
  const bundle = await timeLambdaPhase(phaseTimings, "shard_bundle_merge", async () =>
    mergeLocalV2DagLambdaShardBundles({
      base: coordinatorBundle,
      scanId: payload.scanId,
      workerBundles
    })
  );
  await writeJson(path.join(artifactRoot, "LocalV2DagLambdaShardSummary.json"), {
    artifactOnly: true,
    generatedAt: new Date().toISOString(),
    productionFindingIntegration: false,
    scanId: payload.scanId,
    coordinatorPlanSummary,
    workerResults: workerResults.map((result) => ({
      artifactPointers: result.artifactPointers,
      phaseTimings: result.phaseTimings ?? [],
      scanId: result.scanId,
      status: result.status,
      workerLane: result.workerLane
    }))
  });

  return writeAndUploadLocalV2DagLambdaArtifacts({
    artifactRoot,
    bundle,
    payload: coordinatorPlanSummary ? { ...payload, coordinatorPlanSummary } : payload,
    phaseTimings,
    s3Client: options.s3Client,
    scanTuning
  });
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

async function invokeLocalV2DagLambdaWorkers(input: {
  coordinatorPlanSummary?: LocalV2DagLambdaCoordinatorPlanSummary;
  lambdaClient?: LambdaInvokeClient;
  parentPayload: LocalV2DagLambdaDispatchPayload;
  parentScanId: string;
  workerLanes: LocalV2DagLambdaWorkerLane[];
}): Promise<LocalV2DagLambdaShardResult[]> {
  const lambdaClient = input.lambdaClient ?? new LambdaClient({ region: input.parentPayload.awsRegion });
  return Promise.all(input.workerLanes.map(async (workerLane) => {
    const workerPayload: LocalV2DagLambdaDispatchPayload = {
      ...input.parentPayload,
      callbackCorrelationId: input.parentScanId,
      ...(input.coordinatorPlanSummary ? { coordinatorPlanSummary: input.coordinatorPlanSummary } : {}),
      orchestrationMode: "worker",
      scanId: `${input.parentScanId}_${workerLane}`,
      workerLane
    };
    const response = await lambdaClient.send(new InvokeCommand({
      FunctionName: input.parentPayload.functionName,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(workerPayload))
    }));
    if ((response.StatusCode ?? 0) < 200 || (response.StatusCode ?? 0) >= 300) {
      throw new Error(`Local v2 DAG Lambda worker ${workerLane} was not accepted: status ${response.StatusCode ?? 0}.`);
    }
    if (response.FunctionError) {
      throw new Error(`Local v2 DAG Lambda worker ${workerLane} failed: ${response.FunctionError}.`);
    }
    return parseLocalV2DagLambdaShardResult(response.Payload, workerLane);
  }));
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
    throw new Error(`Local v2 DAG Lambda worker ${expectedWorkerLane} returned ${String(parsed.status)}.`);
  }
  const artifactPointers = parseArtifactPointersRecord(parsed.artifactPointers);
  if (!artifactPointers.scanArtifactUri) {
    throw new Error(`Local v2 DAG Lambda worker ${expectedWorkerLane} did not return a scan artifact URI.`);
  }
  return {
    artifactMetadata: parseArtifactMetadataRecord(parsed.artifactMetadata),
    artifactPointers,
    phaseTimings: parsePhaseTimings(parsed.phaseTimings),
    scanId: requireString(parsed, "scanId"),
    status: "completed",
    workerLane
  };
}

function parseArtifactPointersRecord(value: unknown): LocalV2DagLambdaArtifactPointers {
  const record = asRecord(value);
  return {
    failureDiagnosticUri: compactString(record.failureDiagnosticUri) ?? undefined,
    manifestUri: compactString(record.manifestUri) ?? undefined,
    reportAdapterArtifactUri: compactString(record.reportAdapterArtifactUri) ?? undefined,
    reviewArtifactUri: compactString(record.reviewArtifactUri) ?? undefined,
    scanArtifactUri: compactString(record.scanArtifactUri) ?? undefined
  };
}

function parseArtifactMetadataRecord(value: unknown): LocalV2DagLambdaArtifactMetadata {
  const record = asRecord(value);
  return {
    failureDiagnosticUri: parseArtifactMetadataEntry(record.failureDiagnosticUri),
    manifestUri: parseArtifactMetadataEntry(record.manifestUri),
    reportAdapterArtifactUri: parseArtifactMetadataEntry(record.reportAdapterArtifactUri),
    reviewArtifactUri: parseArtifactMetadataEntry(record.reviewArtifactUri),
    scanArtifactUri: parseArtifactMetadataEntry(record.scanArtifactUri)
  };
}

function parseArtifactMetadataEntry(value: unknown) {
  const record = asRecord(value);
  const sha256 = compactString(record.sha256);
  const sizeBytes = typeof record.sizeBytes === "number" ? record.sizeBytes : null;
  return sha256 && sizeBytes !== null ? { sha256, sizeBytes } : undefined;
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
  const s3Client = options.s3GetClient ?? new S3Client({ region: options.awsRegion ?? LOCAL_V2_DAG_LAMBDA_AWS_REGION });
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToBuffer(response.Body);
  const expected = result.artifactMetadata?.scanArtifactUri;
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (expected?.sha256 && expected.sha256 !== sha256) {
    throw new Error(`Local v2 DAG Lambda worker ${result.workerLane} scan artifact checksum mismatch.`);
  }
  return canonicalEvidenceBundleSchema.parse(JSON.parse(body.toString("utf8")));
}

export async function mirrorWorkerArtifactsIntoFinalArtifactRoot(input: {
  artifactRoot: string;
  awsRegion?: LocalV2DagLambdaAwsRegion;
  s3GetClient?: S3GetClient;
  workerResults: LocalV2DagLambdaShardResult[];
}) {
  const s3Client = input.s3GetClient ?? new S3Client({ region: input.awsRegion ?? LOCAL_V2_DAG_LAMBDA_AWS_REGION });
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
      }];
    }).map((mirror) => mirror()));
  }));
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

export function mergeLocalV2DagLambdaShardBundles(input: {
  base: CanonicalEvidenceBundle;
  scanId: string;
  workerBundles: CanonicalEvidenceBundle[];
}): CanonicalEvidenceBundle {
  const bundles = [input.base, ...input.workerBundles];
  const merged = {
    ...input.base,
    scanId: input.scanId,
    completedAt: new Date().toISOString(),
    modulesRun: dedupeByJson(bundles.flatMap((bundle) => bundle.modulesRun)),
    runtimeTimeline: dedupeByEventId(bundles.flatMap((bundle) => bundle.runtimeTimeline)),
    networkEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.networkEvents)),
    networkResponseEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.networkResponseEvents)),
    cookieEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.cookieEvents)),
    cookieSnapshots: dedupeByArtifactId(bundles.flatMap((bundle) => bundle.cookieSnapshots)),
    storageSnapshots: dedupeByArtifactId(bundles.flatMap((bundle) => bundle.storageSnapshots)),
    scriptEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.scriptEvents)),
    iframeEvents: dedupeByEventId(bundles.flatMap((bundle) => bundle.iframeEvents)),
    consentUiObservations: dedupeByField(bundles.flatMap((bundle) => bundle.consentUiObservations), "observationId"),
    consentInteractionEvents: dedupeByField(bundles.flatMap((bundle) => bundle.consentInteractionEvents), "eventId"),
    consentFlowObservations: dedupeByField(bundles.flatMap((bundle) => bundle.consentFlowObservations), "observationId"),
    consentActionCandidates: dedupeByField(bundles.flatMap((bundle) => bundle.consentActionCandidates), "candidateId"),
    consentActionAttempts: dedupeByField(bundles.flatMap((bundle) => bundle.consentActionAttempts), "attemptId"),
    consentFlowComparisons: [] as CanonicalEvidenceBundle["consentFlowComparisons"],
    policySurfaceObservations: bundles.reduce(
      (observations, bundle) => mergePolicySurfaceObservations(observations, bundle.policySurfaceObservations),
      [] as CanonicalEvidenceBundle["policySurfaceObservations"],
    ),
    cmpRuntimeObservations: dedupeByField(bundles.flatMap((bundle) => bundle.cmpRuntimeObservations), "observationId"),
    screenshots: selectDiagnosticScreenshot(bundles.flatMap((bundle) => bundle.screenshots)),
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
    memorySizeMb: Number.isFinite(memorySizeMb) ? memorySizeMb : null,
    nodeVersion: process.version,
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
  return `${prefix.replace(/^\/+|\/+$/g, "")}/${payload.scanId}`;
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
  const body = Buffer.from(`${JSON.stringify({
    artifactOnly: true,
    artifactVersion: "certscore.v2_lambda_failure_diagnostic.1",
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
    const s3Client = input.s3Client ?? new S3Client({ region: input.payload.awsRegion });
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
        input.s3Client ?? new S3Client({ region: input.payload.awsRegion })
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
        input.s3Client ?? new S3Client({ region: input.payload.awsRegion })
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
  auxiliaryArtifacts: LocalV2DagLambdaAuxiliaryArtifact[];
  bundle: CanonicalEvidenceBundle;
  payload: LocalV2DagLambdaDispatchPayload;
  phaseTimings: LocalV2DagLambdaPhaseTiming[];
  pointers: LocalV2DagLambdaArtifactPointers;
  scanTuning: ReturnType<typeof buildLocalV2DagLambdaScanTuning>;
}) {
  const manifestPath = path.join(input.artifactRoot, "LocalV2DagLambdaManifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    artifactOnly: true,
    auxiliaryArtifacts: input.auxiliaryArtifacts,
    contractVersion: "certscore.v2.lambda-dag-artifact-manifest.v1",
    generatedAt: new Date().toISOString(),
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
    ...(input.phaseTimings ? { phaseTimings: input.phaseTimings } : {}),
    ...(input.policyEvidence ? { policyEvidence: input.policyEvidence } : {}),
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
      input.s3Client ?? new S3Client({ region: input.payload.awsRegion })
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
  return message;
}

export async function handler(event: unknown, options: HandlerOptions = {}) {
  let payload: LocalV2DagLambdaDispatchPayload | null = null;
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

  const remainingResultPublishMs = () => Math.max(
    10,
    Math.min(resultPublishTimeoutMs, handlerStartedAtMs + handlerSafetyTimeoutMs - Date.now())
  );

  try {
    payload = parseLocalV2DagLambdaDispatchPayload(event);
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    artifactRoot = buildLocalV2DagLambdaArtifactRoot({
      scanId: payload.scanId,
      workspaceRoot
    });
    if (payload.orchestrationMode === "worker") {
      throw new Error("Post-consent consent-flow Lambda worker scanning is disabled for the GDPR/ePrivacy core scanner.");
    }
    const runArtifactChain = options.runArtifactChain ?? ((dispatchPayload, runOptions) =>
      runLocalV2DagLambdaArtifactChain(dispatchPayload, { ...runOptions, s3Client: options.s3Client, workspaceRoot }));
    artifactChainStartedAt = now();
    const configuredHandlerSafetyTimeoutMs = options.handlerSafetyTimeoutMs ?? (
      Number(process.env.CERTSCORE_V2_DAG_LAMBDA_HANDLER_SAFETY_TIMEOUT_MS) ||
      LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS
    );
    handlerSafetyTimeoutMs = Math.max(
      options.handlerSafetyTimeoutMs === undefined ? 5_000 : 10,
      Math.min(configuredHandlerSafetyTimeoutMs, 60_000)
    );
    scannerWorkTimeoutMs = Math.max(10, Math.min(
      options.scannerWorkTimeoutMs ?? LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS,
      Math.max(10, handlerSafetyTimeoutMs - 15_000)
    ));
    artifactChainTimeoutMs = Math.max(scannerWorkTimeoutMs, Math.min(
      options.artifactChainTimeoutMs ?? LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS,
      Math.max(scannerWorkTimeoutMs, handlerSafetyTimeoutMs - 8_000)
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
        policySurfaceDeadlineAtMs:
          handlerStartedAtMs + scannerWorkTimeoutMs - LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
        preConsentModuleDeadlineMs: Math.max(
          1_000,
          scannerWorkTimeoutMs - LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS,
        ),
        preConsentVisualFallbackDeadlineMs: Math.max(
          1_000,
          Math.min(
            LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS,
            LOCAL_V2_DAG_LAMBDA_PRECONSENT_SHUTDOWN_RESERVE_MS -
              LOCAL_V2_DAG_LAMBDA_POST_FALLBACK_RESERVE_MS,
          ),
        ),
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
    if (payload.orchestrationMode === "worker") {
      return {
        error: sanitizeError({
          code: "v2_dag_lambda_worker_failed",
          message: error instanceof Error ? error.message : String(error)
        }),
        scanId: payload.scanId,
        status: "failed" as const,
        workerLane: payload.workerLane ?? "coordinator"
      };
    }
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
      diagnosticBudgetAvailable &&
      (scannerDeadlineAborted || error instanceof LocalV2DagLambdaSafetyTimeoutError)
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
  }
}

function consentScenariosForWorkerLane(workerLane: LocalV2DagLambdaWorkerLane): ConsentFlowScenario[] {
  switch (workerLane) {
    case "coordinator":
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
