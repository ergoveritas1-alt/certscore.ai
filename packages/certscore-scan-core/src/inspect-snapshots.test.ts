import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { inspectBundle } from "./inspector.js";

const packageDir = process.cwd();
const savedBundleDir = path.resolve(
  packageDir,
  "../certscore-contracts/fixtures/saved-bundles",
);
const snapshotDir = path.resolve(packageDir, "fixtures/inspect-snapshots");

test("saved-bundle inspection JSON matches deterministic snapshots", async () => {
  const files = (await readdir(savedBundleDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  for (const file of files) {
    const fixtureName = file.replace(/\.json$/, "");
    const bundle = canonicalEvidenceBundleSchema.parse(
      JSON.parse(await readFile(path.join(savedBundleDir, file), "utf8")),
    );
    const report = JSON.parse(JSON.stringify(await inspectBundle(bundle))) as unknown;
    const expected = JSON.parse(
      await readFile(path.join(snapshotDir, `${fixtureName}.json`), "utf8"),
    ) as unknown;

    assert.deepEqual(report, expected, fixtureName);
  }
});
