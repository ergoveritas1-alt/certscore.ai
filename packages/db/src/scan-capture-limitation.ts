import { query } from "./postgres";

/** Persist a classified terminal capture limitation without creating a report,
 * scores, findings, or a successful scan. Anonymous scans are supported. */
export async function recordScanCaptureLimitation(input: {
  scanId: string;
  completedAt: string;
  assessment: Record<string, unknown>;
  presentation: {
    snapshotHomepageFetchStatus: string;
    snapshotScanOutcome: string;
    snapshotStopReasonCode: string;
    snapshotStopReasonLabel: string;
    snapshotStopReasonDetail: string;
  };
}, execute: (sql: string, values: unknown[]) => Promise<unknown> = query) {
  await execute(
    `insert into scan_snapshots (
       scan_id, organization_id, domain_id, pages_requested, pages_scanned,
       coverage_level, homepage_fetch_status, scan_outcome, stop_reason_code,
       stop_reason_label, stop_reason_detail, scan_no_go_assessment
     )
     select s.id, s.organization_id, s.domain_id,
            greatest(coalesce(s.pages_requested, 1), 1), 0,
            'limited_none', $8, $3, $4, $5, $6, $7::jsonb
       from scans s
      where s.id = $1 and s.status = 'failed' and s.domain_id is not null
        and (s.scan_config_json #>> '{execution,v2DagLambda,completedAt}')::timestamptz = $2::timestamptz
      for no key update of s
     on conflict (scan_id) do update
       set coverage_level = excluded.coverage_level,
           homepage_fetch_status = excluded.homepage_fetch_status,
           scan_outcome = excluded.scan_outcome,
           stop_reason_code = excluded.stop_reason_code,
           stop_reason_label = excluded.stop_reason_label,
           stop_reason_detail = excluded.stop_reason_detail,
           scan_no_go_assessment = excluded.scan_no_go_assessment
       where scan_snapshots.scan_no_go_assessment is null
         and scan_snapshots.pages_scanned = 0
         and scan_snapshots.score_scored_at is null`,
    [input.scanId, input.completedAt, input.presentation.snapshotScanOutcome,
      input.presentation.snapshotStopReasonCode, input.presentation.snapshotStopReasonLabel,
      input.presentation.snapshotStopReasonDetail, JSON.stringify(input.assessment), input.presentation.snapshotHomepageFetchStatus],
  );
}
