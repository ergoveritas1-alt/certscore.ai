import type { PostRefusalReportProjection } from "@certscore/contracts";
import { CANONICAL_VENDOR_RESOLVER_VERSION, COOKIE_PURPOSE_POLICY, getCanonicalVendorRegistryManifest,
  resolveCanonicalVendor, resolveCanonicalVendorLabel } from "@certscore/vendor-resolver";
import { retainedRejectPresence } from "./reject-presence-evidence";

export { postRejectEntityPoints as rejectEntityPoints } from "./scoring-policy";

// A label fallback must identify exactly one registry entity. Host strings and
// unrecognized labels never become invented recipient identities.
const registry = getCanonicalVendorRegistryManifest();
function owner(input: Parameters<typeof resolveCanonicalVendor>[0], label?: string) {
  const direct = resolveCanonicalVendor(input).observation;
  const named = resolveCanonicalVendorLabel(label);
  if (direct?.registryAttribution && (!named || named.entity === direct.entity)) return {
    entityId: direct.registryAttribution.entityId, entity: direct.entity, vendor: direct.vendor,
  };
  if (direct || !named) return null;
  const candidates = registry.rules.filter(rule => rule.entity === named.entity);
  return candidates.length && new Set(candidates.map(rule => rule.entityId)).size === 1
    ? { entityId: candidates[0]!.entityId, entity: named.entity, vendor: named.vendor } : null;
}

export function retainedRejectEntityEvidence(p: PostRefusalReportProjection, presence: NonNullable<ReturnType<typeof retainedRejectPresence>>) {
  const observations: Array<{ kind: "cookie_snapshot" | "service_request"; evidenceRef: string; name: string;
    hostname?: string; purpose: string; msAfterClick: number; entityId?: string; entity?: string; vendor?: string }> = [];
  for (const cookie of presence.cookies) {
    const source = p.scoringEvidence!.postActionStorage.find(row => row.storageType === "cookie" && row.name === cookie.name &&
      row.hostname === cookie.hostname && row.identityHash === cookie.identityHash && row.valueHash === cookie.valueHash)!;
    const identity = owner({ type: "cookie", cookieName: source.name, hostname: source.hostname,
      cookiePurposePolicyVersion: COOKIE_PURPOSE_POLICY }, source.vendor);
    observations.push({ kind: "cookie_snapshot", evidenceRef: `cookie:${cookie.identityHash ?? `${cookie.name}@${cookie.hostname ?? ""}`}:${cookie.valueHash}`,
      name: cookie.name, ...(cookie.hostname ? { hostname: cookie.hostname } : {}), purpose: source.purpose!,
      msAfterClick: presence.postSnapshot! - presence.start, ...(identity ?? {}) });
  }
  for (const id of presence.requestIds) {
    const request = p.scoringEvidence!.requests.find(row => row.requestId === id)!;
    const identity = owner({ type: "request", url: request.sanitizedUrl, hostname: request.hostname }, request.vendor);
    observations.push({ kind: "service_request", evidenceRef: `request:${id}`, name: request.sanitizedUrl,
      ...(request.hostname ? { hostname: request.hostname } : {}), purpose: request.purpose!,
      msAfterClick: request.startedAtMs - presence.start, ...(identity ?? {}) });
  }
  observations.sort((a, b) => a.msAfterClick - b.msAfterClick || a.evidenceRef.localeCompare(b.evidenceRef));
  const entities = [...new Map(observations.flatMap(row => row.entityId ? [[row.entityId,
    { entityId: row.entityId, entity: row.entity!, vendor: row.vendor! }] as const] : [])).values()]
    .sort((a, b) => a.entityId.localeCompare(b.entityId));
  return { resolverVersion: CANONICAL_VENDOR_RESOLVER_VERSION, entities, observations };
}
