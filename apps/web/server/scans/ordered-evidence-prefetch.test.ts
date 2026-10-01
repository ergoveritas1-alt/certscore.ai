import assert from "node:assert/strict";
import test from "node:test";
import { orderedEvidencePrefetch } from "./ordered-evidence-prefetch";

test("overlaps at most three reads, handles early failures, and preserves evidence order", async () => {
  const releases = new Map<number, (value: number) => void>();
  const started: number[] = [];
  const iterator = orderedEvidencePrefetch([0, 1, 2, 3, 4], async item => {
    started.push(item);
    if (item === 1) throw new Error("unavailable");
    return await new Promise<number>(resolve => releases.set(item, resolve));
  });
  const first = iterator.next();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2]);
  releases.get(2)!(2);
  releases.get(0)!(0);
  assert.deepEqual((await first).value, { item: 0, result: {ok: true, value: 0} });
  const second = await iterator.next();
  assert.equal(second.value!.item, 1);
  assert.equal(second.value!.result.ok, false);
  const third = await iterator.next();
  assert.deepEqual(third.value, {item: 2, result: {ok: true, value: 2}});
  const fourth = iterator.next();
  await new Promise(resolve => setImmediate(resolve));
  releases.get(4)!(4);
  releases.get(3)!(3);
  assert.equal((await fourth).value!.item, 3);
  assert.equal((await iterator.next()).value!.item, 4);
  assert.equal((await iterator.next()).done, true);
});
