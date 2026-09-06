import { z } from "zod";

export const CONSENT_ACTION_CONFIRMATION_POLICY = "semantic_consent_registration.v2" as const;

/** A dispatched control and a registered decision are separate observed facts. */
export const consentDecisionEvidenceSchema = z.object({
  policyVersion: z.literal(CONSENT_ACTION_CONFIRMATION_POLICY),
  decision: z.enum(["granted", "denied", "mixed", "unknown"]),
  basis: z.enum(["verified_state", "unverified"]),
  observedStateSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  observedAtMs: z.number().int().nonnegative().optional(),
  timestampBasis: z.enum(["instrumented_state_write", "verified_state_observed"]).optional(),
}).strict().superRefine((evidence, context) => {
  if (evidence.basis === "verified_state" && (!evidence.observedStateSha256 || evidence.observedAtMs === undefined || !evidence.timestampBasis)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Verified decisions require a retained state hash and timestamp provenance." });
  }
  if (evidence.basis === "unverified" && evidence.decision !== "unknown") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "An unverified state cannot claim a decoded decision." });
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
