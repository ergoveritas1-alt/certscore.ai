import assert from "node:assert/strict";
import test from "node:test";
import { assessedStorageInventoryKey, reconcileStorageInventory } from "./storage-inventory-reconciliation";
const cookie = (path = "/", partition: string | null = null) => ({storageType: "cookie", exactStorageIdentity: JSON.stringify(["id", ".example.test", path, partition])});
test("only exact identities reconcile; duplicate evidence counts once", () => {
  const record = cookie();
  const inventory = [{occurrence: {kind: "cookie", identity: assessedStorageInventoryKey(record)!}}];
  const result = reconcileStorageInventory([record, record, cookie("/other"), cookie("/", "https://other.test"), {storageType: "cookie", name: "id", domain: ".example.test"}], inventory);
  assert.equal(result.matched.size, 1);
  assert.equal(result.unmatched, 3);
});
test("storage origin, type and key remain distinct; malformed identities fail closed", () => {
  const record = {storageType: "localStorage", exactStorageIdentity: JSON.stringify(["https://example.test", "localStorage", ""])};
  const key = assessedStorageInventoryKey(record);
  assert.ok(key);
  assert.notEqual(key, assessedStorageInventoryKey({...record, exactStorageIdentity: JSON.stringify(["https://other.test", "localStorage", ""])}));
  assert.equal(assessedStorageInventoryKey({...record, exactStorageIdentity: JSON.stringify(["https://example.test/path", "localStorage", ""])}), null);
  assert.equal(assessedStorageInventoryKey({...record, exactStorageIdentity: "not-json"}), null);
});
