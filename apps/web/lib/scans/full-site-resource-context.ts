import { CANONICAL_VENDOR_RESOLVER_VERSION, resolveCanonicalVendor, resolveCanonicalVendorLegalContext, findCanonicalVendorMention } from "@certscore/vendor-resolver";
import type { CrawlOccurrence } from "@website-signal-risk-scanner/shared";
export type ReviewedPolicy = { url: string; text: string; sha256: string; complete: boolean; capturedAt: string };
export function identifyCrawlService(row: CrawlOccurrence) {
  const match = resolveCanonicalVendor({ type: row.kind === "cookie" ? "cookie" : row.kind === "script" ? "script" : "request", url: ["request", "script", "embed"].includes(row.kind) ? row.label : undefined, hostname: row.domain ?? undefined, cookieName: row.kind === "cookie" ? row.label : undefined, matchSource: row.kind === "cookie" ? "cookie_name" : "network_request" }).observation;
  return match ? { product: match.product, vendor: match.vendor, entity: match.entity, registryVersion: CANONICAL_VENDOR_RESOLVER_VERSION } : null;
}
export function describeCrawlService(identity: ReturnType<typeof identifyCrawlService>, documents: ReviewedPolicy[]) {
  const legal = identity ? resolveCanonicalVendorLegalContext(identity.entity) : null;
  const mentions = identity ? documents.flatMap(document => {
    const match = findCanonicalVendorMention(document.text, identity);
    return match ? [{ url: document.url, sha256: document.sha256, capturedAt: document.capturedAt, scope: match.scope, excerpt: document.text.slice(Math.max(0, match.start - 160), Math.min(document.text.length, match.end + 240)) }] : [];
  }) : [];
  // A partial document may support a mention, but cannot support a negative search result.
  const complete = documents.length > 0 && documents.every(document => document.complete);
  return { identity, provider: legal?.controllingEntity ?? identity?.entity ?? null, headquarters: legal?.headquartersCountry ?? null,
    transfer: legal?.transferMechanism ?? null,
    policy: { status: mentions.length ? "mentioned" as const : identity && complete ? "not_found" as const : "unknown" as const, mentions,
      reviewed: documents.map(({text: _text, ...document}) => document) } };
}
export type FullSiteResourceContext = ReturnType<typeof describeCrawlService>;
