import {choiceRequestRole, type PostRefusalReportProjection} from "@certscore/contracts";
import {classifyCanonicalCollectionEndpoint, resolveCanonicalVendor, resolveCanonicalCookieKnowledge} from "@certscore/vendor-resolver";

export function isTrackingIdentifierCookie(name: string, domain?: string) {
  if (name === "rl_anonymous_id" || name === "rl_session") return true;
  const c = resolveCanonicalCookieKnowledge(name, {cookieDomain:domain,purposePolicyVersion:"certscore.cookie-purpose.v12"});
  return c.essentiality === "non_essential" && ["analytics","advertising","marketing","session_replay"].includes(c.category) &&
    c.dataTypes.some(type => /\b(?:user|visitor|browser|session|audience|advertising|analytics) identifier$/.test(type));
}

type Request = NonNullable<PostRefusalReportProjection["scoringEvidence"]>["requests"][number];

export function isIdentifierEventRequest(r: Request) {
  const type = r.resourceType.toLowerCase();
  if (r.method === "POST" && (type === "ping" || type === "beacon")) return true;
  if (!["GET","POST"].includes(r.method ?? "") || !["fetch","xhr","image"].includes(type)) return false;
  const role = r.choiceRequestRole ?? choiceRequestRole(r.sanitizedUrl,r.method,type);
  if (r.measurementEvidence || r.californiaCollection || role === "sanity_batch_beacon" || role === "advertising" || role === "analytics") return true;
  const category = classifyCanonicalCollectionEndpoint(r.sanitizedUrl,type).category;
  return ["analytics_collection","advertising_collection","session_replay_collection"].includes(category ?? "") &&
    resolveCanonicalVendor({type:"request",url:r.sanitizedUrl}).observation?.registryAttribution?.matchKind==="endpoint";
}
