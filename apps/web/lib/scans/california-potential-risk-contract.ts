import {z} from "zod";

export const CA_POTENTIAL_RISK_FINDING = "california_collection_review";
export const CA_POTENTIAL_RISK_LEGACY_POLICY = "california.collection-review.v1";
export const CA_POTENTIAL_RISK_PRIOR_POLICY = "california.collection-review.v2";
export const CA_POTENTIAL_RISK_POLICY = "california.collection-review.v3-retained-scope";
const rowSchema = z.object({
  evidenceId:z.string().min(1).max(160),entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),entity:z.string().min(1).max(200),
  msFromAnchor:z.number().int().nonnegative(),purpose:z.enum(["analytics","advertising","marketing","session_replay"]),
  processingSignals:z.array(z.string().max(80)).max(12),
  treatment:z.enum(["potential_risk","qualified_collection","declared_restriction"]),
}).strict();
export const californiaPotentialRiskSchema=z.object({
  policyVersion:z.enum([CA_POTENTIAL_RISK_LEGACY_POLICY,CA_POTENTIAL_RISK_PRIOR_POLICY,CA_POTENTIAL_RISK_POLICY]),path:z.enum(["gpc","reject"]),scanId:z.string().min(1),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(rowSchema).max(32),
  responseUnverified:z.number().int().nonnegative(),
  legalConclusion:z.literal("not_established"),
}).strict().superRefine((a,ctx)=>{
  if(new Set(a.rows.map(r=>r.evidenceId)).size!==a.rows.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate collection review evidence"});
});
export type CaliforniaPotentialRiskAssessment=z.infer<typeof californiaPotentialRiskSchema>;
