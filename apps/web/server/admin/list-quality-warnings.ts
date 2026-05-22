import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { query } from "@website-signal-risk-scanner/db";
import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminQualityWarningRun = {
  batchId: string;
  generatedAt: string | null;
  runDir: string;
  source: "db" | "artifact";
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
      source: "artifact",
      warningCount: parsed.warningCount ?? parsed.warnings?.length ?? 0,
      warnings: parsed.warnings ?? []
    };
  } catch {
    return null;
  }
}

async function listDurableQualityWarningRuns(limit: number): Promise<AdminQualityWarningRun[]> {
  const result = await query<{
    batch_id: string;
    created_at: string;
    egress_id: string;
    egress_provider: string | null;
    warning_code: string;
    severity: "info" | "warn" | "critical";
    warning_id: string | null;
    comparison_tier: LoadTestQualityWarning["comparisonTier"] | null;
    explanation: string;
    observed_metrics: LoadTestQualityWarning["metrics"];
    baseline_metrics: LoadTestQualityWarning["baseline"] | null;
  }>(
    `
      select
        batch_id,
        created_at::text as created_at,
        egress_id,
        egress_provider,
        warning_code,
        severity,
        warning_id,
        comparison_tier,
        explanation,
        observed_metrics,
        baseline_metrics
      from scanner_quality_warning_events
      order by created_at desc
      limit $1
    `,
    [limit],
    { readOnly: true }
  );

  const byBatch = new Map<string, AdminQualityWarningRun>();
  for (const row of result.rows) {
    const run =
      byBatch.get(row.batch_id) ??
      {
        batchId: row.batch_id,
        generatedAt: row.created_at,
        runDir: "db:scanner_quality_warning_events",
        source: "db" as const,
        warningCount: 0,
        warnings: []
      };
    run.warnings.push({
      baseline: row.baseline_metrics ?? undefined,
      batchId: row.batch_id,
      code: row.warning_code as LoadTestQualityWarning["code"],
      comparisonTier: row.comparison_tier ?? undefined,
      completionWindow: {
        completedCount: row.observed_metrics.completedCount
      },
      egressProvider: row.egress_provider ?? "unknown",
      egress_id: row.egress_id,
      explanation: row.explanation,
      generatedAt: row.created_at,
      metrics: row.observed_metrics,
      severity: row.severity,
      warningId: row.warning_id ?? [row.batch_id, row.egress_id, row.warning_code].join(":")
    });
    run.warningCount = run.warnings.length;
    byBatch.set(row.batch_id, run);
  }

  return Array.from(byBatch.values()).sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""));
}

export async function listRecentQualityWarningRuns(limit = 20): Promise<AdminQualityWarningRun[]> {
  await requirePlatformAdminContext();
  try {
    const durableRuns = await listDurableQualityWarningRuns(limit);
    if (durableRuns.length > 0) {
      return durableRuns;
    }
  } catch {
    // Local artifact discovery remains the development/fallback path when the
    // durable Phase 1B tables are not migrated or temporarily unavailable.
  }

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
