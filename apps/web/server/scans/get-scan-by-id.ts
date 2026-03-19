"use server";

import { buildAgencyMappings, buildRegulatoryRiskAssessment, type AgencyMapping, type RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy, type PrimaryScanCategoryId } from "../../lib/scans/signal-taxonomy";
import { isPlatformAdminEmail } from "../admin/platform-admin";

export type ScanDetailRecord = {
  id: string;
  domainId: string | null;
  domainHostname: string | null;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  scanConfigJson: Record<string, unknown> | null;
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

type SignalRow = {
  category: string;
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

export async function getScanById(input: { organizationId: string; scanId: string; viewerEmail?: string | null }) {
  const supabase = createAdminClient();
  const adminCanViewAnonymousScans = isPlatformAdminEmail(input.viewerEmail);

  const loadScan = async (organizationId: string | null) => {
    let query = supabase
      .from("scans")
      .select("id, organization_id, domain_id, scan_type, status, pages_requested, pages_scanned, scan_config_json, created_at, started_at, completed_at, error_message")
      .eq("id", input.scanId);

    query = organizationId === null ? query.is("organization_id", null) : query.eq("organization_id", organizationId);

    return query.maybeSingle();
  };

  const primaryScanResult = await loadScan(input.organizationId);
  let scan = primaryScanResult.data;
  let error = primaryScanResult.error;

  if (!scan && !error && adminCanViewAnonymousScans) {
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
    { data: previousScan }
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
      .select("category, signal_key, signal_label, signal_value_json, value_type")
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
    previousScanPromise
  ]);

  if (eventsError) {
    throw new Error(`Failed to load scan events: ${eventsError.message}`);
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
  const normalizedPolicyEnrichment = ((policyEnrichment ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const normalizedPolicyReviewQueue = ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const primaryPolicyEnrichment = getPrimaryPolicyEnrichment(normalizedPolicyEnrichment);
  const previousPrimaryPolicyEnrichment = getPrimaryPolicyEnrichment((previousPolicyRows as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row)));
  const normalizedSnapshot = snapshot ? stripSnapshotRecord(snapshot as Record<string, unknown>) : null;
  const normalizedRelatedPreviewSnapshot = relatedPreviewSnapshot
    ? stripSnapshotRecord(relatedPreviewSnapshot as Record<string, unknown>)
    : null;
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
  const normalizedTrackerVendors = ((trackerVendors ?? []) as Array<Record<string, unknown>>).map(
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

  return {
    scan: {
      id: scanRow.id,
      domainId: scanRow.domain_id,
      domainHostname,
      scanType: scanRow.scan_type,
      status: scanRow.status,
      pagesRequested: scanRow.pages_requested,
      pagesScanned: scanRow.pages_scanned,
      scanConfigJson: scanRow.scan_config_json,
      createdAt: scanRow.created_at,
      startedAt: scanRow.started_at,
      completedAt: scanRow.completed_at,
      errorMessage: scanRow.error_message
    } satisfies ScanDetailRecord,
    snapshot: normalizedSnapshot ? (normalizedSnapshot satisfies Exclude<ScanSnapshotRecord, null>) : null,
    runtimeArtifacts: runtimeArtifacts
      ? (stripSnapshotRecord(runtimeArtifacts as Record<string, unknown>) satisfies Exclude<ScanRuntimeArtifactRecord, null>)
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
    regulatoryRisk,
    agencyMappings: regulatorySnapshot
      ? buildAgencyMappings(buildAgencyMappingSource(regulatorySnapshot as Record<string, unknown>), regulatoryRisk)
      : ([] satisfies AgencyMapping[]),
    signals: ((signals ?? []) as SignalRow[]).map(
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
    ),
    events: ((events ?? []) as ScanEventRow[]).map(
      (event) =>
        ({
          id: event.id,
          eventType: event.event_type,
          message: event.message,
          metadataJson: event.metadata_json,
          createdAt: event.created_at
        }) satisfies ScanEventRecord
    )
  };
}
