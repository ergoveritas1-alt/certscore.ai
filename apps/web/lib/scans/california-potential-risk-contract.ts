import {rejectIdentifierWitnessSchema} from "@certscore/contracts";
import {z} from "zod";

export const CA_POTENTIAL_RISK_FINDING = "california_collection_review";
export const CA_POTENTIAL_RISK_LEGACY_POLICY = "california.collection-review.v1";
export const CA_POTENTIAL_RISK_PRIOR_POLICY = "california.collection-review.v2";
export const CA_RETAINED_SCOPE_RISK_POLICY = "california.collection-review.v3-retained-scope";
export const CA_POTENTIAL_RISK_POLICY = "california.collection-review.v4-google-page-view";
export const CA_IDENTIFIER_RISK_POLICY = "california.collection-review.v5-reject-identifier";
export const CA_PER_VISIT_RISK_POLICY = "california.collection-review.v6-per-visit";
const rowSchema = z.object({
  evidenceId:z.string().min(1).max(160),entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),entity:z.string().min(1).max(200),
  msFromAnchor:z.number().int().nonnegative(),purpose:z.enum(["analytics","advertising","marketing","session_replay"]),
  processingSignals:z.array(z.string().max(80)).max(12),
  treatment:z.enum(["potential_risk","qualified_collection","declared_restriction"]),
}).strict();
export const californiaPotentialRiskSchema=z.object({
  policyVersion:z.enum([CA_POTENTIAL_RISK_LEGACY_POLICY,CA_POTENTIAL_RISK_PRIOR_POLICY,CA_RETAINED_SCOPE_RISK_POLICY,CA_POTENTIAL_RISK_POLICY,CA_IDENTIFIER_RISK_POLICY,CA_PER_VISIT_RISK_POLICY]),path:z.enum(["gpc","reject"]),scanId:z.string().min(1),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(rowSchema).max(32),
  identifierTransmission:z.union([rejectIdentifierWitnessSchema,rejectIdentifierWitnessSchema.omit({graphSha256:true,requestNodeId:true}).extend({
    basis:z.literal("bound_measurement_parameter"),
  }).strict()]).optional(),
  responseUnverified:z.number().int().nonnegative(),
  legalConclusion:z.literal("not_established"),
}).strict().superRefine((a,ctx)=>{
  const sent=a.identifierTransmission;
  if (sent && (a.path!=="reject" || (a.policyVersion!==CA_IDENTIFIER_RISK_POLICY && a.policyVersion!==CA_PER_VISIT_RISK_POLICY) || sent.packetSha256!==a.sourceSha256 ||
    a.rows.some(r=>r.evidenceId===sent.requestId))) ctx.addIssue({code:"custom",message:"Identifier evidence must be independent and bound to the Reject packet."});
  if(new Set(a.rows.map(r=>r.evidenceId)).size!==a.rows.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate collection review evidence"});
});
export type CaliforniaPotentialRiskAssessment=z.infer<typeof californiaPotentialRiskSchema>;
