import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("local scan completion persists the Admin evidence matrix after canonical report publication", async () => {
  const source = await readFile("apps/web/server/scans/local-v2-dag-lambda-result-poller.ts", "utf8");
  const publication = source.indexOf("const publication = await publishCanonicalScanReportProjection");
  const adminMatrix = source.indexOf("await materializeAdminScanSummary", publication);
  const score = source.indexOf("await persistCompletedLegacyGdprEprivacyAssessment", publication);

  assert.ok(publication >= 0);
  assert.ok(adminMatrix > publication);
  assert.ok(score > adminMatrix);
  assert.match(source, /if \(publication\.status === "ready"\)/);
  assert.match(source, /Canonical Admin evidence matrix persistence was incomplete/);
});

test("delayed canonical report recovery also persists the Admin evidence matrix", async () => {
  const source = await readFile("apps/web/app/api/scan-status/[scanId]/route.ts", "utf8");
  const publication = source.indexOf("await publishCanonicalScanReportProjection");
  const adminMatrix = source.indexOf("await materializeAdminScanSummary", publication);
  const refresh = source.indexOf("projection = await getPublicScanStatusProjection", adminMatrix);

  assert.ok(publication >= 0);
  assert.ok(adminMatrix > publication);
  assert.ok(refresh > adminMatrix);
  assert.match(source, /if \(publication\.status === "ready"\)/);
});
