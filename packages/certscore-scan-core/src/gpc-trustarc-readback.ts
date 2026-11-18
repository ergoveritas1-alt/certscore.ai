import type { CanonicalEvidenceBundle, GpcBoundedObservation } from "@certscore/contracts";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

const noticeAsset = /^\/asset\/notice\.js\/v\/[a-f0-9]+$/;

/** TrustArc's consent client reports its GPC input in both requests. The
 * successful responses corroborate transmission, without proving enforcement. */
export function readTrustArcGpcStatus(
  bundle: CanonicalEvidenceBundle,
  session: NonNullable<CanonicalEvidenceBundle["gpcObservationSession"]>,
  capturedAtMs: number,
): GpcBoundedObservation["cmpStatusReadback"] {
  const document = session.mainDocument;
  if (!document) return;
  const start = Math.max(session.captureStartedAtMs, document.committedAtMs);
  const end = Math.min(session.captureEndedAtMs, capturedAtMs);
  const requests = new Map(session.requests.map(row => [row.eventId, row]));
  const candidates = bundle.networkEvents.filter(row => row.requestHostname === "consent.trustarc.com" &&
    (row.path === "/notice" || row.path === "/consent/log" || noticeAsset.test(row.path ?? "") ||
      /^\/cm\/[a-z0-9.-]+\/opt-out\/domains$/.test(row.path ?? "")) &&
    row.timestampMs >= start && row.timestampMs <= end);
  // Guard work and ambiguity explicitly. These requests share the existing capture.
  if (candidates.length > 16) return;
  const rows = candidates.flatMap(row => {
    if (!URL.canParse(row.requestUrl)) return [];
    const url = new URL(row.requestUrl);
    const proof = requests.get(row.eventId);
    const responses = bundle.networkResponseEvents.filter(response => response.requestId === row.requestId);
    const response = responses.length === 1 ? responses[0] : undefined;
    if (url.origin !== "https://consent.trustarc.com" || url.username || url.password || url.pathname !== row.path ||
        row.method !== "GET" || row.scenario !== "fresh_pre_consent" || !row.isMainFrame ||
        !row.frameContext?.isMainFrame || !row.frameContext.frameId ||
        row.redirectChainRequestIds?.length || !row.documentUrl || !URL.canParse(row.documentUrl) ||
        gpcDocumentHash(row.documentUrl) !== document.documentUrlSha256 ||
        proof?.secGpc !== "1" || proof.timestampMs !== row.timestampMs || proof.urlSha256 !== gpcDocumentHash(row.requestUrl) ||
        !response || response.scenario !== row.scenario || response.responseUrl !== row.requestUrl ||
        typeof response.status !== "number" || response.status < 200 || response.status >= 300 ||
        response.timestampMs < row.timestampMs || response.timestampMs > end) return [];
    const only = (name: string) => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) : null;
    return [{ row, response, tenant: only("domain"), config: only("type"), signal: only("is_gpc") }];
  });
  const lookups = candidates.filter(row => row.path?.startsWith("/cm/"));
  const logs = candidates.filter(row => row.path === "/consent/log");
  if (lookups.length !== 1 || logs.length !== 1) return;
  const lookup = rows.find(entry => entry.row === lookups[0]);
  const log = rows.find(entry => entry.row === logs[0]);
  if (!lookup || !log || !lookup.tenant || !lookup.config ||
      lookup.row.path !== `/cm/${lookup.tenant}/opt-out/domains` || log.tenant !== lookup.tenant ||
      log.config !== lookup.config || lookup.signal !== "true" || log.signal !== "true" ||
      lookup.row.resourceType !== "fetch" || log.row.resourceType !== "fetch" ||
      lookup.response.timestampMs > log.row.timestampMs) return;
  const sameFrame = (entry: typeof lookup) => entry.row.frameContext?.frameId === lookup.row.frameContext?.frameId;
  const scripts = rows.filter(entry => sameFrame(entry) && entry.row.resourceType === "script" &&
    entry.response.timestampMs <= lookup.row.timestampMs);
  if (!sameFrame(log) || !scripts.some(entry => entry.row.path === "/notice" && entry.tenant === lookup.tenant) ||
      !scripts.some(entry => noticeAsset.test(entry.row.path ?? "") &&
        (!lookup.row.responsibleScriptUrl || lookup.row.responsibleScriptUrl === entry.row.requestUrl))) return;
  return { source: "trustarc_consent_request_gpc", observedAtMs: log.response.timestampMs };
}
