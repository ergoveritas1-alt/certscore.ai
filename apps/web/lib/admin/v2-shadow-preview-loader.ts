import "server-only";

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isV2ShadowPreviewEnabled,
  isV2ShadowPreviewError,
  parseV2ShadowPreviewArtifact,
  type V2ShadowPreviewError,
  type V2ShadowPreviewModel,
} from "./v2-shadow-preview";

export type V2ShadowPreviewLoadResult =
  | { status: "disabled"; message: string }
  | { status: "empty"; message: string }
  | { status: "error"; error: V2ShadowPreviewError }
  | { status: "ready"; model: V2ShadowPreviewModel };

export async function loadV2ShadowPreview(input: {
  artifactPath?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<V2ShadowPreviewLoadResult> {
  if (!isV2ShadowPreviewEnabled(input.env ?? process.env)) {
    return {
      status: "disabled",
      message: "Set CERTSCORE_V2_SHADOW_PREVIEW_ENABLED=1 to enable this internal preview.",
    };
  }
  if (!input.artifactPath?.trim()) {
    return {
      status: "empty",
      message: "Provide an artifact query parameter pointing to a Wc01V2ShadowProjection.json under artifacts/.",
    };
  }

  const resolved = resolveAllowedArtifactPath(input.artifactPath);
  if (!resolved.allowed) {
    return {
      status: "error",
      error: {
        code: "artifact_path_not_allowed",
        message: "Artifact path must resolve under the local artifacts directory.",
      },
    };
  }

  try {
    const raw = await readFile(resolved.path, "utf8");
    return {
      status: "ready",
      model: parseV2ShadowPreviewArtifact(raw, resolved.path),
    };
  } catch (error) {
    if (isV2ShadowPreviewError(error)) {
      return { status: "error", error };
    }
    return {
      status: "error",
      error: {
        code: "artifact_read_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function resolveAllowedArtifactPath(inputPath: string) {
  const cwd = process.cwd();
  const workspaceRoot = findWorkspaceRoot(cwd);
  const artifactsRoots = uniqueStrings([
    path.resolve(workspaceRoot, "artifacts"),
    path.resolve(cwd, "artifacts"),
  ]);
  const candidatePaths = path.isAbsolute(inputPath)
    ? [path.resolve(inputPath)]
    : [path.resolve(workspaceRoot, inputPath), path.resolve(cwd, inputPath)];

  for (const candidatePath of uniqueStrings(candidatePaths)) {
    const allowed =
      path.basename(candidatePath) === "Wc01V2ShadowProjection.json" &&
      artifactsRoots.some((artifactsRoot) => isPathWithin(candidatePath, artifactsRoot));
    if (allowed) {
      return { allowed: true, path: candidatePath };
    }
  }

  return { allowed: false, path: candidatePaths[0] ?? inputPath };
}

function findWorkspaceRoot(startDir: string) {
  let current = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }
    current = parent;
  }
}

function isPathWithin(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
