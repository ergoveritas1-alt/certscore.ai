import assert from "node:assert/strict";
import test from "node:test";
import { getFullScanQueueAvailabilityFromHeartbeat, resolveFullScanWorkerHeartbeatSnapshot } from "./full-scan-queue";

test("disables queueing when no full-scan heartbeat is present", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(null, Date.parse("2026-03-21T12:00:00.000Z"));

  assert.equal(availability.enabled, false);
  assert.match(availability.reason ?? "", /no healthy full-scan worker heartbeat/i);
});

test("enables queueing when the full-scan heartbeat is fresh", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(
    "2026-03-21T11:59:10.000Z",
    Date.parse("2026-03-21T12:00:00.000Z")
  );

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("disables queueing when the full-scan heartbeat is stale", () => {
  const availability = getFullScanQueueAvailabilityFromHeartbeat(
    "2026-03-21T11:57:00.000Z",
    Date.parse("2026-03-21T12:00:00.000Z")
  );

  assert.equal(availability.enabled, false);
  assert.match(availability.reason ?? "", /no healthy full-scan worker heartbeat/i);
});

test("uses the legacy heartbeat when the worker_heartbeats table query fails", () => {
  const heartbeat = resolveFullScanWorkerHeartbeatSnapshot({
    heartbeatErrorMessage: "Could not find the table 'public.worker_heartbeats' in the schema cache",
    legacyErrorMessage: null,
    legacyHeartbeatAt: "2026-03-21T11:59:40.000Z",
    legacyHost: "legacy-worker",
    tableHeartbeatAt: null,
    tableHost: null
  });

  assert.deepEqual(heartbeat, {
    errorMessage: null,
    host: "legacy-worker",
    lastHeartbeatAt: "2026-03-21T11:59:40.000Z"
  });
});

test("uses the table heartbeat when the legacy event query fails", () => {
  const heartbeat = resolveFullScanWorkerHeartbeatSnapshot({
    heartbeatErrorMessage: null,
    legacyErrorMessage: "temporary scan_events failure",
    legacyHeartbeatAt: null,
    legacyHost: null,
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
  const heartbeat = resolveFullScanWorkerHeartbeatSnapshot({
    heartbeatErrorMessage: "worker_heartbeats unavailable",
    legacyErrorMessage: "scan_events unavailable",
    legacyHeartbeatAt: null,
    legacyHost: null,
    tableHeartbeatAt: null,
    tableHost: null
  });

  assert.equal(heartbeat.lastHeartbeatAt, null);
  assert.equal(heartbeat.host, null);
  assert.match(heartbeat.errorMessage ?? "", /worker_heartbeats unavailable/);
  assert.match(heartbeat.errorMessage ?? "", /scan_events unavailable/);
});
