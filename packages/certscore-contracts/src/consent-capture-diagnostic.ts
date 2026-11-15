import {z} from "zod";
import {consentControlInspectionSchema} from "./consent-control-inspection";

const inspection = consentControlInspectionSchema.innerType().shape;
const capturedFrame = (outcome: string) => outcome === "captured" || outcome === "truncated";
export const optOutGeometryFrameOutcomeSchema = z.enum(["captured", "truncated", "timed_out", "failed", "pending_read"]);
export type OptOutGeometryFrameOutcome = z.infer<typeof optOutGeometryFrameOutcomeSchema>;
export const FIRST_LAYER_OPT_OUT_GEOMETRY_SAMPLE_LIMIT = 4;
export const FIRST_LAYER_OPT_OUT_GEOMETRY_MAX_BYTES = 1400;

/** Frame slots index the existing read plan, with slot zero for the main
 * frame. Candidate ordinals refer to the same private geometry artifact. */
export const firstLayerOptOutGeometryDiagnosticSchema = z.object({
  version: z.literal("first_layer_opt_out_geometry_diagnostic.v1"),
  structuralCoverage: inspection.structuralCoverage,
  captureCoverage: inspection.captureCoverage.strict(),
  framesAtStart: z.number().int().min(1).max(10_000),
  frameOutcomes: z.array(optOutGeometryFrameOutcomeSchema).min(1).max(12),
  retainedCandidateCount: inspection.retainedCandidateCount,
  inspectedCandidateCount: inspection.retainedCandidateCount,
  unresolvedOptOutCount: inspection.retainedCandidateCount,
  classifiedOptOutCount: inspection.retainedCandidateCount,
  otherUnresolvedCount: inspection.retainedCandidateCount,
  candidates: z.array(z.object({
    ordinal: z.number().int().min(0).max(159),
    frameSlot: z.number().int().min(0).max(11),
    role: inspection.candidates.element.shape.role,
    coverage: z.enum(["unresolved_opt_out", "classified_opt_out", "other_unresolved"]),
    confirmedVisible: z.boolean(),
  }).strict()).max(FIRST_LAYER_OPT_OUT_GEOMETRY_SAMPLE_LIMIT),
}).strict().superRefine((value, context) => {
  const counts = {
    unresolved_opt_out: value.unresolvedOptOutCount,
    classified_opt_out: value.classifiedOptOutCount,
    other_unresolved: value.otherUnresolvedCount,
  };
  const coverage = value.captureCoverage;
  const validFrames = value.frameOutcomes.length === Math.min(value.framesAtStart, 12) &&
    value.frameOutcomes.filter(capturedFrame).length === coverage.capturedFrameCount &&
    (!coverage.mainFrameAvailable || capturedFrame(value.frameOutcomes[0] ?? "")) &&
    (!value.frameOutcomes.includes("truncated") || coverage.inventoryTruncated) &&
    (value.structuralCoverage !== "complete" || (
      coverage.documentAndFramesStable && coverage.mainFrameAvailable && coverage.documentReadyState === "complete" &&
      !coverage.inventoryTruncated && coverage.frameCount === value.framesAtStart &&
      coverage.frameCount === coverage.capturedFrameCount
    ));
  const total = value.unresolvedOptOutCount + value.classifiedOptOutCount + value.otherUnresolvedCount;
  const validCandidates = value.inspectedCandidateCount <= value.retainedCandidateCount &&
    total <= value.inspectedCandidateCount &&
    value.candidates.length === Math.min(total, FIRST_LAYER_OPT_OUT_GEOMETRY_SAMPLE_LIMIT) &&
    new Set(value.candidates.map(candidate => candidate.ordinal)).size === value.candidates.length &&
    value.candidates.every(candidate => candidate.ordinal < value.retainedCandidateCount &&
      capturedFrame(value.frameOutcomes[candidate.frameSlot] ?? "")) &&
    Object.entries(counts).every(([reason, count]) => value.candidates.filter(candidate => candidate.coverage === reason).length <= count);
  if (!validFrames || !validCandidates || JSON.stringify(value).length > FIRST_LAYER_OPT_OUT_GEOMETRY_MAX_BYTES) {
    context.addIssue({code: "custom", message: "Opt-out diagnostic must bind bounded candidate samples and frame capture outcomes."});
  }
});
export type FirstLayerOptOutGeometryDiagnostic = z.infer<typeof firstLayerOptOutGeometryDiagnosticSchema>;

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
