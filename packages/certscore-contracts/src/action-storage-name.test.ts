import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalStorageItemSchema, postRefusalStorageWriteSchema } from "./post-refusal-observation";
import { postAcceptStorageWriteSchema } from "./post-accept-observation";

test("empty storage names are retained exactly with identity proof, not confused with absent names", () => {
  for (const storageType of ["cookie", "local_storage", "session_storage"] as const) {
    const item = { storageType, name: "", hostname: "example.test", valueHash: "a".repeat(64),
      identityHash: "b".repeat(64), identityBasis: storageType === "cookie" ? "cookie_name_domain_path_partition" : "origin_storage_key", nonEssential: false };
    assert.deepEqual(postRefusalStorageItemSchema.parse(item), item);
    for (const change of [{ name: undefined }, { name: null }, { identityHash: undefined },
      { identityHash: "invalid" }, { identityBasis: undefined }, { hostname: undefined }]) {
      assert.equal(postRefusalStorageItemSchema.safeParse({ ...item, ...change }).success, false);
    }
    assert.equal(postRefusalStorageItemSchema.safeParse({ ...item, name: "x".repeat(181) }).success, false);
    assert.equal(postRefusalStorageItemSchema.parse({ ...item, name: " " }).name, " ", "Do not trim exact storage keys");
    assert.equal(postRefusalStorageItemSchema.safeParse({ ...item, name: "named", identityBasis: undefined, identityHash: undefined }).success, true, "Legacy named rows remain readable");
    for (const schema of [postAcceptStorageWriteSchema, postRefusalStorageWriteSchema]) {
      const write = { storageType, name: "", hostname: "example.test", storageIdentityHash: "b".repeat(64),
        observedAtMs: 100, msOffsetFromAccept: 10, msOffsetFromRefusal: 10, nonEssential: false };
      assert.equal(schema.parse(write).name, "");
      assert.equal(schema.safeParse({ ...write, storageIdentityHash: undefined }).success, false);
    }
  }
});
