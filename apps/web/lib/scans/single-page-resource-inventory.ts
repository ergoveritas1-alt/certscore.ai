import { createHash } from "node:crypto";
import type { CrawlOccurrence } from "@website-signal-risk-scanner/shared";
import type { FullSiteReportResponse } from "../../server/scans/full-site-report";
import { classifyInventoryEvidence, getInventoryObservationNames, type InventoryGroupRow } from "./runtime-inventory-projection";
import { classifyCrawlInventoryResource } from "./full-site-inventory-classification";
import { describeCrawlService, identifyCrawlService, type ReviewedPolicy } from "./full-site-resource-context";
import { serviceIntegrationGroup } from "./service-integration-group";
import { inventoryPurposeGroups } from "./inventory-purpose-presentation";

type Resource = FullSiteReportResponse["services"][number]["resources"][number];
export type SinglePageResourceInventory = { requestMetric?: { label: string; value: number; counts: { nonEssential: number; review: number; contextual: number; essential: number } }; resources: Resource[]; services: FullSiteReportResponse["services"]; mix: FullSiteReportResponse["inventoryMix"] };
/** Adapt the canonical retained inventory to the same resource/service presentation as site scans. */
export function buildSinglePageResourceInventory(pageId: string, rows: InventoryGroupRow[], requests: CrawlOccurrence[] | null, reviewedPolicies: ReviewedPolicy[] = []): SinglePageResourceInventory {
  const resources = new Map<string, Resource>();
  const add = (occurrence: CrawlOccurrence, evidence: string) => {
    const key = `${occurrence.kind}:${occurrence.identity}`;
    const existing = resources.get(key);
    if (existing) {
      existing.eventCount += occurrence.eventCount; existing.occurrence.eventCount = existing.eventCount;
      if (occurrence.firstSeenMs !== null) existing.occurrence.firstSeenMs = Math.min(existing.occurrence.firstSeenMs ?? occurrence.firstSeenMs, occurrence.firstSeenMs);
      existing.destinationMissingCount += occurrence.networkDestinationMissingCount ?? 0;
      existing.destinationAssessedCount += occurrence.kind === "request" ? occurrence.eventCount : 0;
      const destinations = [...new Map([...existing.destinations, ...(occurrence.networkDestinations ?? [])].map(destination => [JSON.stringify(destination), destination])).values()];
      existing.destinationsTruncated ||= destinations.length > 20;
      existing.destinations = destinations.slice(0, 20);
      return;
    }
    resources.set(key, { key, name: occurrence.label, kind: occurrence.kind, occurrence: { ...occurrence },
      context: describeCrawlService(identifyCrawlService(occurrence), reviewedPolicies), pageIds: [pageId], purposes: [occurrence.purpose],
      relationships: [occurrence.relationship], eventCount: occurrence.eventCount, inventoryEvidence: evidence,
      destinations: occurrence.networkDestinations ?? [], destinationAssessedCount: occurrence.kind === "request" ? occurrence.eventCount : 0, destinationMissingCount: occurrence.networkDestinationMissingCount ?? 0, destinationsTruncated: false });
  };
  for (const row of rows.filter(row => row.type !== "tracker")) {
    const label = row.storageDetails ? row.storageDetails.key || "(empty storage key)" : row.type === "cookie" ? row.cookieNames.join(", ") : getInventoryObservationNames(row).join(", ");
    const kind = row.type === "embed" ? "embed" : row.type === "storage" ? "storage" : "cookie";
    const identity = createHash("sha256").update(JSON.stringify(row.storageDetails?.origin ? [row.storageDetails.origin, row.storageDetails.storageType, row.storageDetails.key] : [kind, row.domains, row.cookieDetails, row.embedDetails, row.storageDetails ? [pageId, row.storageDetails.storageType, row.storageDetails.key] : null, label])).digest("hex");
    add({ id: identity, identity, kind, label, vendor: row.vendor, domain: row.domains[0] ?? null, serviceId: null,
      purpose: row.purpose, resourceType: row.storageDetails?.storageType ?? kind, relationship: row.party, confidence: row.confidence,
      assessment: "Not assessed", eventCount: row.observedRecordCount, firstSeenMs: row.firstSeenMs,
      evidenceRefs: row.storageDetails?.evidenceRefs ?? row.cookieDetails.flatMap(detail => detail.evidenceRefs ?? []), details: row.storageDetails ? { origin: row.storageDetails.origin, type: row.storageDetails.storageType, key: row.storageDetails.key, identityBasis: row.storageDetails.identityBasis, sourceHash: row.storageDetails.sourceHash, valuesRedacted: true } : {} }, classifyInventoryEvidence(row));
  }
  for (const request of requests ?? []) add(request, classifyCrawlInventoryResource(request));
  const all = [...resources.values()];
  const services = new Map<string, FullSiteReportResponse["services"][number]>();
  for (const resource of all) {
    const { key, name } = serviceIntegrationGroup(resource.context.identity);
    const group = services.get(key) ?? { key, name, context: resource.context, pageIds: [pageId], purposes: [], resources: [], origins: [] };
    group.resources.push(resource); group.purposes = [...new Set([...group.purposes, ...resource.purposes])]; services.set(key, group);
  }
  const breakdown = (field: (resource: Resource) => string) => {
    const counts = new Map<string, number>();
    for (const resource of all) { const label = field(resource); counts.set(label, (counts.get(label) ?? 0) + 1); }
    return [...counts].map(([label, count]) => ({label, count}));
  };
  const counts = { nonEssential: 0, review: 0, contextual: 0, essential: 0 };
  for (const request of requests ?? []) {
    const key = { "Non-essential": "nonEssential", Review: "review", Contextual: "contextual", Essential: "essential" }[classifyCrawlInventoryResource(request)] as keyof typeof counts;
    counts[key] += request.eventCount;
  }
  return { requestMetric: requests ? { label: "Network requests", value: requests.reduce((sum, row) => sum + row.eventCount, 0), counts } : undefined, resources: all, services: [...services.values()], mix: {
    type: breakdown(row => row.kind), evidence: breakdown(row => row.inventoryEvidence),
    purpose: breakdown(row => inventoryPurposeGroups(row.purposes, row.relationships).join(", ") || "unknown"),
    relationship: breakdown(row => row.occurrence.relationship),
  }};
}
