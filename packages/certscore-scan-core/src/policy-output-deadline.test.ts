import assert from "node:assert/strict";
import test from "node:test";
import { policySurfaceRequiredForUnboundedOutput } from "./index.js";

test("planned-parallel production scans use the bounded policy output grace", () => {
  assert.equal(policySurfaceRequiredForUnboundedOutput({
    captureReplay: false,
    earlyConfirmedNoGo: false,
    plannedParallel: true,
    policySurfaceEnabled: true,
  }), false);
});

test("sequential and replay scans still retain the complete policy output", () => {
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
