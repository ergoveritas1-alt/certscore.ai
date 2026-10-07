import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
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

test("late form pixels project only with versioned bounded extension proof", () => {
  const base = confirmedPacket();
  const targetHash = createHash("sha256").update(base.targetUrl).digest("hex");
  const form = { formRef: "collection_form_0", structure: "native_form", surfaceType: "contact",
    pageUrl: base.targetUrl, method: "post", actionRelationship: "self",
    candidateFieldCount: 0, retainedFieldCount: 0, fieldsTruncated: false, fields: [],
    confidence: 1, directVsInferred: "direct" };
  const inventory = { contractVersion: "certscore.post_accept_form_inventory.v1", sourceLane: "accept_observation",
    phase: "after_accept", coverage: "bounded_sample", pageUrl: base.targetUrl, forms: [form] };
  const capture = { contractVersion: "certscore.post_accept_form_snapshots.v2", phase: "after_accept",
    sessionId: randomUUID(), exactTargetSha256: targetHash,
    actionDispatchedAtMs: 100, acceptanceRegisteredAtMs: 120, capturedAtMs: 3600,
    lateForm: { baseCaptureDeadlineAtMs: 3120, detectedAtMs: 2500, extensionMs: 1500 },
    documentIdentity: { source: "cdp_loader_id", token: "loader" }, inventory,
    snapshots: [{ contractVersion: "certscore.collection-surface-snapshot.v1", formRef: form.formRef,
      pageUrl: base.targetUrl, capturedAt: "2026-09-01T00:00:03.600Z", status: "unavailable",
      reason: "capture_budget_exhausted", sourceInventoryHash: "a".repeat(64), mimeType: "image/jpeg", valuesMasked: true }] };
  const packet = postAcceptEvidencePacketSchema.parse({ ...base, exactTargetSha256: targetHash,
    actionControlProof: { ...base.actionControlProof, authorizedTargetSha256: targetHash },
    interactionDiagnostics: { resolver: { snapshots: [], truncated: false },
      navigation: { outcome: "completed", documentCommitted: true, finalUrlAuthorized: true },
      click: { outcome: "completed", reResolvedBeforeDispatch: false, confirmationCheckedAfterError: false } },
    observationWindowMs: 3000, timing: { ...base.timing, totalMs: 4000, readyAtMs: 4000, observationMs: 3000 },
    formSnapshotCapture: capture });
  const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "b".repeat(64) });
  assert.equal(projection.formSnapshotCapture?.contractVersion, "certscore.post_accept_form_snapshots.v2");
  assert.equal(projection.formSnapshotCapture?.capturedAtMs, 3600);
  for (const lateForm of [
    { ...capture.lateForm, detectedAtMs: 1000 },
    { ...capture.lateForm, baseCaptureDeadlineAtMs: 4000 },
    { ...capture.lateForm, extensionMs: 2000 },
  ]) assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
    formSnapshotCapture: { ...capture, lateForm } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
    formSnapshotCapture: { ...capture, capturedAtMs: 4700 } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...packet,
    formSnapshotCapture: { ...capture, contractVersion: "certscore.post_accept_form_snapshots.v1", lateForm: undefined } }).success, false);
  const extended = { ...capture, contractVersion: "certscore.post_accept_form_snapshots.v3",
    capturedAtMs: 6000, lateForm: { ...capture.lateForm, extensionMs: 5500 } };
  const extendedPacket = { ...packet, timing: { ...packet.timing, totalMs: 7000, readyAtMs: 7000 }, formSnapshotCapture: extended };
  assert.equal(postAcceptEvidencePacketSchema.safeParse(extendedPacket).success, true);
  assert.equal(projectPostAcceptEvidenceForReport({ packet: postAcceptEvidencePacketSchema.parse(extendedPacket), packetSha256: "b".repeat(64) }).formSnapshotCapture?.contractVersion,
    "certscore.post_accept_form_snapshots.v3");
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...extendedPacket,
    formSnapshotCapture: { ...extended, lateForm: { ...extended.lateForm, extensionMs: 5501 } } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...extendedPacket,
    timing: { ...extendedPacket.timing, totalMs: 9000, readyAtMs: 9000 },
    formSnapshotCapture: { ...extended, capturedAtMs: 8621 } }).success, false);
  const latest = { ...extended, contractVersion: "certscore.post_accept_form_snapshots.v4",
    capturedAtMs: 10000, lateForm: { ...extended.lateForm, extensionMs: 9500 } };
  const latestPacket = { ...extendedPacket, timing: { ...extendedPacket.timing, totalMs: 11000, readyAtMs: 11000 },
    formSnapshotCapture: latest };
  assert.equal(postAcceptEvidencePacketSchema.safeParse(latestPacket).success, true);
  assert.equal(projectPostAcceptEvidenceForReport({ packet: postAcceptEvidencePacketSchema.parse(latestPacket), packetSha256: "b".repeat(64) }).formSnapshotCapture?.contractVersion,
    "certscore.post_accept_form_snapshots.v4");
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...latestPacket,
    formSnapshotCapture: { ...latest, lateForm: { ...latest.lateForm, extensionMs: 9501 } } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...latestPacket,
    timing: { ...latestPacket.timing, totalMs: 14000, readyAtMs: 14000 },
    formSnapshotCapture: { ...latest, capturedAtMs: 12621 } }).success, false);
  const later = { ...latest, contractVersion: "certscore.post_accept_form_snapshots.v5",
    postCaptureInventory: { capturedAtMs: 10500, documentIdentity: latest.documentIdentity,
      inventory: { ...inventory, forms: [{ ...form, candidateFieldCount: 1, retainedFieldCount: 1,
        fields: [{ fieldRef: "collection_form_0_field_0", controlIndex: 0, elementType: "input", inputType: "email",
          semanticCategory: "email", label: "Email", required: false, disabled: false, readOnly: false,
          evidenceRefs: [], confidence: 0.9, directVsInferred: "direct" }] }] } } };
  const laterPacket = { ...latestPacket, timing: { ...latestPacket.timing, totalMs: 12000, readyAtMs: 12000 },
    formSnapshotCapture: later };
  assert.equal(postAcceptEvidencePacketSchema.safeParse(laterPacket).success, true);
  assert.equal(projectPostAcceptEvidenceForReport({ packet: postAcceptEvidencePacketSchema.parse(laterPacket), packetSha256: "b".repeat(64) }).formSnapshotCapture?.contractVersion,
    "certscore.post_accept_form_snapshots.v5");
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...laterPacket, formSnapshotCapture: { ...later,
    postCaptureInventory: { ...later.postCaptureInventory, documentIdentity: { source: "cdp_loader_id", token: "other" } } } }).success, false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({ ...laterPacket,
    timing: { ...laterPacket.timing, totalMs: 10200, readyAtMs: 10200 } }).success, false);
});

test("Accept packet and report projection preserve bounded collection diagnostics", () => {
  const diagnostics = { policyVersion: "action_storage_collection_diagnostics.v1" as const,
    cookies: { status: "empty" as const, retainedCount: 0, droppedCount: 0, sampleLimit: 96 },
    localStorage: { status: "failed" as const, retainedCount: 0, droppedCount: 0, sampleLimit: 96 },
    sessionStorage: { status: "sampled" as const, retainedCount: 96, droppedCount: 0, sampleLimit: 96 } };
  const packet = postAcceptEvidencePacketSchema.parse({ ...confirmedPacket(), storage: {
    ...confirmedPacket().storage, collectionDiagnostics: { preAction: diagnostics, postAction: diagnostics },
  } });
  const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "b".repeat(64) });
  assert.deepEqual(projection.storageCollectionDiagnostics, packet.storage.collectionDiagnostics);
});

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

test("Accept materialization retains explicit completed protocol evidence independently from confirmation", () => {
  const base = confirmedPacket();
  const packet = postAcceptEvidencePacketSchema.parse({ ...base,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "granted", basis: "verified_state",
      observedAtMs: 120, observedStateSha256: "a".repeat(64), timestampBasis: "verified_state_observed" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
    timing: { ...base.timing, observationMs: 8000, readyAtMs: 8120, totalMs: 8120, observationExitReason: "window_elapsed" },
  });
  const projection = projectPostAcceptEvidenceForReport({ packet, packetSha256: "a".repeat(64) });
  assert.equal(projection.execution?.status, "succeeded_with_confirmation");
  assert.deepEqual(projection.registeredObservationCompletion, {
    policyVersion: "registered_action_observation_completion.v1", action: "accept", startedAtMs: 120,
    completedAtMs: 8120, requiredWindowMs: 8000, termination: "window_elapsed",
  });
  assert.deepEqual(postAcceptReportProjectionSchema.parse(JSON.parse(JSON.stringify(projection))), projection);
  const incomplete = projectPostAcceptEvidenceForReport({ packet: { ...packet, timing: {
    ...packet.timing, observationExitReason: undefined,
  } }, packetSha256: "a".repeat(64) });
  assert.equal(incomplete.execution?.status, "limited");
  assert.equal(incomplete.execution?.consentConfirmed, true);
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
