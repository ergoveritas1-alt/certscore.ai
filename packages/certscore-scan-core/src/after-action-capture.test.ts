import assert from "node:assert/strict";
import test from "node:test";
import { finishAfterActionWindow } from "./after-action-capture.js";

test("confirmation time counts toward the after-click window instead of starting another window", async () => {
  const started = Date.now();
  assert.equal(await finishAfterActionWindow({ dispatchedAtEpochMs: started - 1000, observationWindowMs: 1000,
    clickCompleted: true, targetStillAuthorized: () => true }), "window_elapsed");
  assert.ok(Date.now() - started < 100);
});

test("uncertain dispatch never incurs a fresh observation wait", async () => {
  assert.equal(await finishAfterActionWindow({ dispatchedAtEpochMs: Date.now(), observationWindowMs: 30_000,
    clickCompleted: false, targetStillAuthorized: () => true }), "click_uncertain");
});

test("cancellation and unavailable target checks fail closed", async () => {
  const common = { dispatchedAtEpochMs: Date.now(), observationWindowMs: 30_000, clickCompleted: true };
  assert.equal(await finishAfterActionWindow({ ...common, signal: AbortSignal.abort(), targetStillAuthorized: () => true }), "aborted");
  assert.equal(await finishAfterActionWindow({ ...common, targetStillAuthorized: () => { throw new Error("closed"); } }), "target_changed");
});
