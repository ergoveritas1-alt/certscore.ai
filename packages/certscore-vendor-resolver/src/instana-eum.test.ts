import assert from "node:assert/strict";
import test from "node:test";
import { getCanonicalVendorRegistryManifest, resolveCanonicalVendor } from "./index.js";

test("documented Instana EUM collector and agent retain one performance-monitoring identity", () => {
  const identities = new Set<string>();
  for (const url of [
    "https://eum-blue-saas.instana.io/",
    "https://eum-blue-saas.instana.io/?diagnostic=1",
    "https://eum.instana.io/eum.min.js",
    "https://eum.instana.io/eum.min.js?v=1",
  ]) {
    const result = resolveCanonicalVendor({ type: "request", url });
    assert.equal(result.status, "resolved", url);
    assert.equal(result.observation?.product, "Instana End User Monitoring");
    assert.equal(result.observation?.purpose, "performance_monitoring");
    assert.equal(result.observation?.servicePurpose, "Performance monitoring");
    assert.equal(result.observation?.registryAttribution?.matchKind, "endpoint");
    identities.add(JSON.stringify(result.observation?.registryAttribution?.serviceId));
  }
  assert.equal(identities.size, 1);
  const rule = getCanonicalVendorRegistryManifest().rules.find(row => row.ruleId === "instana_eum_documented_endpoints");
  assert.equal(rule?.review.status, "source_reviewed");
});

test("Instana attribution cannot be borrowed from unrelated authorities or adjacent paths", () => {
  for (const url of [
    "https://eum-blue-saas.instana.io/ordinary",
    "https://eum-blue-saas.instana.io/eum.min.js",
    "https://eum.instana.io/",
    "https://eum.instana.io/eum.min.js/extra",
    "https://eum.instana.io/eum.min.js.evil",
    "https://other.instana.io/",
    "https://eum-blue-saas.instana.io.evil.test/",
    "https://eum-blue-saas.instana.io@evil.test/",
    "https://example.test/?url=https://eum-blue-saas.instana.io/",
    "http://eum-blue-saas.instana.io/",
  ]) {
    const result = resolveCanonicalVendor({ type: "request", url, hostname: "eum-blue-saas.instana.io" });
    assert.notEqual(result.observation?.product, "Instana End User Monitoring", url);
  }
  assert.equal(resolveCanonicalVendor({ type: "request", hostname: "eum-blue-saas.instana.io" }).status, "unrecognized");
  assert.equal(resolveCanonicalVendor({ type: "cookie", hostname: "eum-blue-saas.instana.io", cookieName: "ordinary" }).status, "unrecognized");
});
