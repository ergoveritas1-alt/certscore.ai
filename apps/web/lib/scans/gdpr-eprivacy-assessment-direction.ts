import type {
  GdprEprivacyCoverageChecklistItem
} from "./gdpr-eprivacy-coverage-checklist";

export type EvidenceLabel = "Observed" | "Not observed" | "Potential gap" | "Partial concern" | "Not testable";
export type AssessmentDirection =
  | "positive_signal"
  | "neutral_signal"
  | "review_signal"
  | "potential_concern"
  | "technical_limitation";

const RISK_SIGNAL_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking",
  "advertising_retargeting_vendor_signal_observed",
  "retargeting_behavioral_advertising_signal_observed",
  "analytics_vendor_observed",
  "session_replay_fingerprinting_review",
  "device_identification_fingerprinting_signal_observed",
  "embedded_content_pre_consent"
]);

const POSITIVE_WHEN_OBSERVED_ROW_IDS = new Set([
  "consent_surface_observed",
  "reject_all_path_availability",
  "cookie_notice_policy_availability",
  "privacy_notice_availability",
  "controller_contact_disclosure",
  "processing_purposes_disclosure",
  "legal_basis_disclosure_observed",
  "recipients_vendor_categories_disclosure",
  "retention_disclosure_observed",
  "data_subject_rights_disclosure",
  "international_transfers_disclosure",
  "dpo_contact_point_disclosure",
  "supervisory_authority_complaint_disclosure",
  "automated_decision_making_profiling_disclosure"
]);

const NEUTRAL_WHEN_OBSERVED_ROW_IDS = new Set([
  "cmp_framework_signal_observed"
]);

const POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking"
]);

export function getEvidenceLabel(item: GdprEprivacyCoverageChecklistItem): EvidenceLabel {
  if (item.assessmentStatus === "coverage_limitation" || item.evidenceState === "not_testable" || item.status === "Not testable") {
    return "Not testable";
  }
  if (item.status === "Not confirmed" && retainedPolicyExtractionLimited(item)) {
    return "Not testable";
  }
  if (item.status === "Gap observed") {
    return "Potential gap";
  }
  if (item.status === "Insufficient evidence" || item.status === "Not confirmed" || item.status === "Review signal") {
    return "Partial concern";
  }
  if (item.evidenceState === "observed" || item.status === "Observed") {
    return "Observed";
  }
  return "Not observed";
}

function retainedPolicyExtractionLimited(item: GdprEprivacyCoverageChecklistItem) {
  const policySurfaceSummary = retainedRecord(item, "policySurfaceSummary") ?? retainedRecord(item, "policy_surface_summary");
  const health =
    retainedRecord(item, "policyTextExtractionHealth") ??
    retainedRecord(item, "policy_text_extraction_health") ??
    recordValueAsRecord(policySurfaceSummary, "policyTextExtractionHealth") ??
    recordValueAsRecord(policySurfaceSummary, "policy_text_extraction_health");
  const status = health?.policyTextExtractionStatus ?? health?.policy_text_extraction_status;
  return typeof status === "string" && status !== "ok";
}

function recordValueAsRecord(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function retainedBoolean(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  return keys.some((key) => item.criticalEvidence.retainedEvidence[key] === true);
}

function retainedNumber(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  for (const key of keys) {
    const value = item.criticalEvidence.retainedEvidence[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function retainedText(item: GdprEprivacyCoverageChecklistItem) {
  return JSON.stringify(
    item.criticalEvidence.retainedEvidence,
    (_key, value) => typeof value === "bigint" ? value.toString() : value
  ).toLowerCase();
}

function evidenceMentions(item: GdprEprivacyCoverageChecklistItem, pattern: RegExp) {
  return pattern.test([
    item.explanation,
    item.note,
    item.criticalEvidence.statusBasis,
    item.evidenceRefs.join(" "),
    retainedText(item)
  ].join(" ").toLowerCase());
}

function retainedRecord(item: GdprEprivacyCoverageChecklistItem, key: string) {
  const value = item.criticalEvidence.retainedEvidence[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function retainedPurposeMixHas(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  const mix = retainedRecord(item, "preconsentPurposeRiskMix") ?? retainedRecord(item, "preconsent_purpose_risk_mix");
  if (!mix) {
    return null;
  }
  return keys.some((key) => Array.isArray(mix[key]) && mix[key].length > 0);
}

function hasHighRiskPreconsentPurpose(item: GdprEprivacyCoverageChecklistItem) {
  return retainedPurposeMixHas(item, ["advertising", "retargeting", "marketingAnalytics", "sessionReplay"]);
}

function hasHighConfidenceStorageConcern(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "eligibleNonEssentialCookieStorageFindingProjected",
    "nonEssentialCookieStorageObserved",
    "non_essential_cookie_storage_observed",
    "thirdPartyCookieStorageObserved",
    "third_party_cookie_storage_observed",
    "advertisingCookieStorageObserved",
    "analyticsCookieStorageObserved",
    "sessionReplayCookieStorageObserved",
    "deviceIdentificationStorageObserved"
  ]);
}

function hasStrictlyNecessaryStorageOnly(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "strictlyNecessaryStorageOnly",
    "strictly_necessary_storage_only",
    "essentialStorageOnly",
    "essential_storage_only",
    "securityStorageOnly",
    "security_storage_only",
    "sessionStorageOnly",
    "session_storage_only"
  ]) || (
    evidenceMentions(item, /\b(strictly necessary|essential|security|fraud|bot|session only)\b/i) &&
    !hasHighConfidenceStorageConcern(item)
  );
}

function hasHighConfidenceAdvertisingConcern(item: GdprEprivacyCoverageChecklistItem) {
  const highRiskPurpose = retainedPurposeMixHas(item, ["advertising"]);
  if (highRiskPurpose !== null) {
    return highRiskPurpose;
  }
  const count = retainedNumber(item, [
    "advertisingVendorCount",
    "advertising_vendor_count",
    "advertisingRetargetingVendorCount",
    "advertising_retargeting_vendor_count",
    "adtechVendorCount",
    "adtech_vendor_count"
  ]);
  return (count !== null && count > 0) ||
    evidenceMentions(item, /\b(advertis(?:ing|er)|adtech|doubleclick|google ads|ad serving|ad measurement|ad verification|programmatic)\b/i);
}

function hasHighConfidenceRetargetingConcern(item: GdprEprivacyCoverageChecklistItem) {
  const retargetingPurpose = retainedPurposeMixHas(item, ["retargeting"]);
  if (retargetingPurpose !== null) {
    return retargetingPurpose;
  }
  const count = retainedNumber(item, [
    "retargetingBehavioralAdvertisingVendorCount",
    "retargeting_behavioral_advertising_vendor_count",
    "retargetingVendorCount",
    "retargeting_vendor_count"
  ]);
  return (count !== null && count > 0) ||
    evidenceMentions(item, /\b(retarget|remarket|behavioral advertis|cross-site|cross site|audience|identity sync|idsync|meta pixel|facebook pixel|linkedin insight|tiktok pixel)\b/i);
}

function hasHighConfidenceAnalyticsConcern(item: GdprEprivacyCoverageChecklistItem) {
  const marketingAnalyticsPurpose = retainedPurposeMixHas(item, ["marketingAnalytics"]);
  if (marketingAnalyticsPurpose !== null) {
    return marketingAnalyticsPurpose;
  }
  const count = retainedNumber(item, ["analyticsVendorCount", "analytics_vendor_count"]);
  if (evidenceMentions(item, /\b(limited use|strictly necessary|essential analytics|aggregate only)\b/i)) {
    return false;
  }
  return (count !== null && count > 0) ||
    evidenceMentions(item, /\b(analytics|measurement|google analytics|ga4|gtag|adobe analytics|matomo|mixpanel|amplitude)\b/i);
}

function getDeviceIdentificationDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  if (evidenceMentions(item, /\b(fraud|security|bot|abuse prevention|authentication)\b/i)) {
    return "neutral_signal";
  }
  if (evidenceMentions(item, /\b(fingerprint|device id|device identification|cross[- ]site|identity graph|advertis(?:ing|er)|retarget|probabilistic)\b/i)) {
    return "potential_concern";
  }
  return "review_signal";
}

function getEmbeddedContentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  const text = retainedText(item);
  if (/\b(videoAdSdk|video_ad_sdk|imasdk\.googleapis\.com|ima3\.js|gampad|doubleclick\.net|googletagservices\.com|freewheel|brightline\.tv)\b/i.test(text)) {
    return "potential_concern";
  }
  if (/\b(fonts\.googleapis\.com|fonts\.gstatic\.com)\b/i.test(text) && !/\b(youtube|vimeo|maps|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "review_signal";
  }
  if (/\b(youtube|vimeo|maps|openstreetmap|spotify|soundcloud|facebook|instagram|tiktok|linkedin|typeform|calendly|hubspot|chat|widget|iframe|embed)\b/i.test(text)) {
    return "potential_concern";
  }
  return "review_signal";
}

function hasPreConsentRuntimeExpectation(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "preConsentCookiesObserved",
    "pre_consent_cookies_observed",
    "preConsentStorageObserved",
    "pre_consent_storage_observed",
    "preConsentTrackingObserved",
    "pre_consent_tracking_observed",
    "preConsentThirdPartyTrackingObserved",
    "pre_consent_third_party_tracking_observed",
    "advertisingVendorObserved",
    "advertising_vendor_observed",
    "analyticsVendorObserved",
    "analytics_vendor_observed"
  ]);
}

function hasConsentSurfaceExpectation(item: GdprEprivacyCoverageChecklistItem) {
  return retainedBoolean(item, [
    "consentSurfaceObserved",
    "consent_surface_observed",
    "cmpSignalObserved",
    "cmp_signal_observed",
    "bannerObserved",
    "banner_observed"
  ]);
}

function getObservedAssessmentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  switch (item.id) {
    case "pre_consent_cookies_storage":
      if (hasHighConfidenceStorageConcern(item)) {
        return "potential_concern";
      }
      if (hasStrictlyNecessaryStorageOnly(item)) {
        return "neutral_signal";
      }
      return "review_signal";
    case "pre_consent_third_party_tracking":
      if (hasHighRiskPreconsentPurpose(item) === false) {
        return "review_signal";
      }
      return "potential_concern";
    case "advertising_retargeting_vendor_signal_observed":
      return hasHighConfidenceAdvertisingConcern(item) ? "potential_concern" : "review_signal";
    case "retargeting_behavioral_advertising_signal_observed":
      return hasHighConfidenceRetargetingConcern(item) ? "potential_concern" : "review_signal";
    case "analytics_vendor_observed":
      return hasHighConfidenceAnalyticsConcern(item) ? "potential_concern" : "review_signal";
    case "session_replay_fingerprinting_review":
      return "potential_concern";
    case "device_identification_fingerprinting_signal_observed":
      return getDeviceIdentificationDirection(item);
    case "embedded_content_pre_consent":
      return getEmbeddedContentDirection(item);
    default:
      if (NEUTRAL_WHEN_OBSERVED_ROW_IDS.has(item.id)) {
        return "neutral_signal";
      }
      if (POSITIVE_WHEN_OBSERVED_ROW_IDS.has(item.id)) {
        return "positive_signal";
      }
      return RISK_SIGNAL_ROW_IDS.has(item.id) ? "review_signal" : "neutral_signal";
  }
}

export function getAssessmentDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection {
  const evidenceLabel = getEvidenceLabel(item);
  if (evidenceLabel === "Not testable") {
    return "technical_limitation";
  }
  if (evidenceLabel === "Potential gap" || item.assessmentStatus === "gap_observed") {
    return "potential_concern";
  }
  if (evidenceLabel === "Observed") {
    return getObservedAssessmentDirection(item);
  }
  if (evidenceLabel === "Partial concern" || item.assessmentStatus === "review_signal") {
    if (item.status === "Review signal" && RISK_SIGNAL_ROW_IDS.has(item.id)) {
      return getObservedAssessmentDirection(item);
    }
    return "review_signal";
  }

  if (POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS.has(item.id)) {
    return "positive_signal";
  }
  if (item.id === "reject_all_path_availability" && hasConsentSurfaceExpectation(item)) {
    return "potential_concern";
  }
  if (
    (
      item.id === "consent_surface_observed" ||
      item.id === "cookie_notice_policy_availability"
    ) &&
    hasPreConsentRuntimeExpectation(item)
  ) {
    return "potential_concern";
  }
  if (item.id === "cmp_framework_signal_observed" && hasPreConsentRuntimeExpectation(item)) {
    return "review_signal";
  }
  return "neutral_signal";
}
