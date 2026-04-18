import { query, queryOne } from "@website-signal-risk-scanner/db";
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

export type PreviewRuntimeArtifactsRecord = {
  build_phase_summaries?: Array<Record<string, unknown>> | null;
};

export type PreviewRuntimeArtifactsRow = PreviewRuntimeArtifactsRecord | null;

export async function findOrCreateAnonymousPreviewDomain(hostname: string, normalizedUrl: string) {
  let existingDomain: PreviewDomainRow | null;
  try {
    existingDomain = await queryOne<PreviewDomainRow>(
      `select id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at
         from domains
        where organization_id is null
          and normalized_url = $1
        order by created_at desc
        limit 1`,
      [normalizedUrl],
      { readOnly: true }
    );
  } catch (error) {
    throw buildDatabaseOperationError("Failed to load preview domain", error);
  }

  if (existingDomain) {
    return existingDomain;
  }

  let createdDomain: PreviewDomainRow | null;
  try {
    createdDomain = await queryOne<PreviewDomainRow>(
      `insert into domains (hostname, normalized_url)
       values ($1, $2)
       returning id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at`,
      [hostname, normalizedUrl]
    );
  } catch (error) {
    throw buildDatabaseOperationError("Failed to create preview domain", error);
  }

  if (!createdDomain) {
    throw buildDatabaseOperationError("Failed to create preview domain", new Error("Unknown database error."));
  }

  return createdDomain;
}

export async function insertPreviewScanEvent(input: {
  domainId: string | null;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
  organizationId?: string | null;
  scanId?: string | null;
}) {
  try {
    await query(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        input.scanId ?? null,
        input.domainId ?? null,
        input.organizationId ?? null,
        input.eventType,
        input.message,
        input.metadata ?? null
      ]
    );
  } catch (error) {
    throw buildDatabaseOperationError("Failed to create scan event", error);
  }
}

export async function createPreviewScanRecord(input: { domainId: string; hostname: string; normalizedUrl: string }) {
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

  let scan: PreviewScanRow | null;
  try {
    scan = await queryOne<PreviewScanRow>(
      `insert into scans (domain_id, scan_type, status, pages_requested, pages_scanned, scan_config_json)
       values ($1, 'preview', 'queued', 1, 0, $2)
       returning *`,
      [input.domainId, initialConfig]
    );
  } catch (error) {
    throw buildDatabaseOperationError("Failed to create preview scan", error);
  }

  if (!scan) {
    throw buildDatabaseOperationError("Failed to create preview scan", new Error("Unknown database error."));
  }

  await insertPreviewScanEvent({
    domainId: input.domainId,
    eventType: PREVIEW_SCAN_EVENT_TYPES.queued,
    message: "Preview scan queued.",
    metadata: { hostname: input.hostname, normalizedUrl: input.normalizedUrl },
    scanId: scan.id
  });

  return scan;
}

export async function getPreviewScanRecord(scanId: string): Promise<{ domain: PreviewDomainRow | null; scan: PreviewScanRow } | null> {
  const scan = await queryOne<PreviewScanRow>(
    `select *
       from scans
      where id = $1`,
    [scanId],
    { readOnly: true }
  );
  if (!scan) {
    return null;
  }
  if (!scan.domain_id) {
    return { domain: null, scan };
  }
  const domain = await queryOne<PreviewDomainRow>(
    `select id, organization_id, hostname, normalized_url, latest_scan_id, created_at, updated_at
       from domains
      where id = $1`,
    [scan.domain_id],
    { readOnly: true }
  );
  return { domain, scan };
}

export async function updatePreviewScan(scanId: string, patch: Partial<PreviewScanRow>) {
  const assignments = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!assignments.length) {
    const existing = await queryOne<PreviewScanRow>(
      `select *
         from scans
        where id = $1`,
      [scanId],
      { readOnly: true }
    );
    if (!existing) {
      throw new Error("Failed to update preview scan: Unknown error");
    }
    return existing;
  }

  const columns = assignments.map(([key], index) => `${key} = $${index + 2}`);
  const values = assignments.map(([, value]) => value);
  const scan = await queryOne<PreviewScanRow>(
    `update scans
        set ${columns.join(", ")}
      where id = $1
      returning *`,
    [scanId, ...values]
  );
  if (!scan) {
    throw new Error("Failed to update preview scan: Unknown error");
  }
  return scan;
}

export async function setPreviewDomainLatestScan(domainId: string, scanId: string) {
  try {
    await query(
      `update domains
          set latest_scan_id = $1
        where id = $2`,
      [scanId, domainId]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to update domain latest scan: ${message}`);
  }
}

export async function loadPreviewScanSnapshotRecord(scanId: string): Promise<Record<string, unknown> | null> {
  try {
    return await queryOne<Record<string, unknown>>(
      `select ${
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
      }
         from scan_snapshots
        where scan_id = $1`,
      [scanId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load preview scan snapshot: ${message}`);
  }
}

export async function getLatestPreviewScanEvent(scanId: string): Promise<PreviewScanEventRow | null> {
  try {
    return await queryOne<PreviewScanEventRow>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at desc
        limit 1`,
      [scanId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load latest preview scan event: ${message}`);
  }
}

export async function getRecentPreviewScanEvents(scanId: string): Promise<PreviewScanEventRow[]> {
  try {
    const result = await query<PreviewScanEventRow>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at asc
        limit 6`,
      [scanId],
      { readOnly: true }
    );
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load recent preview scan events: ${message}`);
  }
}

export async function getAllPreviewScanEvents(scanId: string): Promise<PreviewScanEventRow[]> {
  try {
    const result = await query<PreviewScanEventRow>(
      `select event_type, message, metadata_json, created_at
         from scan_events
        where scan_id = $1
        order by created_at asc`,
      [scanId],
      { readOnly: true }
    );
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load preview scan events: ${message}`);
  }
}

export async function getPreviewRuntimeArtifacts(scanId: string): Promise<PreviewRuntimeArtifactsRow> {
  try {
    const row = await queryOne<PreviewRuntimeArtifactsRecord>(
      `select *
         from scan_runtime_artifacts
        where scan_id = $1`,
      [scanId],
      { readOnly: true }
    );
    return row ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load preview scan runtime artifacts: ${message}`);
  }
}
