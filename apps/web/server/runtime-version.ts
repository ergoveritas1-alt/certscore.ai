import { generatedBuildInfo } from "./generated-build-info";
type RuntimeTarget = "amplify" | "gcp-vm" | "vercel" | "unknown";

export type RuntimeVersionInfo = {
  amplifyAppId: string | null;
  amplifyBranch: string | null;
  appUrl: string | null;
  gitRef: string | null;
  gitSha: string | null;
  hostname: string | null;
  imageTag: string | null;
  nodeVersion: string;
  runtimeTarget: RuntimeTarget;
  service: "web";
  timestamp: string;
  vercelDeploymentId: string | null;
  vercelUrl: string | null;
};

type RuntimeVersionOverrides = {
  appUrl?: string | null;
};

function normalizeNonEmptyString(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type BuildInfo = {
  gitRef: string | null;
  gitSha: string | null;
  imageTag: string | null;
  runtimeTarget: RuntimeTarget | null;
};

function normalizeRuntimeTarget(value: unknown): RuntimeTarget | null {
  switch (value) {
    case "amplify":
    case "gcp-vm":
    case "vercel":
    case "unknown":
      return value;
    default:
      return null;
  }
}

function getBuildInfo(): BuildInfo {
  return {
    gitRef: normalizeNonEmptyString(generatedBuildInfo.gitRef ?? undefined),
    gitSha: normalizeNonEmptyString(generatedBuildInfo.gitSha ?? undefined),
    imageTag: normalizeNonEmptyString(generatedBuildInfo.imageTag ?? undefined),
    runtimeTarget: normalizeRuntimeTarget(generatedBuildInfo.runtimeTarget)
  };
}

export function detectRuntimeTarget(env: NodeJS.ProcessEnv = process.env): RuntimeTarget {
  const buildInfo = getBuildInfo();

  if (env.VERCEL === "1" || normalizeNonEmptyString(env.VERCEL_ENV)) {
    return "vercel";
  }

  if (
    env.BUILD_RUNTIME_TARGET === "amplify" ||
    normalizeNonEmptyString(env.AWS_APP_ID) ||
    normalizeNonEmptyString(env.AWS_BRANCH)
  ) {
    return "amplify";
  }

  if (env.BUILD_RUNTIME_TARGET === "gcp-vm") {
    return "gcp-vm";
  }

  if (buildInfo?.runtimeTarget) {
    return buildInfo.runtimeTarget;
  }

  return "unknown";
}

export function getRuntimeVersionInfo(
  env: NodeJS.ProcessEnv = process.env,
  overrides: RuntimeVersionOverrides = {}
): RuntimeVersionInfo {
  const buildInfo = getBuildInfo();

  return {
    amplifyAppId: normalizeNonEmptyString(env.AWS_APP_ID),
    amplifyBranch: normalizeNonEmptyString(env.AWS_BRANCH),
    appUrl: overrides.appUrl ?? normalizeNonEmptyString(env.NEXT_PUBLIC_APP_URL),
    gitRef: buildInfo?.gitRef ?? normalizeNonEmptyString(env.VERCEL_GIT_COMMIT_REF) ?? normalizeNonEmptyString(env.BUILD_GIT_REF),
    gitSha: buildInfo?.gitSha ?? normalizeNonEmptyString(env.BUILD_GIT_SHA) ?? normalizeNonEmptyString(env.VERCEL_GIT_COMMIT_SHA),
    hostname: normalizeNonEmptyString(env.HOSTNAME),
    imageTag: buildInfo?.imageTag ?? normalizeNonEmptyString(env.BUILD_IMAGE_TAG),
    nodeVersion: process.version,
    runtimeTarget: detectRuntimeTarget(env),
    service: "web",
    timestamp: new Date().toISOString(),
    vercelDeploymentId: normalizeNonEmptyString(env.VERCEL_DEPLOYMENT_ID),
    vercelUrl: normalizeNonEmptyString(env.VERCEL_PROJECT_PRODUCTION_URL) ?? normalizeNonEmptyString(env.VERCEL_URL)
  };
}
