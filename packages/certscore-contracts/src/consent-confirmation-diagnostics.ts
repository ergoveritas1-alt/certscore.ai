import { z } from "zod";

/** Operational evidence-quality diagnostics only. Never a consent witness. */
const legacyReasonSchema = z.enum([
  "no_registered_complete_decision", "no_fresh_decision", "opposite_or_mixed_decision",
  "receipt_missing", "receipt_ambiguous", "receipt_readback_mismatch",
  "receipt_malformed_or_unsupported", "configuration_or_groups_unverified",
  "configuration_changed", "api_unavailable", "api_saved_event_unverified", "verified_decision",
]);
export const consentConfirmationReasonSchema = z.enum([
  ...legacyReasonSchema.options,
  "configuration_missing", "configuration_malformed", "configuration_unverifiable",
  "group_universe_incomplete", "receipt_groups_unconfigured", "receipt_identity_changed", "baseline_receipt_unverified",
  "receipt_malformed", "receipt_format_unsupported", "confirmation_aborted",
]);
export type ConsentConfirmationReason = z.infer<typeof consentConfirmationReasonSchema>;
const legacyDiagnosticsSchema = z.object({
  policyVersion: z.literal("consent_confirmation_diagnostics.v1"), diagnosticOnly: z.literal(true),
  initialPasses: z.number().int().min(0).max(10_000), terminalPasses: z.number().int().min(0).max(10_000),
  reasons: z.array(legacyReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length),
  terminalRead: z.enum(["not_started", "started", "unverified", "verified", "discarded"]),
}).strict();
const reasonsSchema = z.array(consentConfirmationReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length);
const currentDiagnosticsSchema = legacyDiagnosticsSchema.extend({
  policyVersion: z.literal("consent_confirmation_diagnostics.v2"),
  reasons: reasonsSchema,
  initialReasons: reasonsSchema,
  terminalReasons: reasonsSchema,
  reasonsTruncated: z.boolean(),
}).refine(value => value.initialReasons.every(reason => value.reasons.includes(reason)) &&
  value.terminalReasons.every(reason => value.reasons.includes(reason)), "Phase reasons must occur in the shared bounded inventory.");
export const consentConfirmationDiagnosticsSchema = z.union([legacyDiagnosticsSchema, currentDiagnosticsSchema]);
export type ConsentConfirmationDiagnostics = z.infer<typeof consentConfirmationDiagnosticsSchema>;
