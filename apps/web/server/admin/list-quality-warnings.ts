import "server-only";

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { query } from "@website-signal-risk-scanner/db";
import type { LoadTestQualityWarning } from "@website-signal-risk-scanner/shared";
import { buildScannerQualityTrendSeries, buildScannerQualityTrendSummary } from "../ops/scanner-quality-normal-history";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminQualityWarningRun = {
  batchId: string;
  generatedAt: string | null;
  runDir: string;
  source: "db" | "artifact";
  warningCount: number;
  warnings: LoadTestQualityWarning[];
};

export type AdminScannerQualityTrendPoint = {
  completedCount: number;
  findingsPerCompleted: number | null;
  pagesScanned: number;
  targetScanCount: number;
  windowCount: number;
  zeroFindingRate: number | null;
};

export type AdminScannerQualityTrend = {
  egressId: string;
  egressProvider: string | null;
  latestWindowAt: string | null;
  points: AdminScannerQualityTrendPoint[];
  series: Array<{
    completedAt: string | null;
    completedCount: number;
    findingsPerCompleted: number;
    pagesScanned: number;
    zeroFindingRate: number;
  }>;
  source: "db";
};

function getRunsRoot() {
  return path.resolve(process.cwd(), "tmp/tranco-load-tests/runs");
}

function parseNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === "number")
      .map(([key, item]) => [key, item as number])
  );
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

export async function listScannerQualityTrends(input: { egressLimit?: number; windowLimit?: number } = {}): Promise<AdminScannerQualityTrend[]> {
  await requirePlatformAdminContext();
  try {
    const rows = await query<{
      access_posture_counts: unknown;
      batch_id: string;
      completed_count: number;
      created_at: string;
      egress_id: string;
      egress_provider: string | null;
      findings_per_completed: string | number | null;
      label_counts: unknown;
      pages_scanned: number;
      source_type: string;
      window_end_completed_at: string | null;
      window_start_completed_at: string | null;
      zero_finding_count: number;
      zero_finding_rate: string | number | null;
    }>(
      `
        select
          batch_id,
          egress_id,
          egress_provider,
          completed_count,
          findings_per_completed,
          zero_finding_count,
          zero_finding_rate,
          pages_scanned,
          access_posture_counts,
          label_counts,
          source_type,
          window_start_completed_at::text as window_start_completed_at,
          window_end_completed_at::text as window_end_completed_at,
          created_at::text as created_at
        from scanner_quality_windows
        where source_type = 'normal_scan'
        order by created_at desc
        limit $1
      `,
      [input.windowLimit ?? 200],
      { readOnly: true }
    );
    const byEgress = new Map<string, typeof rows.rows>();
    for (const row of rows.rows) {
      byEgress.set(row.egress_id, [...(byEgress.get(row.egress_id) ?? []), row]);
    }
    return Array.from(byEgress.entries())
      .slice(0, input.egressLimit ?? 6)
      .map(([egressId, items]) => {
        const windows = items.map((row) => ({
          accessPostureCounts: parseRecord(row.access_posture_counts),
          batchId: row.batch_id,
          completedCount: row.completed_count,
          createdAt: row.created_at,
          egressProvider: row.egress_provider,
          egress_id: row.egress_id,
          endRow: null,
          failedCount: 0,
          findingsPerCompleted: parseNumber(row.findings_per_completed),
          labelCounts: parseRecord(row.label_counts),
          pagesScanned: row.pages_scanned,
          rejectedCount: 0,
          scannerSlotCounts: {},
          scannerTaskCounts: {},
          sourceType: "normal_scan" as const,
          sourceWindowId: null,
          startRow: null,
          windowEndCompletedAt: row.window_end_completed_at,
          windowStartCompletedAt: row.window_start_completed_at,
          zeroFindingCount: row.zero_finding_count,
          zeroFindingRate: parseNumber(row.zero_finding_rate)
        }));
        const latest = windows[0] ?? null;
        return {
          egressId,
          egressProvider: latest?.egressProvider ?? null,
          latestWindowAt: latest?.windowEndCompletedAt ?? latest?.createdAt ?? null,
          points: buildScannerQualityTrendSummary({ windows }),
          series: buildScannerQualityTrendSeries({ windows }),
          source: "db" as const
        };
      });
  } catch {
    return [];
  }
}
