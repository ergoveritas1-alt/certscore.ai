import type { AgencyMappingSource } from "@website-signal-risk-scanner/shared";

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildAgencyMappingSource(snapshot: Record<string, unknown>): AgencyMappingSource {
  return {
    policyBehaviorConflictDetected: toBoolean(snapshot.policy_behavior_conflict_detected),
    sessionReplayWithoutDisclosureDetected: toBoolean(snapshot.session_replay_without_disclosure_detected),
    sessionReplayTrackerCount: toNumber(snapshot.session_replay_tracker_count),
    advertisingTrackerCount: toNumber(snapshot.advertising_tracker_count),
    affiliateDisclosurePresent: toBoolean(snapshot.affiliate_disclosure_present),
    advertisingDisclosurePresent: toBoolean(snapshot.advertising_disclosure_present),
    testimonialOrReviewDisclosurePresent: toBoolean(snapshot.testimonial_or_review_disclosure_present),
    consumerProtectionScore: toNumber(snapshot.consumer_protection_score),
    autoRenewalDisclosurePresent: toBoolean(snapshot.auto_renewal_disclosure_present),
    cancellationPolicyPresent: toBoolean(snapshot.cancellation_policy_present),
    refundOrReturnWindowDetected: toBoolean(snapshot.refund_or_return_window_detected),
    subscriptionOfferDetected: toBoolean(snapshot.subscription_offer_detected),
    freeTrialDetected: toBoolean(snapshot.free_trial_detected),
    trackingBeforeConsentDetected: toBoolean(snapshot.tracking_before_consent_detected),
    thirdPartyCookieSetBeforeConsent: toBoolean(snapshot.third_party_cookie_set_before_consent),
    cookieBannerPresent: toBoolean(snapshot.cookie_banner_present),
    rejectAllPresent: toBoolean(snapshot.reject_all_present),
    granularPreferencesPresent: toBoolean(snapshot.granular_preferences_present),
    mentionsGdpr: toBoolean(snapshot.mentions_gdpr),
    crossBorderTransferMechanismDetected: toBoolean(snapshot.cross_border_transfer_mechanism_detected),
    mentionsCrossBorderTransfer: toBoolean(snapshot.mentions_cross_border_transfer),
    dsarRequestMechanismPresent: toBoolean(snapshot.dsar_request_mechanism_present),
    dataDeletionRequestPresent: toBoolean(snapshot.data_deletion_request_present),
    dataAccessRequestPresent: toBoolean(snapshot.data_access_request_present),
    privacyRequestFormPresent: toBoolean(snapshot.privacy_request_form_present),
    consentMaturityScore: toNumber(snapshot.consent_maturity_score),
    trackerRegulatoryRiskScore: toNumber(snapshot.tracker_regulatory_risk_score),
    subprocessorListPresent: toBoolean(snapshot.subprocessor_list_present),
    doNotSellLinkPresent: toBoolean(snapshot.do_not_sell_link_present),
    gpcSignalRespected: toBoolean(snapshot.gpc_signal_respected),
    californiaExposureLikely: toBoolean(snapshot.california_exposure_likely),
    mentionsDataSaleOrSharing: toBoolean(snapshot.mentions_data_sale_or_sharing),
    wcagErrorCountTotal: toNumber(snapshot.wcag_error_count_total),
    wcagMissingAltCount: toNumber(snapshot.wcag_missing_alt_count),
    wcagFormLabelErrorCount: toNumber(snapshot.wcag_form_label_error_count),
    wcagKeyboardNavigationIssueCount: toNumber(snapshot.wcag_keyboard_navigation_issue_count),
    accessibilityStatementPresent: toBoolean(snapshot.accessibility_statement_present),
    accessibilityClaimMismatchDetected: toBoolean(snapshot.accessibility_claim_mismatch_detected),
    accessibilityLitigationRiskScore: toNumber(snapshot.accessibility_litigation_risk_score),
    adaDemandLetterProbability: toNumber(snapshot.ada_demand_letter_probability),
    ecommerceSiteLikely: toBoolean(snapshot.ecommerce_site_likely),
    privacyPolicyPresent: toBoolean(snapshot.privacy_policy_present),
    privacyContactMethodPresent: toBoolean(snapshot.privacy_contact_method_present),
    privacyEmailSpecificPresent: toBoolean(snapshot.privacy_email_specific_present),
    mentionsDataRetention: toBoolean(snapshot.mentions_data_retention),
    mentionsSensitiveData: toBoolean(snapshot.mentions_sensitive_data),
    mentionsUnder13: toBoolean(snapshot.mentions_under_13),
    mentionsUnder16: toBoolean(snapshot.mentions_under_16),
    childrenAudienceLikely: toBoolean(snapshot.children_audience_likely),
    mentionsCcpaOrCpra: toBoolean(snapshot.mentions_ccpa_or_cpra)
  };
}
