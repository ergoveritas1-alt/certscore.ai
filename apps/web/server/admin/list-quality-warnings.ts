import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminQualityWarningRun = {
  batchId: string;
  generatedAt: string | null;
  runDir: string;
  warningCount: number;
  warnings: LoadTestQualityWarning[];
};

function getRunsRoot() {
  return path.resolve(process.cwd(), "tmp/tranco-load-tests/runs");
}

function readWarningsFile(filePath: string): AdminQualityWarningRun | null {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      batchId?: string;
      generatedAt?: string;
      warningCount?: number;
      warnings?: LoadTestQualityWarning[];
    };
    return {
      batchId: parsed.batchId ?? path.basename(path.dirname(filePath)),
      generatedAt: parsed.generatedAt ?? null,
      runDir: path.dirname(filePath),
      warningCount: parsed.warningCount ?? parsed.warnings?.length ?? 0,
      warnings: parsed.warnings ?? []
    };
  } catch {
    return null;
  }
}

export async function listRecentQualityWarningRuns(limit = 20): Promise<AdminQualityWarningRun[]> {
  await requirePlatformAdminContext();
  const root = getRunsRoot();
  if (!existsSync(root)) {
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "quality-warnings.json"))
    .filter((filePath) => existsSync(filePath))
    .map(readWarningsFile)
    .filter((entry): entry is AdminQualityWarningRun => Boolean(entry))
    .sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""))
    .slice(0, limit);
}
