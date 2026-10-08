import assert from "node:assert/strict";
import test from "node:test";
import { createVerifiedPolicyTextCache } from "./verified-policy-text-cache";

test("verified text cache coalesces reads and binds reuse to URI, hash and size", async () => {
  const read = createVerifiedPolicyTextCache();
  const pointer = { uri: "s3://bucket/scan/policy.txt", sha256: "a".repeat(64), sizeBytes: 4 };
  let loads = 0;
  const load = async () => { loads++; return { text: "text", sha256: pointer.sha256, sizeBytes: 4 }; };
  const first = read(pointer, load);
  assert.equal(read(pointer, load), first);
  await first;
  await read(pointer, load);
  assert.equal(loads, 1);
  await read({ ...pointer, uri: "s3://bucket/other/policy.txt" }, load);
  assert.equal(loads, 2);
  await assert.rejects(read({ ...pointer, sha256: "b".repeat(64) }, load), /metadata mismatch/);
  await assert.rejects(read({ ...pointer, sizeBytes: 5 }, load), /metadata mismatch/);
});

test("verification failures are not cached and oversized entries cannot occupy the cache", async () => {
  const read = createVerifiedPolicyTextCache(4, 2);
  const pointer = { uri: "s3://bucket/a", sha256: "a".repeat(64), sizeBytes: 5 };
  let loads = 0;
  const load = async () => { loads++; return { text: "large", sha256: pointer.sha256, sizeBytes: 5 }; };
  await assert.rejects(read(pointer, async () => { throw new Error("checksum mismatch"); }), /checksum mismatch/);
  await read(pointer, load);
  await read(pointer, load);
  assert.equal(loads, 2);
});

test("verified text cache evicts least-recently-used entries without poisoning pending reads", async () => {
  const read = createVerifiedPolicyTextCache(8, 2);
  let loads = 0;
  const pointer = (id: string) => ({ uri: `s3://bucket/${id}`, sha256: "a".repeat(64), sizeBytes: 4 });
  const load = async () => { loads++; return { text: "text", sha256: "a".repeat(64), sizeBytes: 4 }; };
  await read(pointer("a"), load); await read(pointer("b"), load);
  await read(pointer("a"), load); await read(pointer("c"), load);
  await read(pointer("b"), load);
  assert.equal(loads, 4);
});
