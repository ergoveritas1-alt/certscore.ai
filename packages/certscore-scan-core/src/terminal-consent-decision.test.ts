import assert from "node:assert/strict";
import test from "node:test";
import type { AfterActionCapture } from "@certscore/contracts";
import { terminalConsentDecisionRead } from "./terminal-consent-decision.js";

test("terminal reads retain only in-window, same-document, uncancelled results and run once", async context => {
  let now = 1800;
  context.mock.method(Date, "now", () => now);
  for (const failure of ["none", "late", "cancelled", "target_changed", "stale"] as const) {
    now = 1800;
    let authorized = true;
    let reads = 0;
    const controller = new AbortController();
    let complete!: (value: { stateHash: string; observedAtEpochMs: number }) => void;
    const pending = new Promise<{ stateHash: string; observedAtEpochMs: number }>(resolve => { complete = resolve; });
    const read = terminalConsentDecisionRead({ action: "reject", authorizedTargetSha256: "a".repeat(64),
      parentScanStartedAtMs: 0, dispatchedAtEpochMs: 1000, observationWindowMs: 1000,
      signal: controller.signal, targetStillAuthorized: () => authorized,
      read: () => { reads++; return pending; } });
    read.start(); read.start();
    assert.equal(reads, 1);
    now = failure === "late" ? 2001 : 1900;
    if (failure === "cancelled") controller.abort();
    if (failure === "target_changed") authorized = false;
    complete({ stateHash: "b".repeat(64), observedAtEpochMs: failure === "stale" ? 999 : 1850 });
    await Promise.resolve();
    now = 2000;
    const capture: AfterActionCapture = { policyVersion: "bounded_after_action_capture.v1", action: "reject",
      activationStatus: "completed", actionDispatchedAtMs: 1000, captureEndedAtMs: 2000, requestedWindowMs: 1000,
      stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: [] };
    assert.equal(Boolean(read.retained(capture)), failure === "none", failure);
    if (failure === "none") {
      authorized = false;
      assert.equal(read.retained(capture), undefined, "recheck target when retaining proof");
    }
  }
});

test("registered terminal reads use the registered clock and stop at the earlier result deadline", async context => {
  let now = 1500;
  context.mock.method(Date, "now", () => now);
  let reads = 0;
  const reader = terminalConsentDecisionRead({
    action: "accept", authorizedTargetSha256: "a".repeat(64), parentScanStartedAtMs: 0,
    dispatchedAtEpochMs: 1000, registeredAtEpochMs: 1100, observationWindowMs: 800,
    resultDeadlineAtMs: 1800, targetStillAuthorized: () => true,
    read: async () => { reads++; return {stateHash:"b".repeat(64),observedAtEpochMs:1100}; },
  });
  reader.tick();
  assert.equal(reads, 0, "the dispatch-relative final interval does not trigger the registered read");
  now = 1700;
  reader.tick();
  reader.tick();
  await Promise.resolve();
  assert.equal(reads, 1);
  const window = {action:"accept" as const,dispatchedAtMs:1000,startedAtMs:1100,requiredWindowMs:800,endedAtMs:1900};
  assert.equal(reader.retained(undefined, {...window,endedAtMs:1790}), undefined, "an early end cannot establish a terminal state");
  assert.equal(reader.retained(undefined, window)?.readStartedAtMs, 1700);
  reader.discard();
  assert.equal(reader.retained(undefined, window), undefined);

  const closed = terminalConsentDecisionRead({
    action: "accept", authorizedTargetSha256: "a".repeat(64), parentScanStartedAtMs: 0,
    dispatchedAtEpochMs: 1000, registeredAtEpochMs: 1100, observationWindowMs: 800,
    resultDeadlineAtMs: 1630, targetStillAuthorized: () => true,
    read: async () => { reads++; return undefined; },
  });
  closed.tick();
  assert.equal(reads, 1, "a result deadline before the final interval cannot launch the read");
});
