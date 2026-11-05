import { z } from "zod";
import type { AfterActionCapture } from "./after-action-capture";
import { terminalConsentDecisionBound, type TerminalConsentDecision } from "./terminal-consent-decision";

export const CHOICE_PATH_EXECUTION_POLICY = "choice_path_execution.v1" as const;

/** Operational completion is independent of the consent decision and findings. */
export const choicePathExecutionSchema = z.object({
  policyVersion: z.literal(CHOICE_PATH_EXECUTION_POLICY),
  status: z.enum(["succeeded", "succeeded_with_confirmation", "limited", "not_attempted", "unsupported"]),
  clickCompleted: z.boolean(),
  observationCompleted: z.boolean(),
  consentConfirmed: z.boolean(),
}).strict().superRefine((value, context) => {
  const succeeded = value.clickCompleted && value.observationCompleted;
  if (((value.observationCompleted || value.consentConfirmed) && !value.clickCompleted) ||
    succeeded !== ["succeeded", "succeeded_with_confirmation"].includes(value.status) ||
    (value.status === "succeeded_with_confirmation") !== (succeeded && value.consentConfirmed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Path success requires completed activation and observation; confirmation is independent." });
  }
});

export type ChoicePathExecution = z.infer<typeof choicePathExecutionSchema>;

/** Retained completion proof for the registered branch, which does not produce
 * an unconfirmed afterActionCapture packet. Bound to the same source packet. */
export const registeredObservationCompletionSchema = z.object({
  policyVersion: z.literal("registered_action_observation_completion.v1"),
  action: z.enum(["accept", "reject"]),
  startedAtMs: z.number().int().nonnegative(),
  completedAtMs: z.number().int().nonnegative(),
  requiredWindowMs: z.number().int().nonnegative(),
  termination: z.enum(["window_elapsed", "evidence_satisfied"]),
}).strict().superRefine((value, context) => {
  if (value.completedAtMs < value.startedAtMs ||
    (value.termination === "window_elapsed" && value.completedAtMs - value.startedAtMs < value.requiredWindowMs)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Registered observation completion requires consistent retained timing." });
  }
});

export function retainRegisteredObservationCompletion(input: {
  action: "accept" | "reject"; registeredAtMs?: number; productionProjectable: boolean;
  cancelled: boolean; requestsDropped: number; observationWindowMs: number;
  observedDurationMs: number; readyAtMs: number; exitReason?: string; observationCount: number;
}): z.infer<typeof registeredObservationCompletionSchema> | undefined {
  if (!input.productionProjectable || input.cancelled || input.requestsDropped > 0 || input.registeredAtMs === undefined) return undefined;
  const elapsed = input.exitReason === "window_elapsed" && input.observedDurationMs >= input.observationWindowMs;
  const evidenceSatisfied = input.observationCount > 0 && ["non_essential_request_observed", "non_essential_storage_write_observed",
    input.action === "accept" ? "acceptance_signal_contradiction_observed" : "refusal_signal_contradiction_observed"].includes(input.exitReason ?? "");
  if (!elapsed && !evidenceSatisfied) return undefined;
  const parsed = registeredObservationCompletionSchema.safeParse({
    policyVersion: "registered_action_observation_completion.v1", action: input.action,
    startedAtMs: input.registeredAtMs, completedAtMs: input.readyAtMs, requiredWindowMs: input.observationWindowMs,
    termination: elapsed ? "window_elapsed" : "evidence_satisfied",
  });
  return parsed.success ? parsed.data : undefined;
}

type Projection = {
  packetSha256?: string;
  actionControlProof?: { action: string; authorizedTargetSha256?: string };
  terminalDecisionEvidence?: TerminalConsentDecision;
  afterActionCapture?: AfterActionCapture;
  registeredObservationCompletion?: z.infer<typeof registeredObservationCompletionSchema>;
  captureCoverage?: { requestsDroppedAfterAction: number };
  decisionEvidence?: { decision: string; basis: string };
  registrationStatus: string;
  acceptanceExercised?: boolean;
  refusalExercised?: boolean;
  acceptanceRegisteredAtMs?: number;
  refusalRegisteredAtMs?: number;
  productionProjectable: boolean;
  evidenceDisposition: string;
  status: string;
  limitations: string[];
  interactionDiagnostics?: { click: { outcome: string } };
};

/** Only call with a validated typed report projection from verified evidence. */
export function assessChoicePathExecution(projection: Projection, action: "accept" | "reject"): ChoicePathExecution {
  const sourceVerified = /^[a-f0-9]{64}$/.test(projection.packetSha256 ?? "") &&
    projection.actionControlProof?.action === action;
  const exercised = action === "accept" ? projection.acceptanceExercised : projection.refusalExercised;
  const registeredAt = action === "accept" ? projection.acceptanceRegisteredAtMs : projection.refusalRegisteredAtMs;
  const registeredDecisionConfirmed = sourceVerified && ["confirmed_clean", "confirmed_observation"].includes(projection.status) &&
    projection.registrationStatus === "confirmed" && exercised === true &&
    registeredAt !== undefined && projection.decisionEvidence?.basis === "verified_state" &&
    projection.decisionEvidence.decision === (action === "accept" ? "granted" : "denied");
  const consentConfirmed = registeredDecisionConfirmed || (sourceVerified && !!projection.terminalDecisionEvidence &&
    terminalConsentDecisionBound(projection.terminalDecisionEvidence, projection.afterActionCapture, projection.actionControlProof, action));
  const capture = projection.afterActionCapture;
  const completion = projection.registeredObservationCompletion;
  const clickCompleted = sourceVerified && (consentConfirmed || completion?.action === action || capture?.activationStatus === "completed" ||
    projection.interactionDiagnostics?.click.outcome === "completed");
  const interrupted = projection.registrationStatus === "aborted" || projection.limitations.some((reason) =>
    reason === "observation_window_aborted_after_confirmed_acceptance" ||
    reason === "observation_window_aborted_after_confirmed_refusal" ||
    reason === "post_action_network_capture_truncated" || reason.startsWith("observer_result_budget_exhausted"));
  // The registered branch must retain its explicit protocol completion evidence.
  // Confirmation/projectability alone cannot establish observation completion.
  const observationCompleted = clickCompleted && !interrupted &&
    (projection.captureCoverage?.requestsDroppedAfterAction ?? 0) === 0 && (capture
      ? capture.action === action && capture.activationStatus === "completed" &&
        capture.stopReason === "window_elapsed" && capture.requestsDropped === 0 &&
        capture.storageSnapshotRetained
      : completion?.action === action && completion.startedAtMs === registeredAt);
  const status = observationCompleted
    ? consentConfirmed ? "succeeded_with_confirmation" : "succeeded"
    : !clickCompleted && projection.status === "not_attempted" ? "not_attempted"
      : !clickCompleted && projection.status === "unsupported" ? "unsupported" : "limited";
  return choicePathExecutionSchema.parse({ policyVersion: CHOICE_PATH_EXECUTION_POLICY,
    status, clickCompleted, observationCompleted, consentConfirmed });
}

export function validateChoicePathExecution(execution: ChoicePathExecution | undefined, projection: Projection,
  action: "accept" | "reject", context: z.RefinementCtx) {
  if (!execution) return; // Historical projections remain readable without mutation.
  const expected = assessChoicePathExecution(projection, action);
  if (Object.keys(expected).some((key) => expected[key as keyof ChoicePathExecution] !== execution[key as keyof ChoicePathExecution])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["execution"], message: "Path execution must agree with its retained source projection." });
  }
}

export function choicePathExecutionLabel(execution: ChoicePathExecution | null | undefined): string {
  switch (execution?.status) {
    case "succeeded": return "Consent unconfirmed";
    case "succeeded_with_confirmation": return "Succeeded with confirmation";
    case "not_attempted": return "Not attempted";
    case "unsupported": return "Unsupported";
    default: return "Limited";
  }
}
