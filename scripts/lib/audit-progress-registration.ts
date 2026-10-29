import { afterActionCaptureSchema } from "../../packages/certscore-contracts/src/after-action-capture";
import { terminalConsentDecisionBound, terminalConsentDecisionSchema } from "../../packages/certscore-contracts/src/terminal-consent-decision";

/** Semantic registration is distinct from the operational execution decision. */
export function semanticRegistrationStatus(observation: Record<string, any>): string {
  const status = observation.registrationStatus ?? observation.status;
  if (["confirmed", "unconfirmed", "aborted"].includes(status)) return status;
  // These documented legacy result statuses require initial registration.
  if (status === "confirmed_clean" || status === "confirmed_observation") return "confirmed";
  return "not_checked";
}

/** Only a retained, source-bound terminal witness can establish this metric. */
export function terminalDecisionStatus(projection: Record<string, any>, action: "accept" | "reject"): string {
  if (projection.terminalDecisionEvidence === undefined) return "not_checked";
  const decision = terminalConsentDecisionSchema.safeParse(projection.terminalDecisionEvidence);
  const capture = afterActionCaptureSchema.safeParse(projection.afterActionCapture);
  return decision.success && capture.success && terminalConsentDecisionBound(
    decision.data, capture.data, projection.actionControlProof, action,
  ) ? "verified" : "unverified";
}
