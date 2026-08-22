import type {
  GdprEprivacyCoverageChecklistItem
} from "./gdpr-eprivacy-coverage-checklist";
import {
  deriveGdprTransparencyReportEvidenceLabel,
  isGdprTransparencyReportRowId,
} from "./gdpr-transparency-report-contract";

export type EvidenceLabel = "Observed" | "Not observed" | "Potential gap" | "Partial concern" | "Not confirmed" | "No match found" | "Not testable";
export type AssessmentDirection =
  | "positive_signal"
  | "neutral_signal"
  | "review_signal"
  | "potential_concern"
  | "technical_limitation";
export type GdprEprivacyAssessmentSummaryCounts =
  Record<AssessmentDirection | "gap_observed", number>;

const RISK_SIGNAL_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking",
  "advertising_retargeting_vendor_signal_observed",
  "retargeting_behavioral_advertising_signal_observed",
  "analytics_vendor_observed",
  "session_replay_fingerprinting_review",
  "device_identification_fingerprinting_signal_observed",
  "third_party_iframe_pre_consent",
  "social_media_embed_pre_consent",
  "embedded_content_pre_consent"
]);

const POSITIVE_WHEN_OBSERVED_ROW_IDS = new Set([
  "consent_surface_observed",
  "accept_consent_control",
  "options_settings_preferences_control",
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
  "supervisory_authority_complaint_disclosure"
]);

const NEUTRAL_WHEN_OBSERVED_ROW_IDS = new Set([
  "cmp_framework_signal_observed"
]);

const POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS = new Set([
  "pre_consent_cookies_storage",
  "pre_consent_third_party_tracking",
  "third_party_iframe_pre_consent",
  "social_media_embed_pre_consent",
  "embedded_content_pre_consent"
]);

export function summarizeGdprEprivacyAssessmentDirections(
  items: GdprEprivacyCoverageChecklistItem[]
): GdprEprivacyAssessmentSummaryCounts {
  return items.reduce<GdprEprivacyAssessmentSummaryCounts>((counts, item) => {
    const direction = getAssessmentDirection(item);
    if (direction === "technical_limitation") {
      counts.technical_limitation += 1;
    } else if (direction === "positive_signal") {
      counts.positive_signal += 1;
    } else if (direction === "neutral_signal") {
      counts.neutral_signal += 1;
    } else if (item.assessmentStatus === "gap_observed" || item.status === "Gap observed") {
      counts.gap_observed += 1;
    } else if (direction === "potential_concern") {
      counts.potential_concern += 1;
    } else {
      counts.review_signal += 1;
    }
    return counts;
  }, {
    gap_observed: 0,
    neutral_signal: 0,
    positive_signal: 0,
    potential_concern: 0,
    review_signal: 0,
    technical_limitation: 0
  });
}

export function getEvidenceLabel(item: GdprEprivacyCoverageChecklistItem): EvidenceLabel {
  if (isGdprTransparencyReportRowId(item.id)) {
    return deriveGdprTransparencyReportEvidenceLabel({
      assessmentResult: getPolicyEvidenceAssessmentResult(item),
      status: item.status,
    });
  }
  if (item.status === "Insufficient evidence") {
    return "Not confirmed";
  }
  if (
    item.status === "Not confirmed" &&
    getPolicyEvidenceAssessmentResult(item) === "not_located_automatically"
  ) {
    return "No match found";
  }
  if (
    (item.status === "Not confirmed" || item.status === "Not testable") &&
    retainedPolicySurfaceExtractionLimited(item)
  ) {
    return "Not confirmed";
  }
  if (
    item.assessmentStatus === "coverage_limitation" ||
    item.status === "Not testable" ||
    item.evidenceState === "not_testable"
  ) {
    return "Not testable";
  }
  if (item.status === "Not confirmed" && isRowSpecificExtractionNotConfirmed(item)) {
    return "Not confirmed";
  }
  if (item.status === "Gap observed") {
    return "Potential gap";
  }
  if (item.status === "Not confirmed" || item.status === "Review signal") {
    return "Partial concern";
  }
  if (item.evidenceState === "observed" || item.status === "Observed") {
    return "Observed";
  }
  return "Not observed";
}

function getPolicyEvidenceAssessmentResult(item: GdprEprivacyCoverageChecklistItem) {
  const assessment =
    retainedRecord(item, "policyEvidenceAssessment") ??
    retainedRecord(item, "policy_evidence_assessment");
  const result = assessment?.result ?? assessment?.assessmentResult ?? assessment?.assessment_result;
  return typeof result === "string" ? result : null;
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

function retainedPolicySurfaceExtractionLimited(item: GdprEprivacyCoverageChecklistItem) {
  if (!retainedPolicyExtractionLimited(item)) {
    return false;
  }

  const policySurfaceSummary = retainedRecord(item, "policySurfaceSummary") ?? retainedRecord(item, "policy_surface_summary");
  const retainedEvidence = item.criticalEvidence.retainedEvidence;
  const extractionHealth = retainedRecord(item, "policyTextExtractionHealth") ??
    retainedRecord(item, "policy_text_extraction_health") ??
    (policySurfaceSummary?.policyTextExtractionHealth && typeof policySurfaceSummary.policyTextExtractionHealth === "object" ? policySurfaceSummary.policyTextExtractionHealth as Record<string, unknown> : null) ??
    (policySurfaceSummary?.policy_text_extraction_health && typeof policySurfaceSummary.policy_text_extraction_health === "object" ? policySurfaceSummary.policy_text_extraction_health as Record<string, unknown> : null);
  const policyUrlRetained = policySurfaceSummary?.policyUrlRetained ?? policySurfaceSummary?.policy_url_retained ?? extractionHealth?.policyUrlRetained ?? extractionHealth?.policy_url_retained ?? retainedEvidence.policyUrlRetained ?? retainedEvidence.policy_url_retained;
  const policySurfaceObserved = policySurfaceSummary?.privacyPolicyPresent ??
    policySurfaceSummary?.privacy_policy_present ??
    policySurfaceSummary?.policySurfaceObserved ??
    policySurfaceSummary?.policy_surface_observed ??
    retainedEvidence.privacyPolicyPresent ??
    retainedEvidence.privacy_policy_present ??
    retainedEvidence.policySurfaceObserved ??
    retainedEvidence.policy_surface_observed ??
    extractionHealth?.policySurfaceObserved ??
    extractionHealth?.policy_surface_observed;
  const policyUrls = policySurfaceSummary?.privacyPolicyUrls ?? policySurfaceSummary?.privacy_policy_urls ?? retainedEvidence.privacyPolicyUrls ?? retainedEvidence.privacy_policy_urls;

  return policyUrlRetained === true || policySurfaceObserved === true || (Array.isArray(policyUrls) && policyUrls.length > 0);
}

function isRowSpecificExtractionNotConfirmed(item: GdprEprivacyCoverageChecklistItem) {
  if (
    item.assessmentStatus === "review_signal" &&
    item.status === "Not confirmed" &&
    !RISK_SIGNAL_ROW_IDS.has(item.id)
  ) {
    return true;
  }
  const signalObserved = item.criticalEvidence.retainedEvidence.signalObserved;
  if (
    signalObserved === "not_confirmed_row_specific_extraction" ||
    signalObserved === "not_confirmed_policy_disclosure_extraction"
  ) {
    return true;
  }
  const concernPolicyKey = item.criticalEvidence.pipeline?.concernPolicyKey;
  return typeof concernPolicyKey === "string" && concernPolicyKey.endsWith(".not_confirmed");
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

function retainedString(item: GdprEprivacyCoverageChecklistItem, keys: string[]) {
  for (const key of keys) {
    const value = item.criticalEvidence.retainedEvidence[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getCookieStoragePriorityDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection | null {
  const priority = retainedString(item, ["cookieStoragePriority", "cookie_storage_priority"]);
  return getInventoryPriorityDirection(priority);
}

function getTrackerPriorityDirection(item: GdprEprivacyCoverageChecklistItem): AssessmentDirection | null {
  const priority = retainedString(item, ["trackerPriority", "tracker_priority"]);
  return getInventoryPriorityDirection(priority);
}

function getInventoryPriorityDirection(priority: string | null): AssessmentDirection | null {
  switch (priority) {
    case "high":
      return "potential_concern";
    case "medium":
      return "potential_concern";
    case "review_needed":
      return "review_signal";
    case "contextual":
      return "neutral_signal";
    default:
      return null;
  }
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
      {
        const cookiePriorityDirection = getCookieStoragePriorityDirection(item);
        if (cookiePriorityDirection) {
          return cookiePriorityDirection;
        }
      }
      if (hasHighConfidenceStorageConcern(item)) {
        return "potential_concern";
      }
      if (hasStrictlyNecessaryStorageOnly(item)) {
        return "neutral_signal";
      }
      return "review_signal";
    case "pre_consent_third_party_tracking":
      {
        const trackerPriorityDirection = getTrackerPriorityDirection(item);
        if (trackerPriorityDirection) {
          return trackerPriorityDirection;
        }
      }
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
    case "third_party_iframe_pre_consent":
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
  if (isGdprTransparencyReportRowId(item.id)) {
    if (evidenceLabel === "Observed") {
      return "positive_signal";
    }
    if (evidenceLabel === "No match found") {
      return "technical_limitation";
    }
    return "technical_limitation";
  }
  if (evidenceLabel === "Not testable" || evidenceLabel === "No match found") {
    return "technical_limitation";
  }
  if (evidenceLabel === "Not confirmed" && retainedPolicySurfaceExtractionLimited(item)) {
    return "technical_limitation";
  }
  if (evidenceLabel === "Potential gap" || item.assessmentStatus === "gap_observed") {
    return "potential_concern";
  }
  if (evidenceLabel === "Observed") {
    return getObservedAssessmentDirection(item);
  }
  if (evidenceLabel === "Partial concern" || evidenceLabel === "Not confirmed" || item.assessmentStatus === "review_signal") {
    if (item.status === "Review signal" && RISK_SIGNAL_ROW_IDS.has(item.id)) {
      return getObservedAssessmentDirection(item);
    }
    return "review_signal";
  }

  if (POSITIVE_WHEN_NOT_OBSERVED_ROW_IDS.has(item.id)) {
    return "positive_signal";
  }
  if (
    (
      item.id === "reject_all_path_availability" ||
      item.id === "accept_consent_control" ||
      item.id === "options_settings_preferences_control"
    ) &&
    hasConsentSurfaceExpectation(item)
  ) {
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
