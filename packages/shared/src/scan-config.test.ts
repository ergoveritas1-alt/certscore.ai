import assert from "node:assert/strict";
import test from "node:test";
import { buildSharedFullScanConfig } from "./scan-config";

test("buildSharedFullScanConfig preserves bounded blocked-site recovery defaults", () => {
  const config = buildSharedFullScanConfig({
    maxPages: 5,
    processor: "queued-full-scan-v1",
    profile: "team",
    source: "manual-dashboard"
  });

  assert.equal(config.freshBrowserRequired, true);
  assert.equal(config.maxRequestedTier, "tier5_full_scan");
  assert.deepEqual(config.post403Policy, {
    maxHomepageRetriesAfter403: 0,
    maxPassiveVerificationFetchesAfter403: 4,
    passiveOnlyAfter403: true,
    stopOnHomepage403: true,
    verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
  });
});

test("buildSharedFullScanConfig allows callers to add scan metadata while keeping recovery defaults", () => {
  const config = buildSharedFullScanConfig({
    frequency: "hourly",
    hostname: "robinhood.com",
    maxPages: 5,
    normalizedUrl: "https://robinhood.com/",
    processor: "scheduled-full-scan-v2",
    profile: "team",
    source: "scheduled-monitoring",
    triggerMode: "automatic"
  });

  assert.equal(config.frequency, "hourly");
  assert.equal(config.hostname, "robinhood.com");
  assert.equal(config.normalizedUrl, "https://robinhood.com/");
  assert.equal(config.triggerMode, "automatic");
  assert.equal((config.post403Policy as { maxPassiveVerificationFetchesAfter403: number }).maxPassiveVerificationFetchesAfter403, 4);
});

test("buildSharedFullScanConfig allows execution and tier overrides", () => {
  const config = buildSharedFullScanConfig({
    execution: {
      scanPlanProfileOverride: "runtime_fast"
    },
    maxPages: 1,
    maxRequestedTier: "tier2_browser_surface",
    processor: "queued-full-scan-v1",
    profile: "homepage",
    source: "marketing-preview"
  });

  assert.equal(config.maxRequestedTier, "tier2_browser_surface");
  assert.deepEqual(config.execution, {
    scanPlanProfileOverride: "runtime_fast"
  });
});
