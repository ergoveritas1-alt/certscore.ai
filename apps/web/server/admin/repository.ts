"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";

export type AdminScanQueryRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_requested?: number;
  pages_scanned: number;
  scan_config_json?: Record<string, unknown> | null;
  scan_type: string;
  status: string;
};

export type AdminScanDomainRow = {
  hostname: string;
  id?: string;
};

export type AdminScanOrganizationRow = {
  id?: string;
  name: string;
};

export type AdminScanSnapshotRow = {
  access_posture_class?: AccessPostureClass | null;
  asn?: number | null;
  block_vendor_guess?: string | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number;
  egress_id?: string | null;
  egress_type?: string | null;
  highest_successful_tier?: ScanExecutionTier | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status?: string | null;
  legal_coverage_score?: number | null;
  normalized_body_hash?: string | null;
  report_finding_count?: number | null;
  recoverable_finding_classes?: RecoverableFindingClass[] | null;
  robots_fetch_http_status: number | null;
  scan_id?: string;
  scan_outcome?: string | null;
  scan_timestamp?: string | null;
  stop_tier?: ScanExecutionTier | null;
  total_signals?: number;
  verified_public_surfaces_count?: number | null;
};

export type AdminValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
};

export type AdminScanDiagnosticEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string;
};

export type AdminPolicyEnrichmentRow = Record<string, unknown> & {
  scan_id?: string;
};

export type AdminValidationFindingSummaryRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
  validation_run_id: string;
  validation_verdicts:
    | {
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }
    | Array<{
        agreement_score: number | null;
        confidence: number | null;
        created_at: string | null;
        evidence_json: Record<string, unknown> | null;
        model: string | null;
        prompt_version: string | null;
        rationale: string | null;
        system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
        system_confidence_explanation: string | null;
        system_confidence_score: number | null;
        verdict: "supported" | "inconclusive" | "not_supported" | null;
      }>
    | null;
};

export type AdminValidationVerdictRow = {
  agreement_score: number | null;
  confidence: number | null;
  created_at: string | null;
  evidence_json: Record<string, unknown> | null;
  model: string | null;
  prompt_version: string | null;
  rationale: string | null;
  system_confidence_band: "very_high" | "high" | "moderate" | "low" | "very_low" | null;
  system_confidence_explanation: string | null;
  system_confidence_score: number | null;
  validation_run_finding_id: string;
  verdict: "supported" | "inconclusive" | "not_supported" | null;
};

export type AdminUserRow = {
  auth_provider: string;
  created_at: string;
  email: string;
  full_name: string | null;
  id: string;
  updated_at: string;
};

export type AdminMembershipRow = {
  created_at: string;
  organization_id: string;
  role: string;
  user_id: string;
};

export type AdminOrganizationSummaryRow = {
  id: string;
  name: string;
  plan: string | null;
  plan_status: string | null;
  slug: string;
};

export type AdminDomainSummaryRow = {
  id: string;
  organization_id: string | null;
};

export type AdminOrganizationScanSummaryRow = {
  completed_at: string | null;
  id: string;
  organization_id: string | null;
};

export type AdminPolicyReviewQueueRow = {
  assigned_to: string | null;
  created_at: string;
  id: string;
  policy_enrichment_id: string | null;
  reason: string | null;
  review_status: string | null;
  review_verdict: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  scan_id: string | null;
};

export type AdminScanOverviewCounts = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
  totalScans: number;
};

export type AdminBlockedRunTelemetryRow = {
  asn?: number | null;
  block_vendor_guess?: string | null;
  egress_id?: string | null;
  egress_type?: string | null;
  homepage_fetch_http_status: number | null;
  normalized_body_hash?: string | null;
  scan_id?: string;
  scan_outcome?: string | null;
  scan_timestamp?: string | null;
};

type QueryErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function isMissingTieredSnapshotColumn(error: { message?: string; code?: string } | null) {
  const message = `${error?.message ?? ""}`.toLowerCase();
  return (
    `${error?.code ?? ""}` === "42703" ||
    message.includes("access_posture_class") ||
    message.includes("highest_successful_tier") ||
    message.includes("stop_tier") ||
    message.includes("recoverable_finding_classes")
  );
}

export async function loadAdminScanListPageData(limit: number): Promise<{
  diagnosticEvents: AdminScanDiagnosticEventRow[];
  domains: AdminScanDomainRow[];
  organizations: AdminScanOrganizationRow[];
  policyEnrichmentRows: AdminPolicyEnrichmentRow[];
  resolvedSnapshots: AdminScanSnapshotRow[];
  scanRows: AdminScanQueryRow[];
  validationFindingRows: AdminValidationFindingSummaryRow[];
  validationRuns: AdminValidationRunSummaryRow[];
  verdictByFindingId: Map<string, AdminValidationVerdictRow>;
}> {
  const scansResult = await query<AdminScanQueryRow>(
    `select id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_scanned
       from scans
      order by created_at desc
      limit $1`,
    [limit],
    { readOnly: true }
  );

  const scanRows = scansResult.rows;
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const organizationIds = [...new Set(scanRows.flatMap((scan) => (scan.organization_id ? [scan.organization_id] : [])))];
  const scanIds = scanRows.map((scan) => scan.id);

  const [domainsResult, organizationsResult] = await Promise.all([
    domainIds.length
      ? query<AdminScanDomainRow>(
          `select id, hostname
             from domains
            where id = any($1::uuid[])`,
          [domainIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanDomainRow[] }),
    organizationIds.length
      ? query<AdminScanOrganizationRow>(
          `select id, name
             from organizations
            where id = any($1::uuid[])`,
          [organizationIds],
          { readOnly: true }
        )
      : Promise.resolve({ rows: [] as AdminScanOrganizationRow[] })
  ]);

  let resolvedSnapshots: AdminScanSnapshotRow[] = [];
  if (scanIds.length) {
    try {
      const snapshotsResult = await query<AdminScanSnapshotRow>(
        `select scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status,
                robots_fetch_http_status, blocked_flag, captcha_flag, access_posture_class,
                highest_successful_tier, stop_tier, recoverable_finding_classes
           from scan_snapshots
          where scan_id = any($1::uuid[])`,
        [scanIds],
        { readOnly: true }
      );
      resolvedSnapshots = snapshotsResult.rows;
    } catch (error) {
      if (isMissingTieredSnapshotColumn({ message: getErrorMessage(error) })) {
        const fallback = await query<AdminScanSnapshotRow>(
          `select scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status,
                  robots_fetch_http_status, blocked_flag, captcha_flag
             from scan_snapshots
            where scan_id = any($1::uuid[])`,
          [scanIds],
          { readOnly: true }
        );
        resolvedSnapshots = fallback.rows.map((row) => ({
          ...row,
          access_posture_class: null,
          highest_successful_tier: null,
          stop_tier: null,
          recoverable_finding_classes: []
        }));
      } else {
        throw new Error(`Failed to load scans: ${getErrorMessage(error)}`);
      }
    }
  }

  const validationRuns: AdminValidationRunSummaryRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const result = await query<AdminValidationRunSummaryRow>(
        `select id, scan_id, finding_count, created_at
           from validation_runs
          where scan_id = any($1::uuid[])
          order by created_at desc`,
        [scanIdBatch],
        { readOnly: true }
      );
      validationRuns.push(...result.rows);
    }
  }

  const diagnosticEvents: AdminScanDiagnosticEventRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const result = await query<AdminScanDiagnosticEventRow>(
        `select scan_id, event_type, message, metadata_json, created_at
           from scan_events
          where scan_id = any($1::uuid[])
          order by created_at asc`,
        [scanIdBatch],
        { readOnly: true }
      );
      diagnosticEvents.push(...result.rows);
    }
  }

  const policyEnrichmentRows: AdminPolicyEnrichmentRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const result = await query<AdminPolicyEnrichmentRow>(
        `select *
           from policy_enrichment
          where scan_id = any($1::uuid[])
          order by created_at asc`,
        [scanIdBatch],
        { readOnly: true }
      );
      policyEnrichmentRows.push(...result.rows);
    }
  }

  const latestValidationRunByScanId = new Map<string, string>();
  for (const validationRun of validationRuns) {
    if (!latestValidationRunByScanId.has(validationRun.scan_id)) {
      latestValidationRunByScanId.set(validationRun.scan_id, validationRun.id);
    }
  }

  const latestValidationRunIds = [
    ...new Set(
      [...latestValidationRunByScanId.values()].filter(
        (validationRunId): validationRunId is string =>
          typeof validationRunId === "string" && validationRunId.trim().length > 0
      )
    )
  ];

  const validationFindingRows: AdminValidationFindingSummaryRow[] = [];
  if (latestValidationRunIds.length) {
    for (const validationRunIdBatch of chunkValues(latestValidationRunIds, CHANGE_EVENT_BATCH_SIZE)) {
      const result = await query<AdminValidationFindingSummaryRow>(
        `select id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope,
                finding_subject, rule_key, title, description, severity, page_url, evidence_json
           from validation_run_findings
          where validation_run_id = any($1::uuid[])`,
        [validationRunIdBatch],
        { readOnly: true }
      );
      validationFindingRows.push(...result.rows);
    }
  }

  const validationFindingIds = validationFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, AdminValidationVerdictRow>();

  if (validationFindingIds.length) {
    for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
      const result = await query<AdminValidationVerdictRow>(
        `select validation_run_finding_id, verdict, confidence, rationale, agreement_score, model,
                prompt_version, evidence_json, created_at, system_confidence_score,
                system_confidence_band, system_confidence_explanation
           from validation_verdicts
          where validation_run_finding_id = any($1::uuid[])
          order by created_at desc`,
        [findingIdBatch],
        { readOnly: true }
      );

      for (const row of result.rows) {
        if (!verdictByFindingId.has(row.validation_run_finding_id)) {
          verdictByFindingId.set(row.validation_run_finding_id, row);
        }
      }
    }
  }

  return {
    diagnosticEvents,
    domains: domainsResult.rows,
    organizations: organizationsResult.rows,
    policyEnrichmentRows,
    resolvedSnapshots,
    scanRows,
    validationFindingRows,
    validationRuns,
    verdictByFindingId
  };
}

export async function loadAdminScanDetailData(scanId: string): Promise<{
  accessibilityRuleCounts: Array<Record<string, unknown>>;
  changes: Array<Record<string, unknown>>;
  domain: AdminScanDomainRow | null;
  organization: AdminScanOrganizationRow | null;
  pages: Array<Record<string, unknown>>;
  policyEnrichment: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  scan: AdminScanQueryRow | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
}> {
  const scan = await queryOne<AdminScanQueryRow>(
    `select id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_requested, pages_scanned, scan_config_json
       from scans
      where id = $1`,
    [scanId],
    { readOnly: true }
  );

  if (!scan) {
    return {
      accessibilityRuleCounts: [],
      changes: [],
      domain: null,
      organization: null,
      pages: [],
      policyEnrichment: [],
      policyReviewQueue: [],
      runtimeArtifacts: null,
      scan: null,
      snapshot: null,
      trackerVendors: []
    };
  }

  const [
    snapshot,
    trackerVendors,
    accessibilityRuleCounts,
    pages,
    changes,
    domain,
    organization,
    runtimeArtifacts,
    policyEnrichment,
    policyReviewQueue
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
    query<Record<string, unknown>>(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, before_consent, script_host, matched_signature_id
         from scan_tracker_vendors
        where scan_id = $1
        order by vendor_name asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select rule_code, rule_group, severity, instance_count
         from scan_accessibility_rule_counts
        where scan_id = $1
        order by instance_count desc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select page_type, page_url, fetch_status, fetched_via, normalized_content_hash, title_hash, page_language
         from scan_pages
        where scan_id = $1
        order by page_type asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp
         from compliance_change_events
        where scan_id_current = $1
        order by event_timestamp desc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    scan.domain_id
      ? queryOne<AdminScanDomainRow>(`select hostname from domains where id = $1`, [scan.domain_id], { readOnly: true })
      : Promise.resolve(null),
    scan.organization_id
      ? queryOne<AdminScanOrganizationRow>(`select name from organizations where id = $1`, [scan.organization_id], { readOnly: true })
      : Promise.resolve(null),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
    query<Record<string, unknown>>(
      `select *
         from policy_enrichment
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select *
         from policy_review_queue
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows)
  ]);

  return {
    accessibilityRuleCounts,
    changes,
    domain,
    organization,
    pages,
    policyEnrichment,
    policyReviewQueue,
    runtimeArtifacts,
    scan,
    snapshot,
    trackerVendors
  };
}

export async function loadAdminUsersData(): Promise<{
  domains: AdminDomainSummaryRow[];
  memberships: AdminMembershipRow[];
  organizations: AdminOrganizationSummaryRow[];
  scans: AdminOrganizationScanSummaryRow[];
  users: AdminUserRow[];
}> {
  const [users, memberships, organizations, domains, scans] = await Promise.all([
    query<AdminUserRow>(
      `select id, email, full_name, auth_provider, created_at, updated_at
         from users
        order by created_at desc`,
      [],
      { readOnly: true }
    ).then((result) => result.rows),
    query<AdminMembershipRow>(`select user_id, organization_id, role, created_at from organization_members`, [], { readOnly: true }).then(
      (result) => result.rows
    ),
    query<AdminOrganizationSummaryRow>(`select id, name, slug, plan, plan_status from organizations`, [], { readOnly: true }).then(
      (result) => result.rows
    ),
    query<AdminDomainSummaryRow>(`select id, organization_id from domains`, [], { readOnly: true }).then((result) => result.rows),
    query<AdminOrganizationScanSummaryRow>(`select id, organization_id, completed_at from scans`, [], { readOnly: true }).then(
      (result) => result.rows
    )
  ]);

  return {
    domains,
    memberships,
    organizations,
    scans,
    users
  };
}

export async function loadPolicyReviewQueueRows(reviewStatus?: string | null): Promise<AdminPolicyReviewQueueRow[]> {
  const result = reviewStatus
    ? await query<AdminPolicyReviewQueueRow>(
        `select *
           from policy_review_queue
          where review_status = $1
          order by created_at desc`,
        [reviewStatus],
        { readOnly: true }
      )
    : await query<AdminPolicyReviewQueueRow>(
        `select *
           from policy_review_queue
          order by created_at desc`,
        [],
        { readOnly: true }
      );

  return result.rows;
}

export async function loadPolicyReviewQueueUpdateContext(queueItemId: string): Promise<{
  pageType: string | null;
  queueItem: Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason"> | null;
}> {
  const existingQueueItem = await queryOne<Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason">>(
    `select reason, policy_enrichment_id
       from policy_review_queue
      where id = $1`,
    [queueItemId],
    { readOnly: true }
  );

  const policyEnrichmentRow =
    existingQueueItem?.policy_enrichment_id
      ? await queryOne<{ page_type: string | null }>(
          `select page_type
             from policy_enrichment
            where id = $1`,
          [existingQueueItem.policy_enrichment_id],
          { readOnly: true }
        )
      : null;

  return {
    pageType: typeof policyEnrichmentRow?.page_type === "string" ? policyEnrichmentRow.page_type : null,
    queueItem: existingQueueItem ?? null
  };
}

export async function updatePolicyReviewQueueRow(input: {
  assignedTo?: string | null;
  queueItemId: string;
  reviewStatus: string;
  reviewVerdict: string | null;
  reviewedAt: string;
  reviewerNotes?: string | null;
}) {
  return await queryOne<AdminPolicyReviewQueueRow>(
    `update policy_review_queue
        set assigned_to = $2,
            review_status = $3,
            review_verdict = $4,
            reviewed_at = $5,
            reviewer_notes = $6
      where id = $1
      returning *`,
    [
      input.queueItemId,
      input.assignedTo ?? null,
      input.reviewStatus,
      input.reviewVerdict,
      input.reviewedAt,
      input.reviewerNotes ?? null
    ]
  );
}

export async function updateAdminMembershipRole(input: {
  organizationId: string;
  role: "admin" | "user";
  userId: string;
}) {
  await query(
    `update organization_members
        set role = $3
      where organization_id = $1
        and user_id = $2`,
    [input.organizationId, input.userId, input.role]
  );
}

export async function updateAdminOrganizationPlan(input: {
  organizationId: string;
  plan: string;
  planStatus: string;
}) {
  await query(
    `update organizations
        set plan = $2,
            plan_status = $3
      where id = $1`,
    [input.organizationId, input.plan, input.planStatus]
  );
}

export async function loadAdminScanOverviewCounts(): Promise<AdminScanOverviewCounts> {
  const [totalScansResult, http403Result, http429Result, blockedOrCaptchaResult] = await Promise.all([
    query<{ count: string }>(`select count(*)::text as count from scans`, [], { readOnly: true }),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where homepage_fetch_http_status = 403
           or robots_fetch_http_status = 403`,
      [],
      { readOnly: true }
    ),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where homepage_fetch_http_status = 429
           or robots_fetch_http_status = 429`,
      [],
      { readOnly: true }
    ),
    query<{ count: string }>(
      `select count(*)::text as count
         from scan_snapshots
        where blocked_flag = true
           or captcha_flag = true
           or scan_outcome = 'content_capture_degraded'`,
      [],
      { readOnly: true }
    )
  ]);

  return {
    totalScans: Number(totalScansResult.rows[0]?.count ?? "0"),
    http403Count: Number(http403Result.rows[0]?.count ?? "0"),
    http429Count: Number(http429Result.rows[0]?.count ?? "0"),
    blockedOrCaptchaCount: Number(blockedOrCaptchaResult.rows[0]?.count ?? "0")
  };
}

export async function loadBlockedRunTelemetryRows(hours: number): Promise<AdminBlockedRunTelemetryRow[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const result = await query<AdminBlockedRunTelemetryRow>(
    `select scan_id, scan_timestamp, scan_outcome, homepage_fetch_http_status, egress_id, egress_type, asn, block_vendor_guess, normalized_body_hash
       from scan_snapshots
      where scan_timestamp >= $1
      order by scan_timestamp asc`,
    [since],
    { readOnly: true }
  );

  return result.rows;
}
