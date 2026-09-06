import "server-only";

import { apiV2PreConsentRuntimePreviewSchema, type ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";
import { queryOne } from "@website-signal-risk-scanner/db";
import { projectExternalScanNoGo } from "@website-signal-risk-scanner/shared";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";
import {
  MAX_SCAN_REPORT_PROJECTION_BYTES,
  READABLE_SCAN_REPORT_PROJECTION_VERSIONS,
  SCAN_REPORT_PROJECTION_VERSION
} from "./scan-report-projection-contract";

export type ScanStatusProjection = {
  fullSite?: import("@website-signal-risk-scanner/shared").CrawlOptions;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  pageUrl: string | null;
  errorMessage: string | null;
  id: string;
  lastHeartbeatAt?: string | null;
  organizationId: string | null;
  pagesRequested?: number;
  pagesScanned?: number;
  profile: string;
  postRefusalObservationExpected: boolean;
  preConsentPreview?: ApiV2PreConsentRuntimePreview;
  reportGeneration: string | null;
  reportInputsReady: boolean;
  reportProjectionRequired: boolean;
  reportReady: boolean;
  reportProjectionStatus?: string | null;
  scanFrom?: string | null;
  scanNoGoAssessment?: Record<string, unknown> | null;
  score?: number | null;
  scoreUpdatedAt?: string | null;
  scoreVersion?: string | null;
  browserExtensionNormalizationReady: boolean;
  startedAt: string | null;
  status: string;
  visualAccessReview?: Record<string, unknown> | null;
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
  full_site?: import("@website-signal-risk-scanner/shared").CrawlOptions;
  completed_at: string | Date | null;
  created_at: string | Date;
  domain_hostname: string | null;
  page_url: string | null;
  error_message: string | null;
  id: string;
  last_heartbeat_at: string | Date | null;
  organization_id: string | null;
  pages_requested: number;
  pages_scanned: number;
  profile: string | null;
  post_refusal_observation_expected: boolean;
  pre_consent_preview: unknown;
  report_generation: string | null;
  report_inputs_ready: boolean;
  report_projection_required: boolean;
  report_ready: boolean;
  report_projection_status: string | null;
  scan_from: string | null;
  scan_no_go_assessment: Record<string, unknown> | null;
  score: number | null;
  score_updated_at: string | Date | null;
  score_version: string | null;
  browser_extension_normalization_ready: boolean;
  started_at: string | Date | null;
  status: string;
  visual_access_review: Record<string, unknown> | null;
};

function iso(value: string | Date | null) {
  if (value === null) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function project(row: ScanStatusProjectionRow | null): ScanStatusProjection | null {
  if (!row) return null;
  const preConsentPreview = apiV2PreConsentRuntimePreviewSchema.safeParse(row.pre_consent_preview);
  return {
    ...(row.full_site ? {fullSite:row.full_site} : {}),
    completedAt: iso(row.completed_at),
    createdAt: iso(row.created_at) as string,
    domainHostname: row.domain_hostname,
    pageUrl: row.page_url,
    errorMessage: row.error_message,
    id: row.id,
    lastHeartbeatAt: iso(row.last_heartbeat_at),
    organizationId: row.organization_id,
    pagesRequested: row.pages_requested,
    pagesScanned: row.pages_scanned,
    profile: row.profile === "tiny" ? "tiny" : "standard",
    postRefusalObservationExpected: row.post_refusal_observation_expected,
    ...(preConsentPreview.success ? { preConsentPreview: preConsentPreview.data } : {}),
    reportGeneration: row.report_generation,
    reportInputsReady: row.report_inputs_ready,
    reportProjectionRequired: row.report_projection_required,
    reportReady: row.report_ready,
    reportProjectionStatus: row.report_projection_status,
    scanFrom: row.scan_from,
    scanNoGoAssessment: row.scan_no_go_assessment,
    score: row.score,
    scoreUpdatedAt: iso(row.score_updated_at),
    scoreVersion: row.score_version,
    browserExtensionNormalizationReady: row.browser_extension_normalization_ready,
    startedAt: iso(row.started_at),
    status: row.status,
    visualAccessReview: row.visual_access_review,
  };
}

const PROJECTION_SQL = `select s.id,
       s.organization_id,
       s.status,
       s.created_at,
       s.started_at,
       s.completed_at,
       s.error_message,
       s.pages_requested,
       s.pages_scanned,
       d.hostname as domain_hostname,
       case when s.scan_config_json->>'fullSite'='true' then s.scan_config_json->'crawlOptions' end as full_site,
       nullif(s.scan_config_json #>> '{normalizedUrl}', '') as page_url,
       nullif(s.scan_config_json ->> 'scanFrom', '') as scan_from,
       snapshot.certscore_overall as score,
       snapshot.score_scored_at as score_updated_at,
       snapshot.score_version,
       snapshot.report_projection_status,
       snapshot.scan_no_go_assessment,
       snapshot.visual_access_review,
       coalesce(
         (select max(event.created_at) from scan_events event where event.scan_id = s.id),
         s.completed_at,
         s.started_at,
         s.created_at
       ) as last_heartbeat_at,
       coalesce(
         nullif(s.scan_config_json #>> '{execution,v2DagParallel,profile}', ''),
         nullif(s.scan_config_json ->> 'profile', ''),
         'standard'
       ) as profile
       , coalesce(
           (s.scan_config_json #>> '{execution,v2DagLambda,postRefusalRejectWorkerEnabled}')::boolean,
           false
         ) as post_refusal_observation_expected
       , (select event.metadata_json->'preview'
            from scan_events event
           where event.scan_id = s.id
             and event.event_type = 'v2_runtime_preview.received'
           order by event.created_at desc
           limit 1) as pre_consent_preview
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
                and projection.report_projection_version = any(array[${READABLE_SCAN_REPORT_PROJECTION_VERSIONS.map((version) => `'${version}'`).join(", ")}])
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
             and projection.report_projection_version = any(array[${READABLE_SCAN_REPORT_PROJECTION_VERSIONS.map((version) => `'${version}'`).join(", ")}])
           limit 1) as report_generation
       , exists (
           select 1 from scan_events normalized
            where normalized.scan_id = s.id
              and normalized.event_type in ('browser_extension.observed_signals_ingested', 'browser_extension.normalization_failed')
         ) as browser_extension_normalization_ready
  from scans s
  left join domains d on d.id = s.domain_id
  left join scan_snapshots snapshot on snapshot.scan_id = s.id`;

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
    ...(projection.preConsentPreview ? { preConsentPreview: projection.preConsentPreview } : {}),
    reportReadiness: {
      generation: projection.reportGeneration,
      status: projection.reportReady ? "ready" : "finalizing"
    },
    postRefusalObservationExpected: projection.postRefusalObservationExpected,
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

function apiV2ProjectionStatus(projection: ScanStatusProjection, hasNoGo: boolean) {
  if (hasNoGo && (projection.status === "completed" || projection.status === "completed_limited")) {
    return "completed_limited" as const;
  }
  if (projection.reportProjectionStatus === "failed" && (projection.status === "completed" || projection.status === "completed_limited")) {
    return "failed" as const;
  }
  if ((projection.status === "completed" || projection.status === "completed_limited") && !projection.reportReady) {
    return "finalizing" as const;
  }
  if (
    projection.status === "queued" ||
    projection.status === "running" ||
    projection.status === "completed" ||
    projection.status === "completed_limited" ||
    projection.status === "failed" ||
    projection.status === "expired" ||
    projection.status === "rate_limited"
  ) {
    return projection.status;
  }
  return "running" as const;
}

/**
 * Projects the bounded status row into the API v2 job builder input. This path
 * deliberately excludes report hydration and artifact materialization.
 */
export function buildLightweightApiV2ScanStatusInput(projection: ScanStatusProjection) {
  const runtimeArtifacts = {
    ...(projection.scanNoGoAssessment
      ? { scan_no_go_assessment: projection.scanNoGoAssessment }
      : {}),
    ...(projection.visualAccessReview
      ? { visual_access_review: projection.visualAccessReview }
      : {}),
  };
  const noGoProjection = projectExternalScanNoGo(runtimeArtifacts);
  const status = apiV2ProjectionStatus(projection, Boolean(noGoProjection));
  const terminal = status === "completed" || status === "completed_limited" || status === "failed" || status === "expired" || status === "rate_limited";
  const score = terminal && projection.reportReady && !noGoProjection && typeof projection.score === "number"
    ? projection.score
    : null;
  const pagesRequested = Math.max(1, projection.pagesRequested ?? 1);
  const pagesScanned = Math.max(0, projection.pagesScanned ?? 0);
  const reportProjectionError = status === "failed" && projection.reportProjectionStatus === "failed"
    ? {
        code: "report_projection_failed",
        message: "The scan completed, but its canonical report result could not be finalized.",
        retryable: true,
        retryAfterSeconds: 30,
        recommendedNextAction: "Retry certscore_scan_site with freshness=refresh. If the failure repeats, stop and contact CertScore support.",
      }
    : undefined;

  return {
    jobId: projection.id,
    scanId: projection.id,
    domain: projection.domainHostname,
    status,
    ...(noGoProjection ?? {}),
    ...(reportProjectionError ? { error: reportProjectionError } : {}),
    ...(projection.preConsentPreview ? { preConsentPreview: projection.preConsentPreview } : {}),
    createdAt: projection.createdAt,
    startedAt: projection.startedAt,
    completedAt: projection.completedAt,
    lastHeartbeatAt: projection.lastHeartbeatAt ?? projection.completedAt ?? projection.startedAt ?? projection.createdAt,
    lastUpdatedAt: projection.lastHeartbeatAt ?? projection.completedAt ?? projection.startedAt ?? projection.createdAt,
    scanFrom: projection.scanFrom === "eu_de" || projection.scanFrom === "eu_ie" || projection.scanFrom === "california"
      ? projection.scanFrom
      : undefined,
    score,
    scoreStatus: terminal && projection.reportReady ? "final" as const : "provisional" as const,
    scoreVersion: score === null ? null : projection.scoreVersion ?? null,
    scoreUpdatedAt: score === null ? null : projection.scoreUpdatedAt ?? projection.completedAt,
    riskLevel: score === null
      ? null
      : score < 40
        ? "significant_review_recommended"
        : score < 85
          ? "review_recommended"
          : "monitor",
    coverage: noGoProjection
      ? {
          status: noGoProjection.noGo.limitationKind,
          summary: noGoProjection.noGo.summary,
          limitations: [noGoProjection.noGo.explanation],
        }
      : {
          status: pagesScanned >= pagesRequested && projection.status === "completed" ? "complete" : "partial",
          summary: pagesScanned > 0
            ? "Automated public-web scan completed for the observed public surfaces."
            : "Coverage was limited; absence of findings should not be interpreted as absence of risk.",
          limitations: ["Automated public-web scan only."],
        },
    retryAfterSeconds: terminal ? null : undefined,
  };
}
