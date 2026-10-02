import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDiscoveredCoverage } from "./full-site-coverage";
test("counts unique discoveries by retained robots policy without mislabeling outside hosts", () => {
  const policy = { rules: [{ allow: false, path: "/private" }], crawlDelaySeconds: 0, sitemaps: [] };
  assert.deepEqual(summarizeDiscoveredCoverage([
    "https://example.com/", "https://example.com/", "https://example.com/private", "https://other.com/"
  ], { ...policy, byHost: { "example.com": policy } }, ["example.com"]), { discovered: 3, allowed: 1, blocked: 1, unknown: 0, outOfScope: 1 });
  assert.deepEqual(summarizeDiscoveredCoverage(["https://example.com/"], null, ["example.com"]), { discovered: 1, allowed: 0, blocked: 0, unknown: 1, outOfScope: 0 });
});
