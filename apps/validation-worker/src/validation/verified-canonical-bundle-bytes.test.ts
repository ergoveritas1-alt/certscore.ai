import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createVerifiedCanonicalBundleByteCache } from "./verified-canonical-bundle-bytes";

const identity = (uri: string, body: Buffer) => ({ uri,
  expectedSha256: createHash("sha256").update(body).digest("hex"), expectedSizeBytes: body.byteLength });

test("verified byte reuse is bound to the complete artifact identity and isolates caller mutations", () => {
  const cache = createVerifiedCanonicalBundleByteCache();
  const body = Buffer.from("original retained bytes");
  const pointer = identity("s3://bucket/scan/bundle", body);
  cache.retain(pointer, body);
  body.fill(0);
  const hit = cache.get(pointer)!;
  assert.equal(hit.toString(), "original retained bytes");
  hit.fill(0);
  assert.equal(cache.get(pointer)!.toString(), "original retained bytes");
  assert.equal(cache.get({ ...pointer, uri: "s3://bucket/other-scan/bundle" }), undefined);
  assert.equal(cache.get({ ...pointer, expectedSha256: "0".repeat(64) }), undefined);
  assert.equal(cache.get({ ...pointer, expectedSizeBytes: pointer.expectedSizeBytes + 1 }), undefined);
  assert.throws(() => cache.retain(pointer, body), /checksum-bound/);
});

test("byte and entry budgets evict older entries while oversized bundles remain uncached", () => {
  const cache = createVerifiedCanonicalBundleByteCache({ maxBytes: 6, maxEntries: 2 });
  const a = Buffer.from("aaa"), b = Buffer.from("bbb"), c = Buffer.from("ccc");
  const pa = identity("a", a), pb = identity("b", b), pc = identity("c", c);
  cache.retain(pa, a); cache.retain(pb, b);
  cache.get(pa);
  cache.retain(pc, c);
  assert.equal(cache.get(pb), undefined);
  assert.deepEqual(cache.get(pa), a);
  assert.deepEqual(cache.get(pc), c);
  const tooLarge = Buffer.from("oversized");
  assert.equal(cache.retain(identity("large", tooLarge), tooLarge), false);
  assert.deepEqual(cache.get(pa), a);
});

test("expired bytes are unavailable without extending retention on access", () => {
  let now = 0;
  const cache = createVerifiedCanonicalBundleByteCache({ ttlMs: 100, now: () => now });
  const body = Buffer.from("bytes"), pointer = identity("scan", body);
  cache.retain(pointer, body);
  now = 99;
  assert.deepEqual(cache.get(pointer), body);
  now = 100;
  assert.equal(cache.get(pointer), undefined);
});
