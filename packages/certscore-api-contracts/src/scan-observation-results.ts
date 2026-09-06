import { z } from "zod";

export const apiV2PostRefusalObservationSchema = z.object({
  status: z.enum(["confirmed_observation", "confirmed_clean", "unconfirmed", "not_attempted", "unsupported", "aborted"]),
  refusalExercised: z.boolean(),
  observationCount: z.number().int().min(0),
  productionProjectable: z.boolean(),
  evidenceDisposition: z.enum(["confirmed", "indeterminate"]),
  indeterminateReason: z.string().min(1).max(160).nullable(),
  verdict: z.enum([
    "eligible_nonessential_activity_observed_after_confirmed_refusal",
    "retained_consent_signal_contradiction_observed_after_confirmed_refusal",
    "no_eligible_nonessential_activity_observed_during_completed_window",
    "no_confirmed_post_refusal_verdict",
  ]),
  interpretation: z.string().min(1).max(500),
  observationStrategy: z.enum(["stop_on_first_eligible_activity", "not_applicable"]),
  termination: z.object({
    kind: z.enum(["evidence_satisfied", "window_elapsed", "unavailable"]),
    intentional: z.boolean(),
    trigger: z.enum([
      "non_essential_request_observed",
      "non_essential_storage_write_observed",
      "refusal_signal_contradiction_observed",
      "window_elapsed",
      "reject_path_timeout",
      "worker_failed",
      "unavailable",
    ]),
  }).strict(),
  completedAt: z.string().nullable(),
  coverageLimitations: z.array(z.string()).max(24),
  /** @deprecated Use coverageLimitations. Retained for API compatibility. */
  limitations: z.array(z.string()).max(24),
}).strict();

export const apiV2PostAcceptObservationSchema = z.object({
  status: z.enum(["confirmed_observation", "confirmed_clean", "unconfirmed", "not_attempted", "unsupported", "aborted"]),
  acceptanceExercised: z.boolean(),
  observationCount: z.number().int().min(0),
  productionProjectable: z.boolean(),
  evidenceDisposition: z.enum(["confirmed", "indeterminate"]),
  indeterminateReason: z.string().min(1).max(160).nullable(),
  verdict: z.enum([
    "eligible_nonessential_activity_observed_after_confirmed_acceptance",
    "retained_consent_signal_contradiction_observed_after_confirmed_acceptance",
    "no_eligible_nonessential_activity_observed_during_completed_window",
    "no_confirmed_post_accept_verdict",
  ]),
  interpretation: z.string().min(1).max(500),
  observationStrategy: z.enum(["stop_on_first_eligible_activity", "not_applicable"]),
  termination: z.object({
    kind: z.enum(["evidence_satisfied", "window_elapsed", "unavailable"]),
    intentional: z.boolean(),
    trigger: z.enum([
      "non_essential_request_observed",
      "non_essential_storage_write_observed",
      "acceptance_signal_contradiction_observed",
      "window_elapsed",
      "accept_control_not_observed",
      "accept_path_timeout",
      "accept_observation_window_truncated",
      "worker_failed",
      "unavailable",
    ]),
  }).strict(),
  completedAt: z.string().nullable(),
  coverageLimitations: z.array(z.string()).max(24),
  /** @deprecated Use coverageLimitations. Retained for API compatibility. */
  limitations: z.array(z.string()).max(24),
}).strict();

export const apiV2GpcComparisonDeltaSchema = z.object({
  baselineCount: z.number().int().nonnegative(),
  gpcCount: z.number().int().nonnegative(),
  countDelta: z.number().int(),
  baselineOnly: z.array(z.string().min(1).max(500)).max(100),
  gpcOnly: z.array(z.string().min(1).max(500)).max(100),
  shared: z.array(z.string().min(1).max(500)).max(100),
  baselineOnlyCount: z.number().int().nonnegative().optional(),
  gpcOnlyCount: z.number().int().nonnegative().optional(),
  sharedCount: z.number().int().nonnegative().optional(),
  samplesTruncated: z.boolean().optional(),
}).strict();

const apiV2GpcResponseObjectSchema = z.object({
  contractVersion: z.enum(["certscore.gpc-response-assessment.v1", "certscore.gpc-response-assessment.v2"]).optional(),
  status: z.enum(["responsive", "no_observable_response", "indeterminate"]),
  findingTitle: z.enum(["GPC response", "No observable GPC response"]),
  summary: z.string().min(1).max(2_000),
  scoreEffect: z.literal("none"),
  legalInterpretation: z.literal("not_assessed"),
  comparison: z.object({
    comparable: z.boolean(),
    protocol: z.literal("passive_baseline_with_sec_gpc"),
    baselineArtifact: z.object({
      lane: z.literal("runtime_evidence"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sizeBytes: z.number().int().nonnegative(),
    }).strict().nullable(),
    gpcArtifact: z.object({
      lane: z.literal("gpc_observation"),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sizeBytes: z.number().int().nonnegative(),
    }).strict().nullable(),
    enabledProof: z.object({
      secGpcHeaderValue: z.literal("1").nullable(),
      requestsWithSecGpc: z.number().int().nonnegative(),
      requestEventIds: z.array(z.string().min(1).max(160)).max(100),
      navigatorGlobalPrivacyControl: z.boolean().nullable(),
    }).strict(),
    deltas: z.object({
      cookies: apiV2GpcComparisonDeltaSchema,
      trackers: apiV2GpcComparisonDeltaSchema,
      advertisingOrMeasurementActivity: apiV2GpcComparisonDeltaSchema,
      consentOrCmpBehavior: apiV2GpcComparisonDeltaSchema,
      webStorage: apiV2GpcComparisonDeltaSchema.optional(),
      advertisingOrMarketingActivity: apiV2GpcComparisonDeltaSchema.optional(),
    }).strict(),
    delivery: z.object({ status: z.enum(["verified", "limited", "unavailable"]) }).strict().optional(),
    coverage: z.object({ status: z.enum(["complete", "limited", "unavailable"]), comparedThroughMs: z.number().int().nonnegative().nullable() }).strict().optional(),
    responseBasis: z.enum(["qualified_activity_reduction", "no_qualified_reduction", "insufficient_evidence"]).optional(),
    limitationKeys: z.array(z.string().min(1).max(160)).max(24),
  }).strict(),
  californiaPolicy: z.object({
    applied: z.boolean(),
    deductionPoints: z.union([z.literal(0), z.literal(15)]),
  }).strict(),
  evidenceUrl: z.string().url(),
}).strict();

// Keep the public type named: embedding this schema in API, Pulse and MCP
// otherwise exceeds TypeScript's declaration-serialization limit.
export type ApiV2GpcResponse = z.infer<typeof apiV2GpcResponseObjectSchema>;
export const apiV2GpcResponseSchema: z.ZodType<ApiV2GpcResponse> = apiV2GpcResponseObjectSchema.superRefine((response, context) => {
  if (response.contractVersion === "certscore.gpc-response-assessment.v2") {
    const c = response.comparison;
    const determinate = response.status !== "indeterminate";
    if (!c.delivery || !c.coverage || !c.responseBasis || !c.deltas.webStorage || !c.deltas.advertisingOrMarketingActivity ||
      c.comparable !== determinate ||
      (determinate && (c.delivery.status !== "verified" || c.coverage.status !== "complete" ||
        !c.baselineArtifact || !c.gpcArtifact || c.enabledProof.navigatorGlobalPrivacyControl !== true ||
        c.enabledProof.secGpcHeaderValue !== "1" || c.enabledProof.requestsWithSecGpc < 1)) ||
      (!determinate && (response.californiaPolicy.applied || c.responseBasis !== "insufficient_evidence"))) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "GPC v2 delivery, coverage and outcome must agree." });
    }
    for (const delta of Object.values(c.deltas)) {
      const { baselineOnlyCount: b, gpcOnlyCount: g, sharedCount: s } = delta;
      const samples = [...delta.baselineOnly, ...delta.gpcOnly, ...delta.shared];
      if (b === undefined || g === undefined || s === undefined ||
        delta.baselineCount !== b + s || delta.gpcCount !== g + s || delta.countDelta !== g - b ||
        delta.baselineOnly.length !== Math.min(100, b) || delta.gpcOnly.length !== Math.min(100, g) ||
        delta.shared.length !== Math.min(100, s) || new Set(samples).size !== samples.length ||
        delta.samplesTruncated !== (Math.max(b, g, s) > 100)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "GPC v2 deltas require consistent full counts and bounded samples." });
      }
    }
    const reduced = (c.deltas.trackers.baselineOnlyCount ?? 0) > 0 && c.deltas.trackers.gpcOnlyCount === 0;
    if ((determinate && (c.limitationKeys.length > 0 || (c.coverage?.comparedThroughMs ?? 0) < 250 ||
        (response.status === "responsive") !== reduced ||
        c.responseBasis !== (reduced ? "qualified_activity_reduction" : "no_qualified_reduction"))) ||
      response.findingTitle !== (response.status === "no_observable_response" ? "No observable GPC response" : "GPC response")) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "GPC v2 outcome must match its comparison evidence." });
    }
  }
  if (response.californiaPolicy.applied !== (response.californiaPolicy.deductionPoints === 15)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "California GPC policy application must match its deduction.",
      path: ["californiaPolicy"],
    });
  }
});

export type ApiV2PostAcceptObservation = z.infer<typeof apiV2PostAcceptObservationSchema>;
export type ApiV2PostRefusalObservation = z.infer<typeof apiV2PostRefusalObservationSchema>;
