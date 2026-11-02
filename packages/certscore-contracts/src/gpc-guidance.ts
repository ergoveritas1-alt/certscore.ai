import { z } from "zod";

const evidence = z.object({
  evidenceId: z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/),
  recipient: z.string().min(1).max(100),
  observedAtMs: z.number().int().min(0).max(120_000).optional(),
  priorCmpObservedAtMs: z.number().int().min(0).max(120_000).optional(),
}).strict().superRefine((row, ctx) => {
  if (row.priorCmpObservedAtMs !== undefined && (row.observedAtMs === undefined || row.priorCmpObservedAtMs > row.observedAtMs))
    ctx.addIssue({code:"custom",message:"Prior CMP state must precede its bound request."});
});
const common = {
  observation: z.string().min(1).max(500),
  responsibleRole: z.string().min(1).max(120),
  whatToCheck: z.array(z.string().min(1).max(600)).min(1).max(3),
  retest: z.string().min(1).max(600),
  evidence: z.array(evidence).max(8),
};
export const gpcGuidanceItemSchema = z.discriminatedUnion("code", [
  z.object({ ...common, kind: z.literal("adverse"), code: z.enum(["gpc_choice_contradiction", "qualified_collection_under_gpc"]), findingId: z.literal("gpc_response") }).strict(),
  z.object({ ...common, kind: z.literal("adverse"), code: z.enum(["gpp_applicable_section_missing", "gpp_empty_after_prior_state"]), findingId: z.literal("gpp_propagation_inconsistency") }).strict(),
  z.object({ ...common, kind: z.literal("neutral"), code: z.literal("gpc_observation_availability"), semanticProbe: z.enum(["observed", "unsupported", "unavailable", "not_ready", "invalid", "incomplete"]) }).strict(),
]);
export type GpcGuidanceItem = z.infer<typeof gpcGuidanceItemSchema>;
export const gpcGuidanceSchema = z.object({
  contractVersion: z.literal("certscore.gpc-guidance.v1"),
  items: z.array(gpcGuidanceItemSchema).max(5),
}).strict();
export type GpcGuidance = z.infer<typeof gpcGuidanceSchema>;

/** Shared wording on text surfaces; no renderer diagnoses evidence. */
export function describeGpcGuidance(guidance: GpcGuidance): string[] {
  return guidance.items.map(item => [item.observation,
    ...item.evidence.map(e => `${e.recipient}; request evidence ${e.evidenceId}${e.observedAtMs === undefined ? "" : ` at +${e.observedAtMs} ms from GPC visit start`}${e.priorCmpObservedAtMs === undefined ? "" : `; prior same-document CMP state at +${e.priorCmpObservedAtMs} ms`}.`),
    `Responsible role: ${item.responsibleRole}.`, `What to check: ${item.whatToCheck.join(" ")}`, `Retest: ${item.retest}`].join(" "));
}
