import { z } from "zod";
import { RUNTIME_VISIT_REJECTION_REASONS } from "./usable-runtime-visit";

export const retainedRuntimeNoGoReasonSchema = z.enum([
  "authentication_required", "access_denied_or_forbidden_page", "captcha_or_challenge",
  "rate_limited_429", "unsupported_region", "redirect_only_page", "not_found_404",
  "server_error_5xx", "configuration_error", "maintenance_or_unavailable", "tls_or_certificate_error",
  "site_not_ready", "parked_or_placeholder", "target_unreachable_or_unsuitable", "navigation_transport_failure",
]);

export const runtimeVisitEligibilityDiagnosticSchema = z.object({
  policyVersion: z.literal("runtime_visit_eligibility.v1"),
  reasonCode: z.enum(RUNTIME_VISIT_REJECTION_REASONS),
  retainedNoGoReason: retainedRuntimeNoGoReasonSchema.optional(),
  snapshotCount: z.number().int().min(0).max(10000),
  snapshotCountTruncated: z.boolean(),
  selectedSnapshot: z.object({
    capturedAtMs: z.number().finite().nonnegative(),
    documentUrlSha256: z.string().regex(/^[a-f0-9]{64}$/),
    documentTokenSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    cdpLoaderBound: z.boolean(),
    hasText: z.boolean(),
    hasTitle: z.boolean(),
  }).strict().optional(),
}).strict();
export type RuntimeVisitEligibilityDiagnostic = z.infer<typeof runtimeVisitEligibilityDiagnosticSchema>;

export const terminalLaneEvidenceSchema = z.object({
  contractVersion: z.enum(["certscore.failed-terminal-lane-evidence.v1", "certscore.failed-terminal-lane-evidence.v2"]),
  scanId: z.string().min(1).max(160),
  mode: z.literal("internal_only"), scoreEffect: z.literal("none"), productionProjectable: z.literal(false),
  lanes: z.array(z.object({
    lane: z.enum(["consent_proof", "runtime_evidence", "policy_evidence", "gpc_observation"]),
    status: z.enum(["verified_retained", "unverifiable", "failed"]),
    source: z.object({ uri: z.string().startsWith("s3://").max(1000), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.number().int().positive().max(20_000_000) }).strict().nullable(),
  }).strict()).max(4),
  runtimeVisitEligibility: runtimeVisitEligibilityDiagnosticSchema.optional(),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.lanes.map(l => l.lane)).size !== v.lanes.length || v.lanes.some(l => l.status === "verified_retained" && !l.source))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Verified lane outcomes require unique, retained sources." });
  if (v.runtimeVisitEligibility && (v.contractVersion !== "certscore.failed-terminal-lane-evidence.v2" ||
      !v.lanes.some(lane => lane.lane === "runtime_evidence" && lane.status === "verified_retained" && lane.source)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Runtime eligibility diagnostics require a v2 verified runtime source." });
});
export type TerminalLaneEvidence = z.infer<typeof terminalLaneEvidenceSchema>;
