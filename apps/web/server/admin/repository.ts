"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
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
  normalized_body_hash?: string | null;
  report_finding_count?: number | null;
  recoverable_finding_classes?: RecoverableFindingClass[] | null;
  robots_fetch_http_status: number | null;
  scan_id?: string;
  scan_outcome?: string | null;
  scan_timestamp?: string | null;
  stop_tier?: ScanExecutionTier | null;
  total_signals?: number;
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
  const db = createDatabaseClient();
  const { data: scans, error } = await db
    .from("scans")
    .select("id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_scanned")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as AdminScanQueryRow[];
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const organizationIds = [...new Set(scanRows.flatMap((scan) => (scan.organization_id ? [scan.organization_id] : [])))];
  const scanIds = scanRows.map((scan) => scan.id);

  const snapshotsPromise = scanIds.length
    ? db
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status, robots_fetch_http_status, blocked_flag, captcha_flag, access_posture_class, highest_successful_tier, stop_tier, recoverable_finding_classes"
        )
        .in("scan_id", scanIds)
    : Promise.resolve({ data: [] as AdminScanSnapshotRow[], error: null as QueryErrorLike });
  const snapshotsFallbackPromise = scanIds.length
    ? db
        .from("scan_snapshots")
        .select("scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status, robots_fetch_http_status, blocked_flag, captcha_flag")
        .in("scan_id", scanIds)
    : Promise.resolve({ data: [] as AdminScanSnapshotRow[], error: null as QueryErrorLike });

  const [
    { data: domains },
    { data: organizations },
    { data: snapshots, error: snapshotsError }
  ] = await Promise.all([
    domainIds.length ? db.from("domains").select("id, hostname").in("id", domainIds) : Promise.resolve({ data: [] as AdminScanDomainRow[] }),
    organizationIds.length
      ? db.from("organizations").select("id, name").in("id", organizationIds)
      : Promise.resolve({ data: [] as AdminScanOrganizationRow[] }),
    snapshotsPromise
  ]);

  let resolvedSnapshots = snapshots ?? [];
  if (snapshotsError && isMissingTieredSnapshotColumn(snapshotsError)) {
    const fallback = await snapshotsFallbackPromise;
    if (fallback.error) {
      throw new Error(`Failed to load scans: ${fallback.error.message}`);
    }
    resolvedSnapshots = (fallback.data ?? []).map((row) => ({
      ...(row as AdminScanSnapshotRow),
      access_posture_class: null,
      highest_successful_tier: null,
      stop_tier: null,
      recoverable_finding_classes: []
    }));
  } else if (snapshotsError) {
    throw new Error(`Failed to load scans: ${snapshotsError.message}`);
  }

  const validationRuns: AdminValidationRunSummaryRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error: validationRunsError } = await db
        .from("validation_runs")
        .select("id, scan_id, finding_count, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: false });

      if (validationRunsError) {
        throw new Error(`Failed to load scans: ${validationRunsError.message}`);
      }

      validationRuns.push(...((data ?? []) as AdminValidationRunSummaryRow[]));
    }
  }

  const diagnosticEvents: AdminScanDiagnosticEventRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error: diagnosticEventsError } = await db
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (diagnosticEventsError) {
        throw new Error(`Failed to load scans: ${diagnosticEventsError.message}`);
      }

      diagnosticEvents.push(...((data ?? []) as AdminScanDiagnosticEventRow[]));
    }
  }

  const policyEnrichmentRows: AdminPolicyEnrichmentRow[] = [];
  if (scanIds.length) {
    for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error: policyRowsError } = await db
        .from("policy_enrichment")
        .select("*")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (policyRowsError) {
        throw new Error(`Failed to load scans: ${policyRowsError.message}`);
      }

      policyEnrichmentRows.push(...((data ?? []) as AdminPolicyEnrichmentRow[]));
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
      const { data, error } = await db
        .from("validation_run_findings")
        .select(
          "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json"
        )
        .in("validation_run_id", validationRunIdBatch);

      if (error) {
        throw new Error(`Failed to load scans: ${error.message}`);
      }

      validationFindingRows.push(...((data ?? []) as AdminValidationFindingSummaryRow[]));
    }
  }

  const validationFindingIds = validationFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, AdminValidationVerdictRow>();

  if (validationFindingIds.length) {
    for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await db
        .from("validation_verdicts")
        .select(
          "validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation"
        )
        .in("validation_run_finding_id", findingIdBatch)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to load scan verdicts: ${error.message}`);
      }

      for (const row of (data ?? []) as AdminValidationVerdictRow[]) {
        if (!verdictByFindingId.has(row.validation_run_finding_id)) {
          verdictByFindingId.set(row.validation_run_finding_id, row);
        }
      }
    }
  }

  return {
    diagnosticEvents,
    domains: (domains ?? []) as AdminScanDomainRow[],
    organizations: (organizations ?? []) as AdminScanOrganizationRow[],
    policyEnrichmentRows,
    resolvedSnapshots: resolvedSnapshots as AdminScanSnapshotRow[],
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
  const db = createDatabaseClient();
  const { data: scan, error } = await db
    .from("scans")
    .select("id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_requested, pages_scanned, scan_config_json")
    .eq("id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load scan: ${error.message}`);
  }

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

  const scanRow = scan as AdminScanQueryRow;
  const [
    { data: snapshot },
    { data: trackerVendors },
    { data: accessibilityRuleCounts },
    { data: pages },
    { data: changes },
    { data: domain },
    { data: organization },
    { data: runtimeArtifacts },
    { data: policyEnrichment },
    { data: policyReviewQueue }
  ] = await Promise.all([
    db.from("scan_snapshots").select("*").eq("scan_id", scanId).maybeSingle(),
    db
      .from("scan_tracker_vendors")
      .select("vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, before_consent, script_host, matched_signature_id")
      .eq("scan_id", scanId)
      .order("vendor_name", { ascending: true }),
    db
      .from("scan_accessibility_rule_counts")
      .select("rule_code, rule_group, severity, instance_count")
      .eq("scan_id", scanId)
      .order("instance_count", { ascending: false }),
    db
      .from("scan_pages")
      .select("page_type, page_url, fetch_status, fetched_via, normalized_content_hash, title_hash, page_language")
      .eq("scan_id", scanId)
      .order("page_type", { ascending: true }),
    db
      .from("compliance_change_events")
      .select("event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp")
      .eq("scan_id_current", scanId)
      .order("event_timestamp", { ascending: false }),
    scanRow.domain_id ? db.from("domains").select("hostname").eq("id", scanRow.domain_id).maybeSingle() : Promise.resolve({ data: null }),
    scanRow.organization_id
      ? db.from("organizations").select("name").eq("id", scanRow.organization_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle(),
    db.from("policy_enrichment").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("policy_review_queue").select("*").eq("scan_id", scanId).order("created_at", { ascending: true })
  ]);

  return {
    accessibilityRuleCounts: ((accessibilityRuleCounts ?? []) as Array<Record<string, unknown>>),
    changes: ((changes ?? []) as Array<Record<string, unknown>>),
    domain: (domain as AdminScanDomainRow | null) ?? null,
    organization: (organization as AdminScanOrganizationRow | null) ?? null,
    pages: ((pages ?? []) as Array<Record<string, unknown>>),
    policyEnrichment: ((policyEnrichment ?? []) as Array<Record<string, unknown>>),
    policyReviewQueue: ((policyReviewQueue ?? []) as Array<Record<string, unknown>>),
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    scan: scanRow,
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: ((trackerVendors ?? []) as Array<Record<string, unknown>>)
  };
}

export async function loadAdminUsersData(): Promise<{
  domains: AdminDomainSummaryRow[];
  memberships: AdminMembershipRow[];
  organizations: AdminOrganizationSummaryRow[];
  scans: AdminOrganizationScanSummaryRow[];
  users: AdminUserRow[];
}> {
  const db = createDatabaseClient();
  const [
    { data: users, error: usersError },
    { data: memberships, error: membershipsError },
    { data: organizations, error: organizationsError },
    { data: domains, error: domainsError },
    { data: scans, error: scansError }
  ] = await Promise.all([
    db.from("users").select("id, email, full_name, auth_provider, created_at, updated_at").order("created_at", { ascending: false }),
    db.from("organization_members").select("user_id, organization_id, role, created_at"),
    db.from("organizations").select("id, name, slug, plan, plan_status"),
    db.from("domains").select("id, organization_id"),
    db.from("scans").select("id, organization_id, completed_at")
  ]);

  if (usersError) {
    throw new Error(`Failed to load users: ${usersError.message}`);
  }

  if (membershipsError) {
    throw new Error(`Failed to load memberships: ${membershipsError.message}`);
  }

  if (organizationsError) {
    throw new Error(`Failed to load organizations: ${organizationsError.message}`);
  }

  if (domainsError) {
    throw new Error(`Failed to load domains: ${domainsError.message}`);
  }

  if (scansError) {
    throw new Error(`Failed to load scans: ${scansError.message}`);
  }

  return {
    domains: (domains ?? []) as AdminDomainSummaryRow[],
    memberships: (memberships ?? []) as AdminMembershipRow[],
    organizations: (organizations ?? []) as AdminOrganizationSummaryRow[],
    scans: (scans ?? []) as AdminOrganizationScanSummaryRow[],
    users: (users ?? []) as AdminUserRow[]
  };
}

export async function loadPolicyReviewQueueRows(reviewStatus?: string | null): Promise<AdminPolicyReviewQueueRow[]> {
  const db = createDatabaseClient();
  let query = db.from("policy_review_queue").select("*").order("created_at", { ascending: false });

  if (reviewStatus) {
    query = query.eq("review_status", reviewStatus);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load policy review queue: ${error.message}`);
  }

  return (data ?? []) as AdminPolicyReviewQueueRow[];
}

export async function loadPolicyReviewQueueUpdateContext(queueItemId: string): Promise<{
  pageType: string | null;
  queueItem: Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason"> | null;
}> {
  const db = createDatabaseClient();
  const { data: existingQueueItem, error: existingQueueItemError } = await db
    .from("policy_review_queue")
    .select("reason, policy_enrichment_id")
    .eq("id", queueItemId)
    .maybeSingle();

  if (existingQueueItemError) {
    throw new Error(`Failed to load policy review queue item: ${existingQueueItemError.message}`);
  }

  const { data: policyEnrichmentRow, error: policyEnrichmentError } =
    existingQueueItem?.policy_enrichment_id
      ? await db
          .from("policy_enrichment")
          .select("page_type")
          .eq("id", existingQueueItem.policy_enrichment_id)
          .maybeSingle()
      : { data: null, error: null };

  if (policyEnrichmentError) {
    throw new Error(
      `Failed to load policy enrichment for queue item ${queueItemId}: ${policyEnrichmentError.message}`
    );
  }

  return {
    pageType: typeof policyEnrichmentRow?.page_type === "string" ? policyEnrichmentRow.page_type : null,
    queueItem:
      (existingQueueItem as Pick<AdminPolicyReviewQueueRow, "policy_enrichment_id" | "reason"> | null) ?? null
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
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("policy_review_queue")
    .update({
      assigned_to: input.assignedTo ?? null,
      review_status: input.reviewStatus,
      review_verdict: input.reviewVerdict,
      reviewed_at: input.reviewedAt,
      reviewer_notes: input.reviewerNotes ?? null
    })
    .eq("id", input.queueItemId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update policy review verdict: ${error.message}`);
  }

  return (data as AdminPolicyReviewQueueRow | null) ?? null;
}

export async function updateAdminMembershipRole(input: {
  organizationId: string;
  role: "admin" | "user";
  userId: string;
}) {
  const db = createDatabaseClient();
  const { error } = await db
    .from("organization_members")
    .update({
      role: input.role
    })
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(`Failed to update membership role: ${error.message}`);
  }
}

export async function updateAdminOrganizationPlan(input: {
  organizationId: string;
  plan: string;
  planStatus: string;
}) {
  const db = createDatabaseClient();
  const { error } = await db
    .from("organizations")
    .update({
      plan: input.plan,
      plan_status: input.planStatus
    })
    .eq("id", input.organizationId);

  if (error) {
    throw new Error(`Failed to update organization plan: ${error.message}`);
  }
}
