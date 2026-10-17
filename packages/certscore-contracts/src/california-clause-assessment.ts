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
  topics:z.array(z.object({topic:z.enum(CALIFORNIA_RIGHTS_TOPICS),status:z.enum(["disclosed","not_observed","review"]),
    context:z.enum(["general_consumer_wording","california_wording","other_jurisdiction_only","unresolved"]),
    candidateClauseCount:z.number().int().nonnegative(),excludedClauseCount:z.number().int().nonnegative(),unresolvedClauseCount:z.number().int().nonnegative(),
    reason:z.string().min(1).max(300),passages:z.array(californiaPassageSchema).max(2),
    excludedPassages:z.array(californiaPassageSchema).max(2),
  }).strict()).length(4),
}).strict().superRefine((row,ctx)=>{
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

/** Content wording only. General consumer wording is retained independently of
 * California legal applicability; a heading containing 'California' is not required. */
export function assessCaliforniaRightsClauses(documents:CaliforniaPolicyDocument[],sourceBundleSha256:string):CaliforniaRightsClauseAssessment {
  const clauses=californiaPolicyClauses(documents);
  const patterns={
    right_to_know:/\b(?:right to (?:know|access)|(?:upon request|on request).{0,150}(?:access|copy|account of)|(?:give|provide|afford).{0,70}(?:individual|customer|consumer|you).{0,70}access|(?:you|customer|consumer|individual).{0,70}(?:request|obtain).{0,70}(?:copy|access))\b/i,
    right_to_delete:/\b(?:right to (?:request )?(?:delet\w*|eras\w*|be forgotten)|(?:you|customer|consumer|individual).{0,100}(?:request|ask).{0,100}(?:delet\w*|eras\w*|remov\w*)|(?:upon|on) request.{0,120}(?:delet\w*|eras\w*|remov\w*))\b/i,
    right_to_correct:/\b(?:right to (?:request )?(?:correct\w*|rectif\w*)|(?:you|customer|consumer|individual).{0,140}(?:challenge|request|ask).{0,140}(?:accura\w*|correct\w*|rectif\w*|amend\w*)|(?:upon|on) request.{0,140}(?:correct\w*|rectif\w*|amend\w*))\b/i,
    non_discrimination:/\b(?:will not|do not|won.t|shall not).{0,35}(?:discrimin\w*|retaliat\w*|penal\w*)|\bright to (?:equal treatment|non.discrimination)\b/i,
  };
  return californiaRightsClauseAssessmentSchema.parse({contractVersion:"certscore.california-rights-clauses.v1",sourceBundleSha256,
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
      const grants=relevant.filter(clause=>clause.text.length<=2000 && patterns[topic].test(clause.text) &&
        (topic !== "non_discrimination" || /\b(?:exercis\w*|privacy rights|those rights)\b/i.test(clause.text)) &&
        /\b(?:personal (?:information|data)|privacy rights|those rights|that information|the information)\b/i.test(clause.text) &&
        !/\b(?:not entitled|do not have|cannot exercise|waive|may not provide|cannot provide|only (?:eu|european|canadian|uk) residents)\b/i.test(clause.text));
      const general=grants.filter(clause=>! /\b(?:under (?:pipeda|gdpr)|(?:canadian|european|uk|eu) (?:residents|consumers|law)|residents of (?:canada|europe))\b/i.test(clause.text));
      const status=general.length?"disclosed":relevant.length?"review":"not_observed";
      return {topic,status,candidateClauseCount:candidates.length,excludedClauseCount:excluded.length,unresolvedClauseCount:relevant.length-general.length,context:general.length ? general.some(clause=>/\b(?:california|ccpa|cpra)\b/i.test(clause.text))?"california_wording":"general_consumer_wording":grants.length?"other_jurisdiction_only":"unresolved",
        reason:status === "disclosed"?"Consumer-rights wording retained; scope, exceptions and California adequacy remain separate checks.":status === "review"?"Candidate wording requires interpretation; no missing-right conclusion is inferred.":excluded.length?"Only retention/security wording was found; it does not describe a consumer-request right.":"No candidate rights wording in the completely inspected English policy documents.",
        passages:(general.length?general:relevant).slice(0,2).map(clause=>retainedCaliforniaPassage(clause,patterns[topic])),excludedPassages:excluded.slice(0,2).map(clause=>retainedCaliforniaPassage(clause,patterns[topic]))};
    })});
}
