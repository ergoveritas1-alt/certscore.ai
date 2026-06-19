import { getRuntimeVersionInfo } from "../runtime-version";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE,
  LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE
} from "./local-v2-dag-lambda-dispatch";

export type ScanExecutionProvenanceEventRecord = {
  id: string;
  eventType: string;
  message: string;
  metadataJson: unknown;
  createdAt: string;
};

export type ScanExecutionProvenanceRecord = {
  artifactBucket: string | null;
  artifactPrefix: string | null;
  browserRuntimeMode: string | null;
  lambdaAcceptedAt: string | null;
  lambdaAwsRegion: string | null;
  lambdaFunctionName: string | null;
  lambdaResultAt: string | null;
  lambdaResultStatus: string | null;
  lambdaRunViaAws: boolean;
  lambdaRunViaLambdaRequested: boolean;
  lambdaSimulated: boolean;
  requestedScanFromLabel: string;
  requestedScanFromValue: string;
  scannerGitSha: string | null;
  scannerImageTag: string | null;
  scannerRuntime: string | null;
  scannerRuntimeVersion: string | null;
  webGitSha: string | null;
  webImageTag: string | null;
};

function getRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getNestedRecordValue(value: unknown, keys: string[]): Record<string, unknown> | null {
  let current: unknown = value;
  for (const key of keys) {
    const record = getRecordValue(current);
    if (!record) {
      return null;
    }
    current = record[key];
  }
  return getRecordValue(current);
}

function getNestedStringValue(value: unknown, keys: string[]): string | null {
  let current: unknown = value;
  for (const key of keys) {
    const record = getRecordValue(current);
    if (!record) {
      return null;
    }
    current = record[key];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function getNestedBooleanValue(value: unknown, keys: string[]): boolean | null {
  let current: unknown = value;
  for (const key of keys) {
    const record = getRecordValue(current);
    if (!record) {
      return null;
    }
    current = record[key];
  }
  return typeof current === "boolean" ? current : null;
}

function parseS3UriParts(value: string | null | undefined) {
  if (!value?.startsWith("s3://")) {
    return { bucket: null, prefix: null };
  }

  const withoutScheme = value.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex < 0) {
    return { bucket: withoutScheme || null, prefix: null };
  }

  const bucket = withoutScheme.slice(0, slashIndex);
  const key = withoutScheme.slice(slashIndex + 1);
  const prefix = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : key;
  return {
    bucket: bucket || null,
    prefix: prefix || null
  };
}

function latestEvent(events: ScanExecutionProvenanceEventRecord[], eventTypes: string[]) {
  const eventTypeSet = new Set(eventTypes);
  return [...events].reverse().find((event) => eventTypeSet.has(event.eventType)) ?? null;
}

export function buildScanExecutionProvenance(input: {
  events: ScanExecutionProvenanceEventRecord[];
  runtimeArtifacts: Record<string, unknown> | null;
  scanConfig: Record<string, unknown> | null;
  scanFromLabel: string;
  scanFromValue: string;
}): ScanExecutionProvenanceRecord {
  const dispatchRequested = latestEvent(input.events, [LOCAL_V2_DAG_LAMBDA_DISPATCH_REQUESTED_EVENT_TYPE]);
  const dispatchStarted = latestEvent(input.events, [LOCAL_V2_DAG_LAMBDA_DISPATCH_STARTED_EVENT_TYPE]);
  const dispatchAccepted = latestEvent(input.events, [LOCAL_V2_DAG_LAMBDA_DISPATCH_ACCEPTED_EVENT_TYPE]);
  const lambdaResult = latestEvent(input.events, [
    LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE,
    LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE
  ]);
  const dispatchMetadata =
    getRecordValue(dispatchAccepted?.metadataJson) ??
    getRecordValue(dispatchStarted?.metadataJson) ??
    getRecordValue(dispatchRequested?.metadataJson) ??
    getNestedRecordValue(input.scanConfig, ["execution", "v2DagLambda"]);
  const resultMetadata = getRecordValue(lambdaResult?.metadataJson);
  const scanArtifactUri =
    getNestedStringValue(resultMetadata, ["artifactPointers", "scanArtifactUri"]) ??
    getNestedStringValue(resultMetadata, ["artifactPointers", "manifestUri"]);
  const artifactParts = parseS3UriParts(scanArtifactUri);
  const runtimeDiagnostics =
    getNestedRecordValue(input.runtimeArtifacts, ["local_v2_dag_lambda_runtime_diagnostics"]) ??
    getNestedRecordValue(input.runtimeArtifacts, ["localV2DagLambdaRuntimeDiagnostics"]) ??
    getNestedRecordValue(input.runtimeArtifacts, ["runtimeDiagnostics"]);
  const webRuntime = getRuntimeVersionInfo();
  const lambdaSimulated =
    getNestedBooleanValue(dispatchMetadata, ["simulatedLocalLambda"]) ??
    getNestedBooleanValue(input.scanConfig, ["execution", "v2DagLambda", "simulatedLocalLambda"]) ??
    false;

  return {
    artifactBucket: artifactParts.bucket,
    artifactPrefix: artifactParts.prefix,
    browserRuntimeMode:
      getNestedStringValue(runtimeDiagnostics, ["browserRuntimeMode"]) ??
      (getNestedBooleanValue(runtimeDiagnostics, ["awsLambdaRuntime"]) === true ? "lambda_chromium" : null),
    lambdaAcceptedAt: dispatchAccepted?.createdAt ?? null,
    lambdaAwsRegion:
      getNestedStringValue(dispatchMetadata, ["awsRegion"]) ??
      getNestedStringValue(input.scanConfig, ["execution", "v2DagLambda", "awsRegion"]),
    lambdaFunctionName:
      getNestedStringValue(dispatchMetadata, ["functionName"]) ??
      getNestedStringValue(input.scanConfig, ["execution", "v2DagLambda", "functionName"]),
    lambdaResultAt: lambdaResult?.createdAt ?? null,
    lambdaResultStatus:
      getNestedStringValue(resultMetadata, ["resultStatus"]) ??
      getNestedStringValue(resultMetadata, ["status"]) ??
      (lambdaResult?.eventType === LOCAL_V2_DAG_LAMBDA_RESULT_FAILED_EVENT_TYPE ? "failed" : lambdaResult ? "completed" : null),
    lambdaRunViaAws: Boolean(dispatchAccepted) && !lambdaSimulated,
    lambdaRunViaLambdaRequested:
      Boolean(dispatchRequested) ||
      getNestedRecordValue(input.scanConfig, ["execution", "v2DagLambda"]) !== null,
    lambdaSimulated,
    requestedScanFromLabel: input.scanFromLabel,
    requestedScanFromValue: input.scanFromValue,
    scannerGitSha:
      getNestedStringValue(input.runtimeArtifacts, ["scanner_git_sha"]) ??
      getNestedStringValue(input.runtimeArtifacts, ["scannerGitSha"]) ??
      getNestedStringValue(resultMetadata, ["scannerGitSha"]),
    scannerImageTag:
      getNestedStringValue(input.runtimeArtifacts, ["scanner_image_tag"]) ??
      getNestedStringValue(input.runtimeArtifacts, ["scannerImageTag"]) ??
      getNestedStringValue(resultMetadata, ["scannerImageTag"]),
    scannerRuntime:
      getNestedStringValue(dispatchMetadata, ["scannerRuntime"]) ??
      getNestedStringValue(input.scanConfig, ["execution", "v2DagLambda", "scannerRuntime"]),
    scannerRuntimeVersion:
      getNestedStringValue(input.runtimeArtifacts, ["scanner_runtime_version"]) ??
      getNestedStringValue(input.runtimeArtifacts, ["scannerRuntimeVersion"]) ??
      getNestedStringValue(resultMetadata, ["scannerRuntimeVersion"]),
    webGitSha: webRuntime.gitSha,
    webImageTag: webRuntime.imageTag
  };
}
