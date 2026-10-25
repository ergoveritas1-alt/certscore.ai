import {isCaliforniaRuntimeLinkPolicy} from "./california-disclosure-choice-assessment";
import {z} from "zod";
import {californiaPassageSchema} from "./california-clause-assessment";

export const FRICTIONLESS_GPC_FINDING_ID="california_frictionless_gpc_exception";
export const FRICTIONLESS_GPC_DISCLOSURES=["opt_out_right","frictionless_processing","signal_setup","other_request_methods"] as const;
export const FRICTIONLESS_GPC_UNVERIFIED_REQUIREMENTS=["signal_processing","no_fee_or_consideration","equivalent_experience","no_signal_triggered_interstitial","full_sale_sharing_scope"] as const;
export const frictionlessGpcContradictionSchema=z.object({
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),sessionSha256:z.string().regex(/^[a-f0-9]{64}$/),documentUrlSha256:z.string().regex(/^[a-f0-9]{64}$/),
  qualifierVersion:z.literal("california-gpc-response.v10-property-bound"),
  requests:z.array(z.object({evidenceId:z.string().min(1).max(240),entityId:z.string().regex(/^ent_[a-f0-9]{12}$/)}).strict()).min(1).max(4),
}).strict().superRefine((row,ctx)=>{if(new Set(row.requests.map(r=>r.evidenceId)).size!==row.requests.length)ctx.addIssue({code:"custom",message:"Exception contradiction requests must be unique."});});
export const frictionlessGpcExceptionSchema=z.object({
  version:z.literal("frictionless_gpc_exception.v1"),
  scanId:z.string().min(1).max(160),documentUrl:z.string().url().max(800),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  scope:z.literal("retained_website_evidence"),
  // Existing capture cannot prove fees, equivalent experience or offline scope.
  // This version deliberately has no supported-exception or compliance state.
  status:z.enum(["unresolved","contradicted_in_assessed_scope"]),
  basis:z.enum(["insufficient_evidence","required_signal_disclosures_missing","qualifying_collection_under_gpc"]),
  gpcContradiction:frictionlessGpcContradictionSchema.optional(),
  disclosures:z.array(z.object({
    id:z.enum(FRICTIONLESS_GPC_DISCLOSURES),status:z.enum(["declared","not_established"]),
    passage:californiaPassageSchema.optional(),
  }).strict()).length(4),
  unverifiedRequirements:z.tuple([z.literal("signal_processing"),z.literal("no_fee_or_consideration"),z.literal("equivalent_experience"),z.literal("no_signal_triggered_interstitial"),z.literal("full_sale_sharing_scope")]),
}).strict().superRefine((row,ctx)=>{
  if(new TextEncoder().encode(JSON.stringify(row)).length>4096)ctx.addIssue({code:"custom",message:"Frictionless assessment exceeds its 4 KiB cap."});
  if((row.basis==="qualifying_collection_under_gpc")!==Boolean(row.gpcContradiction)||
     (row.status==="unresolved")!==(row.basis==="insufficient_evidence")||
     row.disclosures.some((d,i)=>d.id!==FRICTIONLESS_GPC_DISCLOSURES[i]||(d.status==="declared")!==Boolean(d.passage)||
       d.passage&&!isFrictionlessDisclosure(d.id,d.passage.excerpt)))
    ctx.addIssue({code:"custom",message:"Exception state and declarations must retain their exact evidence meaning."});
});
export type FrictionlessGpcException=z.infer<typeof frictionlessGpcExceptionSchema>;

/** Positive policy declarations only. Neither these matches nor their absence
 * verifies behavior, completeness, or eligibility for the statutory exception. */
export function isFrictionlessDisclosure(id:typeof FRICTIONLESS_GPC_DISCLOSURES[number],text:string){
  if(text.trim().endsWith("?"))return false;
  if(/\b(?:not|never|cannot|unable|unless|except|if|may|might|could|recommend|example|hypothetical)\b/i.test(text))return false;
  const signal=/\b(?:GPC|Global Privacy Control|opt[ -]out preference signals?)\b/i.test(text);
  switch(id){
    case "opt_out_right":return /\b(?:right to|can) opt[ -]out\b/i.test(text)&&/\b(?:sale|sell|sharing|share)\b/i.test(text);
    case "frictionless_processing":return signal&&/^(?:we (?:process|honou?r|respect)|our (?:business|company) (?:processes|honou?rs|respects))\b/i.test(text)&&/\bfrictionless(?:ly)?\b/i.test(text);
    case "signal_setup":return signal&&/\b(?:enable|activate|turn on|install|configure)\b/i.test(text);
    case "other_request_methods":return /\b(?:sale|sell|sharing|share)\b/i.test(text)&&/\b(?:request|contact|submit|email|call)\b/i.test(text)&&/\b(?:email|telephone|phone|form|portal|call)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text);
  }
}


/** Historical packets retain their original eligibility. New materializations
 * must carry an assessment consistent with the independently bound link proof. */
export function frictionlessGpcLinkEvidenceConsistent(review:{frictionlessGpcException?:FrictionlessGpcException;disclosureChoiceAssessment?:{requiredLinkProof?:unknown;policyVersion:string;runtimeLinkProof?:unknown}}){
  const a=review.frictionlessGpcException;if(!a)return true;
  const choice=review.disclosureChoiceAssessment;
  const expected=a.gpcContradiction || choice&&isCaliforniaRuntimeLinkPolicy(choice.policyVersion)&&choice.runtimeLinkProof
    ? "qualifying_collection_under_gpc" : choice?.requiredLinkProof ? "required_signal_disclosures_missing" : "insufficient_evidence";
  return a.basis===expected && a.status===(expected==="insufficient_evidence"?"unresolved":"contradicted_in_assessed_scope");
}

/** Compact finding projection; the parent assessment remains the audit source. */
export const frictionlessGpcProjectionSchema=z.object({
  assessment:frictionlessGpcExceptionSchema,
  sources:z.array(z.object({evidenceRef:z.string().min(1).max(240),url:z.string().url().max(800).refine(value=>{
    const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash;
  }),sha256:z.string().regex(/^[a-f0-9]{64}$/),complete:z.boolean()}).strict()).max(8),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.sources.map(s=>s.evidenceRef)).size!==row.sources.length||row.assessment.disclosures.some(d=>d.passage&&!row.sources.some(s=>s.evidenceRef===d.passage!.evidenceRef&&s.sha256===d.passage!.textSha256)))
    ctx.addIssue({code:'custom',message:'Declared exception evidence must retain its original source reference.'});
});
export type FrictionlessGpcProjection=z.infer<typeof frictionlessGpcProjectionSchema>;
