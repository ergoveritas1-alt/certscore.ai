import assert from "node:assert/strict";
import test from "node:test";
import { getPreviewScanAvailability } from "./preview-scan-availability";

test("preview scans stay available when the environment has queue credentials", () => {
  const availability = getPreviewScanAvailability(({
    REDIS_URL: "redis://localhost:6379"
  } as unknown) as NodeJS.ProcessEnv);

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});

test("preview scans stay available without validation queue configuration", () => {
  const availability = getPreviewScanAvailability(({} as unknown) as NodeJS.ProcessEnv);

  assert.deepEqual(availability, {
    enabled: true,
    reason: null
  });
});
