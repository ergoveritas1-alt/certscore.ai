import { z } from "zod";

export const CONSENT_ACTION_CONFIRMATION_POLICY = "semantic_consent_registration.v2" as const;

/** Shared writer/packet/projection bound. Pre-action capture remains at 96;
 * additional capacity is reserved for directly observed post-click requests.
 * This does not change capture windows or make overflow complete.
 */
export const CONSENT_ACTION_POST_CLICK_REQUEST_LIMIT = 192;

const oneTrustGroupId = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const oneTrustGroupEvidenceSchema = z.object({
  policyVersion: z.literal("onetrust_cookie_groups.v1"),
  cookieIdentitySha256: sha256,
  beforeValueSha256: sha256,
  afterValueSha256: sha256,
  configurationSha256: sha256,
  baselineGroupIds: z.array(oneTrustGroupId).min(1).max(64),
  configuredGroupIds: z.array(oneTrustGroupId).min(1).max(64),
  groups: z.array(z.object({ id: oneTrustGroupId, alwaysActive: z.boolean(), consent: z.boolean() }).strict()).min(1).max(64),
}).strict().superRefine((proof, context) => {
  if (proof.beforeValueSha256 === proof.afterValueSha256 ||
    new Set(proof.baselineGroupIds).size !== proof.baselineGroupIds.length ||
    new Set(proof.configuredGroupIds).size !== proof.configuredGroupIds.length ||
    proof.configuredGroupIds.length !== proof.baselineGroupIds.length ||
    proof.baselineGroupIds.some((id) => !proof.configuredGroupIds.includes(id)) ||
    new Set(proof.groups.map((group) => group.id)).size !== proof.groups.length ||
    proof.groups.length !== proof.baselineGroupIds.length ||
    proof.groups.some((group) => !proof.baselineGroupIds.includes(group.id) || (group.alwaysActive && !group.consent)) ||
    !proof.groups.some((group) => !group.alwaysActive)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "OneTrust decisions require fresh cookie state and complete stable group identities." });
  }
});
export type OneTrustGroupEvidence = z.infer<typeof oneTrustGroupEvidenceSchema>;

/** A dispatched control and a registered decision are separate observed facts. */
export const consentDecisionEvidenceSchema = z.object({
  policyVersion: z.literal(CONSENT_ACTION_CONFIRMATION_POLICY),
  decision: z.enum(["granted", "denied", "mixed", "unknown"]),
  basis: z.enum(["verified_state", "unverified"]),
  observedStateSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  observedAtMs: z.number().int().nonnegative().optional(),
  timestampBasis: z.enum(["instrumented_state_write", "verified_state_observed"]).optional(),
  tcfPurposeEvidence: z.object({
    policyVersion: z.literal("iab_tcf_sparse_purposes.v1"),
    tcfPolicyVersion: z.union([z.literal(4), z.literal(5)]),
    cmpId: z.number().int().min(1).max(4095),
    cmpVersion: z.number().int().min(1).max(4095),
    explicitPurposeIds: z.array(z.number().int().min(1).max(24)).max(24).refine((ids) => new Set(ids).size === ids.length),
  }).strict().optional(),
  tcfApiSource: z.enum(["addEventListener", "getTCData"]).optional(),
  oneTrustGroupEvidence: oneTrustGroupEvidenceSchema.optional(),
}).strict().superRefine((evidence, context) => {
  if (evidence.basis === "verified_state" && (!evidence.observedStateSha256 || evidence.observedAtMs === undefined || !evidence.timestampBasis)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Verified decisions require a retained state hash and timestamp provenance." });
  }
  if (evidence.basis === "unverified" && evidence.decision !== "unknown") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "An unverified state cannot claim a decoded decision." });
  }
  if (evidence.tcfPurposeEvidence && (evidence.basis !== "verified_state" || !evidence.tcfApiSource || evidence.oneTrustGroupEvidence)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "TCF purpose encoding requires verified API-source provenance." });
  }
  if (evidence.oneTrustGroupEvidence) {
    const proof = evidence.oneTrustGroupEvidence;
    const optional = proof.groups.filter((group) => !group.alwaysActive);
    const decision = optional.every((group) => group.consent) ? "granted"
      : optional.every((group) => !group.consent) ? "denied" : "mixed";
    if (evidence.basis !== "verified_state" || evidence.tcfApiSource ||
      evidence.observedStateSha256 !== proof.afterValueSha256 || evidence.decision !== decision) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "OneTrust decision must match its retained cookie/configuration proof." });
    }
  }
});

export const actionCaptureCoverageSchema = z.object({
  requestsDroppedBeforeAction: z.number().int().nonnegative(),
  requestsDroppedAfterAction: z.number().int().nonnegative(),
}).strict();

// Legacy packets remain readable. A UI transition or an opaque receipt change
// is not semantic proof, regardless of a legacy writer's "confirmed" label.
export function hasSemanticConsentWitness(witnesses: Array<{
  witnessType: string;
  expectedState?: string;
  corroboratingOnly: boolean;
}>) {
  return witnesses.some((witness) => !witness.corroboratingOnly &&
    witness.witnessType !== "banner_transition" &&
    witness.expectedState !== "canonical_consent_refusal_state_written_after_action" &&
    !witness.expectedState?.includes("consent_surface") &&
    !witness.expectedState?.includes("consent_state_changed_after_"));
}

export type ConsentDecisionEvidence = z.infer<typeof consentDecisionEvidenceSchema>;
