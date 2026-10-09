import "server-only";
import { queryOne } from "@website-signal-risk-scanner/db";
import { REPORT_PUBLICATION_TIMEOUT_MS } from "../../../../packages/shared/src/report-artifact-transfer";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import { getCanonicalScanReportPublicationReadiness } from "./scan-report-projection-generation";

/** Read-triggered recovery must not take the verified worker's publication lock. */
export async function getReadTriggeredPublicationDeferral(scanId: string): Promise<string | null> {
  // Use the writer: a lagging read replica must not hide the atomically queued
  // worker request or admit publication before canonical completion markers.
  const row = await queryOne<{
    scan_status: string;
    projection_required: boolean;
    merged_signals_ready: boolean;
    findings_ready: boolean;
    worker_reserved: boolean;
  }>(
    `select scan.status as scan_status,
            coalesce(scan.scan_config_json->>'processor' = $2, false) as projection_required,
            exists (select 1 from public.scan_events event
                     where event.scan_id = scan.id and event.event_type = 'signals.merge_completed') as merged_signals_ready,
            exists (select 1 from public.scan_events event
                     where event.scan_id = scan.id and event.event_type = 'findings.unified_derivation_completed') as findings_ready,
            exists (
              select 1 from public.scan_score_materialization_requests request
               where request.scan_id = scan.id
                 and scan.status = 'completed'
                 and request.status = 'pending'
                 and request.next_attempt_at <= now()
                 and coalesce(request.last_attempt_at, request.requested_at) <= now()
                 and coalesce(request.last_attempt_at, request.requested_at) > now() - ($3::int * interval '1 millisecond')
                 and exists (
                   select 1 from (
                     select event.metadata_json from public.scan_events event
                      where event.scan_id = scan.id
                        and event.event_type = 'v2_lambda_result.received'
                        and event.created_at >= now() - interval '7 days'
                        and event.metadata_json->>'resultStatus' = 'completed'
                      order by event.created_at desc
                      limit 1
                   ) result
                    where result.metadata_json->>'targetEnvironment' = 'production'
                      and result.metadata_json #>> '{artifactVerification,verifiedAt}' is not null
                 )
            ) as worker_reserved
       from public.scans scan where scan.id = $1::uuid`,
    [scanId, LOCAL_V2_DAG_SCAN_PROCESSOR, REPORT_PUBLICATION_TIMEOUT_MS],
  );
  if (!row) return null; // Preserve the publisher's scoped missing-scan result.
  const readiness = getCanonicalScanReportPublicationReadiness({
    scanStatus: row.scan_status,
    projectionRequired: row.projection_required,
    mergedSignalsReady: row.merged_signals_ready,
    findingsReady: row.findings_ready,
  });
  if (!readiness.ready) return readiness.reason;
  return row.projection_required && row.worker_reserved ? "durable_worker_publication_pending" : null;
}
