import { createHash } from "node:crypto";
import {
  projectPostRefusalEvidenceForReport, sanitizeRuntimeGraphUrl, verifyRuntimeEvidenceGraph,
  type PostRefusalReportProjection,
} from "@certscore/contracts";
import { assessCaliforniaPostReject } from "../../lib/scans/california-post-reject-policy";
import { assessRejectPotentialRisk } from "../../lib/scans/california-potential-risk-policy";
import { isIdentifierEventRequest, isTrackingIdentifierCookie } from "../../lib/scans/reject-tracking-identifier";
import { retainedRejectPresence } from "../../lib/scans/reject-presence-evidence";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Project one independently scorable transmission from the original action packet. */
export function projectScoredPostRefusalEvidence(input: Parameters<typeof projectPostRefusalEvidenceForReport>[0]): PostRefusalReportProjection {
  return withRejectIdentifierWitness(projectPostRefusalEvidenceForReport(input),input.packet);
}

export function withRejectIdentifierWitness(p: PostRefusalReportProjection,
  packet: Pick<Parameters<typeof projectPostRefusalEvidenceForReport>[0]["packet"], "runtimeEvidenceGraph"|"scanId"|"startedAt"|"targetUrl">): PostRefusalReportProjection {
  const presence = retainedRejectPresence(p);
  if (!p.packetSha256 || !presence || !p.sourceIdentity || !packet.runtimeEvidenceGraph ||
      p.interactionDiagnostics?.postClickNavigation || p.receiptAvailability?.documentStable === false) return p;
  const full = assessCaliforniaPostReject(p);
  if (full?.scope !== "cookie_tracking_rejection") return p;
  const graph = verifyRuntimeEvidenceGraph(packet.runtimeEvidenceGraph, {scanId:p.sourceIdentity.scanId, scenario:"post_reject", mode:"project", sha256}).graph;
  if (!graph || graph.captureId !== packet.scanId || graph.captureId !== p.sourceIdentity.scanId + ":reject_observation" ||
      sha256(packet.targetUrl) !== p.sourceIdentity.targetSha256 || graph.startedAt !== packet.startedAt ||
      graph.action?.status !== (presence.confirmed ? "confirmed" : "unconfirmed") ||
      presence.confirmed && graph.action?.registeredAtMs !== p.refusalRegisteredAtMs) return p;
  const nodes = new Map(graph.nodes.map(node => [node.id,node]));
  const sent = new Map<string, Array<{name:string; domain:string}>>();
  const responses = new Map<string, typeof graph.nodes>();
  const documents = graph.nodes.filter(n => n.kind === "request" && n.resourceType?.toLowerCase() === "document" &&
    n.sessionId === "main" && n.url === sanitizeRuntimeGraphUrl(packet.targetUrl) && n.observedAtMs <= presence.start);
  const ledger = p.scoringEvidence!.requests;
  const reviewed = new Set(assessRejectPotentialRisk(p)?.rows.map(r => r.evidenceId));
  for (const r of full.requests) if (r.reason === "qualified_collection") reviewed.add(r.requestId);
  for (const edge of graph.edges) {
    if (edge.basis !== "cdp" || edge.directness !== "direct") continue;
    if (edge.relation === "response_to") {
      const response = nodes.get(edge.to);
      if (response?.kind === "response") responses.set(edge.from,[...(responses.get(edge.from) ?? []), response]);
    } else if (edge.relation === "cookie_included") {
      const c = nodes.get(edge.from);
      if (c?.kind !== "cookie" || !c.cookie || c.outcome !== "sent" || !c.valueHash ||
          (c.cookieAttributes?.size ?? 0) <= c.cookie.name.length ||
          !c.cookie.domain || !isTrackingIdentifierCookie(c.cookie.name,c.cookie.domain)) continue;
      sent.set(edge.to,[...(sent.get(edge.to) ?? []),{name:c.cookie.name,domain:c.cookie.domain}]);
    }
  }
  for (const [nodeId,names] of sent) {
    const n = nodes.get(nodeId);
    if (n?.kind !== "request" || !n.url?.startsWith("https://") || n.url.length > 2048 ||
        !n.documentId || !n.frameId || !documents.some(d => d.frameId === n.frameId && d.documentId === n.documentId && d.sessionId === n.sessionId) ||
        n.redirectHop !== 0 || n.observedAtMs <= presence.start || n.observedAtMs >= presence.end) continue;
    const host = new URL(n.url).hostname;
    const cookie = names.find(c => {
      const domain = c.domain.replace(/^\./,"").toLowerCase();
      return host === domain || host.endsWith("."+domain);
    });
    if (!cookie) continue;
    const type = n.resourceType?.toLowerCase();
    const hits = responses.get(nodeId) ?? [];
    const response = hits[0];
    if (hits.length !== 1 || response?.url !== n.url || response?.status === undefined || response.status < 200 || response.status >= 300 ||
        response.fromCache !== false || response.fromServiceWorker !== false || response.observedAtMs < n.observedAtMs || response.observedAtMs > presence.end) continue;
    // Playwright and CDP timestamp the same request independently. Require one unambiguous
    // start/finish match and the same method, path, type, HTTP result and post-click ancestry.
    const matches = ledger.filter(r => r.method === n.method && sanitizeRuntimeGraphUrl(r.sanitizedUrl) === n.url &&
      r.resourceType.toLowerCase() === type && r.httpStatus === response.status && r.completedAtMs !== undefined &&
      Math.abs(r.startedAtMs - n.observedAtMs) <= 50 && Math.abs(r.completedAtMs - response.observedAtMs) <= 50);
    if (matches.length !== 1) continue;
    const r = matches[0]!;
    const ambiguous = graph.nodes.some(other => other.kind === "request" && other.id !== n.id &&
      other.url === n.url && other.method === n.method && other.resourceType?.toLowerCase() === type &&
      Math.abs(other.observedAtMs - r.startedAtMs) <= 50);
    if (ambiguous || reviewed.has(r.requestId) || ledger.filter(x=>x.requestId===r.requestId).length !== 1 ||
        r.startedAtMs <= presence.start || r.completedAtMs! > presence.end ||
        r.rootStartedAtMs === undefined || r.rootStartedAtMs <= presence.start || r.rootStartedAtMs > r.startedAtMs) continue;
    if (!presence.confirmed && (!p.afterActionCapture?.requestIds.includes(r.requestId) ||
        !p.afterActionCapture.requestAncestry?.some(a=>a.requestId===r.requestId && a.rootStartedAtMs===r.rootStartedAtMs))) continue;
    if (!isIdentifierEventRequest(r)) continue;
    return {...p, sentIdentifierWitness:{packetSha256:p.packetSha256,graphSha256:graph.sourceHash,requestNodeId:nodeId,
      requestId:r.requestId,endpoint:n.url,startedAtMs:r.startedAtMs,httpStatus:response.status,cookieName:cookie.name,cookieDomain:cookie.domain}};
  }
  return p;
}
