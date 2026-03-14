"use server";

import { buildAgencyMappings, buildRegulatoryRiskAssessment, type AgencyMapping, type RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy, type PrimaryScanCategoryId } from "../../lib/scans/signal-taxonomy";

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

export type PolicyEnrichmentRecord = {
  [key: string]: unknown;
};

export type PolicyReviewQueueRecord = {
  [key: string]: unknown;
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

export async function getScanById(input: { organizationId: string; scanId: string }) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase
    .from("scans")
    .select("id, domain_id, scan_type, status, pages_requested, pages_scanned, scan_config_json, created_at, started_at, completed_at, error_message")
    .eq("id", input.scanId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load scan: ${error.message}`);
  }

  if (!scan) {
    return null;
  }

  const scanRow = scan as ScanRow;
  let domainHostname: string | null = null;

  if (scanRow.domain_id) {
    const { data: domain } = await supabase
      .from("domains")
      .select("id, hostname")
      .eq("id", scanRow.domain_id)
      .eq("organization_id", input.organizationId)
      .maybeSingle();

    domainHostname = (domain as DomainRow | null)?.hostname ?? null;
  }

  const previousScanPromise =
    scanRow.domain_id
      ? supabase
          .from("scans")
          .select("id")
          .eq("organization_id", input.organizationId)
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
