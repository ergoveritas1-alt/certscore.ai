import { getValidationOpsBaseUrl, isValidationOpsApp } from "../../lib/env";

export function getValidationOpsHostState(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = getValidationOpsBaseUrl(env);
  const hostedOnDedicatedOpsApp = baseUrl.length > 0 && !isValidationOpsApp(env);

  return {
    baseUrl,
    hostedOnDedicatedOpsApp
  } as const;
}

export function buildValidationOpsUrl(pathname: string, env: NodeJS.ProcessEnv = process.env) {
  const { baseUrl } = getValidationOpsHostState(env);
  if (!baseUrl) {
    return null;
  }

  return new URL(pathname, baseUrl).toString();
}
