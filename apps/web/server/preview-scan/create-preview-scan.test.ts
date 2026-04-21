import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewScanAvailability } from "./preview-scan-availability";

test("preview scans stay available when the queue heartbeat is healthy", async () => {
  const availability = await getPreviewScanAvailability({
    getQueueAvailability: async () => ({
      enabled: true,
      reason: null
    })
  });

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("preview scans are unavailable when the scanner heartbeat is stale", async () => {
  const availability = await getPreviewScanAvailability({
    getQueueAvailability: async () => ({
      enabled: false,
      reason: "Scanning is unavailable because no healthy scanner service heartbeat was detected."
    })
  });

  assert.deepEqual(availability, {
    enabled: false,
    reason: "Scanning is unavailable because no healthy scanner service heartbeat was detected."
  });
});
