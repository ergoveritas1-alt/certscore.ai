import "server-only";

import { queryOne } from "@website-signal-risk-scanner/db";

export type ScanStatusProjection = {
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  errorMessage: string | null;
  id: string;
  organizationId: string | null;
  profile: string;
  reportReady: boolean;
  browserExtensionNormalizationReady: boolean;
  startedAt: string | null;
  status: string;
};

type ScanStatusProjectionRow = {
  completed_at: string | Date | null;
  created_at: string | Date;
  domain_hostname: string | null;
  error_message: string | null;
  id: string;
  organization_id: string | null;
  profile: string | null;
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
    errorMessage: row.error_message,
    id: row.id,
    organizationId: row.organization_id,
    profile: row.profile === "tiny" ? "tiny" : "standard",
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
       coalesce(
         nullif(s.scan_config_json #>> '{execution,v2DagParallel,profile}', ''),
         nullif(s.scan_config_json ->> 'profile', ''),
         'standard'
       ) as profile
       , exists (
           select 1 from scan_events ready
            where ready.scan_id = s.id
              and ready.event_type in ('signals.merge_completed', 'findings.unified_derivation_completed')
         ) as report_ready
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

export function buildLightweightScanStatusResponse(projection: ScanStatusProjection) {
  return {
    domain: projection.domainHostname,
    browserExtensionNormalizationReady: projection.browserExtensionNormalizationReady,
    reportReadiness: { status: projection.reportReady ? "ready" : "finalizing" },
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
