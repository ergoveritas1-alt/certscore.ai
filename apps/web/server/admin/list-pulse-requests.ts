"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import {
  formatScanFromLabel,
  normalizeScanFrom,
  SCAN_NO_GO_SNAPSHOT_OUTCOMES
} from "@website-signal-risk-scanner/shared";
import { adminApiRouteSql, classifyAdminApiRoute, type AdminApiRoute } from "../../lib/admin/api-route";
import { requesterIpAttributionFromContext, type RequesterIpAttributionSource } from "../../lib/admin/requester-ip-attribution";
import { inferPrimaryLanguage, type PrimaryLanguageConfidence, type PrimaryLanguageSource } from "../../lib/scans/primary-language";
import { ensurePulseTables } from "../pulse/schema";
import { adminNoGoSql, projectAdminNoGo, type AdminNoGoProjection } from "./admin-no-go";
import { loadAdminScanFilterOptions } from "./repository";
import { normalizeAdminActivityFilter, parseAdminActivitySearch } from "../../lib/admin/activity-search";
import { requirePlatformAdminContext } from "./platform-admin";
import { trancoRankFromScanConfig } from "../scans/tranco-rank-metadata";
import { selectConfiguredCustomerGdprEprivacyScore } from "../scans/customer-score-cutover-server";
import { loadLatestVersionedScoreAssessments } from "../scans/score-assessment-repository";

export type AdminPulseRequestStatus =
  | "queued"
  | "running"
  | "finalizing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "expired"
  | "rate_limited"
  | "no_go";

export type AdminPulseRequestListItem = {
  adminSummaryGeneratedAt: string | null;
  accessPostureClass: string | null;
  apiRoute: AdminApiRoute;
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  noGoFlag: boolean;
  noGoReason: string | null;
  noGoSource: AdminNoGoProjection["source"];
  cmpVendorName: string | null;
  completedAt: string | null;
  createdAt: string;
  detail: string | null;
  elapsedSeconds: number | null;
  feedbackCount: number;
  format: string | null;
  freshRescanRequested: boolean | null;
  freshness: string | null;
  jobId: string;
  normalizedDomain: string | null;
  industry: string | null;
  publicId: string;
  requestedAt: string;
  requestedUrl: string | null;
  primaryLanguage: string | null;
  primaryLanguageConfidence: PrimaryLanguageConfidence | null;
  primaryLanguageSource: PrimaryLanguageSource | null;
  privacyPolicyPresent: boolean | null;
  resolutionMode: string | null;
  resultPulseUrl: string | null;
  resultReportUrl: string | null;
  scanId: string | null;
  scanOutcome: string | null;
  trancoRank: number | null;
  score: number | null;
  scanFromLabel: string;
  scanFromValue: string;
  requestChannel: string | null;
  requestedByAnonymous: boolean | null;
  requesterName: string | null;
  sourceIp: string | null;
  sourceIpHash: string | null;
  sourceIpSource: RequesterIpAttributionSource;
  status: string;
  snapshotFindingCount: number | null;
  snapshotTotalSignals: number | null;
  summaryJsonDownloads: number;
  evidenceJsonDownloads: number;
  topFindingIds: string[];
  topFindingCount: number | null;
};

export type AdminPulseRequestDetail = AdminPulseRequestListItem & {
  apiVersion: string;
  errorCode: string | null;
  errorMessage: string | null;
  normalizedUrl: string | null;
  phase: string | null;
  projectionVersion: string;
  pulseVersion: string;
  requestChannel: string;
  requestContext: Record<string, unknown>;
  requestedByAnonymous: boolean | null;
  requestedBy: Record<string, unknown>;
  requestType: string;
  responseSummary: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
  schemaVersion: string;
  throttleReason: string | null;
  updatedAt: string;
  feedback: AdminPulseFeedbackItem[];
  artifactDownloads: AdminPulseArtifactDownloadItem[];
};

export type AdminPulseFeedbackItem = {
  comment: string | null;
  createdAt: string;
  email: string | null;
  id: string;
  ipHash: string | null;
  rating: string;
  reason: string | null;
  userAgent: string | null;
};

export type AdminPulseArtifactDownloadItem = {
  artifactType: string;
  byteSize: number | null;
  cachedOrReused: boolean | null;
  createdAt: string;
  id: string;
  requestChannel: string | null;
  requestSource: string | null;
  resolutionMode: string | null;
  responseStatus: number;
  routeName: string | null;
};

export type AdminPulseOverviewCounts = {
  completed: number;
  evidenceJsonDownloads: number;
  feedback: number;
  queuedOrRunning: number;
  rateLimited: number;
  summaryJsonDownloads: number;
  total: number;
};

const LOGICAL_PULSE_ACTIVITY_PREDICATE = `not (
  pr.request_context ->> 'mode' = 'scanId'
  and coalesce(pr.request_context ->> 'source', pr.request_channel) in ('sdk', 'mcp')
  and exists (
    select 1
      from pulse_requests parent
     where parent.scan_id = pr.scan_id
       and parent.public_id <> pr.public_id
       and parent.request_context ->> 'mode' = 'url'
       and parent.request_channel = pr.request_channel
       and parent.requested_by = pr.requested_by
       and coalesce(parent.request_context ->> 'detail', '') = coalesce(pr.request_context ->> 'detail', '')
       and coalesce(parent.request_context ->> 'format', '') = coalesce(pr.request_context ->> 'format', '')
       and parent.requested_at between pr.requested_at - interval '20 minutes' and pr.requested_at
  )
)`;

const PULSE_NO_GO_SQL = adminNoGoSql({
  accessPosture: "ss.access_posture_class",
  blockedFlag: "ss.blocked_flag",
  captchaFlag: "ss.captcha_flag",
  responseSummary: "pr.response_summary",
  runtimeArtifacts: "sra",
  snapshotRuntimeAssessment: "ss.scan_no_go_assessment",
  snapshotOutcome: "ss.scan_outcome",
  snapshotVisualAccessReview: "ss.visual_access_review",
  outcomesParameter: "$12"
});

const PULSE_API_ROUTE_SQL = adminApiRouteSql({
  requestChannel: "pr.request_channel",
  requestSource: "coalesce(pr.request_context ->> 'source', pr.request_context ->> 'channel')"
});

const PULSE_EFFECTIVE_STATUS_SQL = `case
  when s.status in ('completed', 'failed') and pr.status in ('queued', 'running', 'finalizing') then s.status
  else pr.status
end`;

const PULSE_ACTIVITY_FILTER_SQL = `
  where ${LOGICAL_PULSE_ACTIVITY_PREDICATE}
    and ($1::text is null or ($1 = 'no_go' and ${PULSE_NO_GO_SQL}) or ($1 <> 'no_go' and ${PULSE_EFFECTIVE_STATUS_SQL} = $1))
    and (
      $2::text is null
      or pr.public_id ilike '%' || $2 || '%'
      or pr.job_id ilike '%' || $2 || '%'
      or coalesce(pr.request_context ->> 'requestId', '') ilike '%' || $2 || '%'
      or pr.normalized_domain ilike '%' || $2 || '%'
      or pr.requested_url ilike '%' || $2 || '%'
      or pr.scan_id::text ilike '%' || $2 || '%'
      or coalesce(app_user.email, auth_user.email, api_key.created_by, '') ilike '%' || $2 || '%'
      or coalesce(pr.request_channel, '') ilike '%' || $2 || '%'
      or pr.requested_by::text ilike '%' || $2 || '%'
      or coalesce(pr.request_context ->> 'sourceIp', '') ilike '%' || $2 || '%'
      or coalesce(pr.request_context ->> 'originIp', '') ilike '%' || $2 || '%'
      or coalesce(pr.request_context ->> 'ipHash', '') ilike '%' || $2 || '%'
      or coalesce(pr.request_context -> 'provenance' ->> 'sourceIp', '') ilike '%' || $2 || '%'
      or coalesce(pr.request_context -> 'provenance' ->> 'originIp', '') ilike '%' || $2 || '%'
      or coalesce(pr.request_context -> 'provenance' ->> 'ipHash', '') ilike '%' || $2 || '%'
    )
    and ($3::text is null or (case when coalesce(pr.request_context ->> 'forceNewScan', pr.request_context ->> 'bypassRecentScanReuse') = 'true' then 'forced_fresh' when pr.resolution_mode = 'reused_existing_scan' then 'reused' else 'fresh' end) = $3)
    and ($4::text is null or nullif(trim(ss.site_language_primary), '') = $4)
    and ($5::text is null or ss.admin_industry_label = $5)
    and ($6::text is null or coalesce(pr.request_context ->> 'scanFrom', s.scan_config_json ->> 'scanFrom', 'default') = $6)
    and ($7::timestamptz is null or pr.requested_at >= $7::timestamptz)
    and ($8::text is null or (case when coalesce(ss.captcha_flag, false) then 'captcha' when coalesce(ss.blocked_flag, false) or ss.access_posture_class = 'early_loss' then 'blocked' when ss.access_posture_class = 'robots_limited' then 'robots_limited' when ss.access_posture_class = 'degraded_but_useful' then 'limited' when ss.scan_id is not null then 'clear' else 'unknown' end) = $8)
    and ($9::text is null or ss.scan_outcome = $9)
    and ($13::text[] is null or not (
      concat_ws(' ', coalesce(app_user.email, auth_user.email, api_key.created_by, ''), pr.requested_by::text) ilike any($13::text[])
    ))
    and ($14::text is null or ${PULSE_API_ROUTE_SQL} = $14)
    and ($15::text[] is null or not (concat_ws(' ', pr.normalized_domain, pr.requested_url, domain.hostname) ilike any($15::text[])))
    and ($16::text[] is null or not (concat_ws(' ', pr.scan_id::text, pr.public_id, pr.job_id, pr.request_context ->> 'requestId') ilike any($16::text[])))
    and ($17::text[] is null or not (coalesce(app_user.email, auth_user.email, api_key.created_by, '') ilike any($17::text[])))
    and ($18::text[] is null or not (
      concat_ws(' ',
        pr.request_context ->> 'sourceIp', pr.request_context ->> 'originIp', pr.request_context ->> 'ipHash',
        pr.request_context -> 'provenance' ->> 'sourceIp', pr.request_context -> 'provenance' ->> 'originIp',
        pr.request_context -> 'provenance' ->> 'ipHash', pr.requested_by ->> 'sourceIp', pr.requested_by ->> 'ipHash'
      ) ilike any($18::text[])
    ))`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function timestampString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && value.trim() ? value : null;
}

function getRequestContextString(value: unknown, key: string) {
  const record = asRecord(value);
  const nested = record[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested.trim() : null;
}

function getRequestContextBoolean(value: unknown, key: string) {
  const record = asRecord(value);
  const nested = record[key];
  if (typeof nested === "boolean") {
    return nested;
  }
  if (typeof nested === "string") {
    const normalized = nested.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

function getFreshRescanRequested(requestContext: Record<string, unknown>) {
  return getRequestContextBoolean(requestContext, "bypassRecentScanReuse") ?? getRequestContextBoolean(requestContext, "forceNewScan");
}

function mapPulseRequestRow(row: Record<string, unknown>): AdminPulseRequestListItem {
  const requestContext = asRecord(row.request_context);
  const requestedBy = asRecord(row.requested_by);
  const responseSummary = asRecord(row.response_summary);
  const scanId = typeof row.scan_id === "string" ? row.scan_id : null;
  const storedTopFindingIds = asStringArray(responseSummary.topFindingIds);
  const scanFromValue = normalizeScanFrom(requestContext.scanFrom ?? asRecord(row.scan_config_json).scanFrom);
  const retainedScore =
    typeof responseSummary.score === "number"
      ? responseSummary.score
      : typeof row.snapshot_score === "number" ? row.snapshot_score : null;
  const primaryLanguage = inferPrimaryLanguage({
    declaredLanguages: [
      typeof row.page_language === "string" ? row.page_language : null,
      ...asStringArray(row.page_languages)
    ],
    persistedPrimaryLanguages: [typeof row.site_language_primary === "string" ? row.site_language_primary : null],
    matchedLocales: [typeof row.site_language_primary === "string" ? row.site_language_primary : null],
    urls: [
      typeof row.normalized_domain === "string" ? row.normalized_domain : null,
      typeof row.scan_domain_hostname === "string" ? row.scan_domain_hostname : null,
      typeof row.requested_url === "string" ? row.requested_url : null
    ]
  });
  const requesterIpAttribution = requesterIpAttributionFromContext(requestContext);
  const noGo = projectAdminNoGo({
    accessPostureClass: typeof row.access_posture_class === "string" ? row.access_posture_class : null,
    blockedFlag: typeof row.blocked_flag === "boolean" ? row.blocked_flag : null,
    captchaFlag: typeof row.captcha_flag === "boolean" ? row.captcha_flag : null,
    responseDisposition: typeof responseSummary.resultDisposition === "string" ? responseSummary.resultDisposition : null,
    runtimeAssessment: asRecord(row.scan_no_go_assessment),
    snapshotOutcome: typeof row.scan_outcome === "string" ? row.scan_outcome : null,
    visualAccessReview: asRecord(row.visual_access_review),
    snapshotRuntimeAssessment: asRecord(row.scan_no_go_assessment),
    snapshotVisualAccessReview: asRecord(row.visual_access_review)
  });
  const score = noGo.isNoGo ? null : retainedScore;
  return {
    adminSummaryGeneratedAt: timestampString(row.admin_summary_generated_at),
    accessPostureClass: typeof row.access_posture_class === "string" ? row.access_posture_class : null,
    apiRoute: classifyAdminApiRoute({
      requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
      requestSource: getRequestContextString(requestContext, "source") ?? getRequestContextString(requestContext, "channel")
    }),
    completedAt: timestampString(row.completed_at) ?? timestampString(row.scan_completed_at),
    blockedFlag: typeof row.blocked_flag === "boolean" ? row.blocked_flag : null,
    captchaFlag: typeof row.captcha_flag === "boolean" ? row.captcha_flag : null,
    noGoFlag: noGo.isNoGo,
    noGoReason: noGo.reason,
    noGoSource: noGo.source,
    cmpVendorName: noGo.isNoGo ? null : typeof row.cmp_vendor_name === "string" ? row.cmp_vendor_name : null,
    createdAt: timestampString(row.created_at) ?? String(row.created_at),
    detail: getRequestContextString(requestContext, "detail"),
    elapsedSeconds:
      typeof row.elapsed_seconds === "number"
        ? row.elapsed_seconds
        : typeof row.scan_elapsed_seconds === "number"
          ? row.scan_elapsed_seconds
          : null,
    feedbackCount: typeof row.feedback_count === "number" ? row.feedback_count : 0,
    format: getRequestContextString(requestContext, "format"),
    freshRescanRequested: getFreshRescanRequested(requestContext),
    freshness: getRequestContextString(requestContext, "freshness"),
    jobId: String(row.job_id),
    industry: typeof row.admin_industry_label === "string" ? row.admin_industry_label : null,
    normalizedDomain:
      typeof row.normalized_domain === "string"
        ? row.normalized_domain
        : typeof row.scan_domain_hostname === "string"
          ? row.scan_domain_hostname
          : null,
    publicId: String(row.public_id),
    requestedAt: timestampString(row.requested_at) ?? String(row.requested_at),
    requestedUrl: typeof row.requested_url === "string" ? row.requested_url : null,
    primaryLanguage: primaryLanguage?.locale ?? null,
    primaryLanguageConfidence: primaryLanguage?.confidence ?? null,
    primaryLanguageSource: primaryLanguage?.source ?? null,
    privacyPolicyPresent: noGo.isNoGo
      ? null
      : typeof row.privacy_policy_present === "boolean" ? row.privacy_policy_present : null,
    resolutionMode: typeof row.resolution_mode === "string" ? row.resolution_mode : null,
    resultPulseUrl: typeof row.result_pulse_url === "string" ? row.result_pulse_url : null,
    resultReportUrl: typeof row.result_report_url === "string" ? row.result_report_url : null,
    scanId,
    scanOutcome: typeof row.scan_outcome === "string" ? row.scan_outcome : null,
    trancoRank:
      typeof row.tranco_rank === "number"
        ? row.tranco_rank
        : trancoRankFromScanConfig(
            row.scan_config_json && typeof row.scan_config_json === "object" && !Array.isArray(row.scan_config_json)
              ? row.scan_config_json as Record<string, unknown>
              : null
          ),
    score,
    scanFromLabel: formatScanFromLabel(scanFromValue),
    scanFromValue,
    requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
    requestedByAnonymous: typeof requestedBy.anonymous === "boolean" ? requestedBy.anonymous : null,
    requesterName: typeof row.requester_name === "string" ? row.requester_name : null,
    sourceIp: requesterIpAttribution.sourceIp,
    sourceIpHash: requesterIpAttribution.ipHash,
    sourceIpSource: requesterIpAttribution.source,
    status:
      ["completed", "completed_limited", "failed"].includes(String(row.scan_status)) &&
      ["queued", "running", "finalizing"].includes(String(row.status))
        ? String(row.scan_status)
        : String(row.status),
    snapshotFindingCount: noGo.isNoGo ? null : typeof row.snapshot_finding_count === "number" ? row.snapshot_finding_count : null,
    snapshotTotalSignals: noGo.isNoGo ? null : typeof row.snapshot_total_signals === "number" ? row.snapshot_total_signals : null,
    summaryJsonDownloads: typeof row.summary_json_downloads === "number" ? row.summary_json_downloads : 0,
    evidenceJsonDownloads: typeof row.evidence_json_downloads === "number" ? row.evidence_json_downloads : 0,
    topFindingIds: storedTopFindingIds,
    topFindingCount:
      score === null
        ? null
        : typeof row.top_finding_count === "number"
        ? row.top_finding_count
        : storedTopFindingIds.length > 0
          ? storedTopFindingIds.length
          : null
  };
}

async function applyConfiguredScores(items: AdminPulseRequestListItem[]) {
  const scanIds = [...new Set(items.flatMap((item) => item.scanId ? [item.scanId] : []))];
  if (scanIds.length === 0) return items;
  const [legacyScores, postureScores] = await Promise.all([
    loadLatestVersionedScoreAssessments({ scanIds, scoreKind: "gdpr_eprivacy_evidence" }),
    loadLatestVersionedScoreAssessments({ scanIds, scoreKind: "gdpr_eprivacy_posture" })
  ]);
  return items.map((item) => {
    if (!item.scanId) return item;
    if (item.noGoFlag) {
      return { ...item, score: null, topFindingCount: null };
    }
    const selection = selectConfiguredCustomerGdprEprivacyScore({
      candidateAssessment: postureScores.get(item.scanId) ?? null,
      legacyAssessment: legacyScores.get(item.scanId) ?? null
    });
    if (!selection.assessment) return item;
    return {
      ...item,
      score: selection.assessment.scoreValue,
      topFindingCount: selection.assessment.scoreValue === null ? null : item.topFindingCount
    };
  });
}

function buildDisplayResponseSummary(input: {
  base: AdminPulseRequestListItem;
  raw: unknown;
}) {
  const responseSummary = input.raw ? asRecord(input.raw) : null;
  if (!responseSummary) {
    return null;
  }

  return {
    ...responseSummary,
    topFindingIds: input.base.topFindingIds,
    topFindingCount: input.base.topFindingCount,
    findingCount: input.base.snapshotFindingCount,
    scanId: input.base.scanId,
    totalSignals: input.base.snapshotTotalSignals
  };
}

export async function getAdminPulseOverviewCounts(): Promise<AdminPulseOverviewCounts> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const result = await queryOne<{
    completed: number;
    evidence_json_downloads: number;
    feedback: number;
    queued_or_running: number;
    rate_limited: number;
    summary_json_downloads: number;
    total: number;
  }>(
    `with logical_pulse_requests as (
       select pr.*, ${PULSE_EFFECTIVE_STATUS_SQL} as effective_status
         from pulse_requests pr
         left join scans s on s.id = pr.scan_id
        where ${LOGICAL_PULSE_ACTIVITY_PREDICATE}
     )
     select
       count(*)::int as total,
       count(*) filter (where effective_status in ('completed', 'completed_limited'))::int as completed,
       count(*) filter (where effective_status in ('queued', 'running', 'finalizing'))::int as queued_or_running,
       count(*) filter (where effective_status = 'rate_limited')::int as rate_limited,
       (select count(*)::int from pulse_feedback)::int as feedback,
       (select count(*)::int from pulse_artifact_downloads where artifact_type = 'summary_json')::int as summary_json_downloads,
       (select count(*)::int from pulse_artifact_downloads where artifact_type = 'evidence_json')::int as evidence_json_downloads
     from logical_pulse_requests`,
    [],
    { readOnly: true }
  );

  return {
    completed: result?.completed ?? 0,
    evidenceJsonDownloads: result?.evidence_json_downloads ?? 0,
    feedback: result?.feedback ?? 0,
    queuedOrRunning: result?.queued_or_running ?? 0,
    rateLimited: result?.rate_limited ?? 0,
    summaryJsonDownloads: result?.summary_json_downloads ?? 0,
    total: result?.total ?? 0
  };
}

export async function listAdminPulseRequests(input: {
  limit?: number;
  offset?: number;
  query?: string | null;
  status?: AdminPulseRequestStatus | null;
  freshness?: string | null;
  language?: string | null;
  industry?: string | null;
  scanFrom?: string | null;
  timeSpan?: "all" | "4h" | "12h" | "24h" | "7d" | "31d";
  access?: string | null;
  outcome?: string | null;
  route?: AdminApiRoute | null;
} = {}): Promise<AdminPulseRequestListItem[]> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const limit = Math.max(1, Math.min(100, input.limit ?? 20));
  const offset = Math.max(0, input.offset ?? 0);
  const parsedSearch = parseAdminActivitySearch(input.query);
  const search = parsedSearch.query;
  const exclusionArray = (values: string[]) => values.length > 0 ? values : null;
  const freshness = normalizeAdminActivityFilter(input.freshness, ["any"]);
  const language = normalizeAdminActivityFilter(input.language);
  const industry = normalizeAdminActivityFilter(input.industry);
  const scanFrom = normalizeAdminActivityFilter(input.scanFrom, ["any"]);
  const access = normalizeAdminActivityFilter(input.access, ["any"]);
  const outcome = normalizeAdminActivityFilter(input.outcome);
  const route = input.route ?? null;
  const timeSpanHours = input.timeSpan === "4h" ? 4 : input.timeSpan === "12h" ? 12 : input.timeSpan === "24h" ? 24 : input.timeSpan === "7d" ? 168 : input.timeSpan === "31d" ? 744 : null;
  const since = timeSpanHours === null ? null : new Date(Date.now() - timeSpanHours * 60 * 60 * 1000).toISOString();
  const rows = await query<Record<string, unknown>>(
    `select pr.public_id,
            pr.job_id,
            pr.requested_url,
            pr.normalized_domain,
            pr.requested_at,
            pr.request_context,
            pr.request_channel,
            pr.requested_by,
            pr.status,
            pr.scan_id::text as scan_id,
            pr.result_pulse_url,
            pr.result_report_url,
            pr.resolution_mode,
            pr.response_summary,
            pr.completed_at,
            pr.elapsed_seconds,
            pr.created_at,
            coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_name,
            s.status as scan_status,
            s.completed_at as scan_completed_at,
            case
              when s.completed_at is not null and s.started_at is not null
              then extract(epoch from (s.completed_at - s.started_at))::float8
              else null
            end as scan_elapsed_seconds,
            domain.hostname as scan_domain_hostname,
            ss.total_signals::int as snapshot_total_signals,
            ss.report_finding_count::int as snapshot_finding_count,
            ss.admin_summary_generated_at,
            ss.certscore_overall::int as snapshot_score,
            ss.top_finding_count::int as top_finding_count,
            ss.privacy_policy_present,
            ss.cmp_vendor_name,
            ss.access_posture_class,
            ss.blocked_flag,
            ss.captcha_flag,
              ss.scan_outcome,
              ss.tranco_rank,
            coalesce(sra.scan_no_go_assessment, ss.scan_no_go_assessment) as scan_no_go_assessment,
            coalesce(sra.visual_access_review, ss.visual_access_review) as visual_access_review,
            ss.site_language_primary,
            (select sp.page_language from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc limit 1) as page_language,
            (select array_agg(sp.page_language order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc) from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null) as page_languages,
            ss.admin_industry_label,
            s.scan_config_json,
            coalesce(pf.feedback_count, 0)::int as feedback_count,
            coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
            coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
       from pulse_requests pr
       left join scan_snapshots ss on ss.scan_id = pr.scan_id
       left join scan_runtime_artifacts sra on sra.scan_id = pr.scan_id
       left join scans s on s.id = pr.scan_id
       left join domains domain on domain.id = s.domain_id
       left join users app_user on app_user.id::text = pr.requested_by ->> 'userId'
       left join better_auth_users auth_user on auth_user.id = pr.requested_by ->> 'userId'
       left join integration_api_keys api_key on api_key.public_id = pr.requested_by ->> 'apiKeyId'
       left join lateral (
         select count(*)::int as feedback_count
           from pulse_feedback
          where pulse_request_id = pr.public_id
       ) pf on true
       left join lateral (
         select
           count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
           count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
          from pulse_artifact_downloads
         where pulse_request_id = pr.public_id
       ) pad on true
      ${PULSE_ACTIVITY_FILTER_SQL}
      order by pr.requested_at desc
      limit $10 offset $11`,
    [
      input.status ?? null, search, freshness, language, industry, scanFrom, since, access, outcome,
      limit, offset, SCAN_NO_GO_SNAPSHOT_OUTCOMES, exclusionArray(parsedSearch.exclusions.requester), route,
      exclusionArray(parsedSearch.exclusions.domain), exclusionArray(parsedSearch.exclusions.scanId),
      exclusionArray(parsedSearch.exclusions.email), exclusionArray(parsedSearch.exclusions.ip)
    ],
    { readOnly: true }
  );

  return applyConfiguredScores(rows.rows.map((row) => mapPulseRequestRow(row)));
}

export async function countAdminPulseRequests(input: {
  query?: string | null;
  status?: AdminPulseRequestStatus | null;
  freshness?: string | null;
  language?: string | null;
  industry?: string | null;
  scanFrom?: string | null;
  timeSpan?: "all" | "4h" | "12h" | "24h" | "7d" | "31d";
  access?: string | null;
  outcome?: string | null;
  route?: AdminApiRoute | null;
} = {}): Promise<number> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const result = await queryOne<{ total_count: number }>(
    `select count(*)::int as total_count, max($10::int) as requested_limit, max($11::int) as requested_offset
       from pulse_requests pr
       left join scan_snapshots ss on ss.scan_id = pr.scan_id
       left join scan_runtime_artifacts sra on sra.scan_id = pr.scan_id
       left join scans s on s.id = pr.scan_id
       left join domains domain on domain.id = s.domain_id
       left join users app_user on app_user.id::text = pr.requested_by ->> 'userId'
       left join better_auth_users auth_user on auth_user.id = pr.requested_by ->> 'userId'
       left join integration_api_keys api_key on api_key.public_id = pr.requested_by ->> 'apiKeyId'
       ${PULSE_ACTIVITY_FILTER_SQL}`,
    (() => {
      const parsedSearch = parseAdminActivitySearch(input.query);
      const exclusionArray = (values: string[]) => values.length > 0 ? values : null;
      return [
        input.status ?? null, parsedSearch.query, normalizeAdminActivityFilter(input.freshness, ["any"]),
        normalizeAdminActivityFilter(input.language), normalizeAdminActivityFilter(input.industry),
        normalizeAdminActivityFilter(input.scanFrom, ["any"]),
        input.timeSpan && input.timeSpan !== "all" ? new Date(Date.now() - (input.timeSpan === "4h" ? 4 : input.timeSpan === "12h" ? 12 : input.timeSpan === "24h" ? 24 : input.timeSpan === "7d" ? 168 : 744) * 60 * 60 * 1000).toISOString() : null,
        normalizeAdminActivityFilter(input.access, ["any"]), normalizeAdminActivityFilter(input.outcome),
        0, 0, SCAN_NO_GO_SNAPSHOT_OUTCOMES, exclusionArray(parsedSearch.exclusions.requester), input.route ?? null,
        exclusionArray(parsedSearch.exclusions.domain), exclusionArray(parsedSearch.exclusions.scanId),
        exclusionArray(parsedSearch.exclusions.email), exclusionArray(parsedSearch.exclusions.ip)
      ];
    })(),
    { readOnly: true }
  );
  return result?.total_count ?? 0;
}

export async function getAdminPulseFilterOptions() {
  await requirePlatformAdminContext();
  return loadAdminScanFilterOptions();
}

export async function getAdminPulseRequestDetail(pulseRequestId: string): Promise<AdminPulseRequestDetail | null> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const [request, feedbackRows, artifactDownloadRows] = await Promise.all([
    queryOne<Record<string, unknown>>(
      `select pr.public_id,
              pr.job_id,
              pr.request_type,
              pr.request_channel,
              pr.requested_url,
              pr.normalized_url,
              pr.normalized_domain,
              pr.requested_at,
              pr.requested_by,
              pr.request_context,
              pr.status,
              pr.phase,
              pr.scan_id::text as scan_id,
              pr.result_pulse_url,
              pr.result_report_url,
              pr.api_version,
              pr.schema_version,
              pr.pulse_version,
              pr.projection_version,
              pr.resolution_mode,
              pr.throttle_reason,
              pr.retry_after_seconds,
              pr.response_summary,
              pr.error_code,
              pr.error_message,
              pr.completed_at,
              pr.elapsed_seconds,
              pr.created_at,
              pr.updated_at,
              coalesce(app_user.email, auth_user.email, api_key.created_by) as requester_name,
              s.status as scan_status,
              s.completed_at as scan_completed_at,
              case
                when s.completed_at is not null and s.started_at is not null
                then extract(epoch from (s.completed_at - s.started_at))::float8
                else null
              end as scan_elapsed_seconds,
              domain.hostname as scan_domain_hostname,
              ss.total_signals::int as snapshot_total_signals,
              ss.report_finding_count::int as snapshot_finding_count,
              ss.admin_summary_generated_at,
              ss.certscore_overall::int as snapshot_score,
              ss.top_finding_count::int as top_finding_count,
              ss.privacy_policy_present,
              ss.cmp_vendor_name,
              ss.access_posture_class,
              ss.blocked_flag,
              ss.captcha_flag,
            ss.scan_outcome,
            ss.tranco_rank,
              coalesce(sra.scan_no_go_assessment, ss.scan_no_go_assessment) as scan_no_go_assessment,
              coalesce(sra.visual_access_review, ss.visual_access_review) as visual_access_review,
              ss.site_language_primary,
              (select sp.page_language from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc limit 1) as page_language,
              (select array_agg(sp.page_language order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc) from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null) as page_languages,
              ss.admin_industry_label,
              s.scan_config_json,
              coalesce(pf.feedback_count, 0)::int as feedback_count,
              coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
              coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
         from pulse_requests pr
         left join scans s on s.id = pr.scan_id
         left join domains domain on domain.id = s.domain_id
         left join scan_snapshots ss on ss.scan_id = pr.scan_id
         left join scan_runtime_artifacts sra on sra.scan_id = pr.scan_id
         left join users app_user on app_user.id::text = pr.requested_by ->> 'userId'
         left join better_auth_users auth_user on auth_user.id = pr.requested_by ->> 'userId'
         left join integration_api_keys api_key on api_key.public_id = pr.requested_by ->> 'apiKeyId'
         left join lateral (
           select count(*)::int as feedback_count
             from pulse_feedback
            where pulse_request_id = pr.public_id
         ) pf on true
         left join lateral (
           select
             count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
             count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
            from pulse_artifact_downloads
           where pulse_request_id = pr.public_id
         ) pad on true
        where pr.public_id = $1 or pr.job_id = $1
        limit 1`,
      [pulseRequestId],
      { readOnly: true }
    ),
    query<Record<string, unknown>>(
      `select id::text,
              rating,
              reason,
              comment,
              email,
              ip_hash,
              user_agent,
              created_at
         from pulse_feedback
        where pulse_request_id = $1
        order by created_at desc
        limit 100`,
      [pulseRequestId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select id::text,
              artifact_type,
              route_name,
              request_source,
              request_channel,
              response_status,
              byte_size,
              resolution_mode,
              cached_or_reused,
              created_at
         from pulse_artifact_downloads
        where pulse_request_id = $1
        order by created_at desc
        limit 100`,
      [pulseRequestId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  if (!request) {
    return null;
  }

  const [base] = await applyConfiguredScores([mapPulseRequestRow(request)]);
  if (!base) return null;
  return {
    ...base,
    apiVersion: String(request.api_version),
    errorCode: typeof request.error_code === "string" ? request.error_code : null,
    errorMessage: typeof request.error_message === "string" ? request.error_message : null,
    normalizedUrl: typeof request.normalized_url === "string" ? request.normalized_url : null,
    phase:
      ["completed", "completed_limited", "failed", "expired", "rate_limited"].includes(base.status)
        ? base.status
        : typeof request.phase === "string"
          ? request.phase
          : null,
    projectionVersion: String(request.projection_version),
    pulseVersion: String(request.pulse_version),
    requestChannel: String(request.request_channel),
    requestContext: asRecord(request.request_context),
    requestedByAnonymous: typeof asRecord(request.requested_by).anonymous === "boolean" ? (asRecord(request.requested_by).anonymous as boolean) : null,
    requestedBy: asRecord(request.requested_by),
    requestType: String(request.request_type),
    responseSummary: buildDisplayResponseSummary({ base, raw: request.response_summary }),
    retryAfterSeconds: typeof request.retry_after_seconds === "number" ? request.retry_after_seconds : null,
    schemaVersion: String(request.schema_version),
    throttleReason: typeof request.throttle_reason === "string" ? request.throttle_reason : null,
    updatedAt: timestampString(request.updated_at) ?? String(request.updated_at),
    feedback: feedbackRows.map((row) => ({
      comment: typeof row.comment === "string" ? row.comment : null,
      createdAt: timestampString(row.created_at) ?? String(row.created_at),
      email: typeof row.email === "string" ? row.email : null,
      id: String(row.id),
      ipHash: typeof row.ip_hash === "string" ? row.ip_hash : null,
      rating: String(row.rating),
      reason: typeof row.reason === "string" ? row.reason : null,
      userAgent: typeof row.user_agent === "string" ? row.user_agent : null
    })),
    artifactDownloads: artifactDownloadRows.map((row) => ({
      artifactType: String(row.artifact_type),
      byteSize: typeof row.byte_size === "number" ? row.byte_size : null,
      cachedOrReused: typeof row.cached_or_reused === "boolean" ? row.cached_or_reused : null,
      createdAt: timestampString(row.created_at) ?? String(row.created_at),
      id: String(row.id),
      requestChannel: typeof row.request_channel === "string" ? row.request_channel : null,
      requestSource: typeof row.request_source === "string" ? row.request_source : null,
      resolutionMode: typeof row.resolution_mode === "string" ? row.resolution_mode : null,
      responseStatus: typeof row.response_status === "number" ? row.response_status : 0,
      routeName: typeof row.route_name === "string" ? row.route_name : null
    }))
  };
}

export async function listAdminPulseRequestsForScan(scanId: string): Promise<AdminPulseRequestListItem[]> {
  await requirePlatformAdminContext();
  await ensurePulseTables();
  const rows = await query<Record<string, unknown>>(
    `select pr.public_id,
            pr.job_id,
            pr.requested_url,
            pr.normalized_domain,
            pr.requested_at,
            pr.request_context,
            pr.status,
            pr.scan_id::text as scan_id,
            pr.result_pulse_url,
            pr.result_report_url,
            pr.resolution_mode,
            pr.response_summary,
            pr.completed_at,
            pr.elapsed_seconds,
            pr.created_at,
            s.scan_config_json,
            ss.certscore_overall::int as snapshot_score,
            ss.admin_summary_generated_at,
            ss.top_finding_count::int as top_finding_count,
            ss.privacy_policy_present,
            ss.cmp_vendor_name,
            ss.access_posture_class,
            ss.blocked_flag,
            ss.captcha_flag,
            ss.scan_outcome,
            ss.tranco_rank,
            coalesce(sra.scan_no_go_assessment, ss.scan_no_go_assessment) as scan_no_go_assessment,
            coalesce(sra.visual_access_review, ss.visual_access_review) as visual_access_review,
            ss.site_language_primary,
            (select sp.page_language from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc limit 1) as page_language,
            (select array_agg(sp.page_language order by case when sp.page_type = 'homepage' then 0 else 1 end, sp.page_url asc) from scan_pages sp where sp.scan_id = pr.scan_id and nullif(trim(sp.page_language), '') is not null) as page_languages,
            ss.admin_industry_label,
            coalesce(pf.feedback_count, 0)::int as feedback_count,
            coalesce(pad.summary_json_downloads, 0)::int as summary_json_downloads,
            coalesce(pad.evidence_json_downloads, 0)::int as evidence_json_downloads
       from pulse_requests pr
       left join scans s on s.id = pr.scan_id
       left join scan_snapshots ss on ss.scan_id = pr.scan_id
       left join scan_runtime_artifacts sra on sra.scan_id = pr.scan_id
       left join lateral (
         select count(*)::int as feedback_count
           from pulse_feedback
          where pulse_request_id = pr.public_id
       ) pf on true
       left join lateral (
         select
           count(*) filter (where artifact_type = 'summary_json')::int as summary_json_downloads,
           count(*) filter (where artifact_type = 'evidence_json')::int as evidence_json_downloads
          from pulse_artifact_downloads
         where pulse_request_id = pr.public_id
       ) pad on true
      where pr.scan_id = $1
      order by pr.requested_at desc
      limit 25`,
    [scanId],
    { readOnly: true }
  );

  return applyConfiguredScores(rows.rows.map((row) => mapPulseRequestRow(row)));
}
