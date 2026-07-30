import assert from "node:assert/strict";
import test from "node:test";
import { BoundedPromiseCache } from "./bounded-promise-cache";

test("bounded promise cache shares concurrent work for the same key", async () => {
  const cache = new BoundedPromiseCache<string, string>({ maxEntries: 2, ttlMs: 60_000 });
  let calls = 0;
  let resolveValue: ((value: string) => void) | undefined;
  const factory = () => {
    calls += 1;
    return new Promise<string>((resolve) => {
      resolveValue = resolve;
    });
  };

  const first = cache.getOrCreate("scan-1", factory);
  const second = cache.getOrCreate("scan-1", factory);

  assert.equal(first, second);
  assert.equal(calls, 1);
  resolveValue?.("report");
  assert.equal(await first, "report");
});

test("bounded promise cache evicts rejected work so a later request can retry", async () => {
  const cache = new BoundedPromiseCache<string, string>({ maxEntries: 2, ttlMs: 60_000 });
  let calls = 0;

  await assert.rejects(
    cache.getOrCreate("scan-1", async () => {
      calls += 1;
      throw new Error("temporary failure");
    }),
    /temporary failure/
  );

  assert.equal(
    await cache.getOrCreate("scan-1", async () => {
      calls += 1;
      return "recovered";
    }),
    "recovered"
  );
  assert.equal(calls, 2);
});

test("bounded promise cache evicts the oldest key at capacity", async () => {
  const cache = new BoundedPromiseCache<string, string>({ maxEntries: 2, ttlMs: 60_000 });
  let firstCalls = 0;

  await cache.getOrCreate("scan-1", async () => {
    firstCalls += 1;
    return "first";
  });
  await cache.getOrCreate("scan-2", async () => "second");
  await cache.getOrCreate("scan-3", async () => "third");
  await cache.getOrCreate("scan-1", async () => {
    firstCalls += 1;
    return "first-again";
  });

  assert.equal(firstCalls, 2);
});

test("bounded promise cache reports hits, misses, and capacity evictions", async () => {
  const events: Array<{ key: string; outcome: string; size: number }> = [];
  const cache = new BoundedPromiseCache<string, string>({
    maxEntries: 1,
    onEvent: (event) => events.push(event),
    ttlMs: 60_000
  });

  await cache.getOrCreate("scan-1", async () => "first");
  await cache.getOrCreate("scan-1", async () => "unused");
  await cache.getOrCreate("scan-2", async () => "second");

  assert.deepEqual(events, [
    { key: "scan-1", outcome: "miss", size: 1 },
    { key: "scan-1", outcome: "hit", size: 1 },
    { key: "scan-2", outcome: "miss", size: 2 },
    { key: "scan-1", outcome: "evicted", size: 1 }
  ]);
});
