import assert from "node:assert/strict";
import test from "node:test";
import {
  postAcceptEvidencePacketSchema,
  postAcceptLaneOutcomeSchema,
  projectPostAcceptEvidenceForReport,
} from "./post-accept-observation.js";

function confirmedPacket() {
  return {
    artifactVersion: "certscore.post_accept_evidence.v1" as const,
    artifactOnly: true as const,
    productionProjectable: true,
    scanId: "scan-accept",
    parentScanId: "scan-parent",
    targetUrl: "https://example.test/",
    normalizedUrl: "https://example.test/",
    observationBranch: "accept_only" as const,
    phase: "post_action" as const,
    consentAction: "accept" as const,
    startedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:02.000Z",
    resolver: {
      found: true,
      method: "cmp_registry_recipe" as const,
      confidence: 1,
      recipeId: "canonical-cmp:fixture:accept:v1",
      cmpId: "fixture",
    },
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v1" as const,
      action: "accept" as const,
      observedAtMs: 95,
      accessibleLabel: "Accept all",
      labelSource: "visible_text" as const,
      actionSemantics: "direct_label" as const,
      classifierIntent: "accept" as const,
      classifierConfidence: 1,
      matchedLocale: "en" as const,
      matchStrength: "direct" as const,
      classifierReasonCodes: ["exact_accept_label"],
      cmpId: "fixture",
      recipeId: "canonical-cmp:fixture:accept:v1",
      selectorHint: "#accept-all",
      visible: true as const,
      enabled: true as const,
      uniquelyActionable: true as const,
    },
    acceptanceRegistration: {
      status: "confirmed" as const,
      acceptanceExercised: true,
      actionDispatchedAtMs: 100,
      acceptanceRegisteredAtMs: 120,
      witnesses: [{
        witnessType: "cmp_storage_state" as const,
        observedAtMs: 120,
        key: "fixture-consent",
        expectedState: "granted",
        observedStateHash: "a".repeat(64),
        corroboratingOnly: false,
      }],
    },
    observationWindowMs: 8_000,
    timing: {
      dispatchDelayMs: 1_000,
      navigationMs: 40,
      resolverMs: 10,
      confirmationMs: 20,
      observationMs: 100,
      totalMs: 1_170,
      readyAtMs: 1_170,
    },
    network: {
      requests: [],
      postAcceptNonEssentialRequests: [],
      activeRequestIdsAtAcceptanceRegistration: [],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterAccept: [],
      itemsCreatedOrChangedAfterAccept: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" as const },
    limitations: [],
  };
}

test("post-Accept observations require a semantically confirmed Accept action", () => {
  const result = postAcceptEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    productionProjectable: false,
    acceptanceRegistration: {
      status: "unconfirmed",
      acceptanceExercised: false,
      reason: "storage_state_did_not_change",
      witnesses: [],
    },
    observations: [{
      observationType: "post_accept_non_essential_activity",
      observedAtMs: 150,
      requestId: "request-1",
      evidenceKeys: [],
    }],
  });
  assert.equal(result.success, false);
});

test("truncated Post-Accept observation coverage cannot be production-projectable", () => {
  const result = postAcceptEvidencePacketSchema.safeParse({
    ...confirmedPacket(),
    limitations: [
      "observation_window_aborted_after_confirmed_acceptance",
      "observer_result_budget_exhausted:4000ms",
    ],
  });
  assert.equal(result.success, false);
});

test("report projection excludes in-flight requests and retains exact storage identity", () => {
  const directRequest = {
    requestId: "request-direct",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 140,
    completedAtMs: 160,
    inFlightAtAcceptanceRegistration: false,
    msOffsetFromAccept: 20,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  const inFlightRequest = {
    ...directRequest,
    requestId: "request-in-flight",
    startedAtMs: 110,
    inFlightAtAcceptanceRegistration: true,
    msOffsetFromAccept: 1,
  };
  const packet = postAcceptEvidencePacketSchema.parse({
    ...confirmedPacket(),
    network: {
      requests: [directRequest, inFlightRequest],
      postAcceptNonEssentialRequests: [directRequest],
      activeRequestIdsAtAcceptanceRegistration: [inFlightRequest.requestId],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterAccept: [{
        storageType: "local_storage",
        name: "analytics-consent",
        hostname: "example.test",
        observedAtMs: 170,
        msOffsetFromAccept: 50,
        identityHash: "b".repeat(64),
        vendor: "Example Analytics",
        purpose: "analytics",
        nonEssential: true,
      }],
      itemsCreatedOrChangedAfterAccept: [],
    },
    observations: [{
      observationType: "post_accept_non_essential_activity",
      observedAtMs: 140,
      requestId: directRequest.requestId,
      msOffsetFromAccept: 20,
      evidenceKeys: ["network.postAcceptNonEssentialRequests"],
    }],
  });
  const projection = projectPostAcceptEvidenceForReport({
    packet,
    packetSha256: "c".repeat(64),
  });
  assert.equal(projection.postAcceptActivity.length, 2);
  assert.equal(projection.evidenceDisposition, "confirmed");
  assert.equal(projection.indeterminateReason, null);
  assert.equal(projection.postAcceptActivity.some((row) => row.requestId === "request-in-flight"), false);
  assert.equal(
    projection.postAcceptActivity.find((row) => row.activityType === "storage_write")?.storageIdentityHash,
    "b".repeat(64),
  );
});

test("legacy confirmed Accept evidence without verified control proof projects as indeterminate", () => {
  const { actionControlProof: _omitted, ...legacyPacket } = confirmedPacket();
  const projection = projectPostAcceptEvidenceForReport({
    packet: postAcceptEvidencePacketSchema.parse(legacyPacket),
  });

  assert.equal(projection.evidenceDisposition, "indeterminate");
  assert.equal(projection.indeterminateReason, "verified_action_control_proof_missing");
  assert.equal(projection.productionProjectable, false);
});

test("limited Accept lane outcomes remain explicit and score-neutral", () => {
  const outcome = postAcceptLaneOutcomeSchema.parse({
    contractVersion: "certscore.post_accept_lane_outcome.v1",
    completedAt: "2026-09-01T00:00:06.000Z",
    evidenceJoined: false,
    maxTailWaitMs: 6_000,
    status: "timed_out",
    limitationCode: "accept_path_timeout",
  });
  assert.equal(outcome.evidenceJoined, false);
  assert.equal(outcome.status, "timed_out");
});
