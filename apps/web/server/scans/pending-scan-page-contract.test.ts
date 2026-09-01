import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  "apps/web/app/app/scans/[scanId]/legacy-page.tsx",
  "apps/web/app/(marketing)/scano/[scanId]/page.tsx",
];

test("refreshed public report consumes the persisted projection and preserves the scano comparison route", async () => {
  const source = await readFile("apps/web/app/(marketing)/scan/[scanId]/page.tsx", "utf8");

  assert.match(source, /ShadowScanReport/);
  assert.match(source, /variant="timeline"/);
  assert.match(source, /\/scano\//);
  assert.match(source, /loadPersistedScanReportProjection/);
  assert.match(source, /buildTimelineReportModel\(persistedReportProjection\)/);
  assert.match(source, /isPendingScanStatus\(statusProjection\.status\)/);
});

test("refreshed authenticated report preserves scoped access and the scanso comparison route", async () => {
  const source = await readFile("apps/web/app/app/scans/[scanId]/page.tsx", "utf8");
  const comparisonRoute = await readFile("apps/web/app/app/scanso/[scanId]/page.tsx", "utf8");

  assert.match(source, /getOrganizationScanStatusProjection\(\{ organizationId: organization\.id, scanId \}\)/);
  assert.match(source, /loadPersistedScanReportProjection\(\{/);
  assert.match(source, /organizationId: isPlatformAdmin \? null : organization\.id/);
  assert.match(source, /buildTimelineReportModel\(persistedReportProjection\)/);
  assert.match(source, /mode="authenticated"/);
  assert.match(source, /\/app\/scanso\//);
  assert.match(comparisonRoute, /scans\/\[scanId\]\/legacy-page/);
});

test("timeline model is projection-backed for findings, checklist rows, inventory, evidence, and correction steps", async () => {
  const source = await readFile("apps/web/components/scans/report-lab/timeline-report-model.ts", "utf8");
  const report = await readFile("apps/web/components/scans/report-lab/shadow-scan-report.tsx", "utf8");

  assert.match(source, /getPersistedCanonicalReportProjection\(scanRecord\)/);
  assert.match(source, /hydrateChecklistPolicyEvidence/);
  assert.match(source, /getReportableGdprEprivacyCoverageItems\(checklistRows\)/);
  assert.match(source, /GDPR_TRANSPARENCY_REPORT_ROW_ID_SET\.has\(row\.id\)/);
  assert.match(source, /deriveGdprEprivacyCoverageChecklistRowRationale\(item\)/);
  assert.match(source, /buildRuntimeInventoryProjectionFromScan/);
  assert.match(source, /buildChecklistConcernTopFindings\(checklistRows\)/);
  assert.match(source, /selectCanonicalHighPriorityFindings/);
  assert.match(source, /buildExecutiveTimelineEvents/);
  assert.match(source, /buildExecutiveRejectPathProjection/);
  assert.match(source, /item\.id === "post_reject_tracking_reduction"/);
  assert.match(source, /rejectPath,/);
  assert.match(source, /const summaryCounts = summarizeEvidenceRows\(evidenceRows\)/);
  assert.match(source, /inventoryProjection\.ungroupedRows/);
  assert.match(source, /vendorSurfaceProjection\.execSummary/);
  assert.match(source, /requestCount: row\.requestCount/);
  assert.match(source, /entityRelationship: entityRelationshipLabel\(row\.entityRelationship\)/);
  assert.match(source, /certscore_overall/);
  assert.match(source, /local_v2_dag_scan_core_duration_ms/);
  assert.match(source, /durationFromTimestamps\(scanRecord\.scan\)/);
  assert.match(source, /\["cmp_vendor_name", "cmpVendorName"\]/);
  assert.doesNotMatch(report, /report\.inventory\.find\(\(row\) => \/consent\|cookie compliance/);
  assert.match(report, /RegulatoryChecklistEvidenceDetails/);
  assert.match(report, /RegulatoryChecklistCorrectionSteps/);
  assert.doesNotMatch(report, /Requests \/ records/);
  assert.match(report, /InventoryConfidenceDots/);
  assert.match(report, /InventoryTypeIcon/);
  assert.match(report, /coverage\.review/);
  assert.match(report, />Policy surfaces</);
  assert.match(report, /\{privacyUrls\.length\} found/);
  assert.doesNotMatch(report, />Privacy surfaces</);
  assert.doesNotMatch(report, /observedPrivacyRows/);
  assert.match(report, /observedGdprTransparencyRows/);
  assert.match(report, /\{observedGdprTransparencyRows\} of \{report\.gdprTransparencyRows\.length\} observed/);
  assert.match(report, /<CompactRejectPathCard projection=\{report\.rejectPath\} \/>/);
  assert.match(report, /data-testid="timeline-reject-path-card"/);
  assert.match(report, /data-testid="post-reject-timeline"/);
  assert.match(report, /<RejectPathTimeline report=\{report\} \/>/);
  assert.doesNotMatch(report, /data-testid="post-reject-activity-inventory"/);
  assert.doesNotMatch(report, /<PostRejectActivityInventory report=\{report\} \/>/);
  assert.match(report, /After Reject Path Timeline/);
  assert.doesNotMatch(report, /After optional cookies and tracking were rejected/);
  assert.doesNotMatch(report, /Optional request suppressed/);
  assert.doesNotMatch(report, /unchanged stored presence remains a separate review-only signal/);
  assert.match(source, /item\.id === "post_reject_tracking_reduction"[\s\S]*Non-essential activity after confirmed Reject/);
  assert.match(report, /mode === "authenticated"/);
  assert.match(report, /-mx-5[^"\n]*lg:-mx-10/);
});

test("refreshed report keeps repeated retained evidence and vendors on unique React keys", async () => {
  const source = await readFile("apps/web/components/scans/report-lab/shadow-scan-report.tsx", "utf8");

  assert.match(source, /finding\.vendors\.map\(\(vendor, index\) =>/);
  assert.match(source, /key=\{`\$\{vendor\}:\$\{index\}`\}/);
  assert.match(source, /finding\.evidence\.map\(\(item, index\) =>/);
  assert.match(source, /key=\{`\$\{item\}:\$\{index\}`\}/);
});

test("shared signed-out header and footer default to the report-width alignment", async () => {
  const header = await readFile("apps/web/components/layout/site-header.tsx", "utf8");
  const footer = await readFile("apps/web/components/layout/site-footer.tsx", "utf8");

  assert.match(header, /wide = true/);
  assert.match(header, /max-w-\[90rem\] px-5 lg:px-10/);
  assert.match(footer, /wide = true/);
  assert.match(footer, /max-w-\[90rem\] px-5 lg:px-10/);
});

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
  const source = await readFile("apps/web/app/app/scans/[scanId]/legacy-page.tsx", "utf8");
  const loadingStateStart = source.indexOf("function ScanDetailLoadingState");
  const loadingStateEnd = source.indexOf("export default async function", loadingStateStart);
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

test("captured-image availability is not gated by dashboard access level", async () => {
  const source = await readFile("apps/web/app/app/scans/[scanId]/legacy-page.tsx", "utf8");
  const visualEvidenceStart = source.indexOf("const visualEvidenceArtifacts");
  const visualEvidenceEnd = source.indexOf("const visualEvidenceHref", visualEvidenceStart);
  const visualEvidenceBlock = source.slice(visualEvidenceStart, visualEvidenceEnd);

  assert.ok(visualEvidenceStart >= 0);
  assert.ok(visualEvidenceEnd > visualEvidenceStart);
  assert.match(visualEvidenceBlock, /getVisualEvidenceArtifacts/);
  assert.doesNotMatch(visualEvidenceBlock, /canViewCapturedImage|membership\.role|isPlatformAdmin/);
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

test("completed report shells remain projection-only and never publish from the UI", async () => {
  for (const page of pages) {
    const source = await readFile(page, "utf8");
    const waitingState = source.indexOf("const waitingForReportProjection");
    const pendingReturn = source.indexOf("if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection)", waitingState);

    assert.ok(waitingState >= 0, `${page} must identify completed scans awaiting projection`);
    assert.ok(pendingReturn > waitingState, `${page} must return the pending shell while the worker publishes`);
    assert.doesNotMatch(source, /publishCanonicalScanReportProjection/);
  }
});

test("report projection timestamps preserve timestamptz semantics", async () => {
  const [projection, backfill] = await Promise.all([
    readFile("apps/web/server/scans/scan-report-projection.ts", "utf8"),
    readFile("apps/web/app/api/internal/scan-report-projection-backfill/route.ts", "utf8"),
  ]);

  assert.match(projection, /report_projection_computed_at[\s\S]*?'ready', now\(\)/);
  assert.match(backfill, /report_projection_computed_at = now\(\)/);
  assert.doesNotMatch(projection, /timezone\('utc', now\(\)\)/);
  assert.doesNotMatch(backfill, /timezone\('utc', now\(\)\)/);
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
  const dashboardPage = await readFile("apps/web/app/app/scans/[scanId]/legacy-page.tsx", "utf8");
  const materializer = await readFile("apps/web/server/scans/local-v2-dag-report.ts", "utf8");

  assert.doesNotMatch(dashboardPage, /unstable_cache/);
  assert.doesNotMatch(materializer, /unstable_cache/);
  assert.match(dashboardPage, /COMPLETED_SCAN_DETAIL_CACHE_MAX_ENTRIES = 8/);
  assert.match(materializer, /LOCAL_V2_DAG_REPORT_MATERIALIZATION_CACHE_MAX_ENTRIES = 6/);
});
