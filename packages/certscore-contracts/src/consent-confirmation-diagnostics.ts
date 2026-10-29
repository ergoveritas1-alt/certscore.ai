import { z } from "zod";

/** Operational evidence-quality diagnostics only. Never a consent witness. */
const legacyReasonSchema = z.enum([
  "no_registered_complete_decision", "no_fresh_decision", "opposite_or_mixed_decision",
  "receipt_missing", "receipt_ambiguous", "receipt_readback_mismatch",
  "receipt_malformed_or_unsupported", "configuration_or_groups_unverified",
  "configuration_changed", "api_unavailable", "api_saved_event_unverified", "verified_decision",
]);
const v2ReasonSchema = z.enum([
  ...legacyReasonSchema.options,
  "configuration_missing", "configuration_malformed", "configuration_unverifiable",
  "group_universe_incomplete", "receipt_groups_unconfigured", "receipt_identity_changed", "baseline_receipt_unverified",
  "receipt_malformed", "receipt_format_unsupported", "confirmation_aborted",
]);
export const consentConfirmationReasonSchema = z.enum([
  ...v2ReasonSchema.options,
  "sdk_capture_unavailable", "sdk_not_observed", "sdk_unreviewed", "sdk_multiple_requests",
  "sdk_response_unverified", "sdk_body_pending", "sdk_body_mismatch", "sdk_body_unavailable", "sdk_document_changed",
  "script_inventory_limit", "script_element_missing", "script_multiple_elements", "script_url_mismatch",
  "category_inputs_malformed", "category_hierarchy_unsupported", "category_iab_unsupported", "category_type_unsupported",
  "category_private_flag_unresolved", "category_required_excluded", "category_no_required", "category_no_optional",
  "category_applicability_verified", "category_exclusion_unneeded", "category_proof_invalid",
]);
export type ConsentConfirmationReason = z.infer<typeof consentConfirmationReasonSchema>;
const legacyDiagnosticsSchema = z.object({
  policyVersion: z.literal("consent_confirmation_diagnostics.v1"), diagnosticOnly: z.literal(true),
  initialPasses: z.number().int().min(0).max(10_000), terminalPasses: z.number().int().min(0).max(10_000),
  reasons: z.array(legacyReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length),
  terminalRead: z.enum(["not_started", "started", "unverified", "verified", "discarded"]),
}).strict();
const reasonsSchema = z.array(v2ReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length);
const currentDiagnosticsSchema = legacyDiagnosticsSchema.extend({
  policyVersion: z.literal("consent_confirmation_diagnostics.v2"),
  reasons: reasonsSchema,
  initialReasons: reasonsSchema,
  terminalReasons: reasonsSchema,
  reasonsTruncated: z.boolean(),
}).refine(value => value.initialReasons.every(reason => value.reasons.includes(reason)) &&
  value.terminalReasons.every(reason => value.reasons.includes(reason)), "Phase reasons must occur in the shared bounded inventory.");
const preciseReasonsSchema = z.array(consentConfirmationReasonSchema).max(12).refine(rows => new Set(rows).size === rows.length);
const preciseDiagnosticsSchema = legacyDiagnosticsSchema.extend({
  policyVersion: z.literal("consent_confirmation_diagnostics.v3"), reasons: preciseReasonsSchema,
  initialReasons: preciseReasonsSchema, terminalReasons: preciseReasonsSchema, reasonsTruncated: z.boolean(),
}).refine(value => value.initialReasons.every(reason => value.reasons.includes(reason)) &&
  value.terminalReasons.every(reason => value.reasons.includes(reason)), "Phase reasons must occur in the shared bounded inventory.");
type DiagnosticBase = {diagnosticOnly:true;initialPasses:number;terminalPasses:number;terminalRead:"not_started"|"started"|"unverified"|"verified"|"discarded"};
export type ConsentConfirmationDiagnostics =
  | DiagnosticBase & {policyVersion:"consent_confirmation_diagnostics.v1";reasons:z.infer<typeof legacyReasonSchema>[]}
  | DiagnosticBase & {policyVersion:"consent_confirmation_diagnostics.v2";reasons:z.infer<typeof v2ReasonSchema>[];initialReasons:z.infer<typeof v2ReasonSchema>[];terminalReasons:z.infer<typeof v2ReasonSchema>[];reasonsTruncated:boolean}
  | DiagnosticBase & {policyVersion:"consent_confirmation_diagnostics.v3";reasons:ConsentConfirmationReason[];initialReasons:ConsentConfirmationReason[];terminalReasons:ConsentConfirmationReason[];reasonsTruncated:boolean};
export const consentConfirmationDiagnosticsSchema: z.ZodType<ConsentConfirmationDiagnostics> = z.union([legacyDiagnosticsSchema, currentDiagnosticsSchema, preciseDiagnosticsSchema]);
