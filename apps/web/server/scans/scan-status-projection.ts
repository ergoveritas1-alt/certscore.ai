import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import {
  MAX_SCAN_REPORT_PROJECTION_BYTES,
  SCAN_REPORT_PROJECTION_VERSION
} from "./scan-report-projection-contract";

export type ScanStatusProjection = {
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  pageUrl: string | null;
  errorMessage: string | null;
  id: string;
  organizationId: string | null;
  profile: string;
  reportGeneration: string | null;
  reportInputsReady: boolean;
  reportProjectionRequired: boolean;
  reportReady: boolean;
  browserExtensionNormalizationReady: boolean;
  startedAt: string | null;
  status: string;
};

export type CanonicalScanProgressStage = "prepare" | "scan" | "review" | "report" | "complete";

export function deriveCanonicalScanProgressStage(
  projection: Pick<ScanStatusProjection, "reportInputsReady" | "reportReady" | "status">
): CanonicalScanProgressStage {
  if (projection.reportReady && (projection.status === "completed" || projection.status === "completed_limited")) {
    return "complete";
  }
  if (projection.reportInputsReady && (projection.status === "completed" || projection.status === "completed_limited")) {
    return "report";
  }
  if (projection.status === "completed" || projection.status === "completed_limited" || projection.status === "processing") {
    return "review";
  }
  return projection.status === "running" ? "scan" : "prepare";
}

type ScanStatusProjectionRow = {
  completed_at: string | Date | null;
  created_at: string | Date;
  domain_hostname: string | null;
  page_url: string | null;
  error_message: string | null;
  id: string;
  organization_id: string | null;
  profile: string | null;
  report_generation: string | null;
  report_inputs_ready: boolean;
  report_projection_required: boolean;
  report_ready: boolean;
  browser_extension_normalization_ready: boolean;
  started_at: string | Date | null;
  status: string;
};

function iso(value: string | Date | null) {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function project(row: ScanStatusProjectionRow | null): ScanStatusProjection | null {
  if (!row) return null;
  return {
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at) as string,
    domainHostname: row.domain_hostname,
    pageUrl: row.page_url,
    errorMessage: row.error_message,
    id: row.id,
    organizationId: row.organization_id,
    profile: row.profile === "tiny" ? "tiny" : "standard",
    reportGeneration: row.report_generation,
    reportInputsReady: row.report_inputs_ready,
    reportProjectionRequired: row.report_projection_required,
    reportReady: row.report_ready,
    browserExtensionNormalizationReady: row.browser_extension_normalization_ready,
    startedAt: iso(row.started_at),
    status: row.status,
  };
}

const PROJECTION_SQL = `select s.id,
       s.organization_id,
       s.status,
       s.created_at,
       s.started_at,
       s.completed_at,
       s.error_message,
       d.hostname as domain_hostname,
       nullif(s.scan_config_json #>> '{normalizedUrl}', '') as page_url,
       coalesce(
         nullif(s.scan_config_json #>> '{execution,v2DagParallel,profile}', ''),
         nullif(s.scan_config_json ->> 'profile', ''),
         'standard'
       ) as profile
       , coalesce(s.scan_config_json ->> 'processor' = '${LOCAL_V2_DAG_SCAN_PROCESSOR}', false) as report_projection_required
       , case
           when s.scan_config_json ->> 'processor' = '${LOCAL_V2_DAG_SCAN_PROCESSOR}' then
             exists (
               select 1 from scan_events merged
                where merged.scan_id = s.id
                  and merged.event_type = 'signals.merge_completed'
             ) and exists (
               select 1 from scan_events findings
                where findings.scan_id = s.id
                  and findings.event_type = 'findings.unified_derivation_completed'
             )
           else true
         end as report_inputs_ready
       , case
           when s.scan_config_json ->> 'processor' = '${LOCAL_V2_DAG_SCAN_PROCESSOR}' then exists (
             select 1 from scan_snapshots projection
              where projection.scan_id = s.id
                and projection.report_projection_status = 'ready'
                and projection.report_projection_version = '${SCAN_REPORT_PROJECTION_VERSION}'
                and projection.report_projection_computed_at is not null
                and projection.report_projection_source_hash ~ '^[0-9a-f]{64}$'
                and projection.report_projection_payload is not null
                and projection.report_projection_payload_sha256 ~ '^[0-9a-f]{64}$'
                and projection.report_projection_payload_size_bytes between 1 and ${MAX_SCAN_REPORT_PROJECTION_BYTES}
           )
           else exists (
             select 1 from scan_events ready
              where ready.scan_id = s.id
                and ready.event_type in ('signals.merge_completed', 'findings.unified_derivation_completed')
           )
         end as report_ready
       , (select projection.report_projection_source_hash
            from scan_snapshots projection
           where projection.scan_id = s.id
             and projection.report_projection_status = 'ready'
             and projection.report_projection_version = '${SCAN_REPORT_PROJECTION_VERSION}'
           limit 1) as report_generation
       , exists (
           select 1 from scan_events normalized
            where normalized.scan_id = s.id
              and normalized.event_type in ('browser_extension.observed_signals_ingested', 'browser_extension.normalization_failed')
         ) as browser_extension_normalization_ready
  from scans s
  left join domains d on d.id = s.domain_id`;

export async function getOrganizationScanStatusProjection(input: {
  organizationId: string;
  scanId: string;
}) {
  return project(await queryOne<ScanStatusProjectionRow>(
    `${PROJECTION_SQL}
      where s.id = $1
        and (
          s.organization_id = $2::uuid
          or exists (
            select 1 from scan_requests reused
             where reused.organization_id = $2::uuid
               and reused.fulfilled_by_scan_id = s.id
               and reused.status = 'reused_recent_scan'
               and reused.resolution_mode = 'reused_existing_scan'
          )
        )`,
    [input.scanId, input.organizationId],
    { readOnly: true },
  ));
}

export async function getAnonymousScanStatusProjection(scanId: string) {
  return project(await queryOne<ScanStatusProjectionRow>(
    `${PROJECTION_SQL}
      where s.id = $1
        and s.organization_id is null`,
    [scanId],
    { readOnly: true },
  ));
}

export async function getPublicScanStatusProjection(scanId: string) {
  return project(await queryOne<ScanStatusProjectionRow>(
    `${PROJECTION_SQL}
      where s.id = $1`,
    [scanId],
    { readOnly: true },
  ));
}

export async function getViewerAccessibleScanStatusProjection(input: {
  scanId: string;
  viewerEmail: string | null;
  viewerUserId: string | null;
}) {
  return project(await queryOne<ScanStatusProjectionRow>(
    `${PROJECTION_SQL}
      where s.id = $1
        and (
          s.organization_id is null
          or exists (
            select 1
              from organization_members om
              join users u on u.id = om.user_id
             where om.organization_id = s.organization_id
               and (
                 ($2::uuid is not null and u.id = $2::uuid)
                 or ($3::text is not null and lower(u.email) = lower($3::text))
               )
          )
          or exists (
            select 1
              from scan_requests reused
              join organization_members viewer_membership
                on viewer_membership.organization_id = reused.organization_id
              join users viewer on viewer.id = viewer_membership.user_id
             where reused.fulfilled_by_scan_id = s.id
               and reused.status = 'reused_recent_scan'
               and reused.resolution_mode = 'reused_existing_scan'
               and (
                 ($2::uuid is not null and viewer.id = $2::uuid)
                 or ($3::text is not null and lower(viewer.email) = lower($3::text))
               )
          )
        )`,
    [input.scanId, input.viewerUserId, input.viewerEmail],
    { readOnly: true },
  ));
}

export function isPendingScanStatus(status: string) {
  return status === "queued" || status === "running" || status === "processing";
}

export function isCompletedScanStatus(status: string) {
  return status === "completed" || status === "completed_limited";
}

export function buildLightweightScanStatusResponse(projection: ScanStatusProjection) {
  return {
    domain: projection.domainHostname,
    browserExtensionNormalizationReady: projection.browserExtensionNormalizationReady,
    reportReadiness: {
      generation: projection.reportGeneration,
      status: projection.reportReady ? "ready" : "finalizing"
    },
    progress: {
      stage: deriveCanonicalScanProgressStage(projection)
    },
    scan: {
      completedAt: projection.completedAt,
      createdAt: projection.createdAt,
      errorMessage: projection.errorMessage,
      id: projection.id,
      startedAt: projection.startedAt,
      status: projection.status,
    },
  };
}
