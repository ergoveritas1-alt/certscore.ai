import type { CrawlOccurrence } from "@website-signal-risk-scanner/shared/full-site-crawl";
import {
  classifyInventoryEvidence,
  deriveInventoryMacroCategory,
  getTrackerConsentReviewPriority,
} from "./runtime-inventory-projection";

/** Inventory classification only: never a concern, finding, or score input. */
export function classifyCrawlInventoryResource(row: CrawlOccurrence) {
  // Compact cookie/storage observations do not retain necessity or write proof.
  // Do not infer that proof from a vendor name or a purpose label.
  const priority = row.kind === "request"
    ? getTrackerConsentReviewPriority({
        category: row.purpose,
        confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null,
        domains: row.domain ? [row.domain] : [],
        firstSeenMs: row.firstSeenMs,
        label: row.vendor ?? row.label,
        observedVia: ["network"],
        party: row.relationship === "first_party" || row.relationship === "third_party" ? row.relationship : "unknown",
        preConsent: true, // This contract contains fresh visits with no consent action.
        requestCount: row.eventCount,
        source: "full-site retained inventory",
      })
    : "review_needed";
  return classifyInventoryEvidence({
    type: row.kind === "embed" ? "embed" : row.kind === "request" ? "tracker" : "cookie",
    macroCategory: deriveInventoryMacroCategory({ purpose: row.purpose, vendor: row.vendor, priority }),
    priority,
    purpose: row.purpose,
    purposes: [row.purpose],
    requestCount: row.kind === "request" ? row.eventCount : 0,
  });
}
