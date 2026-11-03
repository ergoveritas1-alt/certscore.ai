import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().min(0).max(120_000);
const binding = z.object({
  contractVersion: z.literal("certscore.gpc-cookie-read-binding.v1"),
  scope: z.literal("gpc_browser_context_point_in_time"),
  scanId: z.string().min(1).max(200), captureId: z.string().uuid(),
  snapshotArtifactId: z.literal("cookie_snapshot_pre_consent"),
  documentToken: z.string().min(1).max(160), targetUrlSha256: hash, documentUrlSha256: hash,
  documentCommittedAtMs: time, startedAtMs: time, completedAtMs: time,
  inventoryCompleteness: z.literal("not_assessed"),
  matchedRequestHorizon: z.literal("not_established"),
}).strict();
/** Private original-worker metadata. Never a public cookie comparison or an
 * extension of the baseline bound_cookie_snapshot eligibility policy. */
export interface GpcCookieReadBinding extends z.infer<typeof binding> {}
export const gpcCookieReadBindingSchema: z.ZodType<GpcCookieReadBinding> = binding.superRefine((b, ctx) => {
  if (b.startedAtMs < b.documentCommittedAtMs || b.completedAtMs < b.startedAtMs ||
    new TextEncoder().encode(JSON.stringify(b)).byteLength > 2048)
    ctx.addIssue({ code: "custom", message: "GPC cookie read binding requires bounded ordered original metadata." });
});
