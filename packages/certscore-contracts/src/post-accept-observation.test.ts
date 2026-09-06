import assert from "node:assert/strict";
import test from "node:test";
import {
  postAcceptEvidencePacketSchema,
  postAcceptReportProjectionSchema,
  postAcceptLaneOutcomeSchema,
  projectPostAcceptEvidenceForReport,
} from "./post-accept-observation.js";

test("Accept report projection preserves the observed discovery failure and search duration", () => {
  const base = confirmedPacket();
  const packet = postAcceptEvidencePacketSchema.parse({ ...base, productionProjectable: false,
    actionControlProof: undefined,
    resolver: { ...base.resolver, found: false, confidence: 0, reason: "deterministic_accept_control_not_found" },
    timing: { ...base.timing, resolverMs: 14_310 },
    acceptanceRegistration: { status: "not_attempted", acceptanceExercised: false,
      reason: "deterministic_accept_control_not_found", witnesses: [] },
  });
  const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
  assert.equal(projection.resolver?.reason, "deterministic_accept_control_not_found");
  assert.equal(projection.resolverDurationMs, 14_310);
  assert.equal(projection.registrationStatus, "not_attempted");
  assert.equal(projection.productionProjectable, false);
  assert.deepEqual(projection.postAcceptActivity, []);
});

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

test("invalid optional graph cannot invalidate independently valid retained Accept proof", () => {
  const base = postAcceptEvidencePacketSchema.parse(confirmedPacket());
  const parsed = postAcceptEvidencePacketSchema.parse({ ...base, runtimeEvidenceGraph: { scenario: "post_accept", contractVersion: "future" } });
  const { runtimeEvidenceGraphDiagnostics, ...legacy } = parsed;
  assert.deepEqual(legacy, base);
  assert.deepEqual(runtimeEvidenceGraphDiagnostics, [{ scenario: "post_accept", reason: "unsupported_version" }]);
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
test("v2 accept confirmation requires semantic decision, anchored time, and bounded capture", () => {
  const packet = {
    ...confirmedPacket(), artifactVersion: "certscore.post_accept_evidence.v2",
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "granted",
      observedStateSha256: "a".repeat(64),
      basis: "verified_state", observedAtMs: 120, timestampBasis: "instrumented_state_write" },
    captureCoverage: { requestsDroppedBeforeAction: 2, requestsDroppedAfterAction: 0 },
  };
  const parsed = postAcceptEvidencePacketSchema.parse(packet);
  const projection = projectPostAcceptEvidenceForReport({ packet: parsed, packetSha256: "b".repeat(64) });
  assert.deepEqual(projection.decisionEvidence, packet.decisionEvidence);
  assert.deepEqual(projection.captureCoverage, packet.captureCoverage);
  assert.equal(projection.packetSha256, "b".repeat(64));
  assert.equal(postAcceptReportProjectionSchema.safeParse({ ...projection,
    decisionEvidence: { ...projection.decisionEvidence, decision: "denied" } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
    decisionEvidence: { ...packet.decisionEvidence, observedStateSha256: "c".repeat(64) } }).success, false);
  for (const decision of ["denied", "mixed", "unknown"]) {
    assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
      decisionEvidence: { ...packet.decisionEvidence, decision } }).success, false);
  }
  for (const evidence of [undefined, { ...packet.decisionEvidence, observedAtMs: 999 },
    { ...packet.decisionEvidence, timestampBasis: undefined }, { ...packet.decisionEvidence, basis: "unverified" }]) {
    assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet, decisionEvidence: evidence }).success, false);
  }
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 1 } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet, productionProjectable: false,
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 1 } }).success, true);
});

test("legacy accept UI and opaque-receipt proof remain readable but project neutrally", () => {
  for (const expectedState of ["consent_surface_hidden", "canonical_cmp_consent_state_changed_after_accept"]) {
    const packet = confirmedPacket();
    const legacy = postAcceptEvidencePacketSchema.parse({ ...packet,
      acceptanceRegistration: { ...packet.acceptanceRegistration, witnesses: [{
        ...packet.acceptanceRegistration.witnesses[0], expectedState,
      }] },
    });
    const projection = projectPostAcceptEvidenceForReport({ packet: legacy });
    assert.equal(projection.productionProjectable, false);
    assert.equal(projection.acceptanceExercised, false);
    assert.equal(projection.registrationStatus, "unconfirmed");
    assert.equal(projection.observationCount, 0);
    assert.deepEqual(projection.postAcceptActivity, []);
    assert.equal(legacy.acceptanceRegistration.status, "confirmed");
  }
});
