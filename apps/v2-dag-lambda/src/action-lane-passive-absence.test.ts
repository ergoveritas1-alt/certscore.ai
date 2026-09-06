import assert from "node:assert/strict";
import test from "node:test";
import { actionLanePassiveAbsenceDisposition as disposition } from "./action-lane-passive-absence.js";

test("passive absence cancels a not-yet-dispatched action without starting browser work", () => {
  assert.equal(disposition({ settled: false, passiveBarrierReached: false }), "cancel_not_dispatched");
});
test("passive absence allows an independent launched action only the existing passive window", () => {
  assert.equal(disposition({ dispatchStartedAtMs: 0, settled: false, passiveBarrierReached: false }), "await_passive_barrier");
  assert.equal(disposition({ dispatchStartedAtMs: 0, settled: false, passiveBarrierReached: true }), "cancel_incomplete");
});
test("returned action results and already terminal cancellation are not reopened by passive absence", () => {
  for (const dispatchStartedAtMs of [undefined, 0, 100]) {
    for (const passiveBarrierReached of [false, true]) {
      assert.equal(disposition({ dispatchStartedAtMs, settled: true, passiveBarrierReached }), "keep_terminal");
    }
  }
});
