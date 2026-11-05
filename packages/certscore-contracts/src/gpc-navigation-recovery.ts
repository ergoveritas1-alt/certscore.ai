import { z } from "zod";
import { gpcImpactCaptureSchema } from "./gpc-impact";

export const GPC_NAVIGATION_RECOVERY_PROTOCOL = "certscore.local-final-document-recovery.v1" as const;
/** Optional local research packet. Never replaces the original capture or
 * changes eligibility, scoring or historical protocol versions. */
export const gpcNavigationRecoverySchema = z.object({
  contractVersion: z.literal(GPC_NAVIGATION_RECOVERY_PROTOCOL),
  mode: z.literal("local_experiment"), productionProjectable: z.literal(false),
  scoreEffect: z.literal("none"),
  deadlineMs: z.number().int().nonnegative(),
  attemptCount: z.union([z.literal(0), z.literal(1)]),
  originalCaptureSha256: z.string().regex(/^[a-f0-9]{64}$/),
  finalDocumentCapture: gpcImpactCaptureSchema.nullable(),
  status: z.enum(["not_attempted", "candidate_available", "candidate_unavailable"]),
  limitationKeys: z.array(z.string().min(1).max(160)).max(16),
}).strict().superRefine((v, ctx) => {
  const c = v.finalDocumentCapture;
  if (new TextEncoder().encode(JSON.stringify(v)).byteLength > 72 * 1024 ||
      (v.attemptCount === 0) !== (c === null) ||
      (v.status === "not_attempted") !== (v.attemptCount === 0) ||
      c?.adaptiveObservation || c?.localRetention ||
      (v.status === "candidate_available" && (!c?.windows.length || c.limitationKeys.length ||
        c.requestsDropped || c.capturedAtMs > v.deadlineMs || v.limitationKeys.length))) {
    ctx.addIssue({ code: "custom", message: "Recovery requires one bounded fixed-window candidate; original evidence remains separate." });
  }
});
export type GpcNavigationRecovery = z.infer<typeof gpcNavigationRecoverySchema>;
