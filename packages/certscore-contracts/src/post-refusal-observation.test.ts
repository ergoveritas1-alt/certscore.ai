import assert from "node:assert/strict";
import test from "node:test";
import {
  postRefusalEvidencePacketSchema,
  postRefusalLambdaDispatchConfigSchema,
  postRefusalLambdaEvidenceMessageSchema,
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
    cmpCanonicalName: "OneTrust",
    confirmation: { kind: "tcf_purposes_denied", purposeIds: [1, 2] },
    interactionAuthorization: {
      authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      kind: "owned_canary",
    },
  });
  assert.equal(valid.dispatchDelayMs, 2_000);
  assert.equal(valid.observationWindowMs, 8_000);
  assert.equal(postRefusalLambdaDispatchConfigSchema.safeParse({
    ...valid,
    dispatchDelayMs: 10_001,
  }).success, false);
});

test("late handoff cannot claim unconfirmed observations", () => {
  const result = postRefusalLambdaEvidenceMessageSchema.safeParse({
    artifactOnly: true,
    contractVersion: "certscore.v2.lambda-post-refusal-evidence-ready.v1",
    generatedAt: "2026-08-26T00:00:01.000Z",
    messageKind: "post_refusal_evidence_ready",
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
