import { query, queryOne } from "@website-signal-risk-scanner/db";
import type {
  LoadTestQualityBaselineValues,
  LoadTestQualityMetricValues,
  LoadTestQualityWarning
} from "@website-signal-risk-scanner/shared";
import type { LoadTestSummaryEntry } from "../../scripts/load-test-safety";

export type ScannerQualityWindow = {
  accessPostureCounts: Record<string, number>;
  batchId: string;
  completedCount: number;
  createdAt?: string;
  egressProvider: string | null;
  egress_id: string;
  endRow: number | null;
  failedCount: number;
  findingsPerCompleted: number;
  labelCounts: Record<string, number>;
  pagesScanned: number;
  rejectedCount: number;
  scannerSlotCounts: Record<string, number>;
  scannerTaskCounts: Record<string, number>;
  startRow: number | null;
  zeroFindingCount: number;
  zeroFindingRate: number;
};

export type PersistQualityRunInput = {
  batchId: string;
  entries: LoadTestSummaryEntry[];
  rejectedCount?: number;
  startRow?: number | null;
  endRow?: number | null;
};

export type WarningNotificationDecision = {
  cooldownHours: number;
  dedupeKey: string;
  lastEventAt: string | null;
  reason: "email_disabled" | "inside_cooldown" | "eligible";
  shouldNotify: boolean;
};

const BLOCKER_LABELS = [
  "authentication_wall",
  "bot_block_or_forbidden",
  "captcha_or_security_challenge",
  "early_loss",
  "robots_or_policy_block",
  "timeout_or_navigation_failure"
];

function countRecordValue(record: Record<string, number>, key: string, increment = 1) {
  record[key] = (record[key] ?? 0) + increment;
}

function findingTotal(entry: LoadTestSummaryEntry) {
  return Object.values(entry.findingCounts).reduce((sum, value) => sum + Math.max(0, value), 0);
}

export function buildScannerQualityWindows(input: PersistQualityRunInput): ScannerQualityWindow[] {
  const byEgress = new Map<string, LoadTestSummaryEntry[]>();
  for (const entry of input.entries) {
    const egressId = entry.egressId ?? "unknown-egress";
    byEgress.set(egressId, [...(byEgress.get(egressId) ?? []), entry]);
  }

  return Array.from(byEgress.entries()).map(([egressId, entries]) => {
    const completed = entries.filter((entry) => entry.status === "completed");
    const failedCount = entries.filter((entry) => entry.status !== "completed").length;
    const findings = completed.reduce((sum, entry) => sum + findingTotal(entry), 0);
    const zeroFindingCount = completed.filter((entry) => findingTotal(entry) === 0).length;
    const accessPostureCounts: Record<string, number> = {};
    const labelCounts: Record<string, number> = {};
    const scannerTaskCounts: Record<string, number> = {};
    const scannerSlotCounts: Record<string, number> = {};
    let egressProvider: string | null = null;
    let pagesScanned = 0;

    for (const entry of completed) {
      pagesScanned += Math.max(0, entry.pagesScanned ?? 0);
      countRecordValue(accessPostureCounts, entry.accessPostureClass ?? "unknown");
      for (const label of entry.interruptionLabels.length > 0 ? entry.interruptionLabels : ["none"]) {
        countRecordValue(labelCounts, label);
      }
      if (entry.scannerTaskArn) {
        countRecordValue(scannerTaskCounts, entry.scannerTaskArn);
      }
      if (entry.scannerSlot !== null && entry.scannerSlot !== undefined) {
        countRecordValue(scannerSlotCounts, String(entry.scannerSlot));
      }
      if (!egressProvider && entry.egressProvider) {
        egressProvider = entry.egressProvider;
      }
    }

    const completedCount = completed.length;
    return {
      accessPostureCounts,
      batchId: input.batchId,
      completedCount,
      egressProvider,
      egress_id: egressId,
      endRow: input.endRow ?? null,
      failedCount,
      findingsPerCompleted: findings / Math.max(1, completedCount),
      labelCounts,
      pagesScanned,
      rejectedCount: input.rejectedCount ?? 0,
      scannerSlotCounts,
      scannerTaskCounts,
      startRow: input.startRow ?? null,
      zeroFindingCount,
      zeroFindingRate: zeroFindingCount / Math.max(1, completedCount)
    };
  });
}

export function windowToMetricValues(window: ScannerQualityWindow): LoadTestQualityMetricValues {
  return {
    blockerLabelRate:
      BLOCKER_LABELS.reduce((sum, label) => sum + (window.labelCounts[label] ?? 0), 0) /
      Math.max(1, window.completedCount),
    completedCount: window.completedCount,
    findingsPerCompleted: window.findingsPerCompleted,
    pagesScanned: window.pagesScanned,
    zeroFindingRate: window.zeroFindingRate
  };
}

export function buildRollingBaseline(windows: ScannerQualityWindow[]): LoadTestQualityBaselineValues | null {
  const eligible = windows.filter((window) => window.completedCount >= 25);
  const completedCount = eligible.reduce((sum, window) => sum + window.completedCount, 0);
  if (eligible.length === 0 || completedCount === 0) {
    return null;
  }

  const findings = eligible.reduce((sum, window) => sum + window.findingsPerCompleted * window.completedCount, 0);
  const zeroFindingCount = eligible.reduce((sum, window) => sum + window.zeroFindingCount, 0);
  const pagesScanned = eligible.reduce((sum, window) => sum + window.pagesScanned, 0);
  const blockerCount = eligible.reduce(
    (sum, window) => sum + BLOCKER_LABELS.reduce((inner, label) => inner + (window.labelCounts[label] ?? 0), 0),
    0
  );

  return {
    blockerLabelRate: blockerCount / completedCount,
    completedCount,
    findingsPerCompleted: findings / completedCount,
    label: `rolling:${eligible.map((window) => window.batchId).join(",")}`,
    pagesScanned,
    tier: "rolling",
    zeroFindingRate: zeroFindingCount / completedCount
  };
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

type ScannerQualityWindowRow = {
  access_posture_counts: unknown;
  batch_id: string;
  completed_count: number;
  created_at: string;
  egress_id: string;
  egress_provider: string | null;
  end_row: number | null;
  failed_count: number;
  findings_per_completed: string | number | null;
  label_counts: unknown;
  pages_scanned: number;
  rejected_count: number;
  scanner_slot_counts: unknown;
  scanner_task_counts: unknown;
  start_row: number | null;
  zero_finding_count: number;
  zero_finding_rate: string | number | null;
};

function rowToWindow(row: ScannerQualityWindowRow): ScannerQualityWindow {
  return {
    accessPostureCounts: parseRecord(row.access_posture_counts),
    batchId: row.batch_id,
    completedCount: row.completed_count,
    createdAt: row.created_at,
    egressProvider: row.egress_provider,
    egress_id: row.egress_id,
    endRow: row.end_row,
    failedCount: row.failed_count,
    findingsPerCompleted: Number(row.findings_per_completed ?? 0),
    labelCounts: parseRecord(row.label_counts),
    pagesScanned: row.pages_scanned,
    rejectedCount: row.rejected_count,
    scannerSlotCounts: parseRecord(row.scanner_slot_counts),
    scannerTaskCounts: parseRecord(row.scanner_task_counts),
    startRow: row.start_row,
    zeroFindingCount: row.zero_finding_count,
    zeroFindingRate: Number(row.zero_finding_rate ?? 0)
  };
}

export async function persistScannerQualityWindows(input: PersistQualityRunInput) {
  const windows = buildScannerQualityWindows(input);
  for (const window of windows) {
    await query(
      `
        insert into scanner_quality_windows (
          batch_id, start_row, end_row, egress_id, egress_provider,
          completed_count, failed_count, rejected_count, findings_per_completed,
          zero_finding_count, zero_finding_rate, pages_scanned,
          access_posture_counts, label_counts, scanner_task_counts, scanner_slot_counts,
          metrics_json
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb)
        on conflict (batch_id, egress_id) do update set
          start_row = excluded.start_row,
          end_row = excluded.end_row,
          egress_provider = excluded.egress_provider,
          completed_count = excluded.completed_count,
          failed_count = excluded.failed_count,
          rejected_count = excluded.rejected_count,
          findings_per_completed = excluded.findings_per_completed,
          zero_finding_count = excluded.zero_finding_count,
          zero_finding_rate = excluded.zero_finding_rate,
          pages_scanned = excluded.pages_scanned,
          access_posture_counts = excluded.access_posture_counts,
          label_counts = excluded.label_counts,
          scanner_task_counts = excluded.scanner_task_counts,
          scanner_slot_counts = excluded.scanner_slot_counts,
          metrics_json = excluded.metrics_json
      `,
      [
        window.batchId,
        window.startRow,
        window.endRow,
        window.egress_id,
        window.egressProvider,
        window.completedCount,
        window.failedCount,
        window.rejectedCount,
        window.findingsPerCompleted,
        window.zeroFindingCount,
        window.zeroFindingRate,
        window.pagesScanned,
        JSON.stringify(window.accessPostureCounts),
        JSON.stringify(window.labelCounts),
        JSON.stringify(window.scannerTaskCounts),
        JSON.stringify(window.scannerSlotCounts),
        JSON.stringify(windowToMetricValues(window))
      ]
    );
  }
  return windows;
}

export async function loadRecentScannerQualityWindows(input: {
  egressId: string;
  excludeBatchId?: string;
  limit?: number;
}) {
  const result = await query<ScannerQualityWindowRow>(
    `
      select
        batch_id, start_row, end_row, egress_id, egress_provider,
        completed_count, failed_count, rejected_count, findings_per_completed,
        zero_finding_count, zero_finding_rate, pages_scanned,
        access_posture_counts, label_counts, scanner_task_counts, scanner_slot_counts,
        created_at::text as created_at
      from scanner_quality_windows
      where egress_id = $1
        and ($2::text is null or batch_id <> $2)
      order by created_at desc
      limit $3
    `,
    [input.egressId, input.excludeBatchId ?? null, input.limit ?? 5],
    { readOnly: true }
  );
  return result.rows.map(rowToWindow);
}

export function buildWarningDedupeKey(warning: Pick<LoadTestQualityWarning, "code" | "egress_id" | "severity">) {
  return [warning.egress_id, warning.code, warning.severity].join(":");
}

export async function persistQualityWarningEvents(warnings: LoadTestQualityWarning[]) {
  for (const warning of warnings) {
    await query(
      `
        insert into scanner_quality_warning_events (
          batch_id, egress_id, egress_provider, warning_code, severity, warning_id,
          dedupe_key, comparison_tier, explanation, observed_metrics, baseline_metrics,
          notification_status
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'disabled')
        on conflict (dedupe_key, batch_id) do update set
          egress_provider = excluded.egress_provider,
          warning_id = excluded.warning_id,
          comparison_tier = excluded.comparison_tier,
          explanation = excluded.explanation,
          observed_metrics = excluded.observed_metrics,
          baseline_metrics = excluded.baseline_metrics,
          notification_status = 'disabled'
      `,
      [
        warning.batchId,
        warning.egress_id,
        warning.egressProvider,
        warning.code,
        warning.severity,
        warning.warningId,
        buildWarningDedupeKey(warning),
        warning.comparisonTier ?? warning.baseline?.tier ?? "no_baseline",
        warning.explanation,
        JSON.stringify(warning.metrics),
        warning.baseline ? JSON.stringify(warning.baseline) : null
      ]
    );
  }
}

export async function shouldNotifyQualityWarning(input: {
  cooldownHours?: number;
  emailEnabled?: boolean;
  warning: Pick<LoadTestQualityWarning, "code" | "egress_id" | "severity">;
}): Promise<WarningNotificationDecision> {
  const cooldownHours = input.cooldownHours ?? 24;
  const dedupeKey = buildWarningDedupeKey(input.warning);
  if (!input.emailEnabled) {
    return {
      cooldownHours,
      dedupeKey,
      lastEventAt: null,
      reason: "email_disabled",
      shouldNotify: false
    };
  }

  const row = await queryOne<{ created_at: string }>(
    `
      select created_at::text as created_at
      from scanner_quality_warning_events
      where dedupe_key = $1
        and notification_status = 'sent'
      order by created_at desc
      limit 1
    `,
    [dedupeKey],
    { readOnly: true }
  );
  if (!row) {
    return { cooldownHours, dedupeKey, lastEventAt: null, reason: "eligible", shouldNotify: true };
  }

  const lastEventAt = new Date(row.created_at).getTime();
  const insideCooldown = Number.isFinite(lastEventAt) && Date.now() - lastEventAt < cooldownHours * 60 * 60 * 1000;
  return {
    cooldownHours,
    dedupeKey,
    lastEventAt: row.created_at,
    reason: insideCooldown ? "inside_cooldown" : "eligible",
    shouldNotify: !insideCooldown
  };
}
