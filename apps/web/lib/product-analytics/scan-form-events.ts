import type { ProductAnalyticsPayload } from "./contract";

export const SCAN_FORM_ID = "website_scan";
export type ScanFormFailureReason = "website_required" | "search_results_confirmation_required" | "server_rejected";

// Deliberately accepts only bounded reasons, never a URL, form value or error text.
export function scanFormFailureEvent(reason: ScanFormFailureReason): Omit<ProductAnalyticsPayload, "route"> {
  return {
    eventName: "form_failed",
    category: "form",
    feature: `scan_validation:${reason}`,
    formId: SCAN_FORM_ID,
    outcome: "failure"
  };
}
