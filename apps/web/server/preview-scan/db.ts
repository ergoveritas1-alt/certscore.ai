import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { PREVIEW_SCAN_EVENT_TYPES, type PreviewScanPayload, type ScanSnapshot, type ScanStatus, type ScanType } from "@website-signal-risk-scanner/shared";
import { buildDatabaseOperationError } from "../database/describe-database-error";

export type PreviewDomainRow = {
  id: string;
  organization_id: string | null;
  hostname: string;
  normalized_url: string;
  latest_scan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PreviewScanRow = {
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
  post403Policy?: {
    maxHomepageRetriesAfter403?: number;
    maxPassiveVerificationFetchesAfter403?: number;
    passiveOnlyAfter403?: boolean;
    stopOnHomepage403?: boolean;
    verifiedSurfaceTargetsAfter403?: string[];
  };
  previewPayload?: PreviewScanPayload;
  processor?: string;
};

export type PreviewSnapshotRow = {
  authWallDetected?: ScanSnapshot["authWallDetected"] | null;
  authWallSuspected?: ScanSnapshot["authWallSuspected"] | null;
  accessibilityClaimMismatchDetected: ScanSnapshot["accessibilityClaimMismatchDetected"];
  accessibilityLitigationRiskScore: ScanSnapshot["accessibilityLitigationRiskScore"];
  accessibilityScore: ScanSnapshot["accessibilityScore"];
  accessibilityStatementPresent: ScanSnapshot["accessibilityStatementPresent"];
  adaDemandLetterProbability: ScanSnapshot["adaDemandLetterProbability"];
  advertisingDisclosurePresent: ScanSnapshot["advertisingDisclosurePresent"];
  advertisingTrackerCount: ScanSnapshot["advertisingTrackerCount"];
  affiliateDisclosurePresent: ScanSnapshot["affiliateDisclosurePresent"];
  blockPageClassification?: ScanSnapshot["blockPageClassification"] | null;
  blockVendorGuess?: ScanSnapshot["blockVendorGuess"] | null;
  blockedFlag?: ScanSnapshot["blockedFlag"] | null;
  certscoreOverall: ScanSnapshot["certscoreOverall"];
  californiaExposureLikely: ScanSnapshot["californiaExposureLikely"];
  cancellationPolicyPresent: ScanSnapshot["cancellationPolicyPresent"];
  captchaFlag?: ScanSnapshot["captchaFlag"] | null;
  challengeSuspected?: ScanSnapshot["challengeSuspected"] | null;
  contactPagePresent: ScanSnapshot["contactPagePresent"];
  coverageLevel?: ScanSnapshot["coverageLevel"] | null;
  cookieBannerPresent: ScanSnapshot["cookieBannerPresent"];
  consentMaturityScore: ScanSnapshot["consentMaturityScore"];
  consumerProtectionScore: ScanSnapshot["consumerProtectionScore"];
  crossBorderTransferMechanismDetected: ScanSnapshot["crossBorderTransferMechanismDetected"];
  dataAccessRequestPresent: ScanSnapshot["dataAccessRequestPresent"];
  dataDeletionRequestPresent: ScanSnapshot["dataDeletionRequestPresent"];
  doNotSellLinkPresent: ScanSnapshot["doNotSellLinkPresent"];
  dsarRequestMechanismPresent: ScanSnapshot["dsarRequestMechanismPresent"];
  ecommerceSiteLikely: ScanSnapshot["ecommerceSiteLikely"];
  fingerprintBlockSuspected?: ScanSnapshot["fingerprintBlockSuspected"] | null;
  freeTrialDetected: ScanSnapshot["freeTrialDetected"];
  finalUrl: ScanSnapshot["finalUrl"];
  geoBlockSuspected?: ScanSnapshot["geoBlockSuspected"] | null;
  granularPreferencesPresent: ScanSnapshot["granularPreferencesPresent"];
  homepageFetchHttpStatus?: ScanSnapshot["homepageFetchHttpStatus"] | null;
  homepageFetchStatus: ScanSnapshot["homepageFetchStatus"] | null;
  passiveVerificationAttemptCount?: ScanSnapshot["passiveVerificationAttemptCount"] | null;
  passiveVerificationAttempted?: ScanSnapshot["passiveVerificationAttempted"] | null;
  redirectCount: ScanSnapshot["redirectCount"];
  rateLimitSuspected?: ScanSnapshot["rateLimitSuspected"] | null;
  registeredDomain: ScanSnapshot["registeredDomain"];
  robotsAllowed?: ScanSnapshot["robotsAllowed"] | null;
  robotsFetchHttpStatus?: ScanSnapshot["robotsFetchHttpStatus"] | null;
  robotsFetchStatus?: ScanSnapshot["robotsFetchStatus"] | null;
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

export type PreviewScanEventRow = {
  created_at: string;
  event_type: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
};

export type PreviewRuntimeArtifactsRow = {
  build_phase_summaries?: Array<Record<string, unknown>> | null;
} | null;

export async function findOrCreateAnonymousPreviewDomain(hostname: string, normalizedUrl: string) {
  const db = createDatabaseClient();
  const { data: existingDomain, error: lookupError } = await db
    .from("domains")
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .is("organization_id", null)
    .eq("normalized_url", normalizedUrl)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw buildDatabaseOperationError("Failed to load preview domain", lookupError);
  }
  if (existingDomain) {
    return existingDomain as PreviewDomainRow;
  }

  const { data: createdDomain, error } = await db
    .from("domains")
    .insert({ hostname, normalized_url: normalizedUrl })
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .single();

  if (error || !createdDomain) {
    throw buildDatabaseOperationError("Failed to create preview domain", error);
  }

  return createdDomain as PreviewDomainRow;
}

export async function insertPreviewScanEvent(input: {
  domainId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  organizationId?: string | null;
  scanId?: string | null;
}) {
  const db = createDatabaseClient();
  const { error } = await db.from("scan_events").insert({
    scan_id: input.scanId ?? null,
    domain_id: input.domainId ?? null,
    organization_id: input.organizationId ?? null,
    event_type: input.eventType,
    message: input.message,
    metadata_json: input.metadata ?? null
  });
  if (error) {
    throw buildDatabaseOperationError("Failed to create scan event", error);
  }
}

export async function createPreviewScanRecord(input: { domainId: string; hostname: string; normalizedUrl: string }) {
  const db = createDatabaseClient();
  const initialConfig: ScanConfig = {
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: "live-preview-v1"
  };

  const { data: scan, error } = await db
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
    throw buildDatabaseOperationError("Failed to create preview scan", error);
  }

  await insertPreviewScanEvent({
    domainId: input.domainId,
    eventType: PREVIEW_SCAN_EVENT_TYPES.queued,
    message: "Preview scan queued.",
    metadata: { hostname: input.hostname, normalizedUrl: input.normalizedUrl },
    scanId: (scan as { id: string }).id
  });

  return scan as PreviewScanRow;
}

export async function getPreviewScanRecord(scanId: string): Promise<{ domain: PreviewDomainRow | null; scan: PreviewScanRow } | null> {
  const db = createDatabaseClient();
  const { data: scan } = await db.from("scans").select("*").eq("id", scanId).maybeSingle();
  if (!scan) {
    return null;
  }
  const scanRow = scan as PreviewScanRow;
  if (!scanRow.domain_id) {
    return { domain: null, scan: scanRow };
  }
  const { data: domain } = await db
    .from("domains")
    .select("id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at")
    .eq("id", scanRow.domain_id)
    .maybeSingle();
  return { domain: (domain as PreviewDomainRow | null) ?? null, scan: scanRow };
}

export async function updatePreviewScan(scanId: string, patch: Partial<PreviewScanRow>) {
  const db = createDatabaseClient();
  const { data: scan, error } = await db.from("scans").update(patch).eq("id", scanId).select("*").single();
  if (error || !scan) {
    throw new Error(`Failed to update preview scan: ${error?.message ?? "Unknown error"}`);
  }
  return scan as PreviewScanRow;
}

export async function setPreviewDomainLatestScan(domainId: string, scanId: string) {
  const db = createDatabaseClient();
  const { error } = await db.from("domains").update({ latest_scan_id: scanId }).eq("id", domainId);
  if (error) {
    throw new Error(`Failed to update domain latest scan: ${error.message}`);
  }
}

export async function loadPreviewScanSnapshotRecord(scanId: string): Promise<Record<string, unknown> | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scan_snapshots")
    .select(
      [
        "total_signals","pages_scanned","homepage_fetch_status","homepage_fetch_http_status","final_url","registered_domain","redirect_count","partial_scan",
        "robots_allowed","robots_fetch_http_status","robots_fetch_status","auth_wall_detected","auth_wall_suspected","blocked_flag","captcha_flag",
        "block_page_classification","block_vendor_guess","challenge_suspected","rate_limit_suspected","geo_block_suspected","fingerprint_block_suspected",
        "passive_verification_attempt_count","passive_verification_attempted","coverage_level","certscore_overall","privacy_score","accessibility_score",
        "privacy_policy_present","terms_of_service_present","contact_page_present","privacy_contact_method_present","privacy_email_specific_present","cookie_banner_present",
        "reject_all_present","granular_preferences_present","tracking_before_consent_detected","preconsent_tracking_detected","third_party_cookie_set_before_consent",
        "policy_behavior_conflict_detected","session_replay_without_disclosure_detected","session_replay_tracker_count","advertising_tracker_count","affiliate_disclosure_present",
        "advertising_disclosure_present","testimonial_or_review_disclosure_present","consumer_protection_score","cancellation_policy_present","subscription_offer_detected",
        "free_trial_detected","mentions_gdpr","cross_border_transfer_mechanism_detected","mentions_cross_border_transfer","dsar_request_mechanism_present",
        "data_deletion_request_present","data_access_request_present","privacy_request_form_present","consent_maturity_score","tracker_regulatory_risk_score",
        "subprocessor_list_present","do_not_sell_link_present","california_exposure_likely","mentions_data_sale_or_sharing","mentions_ccpa_or_cpra",
        "accessibility_statement_present","accessibility_claim_mismatch_detected","accessibility_litigation_risk_score","ada_demand_letter_probability",
        "ecommerce_site_likely","mentions_data_retention","mentions_sensitive_data","mentions_under_13","mentions_under_16","wcag_error_count_total",
        "wcag_missing_alt_count","wcag_form_label_error_count","wcag_keyboard_navigation_issue_count"
      ].join(", ")
    )
    .eq("scan_id", scanId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load preview scan snapshot: ${error.message}`);
  }
  return (data as Record<string, unknown> | null) ?? null;
}

export async function getLatestPreviewScanEvent(scanId: string): Promise<PreviewScanEventRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load latest preview scan event: ${error.message}`);
  }
  return (data as PreviewScanEventRow | null) ?? null;
}

export async function getRecentPreviewScanEvents(scanId: string): Promise<PreviewScanEventRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true })
    .limit(6);
  if (error) {
    throw new Error(`Failed to load recent preview scan events: ${error.message}`);
  }
  return (data as PreviewScanEventRow[] | null) ?? [];
}

export async function getAllPreviewScanEvents(scanId: string): Promise<PreviewScanEventRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scan_events")
    .select("event_type, message, metadata_json, created_at")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to load preview scan events: ${error.message}`);
  }
  return (data as PreviewScanEventRow[] | null) ?? [];
}

export async function getPreviewRuntimeArtifacts(scanId: string): Promise<PreviewRuntimeArtifactsRow> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("scan_runtime_artifacts").select("*").eq("scan_id", scanId).maybeSingle();
  if (error) {
    throw new Error(`Failed to load preview scan runtime artifacts: ${error.message}`);
  }
  return (data as PreviewRuntimeArtifactsRow) ?? null;
}
