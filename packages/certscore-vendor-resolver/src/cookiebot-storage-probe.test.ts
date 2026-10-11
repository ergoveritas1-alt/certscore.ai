import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { resolveCanonicalVendor } from "./index.js";

// Exact primary Cookiebot uc.js storage capability probe, retained 2026-10-11.
// Source SHA256: 1ed5787e9e23a2760cdb2dbbff563c25dd4fde96d7106b1fa8b81231a1e4d4f2
const probe = 'function isStorageSupported(){try{var key="cookiebottest";return localStorage.setItem(key,key),localStorage.removeItem(key),!0}catch(ignore){return!1}};isStorageSupported()';
test("owned primary-script fixture attributes only the exact Cookiebot storage probe key", () => {
  const storage = new Map<string, string>();
  const writes: string[] = [];
  const supported = runInNewContext(probe, { localStorage: {
    setItem(key: string, value: string) { writes.push(key); storage.set(key, value); },
    removeItem(key: string) { storage.delete(key); },
  } });
  assert.equal(supported, true);
  assert.equal(storage.size, 0, "capability probe removes its transient entry");
  assert.deepEqual(writes, ["cookiebottest"]);
  const known = resolveCanonicalVendor({ type: "cmp_runtime", storageKey: writes[0], hostname: "owned.example.test", matchSource: "storage_key" });
  assert.equal(known.status, "resolved");
  if (known.status === "resolved") {
    assert.equal(known.observation.vendor, "Cookiebot");
    assert.equal(known.observation.purpose, "consent_management");
  }
  for (const key of ["cookiebottest-extra", "prefix-cookiebottest", "cookiebotunknown", "COOKIEBOTTEST"]) {
    assert.notEqual(resolveCanonicalVendor({ type: "cmp_runtime", storageKey: key, hostname: "owned.example.test", matchSource: "storage_key" }).status, "resolved", key);
  }
  assert.notEqual(resolveCanonicalVendor({ type: "cookie", cookieName: "cookiebottest", hostname: "owned.example.test", matchSource: "cookie_name" }).status, "resolved");
});
