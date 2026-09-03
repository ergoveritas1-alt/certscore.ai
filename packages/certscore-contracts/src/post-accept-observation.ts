import { z } from "zod";
import {
  postRefusalInteractionAuthorizationSchema,
  postRefusalInteractionDiagnosticsSchema,
  postRefusalNetworkRequestSchema,
  postRefusalResolverSchema,
  postRefusalStorageItemSchema,
  postRefusalStorageWriteSchema,
  postRefusalTcfStateSchema,
} from "./post-refusal-observation";
import { consentActionControlProofSchema } from "./consent-action-control-proof";
import {
  choicePathEvidenceDispositionSchema,
  deriveChoicePathEvidenceDisposition,
} from "./choice-path-evidence-disposition";

export const POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS = 3_000;

export const postAcceptRegistrationStatusSchema = z.enum([
  "confirmed",
  "unconfirmed",
  "not_attempted",
  "unsupported",
  "aborted",
]);

export const postAcceptRegistrationWitnessSchema = z.object({
  witnessType: z.enum([
    "cmp_storage_state",
    "cmp_api_state",
    "tcf_user_action_complete",
    "cmp_cookie_state",
    "canonical_acceptance_state",
    "banner_transition",
  ]),
  observedAtMs: z.number().int().nonnegative(),
  key: z.string().max(160).optional(),
  expectedState: z.string().max(160).optional(),
  observedStateHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  corroboratingOnly: z.boolean().default(false),
});

export const postAcceptRegistrationSchema = z.object({
  status: postAcceptRegistrationStatusSchema,
  acceptanceExercised: z.boolean(),
  actionDispatchedAtMs: z.number().int().nonnegative().optional(),
  acceptanceRegisteredAtMs: z.number().int().nonnegative().optional(),
  reason: z.string().max(240).optional(),
  witnesses: z.array(postAcceptRegistrationWitnessSchema).max(8).default([]),
}).superRefine((registration, context) => {
  if (registration.status === "confirmed") {
    if (!registration.acceptanceExercised) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed acceptance registration must set acceptanceExercised=true.",
        path: ["acceptanceExercised"],
      });
    }
    if (registration.acceptanceRegisteredAtMs === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed acceptance registration requires acceptanceRegisteredAtMs.",
        path: ["acceptanceRegisteredAtMs"],
      });
    }
    if (registration.actionDispatchedAtMs === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed acceptance registration requires actionDispatchedAtMs.",
        path: ["actionDispatchedAtMs"],
      });
    }
    if (
      registration.actionDispatchedAtMs !== undefined &&
      registration.acceptanceRegisteredAtMs !== undefined &&
      registration.acceptanceRegisteredAtMs < registration.actionDispatchedAtMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Acceptance registration cannot precede the Accept action.",
        path: ["acceptanceRegisteredAtMs"],
      });
    }
    if (!registration.witnesses.some((witness) => !witness.corroboratingOnly)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed acceptance registration requires a non-corroborating witness.",
        path: ["witnesses"],
      });
    }
  } else {
    if (registration.acceptanceExercised) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unconfirmed acceptance registration must set acceptanceExercised=false.",
        path: ["acceptanceExercised"],
      });
    }
    if (!registration.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unconfirmed acceptance registration requires an explicit reason.",
        path: ["reason"],
      });
    }
  }
});

export const postAcceptObservationSchema = z.object({
  observationType: z.enum([
    "post_accept_non_essential_activity",
    "acceptance_signal_contradicts_action",
  ]),
  observedAtMs: z.number().int().nonnegative(),
  vendor: z.string().max(160).optional(),
  hostname: z.string().max(255).optional(),
  storageType: z.enum(["cookie", "local_storage", "session_storage"]).optional(),
  storageName: z.string().max(180).optional(),
  storageIdentityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  requestId: z.string().max(120).optional(),
  msOffsetFromAccept: z.number().int().nonnegative().optional(),
  evidenceKeys: z.array(z.string().max(160)).max(12).default([]),
});

export const postAcceptNetworkRequestSchema = postRefusalNetworkRequestSchema.omit({
  inFlightAtRefusalRegistration: true,
  msOffsetFromRefusal: true,
}).extend({
  inFlightAtAcceptanceRegistration: z.boolean(),
  msOffsetFromAccept: z.number().int().optional(),
});

export const postAcceptStorageWriteSchema = postRefusalStorageWriteSchema.omit({
  msOffsetFromRefusal: true,
}).extend({
  identityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  msOffsetFromAccept: z.number().int().nonnegative(),
});

export const postAcceptEvidencePacketSchema = z.object({
  artifactVersion: z.literal("certscore.post_accept_evidence.v1"),
  artifactOnly: z.literal(true),
  productionProjectable: z.boolean(),
  scanId: z.string().min(1).max(160),
  parentScanId: z.string().min(1).max(160).optional(),
  exactTargetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  targetUrl: z.string().url().max(500),
  normalizedUrl: z.string().url().max(500),
  observationBranch: z.literal("accept_only"),
  phase: z.literal("post_action"),
  consentAction: z.literal("accept"),
  actionControlProof: consentActionControlProofSchema.optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  resolver: postRefusalResolverSchema,
  acceptanceRegistration: postAcceptRegistrationSchema,
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
      "acceptance_signal_contradiction_observed",
    ]).optional(),
    totalMs: z.number().int().nonnegative(),
    readyAtMs: z.number().int().nonnegative(),
  }),
  network: z.object({
    requests: z.array(postAcceptNetworkRequestSchema).max(96),
    postAcceptNonEssentialRequests: z.array(postAcceptNetworkRequestSchema).max(24),
    activeRequestIdsAtAcceptanceRegistration: z.array(z.string().max(120)).max(48),
  }),
  storage: z.object({
    preActionCapturedAtMs: z.number().int().nonnegative().optional(),
    postActionCapturedAtMs: z.number().int().nonnegative().optional(),
    preAction: z.array(postRefusalStorageItemSchema).max(96),
    postAction: z.array(postRefusalStorageItemSchema).max(96),
    writesAfterAccept: z.array(postAcceptStorageWriteSchema).max(48),
    itemsCreatedOrChangedAfterAccept: z.array(postRefusalStorageItemSchema).max(24),
  }),
  tcf: z.object({
    postAcceptState: postRefusalTcfStateSchema.optional(),
  }).optional(),
  interactionDiagnostics: postRefusalInteractionDiagnosticsSchema.optional(),
  observations: z.array(postAcceptObservationSchema).max(32),
  cancellation: z.object({
    requested: z.boolean(),
    observedAtMs: z.number().int().nonnegative().optional(),
    outcome: z.enum(["not_requested", "aborted_before_action", "too_late_action_dispatched"]),
  }),
  limitations: z.array(z.string().max(240)).max(24).default([]),
}).superRefine((packet, context) => {
  const acceptedAtMs = packet.acceptanceRegistration.acceptanceRegisteredAtMs;
  const confirmed = packet.acceptanceRegistration.status === "confirmed" &&
    packet.acceptanceRegistration.acceptanceExercised &&
    acceptedAtMs !== undefined;
  if (Date.parse(packet.completedAt) < Date.parse(packet.startedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-Accept packet completion cannot precede its start.",
      path: ["completedAt"],
    });
  }
  if (packet.productionProjectable && !confirmed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only semantically confirmed Accept evidence may be production-projectable.",
      path: ["productionProjectable"],
    });
  }
  if (packet.actionControlProof && packet.actionControlProof.action !== "accept") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-Accept evidence may retain only an Accept control proof.",
      path: ["actionControlProof", "action"],
    });
  }
  if (
    packet.productionProjectable &&
    packet.limitations.some((limitation) =>
      limitation === "observation_window_aborted_after_confirmed_acceptance" ||
      limitation.startsWith("observer_result_budget_exhausted")
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Truncated Post-Accept observation coverage cannot be production-projectable.",
      path: ["productionProjectable"],
    });
  }
  if (packet.observations.length > 0 && !confirmed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-Accept observations require semantically confirmed acceptance.",
      path: ["observations"],
    });
  }
  for (const request of packet.network.postAcceptNonEssentialRequests) {
    if (
      !request.nonEssential ||
      request.inFlightAtAcceptanceRegistration ||
      request.msOffsetFromAccept === undefined ||
      request.msOffsetFromAccept < 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-Accept requests must be direct, non-essential, and anchored after acceptance.",
        path: ["network", "postAcceptNonEssentialRequests"],
      });
      break;
    }
  }
  if (packet.storage.writesAfterAccept.some((write) => !write.nonEssential || write.msOffsetFromAccept < 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-Accept storage writes must be non-essential and acceptance-anchored.",
      path: ["storage", "writesAfterAccept"],
    });
  }
});

export const postAcceptLaneOutcomeSchema = z.object({
  contractVersion: z.literal("certscore.post_accept_lane_outcome.v1"),
  completedAt: z.string().datetime(),
  evidenceJoined: z.boolean(),
  maxTailWaitMs: z.number().int().min(0).max(30_000),
  status: z.enum(["joined", "not_applicable", "timed_out", "failed"]),
  limitationCode: z.enum([
    "accept_control_not_observed",
    "accept_path_timeout",
    "accept_path_worker_failed",
  ]).optional(),
}).superRefine((outcome, context) => {
  if (outcome.status === "joined" && (!outcome.evidenceJoined || outcome.limitationCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A joined Accept Path outcome must retain evidence without a coverage limitation.",
      path: ["evidenceJoined"],
    });
  }
  if (outcome.status !== "joined" && (outcome.evidenceJoined || !outcome.limitationCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A limited Accept Path outcome must retain a limitation and cannot claim joined evidence.",
      path: ["limitationCode"],
    });
  }
  if (
    (outcome.status === "not_applicable") !==
    (outcome.limitationCode === "accept_control_not_observed")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Accept-control absence is valid only for a non-applicable Accept Path outcome.",
      path: ["limitationCode"],
    });
  }
});

const postAcceptConfirmationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cmp_cookie_changed"),
    cookieName: z.string().min(1).max(160),
  }),
  z.object({
    kind: z.literal("cmp_cookie_names_changed"),
    cookieNames: z.array(z.string().min(1).max(160)).min(1).max(8),
  }),
  z.object({
    kind: z.literal("cmp_api_consent_state_changed"),
    provider: z.enum(["termly", "transcend"]),
  }),
  z.object({
    kind: z.literal("local_storage_equals"),
    key: z.string().min(1).max(160),
    expectedValue: z.string().max(240),
  }),
  z.object({
    kind: z.literal("tcf_purposes_granted_or_cmp_cookie_changed"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24),
    cookieName: z.string().min(1).max(160),
  }),
  z.object({
    kind: z.literal("tcf_purposes_granted_or_cmp_storage_keys_changed"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24),
    storageType: z.enum(["local_storage", "session_storage"]),
    keys: z.array(z.string().min(1).max(160)).min(1).max(8),
  }),
  z.object({
    kind: z.literal("cmp_cookie_values_equal"),
    cookies: z.array(z.object({
      expectedValue: z.string().max(240),
      name: z.string().min(1).max(160),
      path: z.string().startsWith("/").max(240),
    })).min(1).max(12),
  }),
]);

const postAcceptResolverConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("canonical_cmp_registry"),
    recipeSetId: z.enum([
      "canonical-consent-control-accept-v2",
      "canonical-consent-control-accept-v3",
    ]),
  }),
  z.object({
    kind: z.literal("named_cmp"),
    cmpCanonicalName: z.string().min(1).max(120),
    confirmation: postAcceptConfirmationSchema,
  }),
]);

export const postAcceptLambdaDispatchConfigSchema = z.object({
  enabled: z.literal(true),
  rolloutMode: z.enum(["owned_canary", "all_eligible"]).default("owned_canary"),
  dispatchDelayMs: z.number().int().min(0).max(10_000).default(1_000),
  observationWindowMs: z.number().int().min(0).max(30_000)
    .default(POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS),
  confirmationTimeoutMs: z.number().int().min(50).max(5_000).default(2_000),
  actionSearchTimeoutMs: z.number().int().min(0).max(15_000).default(14_000),
  resolver: postAcceptResolverConfigSchema,
  interactionAuthorization: postRefusalInteractionAuthorizationSchema,
}).superRefine((config, context) => {
  if (
    (config.interactionAuthorization.kind === "scan_target" ||
      config.interactionAuthorization.kind === "scan_target_resolution") &&
    config.rolloutMode !== "all_eligible"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ordinary exact-target authorization requires all_eligible Accept rollout mode.",
      path: ["rolloutMode"],
    });
  }
});

export const POST_ACCEPT_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION =
  "certscore.v2.lambda-post-accept-evidence-descriptor.v1" as const;

export const postAcceptLambdaEvidenceDescriptorSchema = z.object({
  artifactOnly: z.literal(true),
  contractVersion: z.literal(POST_ACCEPT_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION),
  generatedAt: z.string().datetime(),
  descriptorKind: z.literal("post_accept_evidence_descriptor"),
  packetMetadata: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sizeBytes: z.number().int().positive(),
  }),
  packetPointer: z.string().startsWith("s3://").max(1_024),
  parentDispatchSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parentScanId: z.string().min(1).max(160),
  processor: z.literal("local-certscore-v2-dag-parallel-v1"),
  productionFindingIntegration: z.boolean(),
  acceptanceExercised: z.boolean(),
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
});

export const POST_ACCEPT_REPORT_PROJECTION_VERSION =
  "certscore.post_accept_report_projection.v1" as const;

const postAcceptReportActivityRowSchema = z.object({
  activityType: z.enum(["network_request", "storage_write"]),
  category: postRefusalNetworkRequestSchema.shape.purpose,
  consentState: z.literal("post_accept"),
  hostname: z.string().max(255).optional(),
  msAfterAccept: z.number().int().nonnegative(),
  nonEssential: z.literal(true),
  requestId: z.string().max(120).optional(),
  storageName: z.string().max(180).optional(),
  storageIdentityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  storageType: z.enum(["cookie", "local_storage", "session_storage"]).optional(),
  url: z.string().max(500).optional(),
  vendor: z.string().max(160).optional(),
});

export const postAcceptReportProjectionSchema = z.object({
  contractVersion: z.literal(POST_ACCEPT_REPORT_PROJECTION_VERSION),
  completedAt: z.string().datetime(),
  actionControlProof: consentActionControlProofSchema.optional(),
  evidenceDisposition: choicePathEvidenceDispositionSchema.shape.disposition,
  indeterminateReason: choicePathEvidenceDispositionSchema.shape.reasonCode,
  contradictionObserved: z.boolean(),
  limitations: z.array(z.string().max(240)).max(24).default([]),
  observationCount: z.number().int().nonnegative(),
  observationWindowMs: z.number().int().nonnegative(),
  packetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  postAcceptActivity: z.array(postAcceptReportActivityRowSchema).max(48),
  productionProjectable: z.boolean(),
  acceptanceExercised: z.boolean(),
  acceptanceRegisteredAtMs: z.number().int().nonnegative().optional(),
  registrationStatus: postAcceptRegistrationStatusSchema,
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

export function projectPostAcceptEvidenceForReport(input: {
  packet: PostAcceptEvidencePacket;
  packetSha256?: string;
}) {
  const packet = postAcceptEvidencePacketSchema.parse(input.packet);
  const confirmed = packet.acceptanceRegistration.status === "confirmed" &&
    packet.acceptanceRegistration.acceptanceExercised === true &&
    packet.acceptanceRegistration.acceptanceRegisteredAtMs !== undefined;
  const status = packet.acceptanceRegistration.status === "confirmed"
    ? packet.observations.length > 0 ? "confirmed_observation" : "confirmed_clean"
    : packet.acceptanceRegistration.status;
  const evidenceDisposition = deriveChoicePathEvidenceDisposition({
    status,
    actionExercised: packet.acceptanceRegistration.acceptanceExercised,
    controlProofVerified: packet.actionControlProof?.action === "accept",
    productionProjectable: packet.productionProjectable,
    limitations: packet.limitations,
  });
  const postAcceptActivity = confirmed
    ? [
        ...packet.network.postAcceptNonEssentialRequests
          .filter((request) =>
            request.nonEssential &&
            !request.inFlightAtAcceptanceRegistration &&
            typeof request.msOffsetFromAccept === "number" &&
            request.msOffsetFromAccept >= 0
          )
          .map((request) => ({
            activityType: "network_request" as const,
            ...(request.purpose ? { category: request.purpose } : {}),
            consentState: "post_accept" as const,
            ...(request.hostname ? { hostname: request.hostname } : {}),
            msAfterAccept: request.msOffsetFromAccept!,
            nonEssential: true as const,
            requestId: request.requestId,
            url: request.sanitizedUrl,
            ...(request.vendor ? { vendor: request.vendor } : {}),
          })),
        ...packet.storage.writesAfterAccept
          .filter((write) => write.nonEssential && write.msOffsetFromAccept >= 0)
          .map((write) => ({
            activityType: "storage_write" as const,
            ...(write.purpose ? { category: write.purpose } : {}),
            consentState: "post_accept" as const,
            ...(write.hostname ? { hostname: write.hostname } : {}),
            msAfterAccept: write.msOffsetFromAccept,
            nonEssential: true as const,
            storageName: write.name,
            ...(write.identityHash ? { storageIdentityHash: write.identityHash } : {}),
            storageType: write.storageType,
            ...(write.vendor ? { vendor: write.vendor } : {}),
          })),
      ].slice(0, 48)
    : [];

  return postAcceptReportProjectionSchema.parse({
    contractVersion: POST_ACCEPT_REPORT_PROJECTION_VERSION,
    completedAt: packet.completedAt,
    ...(packet.actionControlProof ? { actionControlProof: packet.actionControlProof } : {}),
    evidenceDisposition: evidenceDisposition.disposition,
    indeterminateReason: evidenceDisposition.reasonCode,
    contradictionObserved: confirmed && packet.observations.some((observation) =>
      observation.observationType === "acceptance_signal_contradicts_action"
    ),
    limitations: packet.limitations,
    observationCount: confirmed ? packet.observations.length : 0,
    observationWindowMs: packet.observationWindowMs,
    ...(input.packetSha256 ? { packetSha256: input.packetSha256 } : {}),
    postAcceptActivity,
    productionProjectable: packet.productionProjectable && confirmed && Boolean(packet.actionControlProof),
    acceptanceExercised: confirmed,
    ...(confirmed
      ? { acceptanceRegisteredAtMs: packet.acceptanceRegistration.acceptanceRegisteredAtMs }
      : {}),
    registrationStatus: packet.acceptanceRegistration.status,
    resolverMethod: packet.resolver.method,
    status,
  });
}

export type PostAcceptRegistrationStatus = z.infer<typeof postAcceptRegistrationStatusSchema>;
export type PostAcceptRegistration = z.infer<typeof postAcceptRegistrationSchema>;
export type PostAcceptObservation = z.infer<typeof postAcceptObservationSchema>;
export type PostAcceptNetworkRequest = z.infer<typeof postAcceptNetworkRequestSchema>;
export type PostAcceptStorageWrite = z.infer<typeof postAcceptStorageWriteSchema>;
export type PostAcceptEvidencePacket = z.infer<typeof postAcceptEvidencePacketSchema>;
export type PostAcceptLaneOutcome = z.infer<typeof postAcceptLaneOutcomeSchema>;
export type PostAcceptLambdaDispatchConfig = z.infer<typeof postAcceptLambdaDispatchConfigSchema>;
export type PostAcceptLambdaEvidenceDescriptor = z.infer<typeof postAcceptLambdaEvidenceDescriptorSchema>;
export type PostAcceptReportProjection = z.infer<typeof postAcceptReportProjectionSchema>;
