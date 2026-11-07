import { z } from "zod";
import { consentDecisionEvidenceSchema } from "./consent-action-evidence-policy";
import type { AfterActionCapture } from "./after-action-capture";

/** Late decision proof is operational evidence. It never backdates the initial
 * registration protocol or makes after-click facts post-registration facts. */
export const terminalConsentDecisionSchema = z.object({
  policyVersion: z.enum(["bounded_terminal_consent_decision.v1", "bounded_registered_terminal_consent_decision.v1"]),
  action: z.enum(["accept", "reject"]),
  authorizedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  readStartedAtMs: z.number().int().nonnegative(),
  readCompletedAtMs: z.number().int().nonnegative(),
  evidence: consentDecisionEvidenceSchema,
}).strict().superRefine((value, context) => {
  if (value.evidence.basis !== "verified_state" ||
    value.evidence.decision !== (value.action === "accept" ? "granted" : "denied") ||
    value.readCompletedAtMs < value.readStartedAtMs ||
    value.evidence.observedAtMs === undefined || value.evidence.observedAtMs > value.readCompletedAtMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Terminal proof requires a matching verified decision and retained read timing." });
  }
});
export type TerminalConsentDecision = z.infer<typeof terminalConsentDecisionSchema>;

export type RegisteredTerminalWindow = {
  action: "accept" | "reject";
  dispatchedAtMs: number;
  startedAtMs: number;
  requiredWindowMs: number;
  endedAtMs: number;
};

export function terminalConsentDecisionBound(value: TerminalConsentDecision, capture: AfterActionCapture | undefined,
  proof: { action: string; authorizedTargetSha256?: string } | undefined, action: "accept" | "reject", registered?: RegisteredTerminalWindow) {
  if (value.policyVersion === "bounded_registered_terminal_consent_decision.v1") {
    if (!registered || registered.action !== action || value.action !== action || proof?.action !== action ||
      proof.authorizedTargetSha256 !== value.authorizedTargetSha256 || registered.dispatchedAtMs > registered.startedAtMs) return false;
    if (![registered.dispatchedAtMs, registered.startedAtMs, registered.endedAtMs, registered.requiredWindowMs]
      .every(value => Number.isSafeInteger(value) && value >= 0)) return false;
    const deadline = registered.startedAtMs + registered.requiredWindowMs;
    return Number.isSafeInteger(deadline) && registered.requiredWindowMs > 0 && registered.endedAtMs >= deadline &&
      value.readStartedAtMs >= Math.max(registered.startedAtMs, deadline - 250) &&
      value.readCompletedAtMs <= deadline && value.evidence.observedAtMs! >= registered.dispatchedAtMs;
  }
  return capture?.action === action && capture.activationStatus === "completed" && capture.stopReason === "window_elapsed" &&
    capture.requestsDropped === 0 && capture.storageSnapshotRetained && value.action === action &&
    proof?.action === action && proof.authorizedTargetSha256 === value.authorizedTargetSha256 &&
    value.readStartedAtMs >= capture.actionDispatchedAtMs &&
    value.readCompletedAtMs <= capture.actionDispatchedAtMs + capture.requestedWindowMs &&
    value.readCompletedAtMs <= capture.captureEndedAtMs &&
    value.evidence.observedAtMs! >= capture.actionDispatchedAtMs;
}

export function validateTerminalConsentDecision(value: TerminalConsentDecision | undefined, capture: AfterActionCapture | undefined,
  proof: { action: string; authorizedTargetSha256?: string } | undefined, action: "accept" | "reject", context: z.RefinementCtx, registered?: RegisteredTerminalWindow) {
  if (value && !terminalConsentDecisionBound(value, capture, proof, action, registered)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["terminalDecisionEvidence"], message: "Terminal decision must bind to the completed authorized observation window." });
  }
}

/** Use existing source-bound projection timing and explicit full-window completion. */
export function registeredTerminalWindow(projection: {
  retainedActionTiming?: { action: "accept" | "reject"; actionDispatchedAtMs: number; observationEndedAtMs?: number };
  registeredObservationCompletion?: { action: "accept" | "reject"; startedAtMs: number; requiredWindowMs: number; completedAtMs: number; termination: string };
}): RegisteredTerminalWindow | undefined {
  const {retainedActionTiming: timing, registeredObservationCompletion: completion} = projection;
  if (!timing || !completion || completion.termination !== "window_elapsed" ||
      timing.action !== completion.action || timing.observationEndedAtMs !== completion.completedAtMs) return undefined;
  return {action: completion.action, dispatchedAtMs: timing.actionDispatchedAtMs, startedAtMs: completion.startedAtMs,
    requiredWindowMs: completion.requiredWindowMs, endedAtMs: completion.completedAtMs};
}
