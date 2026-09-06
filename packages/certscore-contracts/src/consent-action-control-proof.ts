import { z } from "zod";
import { SUPPORTED_PRIVACY_EVIDENCE_LOCALES } from "./supported-languages";
import { classifyConsentControlLabel, normalizeConsentControlText } from "./consent-control-label-classifier";

const consentActionControlLocaleSchema = z.enum(SUPPORTED_PRIVACY_EVIDENCE_LOCALES);
const consentActionControlMatchStrengthSchema = z.enum([
  "direct",
  "equivalent",
  "contextual",
  "weak",
]);

export const CONSENT_ACTION_CONTROL_PROOF_VERSION =
  "certscore.consent_action_control_proof.v2" as const;

export const REGISTERED_CONTEXTUAL_ACCEPT_POLICY = "registered_contextual_accept.v1" as const;

/** Does not lower the ordinary direct-label action threshold. A reviewed named
 * recipe must separately prove the exact label and its live first-layer scope. */
export function isRegisteredContextualAcceptLabel(label: string, expectedNormalizedLabel: string) {
  const classification = classifyConsentControlLabel({ label, hasConsentContext: true });
  return normalizeConsentControlText(label) === expectedNormalizedLabel &&
    classification.intent === "accept" && classification.matchStrength === "contextual" &&
    classification.variant === "approval_acknowledgment" && classification.contextSatisfied;
}

export const consentActionControlProofSchema = z.object({
  contractVersion: z.enum(["certscore.consent_action_control_proof.v1", CONSENT_ACTION_CONTROL_PROOF_VERSION]),
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
  actionSemantics: z.enum(["direct_label", "canonical_necessary_only_recipe", "registered_contextual_accept"]),
  contextualApproval: z.object({
    policyVersion: z.literal(REGISTERED_CONTEXTUAL_ACCEPT_POLICY),
    bannerSelector: z.string().min(1).max(500),
    expectedNormalizedLabel: z.string().min(1).max(160),
  }).strict().optional(),
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
  if (proof.actionSemantics === "registered_contextual_accept") {
    const classification = classifyConsentControlLabel({ label: proof.accessibleLabel, hasConsentContext: true });
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "accept" ||
      proof.classifierIntent !== "accept" || proof.matchStrength !== "contextual" ||
      proof.classifierConfidence !== classification.confidence || !proof.contextualApproval ||
      !proof.cmpId || !proof.frameIdentitySha256 || !proof.authorizedTargetSha256 ||
      !isRegisteredContextualAcceptLabel(proof.accessibleLabel, proof.contextualApproval.expectedNormalizedLabel)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contextualApproval"],
        message: "Contextual activation requires v2 named, scope-bound canonical approval proof; it is not a consent decision." });
    }
  } else if (proof.contextualApproval) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contextualApproval"],
      message: "Contextual approval metadata belongs only to contextual activation proof." });
  }
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
