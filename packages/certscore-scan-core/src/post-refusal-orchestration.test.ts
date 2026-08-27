import assert from "node:assert/strict";
import test from "node:test";
import {
  decidePostRefusalCooperativeAbort,
  decidePostRefusalReportPublication,
} from "./post-refusal-orchestration.js";

test("zero-wait join includes an already-ready reject packet", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 9_500,
  }), {
    mode: "initial_report",
    rejectReadyDeltaMs: -500,
    addedInitialReportWaitMs: 0,
    reason: "reject_packet_ready_before_primary",
  });
});

test("zero-wait join publishes a late generation instead of slowing primary", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 10_001,
  }), {
    mode: "late_generation",
    rejectReadyDeltaMs: 1,
    addedInitialReportWaitMs: 0,
    reason: "reject_packet_not_ready_without_delaying_primary",
  });
});

test("bounded join reports its exact added initial latency", () => {
  assert.deepEqual(decidePostRefusalReportPublication({
    primaryReadyAtMs: 10_000,
    rejectReadyAtMs: 10_350,
    approvedJoinWaitMs: 500,
  }), {
    mode: "initial_report_with_bounded_wait",
    rejectReadyDeltaMs: 350,
    addedInitialReportWaitMs: 350,
    reason: "reject_packet_ready_inside_approved_join_window",
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
