import { retainedNetworkSummarySchema } from "./runtime-inventory-projection";
import { networkDestinationSchema } from "@certscore/contracts";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { crawlDisplayUrl, type CrawlOccurrence } from "@website-signal-risk-scanner/shared";

const observation = z.object({
  requestUrl: z.string().url().refine(value => { if (!URL.canParse(value)) return false; const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; }), preConsent: z.literal(true),
  timestampMs: z.number().finite().nonnegative(),
  networkDestination: z.unknown().optional(),
  thirdParty: z.boolean().optional(), resourceType: z.string().optional(), method: z.string().optional(),
});


/** Project every retained baseline event, independently of bounded vendor samples.
 * This is inventory classification only, never finding or scoring evidence. */
export function buildRetainedRequestInventory(hybrid: Record<string, unknown> | null | undefined): CrawlOccurrence[] | null {
  const totals = retainedNetworkSummarySchema.safeParse(hybrid?.networkSummary);
  const events = z.array(observation).safeParse(hybrid?.requestObservations);
  if (!totals.success || !events.success || events.data.length !== totals.data.preConsentRequestCount) return null;
  const classified = z.array(z.object({ requestUrl: z.string(), tsMs: z.number(), method: z.string() })).safeParse(hybrid?.requestPurposeClassificationConfidence);
  return events.data.map((event, index) => {
    const exact = classified.success ? classified.data.filter(row => row.requestUrl === event.requestUrl && row.tsMs === event.timestampMs) : [];
    const method = event.method ?? (exact.length === 1 ? exact[0]!.method : null);
    const destination = networkDestinationSchema.safeParse(event.networkDestination);
    const resolved = resolveCanonicalVendor({ type: "request", url: event.requestUrl });
    const match = resolved.observation;
    const identity = createHash("sha256").update(JSON.stringify([method, event.requestUrl, method ? null : index])).digest("hex");
    return {
      id: `retained-request:${index}`, identity, kind: "request", label: crawlDisplayUrl(event.requestUrl),
      domain: new URL(event.requestUrl).hostname, vendor: match?.vendor ?? null,
      serviceId: match?.registryAttribution?.serviceId ?? null, purpose: match?.purpose ?? "unknown",
      resourceType: event.resourceType ?? "unknown", relationship: event.thirdParty === true ? "third_party" : event.thirdParty === false ? "first_party" : "unknown",
      confidence: match ? String(match.confidence) : "unknown", assessment: "Not assessed", eventCount: 1,
      networkDestinations: destination.success ? [destination.data] : [], networkDestinationMissingCount: destination.success ? 0 : 1,
      firstSeenMs: event.timestampMs, evidenceRefs: [`requestObservations[${index}]`],
      details: { method, ...(resolved.status === "resolved" && resolved.resourceRole ? { resourceRole: resolved.resourceRole } : {}) },
    };
  });
}
