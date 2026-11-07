import { registeredObservationCompletionSchema, choicePathExecutionSchema } from "../../packages/certscore-contracts/src/choice-path-execution";
import { retainedActionTimingSchema } from "../../packages/certscore-contracts/src/retained-action-timing";
import { afterActionCaptureSchema } from "../../packages/certscore-contracts/src/after-action-capture";
import { registeredTerminalWindow, terminalConsentDecisionBound, terminalConsentDecisionSchema } from "../../packages/certscore-contracts/src/terminal-consent-decision";

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
  if (!decision.success) return "unverified";
  if (decision.data.policyVersion === "bounded_registered_terminal_consent_decision.v1") {
    const timing = retainedActionTimingSchema.safeParse(projection.retainedActionTiming);
    const completion = registeredObservationCompletionSchema.safeParse(projection.registeredObservationCompletion);
    const execution = choicePathExecutionSchema.safeParse(projection.execution);
    if (!timing.success || !completion.success || !execution.success ||
      !execution.data.observationCompleted || !execution.data.consentConfirmed ||
      !/^[a-f0-9]{64}$/.test(projection.packetSha256 ?? "")) return "unverified";
    return terminalConsentDecisionBound(decision.data, undefined, projection.actionControlProof, action,
      registeredTerminalWindow({retainedActionTiming: timing.data, registeredObservationCompletion: completion.data}))
      ? "verified" : "unverified";
  }
  const capture = afterActionCaptureSchema.safeParse(projection.afterActionCapture);
  return capture.success && terminalConsentDecisionBound(
    decision.data, capture.data, projection.actionControlProof, action,
  ) ? "verified" : "unverified";
}
