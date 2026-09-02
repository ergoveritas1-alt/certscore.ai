import { z } from "zod";

export const GPC_OBSERVATION_DISPATCH_CONTRACT_VERSION =
  "certscore.gpc-observation-dispatch.v1" as const;
export const GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION =
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

export const gpcResponseAssessmentSchema = z.object({
  contractVersion: z.literal(GPC_RESPONSE_ASSESSMENT_CONTRACT_VERSION),
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

export type GpcObservationDispatchConfig = z.infer<typeof gpcObservationDispatchConfigSchema>;
export type GpcComparisonDelta = z.infer<typeof gpcComparisonDeltaSchema>;
export type GpcResponseAssessment = z.infer<typeof gpcResponseAssessmentSchema>;
