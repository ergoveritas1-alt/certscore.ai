import assert from "node:assert/strict";
import { test } from "node:test";
import { consentActionStage } from "./consent-action-stage.js";

test("coordination identifies the terminal stage without assuming a click", () => {
  const idle = { started: true, workerReturned: false, timedOut: false, packetJoined: false, gateDeclined: false };
  const dispatched = { ...idle, dispatchStartedAtMs: 10 };
  assert.equal(consentActionStage({ ...idle, started: false }), "not_started");
  assert.equal(consentActionStage({ ...idle, gateDeclined: true }), "gate_declined");
  assert.equal(consentActionStage(idle), "not_dispatched");
  assert.equal(consentActionStage(dispatched), "worker_failed");
  assert.equal(consentActionStage({ ...dispatched, workerReturned: true, workerFailed: true }), "worker_failed");
  assert.equal(consentActionStage({ ...dispatched, timedOut: true }), "worker_deadline_exceeded");
  assert.equal(consentActionStage({ ...dispatched, timedOut: true, workerReturned: true }), "packet_deadline_exceeded");
  assert.equal(consentActionStage({ ...dispatched, timedOut: true, workerReturned: true,
    workerReturnedAtMs: 7323, deadlineAtMs: 7000 }), "worker_deadline_exceeded");
  assert.equal(consentActionStage({ ...dispatched, workerReturned: true }), "packet_not_joined");
  assert.equal(consentActionStage({ ...dispatched, workerReturned: true, packetJoined: true }), "packet_joined");
  assert.equal(consentActionStage({ ...dispatched, workerReturned: true, packetJoined: true, recheck: "failed" }), "exact_recheck_failed");
});
