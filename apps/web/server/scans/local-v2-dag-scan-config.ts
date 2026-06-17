import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";

export const LOCAL_V2_DAG_SCAN_PROCESSOR = "local-certscore-v2-dag-parallel-v1";
export const LOCAL_V2_DAG_SCAN_PROFILE = "standard";
export const LOCAL_V2_DAG_SCAN_PROFILES = ["standard", "tiny"] as const;
export const LOCAL_V2_DAG_LAMBDA_AWS_REGION = "us-west-1";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";

export type LocalV2DagScanProfile = (typeof LOCAL_V2_DAG_SCAN_PROFILES)[number];
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
  CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME?: string;
  CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE?: string;
  CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL?: string;
  CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV?: string;
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

export function normalizeLocalV2DagRunViaLambda(value: unknown, env: LocalV2DagScanEnv = process.env) {
  if (value === true || value === "true" || value === "1" || value === "on") {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value === "off") {
    return false;
  }

  return env.CERTSCORE_V2_DAG_LAMBDA_ENABLED === "true" &&
    Boolean(compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME)) &&
    Boolean(compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL));
}

export function getLocalV2DagLambdaTargetEnvironment(
  env: LocalV2DagScanEnv = process.env
): LocalV2DagLambdaTargetEnvironment {
  return env.CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV === "production" ? "production" : "local";
}

export function getLocalV2DagLambdaConfiguration(env: LocalV2DagScanEnv = process.env) {
  const missing: string[] = [];
  const enabled = env.CERTSCORE_V2_DAG_LAMBDA_ENABLED === "true";
  const functionName = compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME);
  const resultQueueUrl = compactEnvValue(env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL);

  if (!enabled) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_ENABLED=true");
  }
  if (!functionName) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME");
  }
  if (!resultQueueUrl) {
    missing.push("CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL");
  }

  return {
    awsRegion: LOCAL_V2_DAG_LAMBDA_AWS_REGION,
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    enabled,
    functionName,
    missing,
    orchestrationMode: env.CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE === "sharded" ? "sharded" as const : "single" as const,
    resultQueueUrl,
    targetEnvironment: getLocalV2DagLambdaTargetEnvironment(env),
    vpcMode: "none" as const
  };
}

export function assertLocalV2DagLambdaConfigured(env: LocalV2DagScanEnv = process.env) {
  const config = getLocalV2DagLambdaConfiguration(env);
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
  } = {}
): SharedScanConfig {
  if (!shouldUseLocalV2DagScanTool(env) && options.runViaLambda !== true) {
    return config;
  }

  const profile = normalizeLocalV2DagScanProfile(options.profile);
  const lambdaConfig = options.runViaLambda ? assertLocalV2DagLambdaConfigured(env) : null;

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
