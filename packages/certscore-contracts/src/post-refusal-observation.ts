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
    "owned_site_recipe",
    "canonical_consent_control_registry_recipe",
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
    "canonical_refusal_state",
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
    if (registration.actionDispatchedAtMs === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal registration requires actionDispatchedAtMs.",
        path: ["actionDispatchedAtMs"],
      });
    }
    if (
      registration.actionDispatchedAtMs !== undefined &&
      registration.refusalRegisteredAtMs !== undefined &&
      registration.refusalRegisteredAtMs < registration.actionDispatchedAtMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Refusal registration cannot precede the reject action.",
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
  } else {
    if (registration.refusalExercised) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unconfirmed refusal registration must set refusalExercised=false.",
        path: ["refusalExercised"],
      });
    }
    if (!registration.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unconfirmed refusal registration requires an explicit reason.",
        path: ["reason"],
      });
    }
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
  hostname: z.string().max(255).optional(),
  identityBasis: z.enum([
    "cookie_name_domain_path_partition",
    "origin_storage_key",
  ]).optional(),
  identityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  valueHash: z.string().regex(/^[a-f0-9]{64}$/),
  vendor: z.string().max(160).optional(),
  purpose: postRefusalNetworkRequestSchema.shape.purpose,
  nonEssential: z.boolean(),
}).superRefine((item, context) => {
  if ((item.identityBasis === undefined) !== (item.identityHash === undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Storage identity basis and hash must be retained together.",
      path: ["identityHash"],
    });
  }
  if (
    item.identityBasis === "cookie_name_domain_path_partition" &&
    item.storageType !== "cookie"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cookie identity evidence may be used only for cookie storage.",
      path: ["identityBasis"],
    });
  }
  if (
    item.identityBasis === "origin_storage_key" &&
    item.storageType === "cookie"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Origin storage-key identity evidence may not describe a cookie.",
      path: ["identityBasis"],
    });
  }
});

export const postRefusalStorageWriteSchema = z.object({
  storageType: z.enum(["cookie", "local_storage", "session_storage"]),
  name: z.string().min(1).max(180),
  hostname: z.string().max(255).optional(),
  observedAtMs: z.number().int().nonnegative(),
  msOffsetFromRefusal: z.number().int().nonnegative(),
  evidenceSource: z.enum(["instrumented_write", "post_action_snapshot_delta"]).optional(),
  vendor: z.string().max(160).optional(),
  purpose: postRefusalNetworkRequestSchema.shape.purpose,
  nonEssential: z.boolean(),
});

export const postRefusalTcfStateSchema = z.object({
  observedAtMs: z.number().int().nonnegative(),
  eventStatus: z.string().max(80).optional(),
  apiSuccess: z.boolean(),
  tcStringHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  tcStringParseStatus: z.enum([
    "parsed_v2",
    "missing",
    "invalid",
    "unsupported_version",
  ]),
  purposeGrantedIds: z.array(z.number().int().min(1).max(24)).max(24),
  purposeGrantSource: z.enum(["tc_string", "tcf_api", "none"]),
}).superRefine((state, context) => {
  if (new Set(state.purposeGrantedIds).size !== state.purposeGrantedIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TCF purpose grants must not contain duplicate purpose IDs.",
      path: ["purposeGrantedIds"],
    });
  }
  if (state.purposeGrantSource === "none" && state.purposeGrantedIds.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TCF purpose grants require a retained grant source.",
      path: ["purposeGrantSource"],
    });
  }
  if (
    state.purposeGrantSource === "tc_string" &&
    (state.tcStringParseStatus !== "parsed_v2" || !state.tcStringHash)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TC-string purpose grants require a parsed v2 string hash.",
      path: ["tcStringParseStatus"],
    });
  }
  if (state.purposeGrantSource === "tcf_api" && !state.apiSuccess) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "TCF API purpose grants require a successful API response.",
      path: ["apiSuccess"],
    });
  }
});

export const postRefusalObservationSchema = z.object({
  observationType: z.enum([
    "post_refusal_non_essential_activity",
    "pre_consent_storage_not_cleared",
    "refusal_signal_contradicts_action",
  ]),
  observedAtMs: z.number().int().nonnegative(),
  vendor: z.string().max(160).optional(),
  hostname: z.string().max(255).optional(),
  storageType: z.enum(["cookie", "local_storage", "session_storage"]).optional(),
  storageName: z.string().max(180).optional(),
  storageIdentityHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  storageValueHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  requestId: z.string().max(120).optional(),
  msOffsetFromRefusal: z.number().int().nonnegative().optional(),
  evidenceKeys: z.array(z.string().max(160)).max(12).default([]),
});

export const postRefusalInteractionDiagnosticsSchema = z.object({
  navigation: z.object({
    outcome: z.enum(["completed", "recovered_after_error", "failed"]),
    failureClass: z.enum([
      "aborted",
      "navigation_replaced",
      "timeout",
      "dns",
      "tls",
      "connection",
      "http2_protocol",
      "quic_protocol",
      "other",
    ]).optional(),
    recoveryMethod: z.enum(["committed_document", "headed_local_retry"]).optional(),
    documentCommitted: z.boolean(),
    finalUrlAuthorized: z.boolean(),
    redirectResolution: z.object({
      durationMs: z.number().int().nonnegative(),
      failureReason: z.enum([
        "abort_requested",
        "invalid_requested_target",
        "redirect_limit_exceeded",
        "redirect_location_invalid",
        "request_failed",
        "resolution_timeout",
        "scan_identity_mismatch",
        "unsafe_redirect_target",
      ]).optional(),
      finalExactTargetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      redirectCount: z.number().int().min(0).max(8),
      requestedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/),
      status: z.enum(["resolved", "failed"]),
    }).optional(),
  }),
  click: z.object({
    outcome: z.enum([
      "not_attempted",
      "completed",
      "confirmed_after_error",
      "failed_before_dispatch",
      "failed_after_dispatch",
    ]),
    failureClass: z.enum([
      "actionability_timeout",
      "detached",
      "intercepted",
      "navigation",
      "other",
    ]).optional(),
    reResolvedBeforeDispatch: z.boolean(),
    confirmationCheckedAfterError: z.boolean(),
    actionability: z.object({
      controlVisible: z.boolean(),
      controlEnabled: z.boolean(),
      boundingBoxInViewport: z.boolean(),
      centerHitTargetRelation: z.enum([
        "control_or_descendant",
        "other_element",
        "no_hit_target",
        "unavailable",
      ]),
    }).optional(),
  }),
}).superRefine((diagnostics, context) => {
  if (
    diagnostics.navigation.redirectResolution?.status === "resolved" &&
    (
      diagnostics.navigation.redirectResolution.failureReason !== undefined ||
      diagnostics.navigation.redirectResolution.finalExactTargetSha256 === undefined
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Resolved redirect authorization requires the final exact-target hash and no failure reason.",
      path: ["navigation", "redirectResolution"],
    });
  }
  if (
    diagnostics.navigation.redirectResolution?.status === "failed" &&
    (
      diagnostics.navigation.redirectResolution.failureReason === undefined ||
      diagnostics.navigation.redirectResolution.finalExactTargetSha256 !== undefined ||
      diagnostics.navigation.finalUrlAuthorized
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Failed redirect authorization requires a typed failure and cannot authorize a final URL.",
      path: ["navigation", "redirectResolution"],
    });
  }
  if (
    diagnostics.navigation.outcome === "recovered_after_error" &&
    (
      diagnostics.navigation.failureClass === undefined ||
      !diagnostics.navigation.documentCommitted ||
      !diagnostics.navigation.finalUrlAuthorized ||
      diagnostics.navigation.recoveryMethod === undefined
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Recovered navigation requires a typed failure and a committed authorized document.",
      path: ["navigation"],
    });
  }
  if (
    diagnostics.click.outcome === "confirmed_after_error" &&
    (diagnostics.click.failureClass === undefined || !diagnostics.click.confirmationCheckedAfterError)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Click-error confirmation requires a typed failure and an executed confirmation check.",
      path: ["click"],
    });
  }
  if (
    diagnostics.click.outcome === "failed_after_dispatch" &&
    (diagnostics.click.failureClass === undefined || !diagnostics.click.confirmationCheckedAfterError)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-dispatch click failure requires a typed failure and an executed confirmation check.",
      path: ["click"],
    });
  }
});

export const postRefusalEvidencePacketSchema = z.object({
  artifactVersion: z.literal("certscore.post_refusal_evidence.v1"),
  artifactOnly: z.literal(true),
  productionProjectable: z.boolean(),
  scanId: z.string().min(1).max(160),
  parentScanId: z.string().min(1).max(160).optional(),
  exactTargetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
    preActionCapturedAtMs: z.number().int().nonnegative().optional(),
    postActionCapturedAtMs: z.number().int().nonnegative().optional(),
    preAction: z.array(postRefusalStorageItemSchema).max(96),
    postAction: z.array(postRefusalStorageItemSchema).max(96),
    writesAfterRefusal: z.array(postRefusalStorageWriteSchema).max(48),
    nonEssentialItemsPersistingAfterRefusal: z.array(postRefusalStorageItemSchema).max(24),
  }),
  tcf: z.object({
    postRefusalState: postRefusalTcfStateSchema.optional(),
  }).optional(),
  interactionDiagnostics: postRefusalInteractionDiagnosticsSchema.optional(),
  observations: z.array(postRefusalObservationSchema).max(32),
  cancellation: z.object({
    requested: z.boolean(),
    observedAtMs: z.number().int().nonnegative().optional(),
    outcome: z.enum(["not_requested", "aborted_before_action", "too_late_action_dispatched"]),
  }),
  limitations: z.array(z.string().max(240)).max(24).default([]),
}).superRefine((packet, context) => {
  const refusalRegisteredAtMs = packet.refusalRegistration.refusalRegisteredAtMs;
  const confirmed = packet.refusalRegistration.status === "confirmed" &&
    packet.refusalRegistration.refusalExercised &&
    refusalRegisteredAtMs !== undefined;
  if (Date.parse(packet.completedAt) < Date.parse(packet.startedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-refusal packet completion cannot precede its start.",
      path: ["completedAt"],
    });
  }
  if (confirmed && !packet.resolver.found) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed refusal requires a deterministically resolved control.",
      path: ["resolver", "found"],
    });
  }
  if (
    confirmed &&
    packet.interactionDiagnostics &&
    packet.interactionDiagnostics.click.outcome !== "completed" &&
    packet.interactionDiagnostics.click.outcome !== "confirmed_after_error"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed refusal requires a completed action or semantic confirmation after a click error.",
      path: ["interactionDiagnostics", "click", "outcome"],
    });
  }
  if (
    packet.interactionDiagnostics?.click.outcome === "failed_before_dispatch" &&
    packet.refusalRegistration.actionDispatchedAtMs !== undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A pre-dispatch actionability failure cannot retain an action-dispatch timestamp.",
      path: ["refusalRegistration", "actionDispatchedAtMs"],
    });
  }
  if (packet.productionProjectable && !confirmed) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only confirmed refusal evidence may be production-projectable.",
      path: ["productionProjectable"],
    });
  }
  if (confirmed) {
    const preActionCapturedAtMs = packet.storage.preActionCapturedAtMs;
    const postActionCapturedAtMs = packet.storage.postActionCapturedAtMs;
    if (
      preActionCapturedAtMs === undefined ||
      packet.refusalRegistration.actionDispatchedAtMs === undefined ||
      preActionCapturedAtMs > packet.refusalRegistration.actionDispatchedAtMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal requires a pre-action storage snapshot captured before the action.",
        path: ["storage", "preActionCapturedAtMs"],
      });
    }
    if (
      postActionCapturedAtMs === undefined ||
      refusalRegisteredAtMs === undefined ||
      postActionCapturedAtMs < refusalRegisteredAtMs ||
      (preActionCapturedAtMs !== undefined && postActionCapturedAtMs < preActionCapturedAtMs)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confirmed refusal requires a post-action storage snapshot captured after registration.",
        path: ["storage", "postActionCapturedAtMs"],
      });
    }
  }
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
  const retainedRequestIds = new Set<string>();
  for (const request of packet.network.requests) {
    if (retainedRequestIds.has(request.requestId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Retained post-refusal request IDs must be unique.",
        path: ["network", "requests"],
      });
      break;
    }
    retainedRequestIds.add(request.requestId);
  }
  for (const request of packet.network.postRefusalNonEssentialRequests) {
    if (
      !request.nonEssential ||
      request.inFlightAtRefusalRegistration ||
      request.msOffsetFromRefusal === undefined ||
      request.msOffsetFromRefusal < 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-refusal request evidence must be non-essential, start after refusal, and not inherit in-flight work.",
        path: ["network", "postRefusalNonEssentialRequests"],
      });
      break;
    }
    const retainedRequest = packet.network.requests.find((candidate) =>
      candidate.requestId === request.requestId
    );
    if (!retainedRequest || JSON.stringify(retainedRequest) !== JSON.stringify(request)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-refusal request evidence must exactly reference a retained request row.",
        path: ["network", "postRefusalNonEssentialRequests"],
      });
      break;
    }
    if (
      refusalRegisteredAtMs === undefined ||
      request.startedAtMs < refusalRegisteredAtMs ||
      request.msOffsetFromRefusal !== request.startedAtMs - refusalRegisteredAtMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-refusal request timing must be anchored to refusal registration.",
        path: ["network", "postRefusalNonEssentialRequests"],
      });
      break;
    }
  }
  for (const write of packet.storage.writesAfterRefusal) {
    if (
      refusalRegisteredAtMs === undefined ||
      write.observedAtMs < refusalRegisteredAtMs ||
      write.msOffsetFromRefusal !== write.observedAtMs - refusalRegisteredAtMs
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-refusal storage-write timing must be anchored to refusal registration.",
        path: ["storage", "writesAfterRefusal"],
      });
      break;
    }
  }
  for (const item of packet.storage.nonEssentialItemsPersistingAfterRefusal) {
    const existedBefore = packet.storage.preAction.some((candidate) =>
      sameRetainedStorageIdentity(candidate, item) &&
      candidate.valueHash === item.valueHash &&
      candidate.nonEssential
    );
    const retainedAfter = packet.storage.postAction.some((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(item)
    );
    if (!item.nonEssential || !existedBefore || !retainedAfter) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Persisted non-essential storage must be bound to both retained snapshots.",
        path: ["storage", "nonEssentialItemsPersistingAfterRefusal"],
      });
      break;
    }
  }
  for (const observation of packet.observations) {
    if (
      refusalRegisteredAtMs === undefined ||
      observation.observedAtMs < refusalRegisteredAtMs ||
      (
        observation.msOffsetFromRefusal !== undefined &&
        observation.msOffsetFromRefusal !== observation.observedAtMs - refusalRegisteredAtMs
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Post-refusal observations must be anchored to refusal registration.",
        path: ["observations"],
      });
    }
    if (observation.observationType === "post_refusal_non_essential_activity") {
      const hasRequestReference = observation.requestId !== undefined;
      const hasStorageReference = observation.storageName !== undefined ||
        observation.storageType !== undefined ||
        observation.hostname !== undefined;
      const requestMatch = hasRequestReference && !hasStorageReference &&
        packet.network.postRefusalNonEssentialRequests.some((request) =>
          request.requestId === observation.requestId &&
          request.startedAtMs === observation.observedAtMs &&
          request.vendor === observation.vendor
        );
      const writeMatch = !hasRequestReference &&
        observation.storageName !== undefined &&
        observation.storageType !== undefined &&
        packet.storage.writesAfterRefusal.some((write) =>
          write.nonEssential &&
          write.name === observation.storageName &&
          write.storageType === observation.storageType &&
          write.hostname === observation.hostname &&
          write.observedAtMs === observation.observedAtMs &&
          write.vendor === observation.vendor
        );
      if (!requestMatch && !writeMatch) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Post-refusal activity observations must reference retained request or storage-write evidence.",
          path: ["observations"],
        });
      }
    }
    if (
      observation.observationType === "pre_consent_storage_not_cleared" &&
      (
        observation.requestId !== undefined ||
        observation.storageName === undefined ||
        observation.storageType === undefined ||
        observation.observedAtMs !== packet.storage.postActionCapturedAtMs ||
        !packet.storage.nonEssentialItemsPersistingAfterRefusal.some((item) =>
          item.name === observation.storageName &&
          item.storageType === observation.storageType &&
          item.hostname === observation.hostname &&
          item.vendor === observation.vendor &&
          (item.identityHash === undefined
            ? observation.storageIdentityHash === undefined
            : item.identityHash === observation.storageIdentityHash) &&
          (item.identityHash === undefined && observation.storageValueHash === undefined
            ? true
            : item.valueHash === observation.storageValueHash)
        )
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Uncleared-storage observations must reference a retained persisted storage row.",
        path: ["observations"],
      });
    }
    if (
      observation.observationType === "refusal_signal_contradicts_action" &&
      (!packet.tcf?.postRefusalState ||
        packet.tcf.postRefusalState.purposeGrantedIds.length === 0 ||
        observation.observedAtMs !== packet.tcf.postRefusalState.observedAtMs ||
        observation.requestId !== undefined ||
        observation.hostname !== undefined ||
        observation.storageName !== undefined ||
        observation.storageType !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TCF contradiction observations require at least one retained granted purpose.",
        path: ["observations"],
      });
    }
  }
  if (
    packet.tcf?.postRefusalState &&
    (
      refusalRegisteredAtMs === undefined ||
      packet.tcf.postRefusalState.observedAtMs < refusalRegisteredAtMs
    )
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Post-refusal TCF state must be observed after refusal registration.",
      path: ["tcf", "postRefusalState", "observedAtMs"],
    });
  }
  if (
    packet.cancellation.requested !== (packet.cancellation.outcome !== "not_requested") ||
    packet.cancellation.requested !== (packet.cancellation.observedAtMs !== undefined)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cancellation outcome, request flag, and observation timestamp must agree.",
      path: ["cancellation"],
    });
  }
});

function sameRetainedStorageIdentity(
  left: z.infer<typeof postRefusalStorageItemSchema>,
  right: z.infer<typeof postRefusalStorageItemSchema>,
) {
  if (left.identityHash !== undefined || right.identityHash !== undefined) {
    return left.identityHash !== undefined && left.identityHash === right.identityHash;
  }
  return left.storageType === right.storageType &&
    left.name === right.name &&
    left.hostname === right.hostname;
}

export const postRefusalLaneOutcomeSchema = z.object({
  contractVersion: z.literal("certscore.post_refusal_lane_outcome.v1"),
  completedAt: z.string().datetime(),
  evidenceJoined: z.boolean(),
  maxTailWaitMs: z.number().int().min(0).max(30_000),
  status: z.enum(["joined", "not_applicable", "timed_out", "failed"]),
  limitationCode: z.enum([
    "reject_control_not_observed",
    "reject_path_timeout",
    "reject_path_worker_failed",
  ]).optional(),
}).superRefine((outcome, context) => {
  if (outcome.status === "joined" && (!outcome.evidenceJoined || outcome.limitationCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A joined Reject Path outcome must retain evidence without a coverage limitation.",
      path: ["evidenceJoined"],
    });
  }
  if (outcome.status !== "joined" && (outcome.evidenceJoined || !outcome.limitationCode)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A limited Reject Path outcome must not claim joined evidence and must retain a limitation code.",
      path: ["limitationCode"],
    });
  }
  if (
    outcome.status === "not_applicable" &&
    outcome.limitationCode !== "reject_control_not_observed"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A non-applicable Reject Path outcome must be anchored to complete no-reject inventory.",
      path: ["limitationCode"],
    });
  }
  if (
    outcome.status !== "not_applicable" &&
    outcome.limitationCode === "reject_control_not_observed"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "No-reject-control disposition is valid only for a non-applicable Reject Path outcome.",
      path: ["limitationCode"],
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
  z.object({
    authorizationId: z.literal("sharded_scan_exact_target.v1"),
    kind: z.literal("scan_target"),
    normalizedUrl: z.string().url().max(500),
    scanId: z.string().min(1).max(160),
  }),
  z.object({
    authorizationId: z.literal("sharded_scan_resolved_exact_target.v2"),
    kind: z.literal("scan_target_resolution"),
    maxRedirects: z.number().int().min(0).max(8).default(5),
    requestedUrl: z.string().url().max(500),
    resolutionTimeoutMs: z.number().int().min(250).max(5_000).default(1_500),
    scanId: z.string().min(1).max(160),
  }),
]);

const postRefusalConfirmationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local_storage_equals"),
    key: z.string().min(1).max(160),
    expectedValue: z.string().max(240),
  }),
  z.object({
    kind: z.literal("tcf_purposes_denied"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(),
  }),
  z.object({
    kind: z.literal("tcf_purposes_denied_or_cmp_cookie_changed"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(),
    cookieName: z.string().min(1).max(160),
  }),
  z.object({
    kind: z.literal("tcf_purposes_denied_or_cmp_storage_changed"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(),
    storageType: z.enum(["local_storage", "session_storage"]),
    key: z.string().min(1).max(160),
  }),
  z.object({
    kind: z.literal("tcf_purposes_denied_or_cmp_storage_keys_changed"),
    purposeIds: z.array(z.number().int().min(1).max(24)).min(1).max(24).optional(),
    storageType: z.enum(["local_storage", "session_storage"]),
    keys: z.array(z.string().min(1).max(160)).min(1).max(8),
  }),
]);

const postRefusalResolverConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("canonical_cmp_registry"),
    recipeSetId: z.enum([
      "canonical-consent-control-reject-v8",
      "canonical-consent-control-reject-v9",
      "canonical-consent-control-reject-v15",
      "canonical-consent-control-reject-v16",
    ]),
  }),
  z.object({
    kind: z.literal("named_cmp"),
    cmpCanonicalName: z.string().min(1).max(120),
    confirmation: postRefusalConfirmationSchema,
  }),
]);

export const postRefusalLambdaDispatchConfigSchema = z.object({
  enabled: z.literal(true),
  rolloutMode: z.enum(["owned_canary", "all_eligible"]).default("owned_canary"),
  dispatchDelayMs: z.number().int().min(0).max(10_000).default(500),
  observationWindowMs: z.number().int().min(0).max(30_000).default(8_000),
  confirmationTimeoutMs: z.number().int().min(50).max(5_000).default(1_500),
  actionSearchTimeoutMs: z.number().int().min(0).max(10_000).default(1_500),
  resolver: postRefusalResolverConfigSchema,
  interactionAuthorization: postRefusalInteractionAuthorizationSchema,
}).superRefine((config, context) => {
  if (
    (config.interactionAuthorization.kind === "scan_target" ||
      config.interactionAuthorization.kind === "scan_target_resolution") &&
    config.rolloutMode !== "all_eligible"
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Ordinary exact-target authorization requires all_eligible Reject rollout mode.",
      path: ["rolloutMode"],
    });
  }
});

export const POST_REFUSAL_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION =
  "certscore.v2.lambda-post-refusal-evidence-descriptor.v1" as const;

export const postRefusalLambdaEvidenceDescriptorSchema = z.object({
  artifactOnly: z.literal(true),
  contractVersion: z.literal(POST_REFUSAL_LAMBDA_EVIDENCE_DESCRIPTOR_VERSION),
  generatedAt: z.string().datetime(),
  descriptorKind: z.literal("post_refusal_evidence_descriptor"),
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
  if (!message.status.startsWith("confirmed_") && message.refusalExercised) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unconfirmed post-refusal evidence must set refusalExercised=false.",
      path: ["refusalExercised"],
    });
  }
  if (message.status === "confirmed_clean" && message.observationCount !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed-clean post-refusal evidence cannot report observations.",
      path: ["observationCount"],
    });
  }
  if (message.status === "confirmed_observation" && message.observationCount === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Confirmed-observation post-refusal evidence requires at least one observation.",
      path: ["observationCount"],
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
  exactIdentityVerified: z.boolean(),
  hostname: z.string().max(255).optional(),
  name: z.string().min(1).max(180),
  nonEssential: z.literal(true),
  sameValueHashVerified: z.literal(true),
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
            ...(write.hostname ? { hostname: write.hostname } : {}),
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
        .filter((item) =>
          item.nonEssential &&
          item.identityHash !== undefined &&
          packet.observations.some((observation) =>
            observation.observationType === "pre_consent_storage_not_cleared" &&
            observation.storageType === item.storageType &&
            observation.storageName === item.name &&
            observation.hostname === item.hostname &&
            observation.storageIdentityHash === item.identityHash &&
            observation.storageValueHash === item.valueHash
          )
        )
        .map((item) => ({
          ...(item.purpose ? { category: item.purpose } : {}),
          exactIdentityVerified: item.identityHash !== undefined,
          ...(item.hostname ? { hostname: item.hostname } : {}),
          name: item.name,
          nonEssential: true as const,
          sameValueHashVerified: true as const,
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

export const postRefusalReconciliationEnvelopeSchema = z.object({
  artifactVersion: z.literal("certscore.post_refusal_reconciliation.v1"),
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
    "joined_at_canonical_barrier",
    "not_joined",
  ]),
  observationCount: z.number().int().nonnegative(),
  refusalExercised: z.boolean(),
  limitations: z.array(z.string().max(240)).max(24).default([]),
}).superRefine((envelope, context) => {
  if (envelope.disposition === "joined_at_canonical_barrier" && !envelope.refusalExercised) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Only confirmed refusal evidence may join the canonical reconciliation barrier.",
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
export type PostRefusalTcfState = z.infer<typeof postRefusalTcfStateSchema>;
export type PostRefusalObservation = z.infer<typeof postRefusalObservationSchema>;
export type PostRefusalInteractionDiagnostics = z.infer<typeof postRefusalInteractionDiagnosticsSchema>;
export type PostRefusalEvidencePacket = z.infer<typeof postRefusalEvidencePacketSchema>;
export type PostRefusalLaneOutcome = z.infer<typeof postRefusalLaneOutcomeSchema>;
export type PostRefusalReconciliationEnvelope = z.infer<typeof postRefusalReconciliationEnvelopeSchema>;
export type PostRefusalInteractionAuthorization = z.infer<typeof postRefusalInteractionAuthorizationSchema>;
export type PostRefusalLambdaDispatchConfig = z.infer<typeof postRefusalLambdaDispatchConfigSchema>;
export type PostRefusalLambdaEvidenceDescriptor = z.infer<typeof postRefusalLambdaEvidenceDescriptorSchema>;
export type PostRefusalReportProjection = z.infer<typeof postRefusalReportProjectionSchema>;
