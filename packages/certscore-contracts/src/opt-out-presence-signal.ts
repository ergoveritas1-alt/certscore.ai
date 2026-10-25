import {matchReviewedOptOutRoute,matchAdvertisingDomChoice} from "./reviewed-opt-out-routes";
import {findDomOptOutLabel} from "./dom-opt-out-label";
import {z} from "zod";
import {californiaPassageSchema} from "./california-clause-assessment";
import {classifyPrivacySurface} from "./privacy-surface-classifier";
import {matchScopedOptOutInstructions} from "./scoped-opt-out-instructions";
import {reviewedOptOutPolicyOwner} from "./policy-document-brand-relationships";
import {reviewedOptOutPolicyRedirect} from "./reviewed-opt-out-policy-redirect";
export {matchScopedOptOutInstructions} from "./scoped-opt-out-instructions";

export const OPT_OUT_SIGNAL_FINDING_ID="california_policy_opt_out_signal";
/** Owner-approved positive signal threshold. A right alone is insufficient;
 * instructions naming an opt-out route can count without operation verification. */
type OptOutSignalVersion="sale_sharing_opt_out_signal.v1"|"sale_sharing_opt_out_signal.v2";
export function optOutInstructionLabel(text:string,version:OptOutSignalVersion="sale_sharing_opt_out_signal.v1"):string|undefined{
  if(/\b(?:do(?:es)?(?: not|n['’]t) (?:offer|provide|have|contain)|no opt[ -]out (?:mechanism|form|request)|unavailable|no longer|plan(?:s|ning)? to|intend to|hypothetical|example|sample|recommend)\b/i.test(text))return undefined;
  const label=(version==="sale_sharing_opt_out_signal.v1"
    ? /\bYour (?:California )?Privacy Choices\b|\bDo Not Sell(?: or Share)? My Personal (?:Information|Data)\b/i
    : /\bYour (?:California )?Privacy Choices\b|\bDo Not (?:Sell(?: or Share)?|Share) My (?:Personal )?(?:Information|Data|Info)\b/i).exec(text)?.[0];
  const instruction=(version==="sale_sharing_opt_out_signal.v1"
    ? /\b(?:exercise|submit|visit|use|using|click|select|please see)\b/i
    : /\b(?:exercise|submit|visit|use|using|click(?:ing)?|select(?:ing)?|see)\b/i).test(text);
  const mechanism=/\b(?:provides?|contains?|offers?)\b/i.test(text)&&/\bopt[ -]out (?:mechanism|form|request)|\b(?:mechanism|form) to opt[ -]out\b/i.test(text);
  if(!label||!/\b(?:sell(?:ing)?|sale|shar(?:e|ing))\b/i.test(text)||!/\bopt[ -]out\b/i.test(text)||(!instruction&&!mechanism))return undefined;
  if(version==="sale_sharing_opt_out_signal.v2"&&!["do_not_sell_or_share","your_privacy_choices"].includes(classifyPrivacySurface({linkText:label}).surfaceType))return undefined;
  return label;
}
export const optOutPresenceSignalSchema=z.object({
  version:z.enum(["sale_sharing_opt_out_signal.v1","sale_sharing_opt_out_signal.v2","sale_sharing_opt_out_signal.v3","sale_sharing_opt_out_signal.v4","sale_sharing_opt_out_signal.v5","sale_sharing_opt_out_signal.v6","sale_sharing_opt_out_signal.v7","sale_sharing_opt_out_signal.v8"]),
  scanId:z.string().min(1).max(160),documentUrl:z.string().url().max(800),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  state:z.literal("observed"),basis:z.enum(["specific_policy_opt_out_instructions","visible_dom_opt_out_label"]),
  confidence:z.literal("signal"),effectiveness:z.literal("not_verified"),
  label:z.string().min(1).max(200),sourceDocumentUrl:z.string().url().max(800).refine(value=>{
    const url=new URL(value);return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;
  }),passage:californiaPassageSchema,
  scope:z.enum(["named_route","personalized_advertising","advertising_provider","localized_page","observed_page","mobile_advertising","eu_advertising","browser_advertising"]).optional(),
  scopeLabel:z.string().min(1).max(100).optional(),
  contextPassage:californiaPassageSchema.optional(),
  evidenceLimitations:z.array(z.enum(['instruction_destination_unverified','template_wording_retained'])).max(2).optional(),
  sourceQualityPassage:californiaPassageSchema.optional(),
  sourceBinding:z.discriminatedUnion("kind",[
    z.object({kind:z.literal("reviewed_policy_redirect"),relationshipId:z.literal("joybuy_uk_cookie_choices.v1"),requestedUrl:z.string().url().max(800),surfaceEvidenceRef:z.string().regex(/^policy-surface:/).max(240),observedAt:z.string().datetime()}).strict(),
    z.object({kind:z.literal("reviewed_owner_policy"),relationshipId:z.string().max(100),surfaceEvidenceRef:z.string().regex(/^policy-surface:/).max(240),observedAt:z.string().datetime()}).strict(),
    z.object({kind:z.literal("linked_policy_page"),surfaceEvidenceRef:z.string().regex(/^policy-surface:/).max(240),parentEvidenceRef:z.string().regex(/^policy-text:/).max(240),observedAt:z.string().datetime()}).strict(),
    z.object({kind:z.literal("owned_policy_surface"),surfaceEvidenceRef:z.string().regex(/^policy-surface:/).max(240),observedAt:z.string().datetime()}).strict(),
    z.object({kind:z.literal("dom_snapshot"),artifactId:z.string().min(1).max(160),documentToken:z.string().min(1).max(160),capturedAtMs:z.number().int().nonnegative(),observedAt:z.string().datetime()}).strict(),
  ]).optional(),
}).strict().superRefine((row,ctx)=>{
  const legacy=optOutInstructionLabel(row.passage.excerpt,row.version==="sale_sharing_opt_out_signal.v1"?row.version:"sale_sharing_opt_out_signal.v2");
  const ukCookieRefusal=row.version==="sale_sharing_opt_out_signal.v8",cookieRefusal=ukCookieRefusal||row.version==="sale_sharing_opt_out_signal.v7",latest=cookieRefusal||row.version==="sale_sharing_opt_out_signal.v6",newest=latest||row.version==="sale_sharing_opt_out_signal.v5",current=newest||row.version==="sale_sharing_opt_out_signal.v4",policy=row.basis==="specific_policy_opt_out_instructions";
  const scoped=(row.version==="sale_sharing_opt_out_signal.v3"||current)&&policy?matchScopedOptOutInstructions(row.passage.excerpt,row.contextPassage?.excerpt??"",current):undefined;
  const reviewed=newest&&policy?matchReviewedOptOutRoute(row.passage.excerpt,row.contextPassage?.excerpt??"",latest,cookieRefusal,ukCookieRefusal):undefined;
  const dom=current&&!policy&&row.sourceBinding?.kind==="dom_snapshot"?findDomOptOutLabel(row.passage.excerpt,newest):undefined;
  const ads=newest&&!policy?matchAdvertisingDomChoice(row.label,row.contextPassage?.excerpt??""):undefined;
  const valid=!policy ? Boolean((dom&&dom.label===row.label&&row.scope==="observed_page"&&row.scopeLabel==="Observed page only"&&!row.contextPassage||
    ads&&ads.scope===row.scope&&ads.scopeLabel===row.scopeLabel)&&row.passage.excerpt===row.label&&row.sourceBinding?.kind==="dom_snapshot"&&row.passage.evidenceRef===`dom-text:${row.sourceBinding.artifactId}`) :
    row.version==="sale_sharing_opt_out_signal.v3"||current ? Boolean(row.scope&&row.scopeLabel&&
      (legacy===row.label&&row.scope==="named_route"&&row.scopeLabel==="Named sale/sharing opt-out route"||
       scoped&&scoped.label===row.label&&scoped.scope===row.scope&&scoped.scopeLabel===row.scopeLabel||
       reviewed&&reviewed.label===row.label&&reviewed.scope===row.scope&&reviewed.scopeLabel===row.scopeLabel)) :
      legacy===row.label&&!row.scope&&!row.scopeLabel&&!row.contextPassage&&!row.sourceBinding;
  const expectedLimits=reviewed&&'evidenceLimitations'in reviewed?[...reviewed.evidenceLimitations,...(row.sourceQualityPassage?['template_wording_retained']:[])]:undefined;
  const validQuality=(!row.evidenceLimitations&&!row.sourceQualityPassage)||cookieRefusal&&policy&&Boolean(expectedLimits)&&
    JSON.stringify(row.evidenceLimitations)===JSON.stringify(expectedLimits)&&(!row.sourceQualityPassage||
      row.sourceQualityPassage.excerpt==='(COMPANY NAME)'&&row.sourceQualityPassage.evidenceRef===row.passage.evidenceRef&&row.sourceQualityPassage.textSha256===row.passage.textSha256);
  if(!valid||!validQuality||expectedLimits&&!row.evidenceLimitations||row.contextPassage&&(row.contextPassage.evidenceRef!==row.passage.evidenceRef||row.contextPassage.textSha256!==row.passage.textSha256||
    (!newest||!policy)&&(row.contextPassage.end>row.passage.start||row.passage.start-row.contextPassage.end>900))||
    ukCookieRefusal&&(row.sourceBinding?.kind!=="reviewed_policy_redirect"||!policy||reviewed?.id!=="declared_uk_advertising_cookie_refusal")||
    row.sourceBinding?.kind==="reviewed_policy_redirect"&&(!ukCookieRefusal||
      reviewedOptOutPolicyRedirect(row.documentUrl,[row.sourceBinding.requestedUrl,row.sourceDocumentUrl],row.sourceBinding.observedAt)?.id!==row.sourceBinding.relationshipId||
      row.sourceBinding.surfaceEvidenceRef!==row.passage.evidenceRef.replace(/^policy-text:/,"policy-surface:"))||
    row.sourceBinding?.kind==="reviewed_owner_policy"&&(reviewedOptOutPolicyOwner(row.documentUrl,row.sourceDocumentUrl,row.sourceBinding.observedAt)?.id!==row.sourceBinding.relationshipId||
      row.sourceBinding.surfaceEvidenceRef!==row.passage.evidenceRef.replace(/^policy-text:/,"policy-surface:"))||
    row.sourceBinding?.kind==="linked_policy_page"&&(!current||row.scope!=="localized_page"||row.sourceBinding.surfaceEvidenceRef!==row.passage.evidenceRef.replace(/^policy-text:/,"policy-surface:")||
      new URL(row.sourceDocumentUrl).hostname.replace(/^www\./,"")!==new URL(row.documentUrl).hostname.replace(/^www\./,""))||
    row.sourceBinding?.kind==="owned_policy_surface"&&(!newest||!policy||row.sourceBinding.surfaceEvidenceRef!==row.passage.evidenceRef.replace(/^policy-text:/,"policy-surface:")||
      new URL(row.sourceDocumentUrl).hostname.replace(/^www\./,"")!==new URL(row.documentUrl).hostname.replace(/^www\./,""))||
    row.sourceBinding?.kind==="dom_snapshot"&&(!current||policy)||
    new TextEncoder().encode(JSON.stringify(row)).length>2048)
    ctx.addIssue({code:"custom",message:"Observed opt-out signal needs specific retained instructions within the 2 KiB cap."});
});
export type OptOutPresenceSignal=z.infer<typeof optOutPresenceSignalSchema>;
