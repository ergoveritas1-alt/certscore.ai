import type {
  RequestedGeoTarget,
  ScanFrom,
  SharedScanConfig
} from "@website-signal-risk-scanner/shared";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  isLocalV2DagLambdaAwsRegion,
  type LocalV2DagLambdaAwsRegion,
  type LocalV2DagLambdaDebugOverrides,
  type LocalV2DagLambdaTargetEnvironment,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";

export const LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE = "v2_lambda_dispatch.requested";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE = "v2_lambda_dispatch.started";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE = "v2_lambda_dispatch.accepted";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_FAILED_EVENT_TYPE = "v2_lambda_dispatch.failed";
export const LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE = "v2_lambda_result.received";
export const LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE = "v2_lambda_result.failed";

export type LocalV2DagLambdaDispatchPayload = {
  artifactOnly: true;
  awsRegion: LocalV2DagLambdaAwsRegion;
  callbackCorrelationId: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION;
  functionName: string;
  debugOverrides?: LocalV2DagLambdaDebugOverrides;
  hostname: string;
  localCallbackUrl: string | null;
  orchestrationMode?: "single" | "sharded";
  productionFindingIntegration: false;
  profile: LocalV2DagScanProfile;
  regionalRealIpEgress?: {
    egressId: string;
    provider: RequestedGeoTarget["provider"];
    required: boolean;
    requestedGeo: RequestedGeoTarget;
    scanFrom: ScanFrom;
  };
  resultHandoff: "sqs";
  resultQueueUrl: string;
  scanId: string;
  requestedGeo?: RequestedGeoTarget;
  scanFrom?: ScanFrom;
  scannerRuntime: "certscore-v2-dag-parallel-path";
  targetEnvironment: LocalV2DagLambdaTargetEnvironment;
  targetUrl: string;
  vpcMode: "none";
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
};

export type LocalV2DagLambdaDispatchSummary = {
  awsRegion: LocalV2DagLambdaAwsRegion;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION;
  dispatchRequested: boolean;
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  resultHandoff: "sqs";
  simulatedLocalLambda: boolean;
  targetEnvironment: LocalV2DagLambdaTargetEnvironment;
  vpcMode: "none";
};

export type LocalV2DagLambdaResultStatus = "completed" | "failed";

export type LocalV2DagLambdaPhaseTiming = {
  completedAt?: string;
  durationMs: number;
  label: string;
  startedAt?: string;
  status: "completed" | "failed" | "skipped";
};

export type LocalV2DagLambdaHandlerTiming = {
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

export type LocalV2DagLambdaResultMessage = {
  artifactOnly: true;
  artifactMetadata?: {
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
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  productionFindingIntegration: false;
  scanId: string;
  scannerGitSha?: string;
  scannerImageTag?: string;
  scannerRuntimeVersion?: string;
  status: LocalV2DagLambdaResultStatus;
  targetEnvironment: LocalV2DagLambdaTargetEnvironment;
};

export type LocalV2DagLambdaResultIngestion = {
  artifactPromotion: false;
  parsedMessage: LocalV2DagLambdaResultMessage;
  productionFindingIntegration: false;
  status: "parsed_only";
};

export type LocalV2DagLambdaDispatchResult = {
  dispatched: true;
  invocationRequestId: string | null;
  invocationStatusCode: number;
  invocationType: "Event";
  payload: LocalV2DagLambdaDispatchPayload;
};

type LambdaInvokeCommand = import("@aws-sdk/client-lambda").InvokeCommand;
type LambdaInvokeCommandOutput = import("@aws-sdk/client-lambda").InvokeCommandOutput;

type LambdaInvokeClient = {
  send(command: LambdaInvokeCommand): Promise<LambdaInvokeCommandOutput>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getLambdaIntent(config: SharedScanConfig | Record<string, unknown> | null | undefined) {
  return asRecord(asRecord(config).execution).v2DagLambda;
}

function getProfile(config: SharedScanConfig | Record<string, unknown>): LocalV2DagScanProfile {
  const execution = asRecord(asRecord(config).execution);
  const v2DagParallel = asRecord(execution.v2DagParallel);
  if (v2DagParallel.profile === "tiny" || asRecord(config).profile === "tiny") {
    return "tiny";
  }
  return "standard";
}

function requireString(value: unknown, field: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new Error(`Local v2 DAG Lambda dispatch is missing ${field}.`);
  }
  return normalized;
}

function requireAwsRegion(value: unknown): LocalV2DagLambdaAwsRegion {
  if (!isLocalV2DagLambdaAwsRegion(value)) {
    throw new Error("Local v2 DAG Lambda dispatch target AWS region is not supported.");
  }
  return value;
}

export function isLocalV2DagLambdaIntentSimulated(
  config: SharedScanConfig | Record<string, unknown> | null | undefined
) {
  return asRecord(getLambdaIntent(config)).simulatedLocalLambda === true;
}

export function summarizeLocalV2DagLambdaDispatchForEvent(
  config: SharedScanConfig | Record<string, unknown> | null | undefined
): LocalV2DagLambdaDispatchSummary | null {
  const intent = asRecord(getLambdaIntent(config));
  if (Object.keys(intent).length === 0) {
    return null;
  }

  return {
    awsRegion: requireAwsRegion(intent.awsRegion),
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    dispatchRequested: true,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    resultHandoff: "sqs",
    simulatedLocalLambda: intent.simulatedLocalLambda === true,
    targetEnvironment:
      intent.targetEnvironment === "production" ? "production" : "local",
    vpcMode: "none"
  };
}

export function buildLocalV2DagLambdaDispatchPayload(input: {
  localCallbackUrl?: string | null;
  scanConfig: SharedScanConfig | Record<string, unknown>;
  scanId: string;
}): LocalV2DagLambdaDispatchPayload {
  const config = asRecord(input.scanConfig);
  const intent = asRecord(getLambdaIntent(input.scanConfig));
  if (Object.keys(intent).length === 0) {
    throw new Error("Local v2 DAG Lambda dispatch requested without execution.v2DagLambda.");
  }

  if (intent.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    throw new Error("Local v2 DAG Lambda dispatch must use the v2 DAG parallel-path processor.");
  }
  if (intent.scannerRuntime !== "certscore-v2-dag-parallel-path") {
    throw new Error("Local v2 DAG Lambda dispatch must use the v2 DAG parallel-path scanner runtime.");
  }
  if (intent.resultHandoff !== "sqs") {
    throw new Error("Local v2 DAG Lambda dispatch must hand results back through SQS.");
  }
  if (intent.vpcMode !== "none") {
    throw new Error("Local v2 DAG Lambda dispatch must run outside a VPC.");
  }
  if (intent.contractVersion !== LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION) {
    throw new Error("Local v2 DAG Lambda dispatch contract version is not supported.");
  }
  const awsRegion = requireAwsRegion(intent.awsRegion);

  return {
    artifactOnly: true,
    awsRegion,
    callbackCorrelationId: input.scanId,
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: requireString(intent.functionName, "functionName"),
    ...(asRecord(intent.debugOverrides) && Object.keys(asRecord(intent.debugOverrides)).length > 0
      ? { debugOverrides: asRecord(intent.debugOverrides) as LocalV2DagLambdaDebugOverrides }
      : {}),
    hostname: requireString(config.hostname, "hostname"),
    localCallbackUrl: stringValue(input.localCallbackUrl),
    orchestrationMode: intent.orchestrationMode === "sharded" ? "sharded" : "single",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: getProfile(config),
    ...(asRecord(intent.regionalRealIpEgress) && Object.keys(asRecord(intent.regionalRealIpEgress)).length > 0
      ? { regionalRealIpEgress: asRecord(intent.regionalRealIpEgress) as LocalV2DagLambdaDispatchPayload["regionalRealIpEgress"] }
      : {}),
    resultHandoff: "sqs",
    resultQueueUrl: requireString(intent.resultQueueUrl, "resultQueueUrl"),
    scanId: requireString(input.scanId, "scanId"),
    ...(asRecord(intent.requestedGeo) && Object.keys(asRecord(intent.requestedGeo)).length > 0
      ? { requestedGeo: asRecord(intent.requestedGeo) as RequestedGeoTarget }
      : {}),
    ...(typeof intent.scanFrom === "string" ? { scanFrom: intent.scanFrom as ScanFrom } : {}),
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment:
      intent.targetEnvironment === "production" ? "production" : "local",
    targetUrl: requireString(config.normalizedUrl, "normalizedUrl"),
    vpcMode: "none"
  };
}

export async function dispatchLocalV2DagLambdaScan(input: {
  lambdaClient?: LambdaInvokeClient;
  localCallbackUrl?: string | null;
  scanConfig: SharedScanConfig | Record<string, unknown>;
  scanId: string;
}): Promise<LocalV2DagLambdaDispatchResult> {
  const payload = buildLocalV2DagLambdaDispatchPayload(input);
  const { InvokeCommand, LambdaClient } = await import("@aws-sdk/client-lambda");
  const lambdaClient = input.lambdaClient ?? new LambdaClient({ region: payload.awsRegion });
  const command = new InvokeCommand({
    FunctionName: payload.functionName,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify(payload))
  });
  const response = await lambdaClient.send(command);
  const statusCode = response.StatusCode ?? 0;

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Local v2 DAG Lambda dispatch was not accepted by AWS Lambda: status ${statusCode}.`);
  }

  return {
    dispatched: true,
    invocationRequestId: response.$metadata.requestId ?? null,
    invocationStatusCode: statusCode,
    invocationType: "Event",
    payload
  };
}

function parseJson(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  const record = asRecord(value);
  if (typeof record.Body === "string") {
    return JSON.parse(record.Body);
  }

  return value;
}

function parseArtifactPointers(value: unknown): LocalV2DagLambdaResultMessage["artifactPointers"] {
  const record = asRecord(value);
  const artifactPointers: NonNullable<LocalV2DagLambdaResultMessage["artifactPointers"]> = {};
  const manifestUri = stringValue(record.manifestUri);
  const reportAdapterArtifactUri = stringValue(record.reportAdapterArtifactUri);
  const reviewArtifactUri = stringValue(record.reviewArtifactUri);
  const scanArtifactUri = stringValue(record.scanArtifactUri);

  if (manifestUri) {
    artifactPointers.manifestUri = requireDurableArtifactUri(manifestUri);
  }
  if (reportAdapterArtifactUri) {
    artifactPointers.reportAdapterArtifactUri = requireDurableArtifactUri(reportAdapterArtifactUri);
  }
  if (reviewArtifactUri) {
    artifactPointers.reviewArtifactUri = requireDurableArtifactUri(reviewArtifactUri);
  }
  if (scanArtifactUri) {
    artifactPointers.scanArtifactUri = requireDurableArtifactUri(scanArtifactUri);
  }

  return Object.keys(artifactPointers).length > 0 ? artifactPointers : undefined;
}

function requireDurableArtifactUri(value: string) {
  if (!value.startsWith("s3://")) {
    throw new Error("Local v2 DAG Lambda artifact pointers must use durable s3:// URIs.");
  }
  return value;
}

function parseArtifactMetadata(value: unknown): LocalV2DagLambdaResultMessage["artifactMetadata"] {
  const record = asRecord(value);
  const fields = ["manifestUri", "reportAdapterArtifactUri", "reviewArtifactUri", "scanArtifactUri"] as const;
  const artifactMetadata: NonNullable<LocalV2DagLambdaResultMessage["artifactMetadata"]> = {};

  for (const field of fields) {
    const metadata = asRecord(record[field]);
    const sha256 = stringValue(metadata.sha256);
    const sizeBytes = typeof metadata.sizeBytes === "number" && Number.isFinite(metadata.sizeBytes)
      ? metadata.sizeBytes
      : null;
    if (sha256 && sizeBytes !== null && /^[a-f0-9]{64}$/i.test(sha256) && sizeBytes >= 0) {
      artifactMetadata[field] = {
        sha256: sha256.toLowerCase(),
        sizeBytes
      };
    }
  }

  return Object.keys(artifactMetadata).length > 0 ? artifactMetadata : undefined;
}

function parsePhaseTimings(value: unknown): LocalV2DagLambdaPhaseTiming[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const timings = value.flatMap((item) => {
    const record = asRecord(item);
    const label = stringValue(record.label);
    const completedAt = stringValue(record.completedAt);
    const durationMs = typeof record.durationMs === "number" && Number.isFinite(record.durationMs)
      ? record.durationMs
      : null;
    const startedAt = stringValue(record.startedAt);
    const status: LocalV2DagLambdaPhaseTiming["status"] | null =
      record.status === "failed" || record.status === "completed" || record.status === "skipped"
        ? record.status
        : null;
    return label && durationMs !== null && status
      ? [{
          ...(completedAt ? { completedAt } : {}),
          durationMs: Math.max(0, Math.round(durationMs)),
          label: label.slice(0, 80),
          ...(startedAt ? { startedAt } : {}),
          status
        }]
      : [];
  });
  return timings.length > 0 ? timings.slice(0, 40) : undefined;
}

function parseHandlerTiming(value: unknown): LocalV2DagLambdaHandlerTiming | undefined {
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

export function parseLocalV2DagLambdaResultMessage(
  rawMessage: unknown,
  options: { expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment } = {}
): LocalV2DagLambdaResultMessage {
  const record = asRecord(parseJson(rawMessage));
  const contractVersion = record.contractVersion;
  const status = record.status;
  const targetEnvironment = record.targetEnvironment;

  if (contractVersion !== LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION) {
    throw new Error("Unsupported local v2 DAG Lambda result contract version.");
  }
  if (record.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    throw new Error("Local v2 DAG Lambda result came from an unexpected processor.");
  }
  if (targetEnvironment !== "local" && targetEnvironment !== "production") {
    throw new Error("Local v2 DAG Lambda result has an invalid target environment.");
  }
  if (options.expectedTargetEnvironment && targetEnvironment !== options.expectedTargetEnvironment) {
    throw new Error("Local v2 DAG Lambda result target environment does not match this runtime.");
  }
  if (status !== "completed" && status !== "failed") {
    throw new Error("Local v2 DAG Lambda result status must be completed or failed.");
  }
  if (record.productionFindingIntegration !== false || record.artifactOnly !== true) {
    throw new Error("Local v2 DAG Lambda result must remain artifact-only and non-production.");
  }

  const errorRecord = asRecord(record.error);
  const errorMessage = stringValue(errorRecord.message);
  const parsed: LocalV2DagLambdaResultMessage = {
    artifactOnly: true,
    completedAt: requireString(record.completedAt, "completedAt"),
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: requireString(record.scanId, "scanId"),
    status,
    targetEnvironment
  };
  const artifactPointers = parseArtifactPointers(record.artifactPointers);
  if (artifactPointers) {
    parsed.artifactPointers = artifactPointers;
  }
  const artifactMetadata = parseArtifactMetadata(record.artifactMetadata);
  if (artifactMetadata) {
    parsed.artifactMetadata = artifactMetadata;
  }
  const phaseTimings = parsePhaseTimings(record.phaseTimings);
  if (phaseTimings) {
    parsed.phaseTimings = phaseTimings;
  }
  const handlerTiming = parseHandlerTiming(record.handlerTiming);
  if (handlerTiming) {
    parsed.handlerTiming = handlerTiming;
  }
  const scannerGitSha = stringValue(record.scannerGitSha);
  if (scannerGitSha) {
    parsed.scannerGitSha = scannerGitSha.slice(0, 80);
  }
  const scannerImageTag = stringValue(record.scannerImageTag);
  if (scannerImageTag) {
    parsed.scannerImageTag = scannerImageTag.slice(0, 160);
  }
  const scannerRuntimeVersion = stringValue(record.scannerRuntimeVersion);
  if (scannerRuntimeVersion) {
    parsed.scannerRuntimeVersion = scannerRuntimeVersion.slice(0, 80);
  }
  if (errorMessage) {
    parsed.error = {
      ...(stringValue(errorRecord.code) ? { code: stringValue(errorRecord.code) as string } : {}),
      message: errorMessage
    };
  }

  return parsed;
}

export function ingestLocalV2DagLambdaResultMessage(
  rawMessage: unknown,
  options: { expectedTargetEnvironment?: LocalV2DagLambdaTargetEnvironment } = {}
): LocalV2DagLambdaResultIngestion {
  return {
    artifactPromotion: false,
    parsedMessage: parseLocalV2DagLambdaResultMessage(rawMessage, options),
    productionFindingIntegration: false,
    status: "parsed_only"
  };
}
