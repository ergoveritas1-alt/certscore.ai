import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { buildScanCalibrationSummary } from "../lib/scans/calibration-summary";
import { deriveCaliforniaPrivacyCoveragePolicyOutcomes } from "../lib/scans/california-privacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "../lib/scans/gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprEprivacyCoveragePolicyOutcomes,
  type GdprEprivacyCoveragePolicyEvent
} from "../lib/scans/gdpr-eprivacy-coverage-policy";
import {
  dedupeHeadlineFindings,
  deriveConsentAuditFindings
} from "../lib/scans/consent-audit-findings";
import { deriveCertScoreFindings } from "../lib/scans/derive-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "../lib/scans/executive-findings-projection";
import { deriveHighRiskTrackingContext } from "../lib/scans/high-risk-tracking-context";
import { getHybridDerivedTrackerVendors, withHybridRuntimeArtifactFallbacks } from "../lib/scans/hybrid-runtime-evidence";
import { buildNanoPolicyInputsFromDocumentSources, shouldPreferNanoDocumentSources } from "../lib/scans/nano-document-sources";
import { buildNormalizedConcerns } from "../lib/scans/normalized-concerns";
import { deriveRuntimeVendorDisclosureEvidenceFromRetainedSources } from "../lib/scans/runtime-vendor-disclosure";
import { buildScanReportUnifiedFindingState } from "../lib/scans/scan-report-unified-findings";
import type { UnifiedFindingDisplayPacket } from "../lib/scans/unified-findings";
import { repairFindingFamilyPacketEvents } from "../server/scans/family-packet-event-repair";
import { loadMergedSignalsByScanId } from "../server/scans/merged-signal-summary";
import { deriveSignalEnrichmentWorkflowState } from "../../../packages/shared/src/utils/scan-signal-workflow";

type ScanRow = {
  id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

type ScanSignalRow = {
  population_source: string | null;
  signal_key: string;
};

type ScanTrackerVendorRecord = {
  beforeConsent: boolean | null;
  collectionEndpointType: string;
  confidence: number;
  detectionSource: string;
  firstPartyOrThirdParty: string;
  matchedSignatureId: string | null;
  scriptHost: string | null;
  vendorCategory: string;
  vendorName: string;
};

type CaliforniaCohortSummaryRow = {
  cipaCommunication: string;
  cipaRecording: string;
  cmp: string;
  cmpExcludedFromDirectAdtech: boolean;
  collectionNotice: string;
  domain: string;
  gpc: string;
  notes: string[];
  optOut: string;
  privacyNotice: string;
  rows: Record<string, {
    status: string;
  }>;
  saleShare: string;
  scanId: string;
  sensitiveContext: string;
};

type GdprEprivacyCohortSummaryRow = {
  domain: string;
  insufficientEvidenceCount: number;
  notTestableCount: number;
  rows: Record<string, {
    assessmentStatus: string;
    evidenceState: string;
    status: string;
  }>;
  scanId: string;
};

function getDocumentSourceStatusCount(rows: Array<Record<string, unknown>>, status: string) {
  return rows.filter((row) => {
    const value = row.source_status;
    return typeof value === "string" ? value === status : false;
  }).length;
}

type DomainRow = {
  hostname: string;
  id: string;
  max_pages_override: number | null;
  normalized_url: string;
};

type ScanIdentityRow = {
  domain: string | null;
  hostname: string | null;
  id: string;
};

const DEFAULT_ORG_ID = "2f2ef2a2-d86b-4993-8bd5-de912e7de905";
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 8 * 60_000;
const DEFAULT_ENRICHMENT_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 5_000;
function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

async function enqueueNanoSignalEnrichment(scanId: string) {
  await query(
    `
      insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
      values ($1, null, null, $2, $3, $4)
    `,
    [
      scanId,
      SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
      "Nano document signal enrichment requested.",
      { stage: "nano_doc_signals" }
    ]
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function getMultiArgValue(flag: string) {
  const values: string[] = [];
  const argv = process.argv.slice(2);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token !== flag) {
      continue;
    }

    for (let valueIndex = index + 1; valueIndex < argv.length; valueIndex += 1) {
      const value = argv[valueIndex];
      if (!value || value.startsWith("--")) {
        break;
      }
      values.push(value);
    }
  }

  return values.length > 0 ? values.join(" ") : null;
}

function getListArg(flag: string) {
  const raw = getArgValue(flag);
  if (!raw) {
    return [];
  }

  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function isMissingColumnError(error: { code?: string | null; message?: string | null } | null | undefined, column: string) {
  const message = error?.message ?? "";
  return (
    message.includes(`Could not find the '${column}' column`) ||
    message.includes(`column "${column}"`) ||
    message.includes(`column ${column} does not exist`) ||
    (message.includes(column) && message.includes("does not exist"))
  );
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function getAverage(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function diffMs(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) {
    return null;
  }

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(0, endMs - startMs);
}

function toIsoString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

function stripDbRecord(record: Record<string, unknown> | null | undefined) {
  if (!record) {
    return null;
  }

  const next = { ...record };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function normalizeTrackerVendorRows(
  rows: Array<Record<string, unknown>>,
  runtimeArtifacts: Record<string, unknown> | null
): ScanTrackerVendorRecord[] {
  const persistedTrackerVendors = rows.map(
    (tracker) =>
      ({
        beforeConsent: typeof tracker.before_consent === "boolean" ? tracker.before_consent : null,
        collectionEndpointType: String(tracker.collection_endpoint_type ?? "unknown"),
        confidence: Number(tracker.confidence ?? 0),
        detectionSource: String(tracker.detection_source ?? "unknown"),
        firstPartyOrThirdParty: String(tracker.first_party_or_third_party ?? "unknown"),
        matchedSignatureId: typeof tracker.matched_signature_id === "string" ? tracker.matched_signature_id : null,
        scriptHost: typeof tracker.script_host === "string" ? tracker.script_host : null,
        vendorCategory: String(tracker.vendor_category ?? "unknown"),
        vendorName: String(tracker.vendor_name ?? "unknown")
      }) satisfies ScanTrackerVendorRecord
  );
  const runtimeDerivedTrackerVendors = getHybridDerivedTrackerVendors(runtimeArtifacts).map(
    (tracker) =>
      ({
        beforeConsent: tracker.beforeConsent,
        collectionEndpointType: tracker.collectionEndpointType,
        confidence: tracker.confidence,
        detectionSource: tracker.detectionSource,
        firstPartyOrThirdParty: tracker.firstPartyOrThirdParty,
        matchedSignatureId: tracker.matchedSignatureId,
        scriptHost: tracker.scriptHost,
        vendorCategory: tracker.vendorCategory,
        vendorName: tracker.vendorName
      }) satisfies ScanTrackerVendorRecord
  );

  return [
    ...new Map(
      [...persistedTrackerVendors, ...runtimeDerivedTrackerVendors].map((tracker) => [
        `${tracker.vendorName}|${tracker.detectionSource}|${tracker.scriptHost ?? ""}`,
        tracker
      ])
    ).values()
  ].sort(
    (left, right) =>
      left.vendorCategory.localeCompare(right.vendorCategory) ||
      left.vendorName.localeCompare(right.vendorName) ||
      (left.scriptHost ?? "").localeCompare(right.scriptHost ?? "")
  );
}

function getStringArrayFromRecord(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          values.push(entry.trim());
        }
      }
    }
  }
  return [...new Set(values)];
}

function getRuntimeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function compactNames(values: string[], limit = 4) {
  const unique = [...new Set(values.filter((value) => value.trim().length > 0))];
  if (unique.length === 0) {
    return "none";
  }
  if (unique.length <= limit) {
    return unique.join(", ");
  }
  return `${unique.slice(0, limit).join(", ")} +${unique.length - limit}`;
}

function getOutcomeStatus(
  outcomes: ReturnType<typeof deriveCaliforniaPrivacyCoveragePolicyOutcomes>,
  rowId: string
) {
  return outcomes[rowId]?.status ?? "missing";
}

function buildCaliforniaCohortSummaryRow(input: {
  domain: string;
  events: GdprEprivacyCoveragePolicyEvent[];
  runtimeArtifacts: Record<string, unknown> | null;
  scanCompleted: boolean;
  scanId: string;
  snapshot: Record<string, unknown> | null;
}): CaliforniaCohortSummaryRow {
  const normalizedConcerns = buildNormalizedConcerns({
    reviewFindingCandidates: [],
    runtimeArtifacts: input.runtimeArtifacts,
    validationFindings: []
  });
  const outcomes = deriveCaliforniaPrivacyCoveragePolicyOutcomes({
    coverageLimited:
      input.snapshot?.coverage_level === "limited" ||
      input.snapshot?.coverage_level === "limited_partial" ||
      input.snapshot?.partial_scan === true ||
      input.snapshot?.blocked_flag === true,
    events: input.events,
    normalizedConcerns,
    runtimeArtifacts: input.runtimeArtifacts,
    scanCompleted: input.scanCompleted
  });
  const californiaEvidence = getRuntimeRecord(
    input.runtimeArtifacts?.californiaPrivacyEvidence ?? input.runtimeArtifacts?.california_privacy_evidence
  );
  const directAdtech = getStringArrayFromRecord(californiaEvidence, [
    "directAdvertisingSharingVendors",
    "direct_advertising_sharing_vendors",
    "directSaleShareOrTargetedAdvertisingVendors",
    "direct_sale_share_or_targeted_advertising_vendors"
  ]);
  const analyticsContext = getStringArrayFromRecord(californiaEvidence, [
    "analyticsTagManagementVendors",
    "analytics_tag_management_vendors",
    "analyticsOrMeasurementVendors",
    "analytics_or_measurement_vendors"
  ]);
  const highRiskContext = deriveHighRiskTrackingContext({
    evidenceUrls: [
      ...getStringArrayFromRecord(input.runtimeArtifacts, ["consent_baseline_tracker_evidence_urls", "consentBaselineTrackerEvidenceUrls"]),
      ...getStringArrayFromRecord(input.runtimeArtifacts, ["consent_post_reject_tracker_evidence_urls", "consentPostRejectTrackerEvidenceUrls"])
    ],
    hostname: input.domain,
    runtimeArtifacts: input.runtimeArtifacts,
    snapshot: input.snapshot,
    thirdPartyDomains: [
      ...getStringArrayFromRecord(input.runtimeArtifacts, ["third_party_request_domains", "thirdPartyRequestDomains"]),
      ...getStringArrayFromRecord(input.runtimeArtifacts, ["script_src_domains", "scriptSrcDomains"])
    ]
  });
  const cmpNames = highRiskContext.cmpVendors.map((vendor) => vendor.name);
  const notes = [
    `CMP excluded from direct adtech: ${cmpNames.every((name) => !directAdtech.includes(name)) ? "yes" : "no"}`,
    directAdtech.length > 0 ? `direct: ${compactNames(directAdtech)}` : null,
    analyticsContext.length > 0 ? `analytics/context: ${compactNames(analyticsContext)}` : null
  ].filter((note): note is string => typeof note === "string");
  const rows = Object.fromEntries(
    Object.entries(outcomes).map(([rowId, outcome]) => [
      rowId,
      {
        status: outcome.status
      }
    ])
  );

  return {
    cipaCommunication: getOutcomeStatus(outcomes, "cipa_sensitive_communication_interception"),
    cipaRecording: getOutcomeStatus(outcomes, "cipa_sensitive_interaction_recording"),
    cmp: compactNames(cmpNames),
    cmpExcludedFromDirectAdtech: cmpNames.every((name) => !directAdtech.includes(name)),
    collectionNotice: getOutcomeStatus(outcomes, "notice_at_collection"),
    domain: input.domain,
    gpc: getOutcomeStatus(outcomes, "gpc_opt_out_signal_handling"),
    notes,
    optOut: getOutcomeStatus(outcomes, "do_not_sell_share_availability"),
    privacyNotice: getOutcomeStatus(outcomes, "privacy_notice_availability"),
    rows,
    saleShare: getOutcomeStatus(outcomes, "targeted_advertising_signals"),
    scanId: input.scanId,
    sensitiveContext: getOutcomeStatus(outcomes, "limit_use_sensitive_pi")
  };
}

function normalizeGdprStatusKey(status: string) {
  return status.toLowerCase().replaceAll(" ", "_");
}

function buildGdprEprivacyCohortSummaryRow(input: {
  domain: string;
  events: GdprEprivacyCoveragePolicyEvent[];
  projectedFindings: ReturnType<typeof projectExecutiveFindingsFromUnifiedPackets>["findings"];
  runtimeArtifacts: Record<string, unknown> | null;
  scanCompleted: boolean;
  scanId: string;
  snapshot: Record<string, unknown> | null;
  unifiedFindings: UnifiedFindingDisplayPacket[];
}): GdprEprivacyCohortSummaryRow {
  const coverageLimited =
    input.snapshot?.coverage_level === "limited" ||
    input.snapshot?.coverage_level === "limited_partial" ||
    input.snapshot?.partial_scan === true ||
    input.snapshot?.blocked_flag === true;
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    coverageLimited,
    events: input.events,
    policyEnrichmentCount: null,
    runtimeArtifacts: input.runtimeArtifacts,
    scanCompleted: input.scanCompleted,
    snapshot: input.snapshot
  });
  const checklist = deriveGdprEprivacyCoverageChecklist({
    coverageLimited,
    coverageOutcomes: outcomes,
    projectedFindings: input.projectedFindings,
    scanCompleted: input.scanCompleted,
    unifiedFindings: input.unifiedFindings
  });
  const rows = Object.fromEntries(
    checklist.map((item) => [
      item.id,
      {
        assessmentStatus: item.assessmentStatus,
        evidenceState: item.evidenceState,
        status: normalizeGdprStatusKey(item.status)
      }
    ])
  );

  return {
    domain: input.domain,
    insufficientEvidenceCount: checklist.filter((item) => item.status === "Insufficient evidence").length,
    notTestableCount: checklist.filter((item) => item.status === "Not testable").length,
    rows,
    scanId: input.scanId
  };
}

const tableColumnPresenceCache = new Map<string, boolean>();

async function hasTableColumn(tableName: string, columnName: string) {
  const key = `${tableName}.${columnName}`;
  const cached = tableColumnPresenceCache.get(key);
  if (typeof cached === "boolean") {
    return cached;
  }

  const row = await queryOne<{ exists: boolean }>(
    `
      select exists (
        select 1
          from information_schema.columns
         where table_schema = 'public'
           and table_name = $1
           and column_name = $2
      ) as "exists"
    `,
    [tableName, columnName],
    { readOnly: true }
  );
  const exists = row?.exists === true;
  tableColumnPresenceCache.set(key, exists);
  return exists;
}

function getScanConfig(input: {
  maxPages: number;
  maxRequestedTier?: string | null;
  processor: string;
  profile: string;
  runtimeFast?: boolean;
}) {
  return {
    ...(input.runtimeFast
      ? {
          execution: {
            scanPlanProfileOverride: "runtime_fast"
          }
        }
      : {}),
    ...(input.maxRequestedTier ? { maxRequestedTier: input.maxRequestedTier } : {}),
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: input.processor,
    profile: input.profile,
    maxPages: input.maxPages,
    source: "codex-scan-batch-eval"
  };
}

async function ensureDomain(input: {
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
}) {
  const existing = await queryOne<DomainRow>(
    `
      select id, hostname, normalized_url, max_pages_override
      from domains
      where organization_id = $1
        and normalized_url = $2
    `,
    [input.organizationId, input.normalizedUrl],
    { readOnly: true }
  );

  if (existing) {
    return existing;
  }

  const inserted = await queryOne<DomainRow>(
    `
      insert into domains (organization_id, hostname, normalized_url, status)
      values ($1, $2, $3, 'active')
      returning id, hostname, normalized_url, max_pages_override
    `,
    [input.organizationId, input.hostname, input.normalizedUrl]
  );

  if (!inserted) {
    throw new Error(`Failed to create domain ${input.hostname}: Unknown error`);
  }

  return inserted;
}

async function queueScan(input: {
  domain: DomainRow;
  maxRequestedTier?: string | null;
  organizationId: string;
  processor: string;
  profile: string;
  runtimeFast?: boolean;
  pagesRequestedOverride?: number | null;
}) {
  const pagesRequested = Math.max(1, input.pagesRequestedOverride ?? input.domain.max_pages_override ?? DEFAULT_MAX_PAGES);
  const insertedScan = await queryOne<ScanRow>(
    `
      insert into scans (
        organization_id,
        domain_id,
        submitted_by_user_id,
        scan_type,
        status,
        pages_requested,
        pages_scanned,
        scan_config_json
      )
      values ($1, $2, null, 'full', 'queued', $3, 0, $4)
      returning id, status, created_at, completed_at, error_message
    `,
    [
      input.organizationId,
      input.domain.id,
      pagesRequested,
      getScanConfig({
        maxPages: pagesRequested,
        maxRequestedTier: input.maxRequestedTier,
        processor: input.processor,
        profile: input.profile,
        runtimeFast: input.runtimeFast
      })
    ]
  );

  if (!insertedScan) {
    throw new Error(`Failed to queue scan for ${input.domain.hostname}: Unknown error`);
  }

  await enqueueNanoSignalEnrichment(insertedScan.id).catch((error) => {
    console.error("[scan-batch-eval] nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: insertedScan.id
    });
  });

  return insertedScan;
}

async function waitForCompletion(input: {
  hostname: string;
  scanId: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const scan = await queryOne<ScanRow>(
      `
        select id, status, created_at, completed_at, error_message
        from scans
        where id = $1
      `,
      [input.scanId],
      { readOnly: true }
    );

    if (!scan) {
      throw new Error(`Failed to poll scan ${input.scanId} for ${input.hostname}: Not found`);
    }
    if (scan.status === "completed" || scan.status === "failed" || scan.status === "canceled") {
      return scan;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for scan ${input.scanId} (${input.hostname}) after ${input.timeoutMs}ms`);
}

async function waitForSignalEnrichmentCompletion(input: {
  hostname: string;
  scanId: string;
  timeoutMs: number;
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.timeoutMs) {
    const data = await query<{ created_at: string; event_type: string }>(
      `
        select event_type, created_at
        from scan_events
        where scan_id = $1
          and event_type = any($2::text[])
      `,
      [input.scanId, [
        SCAN_EVENT_TYPES.nanoDocRetrievalCompleted,
        SCAN_EVENT_TYPES.nanoDocRetrievalFailed,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted,
        SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed
      ]],
      { readOnly: true }
    ).then((result) => result.rows);

    const eventTypes = new Set(
      data
        .map((row) => (row && typeof row === "object" ? (row as { event_type?: unknown }).event_type : null))
        .filter((value): value is string => typeof value === "string")
    );

    const retrievalDone =
      eventTypes.has(SCAN_EVENT_TYPES.nanoDocRetrievalCompleted) ||
      eventTypes.has(SCAN_EVENT_TYPES.nanoDocRetrievalFailed);
    const enrichmentDone =
      eventTypes.has(SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted) ||
      eventTypes.has(SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed);

    if (retrievalDone && enrichmentDone) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

async function loadValidationFindingRows(scanId: string) {
  const hasDirectScanId = await hasTableColumn("validation_run_findings", "scan_id").catch(() => false);
  if (hasDirectScanId) {
    return query<{ id: string }>(
      `select id from validation_run_findings where scan_id = $1`,
      [scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as Array<{ id: string }>, error: { message: error instanceof Error ? error.message : String(error) } }));
  }

  const runsResult = await query<{ id: string }>(
    `select id from validation_runs where scan_id = $1`,
    [scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<{ id: string }>, error: { message: error instanceof Error ? error.message : String(error) } }));

  if (runsResult.error) {
    return isMissingOptionalTableError(runsResult.error) || isMissingColumnError(runsResult.error, "scan_id")
      ? { data: [] as Array<{ id: string }>, error: null }
      : runsResult;
  }

  const runIds = runsResult.data
    .map((row) => (row && typeof row === "object" ? (row as { id?: unknown }).id : null))
    .filter((value): value is string => typeof value === "string");

  if (runIds.length === 0) {
    return { data: [] as Array<{ id: string }>, error: null };
  }

  return query<{ id: string }>(
    `select id from validation_run_findings where validation_run_id = any($1::uuid[])`,
    [runIds],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
    .catch((error) => {
      const normalized = { message: error instanceof Error ? error.message : String(error) };
      return isMissingOptionalTableError(normalized) || isMissingColumnError(normalized, "validation_run_id")
        ? { data: [] as Array<{ id: string }>, error: null }
        : { data: [] as Array<{ id: string }>, error: normalized };
    });
}

async function summarizeScan(input: {
  hostname: string;
  scanId: string;
}) {
  const documentSourcesResult = await query<Record<string, unknown>>(
    `select * from scan_document_sources where scan_id = $1 order by created_at asc`,
    [input.scanId],
    { readOnly: true }
  )
    .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
    .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: error instanceof Error ? error.message : String(error) } }));
  const [
    snapshot,
    events,
    policyEnrichment,
    runtimeArtifactsRow,
    trackerVendorsResult,
    signalResult,
    findingsResult,
    scanRow
  ] = await Promise.all([
    queryOne<Record<string, unknown>>(`select * from scan_snapshots where scan_id = $1`, [input.scanId], { readOnly: true }),
    query<ScanEventRow>(
      `select id, event_type, message, metadata_json, created_at from scan_events where scan_id = $1 order by created_at asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows),
    query<Record<string, unknown>>(`select * from policy_enrichment where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true }).then((result) => result.rows),
    queryOne<Record<string, unknown>>(`select * from scan_runtime_artifacts where scan_id = $1`, [input.scanId], { readOnly: true }),
    query<Record<string, unknown>>(`select * from scan_tracker_vendors where scan_id = $1 order by created_at asc`, [input.scanId], { readOnly: true })
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as Array<Record<string, unknown>>, error: { message: error instanceof Error ? error.message : String(error) } })),
    query<ScanSignalRow>(
      `select signal_key, population_source from scan_signals where scan_id = $1 order by signal_key asc`,
      [input.scanId],
      { readOnly: true }
    )
      .then((result) => ({ data: result.rows, error: null as { code?: string | null; message?: string | null } | null }))
      .catch((error) => ({ data: [] as ScanSignalRow[], error: { message: error instanceof Error ? error.message : String(error) } })),
    loadValidationFindingRows(input.scanId),
    queryOne<ScanRow>(
      `select id, status, created_at, started_at, completed_at, error_message from scans where id = $1`,
      [input.scanId],
      { readOnly: true }
    )
  ]);

  const documentSourcesError = documentSourcesResult.error;
  if (documentSourcesError && !isMissingOptionalTableError(documentSourcesError)) {
    throw new Error(`Failed to load document sources for ${input.hostname}: ${documentSourcesError.message}`);
  }
  if (!scanRow) {
    throw new Error(`Failed to load scan row for ${input.hostname}: Not found`);
  }

  let signals = signalResult.data;
  let signalsError = signalResult.error;
  if (signalsError && isMissingColumnError(signalsError, "population_source")) {
    const fallback = await query<{ signal_key: string }>(
      `select signal_key from scan_signals where scan_id = $1 order by signal_key asc`,
      [input.scanId],
      { readOnly: true }
    ).then((result) => result.rows);
    signals = fallback.map((row) => ({
      ...row,
      population_source: null
    }));
    signalsError = null;
  }
  if (signalsError) {
    throw new Error(`Failed to load signals for ${input.hostname}: ${signalsError.message}`);
  }

  if (findingsResult.error) {
    throw new Error(`Failed to load validation findings for ${input.hostname}: ${findingsResult.error.message}`);
  }

  const normalizedDocumentSources = (documentSourcesError ? [] : documentSourcesResult.data) as Array<Record<string, unknown>>;
  const normalizedRuntimeArtifacts = runtimeArtifactsRow
    ? withHybridRuntimeArtifactFallbacks(stripDbRecord(runtimeArtifactsRow) ?? runtimeArtifactsRow) ??
      stripDbRecord(runtimeArtifactsRow)
    : null;
  const trackerVendorsError = trackerVendorsResult.error;
  if (trackerVendorsError && !isMissingOptionalTableError(trackerVendorsError)) {
    throw new Error(`Failed to load tracker vendors for ${input.hostname}: ${trackerVendorsError.message}`);
  }
  const normalizedTrackerVendors = normalizeTrackerVendorRows(
    trackerVendorsError ? [] : trackerVendorsResult.data,
    normalizedRuntimeArtifacts
  );
  const runtimeVendorDisclosureEvidence = deriveRuntimeVendorDisclosureEvidenceFromRetainedSources({
    documentSources: normalizedDocumentSources,
    runtimeArtifacts: normalizedRuntimeArtifacts,
    trackerVendors: normalizedTrackerVendors
  });
  const reportRuntimeArtifacts =
    normalizedRuntimeArtifacts && runtimeVendorDisclosureEvidence.length > 0
      ? {
          ...normalizedRuntimeArtifacts,
          runtime_vendor_disclosure_evidence: runtimeVendorDisclosureEvidence,
          runtimeVendorDisclosureEvidence: runtimeVendorDisclosureEvidence
        }
      : normalizedRuntimeArtifacts;
  const readyDocumentSourceCount = getDocumentSourceStatusCount(normalizedDocumentSources, "ready");
  const rejectedDocumentSourceCount = getDocumentSourceStatusCount(normalizedDocumentSources, "rejected");
  const signalRows = (signals ?? []) as ScanSignalRow[];
  const findingRows = (findingsResult.data ?? []) as Array<Record<string, unknown>>;
  const observedAtByScanId = new Map<string, string | null>([
    [input.scanId, toIsoString(scanRow?.completed_at) ?? toIsoString(scanRow?.started_at) ?? toIsoString(scanRow?.created_at)]
  ]);
  const mergedSignalsByScanId = await loadMergedSignalsByScanId({
    observedAtByScanId,
    scanIds: [input.scanId]
  });
  const preferDocumentSources = shouldPreferNanoDocumentSources(normalizedDocumentSources);
  const policySemanticRows = preferDocumentSources
    ? buildNanoPolicyInputsFromDocumentSources(normalizedDocumentSources)
    : ((policyEnrichment ?? []) as Array<Record<string, unknown>>);
  const normalizedPolicyRows = policySemanticRows.map((row, index) => {
    const next = { ...row };
    if (typeof next.id !== "string") {
      next.id = typeof row.source_document_id === "string" ? row.source_document_id : `document-semantic-${index + 1}`;
    }
    delete next.created_at;
    delete next.updated_at;
    return next;
  });

  const repairedEvents = repairFindingFamilyPacketEvents({
    events: events.map((event) => ({
      createdAt: toIsoString(event.created_at) ?? new Date(0).toISOString(),
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    policyEnrichment: normalizedPolicyRows
  });
  const reportState = buildScanReportUnifiedFindingState({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    events: repairedEvents,
    macroEnrichment: null,
    mergedSignals: mergedSignalsByScanId.get(input.scanId) ?? [],
    pageEvidence: [],
    policyEnrichment: normalizedPolicyRows,
    policyReviewQueue: [],
    preconsentViolations: [],
    primaryPolicyEnrichment: normalizedPolicyRows[0] ?? null,
    runtimeArtifacts: reportRuntimeArtifacts,
    scan: {
      completedAt: toIsoString(scanRow?.completed_at),
      createdAt: toIsoString(scanRow?.created_at) ?? new Date().toISOString(),
      errorMessage: typeof scanRow?.error_message === "string" ? scanRow.error_message : null,
      domainHostname: input.hostname,
      domainId: null,
      executionSummary: null,
      id: input.scanId,
      pagesRequested: 0,
      pagesScanned: typeof snapshot?.pages_scanned === "number" ? snapshot.pages_scanned : 0,
      scanConfigJson: null,
      scanType: "full",
      startedAt: typeof scanRow?.started_at === "string" ? scanRow.started_at : null,
      status: typeof scanRow?.status === "string" ? scanRow.status : "unknown"
    },
    signalHits: [],
    signals: [],
    snapshot,
    trackerVendors: normalizedTrackerVendors,
    validationFindings: []
  } as unknown as Parameters<typeof buildScanReportUnifiedFindingState>[0], {
    deriveAccessibilityIssueRows: () => [],
    deriveAccessibilityRuleEvidenceRows: () => [],
    deriveConsentAuditFindings: (candidateSnapshot, candidateRuntimeArtifacts) =>
      dedupeHeadlineFindings(deriveConsentAuditFindings(candidateSnapshot, candidateRuntimeArtifacts)),
    derivePolicyBehaviorContradictions: () => [],
    derivePreconsentViolationRows: () => [],
    filterContradictoryPositiveSurfaceFindings: (findings) => findings
  });
  const displayPackets = reportState.globalUnifiedFindings;

  const surfaced = displayPackets
    .filter((packet) => packet.presentationDecision.status !== "suppress")
    .map((packet) => ({
      id: packet.unifiedFindingId,
      status: packet.presentationDecision.status,
      decision: packet.surfacingDecision.decisionState,
      url: packet.primaryPageUrl ?? packet.evidence?.pageUrls?.[0] ?? null,
      summary: packet.summary
    }));
  const certScoreSummary = deriveCertScoreFindings({
    events: repairedEvents.map((event) => ({
      eventType: event.eventType,
      metadataJson: event.metadataJson
    })),
    runtimeArtifacts: reportRuntimeArtifacts,
    snapshot,
    scan: {
      completedAt: typeof scanRow?.completed_at === "string" ? scanRow.completed_at : null,
      createdAt: typeof scanRow?.created_at === "string" ? scanRow.created_at : new Date().toISOString(),
      domainHostname: input.hostname
    }
  });
  const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(displayPackets);
  const gdprEprivacyCohortSummary = buildGdprEprivacyCohortSummaryRow({
    domain: input.hostname,
    events: repairedEvents.map((event) => ({
      eventType: event.eventType,
      metadataJson: event.metadataJson
    })),
    projectedFindings: executiveProjection.findings,
    runtimeArtifacts: reportRuntimeArtifacts,
    scanCompleted: scanRow.status === "completed",
    scanId: input.scanId,
    snapshot,
    unifiedFindings: displayPackets
  });
  const calibrationSummary = buildScanCalibrationSummary({
    coverageLevel: typeof snapshot?.coverage_level === "string" ? snapshot.coverage_level : null,
    domain: input.hostname,
    finalHost: certScoreSummary.finalHost,
    legalCoverageScore: typeof snapshot?.legal_coverage_score === "number" ? snapshot.legal_coverage_score : null,
    pagesScanned: typeof snapshot?.pages_scanned === "number" ? snapshot.pages_scanned : null,
    policyEnrichmentCount: normalizedPolicyRows.length,
    posture: executiveProjection.posture,
    requestedHost: certScoreSummary.requestedHost,
    scanId: input.scanId,
    scanOutcome: typeof snapshot?.scan_outcome === "string" ? snapshot.scan_outcome : null,
    status: typeof scanRow?.status === "string" ? scanRow.status : null,
    topFindings: executiveProjection.topFindings,
    verifiedPublicSurfacesCount:
      typeof snapshot?.verified_public_surfaces_count === "number" ? snapshot.verified_public_surfaces_count : null
  });
  const californiaCohortSummary = buildCaliforniaCohortSummaryRow({
    domain: input.hostname,
    events: repairedEvents.map((event) => ({
      createdAt: event.createdAt,
      eventType: event.eventType,
      metadataJson: event.metadataJson
    })),
    runtimeArtifacts: reportRuntimeArtifacts,
    scanCompleted: scanRow.status === "completed",
    scanId: input.scanId,
    snapshot
  });

  const scannerSignalCount = signalRows.filter((row) => !row.population_source || row.population_source === "scanner").length;
  const nanoSignalCount = signalRows.filter((row) => row.population_source === "nano").length;
  const workflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: readyDocumentSourceCount,
    events: events.map((event) => ({
      createdAt: toIsoString(event.created_at) ?? new Date(0).toISOString(),
      eventType: event.event_type
    })),
    findingsCount: findingRows.length,
    mergedSignalCount: signalRows.length,
    nanoSignalCount,
    policyDocumentCount: policySemanticRows.length,
    scanCompletedAt: toIsoString(scanRow?.completed_at),
    scanStatus: typeof scanRow?.status === "string" ? scanRow.status : null,
    scannerSignalCount
  });

  return {
    counts: {
      documentSources: readyDocumentSourceCount,
      rejectedDocumentSources: rejectedDocumentSourceCount,
      totalDocumentSourceRows: normalizedDocumentSources.length,
      findings: findingRows.length,
      nanoSignals: nanoSignalCount,
      scannerSignals: scannerSignalCount,
      totalSignals: signalRows.length
    },
    scan: {
      completedAt: toIsoString(scanRow?.completed_at),
      createdAt: toIsoString(scanRow?.created_at),
      startedAt: toIsoString(scanRow?.started_at),
      status: typeof scanRow?.status === "string" ? scanRow.status : null
    },
    snapshot,
    californiaCohortSummary,
    gdprEprivacyCohortSummary,
    calibrationSummary,
    surfaced,
    workflow
  };
}

async function loadScanIdentity(scanId: string) {
  return queryOne<ScanIdentityRow>(
    `
      select s.id,
             ss.domain,
             d.hostname
        from scans s
        left join scan_snapshots ss on ss.scan_id = s.id
        left join domains d on d.id = s.domain_id
       where s.id = $1
    `,
    [scanId],
    { readOnly: true }
  );
}

function getCaliforniaCohortSummary(row: Record<string, unknown>) {
  return row.californiaCohortSummary && typeof row.californiaCohortSummary === "object"
    ? row.californiaCohortSummary as CaliforniaCohortSummaryRow
    : null;
}

function getGdprEprivacyCohortSummary(row: Record<string, unknown>) {
  return row.gdprEprivacyCohortSummary && typeof row.gdprEprivacyCohortSummary === "object"
    ? row.gdprEprivacyCohortSummary as GdprEprivacyCohortSummaryRow
    : null;
}

function escapeMarkdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function printCaliforniaCohortMarkdownTable(results: Array<Record<string, unknown>>) {
  console.log("| domain | privacy notice | collection notice | sale/share | opt-out | GPC | sensitive context | CIPA recording | CIPA communication | CMP | notes |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of results) {
    const summary = getCaliforniaCohortSummary(row);
    if (!summary) {
      continue;
    }
    console.log([
      summary.domain,
      summary.privacyNotice,
      summary.collectionNotice,
      summary.saleShare,
      summary.optOut,
      summary.gpc,
      summary.sensitiveContext,
      summary.cipaRecording,
      summary.cipaCommunication,
      summary.cmp,
      summary.notes.join("; ")
    ].map(escapeMarkdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

function collectCaliforniaStatusCounts(results: Array<Record<string, unknown>>) {
  const counts = new Map<string, Record<string, number>>();

  for (const result of results) {
    const summary = getCaliforniaCohortSummary(result);
    if (!summary) {
      continue;
    }
    for (const [rowId, row] of Object.entries(summary.rows ?? {})) {
      const bucket = counts.get(rowId) ?? {};
      bucket[row.status] = (bucket[row.status] ?? 0) + 1;
      counts.set(rowId, bucket);
    }
  }

  return [...counts.entries()]
    .map(([rowId, rowCounts]) => ({
      rowId,
      review_signal: rowCounts.review_signal ?? 0,
      statuses: rowCounts
    }))
    .sort((a, b) => b.review_signal - a.review_signal || a.rowId.localeCompare(b.rowId));
}

function collectGdprEprivacyStatusCounts(results: Array<Record<string, unknown>>) {
  const counts = new Map<string, Record<string, number>>();

  for (const result of results) {
    const summary = getGdprEprivacyCohortSummary(result);
    if (!summary) {
      continue;
    }
    for (const [rowId, row] of Object.entries(summary.rows)) {
      const bucket = counts.get(rowId) ?? {};
      bucket[row.status] = (bucket[row.status] ?? 0) + 1;
      counts.set(rowId, bucket);
    }
  }

  return [...counts.entries()]
    .map(([rowId, rowCounts]) => ({
      rowId,
      insufficient_evidence: rowCounts.insufficient_evidence ?? 0,
      not_testable: rowCounts.not_testable ?? 0,
      statuses: rowCounts
    }))
    .sort((a, b) =>
      (b.not_testable + b.insufficient_evidence) - (a.not_testable + a.insufficient_evidence) ||
      a.rowId.localeCompare(b.rowId)
    );
}

function printGdprEprivacyMarkdownTable(results: Array<Record<string, unknown>>) {
  const rowIds = [...new Set(results.flatMap((row) => Object.keys(getGdprEprivacyCohortSummary(row)?.rows ?? {})))];
  console.log(["domain", "not_testable", "insufficient_evidence", ...rowIds].map(escapeMarkdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  console.log(["---", "---", "---", ...rowIds.map(() => "---")].join("|").replace(/^/, "|").replace(/$/, "|"));
  for (const row of results) {
    const summary = getGdprEprivacyCohortSummary(row);
    if (!summary) {
      continue;
    }
    console.log([
      summary.domain,
      summary.notTestableCount,
      summary.insufficientEvidenceCount,
      ...rowIds.map((rowId) => summary.rows[rowId]?.status ?? "missing")
    ].map(escapeMarkdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }
}

async function main() {
  const orgId = getArgValue("--org") ?? DEFAULT_ORG_ID;
  const timeoutMs = Number(getArgValue("--timeout-ms") ?? DEFAULT_TIMEOUT_MS);
  const enrichmentTimeoutMs = Number(getArgValue("--enrichment-timeout-ms") ?? DEFAULT_ENRICHMENT_TIMEOUT_MS);
  const pagesRequestedOverride = getArgValue("--pages");
  const processor = getArgValue("--processor") ?? "queued-full-scan-v1";
  const profile = getArgValue("--profile") ?? "standard";
  const maxRequestedTier = getArgValue("--max-tier");
  const runtimeFast = hasFlag("--runtime-fast");
  const onlySummarize = hasFlag("--summarize-only");
  const queueOnly = hasFlag("--queue-only");
  const aggregateTimings = hasFlag("--aggregate-timings");
  const californiaCohortSummary = hasFlag("--california-cohort-summary");
  const californiaCounts = hasFlag("--california-counts");
  const gdprEprivacySummary = hasFlag("--gdpr-eprivacy-summary");
  const gdprEprivacyCounts = hasFlag("--gdpr-eprivacy-counts");
  const markdownTable = hasFlag("--markdown-table");
  const explicitScanIds = getListArg("--scan-ids");
  const argv = process.argv.slice(2);
  const positionalDomains: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (
      token === "--org" ||
      token === "--timeout-ms" ||
      token === "--enrichment-timeout-ms" ||
      token === "--domains" ||
      token === "--pages" ||
      token === "--processor" ||
      token === "--profile" ||
      token === "--max-tier" ||
      token === "--scan-ids"
    ) {
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      continue;
    }

    positionalDomains.push(token);
  }

  const explicitDomains = getMultiArgValue("--domains");
  const parsedBatch = parseDomainBatchInput(explicitDomains ?? positionalDomains.join(" "));

  if (explicitScanIds.length === 0 && parsedBatch.valid.length === 0) {
    throw new Error("Provide at least one valid domain with --domains.");
  }

  if (explicitScanIds.length > 0 && !onlySummarize) {
    throw new Error("Use --summarize-only with --scan-ids.");
  }

  if (onlySummarize && queueOnly) {
    throw new Error("Use either --summarize-only or --queue-only, not both.");
  }

  const results: Array<Record<string, unknown>> = [];

  for (const scanId of explicitScanIds) {
    const identity = await loadScanIdentity(scanId);
    if (!identity) {
      results.push({
        domain: null,
        pendingReason: "scan_not_found",
        scanId,
        surfaced: []
      });
      continue;
    }

    const hostname = identity.domain ?? identity.hostname ?? scanId;
    const summary = await summarizeScan({
      hostname,
      scanId
    });

    results.push({
      counts: summary.counts,
      domain: hostname,
      scanId,
      scan: {
        completedAt: summary.scan.completedAt,
        createdAt: summary.scan.createdAt,
        endToEndDurationMs: diffMs(summary.scan.createdAt, summary.scan.completedAt),
        runDurationMs: diffMs(summary.scan.startedAt ?? summary.scan.createdAt, summary.scan.completedAt),
        startedAt: summary.scan.startedAt,
        status: summary.scan.status
      },
      scanOutcome: (summary.snapshot as Record<string, unknown> | null)?.scan_outcome ?? null,
      stopReason: (summary.snapshot as Record<string, unknown> | null)?.stop_reason_code ?? null,
      homepageStatus: (summary.snapshot as Record<string, unknown> | null)?.homepage_fetch_http_status ?? null,
      blocked: (summary.snapshot as Record<string, unknown> | null)?.blocked_flag ?? null,
      calibrationSummary: summary.calibrationSummary,
      workflow: {
        actualMode: summary.workflow.actualMode,
        findingsReady: summary.workflow.findingsReady,
        mergedSignalsReady: summary.workflow.mergedSignalsReady,
        timings: summary.workflow.timings
      },
      californiaCohortSummary: summary.californiaCohortSummary,
      gdprEprivacyCohortSummary: summary.gdprEprivacyCohortSummary,
      surfaced: summary.surfaced
    });
  }

  if (explicitScanIds.length > 0) {
    if (californiaCounts) {
      console.log(JSON.stringify(collectCaliforniaStatusCounts(results), null, 2));
      return;
    }
    if (gdprEprivacyCounts) {
      console.log(JSON.stringify(collectGdprEprivacyStatusCounts(results), null, 2));
      return;
    }
    if (gdprEprivacySummary && markdownTable) {
      printGdprEprivacyMarkdownTable(results);
      return;
    }
    if (gdprEprivacySummary) {
      console.log(JSON.stringify(results.map((row) => row.gdprEprivacyCohortSummary), null, 2));
      return;
    }
    if (californiaCohortSummary && markdownTable) {
      printCaliforniaCohortMarkdownTable(results);
      return;
    }
    if (californiaCohortSummary) {
      console.log(JSON.stringify(results.map((row) => row.californiaCohortSummary), null, 2));
      return;
    }
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  for (const entry of parsedBatch.valid) {
    const domain = await ensureDomain({
      hostname: entry.hostname,
      normalizedUrl: entry.normalizedUrl,
      organizationId: orgId
    });

    let scanId: string;
    if (onlySummarize) {
      const latest = await queryOne<{ id: string; created_at: string; status: string }>(
        `
          select id, created_at, status
          from scans
          where organization_id = $1
            and domain_id = $2
            and scan_type = 'full'
            and status = any($3::text[])
          order by created_at desc
          limit 1
        `,
        [orgId, domain.id, ["completed", "failed", "canceled"]],
        { readOnly: true }
      );

      if (!latest) {
        results.push({
          domain: domain.hostname,
          pendingReason: "no_terminal_scan",
          scanId: null,
          surfaced: []
        });
        continue;
      }

      scanId = latest.id;
    } else if (queueOnly) {
      const queued = await queueScan({
        domain,
        maxRequestedTier,
        organizationId: orgId,
        pagesRequestedOverride: pagesRequestedOverride ? Number(pagesRequestedOverride) : null,
        processor,
        profile,
        runtimeFast
      });

      results.push({
        domain: domain.hostname,
        scanId: queued.id,
        queuedAt: queued.created_at,
        status: queued.status
      });

      continue;
    } else {
      const queued = await queueScan({
        domain,
        maxRequestedTier,
        organizationId: orgId,
        pagesRequestedOverride: pagesRequestedOverride ? Number(pagesRequestedOverride) : null,
        processor,
        profile,
        runtimeFast
      });

      scanId = queued.id;
      await waitForCompletion({
        hostname: domain.hostname,
        scanId,
        timeoutMs
      });
      await waitForSignalEnrichmentCompletion({
        hostname: domain.hostname,
        scanId,
        timeoutMs: enrichmentTimeoutMs
      }).catch(() => undefined);
    }

    const summary = await summarizeScan({
      hostname: domain.hostname,
      scanId
    });

    results.push({
      counts: summary.counts,
      domain: domain.hostname,
      scanId,
      scan: {
        completedAt: summary.scan.completedAt,
        createdAt: summary.scan.createdAt,
        endToEndDurationMs: diffMs(summary.scan.createdAt, summary.scan.completedAt),
        runDurationMs: diffMs(summary.scan.startedAt ?? summary.scan.createdAt, summary.scan.completedAt),
        startedAt: summary.scan.startedAt,
        status: summary.scan.status
      },
      scanOutcome: (summary.snapshot as Record<string, unknown> | null)?.scan_outcome ?? null,
      stopReason: (summary.snapshot as Record<string, unknown> | null)?.stop_reason_code ?? null,
      homepageStatus: (summary.snapshot as Record<string, unknown> | null)?.homepage_fetch_http_status ?? null,
      blocked: (summary.snapshot as Record<string, unknown> | null)?.blocked_flag ?? null,
      calibrationSummary: summary.calibrationSummary,
      workflow: {
        actualMode: summary.workflow.actualMode,
        findingsReady: summary.workflow.findingsReady,
        mergedSignalsReady: summary.workflow.mergedSignalsReady,
        timings: summary.workflow.timings
      },
      californiaCohortSummary: summary.californiaCohortSummary,
      surfaced: summary.surfaced
    });
  }

  if (aggregateTimings) {
    const mergedValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { timeToMergedSignalsMs?: unknown } } | undefined)?.timings;
        return typeof timings?.timeToMergedSignalsMs === "number" ? timings.timeToMergedSignalsMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const findingsValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { timeToFindingsMs?: unknown } } | undefined)?.timings;
        return typeof timings?.timeToFindingsMs === "number" ? timings.timeToFindingsMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const retrievalValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { nanoDocRetrievalDurationMs?: unknown } } | undefined)?.timings;
        return typeof timings?.nanoDocRetrievalDurationMs === "number" ? timings.nanoDocRetrievalDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const signalValues = results
      .map((row) => {
        const timings = (row.workflow as { timings?: { nanoDocSignalsDurationMs?: unknown } } | undefined)?.timings;
        return typeof timings?.nanoDocSignalsDurationMs === "number" ? timings.nanoDocSignalsDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const endToEndValues = results
      .map((row) => {
        const scan = row.scan as { endToEndDurationMs?: unknown } | undefined;
        return typeof scan?.endToEndDurationMs === "number" ? scan.endToEndDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const runValues = results
      .map((row) => {
        const scan = row.scan as { runDurationMs?: unknown } | undefined;
        return typeof scan?.runDurationMs === "number" ? scan.runDurationMs : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    console.log(
      JSON.stringify(
        {
          aggregateTimingSummary: {
            averageEndToEndDurationMs: getAverage(endToEndValues),
            averageRunDurationMs: getAverage(runValues),
            domains: results.length,
            medianEndToEndDurationMs: getMedian(endToEndValues),
            medianNanoDocRetrievalDurationMs: getMedian(retrievalValues),
            medianNanoDocSignalsDurationMs: getMedian(signalValues),
            medianRunDurationMs: getMedian(runValues),
            medianTimeToFindingsMs: getMedian(findingsValues),
            medianTimeToMergedSignalsMs: getMedian(mergedValues)
          },
          results
        },
        null,
        2
      )
    );
    return;
  }

  if (californiaCohortSummary && markdownTable) {
    printCaliforniaCohortMarkdownTable(results);
    return;
  }
  if (californiaCounts) {
    console.log(JSON.stringify(collectCaliforniaStatusCounts(results), null, 2));
    return;
  }
  if (californiaCohortSummary) {
    console.log(JSON.stringify(results.map((row) => row.californiaCohortSummary), null, 2));
    return;
  }

  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePools().catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  });
