import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  "apps/web/app/app/scans/[scanId]/page.tsx",
  "apps/web/app/(marketing)/scan/[scanId]/page.tsx",
];

test("pending scan pages return a minimal projection before full report construction", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");
    const componentStart = source.indexOf("export default async function");
    const pendingBranch = source.indexOf("isPendingScanStatus(statusProjection.status)", componentStart);
    const fullRecordLoadCandidates = ["getScanById(", "getAnonymousScanById(", "getPublicScanById("]
      .map((call) => source.indexOf(call, componentStart))
      .filter((index) => index >= 0);
    const fullRecordLoad = Math.min(...fullRecordLoadCandidates);
    const materializeReport = source.indexOf("materializeLocalV2DagScanDetail(", componentStart);
    const deriveFindings = source.indexOf("buildScanReportUnifiedFindings(", componentStart);

    assert.ok(pendingBranch > componentStart, `${page} must branch on lightweight status`);
    assert.ok(fullRecordLoad > pendingBranch, `${page} must not load the full scan record before the pending branch`);
    assert.ok(materializeReport > pendingBranch, `${page} must not materialize v2 artifacts before the pending branch`);
    assert.ok(deriveFindings > pendingBranch, `${page} must not derive findings before the pending branch`);
  }
});

test("lightweight status API resolves public shared-link access before selecting status", async () => {
  const source = await readFile("apps/web/app/api/scan-status/[scanId]/route.ts", "utf8");
  const lightweightBranch = source.indexOf("if (!includeFindings)");
  const publicFindingsLoad = source.indexOf("getPublicOpsScanStatus(", lightweightBranch);

  assert.ok(lightweightBranch >= 0);
  assert.ok(publicFindingsLoad > lightweightBranch);
  assert.match(source, /getPublicScanStatusProjection/);
  assert.doesNotMatch(source, /bootstrapAppUserSession/);
});

test("completed dashboard reports stream an honest report shell before detailed evidence", async () => {
  const source = await readFile("apps/web/app/app/scans/[scanId]/page.tsx", "utf8");
  const loadingStateStart = source.indexOf("function ScanDetailLoadingState");
  const loadingStateEnd = source.indexOf("function canViewCapturedImage", loadingStateStart);
  const loadingState = source.slice(loadingStateStart, loadingStateEnd);

  assert.match(loadingState, /Building the report view/);
  assert.match(loadingState, /Report generated/);
  assert.match(loadingState, /Overall score/);
  assert.match(loadingState, /Findings to review/);
  assert.match(loadingState, /Loading detailed cookies, trackers, retained evidence, and privacy review/);
  assert.doesNotMatch(loadingState, /summary\.overallScore|summary\.topFindingCount/);
  assert.match(source, /COMPLETED_SCAN_DETAIL_CACHE_TTL_MS = 15_000/);
  assert.doesNotMatch(source, /unstable_cache/);
  assert.match(source, /statusProjection\\.reportReady \\|\\| completedLongEnoughForShortCache/);
  assert.match(source, /hasReportProjectionGraceElapsed\(statusProjection\)/);
});

test("completed v2 reports use a verified persisted display projection before materializing retained evidence", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");

    assert.match(source, /loadPersistedScanReportProjection/);
    assert.match(source, /getPersistedScanReportProjection\(scanRecord\)/);
    assert.match(source, /persistedReportProjection \?\?[\s\S]{0,160}materializeLocalV2DagScanDetail\(scanRecord\)/);
  }
});

test("completed report caches do not send full scan records through the Next data cache", async () => {
  const dashboardPage = await readFile("apps/web/app/app/scans/[scanId]/page.tsx", "utf8");
  const materializer = await readFile("apps/web/server/scans/local-v2-dag-report.ts", "utf8");

  assert.doesNotMatch(dashboardPage, /unstable_cache/);
  assert.doesNotMatch(materializer, /unstable_cache/);
  assert.match(dashboardPage, /COMPLETED_SCAN_DETAIL_CACHE_MAX_ENTRIES = 8/);
  assert.match(materializer, /LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_MAX_ENTRIES = 6/);
});
