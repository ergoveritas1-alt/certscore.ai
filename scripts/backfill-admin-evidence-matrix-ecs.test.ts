import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production Admin matrix backfill is bounded, dry-run by default, and uses canonical materialization", async () => {
  const source = await readFile("scripts/backfill-admin-evidence-matrix-ecs.ts", "utf8");

  assert.match(source, /const apply = args\.get\("apply"\) === "true"/);
  assert.match(source, /requiredTimestamp\(args, "since"\)/);
  assert.match(source, /requiredTimestamp\(args, "until"\)/);
  assert.match(source, /boundedInteger\(args\.get\("limit"\), 100, 1, 500\)/);
  assert.match(source, /boundedInteger\(args\.get\("concurrency"\), 2, 1, 4\)/);
  assert.match(source, /admin_evidence_matrix is null/);
  assert.match(source, /materializeAdminScanSummary/);
  assert.doesNotMatch(source, /update public\.scan_snapshots[\s\S]*admin_evidence_matrix/);
});
