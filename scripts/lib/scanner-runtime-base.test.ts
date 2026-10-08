import assert from "node:assert/strict";
import test from "node:test";
import { scannerRuntimeBaseMode } from "./scanner-runtime-base";

test("replicated scanner images need a base only in the build region", async () => {
  const inspected: string[] = [];
  assert.equal(await scannerRuntimeBaseMode({buildRegion: "eu-central-1", rebuild: false,
    available: async region => { inspected.push(region); return region === "eu-central-1"; }}), "reused");
  assert.deepEqual(inspected, ["eu-central-1"]);
});

test("a missing routine base stops deployment instead of upgrading Chromium", async () => {
  await assert.rejects(scannerRuntimeBaseMode({buildRegion: "eu-central-1", rebuild: false,
    available: async () => false}), /must not rebuild Chromium implicitly/);
});

test("an explicitly requested rebuild can bootstrap the base", async () => {
  assert.equal(await scannerRuntimeBaseMode({buildRegion: "eu-central-1", rebuild: true,
    available: async () => { throw new Error("Rebuild does not depend on an existing tag"); }}), "rebuilt");
});
