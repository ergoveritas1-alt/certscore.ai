import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("visual evidence route does not re-materialize the full local v2 report", async () => {
  const source = await readFile(
    path.join(process.cwd(), "apps/web/app/api/scans/[scanId]/visual-evidence/[artifactId]/route.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
  assert.match(source, /resolveLocalV2DagVisualEvidencePointer/);
});
