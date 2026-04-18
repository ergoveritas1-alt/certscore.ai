import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewScanAvailability } from "./preview-scan-availability";

test("preview scans stay available when the validation queue is configured", () => {
  const availability = getPreviewScanAvailability(({
    REDIS_URL: "redis://localhost:6379"
  } as unknown) as NodeJS.ProcessEnv);

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("preview scans explain missing validation queue configuration", () => {
  const availability = getPreviewScanAvailability(({} as unknown) as NodeJS.ProcessEnv);

  assert.equal(availability.enabled, false);
  assert.match(availability.reason ?? "", /validation queueing is unavailable/i);
  assert.doesNotMatch(availability.reason ?? "", /scanner service heartbeat/i);
});
