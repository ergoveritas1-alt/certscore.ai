import { z } from "zod";

/** Descriptive retained timing only. Does not establish completion or eligibility. */
export const retainedActionTimingSchema = z.object({
  policyVersion: z.literal("retained_action_timing.v1"),
  action: z.enum(["accept", "reject"]),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  observationEndedAtMs: z.number().int().nonnegative().optional(),
  firstRequest: z.object({
    startedAtMs: z.number().int().nonnegative(),
    hostname: z.string().max(255).optional(),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  if ((value.observationEndedAtMs !== undefined && value.observationEndedAtMs < value.actionDispatchedAtMs) ||
    (value.firstRequest && (value.firstRequest.startedAtMs < value.actionDispatchedAtMs || (value.observationEndedAtMs !== undefined && value.firstRequest.startedAtMs > value.observationEndedAtMs)))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Retained action times must follow dispatch." });
  }
});

export function retainActionTiming(input: {
  action: "accept" | "reject"; packetSha256?: string; clickCompleted: boolean;
  actionDispatchedAtMs?: number; observationEndedAtMs?: number;
  requests: Array<{ startedAtMs: number; hostname?: string }>;
}) {
  if (!input.packetSha256 || !input.clickCompleted || input.actionDispatchedAtMs === undefined) return undefined;
  const first = input.requests.filter(row => row.startedAtMs >= input.actionDispatchedAtMs! && (input.observationEndedAtMs === undefined || row.startedAtMs <= input.observationEndedAtMs))
    .sort((a, b) => a.startedAtMs - b.startedAtMs)[0];
  return retainedActionTimingSchema.parse({ policyVersion: "retained_action_timing.v1", action: input.action,
    actionDispatchedAtMs: input.actionDispatchedAtMs, observationEndedAtMs: input.observationEndedAtMs,
    ...(first ? { firstRequest: { startedAtMs: first.startedAtMs, hostname: first.hostname } } : {}),
  });
}

export function validateRetainedActionTiming(value: z.infer<typeof retainedActionTimingSchema> | undefined,
  projection: { packetSha256?: string; actionControlProof?: { action: string }; interactionDiagnostics?: { click: { outcome: string } };
    afterActionCapture?: { actionDispatchedAtMs: number; captureEndedAtMs?: number };
    registeredObservationCompletion?: { completedAtMs: number };
    acceptanceRegisteredAtMs?: number; refusalRegisteredAtMs?: number },
  action: "accept" | "reject", context: z.RefinementCtx) {
  if (!value) return;
  const registeredAt = action === "accept" ? projection.acceptanceRegisteredAtMs : projection.refusalRegisteredAtMs;
  if (!projection.packetSha256 || projection.actionControlProof?.action !== action || value.action !== action ||
    projection.interactionDiagnostics?.click.outcome !== "completed" ||
    (registeredAt !== undefined && value.actionDispatchedAtMs > registeredAt) ||
    (projection.afterActionCapture && value.actionDispatchedAtMs !== projection.afterActionCapture.actionDispatchedAtMs) ||
    (value.observationEndedAtMs !== undefined && (
      (projection.afterActionCapture?.captureEndedAtMs !== undefined && value.observationEndedAtMs !== projection.afterActionCapture.captureEndedAtMs) ||
      (projection.registeredObservationCompletion && value.observationEndedAtMs !== projection.registeredObservationCompletion.completedAtMs)
    ))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["retainedActionTiming"], message: "Action timing requires source-bound completed click evidence." });
  }
}
