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
    const deriveFindings = source.indexOf("buildScanReportUnifiedFindings(", componentStart);

    assert.ok(pendingBranch > componentStart, `${page} must branch on lightweight status`);
    assert.ok(fullRecordLoad > pendingBranch, `${page} must not load the full scan record before the pending branch`);
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
  assert.doesNotMatch(source, /publishCanonicalScanReportProjection/);
  assert.doesNotMatch(source, /materializeAdminScanSummary/);
  assert.doesNotMatch(source, /bootstrapAppUserSession/);
});

test("report projection repair uses the canonical publisher and supports an auditable dry run", async () => {
  const source = await readFile("apps/web/app/api/internal/scan-report-projection-backfill/route.ts", "utf8");
  assert.match(source, /publishCanonicalScanReportProjection/);
  assert.match(source, /body\.dryRun === true/);
  assert.match(source, /oldSourceHash/);
  assert.match(source, /newSourceHash/);
  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
  assert.doesNotMatch(source, /persistScanReportProjection/);
});

test("completed dashboard reports stream an honest report shell before detailed evidence", async () => {
  const source = await readFile("apps/web/app/app/scans/[scanId]/page.tsx", "utf8");
  const loadingStateStart = source.indexOf("function ScanDetailLoadingState");
  const loadingStateEnd = source.indexOf("function canViewCapturedImage", loadingStateStart);
  const loadingState = source.slice(loadingStateStart, loadingStateEnd);
  const loadingCard = await readFile("apps/web/components/scans/scan-report-loading-card.tsx", "utf8");

  assert.match(loadingState, /ScanReportLoadingCard/);
  assert.match(loadingState, /Loading your report/);
  assert.match(loadingState, /loading the latest scan results, including cookies, trackers, and privacy findings/i);
  assert.doesNotMatch(loadingState, /Finishing your report/);
  assert.match(loadingCard, /scan-hourglass/);
  assert.doesNotMatch(loadingState, /summary\.overallScore|summary\.topFindingCount/);
  assert.match(source, /COMPLETED_SCAN_DETAIL_CACHE_TTL_MS = 15_000/);
  assert.doesNotMatch(source, /unstable_cache/);
  assert.doesNotMatch(source, /completedLongEnoughForShortCache/);
  assert.doesNotMatch(source, /hasReportProjectionGraceElapsed/);
});

test("completed v2 report routes fail closed to the verified persisted projection", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");

    assert.match(source, /loadPersistedScanReportProjection/);
    assert.match(
      source,
      /isCompletedScanStatus\(statusProjection\.status\)[\s\S]*?reportProjectionRequired &&[\s\S]*?!localPersistedReportProjection/
    );
    assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
    assert.doesNotMatch(source, /persistScanReportProjection/);
  }
});

test("completed report shells schedule the canonical projection before waiting", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");
    const waitingState = source.indexOf("const waitingForReportProjection");
    const schedulePublication = source.indexOf("publishCanonicalScanReportProjection({", waitingState);
    const pendingReturn = source.indexOf("if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection)", waitingState);

    assert.ok(waitingState >= 0, `${page} must identify completed scans awaiting projection`);
    assert.ok(schedulePublication > waitingState, `${page} must schedule canonical publication for the waiting state`);
    assert.ok(pendingReturn > schedulePublication, `${page} must schedule publication before returning the pending shell`);
  }
});

test("terminal failed v2 scans bypass completed-report finalization", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");
    const reportProjectionFallback = source.indexOf(
      "isCompletedScanStatus(statusProjection.status)",
      source.indexOf("localPersistedReportProjection")
    );
    const pendingFallback = source.indexOf("<PendingScanDetailView", reportProjectionFallback);
    const fullRecordLoadCandidates = ["getScanById(", "getPublicScanById("]
      .map((call) => source.indexOf(call, reportProjectionFallback))
      .filter((index) => index >= 0);
    const fullRecordLoad = Math.min(...fullRecordLoadCandidates);

    assert.ok(reportProjectionFallback >= 0, `${page} must gate report finalization on a completed status`);
    assert.ok(pendingFallback > reportProjectionFallback, `${page} must retain the completed-report pending fallback`);
    assert.ok(fullRecordLoad > pendingFallback, `${page} must load terminal failed records after bypassing that fallback`);
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
