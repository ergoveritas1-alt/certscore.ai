import assert from "node:assert/strict";
import test from "node:test";
import { matchingStateWriteTime, verifiedCanonicalStateWrite, type ActionStateWrite } from "./consent-action-semantic-state.js";
import type { BrowserContext, Page } from "playwright";

test("repeated receipt writes share current readback without weakening freshness or identity checks", async () => {
  let cookieReads = 0;
  const writes: ActionStateWrite[] = Array.from({length: 12}, (_, index) => ({storageType: "cookie", name: "consent", value: "denied", observedAtEpochMs: 20 + index, sequence: 1 + index}));
  const context = {cookies: async () => {cookieReads++; return [{name: "consent", value: "denied"}];}} as unknown as BrowserContext;
  const scope = {url: () => "https://example.test/", evaluate: async () => writes} as unknown as Page;
  const state = await verifiedCanonicalStateWrite({context, scope, actionAt: 20, registeredKeys: ["consent"]});
  assert.equal(state?.decision, "denied");
  assert.equal(state?.observedAtEpochMs, 31);
  assert.equal(cookieReads, 1);
  assert.equal(await verifiedCanonicalStateWrite({context, scope, actionAt: 100, registeredKeys: ["consent"]}), undefined);
  const ambiguous = {cookies: async () => [{name: "consent", value: "denied"}, {name: "consent", value: "denied"}]} as unknown as BrowserContext;
  assert.equal(await verifiedCanonicalStateWrite({context: ambiguous, scope, actionAt: 20, registeredKeys: ["consent"]}), undefined);
});

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
