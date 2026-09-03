import assert from "node:assert/strict";
import test from "node:test";
import {
  createPassiveEvidenceActivityTracker,
  PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS,
  waitForPassiveEvidenceQuietWindow,
} from "./passive-evidence-quiet-window.js";

function fakeClock() {
  let value = 0;
  return {
    now: () => value,
    wait: async (durationMs: number) => {
      value += durationMs;
    },
  };
}

test("passive evidence quiet window starts at 250ms after the post-navigation checkpoint", async () => {
  const clock = fakeClock();
  const tracker = createPassiveEvidenceActivityTracker(clock.now());
  const result = await waitForPassiveEvidenceQuietWindow({
    now: clock.now,
    timeoutMs: 1_500,
    tracker,
    wait: clock.wait,
  });

  assert.equal(PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS, 250);
  assert.equal(result.status, "quiet");
  assert.equal(result.elapsedMs, 250);
  assert.equal(result.inFlightRequestCount, 0);
});

test("new requests restart the quiet clock and an unsettled request reaches the existing hard cap", async () => {
  const clock = fakeClock();
  const tracker = createPassiveEvidenceActivityTracker(clock.now());
  const request = {};
  let requestStarted = false;
  const result = await waitForPassiveEvidenceQuietWindow({
    now: clock.now,
    pollIntervalMs: 25,
    quietWindowMs: 250,
    timeoutMs: 500,
    tracker,
    wait: async (durationMs) => {
      await clock.wait(durationMs);
      if (!requestStarted && clock.now() >= 100) {
        requestStarted = true;
        tracker.markRequestStarted(request, clock.now());
      }
    },
  });

  assert.equal(result.status, "timed_out");
  assert.equal(result.elapsedMs, 500);
  assert.equal(result.inFlightRequestCount, 1);
});

test("a completed request restarts the quiet window without adding a fixed settle delay", async () => {
  const clock = fakeClock();
  const tracker = createPassiveEvidenceActivityTracker(clock.now());
  const request = {};
  let stage: "pending" | "started" | "finished" = "pending";
  const result = await waitForPassiveEvidenceQuietWindow({
    now: clock.now,
    timeoutMs: 1_500,
    tracker,
    wait: async (durationMs) => {
      await clock.wait(durationMs);
      if (stage === "pending" && clock.now() >= 100) {
        stage = "started";
        tracker.markRequestStarted(request, clock.now());
      }
      if (stage === "started" && clock.now() >= 200) {
        stage = "finished";
        tracker.markRequestFinished(request, clock.now());
      }
    },
  });

  assert.equal(result.status, "quiet");
  assert.equal(result.elapsedMs, 450);
  assert.equal(result.quietForMs, 250);
});
