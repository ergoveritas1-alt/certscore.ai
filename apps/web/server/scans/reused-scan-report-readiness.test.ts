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

test("public API reads use the same persisted report projection as report pages", async () => {
  const source = await readFile("apps/web/server/scans/get-public-scan-record.ts", "utf8");
  const persistedProjection = source.indexOf("loadAnonymousPersistedScanReportProjection({ scanId })");
  const evidenceTableFallback = source.indexOf("getAnonymousScanByIdForReadOnlyProjection(scanId)");
  const liveMaterialization = source.indexOf("materializeLocalV2DagScanDetail(scanRecord)");

  assert.ok(persistedProjection >= 0, "public scan reads must inspect the persisted report projection");
  assert.ok(
    evidenceTableFallback > persistedProjection,
    "public scan reads must load evidence tables only after the persisted projection misses"
  );
  assert.ok(
    liveMaterialization > evidenceTableFallback,
    "live bundle materialization must only be a fallback when no verified persisted projection exists"
  );
  assert.match(
    source.slice(persistedProjection, evidenceTableFallback),
    /if \(persistedReportProjection\) \{[\s\S]*return persistedReportProjection/,
    "public APIs must return the verified persisted projection before loading live evidence"
  );
});

test("public API fallback reads disable presentation enrichment and read-time writes", async () => {
  const publicSource = await readFile("apps/web/server/scans/get-public-scan-record.ts", "utf8");
  const detailSource = await readFile("apps/web/server/scans/get-scan-by-id.ts", "utf8");
  const start = detailSource.indexOf("export async function getAnonymousScanByIdForReadOnlyProjection");
  const end = detailSource.indexOf("\nexport async function", start + 1);
  const readOnlyProjectionSource = detailSource.slice(start, end);

  assert.match(publicSource, /getAnonymousScanByIdForReadOnlyProjection/);
  assert.match(readOnlyProjectionSource, /includeDomainBenchmark: false/);
  assert.match(readOnlyProjectionSource, /includeUrlscanSupplement: false/);
});

test("anonymous persisted projection reads establish public scope before returning report data", async () => {
  const source = await readFile("apps/web/server/scans/scan-report-projection.ts", "utf8");
  const start = source.indexOf("export async function loadAnonymousPersistedScanReportProjection");
  const end = source.indexOf("\nexport ", start + 1);
  const anonymousLoader = source.slice(start, end > start ? end : undefined);

  assert.match(anonymousLoader, /s\.organization_id is null/);
  assert.doesNotMatch(anonymousLoader, /getCachedCompletedReportProjection/);
  assert.match(anonymousLoader, /projectionFromPersistedRow/);
});

test("API v2 completed resources reuse persisted scores and one canonical resource projection", async () => {
  const projectionSource = await readFile("apps/web/lib/pulse/projection.ts", "utf8");
  const scoreStart = projectionSource.indexOf("export function derivePulseReportScore");
  const persistedScore = projectionSource.indexOf("persistedReportScore", scoreStart);
  const surfaceBuild = projectionSource.indexOf("buildPulseReportSurface", persistedScore);
  const routeSource = await readFile("apps/web/app/api/v2/scans/[scanId]/route.ts", "utf8");

  assert.ok(persistedScore > scoreStart, "the public score path must inspect the persisted score");
  assert.ok(surfaceBuild > persistedScore, "live report-surface construction must remain only after the persisted score fast path");
  assert.equal(
    routeSource.match(/buildApiV2ScanResource\(scanRecord\)/g)?.length,
    1,
    "the completed scan route must build the canonical resource only once"
  );
  assert.match(routeSource, /buildApiV2ScanStatus\(scanRecord, \{ canonicalScan \}\)/);
});
