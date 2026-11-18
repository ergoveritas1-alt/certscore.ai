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
  assert.equal(classifyCrawlInventoryResource(base), "Unclassified");
  assert.equal(base.assessment, "Not assessed");
  assert.equal(classifyCrawlInventoryResource({ ...base, purpose: "analytics", eventCount: 0 }), "Review");
});
test("embeds remain contextual and compact cookies/storage lack necessity proof", () => {
  assert.equal(classifyCrawlInventoryResource({ ...base, kind: "embed", purpose: "advertising" }), "Contextual");
  for (const kind of ["cookie", "storage"] as const) {
    for (const purpose of ["advertising", "necessary", "unknown"]) {
      assert.equal(classifyCrawlInventoryResource({ ...base, kind, purpose }), kind === "storage" ? "Contextual" : "Review");
    }
  }
});

test("first-party static assets are contextual while scripts and known tracking retain review classification", () => {
  for (const resourceType of ["stylesheet", "font", "image"]) {
    assert.equal(classifyCrawlInventoryResource({ ...base, resourceType }), "Contextual");
    assert.equal(classifyCrawlInventoryResource({ ...base, resourceType, purpose: "analytics" }), "Non-essential");
    assert.equal(classifyCrawlInventoryResource({ ...base, resourceType, relationship: "third_party" }), "Unclassified");
  }
  assert.equal(classifyCrawlInventoryResource({ ...base, resourceType: "script" }), "Unclassified");
});

test("successful CDN image delivery needs an attributed asset endpoint; a CDN hostname alone cannot clear a review", () => {
  const image = { ...base, label: "https://cdn.sanity.io/images/abc/production/_redacted_",
    domain: "cdn.sanity.io", resourceType: "Image", purpose: "infrastructure", details: { method: "GET", httpStatus: 200 } };
  assert.equal(classifyCrawlInventoryResource(image), "Contextual");
  const ambiguous: CrawlOccurrence[] = [
    { ...image, label: "https://cdn.sanity.io/collect" },
    { ...image, details: { method: "GET", httpStatus: 204 } },
    { ...image, details: { method: "GET", httpStatus: 200, hasCookieOrTrackingEvidence: true } },
    { ...image, details: { method: "POST", httpStatus: 200 } },
    { ...image, details: { method: "GET" } },
  ];
  for (const row of ambiguous) assert.equal(classifyCrawlInventoryResource(row), "Review");
  assert.equal(classifyCrawlInventoryResource({ ...image, purpose: "advertising" }), "Non-essential");
});
