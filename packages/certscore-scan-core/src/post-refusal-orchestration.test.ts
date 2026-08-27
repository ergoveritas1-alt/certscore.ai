import assert from "node:assert/strict";
import test from "node:test";
import {
  comparePostRefusalLaneReadiness,
  decidePostRefusalCooperativeAbort,
  decidePostRefusalReportPublication,
} from "./post-refusal-orchestration.js";

test("compares reject readiness with consent proof and the full primary barrier separately", () => {
  assert.deepEqual(comparePostRefusalLaneReadiness({
    laneReadyAtMs: {
      consent_proof: 4_000,
      runtime_evidence: 9_000,
      policy_evidence: 12_000,
    },
    rejectReadyAtMs: 8_000,
  }), {
    consentProofDeltaMs: 4_000,
    policyEvidenceDeltaMs: -4_000,
    primaryReadyAtMs: 12_000,
    rejectReadyBeforeConsentProof: false,
    rejectReadyBeforePrimary: true,
    runtimeEvidenceDeltaMs: -1_000,
  });
});

test("treats equal readiness timestamps as ready before the compared lane", () => {
  const comparison = comparePostRefusalLaneReadiness({
    laneReadyAtMs: {
      consent_proof: 5_000,
      runtime_evidence: 4_000,
      policy_evidence: 3_000,
    },
    rejectReadyAtMs: 5_000,
  });

  assert.equal(comparison.rejectReadyBeforeConsentProof, true);
  assert.equal(comparison.rejectReadyBeforePrimary, true);
  assert.equal(comparison.consentProofDeltaMs, 0);
  assert.equal(comparison.primaryReadyAtMs, 5_000);
});

test("single reconciliation adds no wait when reject evidence is already ready", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 9_500,
  }), {
    mode: "single_reconciliation",
    rejectReadyDeltaMs: -500,
    addedInitialReportWaitMs: 0,
    reason: "reject_packet_ready_before_primary",
  });
});

test("single reconciliation waits when reject evidence finishes after the passive lanes", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 10_001,
  }), {
    mode: "single_reconciliation",
    rejectReadyDeltaMs: 1,
    addedInitialReportWaitMs: 1,
    reason: "reject_packet_extended_canonical_barrier",
  });
});

test("legacy join-window input does not reintroduce a second publication branch", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 10_350,
    approvedJoinWaitMs: 500,
  }), {
    mode: "single_reconciliation",
    rejectReadyDeltaMs: 350,
    addedInitialReportWaitMs: 350,
    reason: "reject_packet_extended_canonical_barrier",
  });
});

test("single reconciliation caps the reject tail at six seconds and remains one publication", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 18_500,
  }), {
    mode: "single_reconciliation_limited",
    rejectReadyDeltaMs: 8_500,
    addedInitialReportWaitMs: 6_000,
    reason: "reject_path_exceeded_canonical_barrier",
  });
});

test("complete consent inventory without reject requests cooperative pre-action abort", () => {
  assert.deepEqual(decidePostRefusalCooperativeAbort({
    consentInventoryComplete: true,
    rejectControlObserved: false,
    rejectActionDispatched: false,
  }), {
    abortRequested: true,
    reason: "complete_inventory_without_reject",
  });
});

test("cooperative abort never interrupts a dispatched reject action", () => {
  assert.deepEqual(decidePostRefusalCooperativeAbort({
    consentInventoryComplete: true,
    rejectControlObserved: false,
    rejectActionDispatched: true,
  }), {
    abortRequested: false,
    reason: "reject_action_already_dispatched",
  });
});
