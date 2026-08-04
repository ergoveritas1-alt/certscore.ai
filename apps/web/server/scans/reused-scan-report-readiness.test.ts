import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("recent scan reuse waits for the canonical persisted report projection", async () => {
  const publisher = await readFile("apps/web/server/scans/canonical-scan-report-publisher.ts", "utf8");
  const currentStatus = publisher.indexOf("getPublicScanStatusProjection(input.scanId)");
  const publish = publisher.indexOf("publishCanonicalScanReportProjection(input)", currentStatus);
  const refreshedStatus = publisher.indexOf("getPublicScanStatusProjection(input.scanId)", publish);

  assert.ok(currentStatus >= 0, "reuse preparation must inspect canonical projection readiness");
  assert.ok(publish > currentStatus, "a stale projection must be published through the canonical publisher");
  assert.ok(refreshedStatus > publish, "reuse preparation must recheck persisted readiness after publication");
  assert.match(publisher.slice(refreshedStatus), /refreshed\?\.reportReady/);
});

test("signed-in and anonymous creation return reused scans only after projection preparation", async () => {
  for (const file of [
    "apps/web/server/scans/create-full-scan.ts",
    "apps/web/server/scans/create-anonymous-full-scan.ts"
  ]) {
    const source = await readFile(file, "utf8");
    const reuseBranch = source.indexOf('reuseDecision?.action === "reuse"');
    const prepareProjection = source.indexOf("ensureCanonicalScanReportProjectionForReuse", reuseBranch);
    const reusedReturn = source.indexOf("reusedExistingScan: true", reuseBranch);

    assert.ok(reuseBranch >= 0, `${file} must retain the shared reuse decision`);
    assert.ok(prepareProjection > reuseBranch, `${file} must prepare the projection inside the reuse branch`);
    assert.ok(reusedReturn > prepareProjection, `${file} must not return a reused scan before projection preparation`);
  }
});
