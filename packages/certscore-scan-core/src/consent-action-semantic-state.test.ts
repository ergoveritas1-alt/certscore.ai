import assert from "node:assert/strict";
import test from "node:test";
import { matchingStateWriteTime, type ActionStateWrite } from "./consent-action-semantic-state.js";

test("a registration anchor binds the exact value, storage type, and fresh write", () => {
  const writes: ActionStateWrite[] = [
    { storageType: "cookie", name: "consent", value: "denied", observedAtEpochMs: 9, sequence: 1 },
    { storageType: "local_storage", name: "consent", value: "denied", observedAtEpochMs: 11, sequence: 2 },
    { storageType: "cookie", name: "consent", value: "granted", observedAtEpochMs: 12, sequence: 3 },
    { storageType: "cookie", name: "consent", value: "denied", observedAtEpochMs: 14, sequence: 4 },
  ];
  assert.equal(matchingStateWriteTime(writes, "consent", "denied", 10, "cookie"), 14);
  assert.equal(matchingStateWriteTime(writes, "consent", "denied", 10, "local_storage"), 11);
  assert.equal(matchingStateWriteTime(writes, "consent", "denied", 15, "cookie"), undefined);
  assert.equal(matchingStateWriteTime(writes, "consent", "granted", 10, "cookie"), 12);
});
