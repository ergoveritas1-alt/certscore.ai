import assert from "node:assert/strict";
import test from "node:test";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { buildNanoSignalDispatchFailureEvent } from "./dispatcher";

test("buildNanoSignalDispatchFailureEvent schedules bounded retries with persisted backoff", () => {
  const first = buildNanoSignalDispatchFailureEvent({
    error: new Error("missing retained inputs"),
    pollCount: 0,
    recoveryMode: "completed_scan_backfill"
  });

  assert.equal(first.eventType, SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued);
  assert.equal(first.terminal, false);
  assert.equal(first.delayMs, 1_000);
  assert.equal(first.metadataJson.pollCount, 1);
  assert.equal(first.metadataJson.recoveryMode, "completed_scan_backfill");
  assert.equal(first.metadataJson.reason, "dispatcher_error");
});

test("buildNanoSignalDispatchFailureEvent persists a terminal failure on the third attempt", () => {
  const terminal = buildNanoSignalDispatchFailureEvent({
    error: "still failing",
    pollCount: 2,
    recoveryMode: "completed_scan_backfill"
  });

  assert.equal(terminal.eventType, SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed);
  assert.equal(terminal.terminal, true);
  assert.equal(terminal.metadataJson.attemptCount, 3);
  assert.equal(terminal.metadataJson.reason, "dispatcher_error");
});
