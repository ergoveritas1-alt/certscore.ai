import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import { MAX_SCAN_REPORT_PROJECTION_BYTES, READABLE_SCAN_REPORT_PROJECTION_VERSIONS } from "./scan-report-projection-contract";

/** Metadata eligibility shared by lightweight status and Admin; never hydrates or repairs reports. */
export function requiresPersistedReportPublicationSql(scan: string, request: string) {
  return `(coalesce(${scan}.scan_config_json ->> 'processor' = '${LOCAL_V2_DAG_SCAN_PROCESSOR}', false)
    or ${request}.scan_id is not null
    or exists (select 1 from public.scan_events runtime_result
      where runtime_result.scan_id = ${scan}.id and runtime_result.event_type = 'v2_lambda_result.received'))`;
}

export function readableReportProjectionSql(snapshot: string) {
  return `coalesce((
    ${snapshot}.report_projection_status = 'ready'
    and ${snapshot}.report_projection_version = any(array[${READABLE_SCAN_REPORT_PROJECTION_VERSIONS.map(version => `'${version}'`).join(", ")}])
    and ${snapshot}.report_projection_computed_at is not null
    and ${snapshot}.report_projection_source_hash ~ '^[0-9a-f]{64}$'
    and ${snapshot}.report_projection_payload is not null
    and ${snapshot}.report_projection_payload_sha256 ~ '^[0-9a-f]{64}$'
    and ${snapshot}.report_projection_payload_size_bytes between 1 and ${MAX_SCAN_REPORT_PROJECTION_BYTES}
  ), false)`;
}

export function reportAwareScanStatusSql(scan: string, snapshot: string, request: string) {
  return `case
    when ${request}.status = 'terminal_failure' then 'failed'
    when ${scan}.status in ('completed', 'completed_limited') and ${snapshot}.report_projection_status = 'failed' then 'failed'
    when ${scan}.status in ('completed', 'completed_limited')
      and ${requiresPersistedReportPublicationSql(scan, request)}
      and not (${readableReportProjectionSql(snapshot)}) then 'finalizing'
    else ${scan}.status
  end`;
}
