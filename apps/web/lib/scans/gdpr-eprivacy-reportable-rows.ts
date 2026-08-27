import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

const DEFERRED_NON_PRODUCTION_ROW_IDS = new Set([
  "advertising_retargeting_vendor_signal_observed",
  "analytics_vendor_observed",
  "preference_withdrawal_control",
  "public_collection_surfaces",
  "retargeting_behavioral_advertising_signal_observed",
  "sensitive_surfaces_third_party_tracking",
  "cross_border_endpoint_review",
  "accessibility_consent_controls",
  // Consent-choice quality remains retained internal evidence, but the
  // umbrella checklist row is not a reportable finding. Specific observed
  // consent-control findings remain eligible independently.
  "consent_choice_quality"
]);

export function isReportableGdprEprivacyCoverageRowId(id: string) {
  return !DEFERRED_NON_PRODUCTION_ROW_IDS.has(id);
}

export function getReportableGdprEprivacyCoverageItems(items: GdprEprivacyCoverageChecklistItem[]) {
  return items.filter((item) => isReportableGdprEprivacyCoverageRowId(item.id));
}
