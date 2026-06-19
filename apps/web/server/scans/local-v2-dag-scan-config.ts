import { normalizeScanFrom, type ScanFrom, type SharedScanConfig } from "@website-signal-risk-scanner/shared";

export const LOCAL_V2_DAG_SCAN_PROCESSOR = "local-certscore-v2-dag-parallel-v1";
export const LOCAL_V2_DAG_SCAN_PROFILE = "standard";
export const LOCAL_V2_DAG_SCAN_PROFILES = ["standard", "tiny"] as const;
export const LOCAL_V2_DAG_LAMBDA_AWS_REGION = "eu-central-1";
export const LOCAL_V2_DAG_LAMBDA_AWS_REGIONS = ["eu-central-1", "eu-west-1", "us-west-2"] as const;
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";

export type LocalV2DagScanProfile = (typeof LOCAL_V2_DAG_SCAN_PROFILES)[number];
export type LocalV2DagLambdaAwsRegion = (typeof LOCAL_V2_DAG_LAMBDA_AWS_REGIONS)[number];
export type LocalV2DagLambdaTargetEnvironment = "local" | "production";
export type LocalV2DagLambdaDebugOverrides = {
  actionFinalSettleMs?: number;
  actionSearchDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
  preActionObservationMs?: number;
  scenarioConcurrency?: number;
  scenarioResourceMode?: "normal" | "lean" | "cmp_safe";
  strongEvidenceMode?: "webmd";
};

export type LocalV2DagScanEnv = {
  CERTSCORE_V2_DAG_LAMBDA_ENABLED?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_DE_ENABLED?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_DE_FUNCTION_NAME?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_IE_ENABLED?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME?: string;
  CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME?: string;
  CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE?: string;
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_SIMULATED?: string;
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV?: string;
  CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED?: string;
  CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME?: string;
  CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
};

export function normalizeLocalV2DagScanProfile(value: unknown): LocalV2DagScanProfile {
  return value === "tiny" ? "tiny" : LOCAL_V2_DAG_SCAN_PROFILE;
}

function isLocalhostUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

export function shouldUseLocalV2DagScanTool(env: LocalV2DagScanEnv = process.env) {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return isLocalhostUrl(env.NEXT_PUBLIC_APP_URL);
}

function compactEnvValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function shouldUseLocalV2DagSimulatedLambda(env: LocalV2DagScanEnv = process.env) {
  return env.CERTSCORE_V2_DAG_LAMBDA_SIMULATED === "true" && shouldUseLocalV2DagScanTool(env);
}

export function getSqsQueueRegion(queueUrl: string | null) {
  if (!queueUrl) {
    return null;
  }

  try {
    const hostname = new URL(queueUrl).hostname;
    const match = hostname.match(/^sqs\.([a-z0-9-]+)\.amazonaws\.com$/);
    const region = match?.[1] ?? null;
    return isLocalV2DagLambdaAwsRegion(region) ? region : region;
  } catch {
    return null;
  }
}

export function isLocalV2DagLambdaAwsRegion(value: unknown): value is LocalV2DagLambdaAwsRegion {
  return typeof value === "string" && LOCAL_V2_DAG_LAMBDA_AWS_REGIONS.includes(value as LocalV2DagLambdaAwsRegion);
}

export function getLocalV2DagLambdaAwsRegionForScanFrom(value: unknown): LocalV2DagLambdaAwsRegion {
  const scanFrom = normalizeScanFrom(value);
  if (scanFrom === "eu_ie") {
    return "eu-west-1";
  }
  if (scanFrom === "california") {
    return "us-west-2";
  }
  return "eu-central-1";
}

function lambdaRegionEnv(input: { env: LocalV2DagScanEnv; scanFrom?: ScanFrom }) {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  if (scanFrom === "eu_ie") {
    return {
      enabled: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_ENABLED ?? input.env.CERTSCORE_V2_DAG_LAMBDA_ENABLED,
      functionName: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME ?? input.env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME,
      resultQueueUrl: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL ?? input.env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL
    };
  }
  if (scanFrom === "california") {
    return {
      enabled: input.env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED,
      functionName: input.env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME,
      resultQueueUrl: input.env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL
    };
  }
  return {
    enabled: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_ENABLED ?? input.env.CERTSCORE_V2_DAG_LAMBDA_ENABLED,
    functionName: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_FUNCTION_NAME ?? input.env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME,
    resultQueueUrl: input.env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL ?? input.env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL
  };
}

export function normalizeLocalV2DagRunViaLambda(value: unknown, env: LocalV2DagScanEnv = process.env, scanFrom?: ScanFrom) {
  if (value === true || value === "true" || value === "1" || value === "on") {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value === "off") {
    return false;
  }

  const regionEnv = lambdaRegionEnv({ env, scanFrom });
  const resultQueueUrl = compactEnvValue(regionEnv.resultQueueUrl);
  return regionEnv.enabled === "true" &&
    Boolean(compactEnvValue(regionEnv.functionName)) &&
    Boolean(resultQueueUrl) &&
    getSqsQueueRegion(resultQueueUrl) === getLocalV2DagLambdaAwsRegionForScanFrom(scanFrom);
}

export function getLocalV2DagLambdaTargetEnvironment(
  env: LocalV2DagScanEnv = process.env
): LocalV2DagLambdaTargetEnvironment {
  return env.CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV === "production" ? "production" : "local";
}

export function getLocalV2DagLambdaConfiguration(
  env: LocalV2DagScanEnv = process.env,
  scanFrom?: ScanFrom,
  options: { allowSimulatedLocalLambda?: boolean; forceSimulatedLocalLambda?: boolean } = {}
) {
  const missing: string[] = [];
  const region = getLocalV2DagLambdaAwsRegionForScanFrom(scanFrom);
  const regionEnv = lambdaRegionEnv({ env, scanFrom });
  const simulatedLocalLambda = options.forceSimulatedLocalLambda ||
    (options.allowSimulatedLocalLambda === true && shouldUseLocalV2DagSimulatedLambda(env));
  const enabled = simulatedLocalLambda ? true : regionEnv.enabled === "true";
  const functionName = simulatedLocalLambda
    ? compactEnvValue(regionEnv.functionName) ?? "local-v2-dag-lambda-simulator"
    : compactEnvValue(regionEnv.functionName);
  const resultQueueUrl = simulatedLocalLambda ? null : compactEnvValue(regionEnv.resultQueueUrl);

  if (!enabled) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_ENABLED=true");
  }
  if (!functionName) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME");
  }
  if (!resultQueueUrl && !simulatedLocalLambda) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL");
  } else if (resultQueueUrl && !simulatedLocalLambda && getSqsQueueRegion(resultQueueUrl) !== region) {
    missing.push(`CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL region ${region}`);
  }

  return {
    awsRegion: region,
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    enabled,
    functionName,
    missing,
    orchestrationMode: env.CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE === "sharded" ? "sharded" as const : "single" as const,
    resultQueueUrl: resultQueueUrl ?? (simulatedLocalLambda ? "local://certscore-v2-dag-lambda-simulated-results" : null),
    simulatedLocalLambda,
    targetEnvironment: getLocalV2DagLambdaTargetEnvironment(env),
    vpcMode: "none" as const
  };
}

export function assertLocalV2DagLambdaConfigured(
  env: LocalV2DagScanEnv = process.env,
  scanFrom?: ScanFrom,
  options: { allowSimulatedLocalLambda?: boolean; forceSimulatedLocalLambda?: boolean } = {}
) {
  const config = getLocalV2DagLambdaConfiguration(env, scanFrom, options);
  if (config.missing.length > 0) {
    throw new Error(`Lambda v2 DAG scanning is not configured: ${config.missing.join(", ")}`);
  }

  return config;
}

export function applyLocalV2DagScanConfig(
  config: SharedScanConfig,
  env?: LocalV2DagScanEnv,
  options: {
    lambdaDebugOverrides?: LocalV2DagLambdaDebugOverrides | null;
    profile?: LocalV2DagScanProfile | null;
    runViaLambda?: boolean | null;
    scanFrom?: ScanFrom | null;
  } = {}
): SharedScanConfig {
  const shouldForceSimulatedLocalLambda = options.runViaLambda === false && shouldUseLocalV2DagScanTool(env);

  if (!shouldUseLocalV2DagScanTool(env) && options.runViaLambda !== true) {
    return config;
  }

  const profile = normalizeLocalV2DagScanProfile(options.profile);
  const lambdaConfig =
    options.runViaLambda || shouldForceSimulatedLocalLambda
      ? assertLocalV2DagLambdaConfigured(env, options.scanFrom ?? undefined, {
          allowSimulatedLocalLambda: shouldForceSimulatedLocalLambda,
          forceSimulatedLocalLambda: shouldForceSimulatedLocalLambda
        })
      : null;

  return {
    ...config,
    execution: {
      ...(config.execution ?? {}),
      v2DagParallel: {
        artifactOnly: true,
        localOnly: true,
        plannedParallel: true,
        postConsentFlowsEnabled: false,
        policyOutputGraceMs: 1_000,
        policyPlanningDeadlineMs: 1_500,
        productionFindingIntegration: false,
        profile,
        scenarioConcurrency: 2,
        scenarioPlanningMode: "planned_parallel",
        scenarioResourceMode: "lean",
        tool: "certscore-scan-core"
      },
      ...(lambdaConfig
        ? {
            v2DagLambda: {
              artifactOnly: true,
              awsRegion: lambdaConfig.awsRegion,
              callbackCorrelationId: "scan_id",
              contractVersion: lambdaConfig.contractVersion,
              dispatchState: "pending_dispatch",
              functionName: lambdaConfig.functionName,
              ...(options.lambdaDebugOverrides ? { debugOverrides: options.lambdaDebugOverrides } : {}),
              localOnly: lambdaConfig.targetEnvironment === "local",
              orchestrationMode: lambdaConfig.orchestrationMode,
              processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
              productionFindingIntegration: false,
              resultHandoff: "sqs",
              resultQueueUrl: lambdaConfig.resultQueueUrl,
              scannerRuntime: "certscore-v2-dag-parallel-path",
              simulatedLocalLambda: lambdaConfig.simulatedLocalLambda,
              targetEnvironment: lambdaConfig.targetEnvironment,
              vpcMode: lambdaConfig.vpcMode
            }
          }
        : {})
    },
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    profile
  };
}
