import { z } from "zod";

export const choicePathInternalStatusSchema = z.enum([
  "confirmed_observation",
  "confirmed_clean",
  "confirmed",
  "unconfirmed",
  "not_attempted",
  "unsupported",
  "aborted",
]);

export const choicePathEvidenceDispositionSchema = z.object({
  disposition: z.enum(["confirmed", "indeterminate"]),
  reasonCode: z.string().min(1).max(160).nullable(),
}).strict();

const PRIORITY_LIMITATION_CODES = [
  "label_mismatch",
  "label_unverifiable",
  "redirect_target_not_authorized",
  "acceptance_registration_not_confirmed",
  "refusal_registration_not_confirmed",
  "deterministic_accept_control_not_actionable",
  "deterministic_reject_control_not_actionable",
  "verified_action_control_proof_missing",
] as const;

export function deriveChoicePathEvidenceDisposition(input: {
  status: z.infer<typeof choicePathInternalStatusSchema>;
  actionExercised: boolean;
  controlProofVerified: boolean;
  productionProjectable: boolean;
  limitations?: string[];
}) {
  const confirmed = (
    input.status === "confirmed" ||
    input.status === "confirmed_observation" ||
    input.status === "confirmed_clean"
  ) && input.actionExercised && input.controlProofVerified && input.productionProjectable;
  if (confirmed) {
    return choicePathEvidenceDispositionSchema.parse({
      disposition: "confirmed",
      reasonCode: null,
    });
  }
  const reasonCode = (!input.controlProofVerified && input.actionExercised
    ? "verified_action_control_proof_missing"
    : undefined) ?? PRIORITY_LIMITATION_CODES.find((code) =>
    input.limitations?.some((limitation) =>
      limitation === code || limitation.startsWith(`${code}:`)
    )
  ) ?? input.status;
  return choicePathEvidenceDispositionSchema.parse({
    disposition: "indeterminate",
    reasonCode,
  });
}

export type ChoicePathEvidenceDisposition = z.infer<typeof choicePathEvidenceDispositionSchema>;
