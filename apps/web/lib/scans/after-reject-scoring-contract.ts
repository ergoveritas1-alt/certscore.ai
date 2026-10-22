import { z } from "zod";
import { POST_REJECT_SCORING_TIERS, postRejectEntityPoints } from "./scoring-policy";

export const PRIOR_REJECT_PRESENCE_POLICY = "after_reject_nonessential_presence.v1" as const;
export const AFTER_REJECT_SCORING_POLICY = "after_reject_nonessential_presence.v2-vendor-coverage" as const;
export const REGISTRATION_INDEPENDENT_AFTER_REJECT_SCORING_POLICY = "after_reject_measurement_tiers.v2" as const;
export const LEGACY_AFTER_REJECT_SCORING_POLICY = "after_reject_measurement_tiers.v1" as const;
export function isRejectPresencePolicy(value:unknown):boolean {
 return value===AFTER_REJECT_SCORING_POLICY||value===PRIOR_REJECT_PRESENCE_POLICY;
}
export const afterRejectScoringAssessmentSchema = z.object({
  policyVersion: z.enum([AFTER_REJECT_SCORING_POLICY, PRIOR_REJECT_PRESENCE_POLICY, REGISTRATION_INDEPENDENT_AFTER_REJECT_SCORING_POLICY, LEGACY_AFTER_REJECT_SCORING_POLICY]),
  cookieRefs: z.array(z.object({name:z.string().max(180),hostname:z.string().max(255).optional(),
    identityHash:z.string().regex(/^[a-f0-9]{64}$/).optional(),valueHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(96).optional(),
  entityEvidence: z.object({resolverVersion:z.string().max(160),
    entities:z.array(z.object({entityId:z.string().regex(/^ent_[a-f0-9]{12}$/),entity:z.string().max(255),vendor:z.string().max(160)}).strict()).max(288),
    observations:z.array(z.object({kind:z.enum(["cookie_snapshot","service_request"]),evidenceRef:z.string().max(600),
      name:z.string().max(500),hostname:z.string().max(255).optional(),purpose:z.string().max(80),msAfterClick:z.number().int().nonnegative(),
      entityId:z.string().regex(/^ent_[a-f0-9]{12}$/).optional(),entity:z.string().max(255).optional(),vendor:z.string().max(160).optional()}).strict()).max(288),
  }).strict().optional(),
  sourcePacketSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  registration: z.enum(["confirmed", "unconfirmed", "unknown"]),
  tier: z.enum(["high_risk", "measurement", "performance_only", "review"]),
  deductionPoints: z.union([z.literal(0), z.literal(5), z.literal(15), z.literal(20), z.literal(23), z.literal(25), z.literal(27), z.literal(28), z.literal(29), z.literal(30)]),
  requestIds: z.array(z.string().min(1).max(120)).max(192),
  reasons: z.array(z.enum(["verified_optional_activity", "verified_contradiction", "storage_denied_measurement",
    "verified_performance_only", "registration_unconfirmed", "source_proof_incomplete", "purpose_or_identifier_unverified",
    "storage_coverage_incomplete", "no_eligible_activity", "verified_reject_click", "nonessential_cookies_after_reject", "nonessential_services_after_reject"])).min(1).max(14),
}).strict().superRefine((value, ctx) => {
  const current=[AFTER_REJECT_SCORING_POLICY,PRIOR_REJECT_PRESENCE_POLICY].some(v=>v===value.policyVersion);
  const entities=value.entityEvidence?.entities??[], observations=value.entityEvidence?.observations??[];
  const expected=current?postRejectEntityPoints(entities.map(row=>row.entityId),value.tier==="high_risk"):POST_REJECT_SCORING_TIERS[value.tier];
  if (value.deductionPoints !== expected ||
    current && value.tier==="review" && (value.deductionPoints!==0 || observations.length>0) ||
    current && (!value.entityEvidence || new Set(entities.map(row=>row.entityId)).size!==entities.length ||
      observations.length!==(value.cookieRefs?.length??0)+value.requestIds.length ||
      observations.filter(row=>row.kind==="cookie_snapshot").length!==(value.cookieRefs?.length??0) ||
      observations.filter(row=>row.kind==="service_request").some(row=>row.msAfterClick<=0 || !value.requestIds.some(id=>row.evidenceRef===`request:${id}`)) ||
      entities.some(entity=>!observations.some(row=>row.entityId===entity.entityId)) ||
      observations.some(row=>row.entityId ? !entities.some(entity=>entity.entityId===row.entityId && entity.entity===row.entity) : !!row.entity || !!row.vendor)) ||
    !current && value.entityEvidence!==undefined ||
    value.policyVersion === LEGACY_AFTER_REJECT_SCORING_POLICY && value.reasons.includes("verified_reject_click") ||
    value.tier !== "review" && (!value.sourcePacketSha256 ||
      value.registration !== "confirmed" && !(value.policyVersion !== LEGACY_AFTER_REJECT_SCORING_POLICY && value.registration === "unconfirmed" && value.reasons.includes("verified_reject_click") &&
        (value.requestIds.length > 0 || current && !!value.cookieRefs?.length))) ||
    value.tier === "high_risk" && !value.reasons.some(reason => ["verified_optional_activity", "verified_contradiction"].includes(reason)) ||
    value.tier === "measurement" && !value.reasons.includes("storage_denied_measurement") ||
    value.tier === "performance_only" && !value.reasons.includes("verified_performance_only") ||
    current && (value.cookieRefs===undefined || !["high_risk","review"].includes(value.tier)) ||
    current && value.tier==="high_risk" &&
      !value.reasons.includes("verified_contradiction") && !value.cookieRefs?.length && value.requestIds.length===0 ||
    !current && value.cookieRefs!==undefined ||
    new Set(value.requestIds).size !== value.requestIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "After-Reject tier must retain its matching evidence and approved deduction." });
  }
});
export type AfterRejectScoringAssessment = z.infer<typeof afterRejectScoringAssessmentSchema>;
export function readAfterRejectScoringAssessment(value: unknown): AfterRejectScoringAssessment | null {
  const parsed = afterRejectScoringAssessmentSchema.safeParse(value); return parsed.success ? parsed.data : null;
}
