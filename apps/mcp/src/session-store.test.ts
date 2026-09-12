import assert from "node:assert/strict";
import test from "node:test";
import { McpHttpSessionStore } from "./session-store.js";

function fakeSession() {
  return {
    server: { close: async () => undefined },
    tokenHash: "token",
    transport: { close: async () => undefined }
  } as any;
}

test("session store enforces cap and TTL", async () => {
  const store = new McpHttpSessionStore({ maxCount: 1, ttlSeconds: 1 });
  store.set("a", fakeSession());
  assert.equal(store.size, 1);
  const result = store.set("b", fakeSession());
  assert.deepEqual(result, { evicted: 1, size: 1 });
  assert.equal(store.size, 1);
  assert.equal(store.get("a"), null);
  assert.ok(store.get("b"));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(store.get("b"), null);
});

test("lookup cannot extend a session; authorized touch renews its idle TTL", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const store = new McpHttpSessionStore({ maxCount: 2, ttlSeconds: 1 });
  store.set("rejected", fakeSession());
  store.set("authorized", fakeSession());
  t.mock.timers.tick(900);
  assert.equal(store.get("rejected")?.expiresAt, 101_000);
  store.touch("authorized");
  t.mock.timers.tick(101);
  assert.equal(store.get("rejected"), null);
  assert.equal(store.get("authorized")?.expiresAt, 101_900);
});
