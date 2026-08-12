import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { buildNanoSignalDispatchFailureEvent, VALIDATION_DISPATCH_IDLE_POLL_MS } from "./dispatcher";
import { NANO_SIGNAL_STALE_SAFETY_RECHECK_MS } from "./pipeline";
import {
  NANO_SIGNAL_BROAD_RECONCILIATION_SWEEP_MS,
  NANO_SIGNAL_DURABLE_RECOVERY_SWEEP_MS,
  NanoSignalWakeupQueue,
  parseNanoSignalWakeupPayload
} from "./nano-signal-wakeup";

test("validation dispatch uses a database-safe idle polling interval", () => {
  assert.equal(VALIDATION_DISPATCH_IDLE_POLL_MS, 1_000);
});

test("Nano wakeups use a two-second durable sweep and infrequent broad reconciliation", () => {
  assert.equal(NANO_SIGNAL_DURABLE_RECOVERY_SWEEP_MS, 2_000);
  assert.equal(NANO_SIGNAL_BROAD_RECONCILIATION_SWEEP_MS, 5 * 60_000);
  assert.equal(NANO_SIGNAL_STALE_SAFETY_RECHECK_MS, 5 * 60_000);
});

test("Nano wakeup payloads fail closed and preserve durable recheck timing", () => {
  assert.deepEqual(
    parseNanoSignalWakeupPayload('{"scanId":"scan-1","notBeforeEpochMs":1234}'),
    { notBeforeEpochMs: 1234, scanId: "scan-1" }
  );
  assert.equal(parseNanoSignalWakeupPayload("not-json"), null);
  assert.equal(parseNanoSignalWakeupPayload('{"notBeforeEpochMs":1234}'), null);
});

test("Nano wakeup queue deduplicates immediate scan IDs", () => {
  const queue = new NanoSignalWakeupQueue();
  queue.enqueue({ notBeforeEpochMs: null, scanId: "scan-1" });
  queue.enqueue({ notBeforeEpochMs: null, scanId: "scan-1" });
  assert.equal(queue.take(), "scan-1");
  assert.equal(queue.take(), null);
});

test("Nano wakeup migration makes event inserts and terminal scan updates transactional wakeups", () => {
  const source = readFileSync("packages/db/migrations/0173_nano_signal_worker_wakeups.sql", "utf8");
  const indexSource = readFileSync("packages/db/migrations/0174_nano_signal_durable_recovery_index.sql", "utf8");
  assert.match(source, /pg_notify\('certscore_nano_signal_work'/);
  assert.match(source, /signals\.nano_doc_enrichment_requested/);
  assert.match(source, /browser_extension\.observed_signals_ingested/);
  assert.match(source, /after update of status on public\.scans/);
  assert.match(source, /after insert on public\.policy_enrichment/);
  assert.match(indexSource, /scan_events_nano_queue_recent_idx/);
  assert.match(indexSource, /signals\.nano_doc_enrichment_requested/);
  const projectionSource = readFileSync("packages/db/migrations/0175_nano_signal_work_item_projection.sql", "utf8");
  assert.match(projectionSource, /create table if not exists public\.nano_signal_work_items/);
  assert.match(projectionSource, /nano_signal_work_items_due_idx/);
  assert.match(projectionSource, /signals\.nano_doc_enrichment_completed/);
  assert.match(projectionSource, /signals\.nano_doc_enrichment_failed/);
});

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
