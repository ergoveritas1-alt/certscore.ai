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

test("anonymous and authenticated sessions retain the same thirty-minute idle allowance", t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const store = new McpHttpSessionStore({ maxCount: 500, ttlSeconds: 1800 });
  store.set("idle-light", { ...fakeSession(), surface: "light" });
  store.set("active-light", { ...fakeSession(), surface: "light" });
  store.set("oauth", { ...fakeSession(), surface: "oauth" });
  t.mock.timers.tick(600_000);
  assert.ok(store.get("idle-light"));
  assert.ok(store.get("oauth"));
  t.mock.timers.tick(1_199_000);
  store.touch("active-light");
  t.mock.timers.tick(1_001);
  assert.equal(store.get("idle-light"), null);
  assert.ok(store.get("active-light"));
  assert.equal(store.get("oauth"), null);
  assert.equal(store.size, 1);
});

test("capacity evicts least recently active sessions fairly across authentication classes", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 100_000 });
  const store = new McpHttpSessionStore({ maxCount: 2, ttlSeconds: 1800 });
  let closed = 0;
  store.set("oauth", { ...fakeSession(), surface: "oauth" });
  t.mock.timers.tick(1);
  store.set("light", { ...fakeSession(), surface: "light", server: { close: async () => { closed++; } } });
  t.mock.timers.tick(1);
  store.touch("oauth");
  store.set("next", { ...fakeSession(), surface: "light" });
  assert.equal(store.get("light"), null);
  assert.ok(store.get("oauth"));
  assert.deepEqual(store.size, 2);
  assert.equal(closed, 1);
  t.mock.timers.tick(1);
  store.touch("next");
  store.set("another-light", { ...fakeSession(), surface: "light" });
  assert.equal(store.get("oauth"), null, "an idle credential-bound session has no priority over active free use");
  assert.ok(store.get("next"));
});
