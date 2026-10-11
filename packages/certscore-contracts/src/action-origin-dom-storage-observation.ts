import { z } from "zod";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const count = z.number().int().nonnegative().safe();
const baseSchema = z.object({
  contractVersion: z.literal("action_origin_dom_storage_observation.v1"),
  scope: z.literal("origin_storage_partition_event_receipts"), diagnosticOnly: z.literal(true),
  timingBasis: z.literal("observer_event_receipt_clock"), targetOriginSha256: digest, setup: z.enum(["enabled", "unavailable"]),
  startedAtEpochMs: count, frozenAtEpochMs: count,
  observedEvents: count, invalidEvents: count, overflowEvents: count, foreignOriginEvents: count,
  additionalPageObserved: z.boolean(),
  rows: z.array(z.object({ event: z.enum(["added", "updated", "removed", "cleared"]), receivedAtEpochMs: count,
    originSha256: digest, storagePartitionSha256: digest.optional(), targetOriginMatch: z.boolean(),
    storageType: z.enum(["local_storage", "session_storage"]), keySha256: digest.optional(), valueSha256: digest.optional(),
  }).strict()).max(64),
  limitations: z.array(z.enum(["setup_unavailable", "invalid_event", "retention_overflow", "foreign_origin_observed", "additional_page_observed",
    "receipt_clock_not_write_time", "no_document_or_frame_attribution", "source_delivery_not_verified", "cookies_and_other_storage_not_covered"])).max(9),
}).strict();
export type ActionOriginDomStorageObservation = {
  contractVersion: "action_origin_dom_storage_observation.v1";
  scope: "origin_storage_partition_event_receipts"; diagnosticOnly: true;
  timingBasis: "observer_event_receipt_clock"; targetOriginSha256: string; setup: "enabled" | "unavailable";
  startedAtEpochMs: number; frozenAtEpochMs: number; observedEvents: number; invalidEvents: number;
  overflowEvents: number; foreignOriginEvents: number; additionalPageObserved: boolean;
  rows: Array<{ event: "added" | "updated" | "removed" | "cleared"; receivedAtEpochMs: number;
    originSha256: string; storagePartitionSha256?: string; targetOriginMatch: boolean;
    storageType: "local_storage" | "session_storage"; keySha256?: string; valueSha256?: string }>;
  limitations: Array<"setup_unavailable" | "invalid_event" | "retention_overflow" | "foreign_origin_observed" | "additional_page_observed" |
    "receipt_clock_not_write_time" | "no_document_or_frame_attribution" | "source_delivery_not_verified" | "cookies_and_other_storage_not_covered">;
};
export const actionOriginDomStorageObservationSchema: z.ZodType<ActionOriginDomStorageObservation> = baseSchema.superRefine((value, context) => {
  const required = ["receipt_clock_not_write_time", "no_document_or_frame_attribution", "source_delivery_not_verified", "cookies_and_other_storage_not_covered"];
  if (value.observedEvents !== value.rows.length + value.invalidEvents + value.overflowEvents ||
    value.foreignOriginEvents > value.observedEvents - value.invalidEvents || value.frozenAtEpochMs < value.startedAtEpochMs ||
    required.some(item => !value.limitations.includes(item as typeof value.limitations[number])) ||
    (value.setup === "unavailable" && !value.limitations.includes("setup_unavailable")) ||
    (value.invalidEvents > 0 && !value.limitations.includes("invalid_event")) ||
    (value.overflowEvents > 0 && !value.limitations.includes("retention_overflow")) ||
    (value.foreignOriginEvents > 0 && !value.limitations.includes("foreign_origin_observed")) ||
    (value.additionalPageObserved && !value.limitations.includes("additional_page_observed"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Origin storage diagnostics must preserve exact receipt accounting and scope limitations." });
  }
  for (const row of value.rows) {
    if (row.targetOriginMatch !== (row.originSha256 === value.targetOriginSha256) ||
      row.receivedAtEpochMs < value.startedAtEpochMs || row.receivedAtEpochMs > value.frozenAtEpochMs ||
      (row.event === "cleared" ? row.keySha256 !== undefined : row.keySha256 === undefined) ||
      (["added", "updated"].includes(row.event) ? row.valueSha256 === undefined : row.valueSha256 !== undefined)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Storage event shape and receipt clock must match the frozen diagnostic inventory." });
    }
  }
});

/** Bind only to the worker packet lifetime, never to semantic registration or a renderer document. */
export function validateOriginDomStorageObservation(observation: ActionOriginDomStorageObservation | undefined,
  startedAt: string, completedAt: string, context: z.RefinementCtx) {
  if (!observation) return;
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(completedAt)) ||
    observation.startedAtEpochMs < Date.parse(startedAt) || observation.frozenAtEpochMs > Date.parse(completedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storage", "originDomStorageObservation"],
      message: "Origin diagnostic receipt envelope must stay within its original worker packet lifetime." });
  }
}
