import type { RegulatoryRiskSource } from "@website-signal-risk-scanner/shared";
import { deriveHighRiskTrackingContext } from "./high-risk-tracking-context";

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function booleanFromKeys(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toBoolean(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberFromKeys(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getObjectValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return null;
}

function hasPreconsentTimelineSequence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const timeline = getObjectValue(runtimeArtifacts, ["consentTimeline", "consent_timeline"]);
  const firstNonEssentialRequestMs =
    typeof timeline?.firstNonEssentialRequestMs === "number"
      ? timeline.firstNonEssentialRequestMs
      : typeof timeline?.first_non_essential_request_ms === "number"
        ? timeline.first_non_essential_request_ms
        : null;
  const firstCmpVisibleMs =
    typeof timeline?.firstCmpVisibleMs === "number"
      ? timeline.firstCmpVisibleMs
      : typeof timeline?.first_cmp_visible_ms === "number"
        ? timeline.first_cmp_visible_ms
        : null;
  const firstConsentActionMs =
    typeof timeline?.firstConsentActionMs === "number"
      ? timeline.firstConsentActionMs
      : typeof timeline?.first_consent_action_ms === "number"
        ? timeline.first_consent_action_ms
        : null;

  return (
    typeof firstNonEssentialRequestMs === "number" &&
    ((typeof firstCmpVisibleMs === "number" && firstNonEssentialRequestMs < firstCmpVisibleMs) ||
      (typeof firstConsentActionMs === "number" && firstNonEssentialRequestMs < firstConsentActionMs))
  );
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
  const hasPreconsentTimelineSequenceEvidence = hasPreconsentTimelineSequence(input.runtimeArtifacts);
  const hasPreconsentTrackingSignal =
    hasPreconsentTimelineSequenceEvidence &&
    (booleanFromKeys(input.snapshot, ["tracking_before_consent_detected", "trackingBeforeConsentDetected"]) === true ||
      booleanFromKeys(input.snapshot, ["preconsent_tracking_detected", "preconsentTrackingDetected"]) === true ||
      booleanFromKeys(input.snapshot, ["third_party_cookie_set_before_consent", "thirdPartyCookieSetBeforeConsent"]) === true);
  const thirdPartyRequestDomains = Array.isArray(input.runtimeArtifacts?.third_party_request_domains)
    ? input.runtimeArtifacts.third_party_request_domains.filter((entry): entry is string => typeof entry === "string")
    : Array.isArray(input.snapshot.third_party_request_domains)
      ? input.snapshot.third_party_request_domains.filter((entry): entry is string => typeof entry === "string")
      : [];
  const trackingBeforeConsentDetected = hasPreconsentTimelineSequenceEvidence
    ? booleanFromKeys(input.snapshot, [
        "tracking_before_consent_detected",
        "trackingBeforeConsentDetected"
      ])
    : null;
  const preconsentTrackingDetected = hasPreconsentTimelineSequenceEvidence
    ? booleanFromKeys(input.snapshot, [
        "preconsent_tracking_detected",
        "preconsentTrackingDetected"
      ])
    : null;
  const thirdPartyCookieSetBeforeConsent = hasPreconsentTimelineSequenceEvidence
    ? booleanFromKeys(input.snapshot, [
        "third_party_cookie_set_before_consent",
        "thirdPartyCookieSetBeforeConsent"
      ])
    : null;

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
    trackingBeforeConsentDetected,
    thirdPartyCookieSetBeforeConsent,
    cookieBannerPresent: booleanFromKeys(input.snapshot, ["cookie_banner_present", "cookieBannerPresent"]),
    rejectAllPresent: booleanFromKeys(input.snapshot, ["reject_all_present", "rejectAllPresent"]),
    granularPreferencesPresent: booleanFromKeys(input.snapshot, ["granular_preferences_present", "granularPreferencesPresent"]),
    dsarRequestMechanismPresent: booleanFromKeys(input.snapshot, ["dsar_request_mechanism_present", "dsarRequestMechanismPresent"]),
    dataAccessRequestPresent: booleanFromKeys(input.snapshot, ["data_access_request_present", "dataAccessRequestPresent"]),
    dataDeletionRequestPresent: booleanFromKeys(input.snapshot, ["data_deletion_request_present", "dataDeletionRequestPresent"]),
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
    policyBehaviorConflictDetected: booleanFromKeys(input.snapshot, ["policy_behavior_conflict_detected", "policyBehaviorConflictDetected"]),
    sessionReplayWithoutDisclosureDetected:
      booleanFromKeys(input.snapshot, [
        "session_replay_without_disclosure_detected",
        "sessionReplayWithoutDisclosureDetected"
      ]) ??
      (trackingContext.isSensitiveContext &&
      highRiskVendorCategories.has("session_replay") &&
      hasPreconsentTrackingSignal
        ? true
        : null),
    mentionsSensitiveData: booleanFromKeys(input.snapshot, ["mentions_sensitive_data", "mentionsSensitiveData"]),
    mentionsHealthData: booleanFromKeys(input.snapshot, ["mentions_health_data", "mentionsHealthData"]),
    mentionsBiometricData: booleanFromKeys(input.snapshot, ["mentions_biometric_data", "mentionsBiometricData"]),
    mentionsFinancialData: booleanFromKeys(input.snapshot, ["mentions_financial_data", "mentionsFinancialData"]),
    mentionsUnder13: booleanFromKeys(input.snapshot, ["mentions_under_13", "mentionsUnder13"]),
    mentionsUnder16: booleanFromKeys(input.snapshot, ["mentions_under_16", "mentionsUnder16"]),
    californiaExposureLikely: booleanFromKeys(input.snapshot, ["california_exposure_likely", "californiaExposureLikely"]),
    doNotSellLinkPresent: booleanFromKeys(input.snapshot, ["do_not_sell_link_present", "doNotSellLinkPresent"]),
    advertisingTrackerCount: numberFromKeys(input.snapshot, ["advertising_tracker_count", "advertisingTrackerCount"]),
    sessionReplayTrackerCount: numberFromKeys(input.snapshot, ["session_replay_tracker_count", "sessionReplayTrackerCount"]),
    consumerProtectionScore: numberFromKeys(input.snapshot, ["consumer_protection_score", "consumerProtectionScore"]),
    wcagErrorCountTotal: numberFromKeys(input.snapshot, ["wcag_error_count_total", "wcagErrorCountTotal"]),
    wcagMissingAltCount: numberFromKeys(input.snapshot, ["wcag_missing_alt_count", "wcagMissingAltCount"]),
    wcagFormLabelErrorCount: numberFromKeys(input.snapshot, ["wcag_form_label_error_count", "wcagFormLabelErrorCount"]),
    accessibilityStatementPresent: booleanFromKeys(input.snapshot, ["accessibility_statement_present", "accessibilityStatementPresent"]),
    accessibilityClaimMismatchDetected: booleanFromKeys(input.snapshot, [
      "accessibility_claim_mismatch_detected",
      "accessibilityClaimMismatchDetected"
    ]),
    accessibilityLitigationRiskScore: numberFromKeys(input.snapshot, [
      "accessibility_litigation_risk_score",
      "accessibilityLitigationRiskScore"
    ]),
    ecommerceSiteLikely: booleanFromKeys(input.snapshot, ["ecommerce_site_likely", "ecommerceSiteLikely"]),
    trackerRegulatoryRiskScore: numberFromKeys(input.snapshot, ["tracker_regulatory_risk_score", "trackerRegulatoryRiskScore"]),
    thirdPartyDataFlowRiskScore: numberFromKeys(input.snapshot, ["third_party_data_flow_risk_score", "thirdPartyDataFlowRiskScore"]),
    thirdPartyRequestCount:
      toNumber(input.runtimeArtifacts?.third_party_request_count) ?? toNumber(input.snapshot.third_party_request_count),
    thirdPartyRequestDomainCount: thirdPartyRequestDomains.length > 0 ? thirdPartyRequestDomains.length : null,
    sensitiveContextTrackingDetected:
      trackingContext.isSensitiveContext &&
      highRiskTrackingVendorNames.length > 0 &&
      (trackingBeforeConsentDetected === true ||
        preconsentTrackingDetected === true ||
        thirdPartyCookieSetBeforeConsent === true),
    highRiskIdentityVendorDetected:
      highRiskVendorCategories.has("identity_resolution") ||
      highRiskVendorCategories.has("cross_device_identity"),
    highRiskDataBrokerDetected: highRiskVendorCategories.has("data_broker") || highRiskVendorCategories.has("identity_data_broker"),
    identityDataBrokerDetected: highRiskVendorCategories.has("identity_data_broker"),
    dmpVendorDetected: highRiskVendorCategories.has("dmp"),
    healthAdtechVendorDetected: highRiskVendorCategories.has("health_adtech"),
    deviceSignalVendorDetected:
      highRiskVendorCategories.has("device_signal") ||
      highRiskVendorCategories.has("device_signal_adtech") ||
      highRiskVendorCategories.has("enterprise_device_risk"),
    fingerprintingAdjacentVendorDetected:
      highRiskVendorCategories.has("identity_resolution") ||
      highRiskVendorCategories.has("cross_device_identity") ||
      highRiskVendorCategories.has("device_signal_adtech") ||
      highRiskVendorCategories.has("enterprise_device_risk"),
    enterpriseDeviceRiskVendorDetected: highRiskVendorCategories.has("enterprise_device_risk"),
    highRiskTrackingVendorNames,
    performanceClaimPresent: booleanFromKeys(input.snapshot, ["performance_claim_present", "performanceClaimPresent"]),
    guaranteedReturnLanguagePresent: booleanFromKeys(input.snapshot, ["guaranteed_return_language_present", "guaranteedReturnLanguagePresent"]),
    highRiskProductSignalCount: numberFromKeys(input.snapshot, ["high_risk_product_signal_count", "highRiskProductSignalCount"])
  };
}
