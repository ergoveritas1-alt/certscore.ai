import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

const DEFERRED_NON_PRODUCTION_ROW_IDS = new Set([
  "advertising_retargeting_vendor_signal_observed",
  "analytics_vendor_observed",
  "post_reject_tracking_reduction",
  "preference_withdrawal_control",
  "retargeting_behavioral_advertising_signal_observed",
  "sensitive_surfaces_third_party_tracking",
  "cross_border_endpoint_review",
  "accessibility_consent_controls"
]);

export function getReportableGdprEprivacyCoverageItems(items: GdprEprivacyCoverageChecklistItem[]) {
  const nonDeferredItems = items.filter((item) => !DEFERRED_NON_PRODUCTION_ROW_IDS.has(item.id));
  return nonDeferredItems.length > 0 ? nonDeferredItems : items;
}
