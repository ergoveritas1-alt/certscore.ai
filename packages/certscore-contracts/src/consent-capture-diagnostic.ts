import {z} from "zod";

/** Scheduling metadata only. It cannot establish control presence or absence. */
export const consentCaptureDiagnosticSchema = z.object({
  version: z.literal("consent_capture_diagnostic.v1"),
  refreshPolicy: z.literal("final_consent_geometry_refresh.v3"),
  observationId: z.string().min(1).max(240),
  documentToken: z.string().min(1).max(160).nullable(),
  inventoryObservedAtMs: z.number().int().nonnegative(),
  geometryObservedAtMs: z.number().int().nonnegative().nullable(),
  geometryBinding: z.enum(["matched", "mismatched", "unavailable"]),
  geometryMinusInventoryMs: z.number().int().nullable(),
  outcome: z.enum(["not_considered", "skipped", "retained", "already_considered", "ineligible", "budget_unavailable", "cancelled", "timed_out", "invalid_capture", "no_positive_control", "document_changed", "retention_failed"]),
  skipReason: z.enum(["stage_not_reached", "not_refresh_candidate", "capture_scope", "screenshots_disabled", "current_access_limited", "prior_access_limited", "terminal_error_shell", "observation_changed"]).nullable(),
  eligibilityBlocker: z.enum([
    "geometry_missing", "recovery_already_used", "first_layer_not_inspected",
    "geometry_document_mismatch", "inventory_incomplete", "inventory_document_not_ready",
    "dom_inventory_unavailable", "inventory_channels_failed", "blocking_frame_inaccessible",
    "geometry_inspection_unverified", "geometry_frame_cap_exceeded", "geometry_coverage_incomplete",
    "inventory_outcome_unsupported", "geometry_timestamp_invalid", "geometry_current",
    "screenshot_missing", "screenshot_unusable", "screenshot_timestamp_invalid",
    "live_document_mismatch", "screenshot_document_mismatch", "live_document_unsupported",
    "checkpoint_timestamp_invalid", "live_frames_missing", "live_frame_cap_exceeded",
  ]).optional(),
  attempted: z.boolean(),
  elapsedMs: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.eligibilityBlocker !== undefined && value.outcome !== "ineligible" &&
      !(value.outcome === "skipped" && value.skipReason === "not_refresh_candidate"))
    context.addIssue({code: "custom", message: "Eligibility blockers require a rejected refresh candidate."});
  const delta = value.geometryBinding === "matched" && value.geometryObservedAtMs !== null
    ? value.geometryObservedAtMs - value.inventoryObservedAtMs : null;
  if (value.geometryMinusInventoryMs !== delta || (value.geometryBinding === "matched" && value.documentToken === null))
    context.addIssue({code: "custom", message: "Checkpoint delta requires exact document binding and timestamps."});
  if (["not_considered", "skipped"].includes(value.outcome) !== (value.skipReason !== null) ||
      (["not_considered", "skipped", "already_considered", "ineligible", "budget_unavailable"].includes(value.outcome) && value.attempted) ||
      (["retained", "timed_out", "invalid_capture", "no_positive_control", "document_changed", "retention_failed"].includes(value.outcome) && !value.attempted))
    context.addIssue({code: "custom", message: "Refresh outcome, skip reason and attempt must agree."});
});
export type ConsentCaptureDiagnostic = z.infer<typeof consentCaptureDiagnosticSchema>;
