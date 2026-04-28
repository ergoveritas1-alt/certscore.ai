import type { AccessibilityBenchmarkLabel } from "../types/accessibility";

/**
 * Benchmark calibration v1
 *
 * Reference: WebAIM Million 2026 reported 95.9% of home pages had
 * detected WCAG 2 failures, based only on automatically detectable failures.
 * Source: https://webaim.org/projects/million/
 *
 * This is used only to contextualize results, not to excuse failures.
 */

export const WEBAIM_MILLION_2026_HOME_PAGE_FAILURE_RATE = 0.959;

export const COMMON_HIGH_FREQUENCY_ISSUE_FAMILIES = [
  "contrast",
  "alt_text",
  "form_labels",
  "empty_links",
  "empty_buttons",
  "document_language"
] as const;

/**
 * Simple benchmark labels based on total affected node count.
 * These are intentionally coarse; vertical-specific baselines are TODO.
 */
export function deriveBenchmarkLabel(totalAffectedNodeCount: number, hasCritical: boolean): AccessibilityBenchmarkLabel {
  if (totalAffectedNodeCount === 0) {
    return "better_than_typical";
  }
  if (hasCritical) {
    return "severe_outlier";
  }
  if (totalAffectedNodeCount <= 10) {
    return "typical_or_better";
  }
  if (totalAffectedNodeCount <= 50) {
    return "typical";
  }
  if (totalAffectedNodeCount <= 100) {
    return "worse_than_typical";
  }
  return "severe_outlier";
}

export function formatBenchmarkExpectedRange(label: AccessibilityBenchmarkLabel): string {
  switch (label) {
    case "better_than_typical":
      return "0 automated violations (better than ~95.9% of home pages with detectable failures)";
    case "typical_or_better":
      return "1–10 affected nodes (similar to or better than typical)";
    case "typical":
      return "11–50 affected nodes (typical range)";
    case "worse_than_typical":
      return "51–100 affected nodes (worse than typical)";
    case "severe_outlier":
      return ">100 affected nodes or critical violations (severe outlier)";
    default:
      return "Unknown";
  }
}

// TODO: Add vertical-specific baselines:
// - ecommerce: higher expectations for checkout/form accessibility
// - media: video caption and audio description expectations
// - fintech: strict form label and error identification expectations
// - healthcare: Section 508 / ADA alignment expectations
// - SaaS: keyboard navigation and ARIA expectations
// - government: Section 508 conformance expectations
