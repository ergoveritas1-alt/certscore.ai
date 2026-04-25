import type { RegulatoryRiskSource } from "@website-signal-risk-scanner/shared";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toRetentionDisclosure(value: unknown): RegulatoryRiskSource["retentionDisclosureQuality"] {
  return value === "none" || value === "vague" || value === "specific" ? value : null;
}

function toPrivacyContactChannelType(value: unknown): RegulatoryRiskSource["privacyContactChannelType"] {
  return value === "email" || value === "form" || value === "portal" || value === "none" ? value : null;
}

export function buildRegulatoryRiskSource(input: {
  snapshot: Record<string, unknown>;
  runtimeArtifacts?: Record<string, unknown> | null;
  hostname?: string | null;
}): RegulatoryRiskSource {
  const trackingContext = deriveHighRiskTrackingContext({
    hostname: input.hostname,
    snapshot: input.snapshot,
    runtimeArtifacts: input.runtimeArtifacts
  });
  const highRiskVendorCategories = new Set(trackingContext.highRiskVendors.map((vendor) => vendor.category));
  const highRiskTrackingVendorNames = trackingContext.highRiskVendors.map((vendor) => vendor.name);
  const thirdPartyRequestDomains = Array.isArray(input.runtimeArtifacts?.third_party_request_domains)
    ? input.runtimeArtifacts.third_party_request_domains.filter((entry): entry is string => typeof entry === "string")
    : Array.isArray(input.snapshot.third_party_request_domains)
      ? input.snapshot.third_party_request_domains.filter((entry): entry is string => typeof entry === "string")
      : [];

  return {
    homepageFetchStatus:
      input.snapshot.homepage_fetch_status === "ok" ||
      input.snapshot.homepage_fetch_status === "error" ||
      input.snapshot.homepage_fetch_status === "blocked" ||
      input.snapshot.homepage_fetch_status === "forbidden" ||
      input.snapshot.homepage_fetch_status === "timeout" ||
      input.snapshot.homepage_fetch_status === "redirected" ||
      input.snapshot.homepage_fetch_status === "not_found"
        ? input.snapshot.homepage_fetch_status
        : null,
    pagesScanned: toNumber(input.snapshot.pages_scanned),
    partialScan: toBoolean(input.snapshot.partial_scan),
    finalUrl: typeof input.snapshot.final_url === "string" ? input.snapshot.final_url : null,
    registeredDomain: typeof input.snapshot.registered_domain === "string" ? input.snapshot.registered_domain : null,
    trackingBeforeConsentDetected: toBoolean(input.snapshot.tracking_before_consent_detected),
    thirdPartyCookieSetBeforeConsent: toBoolean(input.snapshot.third_party_cookie_set_before_consent),
    cookieBannerPresent: toBoolean(input.snapshot.cookie_banner_present),
    rejectAllPresent: toBoolean(input.snapshot.reject_all_present),
    granularPreferencesPresent: toBoolean(input.snapshot.granular_preferences_present),
    dsarRequestMechanismPresent: toBoolean(input.snapshot.dsar_request_mechanism_present),
    dataAccessRequestPresent: toBoolean(input.snapshot.data_access_request_present),
    dataDeletionRequestPresent: toBoolean(input.snapshot.data_deletion_request_present),
    privacyContactChannelType:
      toPrivacyContactChannelType(input.snapshot.privacyContactChannelType) ??
      toPrivacyContactChannelType(input.snapshot.privacy_contact_channel_type),
    mentionsDataRetention: toBoolean(input.snapshot.mentions_data_retention),
    dataRetentionSpecificPeriodDetected: toBoolean(input.snapshot.data_retention_specific_period_detected),
    retentionDisclosureQuality:
      toRetentionDisclosure(input.snapshot.policyRetentionDisclosure) ??
      toRetentionDisclosure(input.snapshot.policy_retention_disclosure),
    policyClaimNoSale: toBoolean(input.snapshot.policyClaimNoSale) ?? toBoolean(input.snapshot.policy_claim_no_sale),
    policyClaimNoTracking: toBoolean(input.snapshot.policyClaimNoTracking) ?? toBoolean(input.snapshot.policy_claim_no_tracking),
    policyClaimPrivacyProtective:
      toBoolean(input.snapshot.policyClaimPrivacyProtective) ?? toBoolean(input.snapshot.policy_claim_privacy_protective),
    policyBehaviorConflictDetected: toBoolean(input.snapshot.policy_behavior_conflict_detected),
    sessionReplayWithoutDisclosureDetected: toBoolean(input.snapshot.session_replay_without_disclosure_detected),
    mentionsSensitiveData: toBoolean(input.snapshot.mentions_sensitive_data),
    mentionsHealthData: toBoolean(input.snapshot.mentions_health_data),
    mentionsBiometricData: toBoolean(input.snapshot.mentions_biometric_data),
    mentionsFinancialData: toBoolean(input.snapshot.mentions_financial_data),
    mentionsUnder13: toBoolean(input.snapshot.mentions_under_13),
    mentionsUnder16: toBoolean(input.snapshot.mentions_under_16),
    californiaExposureLikely: toBoolean(input.snapshot.california_exposure_likely),
    doNotSellLinkPresent: toBoolean(input.snapshot.do_not_sell_link_present),
    advertisingTrackerCount: toNumber(input.snapshot.advertising_tracker_count),
    sessionReplayTrackerCount: toNumber(input.snapshot.session_replay_tracker_count),
    consumerProtectionScore: toNumber(input.snapshot.consumer_protection_score),
    wcagErrorCountTotal: toNumber(input.snapshot.wcag_error_count_total),
    wcagMissingAltCount: toNumber(input.snapshot.wcag_missing_alt_count),
    wcagFormLabelErrorCount: toNumber(input.snapshot.wcag_form_label_error_count),
    accessibilityStatementPresent: toBoolean(input.snapshot.accessibility_statement_present),
    accessibilityClaimMismatchDetected: toBoolean(input.snapshot.accessibility_claim_mismatch_detected),
    accessibilityLitigationRiskScore: toNumber(input.snapshot.accessibility_litigation_risk_score),
    ecommerceSiteLikely: toBoolean(input.snapshot.ecommerce_site_likely),
    trackerRegulatoryRiskScore: toNumber(input.snapshot.tracker_regulatory_risk_score),
    thirdPartyDataFlowRiskScore: toNumber(input.snapshot.third_party_data_flow_risk_score),
    thirdPartyRequestCount:
      toNumber(input.runtimeArtifacts?.third_party_request_count) ?? toNumber(input.snapshot.third_party_request_count),
    thirdPartyRequestDomainCount: thirdPartyRequestDomains.length > 0 ? thirdPartyRequestDomains.length : null,
    sensitiveContextTrackingDetected:
      trackingContext.isSensitiveContext &&
      highRiskTrackingVendorNames.length > 0 &&
      (toBoolean(input.snapshot.tracking_before_consent_detected) === true ||
        toBoolean(input.snapshot.preconsent_tracking_detected) === true ||
        toBoolean(input.snapshot.third_party_cookie_set_before_consent) === true),
    highRiskIdentityVendorDetected: highRiskVendorCategories.has("identity_resolution"),
    highRiskDataBrokerDetected: highRiskVendorCategories.has("data_broker"),
    healthAdtechVendorDetected: highRiskVendorCategories.has("health_adtech"),
    deviceSignalVendorDetected: highRiskVendorCategories.has("device_signal"),
    highRiskTrackingVendorNames
  };
}
