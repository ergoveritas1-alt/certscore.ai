import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export type ScanArtifactRetentionConfig = {
  enabled: boolean;
  maxBytes: number;
  maxMb: number;
  retentionDays: number;
};

export type CleanupScanArtifactDirectoryInput = {
  config?: ScanArtifactRetentionConfig;
  dir: string;
  dryRun?: boolean;
  now?: Date;
};

export type CleanupScanArtifactDirectoryResult = {
  bytesAfter: number;
  bytesBefore: number;
  deletedBytes: number;
  deletedFiles: string[];
  dryRun: boolean;
  scannedFiles: number;
};

type ArtifactFile = {
  mtimeMs: number;
  path: string;
  size: number;
};

const DEFAULT_RETENTION_DAYS = 3;
const DEFAULT_MAX_MB = 250;
const BYTES_PER_MB = 1024 * 1024;

function parseBooleanFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value ?? "");
}

function parsePositiveNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getScanArtifactRetentionConfig(
  env: Record<string, string | undefined> = process.env
): ScanArtifactRetentionConfig {
  const retentionDays = parsePositiveNumber(env.SCAN_ARTIFACT_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
  const maxMb = parsePositiveNumber(env.SCAN_ARTIFACT_MAX_MB, DEFAULT_MAX_MB);
  return {
    enabled: parseBooleanFlag(env.SCAN_ARTIFACTS_ENABLED),
    maxBytes: Math.floor(maxMb * BYTES_PER_MB),
    maxMb,
    retentionDays
  };
}

async function collectArtifactFiles(dir: string): Promise<ArtifactFile[]> {
  let entries;
  try {
    entries = await readdir(dir, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files: ArtifactFile[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectArtifactFiles(entryPath)));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const itemStat = await stat(entryPath);
    files.push({
      mtimeMs: itemStat.mtimeMs,
      path: entryPath,
      size: itemStat.size
    });
  }
  return files;
}

export async function cleanupScanArtifactDirectory(
  input: CleanupScanArtifactDirectoryInput
): Promise<CleanupScanArtifactDirectoryResult> {
  const config = input.config ?? getScanArtifactRetentionConfig();
  const dryRun = input.dryRun === true;
  const now = input.now ?? new Date();
  const files = await collectArtifactFiles(input.dir);
  const bytesBefore = files.reduce((sum, file) => sum + file.size, 0);
  const cutoffMs = now.getTime() - config.retentionDays * 24 * 60 * 60 * 1000;
  const byPath = new Map(files.map((file) => [file.path, file]));
  const toDelete = new Map<string, ArtifactFile>();

  for (const file of files) {
    if (file.mtimeMs < cutoffMs) {
      toDelete.set(file.path, file);
    }
  }

  let projectedBytes = bytesBefore - [...toDelete.values()].reduce((sum, file) => sum + file.size, 0);
  const oldestFirst = files
    .filter((file) => !toDelete.has(file.path))
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const file of oldestFirst) {
    if (projectedBytes <= config.maxBytes) {
      break;
    }
    toDelete.set(file.path, file);
    projectedBytes -= file.size;
  }

  const deletedFiles = [...toDelete.keys()].sort();
  if (!dryRun) {
    for (const filePath of deletedFiles) {
      await rm(filePath, { force: true });
    }
  }

  const deletedBytes = deletedFiles.reduce((sum, filePath) => sum + (byPath.get(filePath)?.size ?? 0), 0);
  return {
    bytesAfter: bytesBefore - deletedBytes,
    bytesBefore,
    deletedBytes,
    deletedFiles,
    dryRun,
    scannedFiles: files.length
  };
}
