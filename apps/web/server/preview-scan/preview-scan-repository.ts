import {
  buildAgencyMappings,
  getScannerExecutionSummary,
  PREVIEW_SCAN_EVENT_TYPES,
  type AgencyMapping,
  type PreviewBuildPhaseSummary,
  type PreviewIssueCounts,
  type PreviewScanPayload,
  type PreviewScanEvent,
  type PreviewScanStatusResponse,
  type ScanSnapshot,
  type ScanStatus,
  type ScanType
} from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { createHash } from "node:crypto";
import { buildEventActivityFeed } from "../../lib/scans/activity-feed";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";

type DomainRow = {
  id: string;
  organization_id: string | null;
  hostname: string;
  normalized_url: string;
  latest_scan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ScanRow = {
  id: string;
  organization_id: string | null;
  domain_id: string | null;
  scan_type: ScanType;
  status: ScanStatus;
  submitted_by_user_id: string | null;
  pages_requested: number;
  pages_scanned: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  scan_config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ScanConfig = {
  hostname?: string;
  normalizedUrl?: string;
  previewPayload?: PreviewScanPayload;
  processor?: string;
};

type SnapshotRow = {
  accessibilityClaimMismatchDetected: ScanSnapshot["accessibilityClaimMismatchDetected"];
  accessibilityLitigationRiskScore: ScanSnapshot["accessibilityLitigationRiskScore"];
  accessibilityScore: ScanSnapshot["accessibilityScore"];
  accessibilityStatementPresent: ScanSnapshot["accessibilityStatementPresent"];
  adaDemandLetterProbability: ScanSnapshot["adaDemandLetterProbability"];
  advertisingDisclosurePresent: ScanSnapshot["advertisingDisclosurePresent"];
  advertisingTrackerCount: ScanSnapshot["advertisingTrackerCount"];
  affiliateDisclosurePresent: ScanSnapshot["affiliateDisclosurePresent"];
  certscoreOverall: ScanSnapshot["certscoreOverall"];
  californiaExposureLikely: ScanSnapshot["californiaExposureLikely"];
  cancellationPolicyPresent: ScanSnapshot["cancellationPolicyPresent"];
  contactPagePresent: ScanSnapshot["contactPagePresent"];
  cookieBannerPresent: ScanSnapshot["cookieBannerPresent"];
  consentMaturityScore: ScanSnapshot["consentMaturityScore"];
  consumerProtectionScore: ScanSnapshot["consumerProtectionScore"];
  crossBorderTransferMechanismDetected: ScanSnapshot["crossBorderTransferMechanismDetected"];
  dataAccessRequestPresent: ScanSnapshot["dataAccessRequestPresent"];
  dataDeletionRequestPresent: ScanSnapshot["dataDeletionRequestPresent"];
  doNotSellLinkPresent: ScanSnapshot["doNotSellLinkPresent"];
  dsarRequestMechanismPresent: ScanSnapshot["dsarRequestMechanismPresent"];
  ecommerceSiteLikely: ScanSnapshot["ecommerceSiteLikely"];
  freeTrialDetected: ScanSnapshot["freeTrialDetected"];
  granularPreferencesPresent: ScanSnapshot["granularPreferencesPresent"];
  homepageFetchStatus: ScanSnapshot["homepageFetchStatus"] | null;
  mentionsCcpaOrCpra: ScanSnapshot["mentionsCcpaOrCpra"];
  mentionsCrossBorderTransfer: ScanSnapshot["mentionsCrossBorderTransfer"];
  mentionsDataRetention: ScanSnapshot["mentionsDataRetention"];
  mentionsDataSaleOrSharing: ScanSnapshot["mentionsDataSaleOrSharing"];
  mentionsGdpr: ScanSnapshot["mentionsGdpr"];
  mentionsSensitiveData: ScanSnapshot["mentionsSensitiveData"];
  mentionsUnder13: ScanSnapshot["mentionsUnder13"];
  mentionsUnder16: ScanSnapshot["mentionsUnder16"];
  pagesScanned: ScanSnapshot["pagesScanned"];
  partialScan: ScanSnapshot["partialScan"];
  policyBehaviorConflictDetected: ScanSnapshot["policyBehaviorConflictDetected"];
  privacyContactMethodPresent: ScanSnapshot["privacyContactMethodPresent"];
  privacyEmailSpecificPresent: ScanSnapshot["privacyEmailSpecificPresent"];
  privacyPolicyPresent: ScanSnapshot["privacyPolicyPresent"];
  privacyScore: ScanSnapshot["privacyScore"];
  privacyRequestFormPresent: ScanSnapshot["privacyRequestFormPresent"];
  preconsentTrackingDetected: ScanSnapshot["preconsentTrackingDetected"];
  rejectAllPresent: ScanSnapshot["rejectAllPresent"];
  sessionReplayTrackerCount: ScanSnapshot["sessionReplayTrackerCount"];
  sessionReplayWithoutDisclosureDetected: ScanSnapshot["sessionReplayWithoutDisclosureDetected"];
  subprocessorListPresent: ScanSnapshot["subprocessorListPresent"];
  subscriptionOfferDetected: ScanSnapshot["subscriptionOfferDetected"];
  testimonialOrReviewDisclosurePresent: ScanSnapshot["testimonialOrReviewDisclosurePresent"];
  termsOfServicePresent: ScanSnapshot["termsOfServicePresent"];
  thirdPartyCookieSetBeforeConsent: ScanSnapshot["thirdPartyCookieSetBeforeConsent"];
  trackerRegulatoryRiskScore: ScanSnapshot["trackerRegulatoryRiskScore"];
  totalSignals: ScanSnapshot["totalSignals"];
  trackingBeforeConsentDetected: ScanSnapshot["trackingBeforeConsentDetected"];
  wcagErrorCountTotal: ScanSnapshot["wcagErrorCountTotal"];
  wcagFormLabelErrorCount: ScanSnapshot["wcagFormLabelErrorCount"];
  wcagKeyboardNavigationIssueCount: ScanSnapshot["wcagKeyboardNavigationIssueCount"];
  wcagMissingAltCount: ScanSnapshot["wcagMissingAltCount"];
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
};

type RuntimeArtifactsRow = {
  build_phase_summaries?: Array<Record<string, unknown>> | null;
} | null;

function getStatusMessage(status: ScanStatus) {
  if (status === "queued") {
    return "Queued for a lightweight live preview.";
  }

  if (status === "running") {
    return "Scanning a lightweight site surface and assembling preview findings.";
  }

  if (status === "completed") {
    return "Preview scan complete.";
  }

  return "The preview scan could not be completed.";
}

function formatCount(value: unknown, singular: string, plural = `${singular}s`) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value} ${value === 1 ? singular : plural}`;
}

function buildActivityTailParts(scan: ScanRow, latestEvent: ScanEventRow | null) {
  const metadata = latestEvent?.metadata_json ?? null;
  const fragments: string[] = [];

  if (scan.status === "queued") {
    fragments.push("mode=lightweight-preview");
    const requestedPages = formatCount(scan.pages_requested, "page");
    if (requestedPages) {
      fragments.push(`target=${requestedPages}`);
    }
  }

  if (latestEvent?.event_type === "crawl.started") {
    const requestedPages = formatCount(metadata?.requestedPageCount, "page");
    if (requestedPages) {
      fragments.push(`requested=${requestedPages}`);
    }
    fragments.push("steps=robots+homepage+discovery");
  }

  if (latestEvent?.event_type === "crawl.page_discovery_completed") {
    if (typeof metadata?.scanPlanProfile === "string" && metadata.scanPlanProfile.length > 0) {
      fragments.push(`profile=${metadata.scanPlanProfile}`);
    }
    const pagesScanned = formatCount(metadata?.pagesScanned, "page");
    if (pagesScanned) {
      fragments.push(`surface=${pagesScanned}`);
    }
    const trackers = formatCount(metadata?.trackerCountTotal, "tracker");
    if (trackers) {
      fragments.push(`trackers=${trackers}`);
    }
    if (typeof metadata?.partialScan === "boolean") {
      fragments.push(metadata.partialScan ? "coverage=partial" : "coverage=full");
    }
  }

  if (latestEvent?.event_type === "signals.persisted") {
    const totalSignals = formatCount(metadata?.totalSignals, "signal");
    if (totalSignals) {
      fragments.push(`saved=${totalSignals}`);
    }
    const pagesPersisted = formatCount(metadata?.pagesPersisted, "page");
    if (pagesPersisted) {
      fragments.push(`pages=${pagesPersisted}`);
    }
    const vendorRows = formatCount(metadata?.trackerRowsPersisted, "vendor row");
    if (vendorRows) {
      fragments.push(`vendors=${vendorRows}`);
    }
  }

  if (latestEvent?.event_type === "signals.changes_computed") {
    if (typeof metadata?.isBaseline === "boolean") {
      fragments.push(metadata.isBaseline ? "diff=baseline" : "diff=compared");
    }
    const added = formatCount(metadata?.addedCount, "add");
    const changed = formatCount(metadata?.changedCount, "change");
    const removed = formatCount(metadata?.removedCount, "removal");
    if (added) {
      fragments.push(`added=${added}`);
    }
    if (changed) {
      fragments.push(`changed=${changed}`);
    }
    if (removed) {
      fragments.push(`removed=${removed}`);
    }
  }

  if (scan.status === "running" && fragments.length === 0) {
    const pagesScanned = formatCount(scan.pages_scanned, "page");
    if (pagesScanned) {
      fragments.push(`progress=${pagesScanned}`);
    }
    fragments.push("live-checks=active");
  }

  return fragments;
}

function buildActivityLine(scan: ScanRow, latestEvent: ScanEventRow | null) {
  if (latestEvent?.message) {
    return latestEvent.message;
  }

  if (scan.status === "queued") {
    return "Waiting for a worker to pick up this lightweight live preview. · mode=lightweight-preview · target=1 page";
  }

  if (scan.status === "running") {
    return "Scanning the site surface and collecting observable accessibility, privacy, and disclosure signals. · live-checks=active";
  }

  if (scan.status === "completed") {
    return "Preview results were assembled from the latest saved snapshot.";
  }

  return scan.error_message ? `Preview failed: ${scan.error_message}` : null;
}

function buildActivityDetails(scan: ScanRow, latestEvent: ScanEventRow | null) {
  const details = buildActivityTailParts(scan, latestEvent);
  const lines: string[] = [];

  if (latestEvent) {
    lines.push(`evt=${latestEvent.event_type}`);
  }

  if (details.length > 0) {
    for (let index = 0; index < details.length; index += 3) {
      lines.push(details.slice(index, index + 3).join(" · "));
    }
  } else if (scan.status === "queued") {
    lines.push("mode=lightweight-preview · target=1 page");
  } else if (scan.status === "running") {
    lines.push("live-checks=active · evidence=collecting");
  } else if (scan.status === "completed") {
    lines.push("snapshot=ready · preview=derived");
  }

  if (scan.started_at) {
    lines.push(`ts=${scan.started_at}`);
  }

  return lines;
}

function buildActivityFeed(scan: ScanRow, events: ScanEventRow[]) {
  const stepLabel = scan.status === "queued" ? "step[1/3]" : scan.status === "running" ? "step[2/3]" : "step[3/3]";

  return buildEventActivityFeed({
    events: events.map((event) => ({
      eventType: event.event_type,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    fallbackLines:
      scan.status === "queued"
        ? ["step[1/3] event> Preview scan queued.", "data> evt=preview_scan.queued · mode=lightweight-preview"]
        : ["step[2/3] event> Preview activity feed is initializing.", "data> evt=preview.feed.pending"],
    latestLabel: stepLabel,
    maxEvents: 16
  });
}

function buildActivityRef(scanId: string, latestEvent: ScanEventRow | null) {
  if (!latestEvent) {
    return null;
  }

  const digest = createHash("sha256")
    .update(scanId)
    .update(latestEvent.event_type)
    .update(latestEvent.created_at)
    .update(latestEvent.message)
    .digest("hex");

  return `${digest.slice(0, 4)}...${digest.slice(-4)}`;
}

function getPreviewPayload(scan: ScanRow): PreviewScanPayload | null {
  const config = scan.scan_config_json as ScanConfig;
  return config.previewPayload ?? null;
}

export async function findOrCreateAnonymousPreviewDomain(hostname: string, normalizedUrl: string) {
  const supabase = createAdminClient();

  const { data: existingDomain } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .is("organization_id", null)
    .eq("normalized_url", normalizedUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingDomain) {
    return existingDomain as DomainRow;
  }

  const { data: createdDomain, error } = await supabase
    .from("domains")
    .insert({
      hostname,
      normalized_url: normalizedUrl
    })
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .single();

  if (error || !createdDomain) {
    throw new Error(`Failed to create preview domain: ${error?.message ?? "Unknown error"}`);
  }

  return createdDomain as DomainRow;
}

export async function createPreviewScanRecord(input: { domainId: string; hostname: string; normalizedUrl: string }) {
  const supabase = createAdminClient();
  const initialConfig: ScanConfig = {
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    processor: "live-preview-v1"
  };

  const { data: scan, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domainId,
      scan_type: "preview",
      status: "queued",
      pages_requested: 1,
      pages_scanned: 0,
      scan_config_json: initialConfig
    })
    .select("*")
    .single();

  if (error || !scan) {
    throw new Error(`Failed to create preview scan: ${error?.message ?? "Unknown error"}`);
  }

  await insertScanEvent({
    domainId: input.domainId,
    eventType: PREVIEW_SCAN_EVENT_TYPES.queued,
    message: "Preview scan queued.",
    metadata: {
      hostname: input.hostname,
      normalizedUrl: input.normalizedUrl
    },
    scanId: scan.id
  });

  return scan as ScanRow;
}

export async function insertScanEvent(input: {
  domainId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  organizationId?: string | null;
  scanId?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("scan_events").insert({
    scan_id: input.scanId ?? null,
    domain_id: input.domainId ?? null,
    organization_id: input.organizationId ?? null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null
  });

  if (error) {
    throw new Error(`Failed to create scan event: ${error.message}`);
  }
}

export async function getPreviewScanRecord(scanId: string): Promise<{ domain: DomainRow | null; scan: ScanRow } | null> {
  const supabase = createAdminClient();
  const { data: scan } = await supabase.from("scans").select("*").eq("id", scanId).maybeSingle();

  if (!scan) {
    return null;
  }

  const scanRow = scan as ScanRow;

  if (!scanRow.domain_id) {
    return {
      domain: null,
      scan: scanRow
    };
  }

  const { data: domain } = await supabase
    .from("domains")
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .eq("id", scanRow.domain_id)
    .maybeSingle();

  return {
    domain: (domain as DomainRow | null) ?? null,
    scan: scanRow
  };
}

export async function updatePreviewScan(scanId: string, patch: Partial<ScanRow>) {
  const supabase = createAdminClient();
  const { data: scan, error } = await supabase.from("scans").update(patch).eq("id", scanId).select("*").single();

  if (error || !scan) {
    throw new Error(`Failed to update preview scan: ${error?.message ?? "Unknown error"}`);
  }

  return scan as ScanRow;
}

export async function setDomainLatestScan(domainId: string, scanId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("domains").update({ latest_scan_id: scanId }).eq("id", domainId);

  if (error) {
    throw new Error(`Failed to update domain latest scan: ${error.message}`);
  }
}

export async function getPreviewScanSnapshot(scanId: string): Promise<SnapshotRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_snapshots")
    .select(
      [
        "total_signals",
        "pages_scanned",
        "homepage_fetch_status",
        "partial_scan",
        "certscore_overall",
        "privacy_score",
        "accessibility_score",
        "privacy_policy_present",
        "terms_of_service_present",
        "contact_page_present",
        "privacy_contact_method_present",
        "privacy_email_specific_present",
        "cookie_banner_present",
        "reject_all_present",
        "granular_preferences_present",
        "tracking_before_consent_detected",
        "preconsent_tracking_detected",
        "third_party_cookie_set_before_consent",
        "policy_behavior_conflict_detected",
        "session_replay_without_disclosure_detected",
        "session_replay_tracker_count",
        "advertising_tracker_count",
        "affiliate_disclosure_present",
        "advertising_disclosure_present",
        "testimonial_or_review_disclosure_present",
        "consumer_protection_score",
        "cancellation_policy_present",
        "subscription_offer_detected",
        "free_trial_detected",
        "mentions_gdpr",
        "cross_border_transfer_mechanism_detected",
        "mentions_cross_border_transfer",
        "dsar_request_mechanism_present",
        "data_deletion_request_present",
        "data_access_request_present",
        "privacy_request_form_present",
        "consent_maturity_score",
        "tracker_regulatory_risk_score",
        "subprocessor_list_present",
        "do_not_sell_link_present",
        "california_exposure_likely",
        "mentions_data_sale_or_sharing",
        "mentions_ccpa_or_cpra",
        "accessibility_statement_present",
        "accessibility_claim_mismatch_detected",
        "accessibility_litigation_risk_score",
        "ada_demand_letter_probability",
        "ecommerce_site_likely",
        "mentions_data_retention",
        "mentions_sensitive_data",
        "mentions_under_13",
        "mentions_under_16",
        "wcag_error_count_total",
        "wcag_missing_alt_count",
        "wcag_form_label_error_count",
        "wcag_keyboard_navigation_issue_count"
      ].join(", ")
    )
    .eq("scan_id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load preview scan snapshot: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as unknown as Record<string, unknown>;

  return {
    totalSignals: Number(row.total_signals ?? 0),
    pagesScanned: Number(row.pages_scanned ?? 0),
    homepageFetchStatus: typeof row.homepage_fetch_status === "string" ? (row.homepage_fetch_status as ScanSnapshot["homepageFetchStatus"]) : null,
    partialScan: typeof row.partial_scan === "boolean" ? (row.partial_scan as boolean) : false,
    certscoreOverall: Number(row.certscore_overall ?? 0),
    privacyScore: Number(row.privacy_score ?? 0),
    accessibilityScore: Number(row.accessibility_score ?? 0),
    privacyPolicyPresent: Boolean(row.privacy_policy_present),
    termsOfServicePresent: Boolean(row.terms_of_service_present),
    contactPagePresent: Boolean(row.contact_page_present),
    privacyContactMethodPresent: Boolean(row.privacy_contact_method_present),
    privacyEmailSpecificPresent: Boolean(row.privacy_email_specific_present),
    cookieBannerPresent: Boolean(row.cookie_banner_present),
    rejectAllPresent: Boolean(row.reject_all_present),
    granularPreferencesPresent: Boolean(row.granular_preferences_present),
    trackingBeforeConsentDetected:
      typeof row.tracking_before_consent_detected === "boolean" ? (row.tracking_before_consent_detected as boolean) : null,
    preconsentTrackingDetected: Boolean(row.preconsent_tracking_detected),
    thirdPartyCookieSetBeforeConsent:
      typeof row.third_party_cookie_set_before_consent === "boolean"
        ? (row.third_party_cookie_set_before_consent as boolean)
        : null,
    policyBehaviorConflictDetected: Boolean(row.policy_behavior_conflict_detected),
    sessionReplayWithoutDisclosureDetected: Boolean(row.session_replay_without_disclosure_detected),
    sessionReplayTrackerCount: Number(row.session_replay_tracker_count ?? 0),
    advertisingTrackerCount: Number(row.advertising_tracker_count ?? 0),
    affiliateDisclosurePresent: Boolean(row.affiliate_disclosure_present),
    advertisingDisclosurePresent: Boolean(row.advertising_disclosure_present),
    testimonialOrReviewDisclosurePresent: Boolean(row.testimonial_or_review_disclosure_present),
    consumerProtectionScore: Number(row.consumer_protection_score ?? 0),
    californiaExposureLikely: Boolean(row.california_exposure_likely),
    cancellationPolicyPresent: Boolean(row.cancellation_policy_present),
    consentMaturityScore: Number(row.consent_maturity_score ?? 0),
    crossBorderTransferMechanismDetected: Boolean(row.cross_border_transfer_mechanism_detected),
    dataAccessRequestPresent: Boolean(row.data_access_request_present),
    dataDeletionRequestPresent: Boolean(row.data_deletion_request_present),
    doNotSellLinkPresent: Boolean(row.do_not_sell_link_present),
    dsarRequestMechanismPresent: Boolean(row.dsar_request_mechanism_present),
    ecommerceSiteLikely: Boolean(row.ecommerce_site_likely),
    freeTrialDetected: Boolean(row.free_trial_detected),
    mentionsCcpaOrCpra: Boolean(row.mentions_ccpa_or_cpra),
    mentionsCrossBorderTransfer: Boolean(row.mentions_cross_border_transfer),
    mentionsDataRetention: Boolean(row.mentions_data_retention),
    mentionsDataSaleOrSharing: Boolean(row.mentions_data_sale_or_sharing),
    mentionsGdpr: Boolean(row.mentions_gdpr),
    mentionsSensitiveData: Boolean(row.mentions_sensitive_data),
    mentionsUnder13: Boolean(row.mentions_under_13),
    mentionsUnder16: Boolean(row.mentions_under_16),
    privacyRequestFormPresent: Boolean(row.privacy_request_form_present),
    subprocessorListPresent: Boolean(row.subprocessor_list_present),
    subscriptionOfferDetected: Boolean(row.subscription_offer_detected),
    trackerRegulatoryRiskScore: Number(row.tracker_regulatory_risk_score ?? 0),
    accessibilityStatementPresent: Boolean(row.accessibility_statement_present),
    accessibilityClaimMismatchDetected: Boolean(row.accessibility_claim_mismatch_detected),
    accessibilityLitigationRiskScore: Number(row.accessibility_litigation_risk_score ?? 0),
    adaDemandLetterProbability: Number(row.ada_demand_letter_probability ?? 0),
    wcagErrorCountTotal: Number(row.wcag_error_count_total ?? 0),
    wcagMissingAltCount: Number(row.wcag_missing_alt_count ?? 0),
    wcagFormLabelErrorCount: Number(row.wcag_form_label_error_count ?? 0),
    wcagKeyboardNavigationIssueCount: Number(row.wcag_keyboard_navigation_issue_count ?? 0)
  };
}

export async function getLatestPreviewScanEvent(scanId: string): Promise<ScanEventRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load latest preview scan event: ${error.message}`);
  }

  return (data as ScanEventRow | null) ?? null;
}

export async function getRecentPreviewScanEvents(scanId: string): Promise<ScanEventRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true })
    .limit(6);

  if (error) {
    throw new Error(`Failed to load recent preview scan events: ${error.message}`);
  }

  return (data as ScanEventRow[] | null) ?? [];
}

export async function getAllPreviewScanEvents(scanId: string): Promise<ScanEventRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load preview scan events: ${error.message}`);
  }

  return (data as ScanEventRow[] | null) ?? [];
}

export async function getPreviewRuntimeArtifacts(scanId: string): Promise<RuntimeArtifactsRow> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_runtime_artifacts")
    .select("build_phase_summaries")
    .eq("scan_id", scanId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load preview scan runtime artifacts: ${error.message}`);
  }

  return (data as RuntimeArtifactsRow) ?? null;
}

function serializePreviewEvents(events: ScanEventRow[]): PreviewScanEvent[] {
  return events.map((event) => ({
    createdAt: event.created_at,
    eventType: event.event_type,
    message: event.message,
    metadataJson: event.metadata_json
  }));
}

function serializeBuildPhaseSummaries(runtimeArtifacts: RuntimeArtifactsRow): PreviewBuildPhaseSummary[] {
  const rows = runtimeArtifacts?.build_phase_summaries;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    attempts: typeof row.attempts === "number" ? row.attempts : null,
    completedAt: typeof row.completedAt === "string" ? row.completedAt : null,
    durationMs: typeof row.durationMs === "number" ? row.durationMs : null,
    error: typeof row.error === "string" ? row.error : null,
    outcome: typeof row.outcome === "string" ? row.outcome : "unknown",
    phase: typeof row.phase === "string" ? row.phase : "unknown",
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null
  }));
}

export function serializePreviewScan(input: {
  agencyMappings?: AgencyMapping[];
  domain: DomainRow | null;
  events?: ScanEventRow[];
  latestEvent?: ScanEventRow | null;
  recentEvents?: ScanEventRow[];
  regulatoryRisk?: PreviewScanStatusResponse["regulatoryRisk"];
  runtimeArtifacts?: RuntimeArtifactsRow;
  scan: ScanRow;
}): PreviewScanStatusResponse {
  const payload = getPreviewPayload(input.scan);
  const events = input.events ?? input.recentEvents ?? [];

  return {
    scanId: input.scan.id,
    domainId: input.scan.domain_id,
    hostname: input.domain?.hostname ?? ((input.scan.scan_config_json as ScanConfig).hostname ?? "Unknown"),
    normalizedUrl:
      input.domain?.normalized_url ?? ((input.scan.scan_config_json as ScanConfig).normalizedUrl ?? ""),
    status: input.scan.status,
    scanType: input.scan.scan_type,
    createdAt: input.scan.created_at,
    updatedAt: input.scan.updated_at,
    startedAt: input.scan.started_at,
    completedAt: input.scan.completed_at,
    pagesRequested: input.scan.pages_requested,
    pagesScanned: input.scan.pages_scanned,
    errorMessage: input.scan.error_message,
    statusMessage: getStatusMessage(input.scan.status),
    activityLine: buildActivityLine(input.scan, input.latestEvent ?? null),
    activityDetails: buildActivityDetails(input.scan, input.latestEvent ?? null),
    activityFeed: buildActivityFeed(input.scan, input.recentEvents ?? []),
    activityRef: buildActivityRef(input.scan.id, input.latestEvent ?? null),
    events: serializePreviewEvents(events),
    executionSummary: getScannerExecutionSummary(input.scan.scan_config_json),
    buildPhaseSummaries: serializeBuildPhaseSummaries(input.runtimeArtifacts ?? null),
    agencyMappings: input.agencyMappings ?? [],
    regulatoryRisk: input.regulatoryRisk ?? null,
    previewPayload: payload
  };
}
