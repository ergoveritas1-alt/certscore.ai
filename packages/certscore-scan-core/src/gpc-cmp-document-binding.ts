import { parse } from "tldts";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

/** Retained passive evidence only. This grants no navigation or action authority. */
export function hasRetainedCmpApexWwwBinding(bundle: CanonicalEvidenceBundle): boolean {
  const signal = bundle.gpcSignalObservation, document = bundle.gpcImpactCapture?.document;
  if (!signal || !document) return false;
  const homepage = (value: string) => {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
      const site = parse(url.hostname, {allowPrivateDomains: true});
      if (!site.isIcann || site.isPrivate || site.isIp || !site.domain || !site.publicSuffix ||
        site.domain.length > 249 || url.hostname.split(".").some(label => !label.length || label.length > 63)) return undefined;
      if (url.hostname !== site.domain && url.hostname !== `www.${site.domain}`) return undefined;
      return {url: url.href, domain: site.domain};
    } catch { return undefined; }
  };
  const start = homepage(bundle.normalizedUrl);
  if (!start || homepage(bundle.url)?.url !== start.url) return false;
  // Exactly one server hop from the dispatched homepage. A later independent
  // navigation, repeated request ID, or partial ancestry cannot borrow proof.
  const documents = bundle.networkEvents.filter(e => e.isMainFrame && e.resourceType === "document" && e.timestampMs >= signal.documentStartedAtMs);
  if (documents.length !== 2) return false;
  const [root, final] = documents;
  if (!root || !final || root.requestId === final.requestId || root.eventId === final.eventId ||
    homepage(root.requestUrl)?.url !== start.url || root.parentRequestId || root.redirectChainRequestIds.length ||
    final.parentRequestId !== root.requestId || final.redirectChainRequestIds.length !== 1 || final.redirectChainRequestIds[0] !== root.requestId ||
    root.timestampMs >= final.timestampMs || final.timestampMs > document.committedAtMs || document.committedAtMs > signal.capturedAtMs) return false;
  const end = homepage(final.requestUrl);
  if (!end || end.domain !== start.domain || end.url === start.url || gpcDocumentHash(end.url) !== document.urlSha256 ||
    signal.documentUrlSha256 !== document.urlSha256 || bundle.gpcImpactCapture?.readbackDocumentToken !== document.token) return false;
  const connectionBound = (connection: typeof root.networkConnection, requestId: string, parent?: string) =>
    connection?.source === "response_request_binding" && connection.status === "server_observed" &&
    connection.requestId === requestId && connection.fromServiceWorker === false && connection.redirectedFromRequestId === parent;
  const responses = [];
  for (const request of documents) {
    const parent = request === final ? root.requestId : undefined;
    if (bundle.networkEvents.filter(e => e.requestId === request.requestId).length !== 1 ||
      request.method !== "GET" || request.isSubFrame === true || request.directVsInferred !== "direct" ||
      !request.requestHeaders || (signal.expectedEnabled ? request.requestHeaders.secGpc !== "1" : request.requestHeaders.secGpc !== undefined) ||
      !connectionBound(request.networkConnection, request.requestId, parent)) return false;
    const matches = bundle.networkResponseEvents.filter(e => e.requestId === request.requestId);
    const response = matches[0];
    if (matches.length !== 1 || !response || response.metadataCapture !== "complete" || response.directVsInferred !== "direct" ||
      homepage(response.responseUrl)?.url !== homepage(request.requestUrl)?.url ||
      response.timestampMs < request.timestampMs || response.timestampMs > document.committedAtMs ||
      !connectionBound(response.networkConnection, request.requestId, parent)) return false;
    responses.push(response);
  }
  const [redirect, terminal] = responses;
  if (!redirect || !terminal || ![301, 302, 303, 307, 308].includes(redirect.status ?? -1) ||
    redirect.timestampMs > final.timestampMs || terminal.status === undefined || terminal.status < 200 || terminal.status >= 300 || redirect.eventId === terminal.eventId) return false;
  const locations = [redirect.locationRedirectHeader, redirect.responseHeaders?.location].filter((v): v is string => v !== undefined);
  if (!locations.length || locations.some(value => {
    try { return !value || value.length > 2000 || new URL(value, start.url).href !== end.url; } catch { return true; }
  })) return false;
  return true;
}
