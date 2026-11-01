import { getDomain } from "tldts";
import { formDestinationProjectionSchema, formDestinationTraceSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";

// Compare the retained endpoint, including scheme, host, port and path. Query
// values and fragments are deliberately absent from passive form trace URLs.
function endpoint(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}
/** Only the verified runtime lane may supply form event/payload relationships. */
export function projectFormDestinations(bundle: CanonicalEvidenceBundle, source: { sha256?: string; verificationStatus?: string } | undefined) {
  if (source?.verificationStatus !== "verified" || !/^[a-f0-9]{64}$/.test(source.sha256 ?? "")) return null;
  const trace = formDestinationTraceSchema.safeParse(bundle.formDestinationTrace);
  if (!trace.success) return null;
  const duration = Date.parse(bundle.completedAt) - Date.parse(bundle.startedAt);
  const snapshots = bundle.runtimeMetadataSnapshots ?? bundle.domSnapshots;
  if (!Number.isFinite(duration) || trace.data.events.some(event => event.observedAtMs > duration || !snapshots.some(snapshot => snapshot.url === event.documentUrl && snapshot.documentIdentity?.token === event.documentToken)) ||
    trace.data.requests.some(request => request.observedAtMs > duration || !bundle.networkEvents.some(network => network.requestId === request.networkRequestId))) return null;
  for (const request of trace.data.requests) {
    const event = trace.data.events.find(e => e.evidenceRef === request.eventRef)!;
    const networks = bundle.networkEvents.filter(n => n.requestId === request.networkRequestId);
    if (networks.length !== 1) return null;
    const network = networks[0]!;
    const host = (url: string) => getDomain(url, { allowPrivateDomains: true }) ?? new URL(url).hostname;
    if (!endpoint(request.url) || endpoint(network.url) !== endpoint(request.url) ||
        (network.requestUrl !== undefined && endpoint(network.requestUrl) !== endpoint(request.url)) ||
        (network.documentUrl !== undefined && endpoint(network.documentUrl) !== endpoint(event.documentUrl)) ||
        network.isSubFrame === true || network.isMainFrame === false || network.frameContext?.isSubFrame === true ||
        network.frameContext?.isMainFrame === false ||
        network.method !== request.method || network.timestampMs !== request.observedAtMs || host(network.url!) !== request.domain || host(request.url) !== request.domain ||
        event.actionDomain !== host(event.actionUrl) || request.party !== (host(event.documentUrl) === request.domain ? "first_party" : "third_party") || request.outsideDeclaredDestination !== (event.actionDomain !== request.domain) ||
        (request.status === "response_observed" && !bundle.networkResponseEvents.some(r => r.requestId === request.networkRequestId &&
          endpoint(r.responseUrl) === endpoint(request.url) && r.timestampMs >= request.observedAtMs && r.timestampMs <= duration &&
          (r.documentUrl === undefined || endpoint(r.documentUrl) === endpoint(event.documentUrl))))) return null;
  }
  return formDestinationProjectionSchema.parse({ contractVersion: "certscore.form-destination-projection.v1", scanId: bundle.scanId, sourceHash:source.sha256, verificationStatus:"verified", trace:trace.data });
}
