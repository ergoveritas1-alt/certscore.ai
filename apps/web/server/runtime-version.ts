type RuntimeTarget = "gcp-vm" | "vercel" | "unknown";

export type RuntimeVersionInfo = {
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

export function detectRuntimeTarget(env: NodeJS.ProcessEnv = process.env): RuntimeTarget {
  if (env.VERCEL === "1" || normalizeNonEmptyString(env.VERCEL_ENV)) {
    return "vercel";
  }

  if (env.BUILD_RUNTIME_TARGET === "gcp-vm") {
    return "gcp-vm";
  }

  return "unknown";
}

export function getRuntimeVersionInfo(env: NodeJS.ProcessEnv = process.env): RuntimeVersionInfo {
  return {
    appUrl: normalizeNonEmptyString(env.NEXT_PUBLIC_APP_URL),
    gitRef: normalizeNonEmptyString(env.VERCEL_GIT_COMMIT_REF) ?? normalizeNonEmptyString(env.BUILD_GIT_REF),
    gitSha: normalizeNonEmptyString(env.BUILD_GIT_SHA) ?? normalizeNonEmptyString(env.VERCEL_GIT_COMMIT_SHA),
    hostname: normalizeNonEmptyString(env.HOSTNAME),
    imageTag: normalizeNonEmptyString(env.BUILD_IMAGE_TAG),
    nodeVersion: process.version,
    runtimeTarget: detectRuntimeTarget(env),
    service: "web",
    timestamp: new Date().toISOString(),
    vercelDeploymentId: normalizeNonEmptyString(env.VERCEL_DEPLOYMENT_ID),
    vercelUrl: normalizeNonEmptyString(env.VERCEL_PROJECT_PRODUCTION_URL) ?? normalizeNonEmptyString(env.VERCEL_URL)
  };
}
