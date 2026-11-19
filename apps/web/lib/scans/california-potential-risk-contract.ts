import {rejectIdentifierWitnessSchema} from "@certscore/contracts";
import {z} from "zod";

export const CA_POTENTIAL_RISK_FINDING = "california_collection_review";
export const CA_POTENTIAL_RISK_LEGACY_POLICY = "california.collection-review.v1";
export const CA_POTENTIAL_RISK_PRIOR_POLICY = "california.collection-review.v2";
export const CA_RETAINED_SCOPE_RISK_POLICY = "california.collection-review.v3-retained-scope";
export const CA_POTENTIAL_RISK_POLICY = "california.collection-review.v4-google-page-view";
export const CA_IDENTIFIER_RISK_POLICY = "california.collection-review.v5-reject-identifier";
export const CA_PER_VISIT_RISK_POLICY = "california.collection-review.v6-per-visit";
export const CA_PRESENCE_RISK_POLICY = "california.collection-review.v7-presence";
export const CA_VERIFIED_COLLECTION_POLICY = "california.collection-review.v8-verified-event";
export function supportsPresence(version: string | undefined) {
  return version === CA_PRESENCE_RISK_POLICY || version === CA_VERIFIED_COLLECTION_POLICY;
}
export const presencePurposeSchema=z.enum(["analytics","advertising","marketing","session_replay","personalization",
  "performance_monitoring","customer_support","tag_management","consent_management","infrastructure","security"]);
const rowSchema = z.object({
  evidenceId:z.string().min(1).max(160),entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),entity:z.string().min(1).max(200),
  msFromAnchor:z.number().int().nonnegative(),purpose:presencePurposeSchema,
  verifiedCollection:z.literal(true).optional(),
  presenceBasis:z.enum(["cookie_snapshot","service_request"]).optional(),
  processingSignals:z.array(z.string().max(80)).max(12),
  treatment:z.enum(["potential_risk","qualified_collection","declared_restriction"]),
}).strict();
export const californiaPotentialRiskSchema=z.object({
  policyVersion:z.enum([CA_POTENTIAL_RISK_LEGACY_POLICY,CA_POTENTIAL_RISK_PRIOR_POLICY,CA_RETAINED_SCOPE_RISK_POLICY,CA_POTENTIAL_RISK_POLICY,CA_IDENTIFIER_RISK_POLICY,CA_PER_VISIT_RISK_POLICY,CA_PRESENCE_RISK_POLICY,CA_VERIFIED_COLLECTION_POLICY]),path:z.enum(["gpc","reject"]),scanId:z.string().min(1),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),rows:z.array(rowSchema).max(32),
  identifierTransmission:z.union([rejectIdentifierWitnessSchema,rejectIdentifierWitnessSchema.omit({graphSha256:true,requestNodeId:true}).extend({
    basis:z.literal("bound_measurement_parameter"),
  }).strict()]).optional(),
  responseUnverified:z.number().int().nonnegative(),
  legalConclusion:z.literal("not_established"),
}).strict().superRefine((a,ctx)=>{
  if(a.rows.some(r=>r.presenceBasis && (!supportsPresence(a.policyVersion) || r.treatment==="qualified_collection"))) ctx.addIssue({code:"custom",message:"Presence supports only the current partial tier."});
  if(a.rows.some(r=>!r.presenceBasis && !["analytics","advertising","marketing","session_replay"].includes(r.purpose)))
    ctx.addIssue({code:"custom",message:"Collection rows require a supported collection purpose."});
  if (a.rows.some(r=>r.verifiedCollection && (a.policyVersion !== CA_VERIFIED_COLLECTION_POLICY || r.presenceBasis || r.treatment !== "potential_risk")))
    ctx.addIssue({code:"custom",message:"Verified collection requires eligible event evidence under the verified-event policy."});
  const sent=a.identifierTransmission;
  if (sent && (a.path!=="reject" || (a.policyVersion!==CA_IDENTIFIER_RISK_POLICY && a.policyVersion!==CA_PER_VISIT_RISK_POLICY && !supportsPresence(a.policyVersion)) || sent.packetSha256!==a.sourceSha256 ||
    a.rows.some(r=>r.evidenceId===sent.requestId))) ctx.addIssue({code:"custom",message:"Identifier evidence must be independent and bound to the Reject packet."});
  if(new Set(a.rows.map(r=>r.evidenceId)).size!==a.rows.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate collection review evidence"});
});
export type CaliforniaPotentialRiskAssessment=z.infer<typeof californiaPotentialRiskSchema>;
