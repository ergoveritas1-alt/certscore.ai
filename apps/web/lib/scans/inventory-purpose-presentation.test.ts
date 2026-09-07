import assert from "node:assert/strict";
import test from "node:test";
import { inventoryPurposeGroups, inventoryPurposeLabel, inventoryPurposeTitle } from "./inventory-purpose-presentation";

test("unknown purpose uses only an unambiguous retained site relationship", () => {
  assert.equal(inventoryPurposeLabel("unknown", ["first_party"]), "Unknown – 1st");
  assert.equal(inventoryPurposeLabel("unknown", ["third_party"]), "Unknown – 3rd");
  for (const relationships of [[], ["unknown"], ["first_party", "third_party"], ["first_party", "unknown"]]) {
    assert.equal(inventoryPurposeLabel("unknown", relationships), "Unknown");
  }
  assert.equal(inventoryPurposeTitle("Unknown – 1st"), "Purpose unknown; first-party resource");
});

test("presentation preserves known purposes and retained classifications", () => {
  const purposes = ["analytics", "unknown"];
  assert.deepEqual(inventoryPurposeGroups(purposes, ["first_party"]), ["analytics", "Unknown – 1st"]);
  assert.deepEqual(purposes, ["analytics", "unknown"]);
  assert.equal(inventoryPurposeLabel("consent_management", ["third_party"]), "consent_management");
  assert.deepEqual(inventoryPurposeGroups([], []), ["Unknown"]);
});
