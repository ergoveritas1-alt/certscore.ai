import assert from "node:assert/strict";
import test from "node:test";
import { getFullScanQueueAvailabilityFromHeartbeat } from "./full-scan-queue";

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
