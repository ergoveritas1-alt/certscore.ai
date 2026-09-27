import assert from "node:assert/strict";
import test from "node:test";
import { buildNetworkInventoryOverview } from "./network-inventory-overview";

test("network overview deduplicates identities, excludes unknown service buckets, and preserves source evidence", () => {
  const known = { identity: { product: "Example analytics" } };
  const embedOnly = { identity: { product: "Example embeds" } };
  const unknown = { identity: null };
  const resources = [
    { key: "request:a", kind: "request", context: known, eventCount: 200, pageIds: ["one", "two"] },
    { key: "cookie:a", kind: "cookie", context: known, eventCount: 1, pageIds: ["one"] },
  ];
  const services = [
    { key: "known", context: known, resources },
    { key: "known", context: known, resources },
    { key: "unclassified", context: unknown, resources: [{ key: "request:b", kind: "request", context: unknown, eventCount: 537, pageIds: ["one"] }] },
    { key: "embed-only", context: embedOnly, resources: [{ key: "embed:a", kind: "embed", context: embedOnly, eventCount: 13, pageIds: ["one"] }] },
  ];
  const before = structuredClone(services);
  const { distinctClassifications, ...overview } = buildNetworkInventoryOverview(services);
  assert.equal(distinctClassifications?.requests.unclassified, 2);
  assert.equal(distinctClassifications?.storage.unclassified, 1);
  assert.equal(distinctClassifications?.embeds.unclassified, 1);
  assert.deepEqual(overview, { identifiedServices: 2, identifiedServiceNames: ["Example analytics", "Example embeds"], distinctResources: 2, unattributedResources: 1, distinctStorage: 1, distinctEmbeds: 1 });
  assert.deepEqual(services, before);
  const { distinctClassifications: emptyClassifications, ...emptyOverview } = buildNetworkInventoryOverview([]);
  assert.equal(Object.values(emptyClassifications!.requests).reduce((sum, count) => sum + count, 0), 0);
  assert.deepEqual(emptyOverview, { identifiedServices: 0, identifiedServiceNames: [], distinctResources: 0, unattributedResources: 0, distinctStorage: 0, distinctEmbeds: 0 });
});
