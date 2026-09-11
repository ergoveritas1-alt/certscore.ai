import assert from "node:assert/strict";
import test from "node:test";
import { normalizeActionStorageSnapshot } from "./action-storage-snapshot.js";

test("preserves empty storage names and values while dropping malformed records", () => {
  const result = normalizeActionStorageSnapshot({
    cookies: [
      { name: "", value: "", domain: "example.test", path: "/", partitionKey: null },
      null,
      { name: "broken", value: null, domain: "example.test", path: "/" },
    ],
    localStorage: [["", ""], ["valid", ""], null, ["bad", null]],
    sessionStorage: [["", "value"], { name: "not-a-tuple" }],
  });

  assert.deepEqual(result.cookies, [{ name: "", value: "", domain: "example.test", path: "/" }]);
  assert.deepEqual(result.localStorage, [["", ""], ["valid", ""]]);
  assert.deepEqual(result.sessionStorage, [["", "value"]]);
  assert.equal(result.droppedCookies, 2);
  assert.equal(result.droppedLocalStorage, 2);
  assert.equal(result.droppedSessionStorage, 1);
});

test("fails closed for null snapshot containers", () => {
  const result = normalizeActionStorageSnapshot({
    cookies: null,
    localStorage: undefined,
    sessionStorage: null,
  });
  assert.deepEqual(result.cookies, []);
  assert.deepEqual(result.localStorage, []);
  assert.deepEqual(result.sessionStorage, []);
  assert.equal(result.droppedCookies, 1);
  assert.equal(result.droppedLocalStorage, 1);
  assert.equal(result.droppedSessionStorage, 1);
});
