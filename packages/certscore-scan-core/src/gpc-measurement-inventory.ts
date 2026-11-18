import { choiceRequestRole, type CanonicalEvidenceBundle, type GpcBoundedObservation, type GpcMeasurementInventory, type NetworkEvent } from "@certscore/contracts";
import { createHash } from "node:crypto";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

export function analyticsMeasurementIdentity(event: NetworkEvent) {
  if (choiceRequestRole(event.requestUrl, event.method, event.resourceType) !== "analytics") return;
  return createHash("sha256").update(new URL(event.requestUrl).origin + "/g/collect").digest("hex");
}

/** The caller supplies the digest of the verified worker bytes. Only successful
 * responses to requests observed under the delivered signal enter the inventory. */
export function buildGpcMeasurementInventory(bundle: CanonicalEvidenceBundle, sourceSha256: string, observation?: GpcBoundedObservation): GpcMeasurementInventory | undefined {
  const session = bundle.gpcObservationSession;
  if (!session || session.scanId !== bundle.scanId || observation?.scanId !== bundle.scanId ||
      observation.sourceSha256 !== sourceSha256 || !observation.delivery.httpHeaderRetained ||
      !observation.delivery.mainNavigatorReadbackRetained || !session.mainDocument ||
      session.mainDocument.documentUrlSha256 !== observation.documentUrlSha256) return;
  const graphs = bundle.runtimeEvidenceGraphs?.filter(graph => graph.scenario === "gpc" && graph.captureId === bundle.scanId + ":gpc_observation");
  if (graphs?.length !== 1) return;
  const witnesses = new Map(session.requests.map(row => [row.eventId, row]));
  const responses = new Map(bundle.networkResponseEvents.map(row => [row.requestId, row]));
  const endpoints = new Map<string, GpcMeasurementInventory["endpoints"][number]>();
  for (const event of bundle.networkEvents) {
    const role = choiceRequestRole(event.requestUrl, event.method, event.resourceType);
    if (!role || role === "tag_library" || (event.method !== "GET" && event.method !== "POST")) continue;
    const witness = witnesses.get(event.eventId);
    const response = responses.get(event.requestId);
    if (event.requestHeaders?.secGpc !== "1" || witness?.secGpc !== "1" || witness.timestampMs !== event.timestampMs ||
        witness.urlSha256 !== gpcDocumentHash(event.requestUrl) || !response || response.responseUrl !== event.requestUrl ||
        response.status === undefined || response.status < 200 || response.status >= 300 || response.timestampMs < event.timestampMs ||
        event.timestampMs < session.captureStartedAtMs || event.timestampMs > session.captureEndedAtMs) continue;
    const hostname = new URL(event.requestUrl).hostname;
    const key = JSON.stringify([hostname, role, event.method]);
    const previous = endpoints.get(key);
    if (previous) {
      previous.count++;
      previous.firstSeenMs = Math.min(previous.firstSeenMs, event.timestampMs);
    } else if (endpoints.size < 8 && /^[a-z0-9.-]{1,253}$/.test(hostname)) {
      endpoints.set(key, {hostname, role, method: event.method, firstSeenMs: event.timestampMs, count: 1});
    }
  }
  if (endpoints.size) return {scanId: bundle.scanId, sourceSha256, graphSha256: graphs[0]!.sourceHash, endpoints: [...endpoints.values()]};
}
