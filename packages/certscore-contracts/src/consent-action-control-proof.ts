import { z } from "zod";
import { SUPPORTED_PRIVACY_EVIDENCE_LOCALES } from "./supported-languages";

const consentActionControlLocaleSchema = z.enum(SUPPORTED_PRIVACY_EVIDENCE_LOCALES);
const consentActionControlMatchStrengthSchema = z.enum([
  "direct",
  "equivalent",
  "contextual",
  "weak",
]);

export const CONSENT_ACTION_CONTROL_PROOF_VERSION =
  "certscore.consent_action_control_proof.v1" as const;

export const consentActionControlProofSchema = z.object({
  contractVersion: z.literal(CONSENT_ACTION_CONTROL_PROOF_VERSION),
  action: z.enum(["accept", "reject"]),
  observedAtMs: z.number().int().nonnegative(),
  accessibleLabel: z.string().min(1).max(160),
  labelSource: z.enum([
    "aria_label",
    "visible_text",
    "value",
    "title",
    "accessibility_tree",
  ]),
  actionSemantics: z.enum(["direct_label", "canonical_necessary_only_recipe"]),
  classifierIntent: z.enum(["accept", "reject", "options", "privacy_opt_out", "unknown"]),
  classifierConfidence: z.number().min(0).max(1),
  matchedLocale: consentActionControlLocaleSchema.optional(),
  matchStrength: consentActionControlMatchStrengthSchema.optional(),
  classifierReasonCodes: z.array(z.string().min(1).max(80)).max(16).default([]),
  cmpId: z.string().min(1).max(120).optional(),
  recipeId: z.string().min(1).max(160),
  selectorHint: z.string().min(1).max(500),
  frameIdentitySha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorizedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  visible: z.literal(true),
  enabled: z.literal(true),
  uniquelyActionable: z.literal(true),
}).strict().superRefine((proof, context) => {
  if (
    proof.actionSemantics === "direct_label" &&
    (proof.classifierIntent !== proof.action || proof.classifierConfidence < 0.8)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Direct action-control proof must classify to the dispatched action.",
      path: ["classifierIntent"],
    });
  }
  if (proof.actionSemantics === "canonical_necessary_only_recipe" && proof.action !== "reject") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A canonical necessary-only action may verify only a Reject-equivalent action.",
      path: ["actionSemantics"],
    });
  }
});

export type ConsentActionControlProof = z.infer<typeof consentActionControlProofSchema>;
