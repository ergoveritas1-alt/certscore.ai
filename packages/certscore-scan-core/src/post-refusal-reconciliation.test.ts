import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalEvidencePacketSchema } from "@certscore/contracts";
import { buildPostRefusalReconciliationEnvelope } from "./post-refusal-reconciliation.js";

test("confirmed evidence creates a hash-bound canonical reconciliation record", () => {
  const packet = confirmedPacket(1);
  const envelope = buildPostRefusalReconciliationEnvelope({
    parentScanId: "parent-scan",
    baseEvidence: { scanId: "parent-scan", evidence: ["base"] },
    packet,
    publicationDecision: {
      mode: "single_reconciliation",
      rejectReadyDeltaMs: 8_000,
      addedInitialReportWaitMs: 8_000,
      reason: "reject_packet_extended_canonical_barrier",
    },
  });

  assert.equal(envelope.status, "confirmed_observation");
  assert.equal(envelope.disposition, "joined_at_canonical_barrier");
  assert.match(envelope.baseEvidenceSha256, /^[a-f0-9]{64}$/);
  assert.match(envelope.postRefusalPacketSha256, /^[a-f0-9]{64}$/);
});

test("unconfirmed evidence stays neutral and is not joined", () => {
  const packet = confirmedPacket(0);
  const unconfirmed = postRefusalEvidencePacketSchema.parse({
    ...packet,
    refusalRegistration: {
      status: "unconfirmed",
      refusalExercised: false,
      actionDispatchedAtMs: 10,
      reason: "state_not_observed",
      witnesses: [],
    },
  });
  const envelope = buildPostRefusalReconciliationEnvelope({
    parentScanId: "parent-scan",
    baseEvidence: { scanId: "parent-scan" },
    packet: unconfirmed,
    publicationDecision: {
      mode: "single_reconciliation",
      rejectReadyDeltaMs: -100,
      addedInitialReportWaitMs: 0,
      reason: "reject_packet_ready_before_primary",
    },
  });

  assert.equal(envelope.status, "unconfirmed");
  assert.equal(envelope.disposition, "not_joined");
});

test("confirmed evidence outside the canonical barrier remains unjoined", () => {
  const envelope = buildPostRefusalReconciliationEnvelope({
    parentScanId: "parent-scan",
    baseEvidence: { scanId: "parent-scan" },
    packet: confirmedPacket(1),
    publicationDecision: {
      mode: "single_reconciliation_limited",
      rejectReadyDeltaMs: 8_000,
      addedInitialReportWaitMs: 6_000,
      reason: "reject_path_exceeded_canonical_barrier",
    },
  });

  assert.equal(envelope.disposition, "not_joined");
  assert.ok(envelope.limitations.includes("canonical_join_deadline_exceeded"));
});

function confirmedPacket(observationCount: number) {
  const request = {
    requestId: "request-1",
    sanitizedUrl: "https://analytics.example.test/collect",
    hostname: "analytics.example.test",
    resourceType: "fetch",
    startedAtMs: 30,
    completedAtMs: 40,
    inFlightAtRefusalRegistration: false,
    msOffsetFromRefusal: 10,
    vendor: "Example Analytics",
    purpose: "analytics" as const,
    nonEssential: true,
  };
  return postRefusalEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_refusal_evidence.v1",
    artifactOnly: true,
    productionProjectable: false,
    scanId: "reject-scan",
    parentScanId: "parent-scan",
    targetUrl: "http://127.0.0.1:4173/fixture",
    normalizedUrl: "http://127.0.0.1:4173/fixture",
    observationBranch: "reject_only",
    phase: "post_action",
    consentAction: "reject",
    startedAt: "2026-08-26T00:00:00.000Z",
    completedAt: "2026-08-26T00:00:01.000Z",
    resolver: {
      found: true,
      method: "local_fixture_recipe",
      confidence: 1,
      recipeId: "fixture-reject-v1",
    },
    refusalRegistration: {
      status: "confirmed",
      refusalExercised: true,
      actionDispatchedAtMs: 10,
      refusalRegisteredAtMs: 20,
      witnesses: [{
        witnessType: "cmp_storage_state",
        observedAtMs: 20,
        corroboratingOnly: false,
      }],
    },
    observationWindowMs: 250,
    timing: {
      dispatchDelayMs: 0,
      navigationMs: 10,
      resolverMs: 2,
      confirmationMs: 5,
      observationMs: 250,
      totalMs: 267,
      readyAtMs: 267,
    },
    network: {
      requests: observationCount > 0 ? [request] : [],
      postRefusalNonEssentialRequests: observationCount > 0 ? [request] : [],
      activeRequestIdsAtRefusalRegistration: [],
    },
    storage: {
      preActionCapturedAtMs: 5,
      postActionCapturedAtMs: 25,
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
    observations: observationCount > 0
      ? [{
          observationType: "post_refusal_non_essential_activity",
          observedAtMs: 30,
          requestId: "request-1",
          msOffsetFromRefusal: 10,
          vendor: "Example Analytics",
          evidenceKeys: ["confirmed_refusal_registration"],
        }]
      : [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [],
  });
}
