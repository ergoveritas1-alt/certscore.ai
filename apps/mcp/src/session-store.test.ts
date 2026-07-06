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
  store.set("b", fakeSession());
  assert.equal(store.size, 1);
  assert.equal(store.get("a"), null);
  assert.ok(store.get("b"));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(store.get("b"), null);
});
