import assert from "node:assert/strict";
import test from "node:test";
import type { CrawlOccurrence } from "@website-signal-risk-scanner/shared/full-site-crawl";
import { classifyCrawlInventoryResource } from "./full-site-inventory-classification";
const base: CrawlOccurrence = {
  kind: "request", id: "request-1", identity: "request-1", label: "https://example.test/resource",
  vendor: null, serviceId: null, domain: "example.test", purpose: "unknown", resourceType: "fetch",
  relationship: "first_party", confidence: "unknown", assessment: "Not assessed", firstSeenMs: 100,
  eventCount: 1, evidenceRefs: ["retained-event-1"], details: {},
};
test("inventory uses canonical request classification without changing audit status", () => {
  assert.equal(classifyCrawlInventoryResource({ ...base, purpose: "analytics" }), "Non-essential");
  assert.equal(classifyCrawlInventoryResource(base), "Review");
  assert.equal(base.assessment, "Not assessed");
  assert.equal(classifyCrawlInventoryResource({ ...base, purpose: "analytics", eventCount: 0 }), "Review");
});
test("embeds remain contextual and compact cookies/storage lack necessity proof", () => {
  assert.equal(classifyCrawlInventoryResource({ ...base, kind: "embed", purpose: "advertising" }), "Contextual");
  for (const kind of ["cookie", "storage"] as const) {
    for (const purpose of ["advertising", "necessary", "unknown"]) {
      assert.equal(classifyCrawlInventoryResource({ ...base, kind, purpose }), "Review");
    }
  }
});
