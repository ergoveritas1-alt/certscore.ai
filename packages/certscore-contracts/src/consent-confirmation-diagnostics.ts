import { z } from "zod";

/** Operational evidence-quality diagnostics only. Never a consent witness. */
export const consentConfirmationReasonSchema = z.enum([
  "no_registered_complete_decision", "no_fresh_decision", "opposite_or_mixed_decision",
  "receipt_missing", "receipt_ambiguous", "receipt_readback_mismatch",
  "receipt_malformed_or_unsupported", "configuration_or_groups_unverified",
  "configuration_changed", "api_unavailable", "api_saved_event_unverified", "verified_decision",
]);
export type ConsentConfirmationReason = z.infer<typeof consentConfirmationReasonSchema>;
export const consentConfirmationDiagnosticsSchema = z.object({
  policyVersion: z.literal("consent_confirmation_diagnostics.v1"), diagnosticOnly: z.literal(true),
  initialPasses: z.number().int().min(0).max(10_000), terminalPasses: z.number().int().min(0).max(10_000),
  reasons: z.array(consentConfirmationReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length),
  terminalRead: z.enum(["not_started", "started", "unverified", "verified", "discarded"]),
}).strict();
export type ConsentConfirmationDiagnostics = z.infer<typeof consentConfirmationDiagnosticsSchema>;
