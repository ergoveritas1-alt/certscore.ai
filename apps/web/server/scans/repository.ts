"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type {
  AccessPostureClass,
  RecoverableFindingClass,
  ScanType,
  ScanExecutionTier,
  SharedCrawlSeedHint,
  SharedPriorScanAccelerationConfig
} from "@website-signal-risk-scanner/shared";
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
  representative_nodes?: Array<Record<string, unknown>> | null;
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
  display_domain_id: string | null;
  display_hostname: string | null;
  display_last_scanned_at: string | null;
  display_latest_scan_id: string | null;
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
  legal_coverage_score?: number | null;
  normalized_body_hash: string | null;
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
  verified_public_surfaces_count?: number | null;
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

export type UsageCounterRow = {
  id: string;
  value: number;
};

export type QueuedFullScanInsert = {
  domainId: string;
  organizationId: string | null;
  pagesRequested: number;
  queueOrigin?: string;
  queuePriority?: number;
  scanType?: Extract<ScanType, "full" | "scheduled">;
  scanConfigJson: Record<string, unknown>;
  submittedByUserId: string | null;
};

export type PriorScanAccelerationCandidate = {
  crawlSeedHints: SharedCrawlSeedHint[];
  priorScan: SharedPriorScanAccelerationConfig;
  selectedDocumentSources: Array<{
    canonicalUrl: string;
    confidence: number | null;
    documentType: string;
    sourceUrl: string | null;
  }>;
  selectedHighYieldPages: Array<{
    confidence: number | null;
    hintType: string;
    url: string;
  }>;
};

export type DomainBenchmarkEventRow = {
  metadata_json?: unknown;
};

type QueryErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
} | null;

const CHANGE_EVENT_BATCH_SIZE = 50;
const PRIOR_SCAN_ACCELERATION_MAX_AGE_DAYS = 30;
const PRIOR_SCAN_ACCELERATION_MAX_CRAWL_SEEDS = 20;
const PRIOR_SCAN_ACCELERATION_MAX_CANDIDATES = 10;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isProbablyPublicHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getPriorScanHintUrlKey(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return value.trim().replace(/\/+$/, "").toLowerCase();
  }
}

function classifyPriorScanHintType(documentType: string) {
  if (documentType === "privacy_policy") return "privacy_policy";
  if (documentType === "cookie_policy") return "cookie_policy";
  if (documentType === "terms_of_service") return "terms_of_service";
  if (documentType === "accessibility_statement") return "accessibility_statement";
  if (documentType === "contact_page") return "contact_page";
  return "legal_document";
}

function classifyPriorScanPageHintType(pageType: string | null, pageUrl: string) {
  if (pageType === "homepage") {
    return "homepage_final_url";
  }

  if (pageType) {
    return classifyPriorScanHintType(pageType);
  }

  const pathname = (() => {
    try {
      return new URL(pageUrl).pathname.toLowerCase();
    } catch {
      return pageUrl.toLowerCase();
    }
  })();

  if (/accessibility|a11y/.test(pathname)) return "accessibility_statement";
  if (/cookie|cookies/.test(pathname)) return "cookie_policy";
  if (/privacy|do-not-sell|do-not-share|ccpa|privacy-center/.test(pathname)) return "privacy_policy";
  if (/terms|conditions|tos|legal/.test(pathname)) return "terms_of_service";
  if (/contact|support|help/.test(pathname)) return "contact_page";
  return "high_yield_page";
}

function getPriorScanDocumentTypeScore(documentType: string | null) {
  if (documentType === "privacy_policy") return 28;
  if (documentType === "cookie_policy") return 24;
  if (documentType === "terms_of_service") return 20;
  if (documentType === "accessibility_statement") return 16;
  if (documentType === "contact_page") return 10;
  return 4;
}

function getPriorScanPageTypeScore(pageType: string | null, pageUrl: string) {
  const hintType = classifyPriorScanPageHintType(pageType, pageUrl);
  if (hintType === "homepage_final_url") return 8;
  if (hintType === "privacy_policy") return 18;
  if (hintType === "cookie_policy") return 16;
  if (hintType === "terms_of_service") return 14;
  if (hintType === "accessibility_statement") return 12;
  if (hintType === "contact_page") return 8;
  return 3;
}

function buildPriorScanSelectionReason(input: {
  documentSourceCount: number;
  highYieldPageCount: number;
  matchedByDomainId: boolean;
  matchedByNormalizedUrl: boolean;
}) {
  const matchReason = input.matchedByDomainId
    ? "same_domain_id"
    : input.matchedByNormalizedUrl
      ? "same_normalized_url"
      : "same_lookup_scope";
  const sourceReason = input.documentSourceCount > 0
    ? "ready_document_sources"
    : input.highYieldPageCount > 0
      ? "high_yield_pages"
      : "completed_scan";
  return `${matchReason}:${sourceReason}`;
}

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
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
  const adminCanViewAnonymousScans = isPlatformAdminEmail(input.viewerEmail);
  const allowAnonymousAccess = input.anonymousOnly === true || input.allowAnonymousFallback === true || adminCanViewAnonymousScans;

  const loadScan = async (organizationId: string | null) => {
    return await queryOne<ScanDetailQueryRow>(
      `select id, organization_id, domain_id, scan_type, status, pages_requested, pages_scanned,
              scan_config_json, created_at, started_at, completed_at, error_message
         from scans
        where id = $1
          and ${
            organizationId === null ? "organization_id is null" : "organization_id = $2"
          }`,
      organizationId === null ? [input.scanId] : [input.scanId, organizationId],
      { readOnly: true }
    );
  };
  const loadScanWithoutOrganizationScope = async () => {
    return await queryOne<ScanDetailQueryRow>(
      `select id, organization_id, domain_id, scan_type, status, pages_requested, pages_scanned,
              scan_config_json, created_at, started_at, completed_at, error_message
         from scans
        where id = $1`,
      [input.scanId],
      { readOnly: true }
    );
  };
  const hasCrossWorkspaceReuseAccess = async () => {
    if (!input.organizationId || input.anonymousOnly) {
      return false;
    }

    const request = await queryOne<{ id: string }>(
      `select id
         from scan_requests
        where organization_id = $1
          and fulfilled_by_scan_id = $2
          and status = 'reused_recent_scan'
          and resolution_mode = 'reused_existing_scan'
        order by requested_at desc
        limit 1`,
      [input.organizationId, input.scanId],
      { readOnly: true }
    );

    return Boolean(request);
  };

  const primaryOrganizationId = input.anonymousOnly ? null : input.organizationId;
  let scan = await loadScan(primaryOrganizationId);

  if (!scan && !input.anonymousOnly && allowAnonymousAccess) {
    scan = await loadScan(null);
  }

  if (!scan && (await hasCrossWorkspaceReuseAccess())) {
    scan = await loadScanWithoutOrganizationScope();
  }

  if (!scan) {
    throw new Error("Scan not found.");
  }

  const scanRow = scan;
  const scanOrganizationId = (scanRow.organization_id ?? null) as string | null;
  let domainHostname: string | null = null;

  if (scanRow.domain_id) {
    const domain = await queryOne<ScanDomainRow>(
      `select id, hostname
         from domains
        where id = $1
          and ${
            scanOrganizationId === null
              ? "organization_id is null"
              : "organization_id = $2"
          }`,
      scanOrganizationId === null
        ? [scanRow.domain_id]
        : [scanRow.domain_id, scanOrganizationId],
      { readOnly: true }
    );
    domainHostname = domain?.hostname ?? null;
  }

  const previousScanPromise =
    scanRow.domain_id && scanOrganizationId !== null
      ? queryOne<{ id?: string }>(
          `select id
             from scans
            where organization_id = $1
              and domain_id = $2
              and status = 'completed'
              and created_at < $3
            order by created_at desc
            limit 1`,
          [scanOrganizationId, scanRow.domain_id, scanRow.created_at],
          { readOnly: true }
        )
      : Promise.resolve(null);

  const previousScan = await previousScanPromise;

  return {
    domainHostname,
    previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
    scan: scanRow,
    scanOrganizationId
  };
}

export async function loadUsageCounter(input: {
  metricKey: string;
  organizationId: string;
  periodEnd: string;
  periodStart: string;
}): Promise<UsageCounterRow | null> {
  return await queryOne<UsageCounterRow>(
    `select id, value
       from usage_counters
      where organization_id = $1
        and metric_key = $2
        and period_start = $3
        and period_end = $4`,
    [input.organizationId, input.metricKey, input.periodStart, input.periodEnd],
    { readOnly: true }
  );
}

export async function loadPriorScanAccelerationCandidate(input: {
  domainId: string;
  normalizedUrl: string;
  organizationId: string | null;
}): Promise<PriorScanAccelerationCandidate | null> {
  const priorScanRows = await query<{
    completed_at: string;
    id: string;
    matched_by_domain_id: boolean;
    matched_by_normalized_url: boolean;
  }>(
    `
      select
             s.id,
             s.completed_at,
             (s.domain_id = $3) as matched_by_domain_id,
             (d.normalized_url = $4) as matched_by_normalized_url
        from scans s
        left join domains d on d.id = s.domain_id
       where s.status = 'completed'
         and s.completed_at is not null
         and s.completed_at >= timezone('utc', now()) - ($1::int * interval '1 day')
         and s.organization_id is not distinct from $2
         and (
           s.domain_id = $3
           or d.normalized_url = $4
         )
       order by s.completed_at desc
       limit $5
    `,
    [
      PRIOR_SCAN_ACCELERATION_MAX_AGE_DAYS,
      input.organizationId,
      input.domainId,
      input.normalizedUrl,
      PRIOR_SCAN_ACCELERATION_MAX_CANDIDATES
    ],
    { readOnly: true }
  );

  if (priorScanRows.rows.length === 0) {
    return null;
  }

  const candidateScanIds = priorScanRows.rows.map((row) => row.id);
  const documentSourceRows = await query<{
    canonical_url: string | null;
    document_type: string | null;
    extraction_status: string | null;
    extracted_fields_json: Record<string, unknown> | null;
    metadata_json: Record<string, unknown> | null;
    scan_id: string;
    semantic_confidence: number | null;
    source_url: string | null;
  }>(
    `
      select scan_id, canonical_url, source_url, document_type, extraction_status, extracted_fields_json, metadata_json, semantic_confidence
        from scan_document_sources
       where scan_id = any($1::uuid[])
         and source_status = 'ready'
         and canonical_url is not null
       order by scan_id, semantic_confidence desc nulls last, updated_at desc
    `,
    [candidateScanIds],
    { readOnly: true }
  ).catch((error) => {
    if (isMissingOptionalTableError(error)) {
      return { rows: [] };
    }
    throw error;
  });

  const highYieldPageRows = await query<{
    fetch_status: string | null;
    page_type: string | null;
    page_url: string | null;
    scan_id: string;
  }>(
    `
      select scan_id, page_type, page_url, fetch_status
        from scan_pages
       where scan_id = any($1::uuid[])
         and page_url is not null
         and coalesce(fetch_status, '') not in ('failed', 'error', 'forbidden')
       order by scan_id, created_at asc
    `,
    [candidateScanIds],
    { readOnly: true }
  ).catch((error) => {
    if (isMissingOptionalTableError(error)) {
      return { rows: [] };
    }
    throw error;
  });

  const documentsByScanId = new Map<string, typeof documentSourceRows.rows>();
  for (const row of documentSourceRows.rows) {
    const rows = documentsByScanId.get(row.scan_id) ?? [];
    rows.push(row);
    documentsByScanId.set(row.scan_id, rows);
  }

  const highYieldPagesByScanId = new Map<string, typeof highYieldPageRows.rows>();
  for (const row of highYieldPageRows.rows) {
    const pageUrl = getString(row.page_url);
    if (!pageUrl || !isProbablyPublicHttpUrl(pageUrl)) {
      continue;
    }
    const score = getPriorScanPageTypeScore(getString(row.page_type), pageUrl);
    if (score < 8) {
      continue;
    }
    const rows = highYieldPagesByScanId.get(row.scan_id) ?? [];
    rows.push(row);
    highYieldPagesByScanId.set(row.scan_id, rows);
  }

  const scoredCandidates = priorScanRows.rows
    .map((row, index) => {
      const documentRows = documentsByScanId.get(row.id) ?? [];
      const highYieldRows = highYieldPagesByScanId.get(row.id) ?? [];
      const documentScore = documentRows.reduce(
        (sum, documentRow) =>
          sum +
          getPriorScanDocumentTypeScore(getString(documentRow.document_type)) +
          (documentRow.extraction_status === "ready" ? 18 : 0) +
          (getString(documentRow.metadata_json?.content_hash) || getString(documentRow.metadata_json?.document_content_hash) ? 10 : 0) +
          (typeof documentRow.semantic_confidence === "number" ? Math.round(documentRow.semantic_confidence * 10) : 0),
        0
      );
      const highYieldPageScore = highYieldRows.reduce(
        (sum, pageRow) => sum + getPriorScanPageTypeScore(getString(pageRow.page_type), getString(pageRow.page_url) ?? ""),
        0
      );
      const matchScore = row.matched_by_domain_id ? 12 : row.matched_by_normalized_url ? 8 : 0;
      const recencyScore = Math.max(0, PRIOR_SCAN_ACCELERATION_MAX_CANDIDATES - index);
      return {
        documentRows,
        highYieldRows,
        row,
        score: matchScore + recencyScore + documentScore + Math.min(30, highYieldPageScore)
      };
    })
    .sort((left, right) => right.score - left.score);

  const selectedCandidate = scoredCandidates[0];
  if (!selectedCandidate) {
    return null;
  }

  const selectedDocumentSources = [];
  const selectedHighYieldPages = [];
  const crawlSeedHints: SharedCrawlSeedHint[] = [];
  const seenUrls = new Set<string>();
  const seenHintTypes = new Set<string>();

  const sortedDocumentRows = [...selectedCandidate.documentRows].sort((left, right) => {
    const leftScore =
      getPriorScanDocumentTypeScore(getString(left.document_type)) +
      (left.extraction_status === "ready" ? 18 : 0) +
      (getString(left.metadata_json?.content_hash) || getString(left.metadata_json?.document_content_hash) ? 10 : 0) +
      (typeof left.semantic_confidence === "number" ? Math.round(left.semantic_confidence * 10) : 0);
    const rightScore =
      getPriorScanDocumentTypeScore(getString(right.document_type)) +
      (right.extraction_status === "ready" ? 18 : 0) +
      (getString(right.metadata_json?.content_hash) || getString(right.metadata_json?.document_content_hash) ? 10 : 0) +
      (typeof right.semantic_confidence === "number" ? Math.round(right.semantic_confidence * 10) : 0);
    return rightScore - leftScore;
  });

  for (const row of sortedDocumentRows) {
    const canonicalUrl = getString(row.canonical_url);
    const documentType = getString(row.document_type);
    const hintType = documentType ? classifyPriorScanHintType(documentType) : null;
    const urlKey = canonicalUrl ? getPriorScanHintUrlKey(canonicalUrl) : null;
    if (
      crawlSeedHints.length >= PRIOR_SCAN_ACCELERATION_MAX_CRAWL_SEEDS ||
      !canonicalUrl ||
      !documentType ||
      !hintType ||
      !urlKey ||
      !isProbablyPublicHttpUrl(canonicalUrl) ||
      seenUrls.has(urlKey) ||
      seenHintTypes.has(hintType)
    ) {
      continue;
    }

    seenUrls.add(urlKey);
    seenHintTypes.add(hintType);
    selectedDocumentSources.push({
      canonicalUrl,
      confidence: typeof row.semantic_confidence === "number" ? row.semantic_confidence : null,
      documentType,
      sourceUrl: getString(row.source_url)
    });
    crawlSeedHints.push({
      confidence: typeof row.semantic_confidence === "number" ? row.semantic_confidence : null,
      hintType,
      source: "prior_scan_hint",
      sourceCompletedAt: selectedCandidate.row.completed_at,
      sourceScanId: selectedCandidate.row.id,
      url: canonicalUrl
    });
  }

  for (const row of selectedCandidate.highYieldRows) {
    const pageUrl = getString(row.page_url);
    const urlKey = pageUrl ? getPriorScanHintUrlKey(pageUrl) : null;
    if (
      crawlSeedHints.length >= PRIOR_SCAN_ACCELERATION_MAX_CRAWL_SEEDS ||
      !pageUrl ||
      !urlKey ||
      !isProbablyPublicHttpUrl(pageUrl) ||
      seenUrls.has(urlKey)
    ) {
      continue;
    }
    const hintType = classifyPriorScanPageHintType(getString(row.page_type), pageUrl);
    const confidence = hintType === "high_yield_page" ? 0.55 : hintType === "homepage_final_url" ? 0.65 : 0.7;
    seenUrls.add(urlKey);
    selectedHighYieldPages.push({
      confidence,
      hintType,
      url: pageUrl
    });
    crawlSeedHints.push({
      confidence,
      hintType,
      source: "prior_scan_hint",
      sourceCompletedAt: selectedCandidate.row.completed_at,
      sourceScanId: selectedCandidate.row.id,
      url: pageUrl
    });
  }

  if (crawlSeedHints.length === 0) {
    return null;
  }

  return {
    crawlSeedHints,
    priorScan: {
      crawlSeedHintCount: crawlSeedHints.length,
      crawlSeedHintTypes: [...new Set(crawlSeedHints.map((hint) => hint.hintType))],
      priorScanSelectionReason: buildPriorScanSelectionReason({
        documentSourceCount: selectedDocumentSources.length,
        highYieldPageCount: selectedHighYieldPages.length,
        matchedByDomainId: selectedCandidate.row.matched_by_domain_id,
        matchedByNormalizedUrl: selectedCandidate.row.matched_by_normalized_url
      }),
      priorScanSelectionScore: selectedCandidate.score,
      priorHitScanProfile: "hint_first",
      selectedDocumentSourceCount: selectedDocumentSources.length,
      selectedHighYieldPageCount: selectedHighYieldPages.length,
      sourceCompletedAt: selectedCandidate.row.completed_at,
      sourceScanId: selectedCandidate.row.id
    },
    selectedDocumentSources,
    selectedHighYieldPages
  };
}

export async function upsertUsageCounter(input: {
  counterId?: string | null;
  metricKey: string;
  organizationId: string;
  periodEnd: string;
  periodStart: string;
  value: number;
}) {
  if (input.counterId) {
    await query(`update usage_counters set value = $2 where id = $1`, [input.counterId, input.value]);
    return;
  }

  await query(
    `insert into usage_counters (organization_id, metric_key, period_start, period_end, value)
     values ($1, $2, $3, $4, $5)`,
    [input.organizationId, input.metricKey, input.periodStart, input.periodEnd, input.value]
  );
}

export async function createQueuedFullScan(input: QueuedFullScanInsert): Promise<{ id: string }> {
  const data = await queryOne<{ id: string }>(
    `insert into scans (
       organization_id,
       domain_id,
       submitted_by_user_id,
       scan_type,
       status,
       pages_requested,
       pages_scanned,
       scan_config_json,
       queue_priority,
       queue_origin
     )
     values ($1, $2, $3, $4, 'queued', $5, 0, $6, $7, $8)
     returning id`,
    [
      input.organizationId,
      input.domainId,
      input.submittedByUserId,
      input.scanType ?? "full",
      input.pagesRequested,
      input.scanConfigJson,
      input.queuePriority ?? 50,
      input.queueOrigin ?? "user"
    ]
  );

  if (!data) {
    throw new Error("Could not create full scan: Unknown error");
  }

  return { id: data.id };
}

export async function insertQueuedFullScanEvent(input: {
  domainId: string;
  eventType: string;
  message: string;
  metadataJson: Record<string, unknown>;
  organizationId: string | null;
  scanId: string;
}) {
  await query(
    `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [input.scanId, input.domainId, input.organizationId, input.eventType, input.message, input.metadataJson]
  );
}

export async function updateDomainLatestScan(input: {
  completedAt?: string | null;
  domainId: string;
  organizationId: string;
  scanId: string;
}) {
  await query(
    `update domains
        set latest_scan_id = $3,
            last_scanned_at = coalesce($4::timestamptz, last_scanned_at)
      where id = $1
        and organization_id = $2`,
    [input.domainId, input.organizationId, input.scanId, input.completedAt ?? null]
  );
}

export async function loadRecentDomainBenchmarkEvent(input: {
  domainId: string;
  eventType: string;
  scanId: string;
}): Promise<DomainBenchmarkEventRow | null> {
  return await queryOne<DomainBenchmarkEventRow>(
    `select metadata_json
       from scan_events
      where domain_id = $1
        and event_type = $2
        and scan_id <> $3
      order by created_at desc
      limit 1`,
    [input.domainId, input.eventType, input.scanId],
    { readOnly: true }
  );
}

export async function insertScanEventRecord(input: {
  domainId: string | null;
  eventType: string;
  message: string;
  metadataJson: Record<string, unknown> | null;
  organizationId: string | null;
  scanId: string;
}) {
  await query(
    `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
     values ($1, $2, $3, $4, $5, $6)`,
    [input.scanId, input.domainId, input.organizationId, input.eventType, input.message, input.metadataJson]
  );
}

export async function persistScanReportFindingCount(input: {
  count: number;
  scanId: string;
}) {
  await query(
    `update scan_snapshots
        set report_finding_count = $2
      where scan_id = $1`,
    [input.scanId, input.count]
  );
}

export async function loadScanDetailArtifacts(scanId: string): Promise<{
  accessibilityRuleCounts: Array<Record<string, unknown>>;
  accessibilityRuleExamples: Array<Record<string, unknown>>;
  documentSources: Array<Record<string, unknown>>;
  events: ScanEventQueryRow[];
  macroEnrichment: Record<string, unknown> | null;
  pageEvidence: Array<Record<string, unknown>>;
  policyEnrichment: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  preconsentViolations: ScanPreconsentViolationRow[];
  runtimeArtifacts: Record<string, unknown> | null;
  signals: ScanSignalQueryRow[];
  signalHits: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
  validationRunId: string | null;
}> {
  const [
    events,
    snapshot,
    signals,
    runtimeArtifacts,
    preconsentViolations,
    trackerVendors,
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    policyEnrichment,
    policyReviewQueue,
    documentSources,
    macroEnrichmentResult,
    pageEvidenceResult,
    signalHitsResult,
    validationRun
  ] = await Promise.all([
    query<ScanEventQueryRow>(
      `select id, event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [scanId], { readOnly: true }),
    query<ScanSignalQueryRow>(
      `select category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at
         from scan_signals
        where scan_id = $1
        order by category asc, signal_key asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [scanId], { readOnly: true }),
    query<ScanPreconsentViolationRow>(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, script_host, matched_signature_id, evidence_urls
         from scan_preconsent_violations
        where scan_id = $1
        order by vendor_category asc, vendor_name asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id
         from scan_tracker_vendors
        where scan_id = $1
        order by vendor_category asc, vendor_name asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select rule_code, rule_group, severity, instance_count
         from scan_accessibility_rule_counts
        where scan_id = $1
        order by instance_count desc, rule_code asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select page_url, rule_code, rule_group, severity, impact, help, help_url, description, node_count, representative_selectors, representative_nodes
         from scan_accessibility_rule_examples
        where scan_id = $1
        order by node_count desc, rule_code asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
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
    ).then((result) => result.rows),
    query<Record<string, unknown>>(
      `select id, source, source_status, document_type, source_url, canonical_url, title, document_text, extraction_status, semantic_confidence, evidence_refs, extracted_fields_json, metadata_json
         from scan_document_sources
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    queryOne<Record<string, unknown>>(`select * from scan_macro_enrichments where scan_id = $1`, [scanId], { readOnly: true }).then(
      (row) => ({ data: row, error: null as QueryErrorLike })
    ).catch((error) => ({ data: null, error: { message: getErrorMessage(error) } as QueryErrorLike })),
    query<Record<string, unknown>>(
      `select evidence_id, page_url, page_type, page_role, matched_text, metadata
         from scan_page_evidence
        where scan_id = $1`,
      [scanId],
      { readOnly: true }
    ).then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
      .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } as QueryErrorLike })),
    query<Record<string, unknown>>(
      `select id, signal_key, page_url, page_type, page_role, evidence_refs, matched_text, matched_snippet, payload
         from scan_signal_hits
        where scan_id = $1`,
      [scanId],
      { readOnly: true }
    ).then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
      .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: getErrorMessage(error) } as QueryErrorLike })),
    queryOne<{ id?: string }>(
      `select id
         from validation_runs
        where scan_id = $1
        order by created_at desc
        limit 1`,
      [scanId],
      { readOnly: true }
    )
  ]);

  if (macroEnrichmentResult.error && !isMissingOptionalTableError(macroEnrichmentResult.error)) {
    throw new Error(`Failed to load scan macro enrichment: ${macroEnrichmentResult.error.message}`);
  }
  if (pageEvidenceResult.error && !isMissingOptionalTableError(pageEvidenceResult.error)) {
    throw new Error(`Failed to load scan page evidence: ${pageEvidenceResult.error.message}`);
  }
  if (signalHitsResult.error && !isMissingOptionalTableError(signalHitsResult.error)) {
    throw new Error(`Failed to load scan signal hits: ${signalHitsResult.error.message}`);
  }

  return {
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    documentSources,
    events,
    macroEnrichment: macroEnrichmentResult.data ?? null,
    pageEvidence: pageEvidenceResult.data,
    policyEnrichment,
    policyReviewQueue,
    preconsentViolations,
    runtimeArtifacts,
    signals,
    signalHits: signalHitsResult.data,
    snapshot,
    trackerVendors,
    validationRunId: validationRun?.id ?? null
  };
}

export async function loadScanValidationFindingRows(
  scanId: string,
  validationRunId: string
): Promise<{
  findings: ScanValidationRunFindingRow[];
}> {
  const baseFindingRows = await query<ScanValidationRunFindingRow>(
    `select id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json
       from validation_run_findings
      where validation_run_id = $1
      order by finding_rank asc`,
    [validationRunId],
    { readOnly: true }
  ).then((result) => result.rows);
  const findingIds = baseFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, ScanValidationVerdictRow>();

  if (findingIds.length > 0) {
    const verdictRows = await query<ScanValidationVerdictRow>(
      `select validation_run_finding_id, verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation
         from validation_verdicts
        where validation_run_finding_id = any($1::uuid[])
        order by created_at desc`,
      [findingIds],
      { readOnly: true }
    ).then((result) => result.rows);

    for (const row of verdictRows) {
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
  const previousSnapshot = input.previousScanId
    ? await queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.previousScanId], { readOnly: true })
    : null;
  const previousTrackerRows = input.previousScanId
    ? await query<Record<string, unknown>>(
        `select vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id
           from scan_tracker_vendors
          where scan_id = $1`,
        [input.previousScanId],
        { readOnly: true }
      ).then((result) => result.rows)
    : [];
  const relatedPreviewSnapshot = input.domainField
    ? await queryOne<Record<string, unknown>>(
        `select *
           from scan_snapshots
          where domain = $1
            and crawl_source = 'preview'
            and scan_id <> $2
          order by scan_timestamp desc
          limit 1`,
        [input.domainField, input.scanId],
        { readOnly: true }
      )
    : null;
  const previousPolicyRows = input.previousScanId
    ? await query<Record<string, unknown>>(
        `select *
           from policy_enrichment
          where scan_id = $1
          order by created_at asc`,
        [input.previousScanId],
        { readOnly: true }
      ).then((result) => result.rows)
    : [];

  return {
    previousPolicyRows,
    previousSnapshot: previousSnapshot ?? null,
    previousTrackerRows,
    relatedPreviewSnapshot: relatedPreviewSnapshot ?? null
  };
}

export async function loadPolicyEvidenceByHash(policyEvidenceHashes: string[]): Promise<Map<string, string>> {
  if (!policyEvidenceHashes.length) {
    return new Map();
  }

  const rows = await query<{ evidence_hash: string; snippet: string }>(
    `select evidence_hash, snippet
       from policy_evidence
      where evidence_hash = any($1::text[])`,
    [policyEvidenceHashes],
    { readOnly: true }
  ).then((result) => result.rows);

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
  const limitClauses: string[] = [];
  const limitParams: Array<number> = [];
  const baseParamCount = 1;
  if (typeof input?.from === "number" && typeof input?.to === "number") {
    const offset = input.from;
    const limit = input.to - input.from + 1;
    limitParams.push(limit, offset);
    limitClauses.push(
      `limit $${baseParamCount + limitParams.length - 1} offset $${baseParamCount + limitParams.length}`
    );
  } else if (typeof input?.limit === "number") {
    limitParams.push(input.limit);
    limitClauses.push(`limit $${baseParamCount + limitParams.length}`);
  }

  const scanRowsPromise = query<OrganizationScanQueryRow>(
    `
      with visible_scans as (
        select distinct on (s.id)
          s.id,
          s.domain_id,
          coalesce(workspace_domain.id, case when source_domain.organization_id = $1 then source_domain.id else null end) as display_domain_id,
          coalesce(workspace_domain.hostname, case when source_domain.organization_id = $1 then source_domain.hostname else source_domain.hostname end) as display_hostname,
          coalesce(workspace_domain.last_scanned_at, case when source_domain.organization_id = $1 then source_domain.last_scanned_at else null end) as display_last_scanned_at,
          coalesce(workspace_domain.latest_scan_id, case when source_domain.organization_id = $1 then source_domain.latest_scan_id else null end) as display_latest_scan_id,
          s.scan_type,
          s.status,
          s.pages_requested,
          s.pages_scanned,
          s.created_at,
          s.started_at,
          s.completed_at
        from scans s
        left join domains source_domain
          on source_domain.id = s.domain_id
        left join scan_requests scan_request
          on scan_request.organization_id = $1
         and coalesce(scan_request.fulfilled_by_scan_id, scan_request.scan_id) = s.id
        left join domains workspace_domain
          on workspace_domain.organization_id = $1
         and (
           workspace_domain.latest_scan_id = s.id
           or lower(workspace_domain.hostname) = lower(coalesce(scan_request.normalized_domain, source_domain.hostname))
           or lower(workspace_domain.normalized_url) = lower(coalesce(scan_request.normalized_url, source_domain.normalized_url))
         )
        where s.organization_id = $1
           or scan_request.id is not null
           or workspace_domain.latest_scan_id = s.id
        order by s.id, workspace_domain.id nulls last, scan_request.requested_at desc nulls last
      )
      select *
      from visible_scans
      order by created_at desc
      ${limitClauses.join(" ")}
    `,
    [organizationId, ...limitParams],
    { readOnly: true }
  ).then((result) => result.rows);
  const countPromise = input?.includeCount
    ? queryOne<{ count: number }>(
        `select count(*)::int as count from scans where organization_id = $1`,
        [organizationId],
        { readOnly: true }
      )
    : Promise.resolve(null);

  let scanRows: OrganizationScanQueryRow[];
  let countRow: { count: number } | null;
  try {
    [scanRows, countRow] = await Promise.all([scanRowsPromise, countPromise]);
  } catch (error) {
    throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
  }

  const scanIds = scanRows.map((scan) => scan.id);
  const domainIds = [...new Set(scanRows.flatMap((scan) => {
    const domainId = scan.display_domain_id ?? scan.domain_id;
    return domainId ? [domainId] : [];
  }))];
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
    ? query<OrganizationScanDomainRow>(
        `
          select id, hostname, last_scanned_at, latest_scan_id
          from domains
          where organization_id = $1
            and id = any($2::uuid[])
        `,
        [organizationId, domainIds],
        { readOnly: true }
      )
        .then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
        .catch((error) => ({
          data: [] as OrganizationScanDomainRow[],
          error: { message: getErrorMessage(error) } as QueryErrorLike
        }))
    : Promise.resolve({ data: [] as OrganizationScanDomainRow[], error: null as QueryErrorLike });
  const domainsWithoutLastScannedAtPromise = domainIds.length
    ? query<OrganizationScanDomainRow>(
        `
          select id, hostname, latest_scan_id
          from domains
          where organization_id = $1
            and id = any($2::uuid[])
        `,
        [organizationId, domainIds],
        { readOnly: true }
      )
        .then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
        .catch((error) => ({
          data: [] as OrganizationScanDomainRow[],
          error: { message: getErrorMessage(error) } as QueryErrorLike
        }))
    : Promise.resolve({ data: [] as OrganizationScanDomainRow[], error: null as QueryErrorLike });
  const snapshotsPromise = summaryScanIds.length
    ? query<OrganizationScanSnapshotRow>(
        `
          select
            *
          from scan_snapshots
          where scan_id = any($1::uuid[])
        `,
        [summaryScanIds],
        { readOnly: true }
      )
        .then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
        .catch((error) => ({
          data: [] as OrganizationScanSnapshotRow[],
          error: { message: getErrorMessage(error) } as QueryErrorLike
        }))
    : Promise.resolve({ data: [] as OrganizationScanSnapshotRow[], error: null as QueryErrorLike });
  const snapshotsFallbackPromise = summaryScanIds.length
    ? query<OrganizationScanSnapshotRow>(
        `
          select
            *
          from scan_snapshots
          where scan_id = any($1::uuid[])
        `,
        [summaryScanIds],
        { readOnly: true }
      )
        .then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
        .catch((error) => ({
          data: [] as OrganizationScanSnapshotRow[],
          error: { message: getErrorMessage(error) } as QueryErrorLike
        }))
    : Promise.resolve({ data: [] as OrganizationScanSnapshotRow[], error: null as QueryErrorLike });
  const runtimeArtifactsPromise = summaryScanIds.length
    ? query<OrganizationRuntimeArtifactRow>(
        `
          select
            *
          from scan_runtime_artifacts
          where scan_id = any($1::uuid[])
        `,
        [summaryScanIds],
        { readOnly: true }
      )
        .then((result) => ({ data: result.rows, error: null as QueryErrorLike }))
        .catch((error) => ({
          data: [] as OrganizationRuntimeArtifactRow[],
          error: { message: getErrorMessage(error) } as QueryErrorLike
        }))
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
      try {
        const data = await query<OrganizationChangeSummaryRow>(
          `
            select scan_id_current, event_type
            from compliance_change_events
            where organization_id = $1
              and scan_id_current = any($2::uuid[])
          `,
          [organizationId, scanIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);
        changeSummaries.push(...data);
      } catch (error) {
        changeSummariesError = { message: getErrorMessage(error) };
        break;
      }
    }
  }

  const domainRows = (domains ?? []) as OrganizationScanDomainRow[];
  const latestDomainScanIds = [...new Set(domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : [])))];
  let domainCompletedScans: OrganizationDomainCompletedScanRow[] = [];
  if (domainIds.length) {
    try {
      domainCompletedScans = await query<OrganizationDomainCompletedScanRow>(
        `
          select domain_id, completed_at
          from scans
          where organization_id = $1
            and status = 'completed'
            and completed_at is not null
            and domain_id = any($2::uuid[])
          order by completed_at desc
        `,
        [organizationId, domainIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
    }
  }

  let latestDomainScans: OrganizationLatestDomainScanRow[] = [];
  if (latestDomainScanIds.length) {
    try {
      latestDomainScans = await query<OrganizationLatestDomainScanRow>(
        `
          select id, status
          from scans
          where id = any($1::uuid[])
        `,
        [latestDomainScanIds],
        { readOnly: true }
      ).then((result) => result.rows);
    } catch (error) {
      throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
    }
  }

  const snapshotMap = new Map(((resolvedSnapshots ?? []) as OrganizationScanSnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const zeroSignalScanIds = summaryScanIds.filter((scanId) => {
    const totalSignals = snapshotMap.get(scanId)?.total_signals ?? null;
    return totalSignals === null || totalSignals === 0;
  });
  const signalCountMap = new Map<string, number>();
  if (zeroSignalScanIds.length) {
    for (const scanIdBatch of chunkValues(zeroSignalScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      let signalCountRows: OrganizationSignalCountRow[];
      try {
        signalCountRows = await query<OrganizationSignalCountRow>(
          `
            select scan_id
            from scan_signals
            where population_source = 'scanner'
              and scan_id = any($1::uuid[])
          `,
          [scanIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);
      } catch (error) {
        throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
      }

      for (const row of signalCountRows) {
        signalCountMap.set(row.scan_id, (signalCountMap.get(row.scan_id) ?? 0) + 1);
      }
    }
  }

  const validationRuns: OrganizationValidationRunSummaryRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      try {
        const validationRunRows = await query<OrganizationValidationRunSummaryRow>(
          `
            select id, scan_id, finding_count, created_at
            from validation_runs
            where scan_id = any($1::uuid[])
            order by created_at desc
          `,
          [scanIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);

        validationRuns.push(...validationRunRows);
      } catch (error) {
        throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
      }
    }
  }

  const diagnosticEvents: OrganizationScanDiagnosticEventRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      try {
        const diagnosticEventRows = await query<OrganizationScanDiagnosticEventRow>(
          `
            select scan_id, event_type, message, metadata_json, created_at
            from scan_events
            where scan_id = any($1::uuid[])
            order by created_at asc
          `,
          [scanIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);

        diagnosticEvents.push(...diagnosticEventRows);
      } catch (error) {
        throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
      }
    }
  }

  const policyEnrichmentRows: OrganizationPolicyEnrichmentRow[] = [];
  if (summaryScanIds.length) {
    for (const scanIdBatch of chunkValues(summaryScanIds, CHANGE_EVENT_BATCH_SIZE)) {
      try {
        const policyRows = await query<OrganizationPolicyEnrichmentRow>(
          `
            select *
            from policy_enrichment
            where scan_id = any($1::uuid[])
            order by created_at asc
          `,
          [scanIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);

        policyEnrichmentRows.push(...policyRows);
      } catch (error) {
        throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
      }
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
      try {
        const data = await query<OrganizationValidationFindingSummaryRow>(
          `
            select
              id,
              validation_run_id,
              category,
              subtype,
              finding_family,
              finding_source,
              finding_scope,
              finding_subject,
              rule_key,
              title,
              description,
              severity,
              page_url,
              evidence_json
            from validation_run_findings
            where validation_run_id = any($1::uuid[])
          `,
          [validationRunIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);

        validationFindingRows.push(...data);
      } catch (error) {
        throw new Error(`Failed to load organization scans: ${getErrorMessage(error)}`);
      }
    }
  }

  const validationFindingIds = validationFindingRows.map((row) => row.id);
  const verdictByFindingId = new Map<string, OrganizationValidationVerdictRow>();

  if (validationFindingIds.length > 0) {
    for (const findingIdBatch of chunkValues(validationFindingIds, CHANGE_EVENT_BATCH_SIZE)) {
      let data: OrganizationValidationVerdictRow[];
      try {
        data = await query<OrganizationValidationVerdictRow>(
          `
            select
              validation_run_finding_id,
              verdict,
              confidence,
              rationale,
              agreement_score,
              model,
              prompt_version,
              evidence_json,
              created_at,
              system_confidence_score,
              system_confidence_band,
              system_confidence_explanation
            from validation_verdicts
            where validation_run_finding_id = any($1::uuid[])
            order by created_at desc
          `,
          [findingIdBatch],
          { readOnly: true }
        ).then((result) => result.rows);
      } catch (error) {
        throw new Error(`Failed to load organization scan verdicts: ${getErrorMessage(error)}`);
      }

      for (const row of data) {
        if (!verdictByFindingId.has(row.validation_run_finding_id)) {
          verdictByFindingId.set(row.validation_run_finding_id, row);
        }
      }
    }
  }

  return {
    changeSummaries,
    changeSummariesError,
    count: countRow?.count ?? null,
    diagnosticEvents,
    domainCompletedScans,
    domains: domainRows,
    latestDomainScans,
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
  const legacyEvents: LegacyScanEventRow[] = [];
  let legacyEventsError: QueryErrorLike = null;

  for (const scanIdBatch of chunkValues(scanIds, CHANGE_EVENT_BATCH_SIZE)) {
    try {
      const data = await query<LegacyScanEventRow>(
        `
          select id, scan_id, event_type, message, metadata_json, created_at
          from scan_events
          where organization_id = $1
            and scan_id = any($2::uuid[])
            and event_type = any($3::text[])
          order by created_at desc
        `,
        [organizationId, scanIdBatch, [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed]],
        { readOnly: true }
      ).then((result) => result.rows);

      legacyEvents.push(...data);
    } catch (error) {
      legacyEventsError = { message: getErrorMessage(error) };
      break;
    }
  }

  if (legacyEventsError) {
    throw new Error(`Failed to load organization scans: ${legacyEventsError.message}`);
  }

  return legacyEvents;
}

export { isMissingComplianceChangeEventsTable };
