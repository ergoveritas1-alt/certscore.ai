import { createHash } from "node:crypto";
import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { crawlDisplayUrl, type CrawlOccurrence } from "@website-signal-risk-scanner/shared";
import { getDomain } from "tldts";
import { buildSinglePageResourceInventory } from "./single-page-resource-inventory";
import type { ActionResourceInventory } from "./action-resource-inventory";

/** Read-only inventory from the verified GPC graph, independent of response findings.
 * Responses/scripts describe requests and are not counted as additional resources. */
export function projectGpcResourceInventory(input: {scanId: string; projection: unknown; pageUrl: string}): ActionResourceInventory | null {
  const parsed = apiRuntimeEvidenceGraphProjectionSchema.safeParse(input.projection);
  if (!parsed.success || parsed.data.scanId !== input.scanId || !parsed.data.sourceBundle?.verified || parsed.data.status === "unavailable") return null;
  const candidates = parsed.data.graphs.filter(graph => graph.scenario === "gpc");
  if (candidates.length !== 1) return null;
  const graph = candidates[0]!;
  if (graph.captureId !== `${input.scanId}:gpc_observation` || graph.coverage.status === "unavailable") return null;
  const hostname = (url?: string) => {try {return url ? new URL(url).hostname : null;} catch {return null;}};
  const siteHost = hostname(input.pageUrl);
  const site = siteHost ? getDomain(siteHost, {allowPrivateDomains:true}) ?? siteHost : null;
  const requests: CrawlOccurrence[] = [];
  const retained: Array<{occurrence: CrawlOccurrence; evidence: string}> = [];
  const childFrames = new Set(graph.edges.filter(edge => edge.relation === "frame_parent").map(edge => edge.to));
  for (const node of graph.nodes) {
    if (!["request", "cookie", "storage"].includes(node.kind) && !(node.kind === "frame" && childFrames.has(node.id))) continue;
    const kind = node.kind === "frame" ? "embed" : node.kind as "request" | "cookie" | "storage";
    const domain = node.cookie?.domain.replace(/^\./, "") ?? hostname(node.url);
    const resourceSite = domain ? getDomain(domain, {allowPrivateDomains:true}) ?? domain : null;
    // Redacted identities cannot be merged by their display label. A cookie's
    // domain/path/partition and a storage key's origin remain separate identities.
    const identity = node.kind === "request" ? [node.kind, node.method, node.url ?? node.id]
      : node.kind === "cookie" ? [node.kind, node.cookie?.identityRedacted || node.cookie?.partitionOpaque ? node.id : node.cookie ?? node.id]
      : node.kind === "storage" ? [node.kind, node.scopeMatchKey ?? node.id]
      : [node.kind, node.id];
    const occurrence: CrawlOccurrence = {
      id: node.id, identity: createHash("sha256").update(JSON.stringify(identity)).digest("hex"), kind,
      label: node.kind === "request" || node.kind === "frame" ? node.url ? crawlDisplayUrl(node.url) : kind === "embed" ? "Frame URL not retained" : "Request URL not retained" : node.label,
      domain, vendor: node.classification?.vendor ?? null, serviceId: null,
      purpose: node.classification?.purpose ?? "unknown", resourceType: node.storageType ?? node.resourceType?.toLowerCase() ?? kind,
      relationship: site && resourceSite ? site === resourceSite ? "first_party" : "third_party" : "unknown",
      confidence: node.classification ? String(node.classification.confidence) : "unknown", assessment: "Not assessed", eventCount: 1,
      firstSeenMs: node.operation === "snapshot" ? null : node.observedAtMs,
      evidenceRefs: [`gpc:${graph.sourceHash}:${node.id}`],
      details: {phase:"gpc", operation:node.operation ?? null, outcome:node.outcome ?? null, valuesRedacted:true,
        method:node.method ?? null, identityBasis:node.kind === "request" ? "method_and_redacted_url" : "retained_scoped_identity"},
      ...(kind === "request" ? {networkDestinationMissingCount:1} : {}),
    };
    if (kind === "request") requests.push(occurrence);
    else retained.push({occurrence, evidence: "Unclassified"});
  }
  const inventory = buildSinglePageResourceInventory(input.scanId, [], requests, [], retained);
  const incomplete = graph.coverage.status !== "complete" || graph.coverage.droppedNodes > 0 || graph.coverage.droppedEdges > 0;
  return {inventory, scope:"retained_capture", clockLabel:"Times from GPC visit start",
    captureCoverage:{status:incomplete ? "limited" : "complete",omittedNodes:graph.coverage.droppedNodes,omittedEdges:graph.coverage.droppedEdges},
    note:`All retained GPC requests, cookie/storage observations and explicitly linked child frames. Counts cover this bounded visit${incomplete ? "; capture was partial" : ""}. ${graph.coverage.droppedNodes ? `${graph.coverage.droppedNodes} graph records were omitted by capture limits. ` : ""}Repeated requests are grouped by method and redacted URL. Cookie/storage observations do not establish persistence or a new write; snapshot times are not first-write times.`};
}
