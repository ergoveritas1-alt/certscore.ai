import "server-only";

import { GetFunctionConfigurationCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { classifyLambdaScannerFleet } from "./lambda-scanner-health-core";

export { classifyLambdaScannerFleet } from "./lambda-scanner-health-core";

export const PRODUCTION_SCANNER_REGIONS = ["eu-central-1", "eu-west-1", "us-west-1"] as const;

export type LambdaScannerRegionHealth = {
  checkedAt: string;
  detail: "configuration_unavailable" | "permission_denied" | null;
  functionName: string;
  lastUpdateStatus: string | null;
  region: (typeof PRODUCTION_SCANNER_REGIONS)[number];
  state: string | null;
  status: "healthy" | "unavailable" | "unknown";
};

export type LambdaScannerFleetHealth = {
  checkedAt: string;
  regions: LambdaScannerRegionHealth[];
  status: "degraded" | "healthy" | "unavailable" | "unknown";
};

const CACHE_MS = 60_000;
let cached: { expiresAt: number; promise: Promise<LambdaScannerFleetHealth> } | null = null;

function functionNameForRegion(region: LambdaScannerRegionHealth["region"]) {
  if (region === "eu-central-1") {
    return process.env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_FUNCTION_NAME?.trim() || "certscore-v2-dag-local-lambda";
  }
  if (region === "eu-west-1") {
    return process.env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_FUNCTION_NAME?.trim() || "certscore-v2-dag-local-lambda";
  }
  return process.env.CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME?.trim() || "certscore-v2-dag-local-lambda";
}

async function checkRegion(region: LambdaScannerRegionHealth["region"]): Promise<LambdaScannerRegionHealth> {
  const functionName = functionNameForRegion(region);
  const checkedAt = new Date().toISOString();
  try {
    const client = new LambdaClient({ region });
    const result = await client.send(new GetFunctionConfigurationCommand({ FunctionName: functionName }));
    const state = result.State ?? null;
    const lastUpdateStatus = result.LastUpdateStatus ?? null;
    return {
      checkedAt,
      detail: null,
      functionName,
      lastUpdateStatus,
      region,
      state,
      status: state === "Active" && lastUpdateStatus === "Successful" ? "healthy" : "unavailable"
    };
  } catch (error) {
    const errorName = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    return {
      checkedAt,
      detail: errorName === "AccessDeniedException" ? "permission_denied" : "configuration_unavailable",
      functionName,
      lastUpdateStatus: null,
      region,
      state: null,
      status: "unknown"
    };
  }
}

async function loadLambdaScannerFleetHealth(): Promise<LambdaScannerFleetHealth> {
  const regions = await Promise.all(PRODUCTION_SCANNER_REGIONS.map(checkRegion));
  return {
    checkedAt: new Date().toISOString(),
    regions,
    status: classifyLambdaScannerFleet(regions)
  };
}

export function getLambdaScannerFleetHealth() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = loadLambdaScannerFleetHealth();
  cached = { expiresAt: now + CACHE_MS, promise };
  return promise;
}
