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
    const fullRecordLoad = source.indexOf("getScanById(", componentStart) >= 0
      ? source.indexOf("getScanById(", componentStart)
      : source.indexOf("getAnonymousScanById(", componentStart);
    const materializeReport = source.indexOf("materializeLocalV2DagScanDetail(", componentStart);
    const deriveFindings = source.indexOf("buildScanReportUnifiedFindings(", componentStart);

    assert.ok(pendingBranch > componentStart, `${page} must branch on lightweight status`);
    assert.ok(fullRecordLoad > pendingBranch, `${page} must not load the full scan record before the pending branch`);
    assert.ok(materializeReport > pendingBranch, `${page} must not materialize v2 artifacts before the pending branch`);
    assert.ok(deriveFindings > pendingBranch, `${page} must not derive findings before the pending branch`);
  }
});

test("lightweight status API resolves access before selecting one status path", async () => {
  const source = await readFile("apps/web/app/api/scan-status/[scanId]/route.ts", "utf8");
  const lightweightBranch = source.indexOf("if (!includeFindings)");
  const anonymousFindingsLoad = source.indexOf("getAnonymousOpsScanStatus(", lightweightBranch);
  const organizationFindingsLoad = source.indexOf("getOrganizationOpsScanStatus(", lightweightBranch);

  assert.ok(lightweightBranch >= 0);
  assert.ok(anonymousFindingsLoad > lightweightBranch);
  assert.ok(organizationFindingsLoad > lightweightBranch);
  assert.match(source, /getViewerAccessibleScanStatusProjection/);
  assert.doesNotMatch(source, /bootstrapAppUserSession/);
});
