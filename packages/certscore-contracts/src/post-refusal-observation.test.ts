import assert from "node:assert/strict";
import test from "node:test";
import {
  postRefusalEvidencePacketSchema,
  postRefusalLambdaDispatchConfigSchema,
  postRefusalLaneOutcomeSchema,
  postRefusalLambdaEvidenceDescriptorSchema,
  projectPostRefusalEvidenceForReport,
} from "./post-refusal-observation.js";

function basePacket() {
  return {
    artifactVersion: "certscore.post_refusal_evidence.v1" as const,
    artifactOnly: true as const,
    productionProjectable: false as const,
    scanId: "scan-local",
    targetUrl: "http://127.0.0.1:4173/fixture",
    normalizedUrl: "http://127.0.0.1:4173/fixture",
    observationBranch: "reject_only" as const,
    phase: "post_action" as const,
    consentAction: "reject" as const,
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:00:01.000Z",
    resolver: {
      found: false,
      method: "local_fixture_recipe" as const,
      confidence: 0,
      recipeId: "fixture-direct-reject-v1",
    },
    refusalRegistration: {
      status: "not_attempted" as const,
      refusalExercised: false,
      reason: "control_not_found",
      witnesses: [],
    },
    observationWindowMs: 250,
    timing: {
      dispatchDelayMs: 0,
      navigationMs: 10,
      resolverMs: 2,
      confirmationMs: 0,
      observationMs: 0,
      totalMs: 12,
      readyAtMs: 12,
    },
    network: {
      requests: [],
      postRefusalNonEssentialRequests: [],
      activeRequestIdsAtRefusalRegistration: [],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
    observations: [],
    cancellation: {
      requested: false,
      outcome: "not_requested" as const,
    },
    limitations: ["localhost_only_experimental_branch"],
  };
}

function confirmedPacket() {
  return {
    ...basePacket(),
    productionProjectable: true,
    resolver: {
      found: true,
      method: "local_fixture_recipe" as const,
      confidence: 1,
      recipeId: "fixture-direct-reject-v1",
    },
    refusalRegistration: {
      status: "confirmed" as const,
      refusalExercised: true,
      actionDispatchedAtMs: 10,
      refusalRegisteredAtMs: 15,
      witnesses: [{
        witnessType: "cmp_storage_state" as const,
        observedAtMs: 15,
        observedStateHash: "a".repeat(64),
        corroboratingOnly: false,
      }],
    },
    storage: {
      preActionCapturedAtMs: 5,
      postActionCapturedAtMs: 20,
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
  };
}

test("post-refusal evidence stays score-ineligible when refusal is unconfirmed", () => {
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...basePacket(),
    observations: [{
      observationType: "post_refusal_non_essential_activity",
      observedAtMs: 20,
      requestId: "request-1",
      evidenceKeys: [],
    }],
  });

  assert.equal(result.success, false);
});

test("interaction diagnostics are typed and retain no raw browser error text", () => {
  const parsed = postRefusalEvidencePacketSchema.parse({
    ...basePacket(),
    interactionDiagnostics: {
      navigation: {
        outcome: "recovered_after_error",
        failureClass: "navigation_replaced",
        documentCommitted: true,
        finalUrlAuthorized: true,
        recoveryMethod: "committed_document",
      },
      click: {
        outcome: "failed_before_dispatch",
        failureClass: "intercepted",
        reResolvedBeforeDispatch: true,
        confirmationCheckedAfterError: false,
      },
    },
  });

  assert.equal(parsed.interactionDiagnostics?.navigation.failureClass, "navigation_replaced");
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...basePacket(),
    interactionDiagnostics: {
      navigation: {
        outcome: "failed",
        failureClass: "net::ERR_ABORTED https://sensitive.example/path?token=secret",
        documentCommitted: false,
        finalUrlAuthorized: false,
      },
      click: {
        outcome: "not_attempted",
        reResolvedBeforeDispatch: false,
        confirmationCheckedAfterError: false,
      },
    },
  }).success, false);
});

test("confirmed refusal requires a non-corroborating semantic witness", () => {
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...basePacket(),
    resolver: {
      found: true,
      method: "local_fixture_recipe",
      confidence: 1,
      recipeId: "fixture-direct-reject-v1",
    },
    refusalRegistration: {
      status: "confirmed",
      refusalExercised: true,
      actionDispatchedAtMs: 10,
      refusalRegisteredAtMs: 15,
      witnesses: [{
        witnessType: "banner_transition",
        observedAtMs: 15,
        corroboratingOnly: true,
      }],
    },
  });

  assert.equal(result.success, false);
});

test("Lambda reject dispatch is bounded and requires explicit interaction authorization", () => {
  const valid = postRefusalLambdaDispatchConfigSchema.parse({
    enabled: true,
    resolver: {
      kind: "named_cmp",
      cmpCanonicalName: "OneTrust",
      confirmation: { kind: "tcf_purposes_denied", purposeIds: [1, 2] },
    },
    interactionAuthorization: {
      authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      kind: "owned_canary",
    },
  });
  assert.equal(valid.dispatchDelayMs, 500);
  assert.equal(valid.observationWindowMs, 8_000);
  assert.equal(postRefusalLambdaDispatchConfigSchema.safeParse({
    ...valid,
    dispatchDelayMs: 10_001,
  }).success, false);
});

test("normal sharded reject dispatch requires bounded resolution before exact scan-target authorization", () => {
  const valid = postRefusalLambdaDispatchConfigSchema.parse({
    enabled: true,
    rolloutMode: "all_eligible",
    resolver: {
      kind: "canonical_cmp_registry",
      recipeSetId: "canonical-consent-control-reject-v9",
    },
    interactionAuthorization: {
      authorizationId: "sharded_scan_resolved_exact_target.v2",
      kind: "scan_target_resolution",
      maxRedirects: 5,
      requestedUrl: "https://example.com/privacy?region=ca",
      resolutionTimeoutMs: 1_500,
      scanId: "scan-123",
    },
  });

  assert.equal(valid.resolver.kind, "canonical_cmp_registry");
  assert.equal(valid.rolloutMode, "all_eligible");
  assert.equal(valid.interactionAuthorization.kind, "scan_target_resolution");
  assert.equal(postRefusalLambdaDispatchConfigSchema.safeParse({
    ...valid,
    interactionAuthorization: {
      ...valid.interactionAuthorization,
      authorizationId: "reusable-host-authorization",
    },
  }).success, false);
  assert.equal(postRefusalLambdaDispatchConfigSchema.safeParse({
    ...valid,
    rolloutMode: "owned_canary",
  }).success, false);
});

test("Reject Path lane outcome keeps timeout coverage explicit and evidence-neutral", () => {
  const timeout = postRefusalLaneOutcomeSchema.parse({
    contractVersion: "certscore.post_refusal_lane_outcome.v1",
    completedAt: "2026-08-26T12:00:04.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "timed_out",
    limitationCode: "reject_path_timeout",
  });
  assert.equal(timeout.evidenceJoined, false);
  assert.equal(postRefusalLaneOutcomeSchema.safeParse({
    ...timeout,
    evidenceJoined: true,
  }).success, false);
});

test("complete consent inventory without Reject records a non-applicable lane outcome", () => {
  const outcome = postRefusalLaneOutcomeSchema.parse({
    contractVersion: "certscore.post_refusal_lane_outcome.v1",
    completedAt: "2026-08-26T12:00:02.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "not_applicable",
    limitationCode: "reject_control_not_observed",
  });
  assert.equal(outcome.status, "not_applicable");
  assert.equal(postRefusalLaneOutcomeSchema.safeParse({
    ...outcome,
    limitationCode: "reject_path_worker_failed",
  }).success, false);
});

test("Lambda reject dispatch preserves canonical CMP cookie-transition confirmation", () => {
  const parsed = postRefusalLambdaDispatchConfigSchema.parse({
    enabled: true,
    resolver: {
      kind: "named_cmp",
      cmpCanonicalName: "OneTrust",
      confirmation: {
        kind: "tcf_purposes_denied_or_cmp_cookie_changed",
        purposeIds: [1, 2, 3, 4, 7, 9, 10],
        cookieName: "OptanonConsent",
      },
    },
    interactionAuthorization: {
      authorizationId: "calibration-orange-es",
      kind: "explicit_allowlist",
      targets: [{ hostname: "www.orange.es", pathPrefix: "/" }],
    },
  });

  assert.equal(parsed.resolver.kind, "named_cmp");
  assert.equal(
    parsed.resolver.kind === "named_cmp" &&
      parsed.resolver.confirmation.kind === "tcf_purposes_denied_or_cmp_cookie_changed"
      ? parsed.resolver.confirmation.cookieName
      : undefined,
    "OptanonConsent",
  );
});

test("Lambda reject dispatch preserves canonical CMP storage-transition confirmation", () => {
  const parsed = postRefusalLambdaDispatchConfigSchema.parse({
    enabled: true,
    resolver: {
      kind: "named_cmp",
      cmpCanonicalName: "Usercentrics",
      confirmation: {
        kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
        storageType: "local_storage",
        keys: ["uc_settings", "ucString"],
      },
    },
    interactionAuthorization: {
      authorizationId: "calibration-asapp-com",
      kind: "explicit_allowlist",
      targets: [{ hostname: "www.asapp.com", pathPrefix: "/" }],
    },
  });

  assert.deepEqual(parsed.resolver.kind === "named_cmp" ? parsed.resolver.confirmation : undefined, {
    kind: "tcf_purposes_denied_or_cmp_storage_keys_changed",
    storageType: "local_storage",
    keys: ["uc_settings", "ucString"],
  });
});

test("embedded evidence descriptor cannot claim unconfirmed observations", () => {
  const result = postRefusalLambdaEvidenceDescriptorSchema.safeParse({
    artifactOnly: true,
    contractVersion: "certscore.v2.lambda-post-refusal-evidence-descriptor.v1",
    generatedAt: "2026-08-26T00:00:01.000Z",
    descriptorKind: "post_refusal_evidence_descriptor",
    packetMetadata: { sha256: "a".repeat(64), sizeBytes: 10 },
    packetPointer: "s3://bucket/packet.json",
    parentDispatchSha256: "b".repeat(64),
    parentScanId: "scan-1",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    refusalExercised: false,
    observationCount: 1,
    scanId: "scan-1",
    status: "unconfirmed",
    targetEnvironment: "local",
  });
  assert.equal(result.success, false);
});

test("post-refusal request rows must be exact, retained, and refusal-anchored", () => {
  const request = {
    requestId: "request-1",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 25,
    inFlightAtRefusalRegistration: false,
    msOffsetFromRefusal: 10,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    network: {
      requests: [request],
      postRefusalNonEssentialRequests: [{ ...request, vendor: "Spoofed Vendor" }],
      activeRequestIdsAtRefusalRegistration: [],
    },
  });

  assert.equal(result.success, false);
});

test("storage persistence and writes must bind to retained snapshots and the refusal anchor", () => {
  const persisted = {
    storageType: "cookie" as const,
    name: "_ga",
    valueHash: "b".repeat(64),
    vendor: "Google",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage: {
      preAction: [],
      postAction: [],
      writesAfterRefusal: [{
        storageType: "cookie",
        name: "_gid",
        observedAtMs: 25,
        msOffsetFromRefusal: 9,
        nonEssential: true,
      }],
      nonEssentialItemsPersistingAfterRefusal: [persisted],
    },
  });

  assert.equal(result.success, false);
});

test("persisted-storage observations bind to the exact post-action snapshot row", () => {
  const identityHash = "d".repeat(64);
  const item = {
    storageType: "cookie" as const,
    name: "_ga",
    hostname: "example.test",
    identityBasis: "cookie_name_domain_path_partition" as const,
    identityHash,
    valueHash: "b".repeat(64),
    vendor: "Google",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const storage = {
    preActionCapturedAtMs: 5,
    postActionCapturedAtMs: 30,
    preAction: [item],
    postAction: [item],
    writesAfterRefusal: [],
    nonEssentialItemsPersistingAfterRefusal: [item],
  };
  const observation = {
    observationType: "pre_consent_storage_not_cleared" as const,
    observedAtMs: 30,
    hostname: "example.test",
    storageType: "cookie" as const,
    storageName: "_ga",
    storageIdentityHash: identityHash,
    storageValueHash: item.valueHash,
    msOffsetFromRefusal: 15,
    vendor: "Google",
    evidenceKeys: ["storage.nonEssentialItemsPersistingAfterRefusal"],
  };

  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage,
    observations: [observation],
  }).success, true);
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage,
    observations: [{ ...observation, hostname: "wrong.example" }],
  }).success, false);
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage: {
      ...storage,
      preAction: [{ ...item, valueHash: "c".repeat(64) }],
    },
    observations: [observation],
  }).success, false);
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage,
    observations: [{ ...observation, storageIdentityHash: "e".repeat(64) }],
  }).success, false);
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    storage,
    observations: [{ ...observation, storageValueHash: "e".repeat(64) }],
  }).success, false);
});

test("legacy persistence rows without exact identity remain parseable but are not report-projectable", () => {
  const legacyItem = {
    storageType: "cookie" as const,
    name: "_ga",
    hostname: "example.test",
    valueHash: "b".repeat(64),
    vendor: "Google",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const parsed = postRefusalEvidencePacketSchema.parse({
    ...confirmedPacket(),
    storage: {
      preActionCapturedAtMs: 5,
      postActionCapturedAtMs: 30,
      preAction: [legacyItem],
      postAction: [legacyItem],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [legacyItem],
    },
    observations: [{
      observationType: "pre_consent_storage_not_cleared",
      observedAtMs: 30,
      hostname: "example.test",
      storageType: "cookie",
      storageName: "_ga",
      msOffsetFromRefusal: 15,
      vendor: "Google",
      evidenceKeys: ["storage.nonEssentialItemsPersistingAfterRefusal"],
    }],
  });

  assert.equal(projectPostRefusalEvidenceForReport({ packet: parsed }).preConsentStorageNotCleared.length, 0);
});

test("exact persistence storage does not project before a settled observation is retained", () => {
  const item = {
    storageType: "cookie" as const,
    name: "_ga",
    hostname: "example.test",
    identityBasis: "cookie_name_domain_path_partition" as const,
    identityHash: "d".repeat(64),
    valueHash: "b".repeat(64),
    vendor: "Google",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const parsed = postRefusalEvidencePacketSchema.parse({
    ...confirmedPacket(),
    storage: {
      preActionCapturedAtMs: 5,
      postActionCapturedAtMs: 30,
      preAction: [item],
      postAction: [item],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [item],
    },
    observations: [],
    limitations: ["persistence_observation_not_settled_due_to_early_exit"],
  });

  assert.equal(projectPostRefusalEvidenceForReport({ packet: parsed }).preConsentStorageNotCleared.length, 0);
});

test("TCF contradiction observations require typed granted-purpose evidence", () => {
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    observations: [{
      observationType: "refusal_signal_contradicts_action",
      observedAtMs: 25,
      msOffsetFromRefusal: 10,
      evidenceKeys: ["tcf.postRefusalState"],
    }],
  });

  assert.equal(result.success, false);
});

test("TCF contradiction observations bind to the exact retained state timestamp", () => {
  const tcf = {
    postRefusalState: {
      observedAtMs: 25,
      eventStatus: "useractioncomplete",
      apiSuccess: true,
      tcStringHash: "c".repeat(64),
      tcStringParseStatus: "parsed_v2" as const,
      purposeGrantedIds: [1],
      purposeGrantSource: "tc_string" as const,
    },
  };
  const observation = {
    observationType: "refusal_signal_contradicts_action" as const,
    observedAtMs: 25,
    msOffsetFromRefusal: 10,
    evidenceKeys: ["tcf.postRefusalState"],
  };

  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    tcf,
    observations: [observation],
  }).success, true);
  assert.equal(postRefusalEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    tcf,
    observations: [{ ...observation, observedAtMs: 24, msOffsetFromRefusal: 9 }],
  }).success, false);
});

test("coverage failures cannot claim production projection eligibility", () => {
  const result = postRefusalEvidencePacketSchema.safeParse({
    ...basePacket(),
    productionProjectable: true,
  });

  assert.equal(result.success, false);
});

test("embedded evidence descriptor status and observation counts must agree exactly", () => {
  const baseMessage = {
    artifactOnly: true,
    contractVersion: "certscore.v2.lambda-post-refusal-evidence-descriptor.v1",
    generatedAt: "2026-08-26T00:00:01.000Z",
    descriptorKind: "post_refusal_evidence_descriptor",
    packetMetadata: { sha256: "a".repeat(64), sizeBytes: 10 },
    packetPointer: "s3://bucket/packet.json",
    parentDispatchSha256: "b".repeat(64),
    parentScanId: "scan-1",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: true,
    refusalExercised: true,
    scanId: "scan-1",
    targetEnvironment: "local",
  };

  assert.equal(postRefusalLambdaEvidenceDescriptorSchema.safeParse({
    ...baseMessage,
    observationCount: 1,
    status: "confirmed_clean",
  }).success, false);
  assert.equal(postRefusalLambdaEvidenceDescriptorSchema.safeParse({
    ...baseMessage,
    observationCount: 0,
    status: "confirmed_observation",
  }).success, false);
});
