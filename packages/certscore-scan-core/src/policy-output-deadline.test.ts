import assert from "node:assert/strict";
import test from "node:test";
import { policySurfaceRequiredForUnboundedOutput } from "./index.js";

test("planned-parallel production scans retain complete policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: false,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), true);
});

test("sequential and replay scans retain the complete policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: false,
    plannedParallel: false,
    policySurfaceEnabled: true,
  }), true);
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: true,
    earlyConfirmedNoGo: false,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), true);
});

test("confirmed no-go scans do not wait for policy output", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: true,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), false);
});
