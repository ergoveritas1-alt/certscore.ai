import { z } from "zod";

export const postRefusalRegistrationStatusSchema = z.enum([
  "confirmed",
  "unconfirmed",
  "not_attempted",
  "unsupported",
  "aborted",
]);

export const postRefusalResolverSchema = z.object({
  found: z.boolean(),
  method: z.enum([
    "local_fixture_recipe",
    "cmp_registry_recipe",
    "tcf_api_cmp_registry_recipe",
  ]),
  confidence: z.number().min(0).max(1),
  recipeId: z.string().min(1).max(160),
  cmpId: z.string().min(1).max(120).optional(),
  reason: z.string().max(240).optional(),
});

export const postRefusalRegistrationWitnessSchema = z.object({
  witnessType: z.enum([
    "cmp_storage_state",
    "tcf_user_action_complete",
    "cmp_cookie_state",
    "banner_transition",
  ]),
  observedAtMs: z.number().int().nonnegative(),
  key: z.string().max(160).optional(),
  expectedState: z.string().max(160).optional(),
  observedStateHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  corroboratingOnly: z.boolean().default(false),
});

export const postRefusalRegistrationSchema = z.object({
  status: postRefusalRegistrationStatusSchema,
  refusalExercised: z.boolean(),
  actionDispatchedAtMs: z.number().int().nonnegative().optional(),
  refusalRegisteredAtMs: z.number().int().nonnegative().optional(),
  reason: z.string().max(240).optional(),
  witnesses: z.array(postRefusalRegistrationWitnessSchema).max(8).default([]),
}).superRefine((registration, context) => {
  if (registration.status === "confirmed") {
    if (!registration.refusalExercised) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal registration must set refusalExercised=true.",
        path: ["refusalExercised"],
      });
    }
    if (registration.refusalRegisteredAtMs === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal registration requires refusalRegisteredAtMs.",
        path: ["refusalRegisteredAtMs"],
      });
    }
    if (!registration.witnesses.some((witness) => !witness.corroboratingOnly)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal registration requires a non-corroborating witness.",
        path: ["witnesses"],
      });
    }
  } else if (registration.refusalExercised) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed refusal registration must set refusalExercised=false.",
      path: ["refusalExercised"],
    });
  }
});

export const postRefusalNetworkRequestSchema = z.object({
  requestId: z.string().min(1).max(120),
  sanitizedUrl: z.string().max(500),
  hostname: z.string().max(255).optional(),
  resourceType: z.string().max(80),
  startedAtMs: z.number().int().nonnegative(),
  completedAtMs: z.number().int().nonnegative().optional(),
  inFlightAtRefusalRegistration: z.boolean(),
  msOffsetFromRefusal: z.number().int().optional(),
  vendor: z.string().max(160).optional(),
  purpose: z.enum([
    "analytics",
    "advertising",
    "session_replay",
    "consent_management",
    "tag_management",
    "infrastructure",
    "security",
    "performance_monitoring",
    "customer_support",
    "unknown",
  ]).optional(),
  nonEssential: z.boolean(),
});

export const postRefusalStorageItemSchema = z.object({
  storageType: z.enum(["cookie", "local_storage", "session_storage"]),
  name: z.string().min(1).max(180),
  valueHash: z.string().regex(/^[a-f0-9]{64}$/),
  vendor: z.string().max(160).optional(),
  purpose: postRefusalNetworkRequestSchema.shape.purpose,
  nonEssential: z.boolean(),
});

export const postRefusalStorageWriteSchema = z.object({
  storageType: z.enum(["cookie", "local_storage", "session_storage"]),
  name: z.string().min(1).max(180),
  observedAtMs: z.number().int().nonnegative(),
  msOffsetFromRefusal: z.number().int(),
  vendor: z.string().max(160).optional(),
  purpose: postRefusalNetworkRequestSchema.shape.purpose,
  nonEssential: z.boolean(),
});

export const postRefusalObservationSchema = z.object({
  observationType: z.enum([
    "post_refusal_non_essential_activity",
    "pre_consent_storage_not_cleared",
    "refusal_signal_contradicts_action",
  ]),
  observedAtMs: z.number().int().nonnegative(),
  vendor: z.string().max(160).optional(),
  storageName: z.string().max(180).optional(),
  requestId: z.string().max(120).optional(),
  msOffsetFromRefusal: z.number().int().nonnegative().optional(),
  evidenceKeys: z.array(z.string().max(160)).max(12).default([]),
});

export const postRefusalEvidencePacketSchema = z.object({
  artifactVersion: z.literal("certscore.post_refusal_evidence.v1"),
  artifactOnly: z.literal(true),
  productionProjectable: z.boolean(),
  scanId: z.string().min(1).max(160),
  parentScanId: z.string().min(1).max(160).optional(),
  targetUrl: z.string().url().max(500),
  normalizedUrl: z.string().url().max(500),
  observationBranch: z.literal("reject_only"),
  phase: z.literal("post_action"),
  consentAction: z.literal("reject"),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  resolver: postRefusalResolverSchema,
  refusalRegistration: postRefusalRegistrationSchema,
  observationWindowMs: z.number().int().nonnegative(),
  timing: z.object({
    dispatchDelayMs: z.number().int().nonnegative(),
    navigationMs: z.number().int().nonnegative(),
    resolverMs: z.number().int().nonnegative(),
    confirmationMs: z.number().int().nonnegative(),
    observationMs: z.number().int().nonnegative(),
    observationExitReason: z.enum([
      "window_elapsed",
      "non_essential_request_observed",
      "non_essential_storage_write_observed",
      "refusal_signal_contradiction_observed",
    ]).optional(),
    totalMs: z.number().int().nonnegative(),
    readyAtMs: z.number().int().nonnegative(),
  }),
  network: z.object({
    requests: z.array(postRefusalNetworkRequestSchema).max(96),
    postRefusalNonEssentialRequests: z.array(postRefusalNetworkRequestSchema).max(24),
    activeRequestIdsAtRefusalRegistration: z.array(z.string().max(120)).max(48),
  }),
  storage: z.object({
    preAction: z.array(postRefusalStorageItemSchema).max(96),
    postAction: z.array(postRefusalStorageItemSchema).max(96),
    writesAfterRefusal: z.array(postRefusalStorageWriteSchema).max(48),
    nonEssentialItemsPersistingAfterRefusal: z.array(postRefusalStorageItemSchema).max(24),
  }),
  observations: z.array(postRefusalObservationSchema).max(32),
  cancellation: z.object({
    requested: z.boolean(),
    observedAtMs: z.number().int().nonnegative().optional(),
    outcome: z.enum(["not_requested", "aborted_before_action", "too_late_action_dispatched"]),
  }),
  limitations: z.array(z.string().max(240)).max(24).default([]),
}).superRefine((packet, context) => {
  if (packet.refusalRegistration.status !== "confirmed" && packet.observations.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-refusal observations require confirmed refusal registration.",
      path: ["observations"],
    });
  }
  if (
    packet.refusalRegistration.status !== "confirmed" &&
    (packet.network.postRefusalNonEssentialRequests.length > 0 ||
      packet.storage.writesAfterRefusal.length > 0 ||
      packet.storage.nonEssentialItemsPersistingAfterRefusal.length > 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Scorable post-refusal evidence requires confirmed refusal registration.",
      path: ["refusalRegistration"],
    });
  }
});

export const postRefusalInteractionAuthorizationSchema = z.discriminatedUnion("kind", [
  z.object({
    authorizationId: z.literal("loopback_local_lab"),
    kind: z.literal("loopback"),
  }),
  z.object({
    authorizationId: z.literal("ergoveritas_owned_post_refusal_canary.v1"),
    kind: z.literal("owned_canary"),
  }),
  z.object({
    authorizationId: z.string().min(1).max(160),
    kind: z.literal("explicit_allowlist"),
    targets: z.array(z.object({
      hostname: z.string().min(1).max(255),
      pathPrefix: z.string().startsWith("/").max(300),
    })).min(1).max(24),
  }),
]);

export const postRefusalLambdaDispatchConfigSchema = z.object({
  enabled: z.literal(true),
  dispatchDelayMs: z.number().int().min(0).max(10_000).default(2_000),
  observationWindowMs: z.number().int().min(0).max(30_000).default(8_000),
  confirmationTimeoutMs: z.number().int().min(50).max(5_000).default(1_500),
  actionSearchTimeoutMs: z.number().int().min(0).max(10_000).default(1_500),
  cmpCanonicalName: z.string().min(1).max(120),
  confirmation: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("local_storage_equals"),
      key: z.string().min(1).max(160),
      expectedValue: z.string().max(240),
    }),
    z.object({
      kind: z.literal("tcf_purposes_denied"),
      purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(),
    }),
  ]),
  interactionAuthorization: postRefusalInteractionAuthorizationSchema,
});

export const POST_REFUSAL_LAMBDA_EVIDENCE_MESSAGE_VERSION =
  "certscore.v2.lambda-post-refusal-evidence-ready.v1" as const;

export const postRefusalLambdaEvidenceMessageSchema = z.object({
  artifactOnly: z.literal(true),
  contractVersion: z.literal(POST_REFUSAL_LAMBDA_EVIDENCE_MESSAGE_VERSION),
  generatedAt: z.string().datetime(),
  messageKind: z.literal("post_refusal_evidence_ready"),
  packetMetadata: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive(),
  }),
  packetPointer: z.string().startsWith("s3://").max(1_024),
  parentDispatchSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parentScanId: z.string().min(1).max(160),
  processor: z.literal("local-certscore-v2-dag-parallel-v1"),
  productionFindingIntegration: z.boolean(),
  refusalExercised: z.boolean(),
  observationCount: z.number().int().nonnegative(),
  scanId: z.string().min(1).max(160),
  status: z.enum([
    "confirmed_observation",
    "confirmed_clean",
    "unconfirmed",
    "not_attempted",
    "unsupported",
    "aborted",
  ]),
  targetEnvironment: z.enum(["local", "production"]),
}).superRefine((message, context) => {
  if (message.status.startsWith("confirmed_") && !message.refusalExercised) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed post-refusal evidence must set refusalExercised=true.",
      path: ["refusalExercised"],
    });
  }
  if (!message.status.startsWith("confirmed_") && message.observationCount > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed post-refusal evidence cannot report observations.",
      path: ["observationCount"],
    });
  }
});

export const POST_REFUSAL_REPORT_PROJECTION_VERSION =
  "certscore.post_refusal_report_projection.v1" as const;

const postRefusalReportActivityRowSchema = z.object({
  activityType: z.enum(["network_request", "storage_write"]),
  category: postRefusalNetworkRequestSchema.shape.purpose,
  consentState: z.literal("post_reject"),
  hostname: z.string().max(255).optional(),
  msAfterReject: z.number().int().nonnegative(),
  nonEssential: z.literal(true),
  requestId: z.string().max(120).optional(),
  storageName: z.string().max(180).optional(),
  storageType: z.enum(["cookie", "local_storage", "session_storage"]).optional(),
  url: z.string().max(500).optional(),
  vendor: z.string().max(160).optional(),
});

const postRefusalReportPersistedStorageRowSchema = z.object({
  category: postRefusalNetworkRequestSchema.shape.purpose,
  name: z.string().min(1).max(180),
  nonEssential: z.literal(true),
  storageType: z.enum(["cookie", "local_storage", "session_storage"]),
  vendor: z.string().max(160).optional(),
});

export const postRefusalReportProjectionSchema = z.object({
  contractVersion: z.literal(POST_REFUSAL_REPORT_PROJECTION_VERSION),
  completedAt: z.string().datetime(),
  contradictionObserved: z.boolean(),
  limitations: z.array(z.string().max(240)).max(24).default([]),
  observationCount: z.number().int().nonnegative(),
  observationWindowMs: z.number().int().nonnegative(),
  packetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  postRefusalActivity: z.array(postRefusalReportActivityRowSchema).max(48),
  preConsentStorageNotCleared: z.array(postRefusalReportPersistedStorageRowSchema).max(24),
  productionProjectable: z.boolean(),
  refusalExercised: z.boolean(),
  refusalRegisteredAtMs: z.number().int().nonnegative().optional(),
  registrationStatus: postRefusalRegistrationStatusSchema,
  resolverMethod: postRefusalResolverSchema.shape.method,
  status: z.enum([
    "confirmed_observation",
    "confirmed_clean",
    "unconfirmed",
    "not_attempted",
    "unsupported",
    "aborted",
  ]),
});

export function projectPostRefusalEvidenceForReport(input: {
  packet: PostRefusalEvidencePacket;
  packetSha256?: string;
}) {
  const packet = postRefusalEvidencePacketSchema.parse(input.packet);
  const confirmed = packet.refusalRegistration.status === "confirmed" &&
    packet.refusalRegistration.refusalExercised === true &&
    packet.refusalRegistration.refusalRegisteredAtMs !== undefined;
  const status = packet.refusalRegistration.status === "confirmed"
    ? packet.observations.length > 0 ? "confirmed_observation" : "confirmed_clean"
    : packet.refusalRegistration.status;
  const postRefusalActivity = confirmed
    ? [
        ...packet.network.postRefusalNonEssentialRequests
          .filter((request) =>
            request.nonEssential &&
            !request.inFlightAtRefusalRegistration &&
            typeof request.msOffsetFromRefusal === "number" &&
            request.msOffsetFromRefusal >= 0
          )
          .map((request) => ({
            activityType: "network_request" as const,
            ...(request.purpose ? { category: request.purpose } : {}),
            consentState: "post_reject" as const,
            ...(request.hostname ? { hostname: request.hostname } : {}),
            msAfterReject: request.msOffsetFromRefusal!,
            nonEssential: true as const,
            requestId: request.requestId,
            url: request.sanitizedUrl,
            ...(request.vendor ? { vendor: request.vendor } : {}),
          })),
        ...packet.storage.writesAfterRefusal
          .filter((write) => write.nonEssential && write.msOffsetFromRefusal >= 0)
          .map((write) => ({
            activityType: "storage_write" as const,
            ...(write.purpose ? { category: write.purpose } : {}),
            consentState: "post_reject" as const,
            msAfterReject: write.msOffsetFromRefusal,
            nonEssential: true as const,
            storageName: write.name,
            storageType: write.storageType,
            ...(write.vendor ? { vendor: write.vendor } : {}),
          })),
      ].slice(0, 48)
    : [];
  const preConsentStorageNotCleared = confirmed
    ? packet.storage.nonEssentialItemsPersistingAfterRefusal
        .filter((item) => item.nonEssential)
        .map((item) => ({
          ...(item.purpose ? { category: item.purpose } : {}),
          name: item.name,
          nonEssential: true as const,
          storageType: item.storageType,
          ...(item.vendor ? { vendor: item.vendor } : {}),
        }))
        .slice(0, 24)
    : [];

  return postRefusalReportProjectionSchema.parse({
    contractVersion: POST_REFUSAL_REPORT_PROJECTION_VERSION,
    completedAt: packet.completedAt,
    contradictionObserved: confirmed && packet.observations.some((observation) =>
      observation.observationType === "refusal_signal_contradicts_action"
    ),
    limitations: packet.limitations,
    observationCount: confirmed ? packet.observations.length : 0,
    observationWindowMs: packet.observationWindowMs,
    ...(input.packetSha256 ? { packetSha256: input.packetSha256 } : {}),
    postRefusalActivity,
    preConsentStorageNotCleared,
    productionProjectable: packet.productionProjectable && confirmed,
    refusalExercised: confirmed,
    ...(confirmed ? { refusalRegisteredAtMs: packet.refusalRegistration.refusalRegisteredAtMs } : {}),
    registrationStatus: packet.refusalRegistration.status,
    resolverMethod: packet.resolver.method,
    status,
  });
}

export const postRefusalSupplementEnvelopeSchema = z.object({
  artifactVersion: z.literal("certscore.post_refusal_supplement.v1"),
  artifactOnly: z.literal(true),
  productionProjectable: z.literal(false),
  parentScanId: z.string().min(1).max(160),
  baseEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  postRefusalPacketSha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  status: z.enum([
    "confirmed_observation",
    "confirmed_clean",
    "unconfirmed",
    "not_attempted",
    "unsupported",
    "aborted",
  ]),
  disposition: z.enum([
    "opportunistic_initial_join_candidate",
    "late_generation_candidate",
    "neutral_no_projection",
  ]),
  reportGeneration: z.object({
    baseGeneration: z.number().int().nonnegative(),
    candidateGeneration: z.number().int().positive(),
  }).optional(),
  observationCount: z.number().int().nonnegative(),
  refusalExercised: z.boolean(),
  limitations: z.array(z.string().max(240)).max(24).default([]),
}).superRefine((envelope, context) => {
  if (envelope.disposition === "neutral_no_projection" && envelope.reportGeneration) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Neutral supplements must not request a report generation.",
      path: ["reportGeneration"],
    });
  }
  if (envelope.disposition !== "neutral_no_projection" && !envelope.refusalExercised) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only confirmed refusal supplements may join a report generation.",
      path: ["refusalExercised"],
    });
  }
});

export type PostRefusalRegistrationStatus = z.infer<typeof postRefusalRegistrationStatusSchema>;
export type PostRefusalResolver = z.infer<typeof postRefusalResolverSchema>;
export type PostRefusalRegistration = z.infer<typeof postRefusalRegistrationSchema>;
export type PostRefusalNetworkRequest = z.infer<typeof postRefusalNetworkRequestSchema>;
export type PostRefusalStorageItem = z.infer<typeof postRefusalStorageItemSchema>;
export type PostRefusalStorageWrite = z.infer<typeof postRefusalStorageWriteSchema>;
export type PostRefusalObservation = z.infer<typeof postRefusalObservationSchema>;
export type PostRefusalEvidencePacket = z.infer<typeof postRefusalEvidencePacketSchema>;
export type PostRefusalSupplementEnvelope = z.infer<typeof postRefusalSupplementEnvelopeSchema>;
export type PostRefusalInteractionAuthorization = z.infer<typeof postRefusalInteractionAuthorizationSchema>;
export type PostRefusalLambdaDispatchConfig = z.infer<typeof postRefusalLambdaDispatchConfigSchema>;
export type PostRefusalLambdaEvidenceMessage = z.infer<typeof postRefusalLambdaEvidenceMessageSchema>;
export type PostRefusalReportProjection = z.infer<typeof postRefusalReportProjectionSchema>;
