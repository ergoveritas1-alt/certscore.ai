"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { AccessPostureClass, RecoverableFindingClass, ScanExecutionTier } from "@website-signal-risk-scanner/shared";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";
import { isPlatformAdminEmail } from "../admin/platform-admin";

export type ScanDetailQueryRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  id: string;
  organization_id?: string | null;
  pages_requested: number;
  pages_scanned: number;
  scan_config_json: Record<string, unknown> | null;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type ScanDomainRow = {
  hostname: string;
  id: string;
};

export type ScanEventQueryRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

export type ScanSignalQueryRow = {
  category: string;
  confidence?: number | null;
  evidence_refs?: string[] | null;
  observed_at?: string | null;
  population_source?: string | null;
  population_status?: string | null;
  provenance_json?: unknown;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: string;
};

export type ScanPreconsentViolationRow = {
  collection_endpoint_type: string;
  confidence: number | null;
  detection_source: string;
  evidence_urls: string[] | null;
  first_party_or_third_party: string;
  matched_signature_id: string | null;
  script_host: string | null;
  vendor_category: string;
  vendor_name: string;
};

export type ScanAccessibilityRuleCountRow = {
  instance_count: number;
  rule_code: string;
  rule_group: string;
  severity: string;
};

export type ScanAccessibilityRuleExampleRow = {
  description: string;
  help: string;
  help_url: string;
  impact: string | null;
  node_count: number;
  page_url: string;
  representative_selectors: string[] | null;
  rule_code: string;
  rule_group: string;
  severity: string;
};

export type ScanValidationRunFindingRow = {
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

export type ScanValidationVerdictRow = {
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

export type OrganizationScanQueryRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type OrganizationScanDomainRow = {
  hostname: string;
  id: string;
  last_scanned_at: string | null;
  latest_scan_id: string | null;
};

export type OrganizationLatestDomainScanRow = {
  id: string;
  status: string;
};

export type OrganizationDomainCompletedScanRow = {
  completed_at: string | null;
  domain_id: string | null;
};

export type OrganizationScanSnapshotRow = {
  access_posture_class: AccessPostureClass | null;
  accessibility_score: number | null;
  auth_wall_detected: boolean | null;
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number | null;
  cmp_vendor_name: string | null;
  consent_score: number | null;
  cookie_banner_present: boolean | null;
  highest_successful_tier: ScanExecutionTier | null;
  homepage_fetch_http_status: number | null;
  homepage_fetch_status: string | null;
  privacy_score: number | null;
  recoverable_finding_classes: RecoverableFindingClass[] | null;
  regulatory_exposure_score: number | null;
  report_finding_count: number | null;
  robots_allowed: boolean | null;
  robots_fetch_http_status: number | null;
  robots_fetch_status: string | null;
  scan_id: string;
  scan_outcome: string | null;
  stop_reason_code: string | null;
  stop_reason_detail: string | null;
  stop_reason_http_status: number | null;
  stop_reason_label: string | null;
  stop_tier: ScanExecutionTier | null;
  total_signals: number;
};

export type OrganizationRuntimeArtifactRow = {
  consent_audit_completed: boolean | null;
  consent_reject_interaction_succeeded: boolean | null;
  consent_reject_reduced_third_party_cookies: boolean | null;
  consent_reject_reduced_tracking: boolean | null;
  hybrid_runtime_evidence?: Record<string, unknown> | null;
  scan_id: string;
};

export type OrganizationChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
};

export type OrganizationSignalCountRow = {
  scan_id: string;
};

export type OrganizationValidationRunSummaryRow = {
  created_at: string;
  finding_count: number;
  id: string;
  scan_id: string;
};

export type OrganizationScanDiagnosticEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string;
};

export type OrganizationPolicyEnrichmentRow = Record<string, unknown> & {
  scan_id?: string;
};

export type OrganizationValidationFindingSummaryRow = {
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

export type OrganizationValidationVerdictRow = {
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

type QueryErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
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

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export async function loadScanCoreRecord(input: {
  allowAnonymousFallback?: boolean;
  anonymousOnly?: boolean;
  organizationId: string | null;
  scanId: string;
  viewerEmail?: string | null;
}): Promise<{
  domainHostname: string | null;
  previousScanId: string | null;
  scan: ScanDetailQueryRow;
  scanOrganizationId: string | null;
}> {
  const db = createDatabaseClient();
  const adminCanViewAnonymousScans = isPlatformAdminEmail(input.viewerEmail);
  const allowAnonymousAccess = input.anonymousOnly === true || input.allowAnonymousFallback === true || adminCanViewAnonymousScans;

  const loadScan = async (organizationId: string | null) => {
    let query = db
      .from("scans")
      .select("id, organization_id, domain_id, scan_type, status, pages_requested, pages_scanned, scan_config_json, created_at, started_at, completed_at, error_message")
      .eq("id", input.scanId);

    query = organizationId === null ? query.is("organization_id", null) : query.eq("organization_id", organizationId);

    return query.maybeSingle();
  };

  const primaryOrganizationId = input.anonymousOnly ? null : input.organizationId;
  const primaryScanResult = await loadScan(primaryOrganizationId);
  let scan = primaryScanResult.data;
  let error = primaryScanResult.error;

  if (!scan && !error && !input.anonymousOnly && allowAnonymousAccess) {
    const anonymousScanResult = await loadScan(null);
    scan = anonymousScanResult.data;
    error = anonymousScanResult.error;
  }

  if (error) {
    throw new Error(`Failed to load scan: ${error.message}`);
  }

  if (!scan) {
    throw new Error("Scan not found.");
  }

  const scanRow = scan as ScanDetailQueryRow;
  const scanOrganizationId = (scanRow.organization_id ?? null) as string | null;
  let domainHostname: string | null = null;

  if (scanRow.domain_id) {
    let domainQuery = db.from("domains").select("id, hostname").eq("id", scanRow.domain_id);
    domainQuery =
      scanOrganizationId === null && adminCanViewAnonymousScans
        ? domainQuery.is("organization_id", null)
        : domainQuery.eq("organization_id", input.organizationId);

    const { data: domain } = await domainQuery.maybeSingle();
    domainHostname = (domain as ScanDomainRow | null)?.hostname ?? null;
  }

  const previousScanPromise =
    scanRow.domain_id && scanOrganizationId !== null
      ? db
          .from("scans")
          .select("id")
          .eq("organization_id", scanOrganizationId)
          .eq("domain_id", scanRow.domain_id)
          .eq("status", "completed")
          .lt("created_at", scanRow.created_at)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null });

  const { data: previousScan } = await previousScanPromise;

  return {
    domainHostname,
    previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
    scan: scanRow,
    scanOrganizationId
  };
}

export async function loadScanDetailArtifacts(scanId: string): Promise<{
  accessibilityRuleCounts: Array<Record<string, unknown>>;
  accessibilityRuleExamples: Array<Record<string, unknown>>;
  documentSources: Array<Record<string, unknown>>;
  events: ScanEventQueryRow[];
  macroEnrichment: Record<string, unknown> | null;
  policyEnrichment: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  preconsentViolations: ScanPreconsentViolationRow[];
  runtimeArtifacts: Record<string, unknown> | null;
  signals: ScanSignalQueryRow[];
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
  validationRunId: string | null;
}> {
  const db = createDatabaseClient();
  const [
    { data: events, error: eventsError },
    { data: snapshot },
    { data: signals },
    { data: runtimeArtifacts },
    { data: preconsentViolations },
    { data: trackerVendors },
    { data: accessibilityRuleCounts },
    { data: accessibilityRuleExamples },
    { data: policyEnrichment },
    { data: policyReviewQueue },
    { data: documentSources },
    { data: macroEnrichment, error: macroEnrichmentError },
    { data: validationRun }
  ] = await Promise.all([
    db.from("scan_events").select("id, event_type, message, metadata_json, created_at").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("scan_snapshots").select("*").eq("scan_id", scanId).maybeSingle(),
    db
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at")
      .eq("scan_id", scanId)
      .order("category", { ascending: true })
      .order("signal_key", { ascending: true }),
    db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle(),
    db
      .from("scan_preconsent_violations")
      .select(
        "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, script_host, matched_signature_id, evidence_urls"
      )
      .eq("scan_id", scanId)
      .order("vendor_category", { ascending: true })
      .order("vendor_name", { ascending: true }),
    db
      .from("scan_tracker_vendors")
      .select(
        "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id"
      )
      .eq("scan_id", scanId)
      .order("vendor_category", { ascending: true })
      .order("vendor_name", { ascending: true }),
    db
      .from("scan_accessibility_rule_counts")
      .select("rule_code, rule_group, severity, instance_count")
      .eq("scan_id", scanId)
      .order("instance_count", { ascending: false })
      .order("rule_code", { ascending: true }),
    db
      .from("scan_accessibility_rule_examples")
      .select("page_url, rule_code, rule_group, severity, impact, help, help_url, description, node_count, representative_selectors")
      .eq("scan_id", scanId)
      .order("node_count", { ascending: false })
      .order("rule_code", { ascending: true }),
    db.from("policy_enrichment").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("policy_review_queue").select("*").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("scan_document_sources").select("source_status, extraction_status, metadata_json").eq("scan_id", scanId).order("created_at", { ascending: true }),
    db.from("scan_macro_enrichments").select("*").eq("scan_id", scanId).maybeSingle(),
    db.from("validation_runs").select("id").eq("scan_id", scanId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  ]);

  if (eventsError) {
    throw new Error(`Failed to load scan events: ${eventsError.message}`);
  }

  if (macroEnrichmentError && !isMissingOptionalTableError(macroEnrichmentError)) {
    throw new Error(`Failed to load scan macro enrichment: ${macroEnrichmentError.message}`);
  }

  return {
    accessibilityRuleCounts: ((accessibilityRuleCounts ?? []) as Array<Record<string, unknown>>),
    accessibilityRuleExamples: ((accessibilityRuleExamples ?? []) as Array<Record<string, unknown>>),
    documentSources: ((documentSources ?? []) as Array<Record<string, unknown>>),
    events: ((events ?? []) as ScanEventQueryRow[]),
    macroEnrichment: (macroEnrichment as Record<string, unknown> | null) ?? null,
    policyEnrichment: ((policyEnrichment ?? []) as Array<Record<string, unknown>>),
    policyReviewQueue: ((policyReviewQueue ?? []) as Array<Record<string, unknown>>),
    preconsentViolations: ((preconsentViolations ?? []) as ScanPreconsentViolationRow[]),
    runtimeArtifacts: (runtimeArtifacts as Record<string, unknown> | null) ?? null,
    signals: ((signals ?? []) as ScanSignalQueryRow[]),
    snapshot: (snapshot as Record<string, unknown> | null) ?? null,
    trackerVendors: ((trackerVendors ?? []) as Array<Record<string, unknown>>),
    validationRunId: (validationRun as { id?: string } | null)?.id ?? null
  };
}

export async function loadScanValidationFindingRows(
  scanId: string,
  validationRunId: string
): Promise<{
  findings: ScanValidationRunFindingRow[];
}> {
  const db = createDatabaseClient();
  const { data: validationFindingRows, error: validationFindingsError } = await db
    .from("validation_run_findings")
    .select(
      "id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json"
    )
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true });

  if (validationFindingsError) {
    throw new Error(`Failed to load validation findings for scan ${scanId}: ${validationFindingsError.message}`);
  }

  const baseFindingRows = (validationFindingRows ?? []) as ScanValidationRunFindingRow[];
  const findingIds = baseFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ScanValidationVerdictRow>();

  if (findingIds.length > 0) {
    const { data: verdictRows, error: verdictsError } = await db
      .from("validation_verdicts")
      .select(
        "validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation"
      )
      .in("validation_run_finding_id", findingIds)
      .order("created_at", { ascending: false });

    if (verdictsError) {
      throw new Error(`Failed to load validation verdicts for scan ${scanId}: ${verdictsError.message}`);
    }

    for (const row of (verdictRows ?? []) as ScanValidationVerdictRow[]) {
      if (!verdictByFindingId.has(row.validation_run_finding_id)) {
        verdictByFindingId.set(row.validation_run_finding_id, row);
      }
    }
  }

  return {
    findings: baseFindingRows.map((row) => ({
      ...row,
      validation_verdicts: verdictByFindingId.get(row.id) ?? null
    }))
  };
}

export async function loadScanComparisonArtifacts(input: {
  domainField: string | null;
  previousScanId: string | null;
  scanId: string;
}): Promise<{
  previousPolicyRows: Array<Record<string, unknown>>;
  previousSnapshot: Record<string, unknown> | null;
  previousTrackerRows: Array<Record<string, unknown>>;
  relatedPreviewSnapshot: Record<string, unknown> | null;
}> {
  const db = createDatabaseClient();

  const previousSnapshot = input.previousScanId
    ? (await db.from("scan_snapshots").select("*").eq("scan_id", input.previousScanId).maybeSingle()).data
    : null;
  const previousTrackerRows = input.previousScanId
    ? (
        await db
          .from("scan_tracker_vendors")
          .select(
            "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id"
          )
          .eq("scan_id", input.previousScanId)
      ).data ?? []
    : [];
  const relatedPreviewSnapshot = input.domainField
    ? (
        await db
          .from("scan_snapshots")
          .select("*")
          .eq("domain", input.domainField)
          .eq("crawl_source", "preview")
          .neq("scan_id", input.scanId)
          .order("scan_timestamp", { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data
    : null;
  const previousPolicyRows = input.previousScanId
    ? (await db.from("policy_enrichment").select("*").eq("scan_id", input.previousScanId).order("created_at", { ascending: true })).data ?? []
    : [];

  return {
    previousPolicyRows: previousPolicyRows as Array<Record<string, unknown>>,
    previousSnapshot: (previousSnapshot as Record<string, unknown> | null) ?? null,
    previousTrackerRows: previousTrackerRows as Array<Record<string, unknown>>,
    relatedPreviewSnapshot: (relatedPreviewSnapshot as Record<string, unknown> | null) ?? null
  };
}

export async function loadPolicyEvidenceByHash(policyEvidenceHashes: string[]): Promise<Map<string, string>> {
  if (!policyEvidenceHashes.length) {
    return new Map();
  }

  const db = createDatabaseClient();
  const rows =
    (
      await db
        .from("policy_evidence")
        .select("evidence_hash, snippet")
        .in("evidence_hash", policyEvidenceHashes)
    ).data ?? [];

  return new Map(
    rows
      .filter(
        (row): row is { evidence_hash: string; snippet: string } =>
          Boolean(row) && typeof row.evidence_hash === "string" && typeof row.snippet === "string"
      )
      .map((row) => [row.evidence_hash, row.snippet] as const)
  );
}

export async function loadOrganizationScanPageData(
  organizationId: string,
  input?: {
    from?: number;
    to?: number;
    limit?: number;
    includeCount?: boolean;
  }
): Promise<{
  changeSummaries: OrganizationChangeSummaryRow[];
  changeSummariesError: QueryErrorLike;
  count: number | null;
  diagnosticEvents: OrganizationScanDiagnosticEventRow[];
  domainCompletedScans: OrganizationDomainCompletedScanRow[];
  domains: OrganizationScanDomainRow[];
  latestDomainScans: OrganizationLatestDomainScanRow[];
  policyEnrichmentRows: OrganizationPolicyEnrichmentRow[];
  resolvedSnapshots: OrganizationScanSnapshotRow[];
  runtimeArtifacts: OrganizationRuntimeArtifactRow[];
  scanRows: OrganizationScanQueryRow[];
  signalCountMap: Map<string, number>;
  summaryScanIds: string[];
  validationFindingRows: OrganizationValidationFindingSummaryRow[];
  validationRuns: OrganizationValidationRunSummaryRow[];
  verdictByFindingId: Map<string, OrganizationValidationVerdictRow>;
}> {
  const db = createDatabaseClient();
  let query = db
    .from("scans")
    .select(
      "id, domain_id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at",
      input?.includeCount ? { count: "exact" } : undefined
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (typeof input?.from === "number" && typeof input?.to === "number") {
    query = query.range(input.from, input.to);
  } else if (typeof input?.limit === "number") {
    query = query.limit(input.limit);
  }

  const { data: scans, error, count } = await query;

  if (error) {
    throw new Error(`Failed to load organization scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as OrganizationScanQueryRow[];
  const scanIds = scanRows.map((scan) => scan.id);
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const summaryScanIds = Array.from(
    scanRows.reduce((ids, scan) => {
      const key = scan.domain_id ?? `scan:${scan.id}`;
      if (!ids.has(key)) {
        ids.set(key, scan.id);
      }
      return ids;
    }, new Map<string, string>()).values()
  );

  const domainsWithLastScannedAtPromise = domainIds.length
    ? db
        .from("domains")
        .select("id, hostname, last_scanned_at, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as OrganizationScanDomainRow[], error: null });
  const domainsWithoutLastScannedAtPromise = domainIds.length
    ? db
        .from("domains")
        .select("id, hostname, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as OrganizationScanDomainRow[], error: null });
  const snapshotsPromise = summaryScanIds.length
    ? db
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, regulatory_exposure_score, privacy_score, consent_score, accessibility_score, cookie_banner_present, cmp_vendor_name, homepage_fetch_http_status, homepage_fetch_status, robots_allowed, robots_fetch_http_status, robots_fetch_status, blocked_flag, captcha_flag, auth_wall_detected, scan_outcome, stop_reason_code, stop_reason_label, stop_reason_detail, stop_reason_http_status, report_finding_count, access_posture_class, highest_successful_tier, stop_tier, recoverable_finding_classes"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as OrganizationScanSnapshotRow[], error: null as QueryErrorLike });
  const snapshotsFallbackPromise = summaryScanIds.length
    ? db
        .from("scan_snapshots")
        .select(
          "scan_id, total_signals, certscore_overall, regulatory_exposure_score, privacy_score, consent_score, accessibility_score, cookie_banner_present, cmp_vendor_name, homepage_fetch_http_status, homepage_fetch_status, robots_allowed, robots_fetch_http_status, robots_fetch_status, blocked_flag, captcha_flag, auth_wall_detected, scan_outcome, stop_reason_code, stop_reason_label, stop_reason_detail, stop_reason_http_status, report_finding_count"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as OrganizationScanSnapshotRow[], error: null as QueryErrorLike });
  const runtimeArtifactsPromise = summaryScanIds.length
    ? db
        .from("scan_runtime_artifacts")
        .select(
          "scan_id, consent_audit_completed, consent_reject_interaction_succeeded, consent_reject_reduced_tracking, consent_reject_reduced_third_party_cookies, hybrid_runtime_evidence"
        )
        .in("scan_id", summaryScanIds)
    : Promise.resolve({ data: [] as OrganizationRuntimeArtifactRow[], error: null as QueryErrorLike });

  const [
    { data: domainsWithLastScannedAt, error: domainsError },
    { data: snapshots, error: snapshotsError },
    { data: runtimeArtifacts, error: runtimeArtifactsError }
  ] = await Promise.all([domainsWithLastScannedAtPromise, snapshotsPromise, runtimeArtifactsPromise]);

  let domains = domainsWithLastScannedAt;
  if (domainsError && isMissingLastScannedAtColumn(domainsError)) {
    const fallback = await domainsWithoutLastScannedAtPromise;
    domains = (fallback.data ?? []).map((domain) => ({
      ...domain,
      last_scanned_at: null
    }));
  } else if (domainsError) {
    throw new Error(`Failed to load organization scans: ${domainsError.message}`);
  }

  let resolvedSnapshots = snapshots;
  if (snapshotsError && isMissingTieredSnapshotColumn(snapshotsError)) {
    const fallback = await snapshotsFallbackPromise;
    if (fallback.error) {
      throw new Error(`Failed to load organization scans: ${fallback.error.message}`);
    }
    resolvedSnapshots = (fallback.data ?? []).map((row) => ({
      ...(row as OrganizationScanSnapshotRow),
      access_posture_class: null,
      highest_successful_tier: null,
      stop_tier: null,
      recoverable_finding_classes: []
    }));
  } else if (snapshotsError) {
    throw new Error(`Failed to load organization scans: ${snapshotsError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load organization scans: ${runtimeArtifactsError.message}`);
  }

  const changeSummaries: OrganizationChangeSummaryRow[] = [];
  let changeSummariesError: QueryErrorLike = null;

  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await db
        .from("compliance_change_events")
        .select("scan_id_current, event_type")
        .eq("organization_id", organizationId)
        .in("scan_id_current", scanIdBatch);

      if (error) {
        changeSummariesError = error;
        break;
      }

      changeSummaries.push(...((data ?? []) as OrganizationChangeSummaryRow[]));
    }
  }

  const domainRows = (domains ?? []) as OrganizationScanDomainRow[];
  const latestDomainScanIds = [...new Set(domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : [])))];
  const { data: domainCompletedScans, error: domainCompletedScansError } = domainIds.length
    ? await db
        .from("scans")
        .select("domain_id, completed_at")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .in("domain_id", domainIds)
        .order("completed_at", { ascending: false })
    : { data: [] as OrganizationDomainCompletedScanRow[], error: null };
  const { data: latestDomainScans, error: latestDomainScansError } = latestDomainScanIds.length
    ? await db.from("scans").select("id, status").in("id", latestDomainScanIds)
    : { data: [] as OrganizationLatestDomainScanRow[], error: null };

  if (domainCompletedScansError) {
    throw new Error(`Failed to load organization scans: ${domainCompletedScansError.message}`);
  }

  if (latestDomainScansError) {
    throw new Error(`Failed to load organization scans: ${latestDomainScansError.message}`);
  }

  const snapshotMap = new Map(((resolvedSnapshots ?? []) as OrganizationScanSnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const zeroSignalScanIds = summaryScanIds.filter((scanId) => {
    const totalSignals = snapshotMap.get(scanId)?.total_signals ?? null;
    return totalSignals === null || totalSignals === 0;
  });
  const signalCountMap = new Map<string, number>();
  if (zeroSignalScanIds.length) {
    for (const scanIdBatch of chunkValues(zeroSignalScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: signalCountRows, error: signalCountError } = await db
        .from("scan_signals")
        .select("scan_id")
        .eq("population_source", "scanner")
        .in("scan_id", scanIdBatch);

      if (signalCountError) {
        throw new Error(`Failed to load organization scans: ${signalCountError.message}`);
      }

      for (const row of (signalCountRows ?? []) as OrganizationSignalCountRow[]) {
        signalCountMap.set(row.scan_id, (signalCountMap.get(row.scan_id) ?? 0) + 1);
      }
    }
  }

  const validationRuns: OrganizationValidationRunSummaryRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: validationRunRows, error: validationRunsError } = await db
        .from("validation_runs")
        .select("id, scan_id, finding_count, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: false });

      if (validationRunsError) {
        throw new Error(`Failed to load organization scans: ${validationRunsError.message}`);
      }

      validationRuns.push(...((validationRunRows ?? []) as OrganizationValidationRunSummaryRow[]));
    }
  }

  const diagnosticEvents: OrganizationScanDiagnosticEventRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: diagnosticEventRows, error: diagnosticEventsError } = await db
        .from("scan_events")
        .select("scan_id, event_type, message, metadata_json, created_at")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (diagnosticEventsError) {
        throw new Error(`Failed to load organization scans: ${diagnosticEventsError.message}`);
      }

      diagnosticEvents.push(...((diagnosticEventRows ?? []) as OrganizationScanDiagnosticEventRow[]));
    }
  }

  const policyEnrichmentRows: OrganizationPolicyEnrichmentRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data: policyRows, error: policyRowsError } = await db
        .from("policy_enrichment")
        .select("*")
        .in("scan_id", scanIdBatch)
        .order("created_at", { ascending: true });

      if (policyRowsError) {
        throw new Error(`Failed to load organization scans: ${policyRowsError.message}`);
      }

      policyEnrichmentRows.push(...((policyRows ?? []) as OrganizationPolicyEnrichmentRow[]));
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

  const validationFindingRows: OrganizationValidationFindingSummaryRow[] = [];
  if (latestValidationRunIds.length) {
    for (const validationRunIdBatch of chunkValues(latestValidationRunIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await db
        .from("validation_run_findings")
        .select(
          "id, validation_run_id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json"
        )
        .in("validation_run_id", validationRunIdBatch);

      if (error) {
        throw new Error(`Failed to load organization scans: ${error.message}`);
      }

      validationFindingRows.push(...((data ?? []) as OrganizationValidationFindingSummaryRow[]));
    }
  }

  const validationFindingIds = validationFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, OrganizationValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
      const { data, error } = await db
        .from("validation_verdicts")
        .select(
          "validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation"
        )
        .in("validation_run_finding_id", findingIdBatch)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to load organization scan verdicts: ${error.message}`);
      }

      for (const row of (data ?? []) as OrganizationValidationVerdictRow[]) {
        if (!verdictByFindingId.has(row.validation_run_finding_id)) {
          verdictByFindingId.set(row.validation_run_finding_id, row);
        }
      }
    }
  }

  return {
    changeSummaries,
    changeSummariesError,
    count: count ?? null,
    diagnosticEvents,
    domainCompletedScans: (domainCompletedScans ?? []) as OrganizationDomainCompletedScanRow[],
    domains: domainRows,
    latestDomainScans: (latestDomainScans ?? []) as OrganizationLatestDomainScanRow[],
    policyEnrichmentRows,
    resolvedSnapshots: (resolvedSnapshots ?? []) as OrganizationScanSnapshotRow[],
    runtimeArtifacts: (runtimeArtifacts ?? []) as OrganizationRuntimeArtifactRow[],
    scanRows,
    signalCountMap,
    summaryScanIds,
    validationFindingRows,
    validationRuns,
    verdictByFindingId
  };
}

export async function loadOrganizationScanLegacyEvents(
  organizationId: string,
  scanIds: string[]
): Promise<LegacyScanEventRow[]> {
  const db = createDatabaseClient();
  const legacyEvents: LegacyScanEventRow[] = [];
  let legacyEventsError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    const { data, error } = await db
      .from("scan_events")
      .select("id, scan_id, event_type, message, metadata_json, created_at")
      .eq("organization_id", organizationId)
      .in("scan_id", scanIdBatch)
      .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
      .order("created_at", { ascending: false });

    if (error) {
      legacyEventsError = error;
      break;
    }

    legacyEvents.push(...((data ?? []) as LegacyScanEventRow[]));
  }

  if (legacyEventsError) {
    throw new Error(`Failed to load organization scans: ${legacyEventsError.message}`);
  }

  return legacyEvents;
}

export { isMissingComplianceChangeEventsTable };
