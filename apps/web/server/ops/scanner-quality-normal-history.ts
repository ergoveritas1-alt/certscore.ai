import { query, queryOne } from "@website-signal-risk-scanner/db";
import { evaluateLoadTestQualityWarnings } from "@website-signal-risk-scanner/shared";
import { OPS_SCAN_STATUS_FINDING_IDS } from "../scans/ops-status-finding-ids";
import { buildOpsInterruptionSummary } from "../scans/ops-interruption-summary";
import {
  buildRollingBaseline,
  loadRecentScannerQualityWindows,
  persistQualityWarningEvents,
  type ScannerQualityWindow,
  windowToMetricValues
} from "./load-test-quality-history";

type OpsScanStatusFindingId = (typeof OPS_SCAN_STATUS_FINDING_IDS)[number];

export type NormalScanQualityRow = {
  accessPostureClass: string | null;
  authWallDetected?: boolean | null;
  authWallSuspected?: boolean | null;
  blockedFlag?: boolean | null;
  blockPageClassification?: string | null;
  captchaFlag?: boolean | null;
  challengeSuspected?: boolean | null;
  completedAt: string;
  egressId: string | null;
  egressProvider: string | null;
  errorMessage?: string | null;
  findingCount: number | null;
  findingCounts?: Record<string, number>;
  fingerprintBlockSuspected?: boolean | null;
  geoBlockSuspected?: boolean | null;
  homepageFetchHttpStatus?: number | null;
  homepageFetchStatus?: string | null;
  pagesScanned: number;
  rateLimitSuspected?: boolean | null;
  robotsAllowed?: boolean | null;
  robotsFetchHttpStatus?: number | null;
  robotsFetchStatus?: string | null;
  scanId: string;
  scannerSlot?: number | null;
  scannerTaskArn?: string | null;
  status: string;
  stopReasonCode?: string | null;
  stopReasonDetail?: string | null;
  stopReasonHttpStatus?: number | null;
  stopReasonLabel?: string | null;
};

type NormalScanQualityDbRow = {
  access_posture_class: string | null;
  auth_wall_detected: boolean | null;
  auth_wall_suspected: boolean | null;
  blocked_flag: boolean | null;
  block_page_classification: string | null;
  captcha_flag: boolean | null;
  challenge_suspected: boolean | null;
  completed_at: string;
  egress_id: string | null;
  egress_provider: string | null;
  error_message: string | null;
  fingerprint_block_suspected: boolean | null;
  geo_block_suspected: boolean | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  id: string;
  pages_scanned: number;
  rate_limit_suspected: boolean | null;
  report_finding_count: number | null;
  robots_allowed: boolean | null;
  robots_fetch_http_status: number | null;
  robots_fetch_status: string | null;
  scanner_slot: number | null;
  scanner_task_arn: string | null;
  status: string;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_http_status: number | null;
  stop_reason_label: string | null;
};

export type NormalScannerQualityAggregationResult = {
  persistedEvents: number;
  persistedWindows: ScannerQualityWindow[];
  processedScanCount: number;
  skippedEgressIds: string[];
};

export type NormalScannerQualityResetResult = {
  deletedCursors: number;
  deletedWarningEvents: number;
  deletedWindows: number;
  dryRun: boolean;
};

const NORMAL_SOURCE_TYPE = "normal_scan" as const;
const NORMAL_SCAN_GRAPH_WINDOW_SIZE = 5;
const NORMAL_SCAN_WARNING_MIN_COMPLETED = 25;

function countRecordValue(record: Record<string, number>, key: string, increment = 1) {
  record[key] = (record[key] ?? 0) + increment;
}

function parseCount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeWindowToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "window";
}

function addCounts(target: Record<string, number>, source: Record<string, number>) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + Math.max(0, value);
  }
}

function dbRowToNormalScanQualityRow(row: NormalScanQualityDbRow): NormalScanQualityRow {
  return {
    accessPostureClass: row.access_posture_class,
    authWallDetected: row.auth_wall_detected,
    authWallSuspected: row.auth_wall_suspected,
    blockedFlag: row.blocked_flag,
    blockPageClassification: row.block_page_classification,
    captchaFlag: row.captcha_flag,
    challengeSuspected: row.challenge_suspected,
    completedAt: row.completed_at,
    egressId: row.egress_id,
    egressProvider: row.egress_provider,
    errorMessage: row.error_message,
    findingCount: row.report_finding_count,
    fingerprintBlockSuspected: row.fingerprint_block_suspected,
    geoBlockSuspected: row.geo_block_suspected,
    homepageFetchHttpStatus: row.homepage_fetch_http_status,
    homepageFetchStatus: row.homepage_fetch_status,
    pagesScanned: row.pages_scanned,
    rateLimitSuspected: row.rate_limit_suspected,
    robotsAllowed: row.robots_allowed,
    robotsFetchHttpStatus: row.robots_fetch_http_status,
    robotsFetchStatus: row.robots_fetch_status,
    scanId: row.id,
    scannerSlot: row.scanner_slot,
    scannerTaskArn: row.scanner_task_arn,
    status: row.status,
    stopReasonCode: row.stop_reason_code,
    stopReasonDetail: row.stop_reason_detail,
    stopReasonHttpStatus: row.stop_reason_http_status,
    stopReasonLabel: row.stop_reason_label
  };
}

function buildEmptyFindingCounts() {
  return Object.fromEntries(OPS_SCAN_STATUS_FINDING_IDS.map((findingId) => [findingId, 0])) as Record<OpsScanStatusFindingId, number>;
}

async function loadNormalScanFindingCounts(scanId: string) {
  const [{ buildScanReportUnifiedFindings }, { projectExecutiveFindingsFromUnifiedPackets }, { getAnonymousScanById }] = await Promise.all([
    import("../../components/scans/shared-scan-detail-view"),
    import("../../lib/scans/executive-findings-projection"),
    import("../scans/get-scan-by-id")
  ]);
  const scanRecord = await getAnonymousScanById(scanId);
  if (!scanRecord) {
    return undefined;
  }

  const reportPackets = buildScanReportUnifiedFindings(scanRecord);
  const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(reportPackets);
  const findingCounts = buildEmptyFindingCounts();
  for (const finding of executiveProjection.findings) {
    if (OPS_SCAN_STATUS_FINDING_IDS.includes(finding.id as OpsScanStatusFindingId)) {
      findingCounts[finding.id as OpsScanStatusFindingId] += 1;
    }
  }
  return findingCounts;
}

export function buildNormalScannerQualityWindow(input: {
  egressId: string;
  rows: NormalScanQualityRow[];
  windowSize?: number;
}): ScannerQualityWindow | null {
  const windowSize = input.windowSize ?? NORMAL_SCAN_GRAPH_WINDOW_SIZE;
  const rows = input.rows.slice(0, windowSize);
  if (rows.length < windowSize) {
    return null;
  }

  const completed = rows.filter((row) => row.status === "completed");
  const first = completed[0];
  const last = completed[completed.length - 1];
  if (!first || !last) {
    return null;
  }

  const accessPostureCounts: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  const scannerTaskCounts: Record<string, number> = {};
  const scannerSlotCounts: Record<string, number> = {};
  let egressProvider: string | null = null;
  let findings = 0;
  const findingCounts: Record<string, number> = {};
  const findingScanCounts: Record<string, number> = {};
  let pagesScanned = 0;
  let zeroFindingCount = 0;

  for (const row of completed) {
    const findingCount = Math.max(0, row.findingCount ?? 0);
    findings += findingCount;
    const seenInScan = new Set<string>();
    for (const [findingId, count] of Object.entries(row.findingCounts ?? {})) {
      const normalizedCount = Math.max(0, count);
      if (normalizedCount <= 0) {
        continue;
      }
      findingCounts[findingId] = (findingCounts[findingId] ?? 0) + normalizedCount;
      seenInScan.add(findingId);
    }
    for (const findingId of seenInScan) {
      findingScanCounts[findingId] = (findingScanCounts[findingId] ?? 0) + 1;
    }
    pagesScanned += Math.max(0, row.pagesScanned);
    if (findingCount === 0) {
      zeroFindingCount += 1;
    }
    countRecordValue(accessPostureCounts, row.accessPostureClass ?? "unknown");
    const interruption = buildOpsInterruptionSummary({
      scan: {
        error_message: row.errorMessage ?? null,
        pages_scanned: row.pagesScanned,
        status: row.status
      },
      snapshot: {
        access_posture_class: row.accessPostureClass,
        auth_wall_detected: row.authWallDetected ?? null,
        auth_wall_suspected: row.authWallSuspected ?? null,
        blocked_flag: row.blockedFlag ?? null,
        block_page_classification: row.blockPageClassification ?? null,
        captcha_flag: row.captchaFlag ?? null,
        challenge_suspected: row.challengeSuspected ?? null,
        fingerprint_block_suspected: row.fingerprintBlockSuspected ?? null,
        geo_block_suspected: row.geoBlockSuspected ?? null,
        homepage_fetch_http_status: row.homepageFetchHttpStatus ?? null,
        homepage_fetch_status: row.homepageFetchStatus ?? null,
        rate_limit_suspected: row.rateLimitSuspected ?? null,
        robots_allowed: row.robotsAllowed ?? null,
        robots_fetch_http_status: row.robotsFetchHttpStatus ?? null,
        robots_fetch_status: row.robotsFetchStatus ?? null,
        stop_reason_code: row.stopReasonCode ?? null,
        stop_reason_detail: row.stopReasonDetail ?? null,
        stop_reason_http_status: row.stopReasonHttpStatus ?? null,
        stop_reason_label: row.stopReasonLabel ?? null
      }
    });
    for (const label of interruption.categories.length > 0 ? interruption.categories : ["none"]) {
      countRecordValue(labelCounts, label);
    }
    if (row.scannerTaskArn) {
      countRecordValue(scannerTaskCounts, row.scannerTaskArn);
    }
    if (row.scannerSlot !== null && row.scannerSlot !== undefined) {
      countRecordValue(scannerSlotCounts, String(row.scannerSlot));
    }
    if (!egressProvider && row.egressProvider) {
      egressProvider = row.egressProvider;
    }
  }

  const sourceWindowId = `${input.egressId}:${first.completedAt}:${last.completedAt}:${last.scanId}`;
  return {
    accessPostureCounts,
    batchId: `normal-scan-${sanitizeWindowToken(input.egressId)}-${sanitizeWindowToken(last.completedAt)}`,
    completedCount: completed.length,
    egressProvider,
    egress_id: input.egressId,
    endRow: null,
    failedCount: 0,
    findingCountsAvailable: Boolean(rows.some((row) => row.findingCounts !== undefined)),
    findingCounts,
    findingScanCounts,
    findingsPerCompleted: findings / Math.max(1, completed.length),
    labelCounts,
    pagesScanned,
    rejectedCount: 0,
    scannerSlotCounts,
    scannerTaskCounts,
    sourceType: NORMAL_SOURCE_TYPE,
    sourceWindowId,
    startRow: null,
    windowEndCompletedAt: last.completedAt,
    windowStartCompletedAt: first.completedAt,
    zeroFindingCount,
    zeroFindingRate: zeroFindingCount / Math.max(1, completed.length)
  };
}

export function buildScannerQualityTrendSummary(input: {
  scanTargets?: number[];
  windows: ScannerQualityWindow[];
}) {
  const scanTargets = input.scanTargets ?? [20, 50, 100, 500, 2000];
  const windows = [...input.windows].sort((a, b) => (b.windowEndCompletedAt ?? b.createdAt ?? "").localeCompare(a.windowEndCompletedAt ?? a.createdAt ?? ""));

  return scanTargets.map((target) => {
    const selected: ScannerQualityWindow[] = [];
    let completedCount = 0;
    for (const window of windows) {
      selected.push(window);
      completedCount += window.completedCount;
      if (completedCount >= target) {
        break;
      }
    }
    const findings = selected.reduce((sum, window) => sum + window.findingsPerCompleted * window.completedCount, 0);
    const zeroFindingCount = selected.reduce((sum, window) => sum + window.zeroFindingCount, 0);
    const pagesScanned = selected.reduce((sum, window) => sum + window.pagesScanned, 0);
    return {
      completedCount,
      findingsPerCompleted: completedCount > 0 ? findings / completedCount : null,
      targetScanCount: target,
      windowCount: selected.length,
      zeroFindingRate: completedCount > 0 ? zeroFindingCount / completedCount : null,
      pagesScanned
    };
  });
}

export function buildScannerQualityTrendSeries(input: { windows: ScannerQualityWindow[] }) {
  let cumulativeCompletedCount = 0;
  return [...input.windows]
    .sort((a, b) => (a.windowEndCompletedAt ?? a.createdAt ?? "").localeCompare(b.windowEndCompletedAt ?? b.createdAt ?? ""))
    .map((window) => {
      cumulativeCompletedCount += window.completedCount;
      return {
        completedAt: window.windowEndCompletedAt ?? window.createdAt ?? null,
        completedCount: window.completedCount,
        cumulativeCompletedCount,
        findingCountsAvailable: window.findingCountsAvailable === true,
        findingCounts: window.findingCounts ?? {},
        findingScanCounts: window.findingScanCounts ?? {},
        findingsPerCompleted: window.findingsPerCompleted,
        pagesScanned: window.pagesScanned,
        zeroFindingRate: window.zeroFindingRate
      };
    });
}

export function buildAccumulatedScannerQualityWindow(input: {
  batchId: string;
  egressId: string;
  minCompleted?: number;
  windows: ScannerQualityWindow[];
}): ScannerQualityWindow | null {
  const minCompleted = input.minCompleted ?? NORMAL_SCAN_WARNING_MIN_COMPLETED;
  const selected: ScannerQualityWindow[] = [];
  let completedCount = 0;
  for (const window of [...input.windows].sort((a, b) => (b.windowEndCompletedAt ?? b.createdAt ?? "").localeCompare(a.windowEndCompletedAt ?? a.createdAt ?? ""))) {
    selected.push(window);
    completedCount += window.completedCount;
    if (completedCount >= minCompleted) {
      break;
    }
  }
  if (completedCount < minCompleted) {
    return null;
  }

  const accessPostureCounts: Record<string, number> = {};
  const labelCounts: Record<string, number> = {};
  const scannerSlotCounts: Record<string, number> = {};
  const scannerTaskCounts: Record<string, number> = {};
  for (const window of selected) {
    addCounts(accessPostureCounts, window.accessPostureCounts);
    addCounts(labelCounts, window.labelCounts);
    addCounts(scannerSlotCounts, window.scannerSlotCounts);
    addCounts(scannerTaskCounts, window.scannerTaskCounts);
  }
  const findings = selected.reduce((sum, window) => sum + window.findingsPerCompleted * window.completedCount, 0);
  const zeroFindingCount = selected.reduce((sum, window) => sum + window.zeroFindingCount, 0);

  return {
    accessPostureCounts,
    batchId: input.batchId,
    completedCount,
    egressProvider: selected[0]?.egressProvider ?? null,
    egress_id: input.egressId,
    endRow: null,
    failedCount: selected.reduce((sum, window) => sum + window.failedCount, 0),
    findingsPerCompleted: findings / Math.max(1, completedCount),
    labelCounts,
    pagesScanned: selected.reduce((sum, window) => sum + window.pagesScanned, 0),
    rejectedCount: 0,
    scannerSlotCounts,
    scannerTaskCounts,
    sourceType: NORMAL_SOURCE_TYPE,
    sourceWindowId: selected.map((window) => window.sourceWindowId ?? window.batchId).join(","),
    startRow: null,
    windowEndCompletedAt: selected[0]?.windowEndCompletedAt ?? null,
    windowStartCompletedAt: selected.at(-1)?.windowStartCompletedAt ?? null,
    zeroFindingCount,
    zeroFindingRate: zeroFindingCount / Math.max(1, completedCount)
  };
}

async function loadPendingNormalScanRows(input: {
  egressId: string;
  lastCompletedAt?: string | null;
  lastScanId?: string | null;
  limit: number;
}) {
  const result = await query<NormalScanQualityDbRow>(
    `
      select
        s.id::text as id,
        s.status,
        s.completed_at::text as completed_at,
        s.pages_scanned,
        s.error_message,
        s.scanner_task_arn,
        s.scanner_slot,
        coalesce(s.egress_id, ss.egress_id, 'unknown-egress') as egress_id,
        coalesce(s.egress_provider, ss.egress_type) as egress_provider,
        ss.report_finding_count,
        ss.access_posture_class,
        ss.auth_wall_detected,
        ss.auth_wall_suspected,
        ss.blocked_flag,
        ss.block_page_classification,
        ss.captcha_flag,
        ss.challenge_suspected,
        ss.fingerprint_block_suspected,
        ss.geo_block_suspected,
        ss.homepage_fetch_http_status,
        ss.homepage_fetch_status,
        ss.rate_limit_suspected,
        ss.robots_allowed,
        ss.robots_fetch_http_status,
        ss.robots_fetch_status,
        ss.stop_reason_code,
        ss.stop_reason_detail,
        ss.stop_reason_http_status,
        ss.stop_reason_label
      from scans s
      left join scan_snapshots ss on ss.scan_id = s.id
      where s.status = 'completed'
        and s.completed_at is not null
        and coalesce(s.egress_id, ss.egress_id, 'unknown-egress') = $1
        and (
          $2::timestamptz is null
          or s.completed_at > $2::timestamptz
          or (s.completed_at = $2::timestamptz and s.id > $3::uuid)
        )
      order by s.completed_at asc, s.id asc
      limit $4
    `,
    [input.egressId, input.lastCompletedAt ?? null, input.lastScanId ?? "00000000-0000-0000-0000-000000000000", input.limit],
    { readOnly: true }
  );
  const rows = result.rows.map(dbRowToNormalScanQualityRow);
  return await Promise.all(
    rows.map(async (row) => ({
      ...row,
      findingCounts: await loadNormalScanFindingCounts(row.scanId)
    }))
  );
}

export async function persistPendingNormalScannerQualityWindows(input: { egressIds?: string[]; windowSize?: number } = {}): Promise<NormalScannerQualityAggregationResult> {
  const windowSize = input.windowSize ?? NORMAL_SCAN_GRAPH_WINDOW_SIZE;
  const maxWindowsPerEgress = 400;
  const egressIds =
    input.egressIds ??
    (
      await query<{ egress_id: string }>(
        `
          select distinct coalesce(s.egress_id, ss.egress_id, 'unknown-egress') as egress_id
          from scans s
          left join scan_snapshots ss on ss.scan_id = s.id
          where s.status = 'completed'
            and s.completed_at is not null
          order by 1 asc
        `,
        [],
        { readOnly: true }
      )
    ).rows.map((row) => row.egress_id);

  const persistedWindows: ScannerQualityWindow[] = [];
  let persistedEvents = 0;
  let processedScanCount = 0;
  const skippedEgressIds: string[] = [];

  for (const egressId of egressIds) {
    let cursor = await queryOne<{ last_completed_at: string | null; last_scan_id: string | null }>(
      `
        select last_completed_at::text as last_completed_at, last_scan_id::text as last_scan_id
        from scanner_quality_aggregation_cursors
        where source_type = $1 and egress_id = $2
      `,
      [NORMAL_SOURCE_TYPE, egressId],
      { readOnly: true }
    );
    let windowsForEgress = 0;
    for (let index = 0; index < maxWindowsPerEgress; index += 1) {
      const rows = await loadPendingNormalScanRows({
        egressId,
        lastCompletedAt: cursor?.last_completed_at ?? null,
        lastScanId: cursor?.last_scan_id ?? null,
        limit: windowSize
      });
      const window = buildNormalScannerQualityWindow({ egressId, rows, windowSize });
      if (!window) {
        break;
      }

      await persistScannerQualityWindow(window);
      const previous = await loadRecentScannerQualityWindows({
        egressId,
        excludeBatchId: window.batchId,
        limit: 10,
        sourceType: NORMAL_SOURCE_TYPE
      });
      const evaluationWindow = buildAccumulatedScannerQualityWindow({
        batchId: window.batchId,
        egressId,
        windows: [window, ...previous]
      });
      const warnings = evaluateLoadTestQualityWarnings({
        baseline: buildRollingBaseline(previous) ?? undefined,
        batchId: evaluationWindow?.batchId ?? window.batchId,
        egressProvider: evaluationWindow?.egressProvider ?? window.egressProvider,
        egress_id: evaluationWindow?.egress_id ?? window.egress_id,
        generatedAt: new Date().toISOString(),
        labelCounts: evaluationWindow?.labelCounts ?? window.labelCounts,
        metrics: evaluationWindow ? windowToMetricValues(evaluationWindow) : windowToMetricValues(window)
      });
      await persistQualityWarningEvents(warnings);
      persistedEvents += warnings.length;
      persistedWindows.push(window);
      processedScanCount += window.completedCount;
      windowsForEgress += 1;

      const lastRow = rows[window.completedCount - 1];
      await query(
        `
          insert into scanner_quality_aggregation_cursors (source_type, egress_id, last_completed_at, last_scan_id, updated_at)
          values ($1, $2, $3::timestamptz, $4::uuid, now())
          on conflict (source_type, egress_id) do update set
            last_completed_at = excluded.last_completed_at,
            last_scan_id = excluded.last_scan_id,
            updated_at = now()
        `,
        [NORMAL_SOURCE_TYPE, egressId, window.windowEndCompletedAt, lastRow?.scanId]
      );
      cursor = {
        last_completed_at: window.windowEndCompletedAt ?? null,
        last_scan_id: lastRow?.scanId ?? null
      };
    }
    if (windowsForEgress === 0) {
      skippedEgressIds.push(egressId);
    }
  }

  return { persistedEvents, persistedWindows, processedScanCount, skippedEgressIds };
}

export async function resetDerivedNormalScannerQualityHistory(input: { dryRun?: boolean } = {}): Promise<NormalScannerQualityResetResult> {
  const dryRun = input.dryRun ?? true;
  const counts = await queryOne<{
    cursor_count: string | number;
    warning_event_count: string | number;
    window_count: string | number;
  }>(
    `
      select
        (select count(*) from scanner_quality_windows where source_type = $1) as window_count,
        (
          select count(*)
          from scanner_quality_warning_events event
          where exists (
            select 1
            from scanner_quality_windows window
            where window.source_type = $1
              and window.batch_id = event.batch_id
          )
        ) as warning_event_count,
        (select count(*) from scanner_quality_aggregation_cursors where source_type = $1) as cursor_count
    `,
    [NORMAL_SOURCE_TYPE],
    { readOnly: true }
  );

  const result = {
    deletedCursors: parseCount(counts?.cursor_count),
    deletedWarningEvents: parseCount(counts?.warning_event_count),
    deletedWindows: parseCount(counts?.window_count),
    dryRun
  };

  if (dryRun) {
    return result;
  }

  await query(
    `
      delete from scanner_quality_warning_events event
      where exists (
        select 1
        from scanner_quality_windows window
        where window.source_type = $1
          and window.batch_id = event.batch_id
      )
    `,
    [NORMAL_SOURCE_TYPE]
  );
  await query("delete from scanner_quality_aggregation_cursors where source_type = $1", [NORMAL_SOURCE_TYPE]);
  await query("delete from scanner_quality_windows where source_type = $1", [NORMAL_SOURCE_TYPE]);

  return result;
}

async function persistScannerQualityWindow(window: ScannerQualityWindow) {
  await query(
    `
      insert into scanner_quality_windows (
        batch_id, start_row, end_row, egress_id, egress_provider,
        completed_count, failed_count, rejected_count, findings_per_completed,
        zero_finding_count, zero_finding_rate, pages_scanned,
        access_posture_counts, label_counts, scanner_task_counts, scanner_slot_counts,
      metrics_json, source_type, source_window_id, window_start_completed_at, window_end_completed_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19,$20::timestamptz,$21::timestamptz)
      on conflict (batch_id, egress_id) do update set
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
        metrics_json = excluded.metrics_json,
        source_type = excluded.source_type,
        source_window_id = excluded.source_window_id,
        window_start_completed_at = excluded.window_start_completed_at,
        window_end_completed_at = excluded.window_end_completed_at
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
      JSON.stringify({
        ...windowToMetricValues(window),
        findingCountsAvailable: window.findingCountsAvailable === true,
        findingCounts: window.findingCounts ?? {},
        findingScanCounts: window.findingScanCounts ?? {}
      }),
      window.sourceType ?? NORMAL_SOURCE_TYPE,
      window.sourceWindowId ?? null,
      window.windowStartCompletedAt ?? null,
      window.windowEndCompletedAt ?? null
    ]
  );
}
