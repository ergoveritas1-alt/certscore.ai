import assert from "node:assert/strict";
import test from "node:test";
import { buildQueuedFullScanConfig } from "./full-scan-config";

test("queued full-scan config keeps anonymous and organization-owned scanner contract aligned", () => {
  const baseInput = {
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage"
  };

  const anonymousConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "marketing-anonymous-full-scan"
  });
  const organizationConfig = buildQueuedFullScanConfig({
    ...baseInput,
    source: "manual-dashboard"
  });

  assert.deepEqual(
    { ...anonymousConfig, source: "normalized-for-comparison" },
    { ...organizationConfig, source: "normalized-for-comparison" }
  );
  assert.equal(anonymousConfig.processor, "queued-full-scan-v1");
  assert.equal(anonymousConfig.maxRequestedTier, "tier5_full_scan");
  assert.equal(anonymousConfig.freshBrowserRequired, true);
});
