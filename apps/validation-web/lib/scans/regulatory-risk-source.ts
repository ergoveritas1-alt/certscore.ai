import type { RegulatoryRiskSource } from "@website-signal-risk-scanner/shared";

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
}): RegulatoryRiskSource {
  return {
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
    thirdPartyDataFlowRiskScore: toNumber(input.snapshot.third_party_data_flow_risk_score)
  };
}
