import { readFileSync } from "node:fs";

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

let cachedBuildInfo: BuildInfo | null | undefined;

function readBuildInfo(): BuildInfo | null {
  if (cachedBuildInfo !== undefined) {
    return cachedBuildInfo;
  }

  try {
    const raw = readFileSync("/app/.build-info.json", "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    cachedBuildInfo = {
      gitRef: typeof parsed.gitRef === "string" && parsed.gitRef.trim().length > 0 ? parsed.gitRef.trim() : null,
      gitSha: typeof parsed.gitSha === "string" && parsed.gitSha.trim().length > 0 ? parsed.gitSha.trim() : null,
      imageTag: typeof parsed.imageTag === "string" && parsed.imageTag.trim().length > 0 ? parsed.imageTag.trim() : null,
      runtimeTarget:
        parsed.runtimeTarget === "amplify" ||
        parsed.runtimeTarget === "gcp-vm" ||
        parsed.runtimeTarget === "vercel" ||
        parsed.runtimeTarget === "unknown"
          ? parsed.runtimeTarget
          : null
    };
  } catch {
    cachedBuildInfo = null;
  }

  return cachedBuildInfo;
}

export function detectRuntimeTarget(env: NodeJS.ProcessEnv = process.env): RuntimeTarget {
  const buildInfo = readBuildInfo();

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

export function getRuntimeVersionInfo(env: NodeJS.ProcessEnv = process.env): RuntimeVersionInfo {
  const buildInfo = readBuildInfo();

  return {
    amplifyAppId: normalizeNonEmptyString(env.AWS_APP_ID),
    amplifyBranch: normalizeNonEmptyString(env.AWS_BRANCH),
    appUrl: normalizeNonEmptyString(env.NEXT_PUBLIC_APP_URL),
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
