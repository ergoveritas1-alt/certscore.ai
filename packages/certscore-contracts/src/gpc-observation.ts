import { z } from "zod";

export const GPC_OBSERVATION_DISPATCH_CONTRACT_VERSION =
  "certscore.gpc-observation-dispatch.v1" as const;
export const GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION =
  "certscore.gpc-response-assessment.v2" as const;
export const LEGACY_GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION =
  "certscore.gpc-response-assessment.v1" as const;

export const gpcObservationDispatchConfigSchema = z.object({
  contractVersion: z.literal(GPC_OBSERVATION_DISPATCH_CONTRACT_VERSION),
  enabled: z.literal(true),
  pairWithLane: z.literal("runtime_evidence"),
  protocol: z.literal("passive_baseline_with_sec_gpc"),
}).strict();

export const gpcArtifactPointerSchema = z.object({
  lane: z.enum(["runtime_evidence", "gpc_observation"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().nonnegative(),
  uri: z.string().min(1).max(2_000),
}).strict();

export const gpcComparisonDeltaSchema = z.object({
  baselineCount: z.number().int().nonnegative(),
  gpcCount: z.number().int().nonnegative(),
  countDelta: z.number().int(),
  baselineOnly: z.array(z.string().min(1).max(500)).max(100),
  gpcOnly: z.array(z.string().min(1).max(500)).max(100),
  shared: z.array(z.string().min(1).max(500)).max(100),
}).strict();

export const legacyGpcResponseAssessmentSchema = z.object({
  contractVersion: z.literal(LEGACY_GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION),
  generatedAt: z.string().datetime(),
  status: z.enum(["responsive", "no_observable_response", "indeterminate"]),
  findingTitle: z.enum(["GPC response", "No observable GPC response"]),
  scoreEffect: z.literal("none"),
  legalInterpretation: z.literal("not_assessed"),
  comparison: z.object({
    comparable: z.boolean(),
    protocol: z.literal("passive_baseline_with_sec_gpc"),
    baselineArtifact: gpcArtifactPointerSchema.extend({
      lane: z.literal("runtime_evidence"),
    }),
    gpcArtifact: gpcArtifactPointerSchema.extend({
      lane: z.literal("gpc_observation"),
    }),
    enabledProof: z.object({
      secGpcHeaderValue: z.literal("1"),
      requestsWithSecGpc: z.number().int().nonnegative(),
      requestEventIds: z.array(z.string().min(1).max(160)).max(100),
      navigatorGlobalPrivacyControl: z.literal(true),
    }).strict(),
    deltas: z.object({
      cookies: gpcComparisonDeltaSchema,
      trackers: gpcComparisonDeltaSchema,
      advertisingOrMeasurementActivity: gpcComparisonDeltaSchema,
      consentOrCmpBehavior: gpcComparisonDeltaSchema,
    }).strict(),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(32),
    limitationKeys: z.array(z.string().min(1).max(160)).max(24),
  }).strict(),
}).strict().superRefine((assessment, context) => {
  const expectedTitle = assessment.status === "no_observable_response"
    ? "No observable GPC response"
    : "GPC response";
  if (assessment.findingTitle !== expectedTitle) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GPC response title must match the typed assessment status.",
      path: ["findingTitle"],
    });
  }
  if (assessment.comparison.comparable !== (assessment.status !== "indeterminate")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only comparable GPC evidence may produce a determinate response status.",
      path: ["comparison", "comparable"],
    });
  }
  if (
    assessment.status !== "indeterminate" &&
    (assessment.comparison.enabledProof.requestsWithSecGpc === 0 ||
      assessment.comparison.enabledProof.requestEventIds.length === 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A determinate GPC response requires retained Sec-GPC request evidence.",
      path: ["comparison", "enabledProof"],
    });
  }
});

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const countSchema = z.number().int().nonnegative();

/** Same-session readback, not a claim that configuring the browser succeeded. */
export const gpcSignalObservationSchema = z.object({
  contractVersion: z.literal("certscore.gpc-signal-observation.v1"),
  expectedEnabled: z.boolean(),
  documentUrlSha256: hashSchema,
  contextConfigSha256: hashSchema,
  capturedAtMs: countSchema,
  documentStartedAtMs: countSchema,
  frameCount: countSchema,
  frames: z.array(z.object({
    documentUrlSha256: hashSchema,
    mainFrame: z.boolean(),
    navigatorValue: z.boolean().nullable(),
  }).strict()).max(32),
  workerCount: countSchema,
  limitationKeys: z.array(z.string().min(1).max(160)).max(12),
}).strict();

export const gpcCompleteComparisonDeltaSchema = gpcComparisonDeltaSchema.extend({
  baselineOnlyCount: countSchema,
  gpcOnlyCount: countSchema,
  sharedCount: countSchema,
  samplesTruncated: z.boolean(),
}).superRefine((delta, ctx) => {
  const valid = delta.baselineCount === delta.baselineOnlyCount + delta.sharedCount &&
    delta.gpcCount === delta.gpcOnlyCount + delta.sharedCount &&
    delta.countDelta === delta.gpcCount - delta.baselineCount &&
    (["baselineOnly", "gpcOnly", "shared"] as const).every((key) =>
      delta[key].length === Math.min(100, delta[`${key}Count`]) && new Set(delta[key]).size === delta[key].length
    ) &&
    !delta.baselineOnly.some((value) => delta.gpcOnly.includes(value) || delta.shared.includes(value)) &&
    !delta.gpcOnly.some((value) => delta.shared.includes(value)) &&
    delta.samplesTruncated === [delta.baselineOnlyCount, delta.gpcOnlyCount, delta.sharedCount].some((n) => n > 100);
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC delta samples and full-set counts must agree." });
});

export const gpcResponseAssessmentV2Schema = z.object({
  contractVersion: z.literal(GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION),
  generatedAt: z.string().datetime(),
  status: z.enum(["responsive", "no_observable_response", "indeterminate"]),
  findingTitle: z.enum(["GPC response", "No observable GPC response"]),
  scoreEffect: z.literal("none"),
  legalInterpretation: z.literal("not_assessed"),
  comparison: z.object({
    comparable: z.boolean(),
    protocol: z.literal("passive_baseline_with_sec_gpc"),
    baselineArtifact: gpcArtifactPointerSchema.extend({ lane: z.literal("runtime_evidence") }).nullable(),
    gpcArtifact: gpcArtifactPointerSchema.extend({ lane: z.literal("gpc_observation") }).nullable(),
    enabledProof: z.object({
      secGpcHeaderValue: z.literal("1").nullable(),
      requestsWithSecGpc: countSchema,
      requestEventIds: z.array(z.string().min(1).max(160)).max(100),
      navigatorGlobalPrivacyControl: z.boolean().nullable(),
    }).strict(),
    delivery: z.object({
      status: z.enum(["verified", "limited", "unavailable"]),
      baseline: gpcSignalObservationSchema.nullable(),
      gpc: gpcSignalObservationSchema.nullable(),
    }).strict(),
    coverage: z.object({
      status: z.enum(["complete", "limited", "unavailable"]),
      comparedThroughMs: countSchema.nullable(),
    }).strict(),
    responseBasis: z.enum(["qualified_activity_reduction", "no_qualified_reduction", "insufficient_evidence"]),
    deltas: z.object({
      cookies: gpcCompleteComparisonDeltaSchema,
      webStorage: gpcCompleteComparisonDeltaSchema,
      trackers: gpcCompleteComparisonDeltaSchema,
      advertisingOrMeasurementActivity: gpcCompleteComparisonDeltaSchema,
      advertisingOrMarketingActivity: gpcCompleteComparisonDeltaSchema,
      consentOrCmpBehavior: gpcCompleteComparisonDeltaSchema,
    }).strict(),
    evidenceRefs: z.array(z.string().min(1).max(500)).max(32),
    limitationKeys: z.array(z.string().min(1).max(160)).max(24),
  }).strict(),
}).superRefine((assessment, ctx) => {
  const c = assessment.comparison;
  const determinate = assessment.status !== "indeterminate";
  const proofValid = (proof: z.infer<typeof gpcSignalObservationSchema> | null, expected: boolean) =>
    proof !== null && proof.expectedEnabled === expected && proof.frames.length === proof.frameCount &&
    proof.frames.length > 0 && proof.frames.filter((frame) => frame.mainFrame).length === 1 &&
    proof.frames.find((frame) => frame.mainFrame)?.documentUrlSha256 === proof.documentUrlSha256 &&
    proof.frames.every((frame) => frame.navigatorValue === expected) && proof.workerCount === 0 &&
    proof.limitationKeys.length === 0;
  const deliveryVerified = proofValid(c.delivery.baseline, false) && proofValid(c.delivery.gpc, true) &&
    c.enabledProof.secGpcHeaderValue === "1" && c.enabledProof.navigatorGlobalPrivacyControl === true &&
    c.enabledProof.requestsWithSecGpc > 0 && c.enabledProof.requestEventIds.length > 0;
  const sameContext = c.delivery.baseline !== null && c.delivery.gpc !== null &&
    c.delivery.baseline.documentUrlSha256 === c.delivery.gpc.documentUrlSha256 &&
    c.delivery.baseline.contextConfigSha256 === c.delivery.gpc.contextConfigSha256 &&
    c.coverage.comparedThroughMs === Math.min(
      c.delivery.baseline.capturedAtMs - c.delivery.baseline.documentStartedAtMs,
      c.delivery.gpc.capturedAtMs - c.delivery.gpc.documentStartedAtMs) &&
    (c.coverage.comparedThroughMs ?? 0) >= 250;
  const reduced = c.deltas.trackers.baselineOnlyCount > 0 && c.deltas.trackers.gpcOnlyCount === 0;
  if (c.comparable !== determinate ||
    assessment.findingTitle !== (assessment.status === "no_observable_response" ? "No observable GPC response" : "GPC response") ||
    (c.delivery.status === "verified" && !deliveryVerified) ||
    (determinate && (!c.baselineArtifact || !c.gpcArtifact || c.delivery.status !== "verified" ||
      c.coverage.status !== "complete" || !sameContext || c.limitationKeys.length > 0)) ||
    (assessment.status === "responsive" && (!reduced || c.responseBasis !== "qualified_activity_reduction")) ||
    (assessment.status === "no_observable_response" && (reduced || c.responseBasis !== "no_qualified_reduction")) ||
    (!determinate && c.responseBasis !== "insufficient_evidence")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "GPC v2 outcome requires consistent delivery, coverage and response evidence." });
  }
});

// Stored v1 evidence is preserved on read, never silently upgraded to v2 proof.
export const gpcResponseAssessmentSchema = z.union([gpcResponseAssessmentV2Schema, legacyGpcResponseAssessmentSchema]);
export type GpcSignalObservation = z.infer<typeof gpcSignalObservationSchema>;
export type GpcCompleteComparisonDelta = z.infer<typeof gpcCompleteComparisonDeltaSchema>;
export type GpcResponseAssessmentV2 = z.infer<typeof gpcResponseAssessmentV2Schema>;
export type GpcObservationDispatchConfig = z.infer<typeof gpcObservationDispatchConfigSchema>;
export type GpcComparisonDelta = z.infer<typeof gpcComparisonDeltaSchema>;
export type GpcResponseAssessment = z.infer<typeof gpcResponseAssessmentSchema>;
