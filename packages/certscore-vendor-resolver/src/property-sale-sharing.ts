import { createHash } from "node:crypto";
import { propertySaleSharingSourceSchema, type PropertySaleSharingSource, type PropertySaleSharingProof } from "@certscore/contracts";
import { isAdvertisingIdentityValue } from "./advertising-identifiers";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const property = "G-[A-Z0-9]{4,60}";
// Deliberately closed positive declarations. No default, modal, negated,
// translated, generic vendor, quoted-example or inferred account-link recipe.
const sale = new RegExp(`^We sell (?:the )?(?:data|personal information) collected (?:through|by|using) Google Analytics property (${property}) to Google for (?:monetary|other valuable) consideration[.!]?$`);
const sharing = new RegExp(`^We share (?:the )?(?:data|personal information) collected (?:through|by|using) Google Analytics property (${property}) with Google for (?:cross-context behavioral advertising|remarketing|retargeting)[.!]?$`);
const audience = new RegExp(`^We use Google Analytics property (${property}) (?:for (?:cross-context behavioral advertising|remarketing|retargeting)|to build advertising audiences)[.!]?$`);
const clauses=(text:string)=>text.split(/[\r\n]+|(?<=[.!?])\s+(?=[A-Z])/u).slice(0,100);
const recipe=(clause:string)=>sale.exec(clause)??sharing.exec(clause)??audience.exec(clause);
type Observation = { observationId: string; surfaceType: string; targetRelationship?: string; ownershipConfidence?: number;
  documentEvaluationState?: string; documentRole?: string; documentFetchState?: string; status: string; httpStatus?: number;
  url: string; finalUrl?: string; textExcerpt?: string; documentLanguage?: string };

/** Call only on an original verified bundle. Read-time validation preserves
 * its hash; this extractor never fetches text or interprets missing disclosure. */
export function extractPropertySaleSharingSource(input: { scanId: string; targetUrl: string; sourceBundleSha256: string;
  observations: readonly Observation[] }): PropertySaleSharingSource {
  const declarations: PropertySaleSharingSource["declarations"] = [];
  const surfaces=input.observations.slice(0,8).filter(p=>
    ["privacy_policy", "cookie_policy", "california_notice", "notice_at_collection"].includes(p.surfaceType) &&
    ["target_controller", "first_party_brand"].includes(p.targetRelationship??"") && (p.ownershipConfidence??0)>=.9 &&
    p.documentEvaluationState==="usable" && p.documentRole==="policy_document" && p.status==="fetched" &&
    (!p.documentFetchState || p.documentFetchState==="fetched") && (p.httpStatus??0)>=200 && (p.httpStatus??600)<300 &&
    /^en(?:-|$)/i.test(p.documentLanguage??"") && Boolean(p.textExcerpt) && p.observationId.length<=200
  ).map(p=>({p,text:p.textExcerpt!.slice(0,6000)}));
  for (const {p,text} of surfaces) {
    // Contradictory/conditional/quoted passages remain unsupported. They must
    // be reviewed through a future explicit recipe rather than partially read.
    for (const line of clauses(text)) {
      const clause = line.trim(); if (clause.length > 400) continue;
      const match = recipe(clause); if (!match) continue;
      const id = match[1]!;
      if (/\b(?:example|hypothetical|sample wording)\b/i.test(text) || surfaces.some(surface=>clauses(surface.text).some(other => other !== line && other.includes(id) && /\b(?:not|never|only|may|might|if|unless|example|service provider)\b/i.test(other)))) continue;
      const basis = sale.test(clause) ? "owner_property_sale" as const : audience.test(clause)?"owner_property_audience" as const:"owner_property_sharing" as const;
      const declaration = { propertyIdSha256: sha(id), entityId: "ent_7509263a9ab6" as const, basis,
        observationId: p.observationId, documentUrlSha256: sha(p.finalUrl ?? p.url), retainedTextSha256: sha(p.textExcerpt!), clauseSha256: sha(clause), clause };
      const declarationId = sha(JSON.stringify([input.sourceBundleSha256, declaration]));
      if (!declarations.some(d => d.declarationId === declarationId) && declarations.length < 8) declarations.push({ declarationId, ...declaration });
    }
  }
  return propertySaleSharingSourceSchema.parse({ contractVersion: "property_sale_sharing_source.v1", scanId: input.scanId,
    targetSha256: sha(input.targetUrl), sourceBundleSha256: input.sourceBundleSha256, declarations });
}

/** Exact property + identified request, independent of storage persistence. */
export function matchPropertySaleSharingRequest(rawUrl: string, source: PropertySaleSharingSource | undefined): PropertySaleSharingProof | undefined {
  if (!source || !readPropertySaleSharingSource(source) || rawUrl.length > 16384) return;
  let url: URL; try { url = new URL(rawUrl); } catch { return; }
  if (url.protocol !== "https:" || !/^(?:www\.)?google-analytics\.com$/.test(url.hostname) ||
    url.pathname !== "/g/collect" || url.username || url.password || url.port || url.hash || [...url.searchParams].length > 256) return;
  const one = (k: string) => url.searchParams.getAll(k).length === 1 ? url.searchParams.get(k) : null;
  const id = one("tid"), cid = one("cid");
  if (one("v") !== "2" || !id || !new RegExp(`^${property}$`).test(id) || !isAdvertisingIdentityValue("cid", cid)) return;
  const declaration = source.declarations.find(d => d.propertyIdSha256 === sha(id)); if (!declaration) return;
  return { policyVersion: "corroborated_property_collection.v1", sourceBundleSha256: source.sourceBundleSha256,
    declarationId: declaration.declarationId, propertyIdSha256: declaration.propertyIdSha256, requestUrlSha256: sha(rawUrl) };
}

/** Revalidate retained declarations rather than trusting labels alone. */
export function readPropertySaleSharingSource(value: unknown): PropertySaleSharingSource | undefined {
 const parsed=propertySaleSharingSourceSchema.safeParse(value); if(!parsed.success)return;
 const source=parsed.data;
 for(const d of source.declarations){
  const match=(d.basis==="owner_property_sale"?sale:d.basis==="owner_property_audience"?audience:sharing).exec(d.clause);
  const {declarationId,...fields}=d;
  if(!match || sha(match[1]!)!==d.propertyIdSha256 || sha(d.clause)!==d.clauseSha256 ||
   sha(JSON.stringify([source.sourceBundleSha256,fields]))!==declarationId)return;
 }
 return source;
}
