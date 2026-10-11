import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalVendor } from "./index.js";

test("documented analytics.google.com GA4 collector preserves canonical Google Analytics identity", () => {
  const existing = resolveCanonicalVendor({ type: "request", url: "https://www.google-analytics.com/g/collect?v=2" });
  for (const url of ["https://analytics.google.com/g/collect", "https://analytics.google.com/g/collect?v=2&tid=G-REDACTED&en=page_view"]) {
    const result = resolveCanonicalVendor({ type: "request", url });
    assert.equal(result.status, "resolved", url);
    assert.equal(result.observation?.product, "Google Analytics");
    assert.equal(result.observation?.purpose, "analytics");
    assert.equal(result.observation?.registryAttribution?.matchKind, "endpoint");
    for (const key of ["entityId", "vendorId", "serviceId"] as const) {
      assert.equal(result.observation?.registryAttribution?.[key], existing.observation?.registryAttribution?.[key]);
    }
    assert.deepEqual(result.observation?.registryAttribution?.ruleIds, ["ga_endpoint_or_cookie"]);
  }
});

test("GA4 shared-host attribution stays bounded to the exact HTTPS collection URL", () => {
  for (const url of [
    "https://analytics.google.com/", "https://analytics.google.com/analytics/web/",
    "https://analytics.google.com/g/collect/extra", "https://analytics.google.com/g/collect.evil",
    "https://analytics.google.com/g/collect/", "https://analytics.google.com/g/collect#fragment",
    "https://analytics.google.com/g/collect?x=1#fragment", "https://analytics.google.com/G/collect",
    "https://analytics.google.com:443/g/collect", "https://analytics.google.com:8443/g/collect",
    "http://analytics.google.com/g/collect", "https://analytics.google.com.evil.test/g/collect",
    "https://analytics.google.com@evil.test/g/collect", "https://user@analytics.google.com/g/collect",
    "https://example.test/?url=https://analytics.google.com/g/collect",
    "https://example.test/g/collect", "https://sub.analytics.google.com/g/collect",
  ]) {
    const result = resolveCanonicalVendor({ type: "request", url, hostname: "analytics.google.com" });
    assert.notEqual(result.observation?.product, "Google Analytics", url);
  }
  assert.equal(resolveCanonicalVendor({ type: "request", hostname: "analytics.google.com" }).status, "unrecognized");
  // Actual URL authority remains authoritative over inconsistent display metadata.
  assert.equal(resolveCanonicalVendor({ type: "request", url: "https://analytics.google.com/g/collect", hostname: "example.test" }).observation?.product, "Google Analytics");
});
