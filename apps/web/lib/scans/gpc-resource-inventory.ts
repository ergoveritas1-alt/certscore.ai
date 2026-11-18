import { choiceEndpointPaths, choiceRequestRole, gpcMeasurementInventorySchema } from "@certscore/contracts";
import { classifyChoiceCookie } from "./choice-cookie-classification";
import { cookieInventoryClassification } from "./runtime-inventory-projection";
import { createHash } from "node:crypto";
import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { crawlDisplayUrl, type CrawlOccurrence } from "@website-signal-risk-scanner/shared";
import { getDomain } from "tldts";
import { buildSinglePageResourceInventory } from "./single-page-resource-inventory";
import type { ActionResourceInventory } from "./action-resource-inventory";

/** Read-only inventory from the verified GPC graph, independent of response findings.
 * Responses/scripts describe requests and are not counted as additional resources. */
export function projectGpcResourceInventory(input: {scanId: string; projection: unknown; measurementInventory?: unknown; pageUrl: string}): ActionResourceInventory | null {
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
  const observedCookies = new Map<string, ReturnType<typeof classifyChoiceCookie>>();
  const childFrames = new Set(graph.edges.filter(edge => edge.relation === "frame_parent").map(edge => edge.to));
  const responses = new Map(graph.nodes.filter(node => node.kind === "response").map(node => [node.id, node]));
  const responseByRequest = new Map(graph.edges.filter(edge => edge.relation === "response_to").map(edge => [edge.from, responses.get(edge.to)]));
  const sentCookies = new Set(graph.edges.filter(edge => edge.relation === "cookie_included").map(edge => edge.to));
  const cookieAttempts = new Set(graph.edges.filter(edge => edge.relation === "response_cookie_attempt").map(edge => edge.from));
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
    const response = responseByRequest.get(node.id);
    const role = kind === "request" && node.url ? choiceRequestRole(node.url, node.method, node.resourceType) : undefined;
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
        ...(kind === "request" && node.resourceType?.toLowerCase() === "image" ? {
          httpStatus: response?.status ?? null,
          hasCookieOrTrackingEvidence: sentCookies.has(node.id) || (response !== undefined && cookieAttempts.has(response.id)),
        } : {}),
        ...(role ? {choiceRequestRole:role, measurementResponseVerified:response?.status !== undefined && response.status >= 200 && response.status < 300} : {}),
        method:node.method ?? null, identityBasis:node.kind === "request" ? "method_and_redacted_url" : "retained_scoped_identity"},
      ...(kind === "request" ? {networkDestinationMissingCount:1} : {}),
    };
    if (kind === "request") requests.push(occurrence);
    else {
      retained.push({occurrence, evidence: "Unclassified"});
      if (kind === "cookie" && node.cookie && !node.cookie.identityRedacted && !node.cookie.partitionOpaque &&
          (node.operation === "snapshot" || node.outcome === "stored" || node.outcome === "sent")) {
        observedCookies.set(occurrence.identity, classifyChoiceCookie(node.cookie.name, node.cookie.domain));
      }
    }
  }
  const proof = gpcMeasurementInventorySchema.safeParse(input.measurementInventory);
  if (proof.success && proof.data.scanId === input.scanId && proof.data.graphSha256 === graph.sourceHash) {
    for (const endpoint of proof.data.endpoints) {
      const path = choiceEndpointPaths[endpoint.role];
      const purpose = endpoint.role === "sanity_batch_beacon" ? "unknown" : endpoint.role;
      const url = `https://${endpoint.hostname}${path}`;
      const matched = requests.filter(row => row.label === url && row.details.method === endpoint.method);
      for (const row of matched) {
        row.details.choiceRequestRole = endpoint.role;
        row.details.measurementResponseVerified = true;
        row.purpose = purpose;
      }
      // The graph and request log overlap. Add only observations missing from the graph.
      const missing = endpoint.count - matched.reduce((sum, row) => sum + row.eventCount, 0);
      if (missing <= 0) continue;
      const identity = createHash("sha256").update(JSON.stringify(["request", endpoint.method, url])).digest("hex");
      const resourceSite = getDomain(endpoint.hostname, {allowPrivateDomains:true}) ?? endpoint.hostname;
      requests.push({id: identity, identity, kind: "request", label: url, domain: endpoint.hostname, vendor: null,
        serviceId: null, purpose, resourceType: "request", relationship: site === resourceSite ? "first_party" : "third_party",
        confidence: "direct", assessment: "Not assessed", eventCount: missing, firstSeenMs: endpoint.firstSeenMs,
        evidenceRefs: [`gpc:${proof.data.sourceSha256}:${endpoint.method}:${url}`],
        details: {phase:"gpc", choiceRequestRole:endpoint.role, measurementResponseVerified:true, method:endpoint.method, valuesRedacted:true}, networkDestinationMissingCount:missing});
    }
  }
  // A blocked or attempted write alone does not establish cookie presence. Group
  // observations by scoped identity so a later positive snapshot counts once.
  for (const row of retained) {
    const cookie = observedCookies.get(row.occurrence.identity);
    if (!cookie) continue;
    row.occurrence.purpose = cookie.category;
    row.evidence = cookieInventoryClassification(new Set([cookie.essentiality]));
  }
  const inventory = buildSinglePageResourceInventory(input.scanId, [], requests, [], retained, "choice");
  const incomplete = graph.coverage.status !== "complete" || graph.coverage.droppedNodes > 0 || graph.coverage.droppedEdges > 0;
  return {inventory, scope:"retained_capture", clockLabel:"Times from GPC visit start",
    captureCoverage:{status:incomplete ? "limited" : "complete",omittedNodes:graph.coverage.droppedNodes,omittedEdges:graph.coverage.droppedEdges},
    note:`All retained GPC requests, cookie/storage observations and explicitly linked child frames. Counts cover this bounded visit${incomplete ? "; capture was partial" : ""}. ${graph.coverage.droppedNodes ? `${graph.coverage.droppedNodes} graph records were omitted by capture limits. ` : ""}Repeated requests are grouped by method and redacted URL. Cookie/storage observations do not establish persistence or a new write; snapshot times are not first-write times.`};
}
