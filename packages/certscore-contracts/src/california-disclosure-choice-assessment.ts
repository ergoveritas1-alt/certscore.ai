import {z} from "zod";
import {californiaPassageSchema, type CaliforniaPolicyDocument} from "./california-clause-assessment";
import type {CaliforniaPrivacyReview} from "./california-privacy-review";

export const CALIFORNIA_DISCLOSURE_CHOICE_POLICY = "california.disclosure-choice.v1" as const;
export const CALIFORNIA_RUNTIME_LINK_POLICY = "california.disclosure-choice.v2-runtime" as const;
export const californiaDisclosureChoiceCapturePolicySchema = z.enum([CALIFORNIA_DISCLOSURE_CHOICE_POLICY,CALIFORNIA_RUNTIME_LINK_POLICY]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

/** A possible signal/exception reference blocks the narrow negative conclusion.
 * These are policy concepts, not consent-control labels or action recipes. */
const signalConcepts = /\b(?:gpc|sec-gpc|global[\s\u2010-\u2015-]+privacy|frictionless|signals?|browsers?|extensions?|automatic\w*|automated|universal|(?:privacy|opt[ -]?out)\s+(?:preference\s+)?(?:settings?|controls?|preferences?)|do[ -]not[ -]track|dnt)\b/gi;
export function californiaSignalDisclosureCandidateCount(texts: readonly string[]): number {
  let count=0;
  for (const text of texts) for (const _ of text.normalize("NFKC").matchAll(new RegExp(signalConcepts))) count++;
  return count;
}
/** Require California scope in the retained affirmative clause itself. General
 * analytics, foreign-law clauses and a California heading elsewhere do not qualify. */
export function isExplicitCaliforniaSaleSharingDeclaration(text:string): boolean {
  return /\b(?:under|as defined (?:by|under)|for purposes of) (?:the )?(?:CCPA|CPRA|California Consumer Privacy Act|California Privacy Rights Act|California law)\b/i.test(text) &&
    /\bwe\s+(?:may |do |will )?(?:sell|share)\b/i.test(text) && /\bpersonal (?:information|data)\b/i.test(text) &&
    !/\b(?:not|never|unless|except|however|depending|if|whether|outside|other jurisdictions?|examples?|hypothetical|quoted?|illustrat\w*|could|might)\b/i.test(text);
}
const californiaDisclosureChoiceAssessmentV1Schema = z.object({
  policyVersion:z.literal(CALIFORNIA_DISCLOSURE_CHOICE_POLICY),
  scanId:z.string().min(1).max(160),documentUrl:z.string().url().max(800),sourceHash:hash,
  requiredLinkProof:z.object({
    basis:z.literal("california_declaration_without_required_signal_disclosure.v1"),
    signalDisclosureCandidateCount:z.literal(0),
    declaration:californiaPassageSchema,
    documents:z.array(z.object({evidenceRef:z.string().min(1).max(240),textSha256:hash,
      inspectedChars:z.number().int().positive().max(160000)}).strict()).min(1).max(8),
  }).strict().optional(),
}).strict();
export const californiaRuntimeLinkProofSchema=z.object({
  basis:z.literal("qualified_gpc_collection.v1"),
  inspectionSourceHash:hash,gpcSourceSha256:hash,gpcSessionSha256:hash,documentUrlSha256:hash,
  qualifierVersion:z.literal("california-gpc-response.v10-property-bound"),
  requests:z.array(z.object({evidenceId:z.string().min(1).max(240),entityId:z.string().regex(/^ent_[a-f0-9]{12}$/)}).strict()).min(1).max(32),
}).strict().superRefine((p,ctx)=>{
  if(new Set(p.requests.map(r=>r.evidenceId)).size!==p.requests.length)
    ctx.addIssue({code:"custom",message:"Runtime link request proofs must be unique."});
});
const californiaDisclosureChoiceAssessmentV2Schema=californiaDisclosureChoiceAssessmentV1Schema.extend({
  policyVersion:z.literal(CALIFORNIA_RUNTIME_LINK_POLICY),runtimeLinkProof:californiaRuntimeLinkProofSchema.optional(),
}).strict();
export const californiaDisclosureChoiceAssessmentSchema=z.discriminatedUnion("policyVersion",[
  californiaDisclosureChoiceAssessmentV1Schema,californiaDisclosureChoiceAssessmentV2Schema,
]);
export type CaliforniaDisclosureChoiceAssessment = z.infer<typeof californiaDisclosureChoiceAssessmentSchema>;

/** New materialization only, after verified complete owned source text has been
 * joined by the projector. Never call on a historical read or a bare snapshot. */
export function assessCaliforniaDisclosureChoice(review:CaliforniaPrivacyReview, documents:CaliforniaPolicyDocument[]):CaliforniaDisclosureChoiceAssessment {
  const base={policyVersion:CALIFORNIA_DISCLOSURE_CHOICE_POLICY,scanId:review.scanId,documentUrl:review.documentUrl,sourceHash:review.sourceHash};
  if(review.contractVersion!=="certscore.california-privacy-review.v10" ||
      review.choiceSurface!=="not_observed_in_inspected_scope" || !review.disclosureInspection ||
      !review.reviewCoverage.captureCoverage.policyTextComplete || review.saleSharingAssessment?.choiceBasis!=="declared_sale_or_sharing")return base;
  const inspected=review.disclosureInspection.documents;
  if(documents.length!==inspected.length || inspected.some(source=>!documents.some(d=>d.evidenceRef===source.evidenceRef &&
      d.textSha256===source.textSha256 && d.text.length===source.inspectedChars)) ||
      californiaSignalDisclosureCandidateCount(documents.map(d=>d.text)))return base;
  const declaration=review.saleSharingAssessment.topics.filter(t=>["sale","cross_context_sharing"].includes(t.topic)&&t.status==="described")
    .flatMap(t=>t.passages).find(p=>isExplicitCaliforniaSaleSharingDeclaration(p.excerpt) && documents.some(d=>d.evidenceRef===p.evidenceRef &&
      d.textSha256===p.textSha256 && d.text.slice(p.start,p.end)===p.excerpt));
  return californiaDisclosureChoiceAssessmentSchema.parse({...base,...(declaration?{requiredLinkProof:{
    basis:"california_declaration_without_required_signal_disclosure.v1",signalDisclosureCandidateCount:0,declaration,documents:inspected}}:{})});
}
