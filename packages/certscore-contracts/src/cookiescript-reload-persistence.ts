import { z } from "zod";

export const cookieScriptReloadPersistenceSchema = z.object({
  version: z.literal("cookiescript_reload_persistence.v1"),
  cookieName: z.literal("CookieScriptConsent"),
  authorizedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  actionDispatchedAtMs: z.number().int().nonnegative(),
  reloadCommittedAtMs: z.number().int().nonnegative(),
  observedAtMs: z.number().int().nonnegative(),
}).strict();

export function validateCookieScriptReloadPersistence(
  evidence: z.infer<typeof cookieScriptReloadPersistenceSchema> | undefined,
  packet: {
    actionControlProof?: { cmpId?: string; authorizedTargetSha256?: string };
    interactionDiagnostics?: { click: { outcome: string } };
    exactTargetSha256?: string;
    timing: { readyAtMs: number };
  },
  dispatchedAtMs: number | undefined,
  context: z.RefinementCtx,
) {
  if (!evidence) return;
  if (packet.actionControlProof?.cmpId !== "CookieScript" ||
      packet.interactionDiagnostics?.click.outcome !== "completed" ||
      evidence.authorizedTargetSha256 !== packet.exactTargetSha256 ||
      evidence.authorizedTargetSha256 !== packet.actionControlProof.authorizedTargetSha256 ||
      evidence.actionDispatchedAtMs !== dispatchedAtMs ||
      evidence.reloadCommittedAtMs < evidence.actionDispatchedAtMs ||
      evidence.observedAtMs < evidence.reloadCommittedAtMs || evidence.observedAtMs > packet.timing.readyAtMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cookieScriptReloadPersistence"],
      message: "Cookie persistence must be bound to a completed CookieScript click and its authorized reload." });
  }
}
