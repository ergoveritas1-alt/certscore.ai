import assert from "node:assert/strict";
import test from "node:test";
import { withNonBlockingDatabaseLock } from "./non-blocking-lock";

test("contending callers never run duplicate work or wait for its completion", async () => {
  let locked = false;
  let calls = 0;
  let released = 0;
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const connect = async () => ({
    async query(sql: string) {
      if (sql.includes("pg_try")) {
        const acquired = !locked;
        if (acquired) locked = true;
        return { rows: [{ locked: acquired }] };
      }
      locked = false;
      return { rows: [] };
    },
    release() { released += 1; },
  });
  const first = withNonBlockingDatabaseLock("scan", async () => {
    calls += 1;
    await gate;
    return "published";
  }, connect);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(await withNonBlockingDatabaseLock("scan", async () => { calls += 1; }, connect), { acquired: false });
  assert.equal(calls, 1);
  finish();
  assert.deepEqual(await first, { acquired: true, value: "published" });
  assert.equal(released, 2);
  assert.equal(locked, false);
});

test("a failed operation unlocks; a failed unlock destroys the pooled connection", async () => {
  const failure = new Error("projection failed");
  let unlocked = false;
  await assert.rejects(withNonBlockingDatabaseLock("scan", async () => { throw failure; }, async () => ({
    async query(sql: string) {
      if (sql.includes("pg_advisory_unlock")) unlocked = true;
      return { rows: [{ locked: true }] };
    },
    release() {},
  })), failure);
  assert.equal(unlocked, true);
  const unlockFailure = new Error("connection lost");
  let destroyedWith: Error | undefined;
  await withNonBlockingDatabaseLock("scan", async () => "ready", async () => ({
    async query(sql: string) {
      if (sql.includes("pg_advisory_unlock")) throw unlockFailure;
      return { rows: [{ locked: true }] };
    },
    release(error) { destroyedWith = error; },
  }));
  assert.equal(destroyedWith, unlockFailure);
});

test("long operations cannot exhaust the shared write pool", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const connect = async () => ({
    async query() { return { rows: [{ locked: true }] }; },
    release() {},
  });
  const operations = ["first", "second"].map((key) => withNonBlockingDatabaseLock(key, () => gate, connect));
  await new Promise<void>((resolve) => setImmediate(resolve));
  try {
    assert.deepEqual(await withNonBlockingDatabaseLock("third", async () => "unexpected", async () => {
      throw new Error("must not consume another pool connection");
    }), { acquired: false });
  } finally {
    finish();
    await Promise.all(operations);
  }
  assert.equal((await withNonBlockingDatabaseLock("next", async () => "ready", connect)).acquired, true);
});
