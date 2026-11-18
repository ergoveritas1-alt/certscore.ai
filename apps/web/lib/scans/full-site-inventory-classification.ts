import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import type { CrawlOccurrence } from "@website-signal-risk-scanner/shared/full-site-crawl";
import {
  classifyInventoryEvidence,
  deriveInventoryMacroCategory,
  getTrackerConsentReviewPriority,
} from "./runtime-inventory-projection";

// Image tracking pixels also use GET and can return 200. Require a registry
// match to a content-delivery endpoint and preserve contrary request evidence.
function isOrdinaryImageDelivery(row: CrawlOccurrence) {
  const status = row.details.httpStatus;
  if (row.kind !== "request" || row.resourceType.toLowerCase() !== "image" ||
      row.details.method !== "GET" || typeof status !== "number" ||
      ![200, 206, 304].includes(status) || row.details.hasCookieOrTrackingEvidence || row.details.hasOtherImageParameters ||
      !["infrastructure", "cdn", "cdn_static", "unknown"].includes(row.purpose)) return false;
  const match = resolveCanonicalVendor({ type: "request", url: row.label, hostname: row.domain ?? undefined }).observation;
  return match?.registryAttribution?.matchKind === "endpoint" && match.purpose === "infrastructure" &&
    match.regulatoryRelevance.some(role => ["cdn", "content_delivery", "media_delivery", "static_assets"].includes(role));
}

/** Inventory classification only: never a concern, finding, or score input. */
export function classifyCrawlInventoryResource(row: CrawlOccurrence) {
  if (row.kind === "request" && row.details.choiceRequestRole === "tag_library") return "Contextual";
  if (row.kind === "request" && row.details.choiceRequestRole === "sanity_batch_beacon") {
    return row.details.measurementResponseVerified === true ? "Review" : "Unclassified";
  }
  if (row.kind === "request" && ["analytics", "advertising"].includes(String(row.details.choiceRequestRole))) {
    return row.details.measurementResponseVerified === true ? "Non-essential" : "Unclassified";
  }
  if (isOrdinaryImageDelivery(row)) return "Contextual";
  if (row.kind === "request" && row.resourceType.toLowerCase() === "image" && row.details.hasCookieOrTrackingEvidence &&
      ["unknown", "infrastructure", "cdn", "cdn_static"].includes(row.purpose)) return "Review";
  if (row.kind === "request" && row.relationship === "first_party" && ["stylesheet", "font", "image"].includes(row.resourceType) && /^(unknown|unknown purpose)$/i.test(row.purpose)) return "Contextual";
  if (row.kind === "storage") return "Contextual";
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
  const classification = classifyInventoryEvidence({
    type: row.kind === "embed" ? "embed" : row.kind === "request" ? "tracker" : "cookie",
    macroCategory: deriveInventoryMacroCategory({ purpose: row.purpose, vendor: row.vendor, priority }),
    priority,
    purpose: row.purpose,
    purposes: [row.purpose],
    requestCount: row.kind === "request" ? row.eventCount : 0,
  });
  // This is the retained canonical purpose, not a service display category.
  // Unknown purpose is a coverage limitation, never an actionable concern.
  return row.kind === "request" && classification === "Review" &&
    /^(unknown|unknown purpose|unclassified)?$/i.test(row.purpose.trim())
    ? "Unclassified" : classification;
}
