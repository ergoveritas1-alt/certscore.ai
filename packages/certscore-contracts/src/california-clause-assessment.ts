import {runtimeStoragePurposeAssessmentSchema,runtimeStoragePurposeV2Schema} from "./runtime-storage-purpose";
import { z } from "zod";
import { CALIFORNIA_RIGHTS_TOPICS, inspectCaliforniaRightsConcepts } from "./california-disclosure-inspection";

export const californiaPassageSchema = z.object({
  evidenceRef:z.string().min(1).max(240), textSha256:z.string().regex(/^[a-f0-9]{64}$/),
  start:z.number().int().nonnegative(), end:z.number().int().positive(), excerpt:z.string().min(1).max(480),
}).strict().superRefine((row,ctx)=>{if(row.end-row.start!==row.excerpt.length)ctx.addIssue({code:"custom",message:"Passage offsets must match retained text."});});
export type CaliforniaPolicyDocument = {evidenceRef:string;textSha256:string;text:string;url:string};
export type CaliforniaPassage = z.infer<typeof californiaPassageSchema>;

export const californiaRightsClauseAssessmentSchema=z.object({
  contractVersion:z.literal("certscore.california-rights-clauses.v1"),sourceBundleSha256:z.string().regex(/^[a-f0-9]{64}$/),
  assessmentPolicyVersion:z.literal("rights_section_context.v2").optional(),
  sourceCoverage:z.object({policyVersion:z.enum(["verified_positive_clauses.v1","verified_positive_clauses.v2"]),status:z.literal("partial"),documents:z.array(z.object({evidenceRef:z.string().min(1).max(240),textSha256:z.string().regex(/^[a-f0-9]{64}$/),inspectedChars:z.number().int().positive().max(160000)}).strict()).min(1).max(8)}).strict().optional(),
  topics:z.array(z.object({topic:z.enum(CALIFORNIA_RIGHTS_TOPICS),status:z.enum(["disclosed","not_observed","review"]),
    context:z.enum(["general_consumer_wording","california_wording","other_jurisdiction_only","unresolved"]),
    candidateClauseCount:z.number().int().nonnegative(),excludedClauseCount:z.number().int().nonnegative(),unresolvedClauseCount:z.number().int().nonnegative(),
    reason:z.string().min(1).max(300),passages:z.array(californiaPassageSchema).max(2),
    excludedPassages:z.array(californiaPassageSchema).max(2),
  }).strict()).length(4),
}).strict().superRefine((row,ctx)=>{
  if(row.sourceCoverage && row.topics.some(topic=>topic.status==="not_observed"))ctx.addIssue({code:"custom",message:"Partial clause capture cannot establish absence."});
  if(new Set(row.topics.map(topic=>topic.topic)).size!==4 || row.topics.some(topic=>topic.status === "disclosed" && !topic.passages.length || topic.excludedClauseCount>topic.candidateClauseCount || topic.unresolvedClauseCount>topic.candidateClauseCount-topic.excludedClauseCount || topic.status === "not_observed" && topic.candidateClauseCount !== topic.excludedClauseCount))
    ctx.addIssue({code:"custom",message:"Every rights topic requires a unique, evidence-bound conclusion."});
});
export type CaliforniaRightsClauseAssessment=z.infer<typeof californiaRightsClauseAssessmentSchema>;

export const californiaCollectionNoticeAssessmentSchema=z.object({
  contractVersion:z.literal("certscore.california-collection-notice-matching.v1"),sourceBundleSha256:z.string().regex(/^[a-f0-9]{64}$/),
  inventoryComplete:z.boolean(),points:z.array(z.object({
    id:z.string().min(1).max(120),kind:z.enum(["form","cookies_storage","third_party_resources"]),
    label:z.string().min(1).max(120),categories:z.array(z.string().min(1).max(60)).max(20),
    status:z.enum(["matched_text","policy_text_only","not_matched","limited"]),
    association:z.enum(["form_notice","page_policy_link","not_verified"]),
    reason:z.string().min(1).max(350),evidenceRefs:z.array(z.string().min(1).max(240)).max(8),
    passages:z.array(californiaPassageSchema).max(2),
  }).strict()).max(12),
  limitationKeys:z.array(z.string().min(1).max(100)).max(8),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.points.map(point=>point.id)).size!==row.points.length ||
    row.points.some(point=>point.status === "matched_text" && (!point.passages.length || point.association === "not_verified")))
    ctx.addIssue({code:"custom",message:"Matched collection text requires retained passages and an observed association."});
});
export type CaliforniaCollectionNoticeAssessment=z.infer<typeof californiaCollectionNoticeAssessmentSchema>;

export const californiaCollectionNoticeV2Schema=z.object({
  ...californiaCollectionNoticeAssessmentSchema.innerType().shape,
  contractVersion:z.literal("certscore.california-collection-notice-matching.v2"),
  points:z.array(californiaCollectionNoticeAssessmentSchema.innerType().shape.points.element.extend({
    kind:z.enum(["form","cookies","browser_storage","third_party_resources"]),
    scope:z.enum(["form_fields","search_input","cookie_identifiers","storage_keys","resource_contact_only"]),
    purposeMatch:z.enum(["wording_retained","unresolved"]),
    recipientMatch:z.enum(["wording_retained","unresolved","not_assessed"]),
  }).strict()).max(12),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.points.map(point=>point.id)).size!==row.points.length || row.points.some(point=>
    point.status === "matched_text" && (!point.passages.length || point.association === "not_verified" || point.purposeMatch !== "wording_retained" || point.scope === "resource_contact_only")))
    ctx.addIssue({code:"custom",message:"Collection matches need retained associated purpose text; resource contacts alone cannot establish data collection."});
});
export type CaliforniaCollectionNoticeV2=z.infer<typeof californiaCollectionNoticeV2Schema>;

export const californiaCollectionNoticeV3Schema=z.object({
  ...californiaCollectionNoticeV2Schema.innerType().shape,
  contractVersion:z.literal("certscore.california-collection-notice-matching.v3"),
  points:z.array(californiaCollectionNoticeV2Schema.innerType().shape.points.element.extend({
    assessmentScope:z.enum(["category_purpose","technical_context"]),
    categoryMatch:z.enum(["wording_retained","not_observed","unresolved","not_assessed"]),
    purposeMatch:z.enum(["wording_retained","not_observed","unresolved","not_assessed"]),
    technicalMatch:z.enum(["exact_name_retained","not_retained","not_assessed"]),
  }).strict()).max(12),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.points.map(point=>point.id)).size!==row.points.length || row.points.some(point=>
    (point.categoryMatch === "wording_retained" || point.purposeMatch === "wording_retained") && !point.passages.length ||
    point.status === "matched_text" && (point.assessmentScope!=="category_purpose" || point.categoryMatch!=="wording_retained" || point.purposeMatch!=="wording_retained" || point.association === "not_verified") ||
    point.scope === "resource_contact_only" && (point.assessmentScope!=="technical_context" || point.categoryMatch!=="not_assessed")))
    ctx.addIssue({code:"custom",message:"Category/purpose conclusions need retained text; resource contacts and technical names cannot establish notice coverage."});
});
export type CaliforniaCollectionNoticeV3=z.infer<typeof californiaCollectionNoticeV3Schema>;

export const californiaCollectionNoticeV4Schema=z.object({
  ...californiaCollectionNoticeV3Schema.innerType().shape,
  contractVersion:z.literal("certscore.california-collection-notice-matching.v4"),
  runtimePurposeAssessment:runtimeStoragePurposeAssessmentSchema,
}).strict().superRefine((row,ctx)=>{
  const {runtimePurposeAssessment:_,...prior}=row;
  if(!californiaCollectionNoticeV3Schema.safeParse({...prior,contractVersion:"certscore.california-collection-notice-matching.v3"}).success)ctx.addIssue({code:"custom",message:"Invalid category/purpose assessment"});
  if(row.runtimePurposeAssessment.sourceBundleSha256!==row.sourceBundleSha256)ctx.addIssue({code:"custom",message:"Runtime purpose assessment source mismatch"});
});
export type CaliforniaCollectionNoticeV4=z.infer<typeof californiaCollectionNoticeV4Schema>;

export const californiaCollectionNoticeV5Schema=z.object({
  ...californiaCollectionNoticeV4Schema.innerType().shape,
  contractVersion:z.literal("certscore.california-collection-notice-matching.v5"),runtimePurposeAssessment:runtimeStoragePurposeV2Schema,
  points:z.array(californiaCollectionNoticeV3Schema.innerType().shape.points.element.extend({
    purposeBasis:z.enum(["observed_or_inferred","declared_only","unresolved","not_assessed"]),
  }).strict()).max(12),
}).strict().superRefine((row,ctx)=>{
  if(row.points.some(point=>point.purposeBasis === "declared_only"&&(point.kind!=="cookies"||point.purposeMatch!=="wording_retained"||row.runtimePurposeAssessment.inventoryLimited||!row.runtimePurposeAssessment.items.some(item=>item.kind === "cookie")||row.runtimePurposeAssessment.items.filter(item=>item.kind === "cookie").some(item=>!item.declaredPurpose||item.declaredPurpose.purpose === "unknown"||(item.purpose!=="unknown"&&item.purpose!==item.declaredPurpose.purpose&&!(item.purpose === "consent_management"&&item.declaredPurpose.purpose === "preferences"))))))ctx.addIssue({code:"custom",message:"Declared purpose coverage requires compatible named-cookie declarations"});
  const {runtimePurposeAssessment:_,...prior}=row;
  if(!californiaCollectionNoticeV3Schema.safeParse({...prior,contractVersion:"certscore.california-collection-notice-matching.v3",points:row.points.map(({purposeBasis:_,...point})=>point)}).success||row.runtimePurposeAssessment.sourceBundleSha256!==row.sourceBundleSha256)ctx.addIssue({code:"custom",message:"Invalid declaration/notice assessment binding"});
});
export type CaliforniaCollectionNoticeV5=z.infer<typeof californiaCollectionNoticeV5Schema>;

export function californiaPolicyClauses(documents:CaliforniaPolicyDocument[]) {
  return documents.flatMap(document=>Array.from(document.text.matchAll(/[^.!?]+(?:[.!?]|$)/g),match=>{
    const raw=match[0],trimmed=raw.trim(),start=match.index!+raw.indexOf(trimmed);
    return {document,text:trimmed,start};
  }).filter(clause=>clause.text.length>0));
}
export function retainedCaliforniaPassage(clause:ReturnType<typeof californiaPolicyClauses>[number],anchor?:RegExp):CaliforniaPassage {
  const rawOffset=Math.max(0,(anchor?.exec(clause.text)?.index ?? 0)-80);
  const nextSpace=clause.text.indexOf(" ",rawOffset);
  const offset=rawOffset>0 && nextSpace>=0 ? nextSpace+1 : rawOffset;
  const excerpt=clause.text.slice(offset,offset+480);
  return {evidenceRef:clause.document.evidenceRef,textSha256:clause.document.textSha256,start:clause.start+offset,
    end:clause.start+offset+excerpt.length,excerpt};
}

function rightsScope(clause:ReturnType<typeof californiaPolicyClauses>[number]):"other"|"california"|"general" {
  // Preserve the operative audience across sentence/list boundaries in retained
  // flattened policy text. A keyword elsewhere in the site navigation is not a
  // consumer grant. Later explicit California/US grants reset a foreign scope.
  const context=clause.document.text.slice(Math.max(0,clause.start-3000),clause.start+clause.text.length);
  const last=(pattern:RegExp)=>[...context.matchAll(pattern)].at(-1)?.index??-1;
  const other=last(/\b(?:International Users|Your Colorado and Oregon Privacy Choices|(?:Oregon|Colorado|Canadian|European|EU|UK) residents|If you are (?:a (?:Colorado or Oregon|Colorado|Oregon|Canadian|European|EU|UK) resident|located[^.!?]{0,160}outside the United States)|The MHMD Act provides[^.!?]{0,90}rights|(?:Individual Rights[^.!?]{0,100})?(?:Under (?:the )?(?:EU )?(?:GDPR|PIPL)|Rights Under the PIPL))\b/gi);
  const ca=last(/\b(?:Rights for California Residents|(?:If you are|As) a California resident|California (?:Privacy Rights|Consumer Privacy Act)|under the (?:CCPA|CPRA))\b/gi);
  const us=last(/\b(?:U\.S\. privacy laws provide consumers|If you are a U\.S\. consumer|we (?:extend|provide|offer) (?:these|the same) rights to all)\b/gi);
  return other>Math.max(ca,us)?"other":ca>us?"california":"general";
}

/** A short list entry may inherit an explicit rights grant, never an unrelated
 * mention of rights elsewhere in the document. Evidence offsets still point to
 * the original clause; inherited context is used only for interpretation. */
function rightsClauseWording(clause:ReturnType<typeof californiaPolicyClauses>[number]) {
  const before=clause.document.text.slice(Math.max(0,clause.start-1200),clause.start);
  const grant=/\b(?:you|consumers?|residents?|individual(?: data subjects?)?)\b[^.!?]{0,180}\b(?:may have|have|has|will be afforded)\s+(?:(?:the|these|following)\s+){0,3}(?:privacy\s+)?rights?(?:\s+to)?\s*:/gi;
  const lead=[...(before+clause.text).matchAll(grant)].at(-1);
  // Inherit through a compact list only. A numbered new section or a new
  // collection/retention/security heading terminates the grant.
  const tail=lead?before.slice(lead.index!+lead[0].length):"";
  const inherited=Boolean(lead && !/\b(?:\d+\.\s+(?:How|What|When|Contact|Changes)|(?:Data|Information) (?:Retention|Security)|How (?:We|to))\b/i.test(tail));
  const listStart=lead?Math.max(0,lead.index!+lead[0].length-before.length):0;
  const wording=clause.text.slice(listStart).replace(/\bright to\s*:\s*/gi,"right to ").trim();
  return {text:inherited?`You have the right to ${wording}`:wording,inherited};
}

/** Content wording only. General consumer wording is retained independently of
 * California legal applicability; a heading containing 'California' is not required. */
export function assessCaliforniaRightsClauses(documents:CaliforniaPolicyDocument[],sourceBundleSha256:string, options:{completeCoverage?:boolean;positivePassageLanguage?:boolean}={}):CaliforniaRightsClauseAssessment {
  const clauses=californiaPolicyClauses(documents);
  const completeCoverage = options.positivePassageLanguage ? false : options.completeCoverage;
  const patterns={
    right_to_know:/\b(?:right to (?:know|access)|right to request.{0,90}(?:provide|disclose).{0,90}personal (?:information|data)|(?:upon request|on request).{0,150}(?:access|copy|account of)|(?:give|provide|afford).{0,70}(?:individual|customer|consumer|you).{0,70}access|(?:you|customer|consumer|individual).{0,70}(?:request|obtain).{0,70}(?:copy|access))\b/i,
    right_to_delete:/\b(?:right to (?:(?:request(?:,\s*on legitimate grounds,)?|ask that we) )?(?:delet\w*|eras\w*|be forgotten)|(?:you|customer|consumer|individual).{0,100}(?:request|ask).{0,100}(?:delet\w*|eras\w*|remov\w*)|(?:upon|on) request.{0,120}(?:delet\w*|eras\w*|remov\w*))\b/i,
    right_to_correct:/\b(?:right(?:,\s*in certain circumstances,)? to (?:(?:request(?: that we)?|ask that we) )?(?:correct\w*|rectif\w*)|(?:you|customer|consumer|individual).{0,140}(?:challenge|request|ask).{0,140}(?:accura\w*|correct\w*|rectif\w*|amend\w*)|(?:upon|on) request.{0,140}(?:correct\w*|rectif\w*|amend\w*)|\bCorrection\s+Request that we (?:amend|update))\b/i,
    non_discrimination:/\b(?:you will not receive discriminatory treatment|(?:we )?(?:will not|do not|won.t|shall not|may not).{0,35}(?:discrimin\w*|retaliat\w*|penal\w*))|\bright (?:to (?:equal treatment|non.discrimination|not be discriminated against)|not to (?:be discriminated against|receive discriminatory treatment))\b/i,
  };
  return californiaRightsClauseAssessmentSchema.parse({contractVersion:"certscore.california-rights-clauses.v1",assessmentPolicyVersion:"rights_section_context.v2",sourceBundleSha256,
    ...(completeCoverage===false?{sourceCoverage:{policyVersion:options.positivePassageLanguage?"verified_positive_clauses.v2":"verified_positive_clauses.v1",status:"partial",documents:documents.map(document=>({evidenceRef:document.evidenceRef,textSha256:document.textSha256,inspectedChars:document.text.length}))}}:{}),
    topics:CALIFORNIA_RIGHTS_TOPICS.map(topic=>{
      const candidates=clauses.filter(clause=>inspectCaliforniaRightsConcepts([clause.text]).find(row=>row.topic === topic)!.candidateCount>0);
      const excluded:typeof candidates=[];const relevant:typeof candidates=[];
      for(const clause of candidates) {
        const context=clause.document.text.slice(Math.max(0,clause.start-320),clause.start+clause.text.length);
        const requestContext=/\b(?:request\w*|right\w*|ask\w*|instruct\w*|tell us|direct us|at your|you may|you can|customer may|consumer may)\b/i.test(clause.text);
        const operative=/\b(?:maintain\w*|shall be|will be|must be|(?:information|data|records) (?:is|are)|protect\w*)\b.{0,250}\b(?:destroy\w*|destruc\w*|eras\w*|anonym\w*)\b/i.test(clause.text);
        const retention=topic === "right_to_delete" && !requestContext && operative &&
          /\b(?:retention|retain\w*|no longer necessary|no longer relevant|information and records|security measures|risks as loss|loss or theft)\b/i.test(context) &&
          /\b(?:destroy\w*|destruc\w*|eras\w*|anonym\w*)\b/i.test(clause.text);
        (retention?excluded:relevant).push(clause);
      }
      const grants=relevant.filter(clause=>{const wording=rightsClauseWording(clause);const text=wording.text;return clause.text.length<=2000 && patterns[topic].test(text) &&
        (topic!=="right_to_know" || !/\baccess to (?:certain )?(?:areas|features|services|platforms)\b/i.test(clause.text)) &&
        (topic!=="right_to_know" || (()=>{const match=patterns[topic].exec(text)!;return /\b(?:personal (?:information|data)|that information|the information)\b/i.test(text.slice(Math.max(0,match.index-80),match.index+match[0].length+180)) || wording.inherited && /\b(?:your information|information about you)\b/i.test(clause.text);})()) &&
        (topic !== "non_discrimination" || /\b(?:exercis\w*|privacy rights|those rights)\b/i.test(clause.text)) &&
        (/\b(?:personal (?:information|data)|privacy rights|(?:your|those|these) rights|that information|the information)\b/i.test(clause.text) || wording.inherited && /\byour information\b|\binformation about you\b/i.test(clause.text)) &&
        !/\b(?:not entitled|do not have|cannot exercise|waive|may not provide|cannot provide|only (?:eu|european|canadian|uk) residents)\b/i.test(clause.text);});
      const general=grants.filter(clause=>rightsScope(clause)!=="other" && ! /\b(?:under (?:pipeda|gdpr)|(?:canadian|european|uk|eu) (?:residents|consumers|law)|residents of (?:canada|europe))\b/i.test(clause.text))
        .sort((a,b)=>Number(!/\bright to\b/i.test(a.text))-Number(!/\bright to\b/i.test(b.text)) || a.text.length-b.text.length || a.start-b.start);
      const status=general.length?"disclosed":relevant.length || completeCoverage===false?"review":"not_observed";
      return {topic,status,candidateClauseCount:candidates.length,excludedClauseCount:excluded.length,unresolvedClauseCount:relevant.length-general.length,context:general.length ? general.some(clause=>rightsScope(clause)==="california"||/\b(?:california|ccpa|cpra)\b/i.test(clause.text))?"california_wording":"general_consumer_wording":grants.some(clause=>rightsScope(clause)==="other"||/\b(?:gdpr|pipeda|european|canadian)\b/i.test(clause.text))?"other_jurisdiction_only":"unresolved",
        reason:status === "disclosed"?"Consumer-rights wording retained; scope, exceptions and California adequacy remain separate checks.":status === "review"?completeCoverage===false?"Verified positive passages inspected; unresolved supplements prevent a missing-right conclusion.":"Candidate wording requires interpretation; no missing-right conclusion is inferred.":excluded.length?"Only retention/security wording was found; it does not describe a consumer-request right.":"No candidate rights wording in the completely inspected English policy documents.",
        passages:(general.length?general:grants.length?grants:relevant).slice(0,2).map(clause=>retainedCaliforniaPassage(clause,patterns[topic])),excludedPassages:excluded.slice(0,2).map(clause=>retainedCaliforniaPassage(clause,patterns[topic]))};
    })});
}
