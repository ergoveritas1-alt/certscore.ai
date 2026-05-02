import path from "node:path";
import type { BrowserContextOptions } from "playwright";
import {
  cleanupScanArtifactDirectory,
  getScanArtifactRetentionConfig,
  type ScanArtifactRetentionConfig
} from "@website-signal-risk-scanner/shared";

export type RuntimeScanArtifactOptions = {
  cleanupRoot: string | null;
  config: ScanArtifactRetentionConfig;
  contextOptions: Pick<BrowserContextOptions, "recordVideo">;
  enabled: boolean;
  launchOptions: {
    downloadsPath?: string;
  };
  root: string | null;
};

function sanitizeArtifactSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "scan";
}

export function getRuntimeScanArtifactOptions(input: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  scanId: string;
  stage: string;
}): RuntimeScanArtifactOptions {
  const config = getScanArtifactRetentionConfig(input.env);
  if (!config.enabled) {
    return {
      cleanupRoot: null,
      config,
      contextOptions: {},
      enabled: false,
      launchOptions: {},
      root: null
    };
  }

  const cwd = input.cwd ?? process.cwd();
  const cleanupRoot = path.join(cwd, "apps/validation-worker/artifacts/runtime-scans");
  const root = path.join(cleanupRoot, sanitizeArtifactSegment(input.stage), sanitizeArtifactSegment(input.scanId));

  return {
    cleanupRoot,
    config,
    contextOptions: {
      recordVideo: {
        dir: path.join(root, "videos")
      }
    },
    enabled: true,
    launchOptions: {
      downloadsPath: path.join(root, "downloads")
    },
    root
  };
}

export async function cleanupRuntimeScanArtifacts(options: RuntimeScanArtifactOptions) {
  if (!options.enabled || !options.cleanupRoot) {
    return null;
  }

  return cleanupScanArtifactDirectory({
    config: options.config,
    dir: options.cleanupRoot
  });
}
