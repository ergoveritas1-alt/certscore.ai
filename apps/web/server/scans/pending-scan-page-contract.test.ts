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

test("completed dashboard reports use an honest loading state and a short stable-record cache", async () => {
  const source = await readFile("apps/web/app/app/scans/[scanId]/page.tsx", "utf8");
  const loadingStateStart = source.indexOf("function ScanDetailLoadingState");
  const loadingStateEnd = source.indexOf("function canViewCapturedImage", loadingStateStart);
  const loadingState = source.slice(loadingStateStart, loadingStateEnd);

  assert.match(loadingState, /Building the report view/);
  assert.match(loadingState, /Loading the evidence summary, cookies and trackers, and privacy review/);
  assert.doesNotMatch(loadingState, /Overall score|3rd-party requests|Non-essential storage/);
  assert.match(source, /COMPLETED_SCAN_DETAIL_CACHE_SECONDS = 15/);
  assert.match(source, /statusProjection\\.reportReady \\|\\| completedLongEnoughForShortCache/);
  assert.match(source, /hasReportProjectionGraceElapsed\(statusProjection\)/);
});
