"use server";

import {
  type AccessPostureClass,
  type BlockPageClassification,
  type BlockVendorGuess,
  type MergedSignalRecord,
  type PopulatedSignalRecord,
  type RecoverableFindingClass,
  type ScanExecutionTier,
  buildAgencyMappings,
  buildRegulatoryRiskAssessment,
  getScannerExecutionSummary,
  type AgencyMapping,
  type RegulatoryRiskAssessment,
  type ScannerExecutionSummary
} from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import { getHybridNanoSignalPopulations, withHybridRuntimeArtifactFallbacks } from "../../lib/scans/hybrid-runtime-evidence";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy, type PrimaryScanCategoryId } from "../../lib/scans/signal-taxonomy";
import { deriveSupplementalSnapshotSignals } from "../../lib/scans/scan-detail-supplemental-signals";
import { deriveSupplementalCoverageSignals, type SupplementalCoverageSignal } from "../../lib/scans/supplemental-coverage-signals";
import { deriveSupplementalPolicySignals, type SupplementalPolicySignal } from "../../lib/scans/supplemental-policy-signals";
import { getHybridDerivedTrackerVendors } from "../../lib/scans/hybrid-runtime-evidence";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { loadSupplementalValidationFindingsForScan } from "../validation/repository";
import {
  collectPolicyEvidenceHashes,
  dereferencePolicyEvidenceSnippets
} from "./policy-enrichment-normalization";
import { repairFindingFamilyPacketEvents } from "./family-packet-event-repair";

export type ScanDetailRecord = {
  id: string;
  domainId: string | null;
  domainHostname: string | null;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  scanConfigJson: Record<string, unknown> | null;
  executionSummary: ScannerExecutionSummary | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

export type ScanEventRecord = {
  id: string;
  eventType: string;
  message: string;
  metadataJson: unknown;
  createdAt: string;
};

export type ScanSignalRecord = {
  category: string;
  primaryCategory: PrimaryScanCategoryId;
  primaryCategoryDescription: string;
  primaryCategoryLabel: string;
  key: string;
  label: string;
  subcategory: string | null;
  value: boolean | number | string | string[];
  valueType: string;
};

export type ScanMergedSignalRecord = MergedSignalRecord;

export type ScanSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type ScanRuntimeArtifactRecord = {
  [key: string]: unknown;
} | null;

export type RelatedPreviewSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type PreviousSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type PolicyEnrichmentRecord = {
  [key: string]: unknown;
};

export type PolicyReviewQueueRecord = {
  [key: string]: unknown;
};

export type ScanTrackerVendorRecord = {
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

export type TrackerChangeRecord = {
  changeType: "added" | "removed";
  confidence: number;
  previousScanId: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type PreconsentChangeRecord = {
  changeType: "new" | "resolved";
  confidence: number;
  previousScanId: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type PreconsentViolationRecord = {
  collectionEndpointType: string;
  confidence: number;
  detectionSource: string;
  evidenceUrls: string[];
  firstPartyOrThirdParty: string;
  matchedSignatureId: string | null;
  scriptHost: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type AccessibilityRuleCountRecord = {
  instanceCount: number;
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

export type AccessibilityRuleExampleRecord = {
  description: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  nodeCount: number;
  pageUrl: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

export type ScanValidationFindingRecord = ScanValidationFinding;

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_config_json: Record<string, unknown> | null;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

function getPrimaryPolicyEnrichment(rows: Array<Record<string, unknown>>) {
  return rows.find((row) => row.page_type === "privacy_policy" || row.pageType === "privacy_policy") ?? rows[0] ?? null;
}

function deriveHostnameFromTargetUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function getStringRecordValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function buildStoredSignalPopulationRecords(input: {
  observedAt: string | null;
  rows: SignalRow[];
  source: "nano" | "validation";
}) {
  return input.rows.flatMap((row) => {
    const populationStatus =
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : "present";

    return [
      {
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value): value is string => typeof value === "string") : [],
        key: row.signal_key,
        label: row.signal_label,
        observedAt: row.observed_at ?? input.observedAt,
        populationStatus,
        provenance: Array.isArray(row.provenance_json)
          ? row.provenance_json.filter(
              (
                value
              ): value is { detail: string; kind: "document" | "runtime" | "signal" | "validation" } =>
                Boolean(value) &&
                typeof value === "object" &&
                typeof (value as { detail?: unknown }).detail === "string" &&
                ((value as { kind?: unknown }).kind === "document" ||
                  (value as { kind?: unknown }).kind === "runtime" ||
                  (value as { kind?: unknown }).kind === "signal" ||
                  (value as { kind?: unknown }).kind === "validation")
            )
          : [],
        reportSignalSource: "policy_enrichment_signal",
        source: input.source,
        value: row.signal_value_json,
        valueType:
          row.value_type === "boolean" || row.value_type === "number" || row.value_type === "text" || row.value_type === "string_array"
            ? row.value_type
            : Array.isArray(row.signal_value_json)
              ? "string_array"
              : typeof row.signal_value_json === "boolean"
                ? "boolean"
                : typeof row.signal_value_json === "number"
                  ? "number"
                  : "text"
      } satisfies PopulatedSignalRecord
    ];
  });
}

function deriveHostnameFromScanConfig(value: Record<string, unknown> | null | undefined) {
  const directUrl = deriveHostnameFromTargetUrl(
    getStringRecordValue(value, ["targetUrl", "startUrl", "homepageUrl", "normalizedUrl", "url"])
  );
  if (directUrl) {
    return directUrl;
  }

  const executionSummary =
    value && typeof value.executionSummary === "object" && value.executionSummary !== null && !Array.isArray(value.executionSummary)
      ? (value.executionSummary as Record<string, unknown>)
      : null;
  const stages = Array.isArray(executionSummary?.stages) ? executionSummary.stages : [];

  for (const stage of stages) {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      continue;
    }

    const metadata =
      "metadata" in stage &&
      stage.metadata &&
      typeof stage.metadata === "object" &&
      !Array.isArray(stage.metadata)
        ? (stage.metadata as Record<string, unknown>)
        : null;
    const hostname = deriveHostnameFromTargetUrl(
      getStringRecordValue(metadata, ["targetUrl", "startUrl", "homepageUrl", "finalUrl", "resolvedHostname", "canonicalHost"])
    );
    if (hostname) {
      return hostname;
    }
  }

  return null;
}

type SignalRow = {
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

type PreconsentViolationRow = {
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

type AccessibilityRuleCountRow = {
  instance_count: number;
  rule_code: string;
  rule_group: string;
  severity: string;
};

type AccessibilityRuleExampleRow = {
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

type ValidationRunFindingRow = {
  category: string | null;
  description: string | null;
  evidence_json: Record<string, unknown> | null;
  finding_family: string | null;
  finding_scope: string | null;
  finding_source: string | null;
  finding_subject: string | null;
  id: string;
  rule_key: string;
  severity: string | null;
  subtype: string | null;
  title: string;
  page_url: string | null;
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

function stripSnapshotRecord(snapshot: Record<string, unknown>) {
  const next = { ...snapshot };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function stripTimestampFields(record: Record<string, unknown>) {
  const next = { ...record };
  delete next.created_at;
  delete next.updated_at;
  return next;
}


function normalizeSupplementalPolicySignals(signals: SupplementalPolicySignal[]): ScanSignalRecord[] {
  return signals.map((signal) => {
    const taxonomy = mapSignalKeyToTaxonomy({
      category: signal.category,
      key: signal.key,
      label: signal.label
    });

    return {
      category: signal.category,
      primaryCategory: taxonomy.primaryCategory,
      primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
      primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
      key: signal.key,
      label: signal.label,
      subcategory: taxonomy.subcategory ?? null,
      value: signal.value,
      valueType: "boolean"
    } satisfies ScanSignalRecord;
  });
}

function buildScannerSignalPopulationRecords(input: {
  observedAt: string | null;
  signals: ScanSignalRecord[];
}): PopulatedSignalRecord[] {
  return input.signals.map((signal) => ({
    confidence: 1,
    evidenceRefs: [],
    key: signal.key,
    label: signal.label,
    observedAt: input.observedAt,
    populationStatus: "present",
    provenance: [
      {
        detail: "scanner_retained_signal",
        kind: "signal"
      }
    ],
    reportSignalSource:
      signal.key.startsWith("privacy.") && /reject_reduced|weak_cookie_security|gpc_signal_not_honored/i.test(signal.key)
        ? "runtime_artifact_signal"
        : signal.key.startsWith("privacy.") ||
            signal.key.startsWith("commerce.") ||
            signal.key.startsWith("financial.") ||
            signal.key.startsWith("entity.") ||
            signal.key.startsWith("disclosure.") ||
            signal.key.startsWith("context.") ||
            signal.key.startsWith("accessibility.")
          ? "snapshot_signal"
          : null,
    source: "scanner",
    value: signal.value,
    valueType:
      signal.valueType === "number" || signal.valueType === "string_array" || signal.valueType === "text"
        ? signal.valueType
        : "boolean"
  }));
}

function mergeRelatedPreviewSnapshot(
  snapshot: Record<string, unknown> | null,
  relatedPreviewSnapshot: Record<string, unknown> | null
) {
  if (!snapshot) {
    return null;
  }

  if (!relatedPreviewSnapshot) {
    return snapshot;
  }

  const merged = { ...snapshot };
  const previewFallbackFields = [
    "tracking_before_consent_detected",
    "preconsent_tracking_detected",
    "third_party_cookie_set_before_consent",
    "cookie_banner_present",
    "reject_all_present",
    "granular_preferences_present",
    "consent_maturity_score",
    "tracker_regulatory_risk_score",
    "mentions_gdpr",
    "cross_border_transfer_mechanism_detected",
    "mentions_cross_border_transfer"
  ];

  for (const field of previewFallbackFields) {
    const currentValue = merged[field];
    const previewValue = relatedPreviewSnapshot[field];

    if ((currentValue === null || currentValue === undefined || currentValue === false || currentValue === 0) && previewValue !== null && previewValue !== undefined) {
      merged[field] = previewValue;
    }
  }

  return merged;
}

async function loadScanDetailRecord(input: {
  organizationId: string | null;
  scanId: string;
  allowAnonymousFallback?: boolean;
  anonymousOnly?: boolean;
  viewerEmail?: string | null;
}) {
  const supabase = createAdminClient();
  const adminCanViewAnonymousScans = isPlatformAdminEmail(input.viewerEmail);
  const allowAnonymousAccess = input.anonymousOnly === true || input.allowAnonymousFallback === true || adminCanViewAnonymousScans;

  const loadScan = async (organizationId: string | null) => {
    let query = supabase
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
    return null;
  }

  const scanRow = scan as ScanRow;
  let domainHostname: string | null = null;
  const scanOrganizationId = (scanRow as ScanRow & { organization_id?: string | null }).organization_id ?? null;

  if (scanRow.domain_id) {
    let domainQuery = supabase.from("domains").select("id, hostname").eq("id", scanRow.domain_id);
    domainQuery =
      scanOrganizationId === null && adminCanViewAnonymousScans
        ? domainQuery.is("organization_id", null)
        : domainQuery.eq("organization_id", input.organizationId);

    const { data: domain } = await domainQuery.maybeSingle();

    domainHostname = (domain as DomainRow | null)?.hostname ?? null;
  }

  if (!domainHostname) {
    domainHostname = deriveHostnameFromScanConfig(scanRow.scan_config_json ?? null);
  }

  const previousScanPromise =
    scanRow.domain_id && scanOrganizationId !== null
      ? supabase
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
    { data: previousScan },
    { data: validationRun }
  ] = await Promise.all([
    supabase
      .from("scan_events")
      .select("id, event_type, message, metadata_json, created_at")
      .eq("scan_id", input.scanId)
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_snapshots")
      .select("*")
      .eq("scan_id", input.scanId)
      .maybeSingle(),
    supabase
      .from("scan_signals")
      .select("category, signal_key, signal_label, signal_value_json, value_type, population_source, population_status, confidence, evidence_refs, provenance_json, observed_at")
      .eq("scan_id", input.scanId)
      .order("category", { ascending: true })
      .order("signal_key", { ascending: true }),
    supabase
      .from("scan_runtime_artifacts")
      .select("*")
      .eq("scan_id", input.scanId)
      .maybeSingle(),
    supabase
      .from("scan_preconsent_violations")
      .select(
        "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, script_host, matched_signature_id, evidence_urls"
      )
      .eq("scan_id", input.scanId)
      .order("vendor_category", { ascending: true })
      .order("vendor_name", { ascending: true }),
    supabase
      .from("scan_tracker_vendors")
      .select(
        "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id"
      )
      .eq("scan_id", input.scanId)
      .order("vendor_category", { ascending: true })
      .order("vendor_name", { ascending: true }),
    supabase
      .from("scan_accessibility_rule_counts")
      .select("rule_code, rule_group, severity, instance_count")
      .eq("scan_id", input.scanId)
      .order("instance_count", { ascending: false })
      .order("rule_code", { ascending: true }),
    supabase
      .from("scan_accessibility_rule_examples")
      .select("page_url, rule_code, rule_group, severity, impact, help, help_url, description, node_count, representative_selectors")
      .eq("scan_id", input.scanId)
      .order("node_count", { ascending: false })
      .order("rule_code", { ascending: true }),
    supabase
      .from("policy_enrichment")
      .select("*")
      .eq("scan_id", input.scanId)
      .order("created_at", { ascending: true }),
    supabase
      .from("policy_review_queue")
      .select("*")
      .eq("scan_id", input.scanId)
      .order("created_at", { ascending: true }),
    previousScanPromise,
    supabase
      .from("validation_runs")
      .select("id")
      .eq("scan_id", input.scanId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (eventsError) {
    throw new Error(`Failed to load scan events: ${eventsError.message}`);
  }

  let validationFindings: ScanValidationFindingRecord[] = [];
  const validationRunId = (validationRun as { id?: string } | null)?.id ?? null;

  if (validationRunId) {
    const { data: validationFindingRows, error: validationFindingsError } = await supabase
      .from("validation_run_findings")
      .select(
        "id, category, subtype, finding_family, finding_source, finding_scope, finding_subject, rule_key, title, description, severity, page_url, evidence_json, validation_verdicts ( verdict, confidence, rationale, agreement_score, model, prompt_version, evidence_json, created_at, system_confidence_score, system_confidence_band, system_confidence_explanation )"
      )
      .eq("validation_run_id", validationRunId)
      .order("finding_rank", { ascending: true });

    if (validationFindingsError) {
      throw new Error(`Failed to load validation findings for scan ${input.scanId}: ${validationFindingsError.message}`);
    }

    const findingRows = (validationFindingRows ?? []) as ValidationRunFindingRow[];

    validationFindings = findingRows.map((row) => {
      const verdictRows = Array.isArray(row.validation_verdicts)
        ? row.validation_verdicts
        : row.validation_verdicts
          ? [row.validation_verdicts]
          : [];
      const verdict = verdictRows[0];

      return {
        agreementScore: verdict?.agreement_score ?? null,
        category: row.category,
        description: row.description,
        evidence: row.evidence_json ?? null,
        findingFamily: row.finding_family,
        findingScope: row.finding_scope,
        findingSource: row.finding_source,
        findingSubject: row.finding_subject,
        id: row.id,
        model: verdict?.model ?? null,
        modelConfidence: verdict?.confidence ?? null,
        pageUrl: row.page_url,
        promptVersion: verdict?.prompt_version ?? null,
        rationale: verdict?.rationale ?? null,
        ruleKey: row.rule_key,
        severity: row.severity,
        subtype: row.subtype,
        systemConfidenceBand: verdict?.system_confidence_band ?? null,
        systemConfidenceExplanation: verdict?.system_confidence_explanation ?? null,
        systemConfidenceScore: verdict?.system_confidence_score ?? null,
        title: row.title,
        verdict: verdict?.verdict ?? null
      } satisfies ScanValidationFindingRecord;
    });

    const supplementalValidationFindings = await loadSupplementalValidationFindingsForScan({
      existingFindings: validationFindings.map((finding) => ({
        ruleKey: finding.ruleKey,
        title: finding.title
      })),
      scanId: input.scanId
    });

    validationFindings = [...validationFindings, ...supplementalValidationFindings];
  }

  const previousSnapshot = previousScan?.id
    ? (
        await supabase.from("scan_snapshots").select("*").eq("scan_id", previousScan.id).maybeSingle()
      ).data
    : null;
  const previousTrackerRows = previousScan?.id
    ? (
        await supabase
          .from("scan_tracker_vendors")
          .select(
            "vendor_name, vendor_category, detection_source, confidence, first_party_or_third_party, collection_endpoint_type, before_consent, script_host, matched_signature_id"
          )
          .eq("scan_id", previousScan.id)
      ).data ?? []
    : [];
  const relatedPreviewSnapshot =
    snapshot && typeof (snapshot as Record<string, unknown>).domain === "string"
      ? (
          await supabase
            .from("scan_snapshots")
            .select("*")
            .eq("domain", (snapshot as Record<string, unknown>).domain as string)
            .eq("crawl_source", "preview")
            .neq("scan_id", input.scanId)
            .order("scan_timestamp", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data
      : null;
  const previousPolicyRows = previousScan?.id
    ? (
        await supabase.from("policy_enrichment").select("*").eq("scan_id", previousScan.id).order("created_at", { ascending: true })
      ).data ?? []
    : [];
  const rawPolicyEnrichmentRows = ((policyEnrichment ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const policyEvidenceHashes = collectPolicyEvidenceHashes(rawPolicyEnrichmentRows);
  const policyEvidenceByHash =
    policyEvidenceHashes.length > 0
      ? new Map(
          (
            (
              await supabase
                .from("policy_evidence")
                .select("evidence_hash, snippet")
                .in("evidence_hash", policyEvidenceHashes)
            ).data ?? []
          )
            .filter(
              (row): row is { evidence_hash: string; snippet: string } =>
                Boolean(row) && typeof row.evidence_hash === "string" && typeof row.snippet === "string"
            )
            .map((row) => [row.evidence_hash, row.snippet] as const)
        )
      : new Map<string, string>();
  const normalizedPolicyEnrichment = dereferencePolicyEvidenceSnippets({
    evidenceByHash: policyEvidenceByHash,
    rows: rawPolicyEnrichmentRows
  });
  const normalizedPolicyReviewQueue = ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const primaryPolicyEnrichment = getPrimaryPolicyEnrichment(normalizedPolicyEnrichment);
  const previousPrimaryPolicyEnrichment = getPrimaryPolicyEnrichment((previousPolicyRows as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row)));
  const rawNormalizedEvents: ScanEventRecord[] = ((events ?? []) as ScanEventRow[]).map(
    (event) =>
      ({
        id: event.id,
        eventType: event.event_type,
        message: event.message,
        metadataJson: event.metadata_json,
        createdAt: event.created_at
      }) satisfies ScanEventRecord
  );
  const normalizedRelatedPreviewSnapshot = relatedPreviewSnapshot
    ? stripSnapshotRecord(relatedPreviewSnapshot as Record<string, unknown>)
    : null;
  const rawSignalRows = ((signals ?? []) as SignalRow[]);
  const scannerSignalRows = rawSignalRows.filter((signal) => !signal.population_source || signal.population_source === "scanner");
  const storedNanoSignalRows = rawSignalRows.filter((signal) => signal.population_source === "nano");
  const storedValidationSignalRows = rawSignalRows.filter((signal) => signal.population_source === "validation");
  const normalizedSignals = scannerSignalRows.map(
    (signal) => {
      const taxonomy = mapSignalKeyToTaxonomy({
        category: signal.category,
        key: signal.signal_key,
        label: signal.signal_label
      });

      return {
        category: signal.category,
        primaryCategory: taxonomy.primaryCategory,
        primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
        primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
        key: signal.signal_key,
        label: signal.signal_label,
        subcategory: taxonomy.subcategory ?? null,
        value: signal.signal_value_json,
        valueType: signal.value_type
      } satisfies ScanSignalRecord;
    }
  );
  const normalizedEvents: ScanEventRecord[] = repairFindingFamilyPacketEvents({
    events: rawNormalizedEvents,
    policyEnrichment: normalizedPolicyEnrichment
  });
  const supplementalCoverageSignals = deriveSupplementalCoverageSignals({
    events: normalizedEvents,
    existingSignals: normalizedSignals
  });
  const normalizedSnapshot = snapshot
    ? ({
        ...stripSnapshotRecord(snapshot as Record<string, unknown>),
        ...supplementalCoverageSignals.snapshotOverrides
      } satisfies Record<string, unknown>)
    : null;
  const supplementalSnapshotSignals = deriveSupplementalSnapshotSignals({
    existingSignals: normalizedSignals,
    events: normalizedEvents,
    primaryPolicyEnrichment,
    snapshot: normalizedSnapshot
  });
  const supplementalPolicySignals = normalizeSupplementalPolicySignals(deriveSupplementalPolicySignals({
    existingSignalKeys: normalizedSignals.map((signal) => signal.key),
    policyEnrichment: normalizedPolicyEnrichment,
    primaryPolicyEnrichment,
    snapshot: normalizedSnapshot
  }));
  const scannerSignalPopulations = buildScannerSignalPopulationRecords({
    observedAt: scanRow.completed_at ?? scanRow.started_at ?? scanRow.created_at,
    signals: [
      ...normalizedSignals,
      ...supplementalSnapshotSignals,
      ...supplementalPolicySignals,
      ...supplementalCoverageSignals.supplementalSignals.map((signal) => {
        const taxonomy = mapSignalKeyToTaxonomy({
          category: "disclosure",
          key: signal.key,
          label: signal.label
        });

        return {
          category: "disclosure",
          primaryCategory: taxonomy.primaryCategory,
          primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
          primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
          key: signal.key,
          label: signal.label,
          subcategory: taxonomy.subcategory ?? null,
          value: signal.value,
          valueType: Array.isArray(signal.value) ? "string_array" : "boolean"
        } satisfies ScanSignalRecord;
      })
    ]
  });
  const regulatorySnapshot = mergeRelatedPreviewSnapshot(normalizedSnapshot, normalizedRelatedPreviewSnapshot);
  const regulatoryRisk = snapshot
    ? buildRegulatoryRiskAssessment({
        source: buildRegulatoryRiskSource({
          snapshot: regulatorySnapshot as Record<string, unknown>,
          primaryPolicyEnrichment
        }),
        previousOverallScore: previousSnapshot
          ? buildRegulatoryRiskAssessment({
              source: buildRegulatoryRiskSource({
                snapshot: previousSnapshot as Record<string, unknown>,
                primaryPolicyEnrichment: previousPrimaryPolicyEnrichment
              })
            }).overallScore
          : null
      })
    : null;
  const persistedTrackerVendors = ((trackerVendors ?? []) as Array<Record<string, unknown>>).map(
    (tracker) =>
      ({
        vendorName: String(tracker.vendor_name),
        vendorCategory: String(tracker.vendor_category),
        detectionSource: String(tracker.detection_source),
        confidence: Number(tracker.confidence ?? 0),
        firstPartyOrThirdParty: String(tracker.first_party_or_third_party),
        collectionEndpointType: String(tracker.collection_endpoint_type ?? "unknown"),
        beforeConsent: typeof tracker.before_consent === "boolean" ? tracker.before_consent : null,
        scriptHost: (tracker.script_host as string | null) ?? null,
        matchedSignatureId: (tracker.matched_signature_id as string | null) ?? null
      }) satisfies ScanTrackerVendorRecord
  );
  const runtimeDerivedTrackerVendors = getHybridDerivedTrackerVendors((runtimeArtifacts as Record<string, unknown> | null) ?? null).map(
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
  const normalizedTrackerVendors = [
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
  const normalizedPreconsentViolations = ((preconsentViolations ?? []) as PreconsentViolationRow[]).map(
    (violation) =>
      ({
        collectionEndpointType: violation.collection_endpoint_type ?? "unknown",
        confidence: Number(violation.confidence ?? 0),
        detectionSource: violation.detection_source,
        evidenceUrls: violation.evidence_urls ?? [],
        firstPartyOrThirdParty: violation.first_party_or_third_party,
        matchedSignatureId: violation.matched_signature_id ?? null,
        scriptHost: violation.script_host ?? null,
        vendorCategory: violation.vendor_category,
        vendorName: violation.vendor_name
      }) satisfies PreconsentViolationRecord
  );
  const normalizedAccessibilityRuleCounts = ((accessibilityRuleCounts ?? []) as AccessibilityRuleCountRow[]).map(
    (rule) =>
      ({
        instanceCount: Number(rule.instance_count ?? 0),
        ruleCode: rule.rule_code,
        ruleGroup: rule.rule_group,
        severity: rule.severity
      }) satisfies AccessibilityRuleCountRecord
  );
  const normalizedAccessibilityRuleExamples = ((accessibilityRuleExamples ?? []) as AccessibilityRuleExampleRow[]).map(
    (example) =>
      ({
        description: example.description,
        help: example.help,
        helpUrl: example.help_url,
        impact: example.impact,
        nodeCount: Number(example.node_count ?? 0),
        pageUrl: example.page_url,
        representativeSelectors: example.representative_selectors ?? [],
        ruleCode: example.rule_code,
        ruleGroup: example.rule_group,
        severity: example.severity
      }) satisfies AccessibilityRuleExampleRecord
  );
  const previousTrackerVendorNames = new Set(
    (previousTrackerRows as Array<Record<string, unknown>>).map((tracker) => String(tracker.vendor_name))
  );
  const currentTrackerVendorNames = new Set(normalizedTrackerVendors.map((tracker) => tracker.vendorName));
  const previousPreconsentVendorMap = new Map(
    (previousTrackerRows as Array<Record<string, unknown>>)
      .filter((tracker) => tracker.before_consent === true)
      .map((tracker) => [
        String(tracker.vendor_name),
        {
          confidence: Number(tracker.confidence ?? 0),
          vendorCategory: String(tracker.vendor_category)
        }
      ])
  );
  const currentPreconsentVendorMap = new Map(
    normalizedTrackerVendors
      .filter((tracker) => tracker.beforeConsent === true)
      .map((tracker) => [
        tracker.vendorName,
        {
          confidence: tracker.confidence,
          vendorCategory: tracker.vendorCategory
        }
      ])
  );
  const trackerChanges: TrackerChangeRecord[] = [
    ...normalizedTrackerVendors
      .filter((tracker) => !previousTrackerVendorNames.has(tracker.vendorName))
      .map(
        (tracker) =>
          ({
            changeType: "added",
            confidence: tracker.confidence,
            previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
            vendorCategory: tracker.vendorCategory,
            vendorName: tracker.vendorName
          }) satisfies TrackerChangeRecord
      ),
    ...(previousTrackerRows as Array<Record<string, unknown>>)
      .filter((tracker) => !currentTrackerVendorNames.has(String(tracker.vendor_name)))
      .map(
        (tracker) =>
          ({
            changeType: "removed",
            confidence: Number(tracker.confidence ?? 0),
            previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
            vendorCategory: String(tracker.vendor_category),
            vendorName: String(tracker.vendor_name)
          }) satisfies TrackerChangeRecord
      )
  ].sort((left, right) => left.vendorName.localeCompare(right.vendorName));
  const preconsentChanges: PreconsentChangeRecord[] = [
    ...[...currentPreconsentVendorMap.entries()]
      .filter(([vendorName]) => !previousPreconsentVendorMap.has(vendorName))
      .map(
        ([vendorName, tracker]) =>
          ({
            changeType: "new",
            confidence: tracker.confidence,
            previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
            vendorCategory: tracker.vendorCategory,
            vendorName
          }) satisfies PreconsentChangeRecord
      ),
    ...[...previousPreconsentVendorMap.entries()]
      .filter(([vendorName]) => !currentPreconsentVendorMap.has(vendorName))
      .map(
        ([vendorName, tracker]) =>
          ({
            changeType: "resolved",
            confidence: tracker.confidence,
            previousScanId: (previousScan as { id?: string } | null)?.id ?? null,
            vendorCategory: tracker.vendorCategory,
            vendorName
          }) satisfies PreconsentChangeRecord
      )
  ].sort((left, right) => left.vendorName.localeCompare(right.vendorName));

  const accessPostureClass =
    typeof normalizedSnapshot?.access_posture_class === "string"
      ? (normalizedSnapshot.access_posture_class as AccessPostureClass)
      : null;
  const rawHighestSuccessfulTier =
    typeof normalizedSnapshot?.highest_successful_tier === "string"
      ? (normalizedSnapshot.highest_successful_tier as ScanExecutionTier)
      : null;
  const rawStopTier =
    typeof normalizedSnapshot?.stop_tier === "string"
      ? (normalizedSnapshot.stop_tier as ScanExecutionTier)
      : null;
  const totalSignals =
    typeof normalizedSnapshot?.total_signals === "number"
      ? normalizedSnapshot.total_signals
      : null;
  const homepageFetchHttpStatus =
    typeof normalizedSnapshot?.homepage_fetch_http_status === "number"
      ? normalizedSnapshot.homepage_fetch_http_status
      : null;
  const homepageFetchStatus =
    typeof normalizedSnapshot?.homepage_fetch_status === "string"
      ? normalizedSnapshot.homepage_fetch_status
      : null;
  const recoverableFindingClasses = Array.isArray(normalizedSnapshot?.recoverable_finding_classes)
    ? normalizedSnapshot.recoverable_finding_classes.filter(
        (value): value is RecoverableFindingClass => typeof value === "string"
      )
    : [];
  const accessPostureSummary = normalizeAccessPostureSummary({
    accessPostureClass,
    highestSuccessfulTier: rawHighestSuccessfulTier,
    homepageFetchHttpStatus,
    homepageFetchStatus,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses,
    stopTier: rawStopTier,
    totalSignals
  });
  const highestSuccessfulTier = accessPostureSummary.highestSuccessfulTier;
  const stopTier = accessPostureSummary.stopTier;
  const stopReason = normalizedSnapshot
    ? deriveScanStopReason({
        authWallDetected: normalizedSnapshot.auth_wall_detected === true,
        blockedFlag: normalizedSnapshot.blocked_flag === true,
        captchaFlag: normalizedSnapshot.captcha_flag === true,
        homepageFetchHttpStatus,
        homepageFetchStatus,
        pagesScanned: scanRow.pages_scanned,
        robotsAllowed:
          normalizedSnapshot.robots_allowed === true
            ? true
            : normalizedSnapshot.robots_allowed === false
              ? false
              : null,
        robotsFetchHttpStatus:
          typeof normalizedSnapshot.robots_fetch_http_status === "number" ? normalizedSnapshot.robots_fetch_http_status : null,
        robotsFetchStatus:
          typeof normalizedSnapshot.robots_fetch_status === "string" ? normalizedSnapshot.robots_fetch_status : null,
        blockPageClassification:
          typeof normalizedSnapshot.block_page_classification === "string"
            ? (normalizedSnapshot.block_page_classification as BlockPageClassification)
            : null,
        blockVendorGuess:
          typeof normalizedSnapshot.block_vendor_guess === "string"
            ? (normalizedSnapshot.block_vendor_guess as BlockVendorGuess)
            : null,
        challengeSuspected: normalizedSnapshot.challenge_suspected === true,
        authWallSuspected: normalizedSnapshot.auth_wall_suspected === true,
        rateLimitSuspected: normalizedSnapshot.rate_limit_suspected === true,
        geoBlockSuspected: normalizedSnapshot.geo_block_suspected === true,
        fingerprintBlockSuspected: normalizedSnapshot.fingerprint_block_suspected === true
      })
    : null;
  const accessPosturePresentation = deriveAccessPosturePresentation({
    accessPostureClass: accessPostureSummary.accessPostureClass,
    highestSuccessfulTier,
    stopTier,
    totalSignals,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses
  });
  const normalizedRuntimeArtifacts = runtimeArtifacts
    ? withHybridRuntimeArtifactFallbacks(stripSnapshotRecord(runtimeArtifacts as Record<string, unknown>)) ??
      stripSnapshotRecord(runtimeArtifacts as Record<string, unknown>)
    : null;
  const mergedSignals = buildMergedSignalRecords({
    nanoSignals:
      storedNanoSignalRows.length > 0
        ? buildStoredSignalPopulationRecords({
            observedAt: scanRow.completed_at ?? scanRow.started_at ?? scanRow.created_at,
            rows: storedNanoSignalRows,
            source: "nano"
          })
        : getHybridNanoSignalPopulations(normalizedRuntimeArtifacts),
    scannerSignals: scannerSignalPopulations,
    validationSignals: buildStoredSignalPopulationRecords({
      observedAt: scanRow.completed_at ?? scanRow.started_at ?? scanRow.created_at,
      rows: storedValidationSignalRows,
      source: "validation"
    })
  });

  return {
    accessPostureSummary: {
      accessPostureClass: accessPostureSummary.accessPostureClass,
      highestSuccessfulTier,
      stopTier,
      recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses,
      totalSignals,
      pagesScanned: scanRow.pages_scanned,
      homepageFetchHttpStatus,
      homepageFetchStatus,
      finalEffectiveUrl: typeof normalizedSnapshot?.final_effective_url === "string" ? normalizedSnapshot.final_effective_url : null,
      serverHeader: typeof normalizedSnapshot?.server_header === "string" ? normalizedSnapshot.server_header : null,
      blockVendorGuess:
        typeof normalizedSnapshot?.block_vendor_guess === "string"
          ? (normalizedSnapshot.block_vendor_guess as BlockVendorGuess)
          : null,
      blockPageClassification:
        typeof normalizedSnapshot?.block_page_classification === "string"
          ? (normalizedSnapshot.block_page_classification as BlockPageClassification)
          : null,
      cmpVendorName: typeof normalizedSnapshot?.cmp_vendor_name === "string" ? normalizedSnapshot.cmp_vendor_name : null,
      robotsAllowed:
        normalizedSnapshot?.robots_allowed === true ? true : normalizedSnapshot?.robots_allowed === false ? false : null,
      robotsFetchHttpStatus:
        typeof normalizedSnapshot?.robots_fetch_http_status === "number" ? normalizedSnapshot.robots_fetch_http_status : null,
      stopOutcomeTitle: stopReason?.outcomeTitle ?? null,
      stopReason: stopReason?.reason ?? null,
      stopReviewTitle: stopReason?.reviewTitle ?? null,
      whatThisMeans: stopReason?.whatThisMeans ?? [],
      verifiedPublicSurfacesCount: Array.isArray(normalizedSnapshot?.verified_public_surfaces)
        ? normalizedSnapshot.verified_public_surfaces.length
        : 0,
      interruptionLabel: accessPosturePresentation.label,
      interruptionReason: accessPosturePresentation.reason
    },
    scan: {
      id: scanRow.id,
      domainId: scanRow.domain_id,
      domainHostname,
      scanType: scanRow.scan_type,
      status: scanRow.status,
      pagesRequested: scanRow.pages_requested,
      pagesScanned: scanRow.pages_scanned,
      scanConfigJson: scanRow.scan_config_json,
      executionSummary: getScannerExecutionSummary(scanRow.scan_config_json),
      createdAt: scanRow.created_at,
      startedAt: scanRow.started_at,
      completedAt: scanRow.completed_at,
      errorMessage: scanRow.error_message
    } satisfies ScanDetailRecord,
    snapshot: normalizedSnapshot ? (normalizedSnapshot satisfies Exclude<ScanSnapshotRecord, null>) : null,
    runtimeArtifacts: normalizedRuntimeArtifacts
      ? (normalizedRuntimeArtifacts satisfies Exclude<ScanRuntimeArtifactRecord, null>)
      : null,
    preconsentViolations: normalizedPreconsentViolations,
    accessibilityRuleCounts: normalizedAccessibilityRuleCounts,
    accessibilityRuleExamples: normalizedAccessibilityRuleExamples,
    preconsentChanges,
    trackerChanges,
    trackerVendors: normalizedTrackerVendors,
    previousSnapshot: previousSnapshot ? (stripSnapshotRecord(previousSnapshot as Record<string, unknown>) satisfies Exclude<PreviousSnapshotRecord, null>) : null,
    relatedPreviewSnapshot: normalizedRelatedPreviewSnapshot
      ? (normalizedRelatedPreviewSnapshot satisfies Exclude<RelatedPreviewSnapshotRecord, null>)
      : null,
    policyEnrichment: normalizedPolicyEnrichment,
    policyReviewQueue: normalizedPolicyReviewQueue,
    validationFindings,
    regulatoryRisk,
    agencyMappings: regulatorySnapshot
      ? buildAgencyMappings(buildAgencyMappingSource(regulatorySnapshot as Record<string, unknown>), regulatoryRisk)
      : ([] satisfies AgencyMapping[]),
    signals: [
      ...normalizedSignals,
      ...supplementalSnapshotSignals,
      ...supplementalPolicySignals,
      ...supplementalCoverageSignals.supplementalSignals.map((signal) => {
        const taxonomy = mapSignalKeyToTaxonomy({
          category: "disclosure",
          key: signal.key,
          label: signal.label
        });

        return {
          category: "disclosure",
          primaryCategory: taxonomy.primaryCategory,
          primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
          primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
          key: signal.key,
          label: signal.label,
          subcategory: taxonomy.subcategory ?? null,
          value: signal.value,
          valueType: Array.isArray(signal.value) ? "string_array" : "boolean"
        } satisfies ScanSignalRecord;
      })
    ],
    mergedSignals,
    events: normalizedEvents
  };
}

export async function getScanById(input: { organizationId: string; scanId: string; viewerEmail?: string | null }) {
  return loadScanDetailRecord({
    allowAnonymousFallback: false,
    organizationId: input.organizationId,
    scanId: input.scanId,
    viewerEmail: input.viewerEmail
  });
}

export async function getAnonymousScanById(scanId: string) {
  return loadScanDetailRecord({
    anonymousOnly: true,
    organizationId: null,
    scanId,
    viewerEmail: null
  });
}

export type ScanDetailResponse = NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;
