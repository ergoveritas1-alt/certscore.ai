import assert from "node:assert/strict";
import test from "node:test";
import { inventorySortIndices, type InventorySortRow } from "./inventory-sort-model";

const rows: InventorySortRow[] = [
  { evidence: "Essential", firstSeenMs: 1, vendor: "Z", name: "A", type: "Cookie", purpose: "Storage" },
  { evidence: "Review", firstSeenMs: 30, vendor: "B", name: "B", type: "Request", purpose: "Media" },
  { evidence: "Non-essential", firstSeenMs: 90, vendor: "C", name: "C", type: "Request", purpose: "Ads" },
  { evidence: "Contextual", firstSeenMs: null, vendor: "D", name: "D", type: "Embed", purpose: "Map" },
  { evidence: "Review", firstSeenMs: 20, vendor: "A", name: "E", type: "Request", purpose: "Consent" },
];
test("default prioritizes evidence then numeric time; reset restores order", () => {
  assert.deepEqual(inventorySortIndices(rows), [2, 4, 1, 3, 0]);
  assert.deepEqual(inventorySortIndices(rows, "default", true), [0, 3, 4, 1, 2]);
  inventorySortIndices(rows, "name", true);
  assert.deepEqual(inventorySortIndices(rows), [2, 4, 1, 3, 0]);
  assert.equal(rows[0]?.vendor, "Z");
});
test("all requested columns sort both ways; missing times stay last", () => {
  for (const key of ["vendor", "name", "purpose"] as const) {
    assert.deepEqual(inventorySortIndices(rows, key, true), inventorySortIndices(rows, key).reverse());
  }
  assert.deepEqual(inventorySortIndices(rows, "type"), [0, 3, 1, 2, 4]);
  assert.deepEqual(inventorySortIndices(rows, "firstSeenMs"), [0, 4, 1, 2, 3]);
  assert.deepEqual(inventorySortIndices(rows, "firstSeenMs", true), [2, 1, 4, 0, 3]);
});
