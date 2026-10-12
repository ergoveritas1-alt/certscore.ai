import assert from "node:assert/strict";
import test from "node:test";
import { inventoryPurposeOptions, matchesInventoryPurpose, matchesInventoryResource } from "./inventory-search";

const resource = Object.freeze({ name: "https://metrics.example/collect", kind: "request", purposes: ["Advertising", "Analytics"],
  relationships: ["third_party"], occurrence: { domain: "metrics.example", vendor: "Example vendor" } });
const all = { query: "", purpose: "", kind: "all" };

test("search and filters intersect across names, domains, vendors and service names without rewriting evidence", () => {
  for (const query of [" COLLECT ", "metrics.example", "EXAMPLE VENDOR", "Example service"])
    assert.equal(matchesInventoryResource(resource, { ...all, query }, "Example service"), true);
  assert.equal(matchesInventoryResource(resource, { query: "metrics", purpose: "Advertising", kind: "request" }), true);
  for (const filters of [{ ...all, query: "no match" }, { ...all, kind: "embed" }, { ...all, purpose: "Security" }])
    assert.equal(matchesInventoryResource(resource, filters), false);
  assert.equal(resource.purposes.length, 2);
});

test("purpose filters include matching multi-purpose resources and preserve unknown categories", () => {
  assert.equal(matchesInventoryPurpose(resource.purposes, resource.relationships, "Analytics"), true);
  assert.equal(matchesInventoryPurpose(["advertising", "Analytics"], [], "Advertising"), true);
  assert.equal(matchesInventoryPurpose(["consent_management"], [], "Consent Management"), true);
  assert.deepEqual(inventoryPurposeOptions(["Consent Management", "consent_management"]), ["consent_management"]);
  assert.deepEqual(inventoryPurposeOptions(["Advertising", "advertising", "Analytics"]), ["advertising", "Analytics"]);
  assert.deepEqual(inventoryPurposeOptions(["advertising", "Analytics", "Advertising"]), ["Advertising", "Analytics"]);
  assert.equal(matchesInventoryPurpose(resource.purposes, resource.relationships, "mixed"), true);
  assert.equal(matchesInventoryPurpose(["Analytics"], [], "mixed"), false);
  assert.equal(matchesInventoryPurpose([], ["first_party"], "Unknown – 1st party"), true);
  assert.equal(matchesInventoryPurpose([], ["first_party"], "Advertising"), false);
});

test("cookies and storage share a type filter and clearing restores all retained types", () => {
  for (const kind of ["cookie", "storage"]) assert.equal(matchesInventoryResource({ ...resource, kind }, { ...all, kind: "cookie" }), true);
  assert.equal(matchesInventoryResource(resource, { ...all, kind: "cookie" }), false);
  for (const kind of ["request", "cookie", "storage", "embed"]) assert.equal(matchesInventoryResource({ ...resource, kind }, all), true);
});
