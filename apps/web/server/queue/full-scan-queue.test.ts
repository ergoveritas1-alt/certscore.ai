import assert from "node:assert/strict";
import test from "node:test";
import { getFullScanQueueAvailabilityFromHeartbeat, resolveScannerServiceHeartbeatSnapshot } from "./full-scan-queue";

test("disables scanning when no scanner heartbeat is present", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(null, Date.parse("2026-03-21T12:00:00.000Z"));

  assert.equal(availability.enabled, false);
  assert.match(availability.reason ?? "", /no healthy scanner service heartbeat/i);
});

test("allows degraded scanning when scanner wake-up automation is expected", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(null, Date.parse("2026-03-21T12:00:00.000Z"), {
    allowDegradedScanner: true
  });

  assert.equal(availability.enabled, true);
  assert.match(availability.reason ?? "", /accepting queued work/i);
});

test("enables scanning when the scanner heartbeat is fresh", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(
    "2026-03-21T11:59:10.000Z",
    Date.parse("2026-03-21T12:00:00.000Z")
  );

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("disables scanning when the scanner heartbeat is stale", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(
    "2026-03-21T11:57:00.000Z",
    Date.parse("2026-03-21T12:00:00.000Z")
  );

  assert.equal(availability.enabled, false);
  assert.match(availability.reason ?? "", /no healthy scanner service heartbeat/i);
});

test("uses the event heartbeat when the worker_heartbeats table query fails", () => {
  const heartbeat = resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage: "Could not find the table 'public.worker_heartbeats' in the schema cache",
    eventErrorMessage: null,
    eventHeartbeatAt: "2026-03-21T11:59:40.000Z",
    eventHost: "event-worker",
    tableHeartbeatAt: null,
    tableHost: null
  });

  assert.deepEqual(heartbeat, {
    errorMessage: null,
    host: "event-worker",
    lastHeartbeatAt: "2026-03-21T11:59:40.000Z"
  });
});

test("uses the table heartbeat when the event query fails", () => {
  const heartbeat = resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage: null,
    eventErrorMessage: "temporary scan_events failure",
    eventHeartbeatAt: null,
    eventHost: null,
    tableHeartbeatAt: "2026-03-21T11:59:50.000Z",
    tableHost: "table-worker"
  });

  assert.deepEqual(heartbeat, {
    errorMessage: null,
    host: "table-worker",
    lastHeartbeatAt: "2026-03-21T11:59:50.000Z"
  });
});

test("returns an error only when both heartbeat sources fail", () => {
  const heartbeat = resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage: "worker_heartbeats unavailable",
    eventErrorMessage: "scan_events unavailable",
    eventHeartbeatAt: null,
    eventHost: null,
    tableHeartbeatAt: null,
    tableHost: null
  });

  assert.equal(heartbeat.lastHeartbeatAt, null);
  assert.equal(heartbeat.host, null);
  assert.match(heartbeat.errorMessage ?? "", /worker_heartbeats unavailable/);
  assert.match(heartbeat.errorMessage ?? "", /scan_events unavailable/);
});

test("prefers the event heartbeat when both sources are present", () => {
  const heartbeat = resolveScannerServiceHeartbeatSnapshot({
    heartbeatErrorMessage: null,
    eventErrorMessage: null,
    eventHeartbeatAt: "2026-03-21T11:59:55.000Z",
    eventHost: "event-worker",
    tableHeartbeatAt: "2026-03-21T11:59:50.000Z",
    tableHost: "table-worker"
  });

  assert.deepEqual(heartbeat, {
    errorMessage: null,
    host: "event-worker",
    lastHeartbeatAt: "2026-03-21T11:59:55.000Z"
  });
});
