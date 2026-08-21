import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const cache = readFileSync("apps/web/server/admin/admin-query-cache.ts", "utf8");

test("Admin Scans renders a bounded operational snapshot with scan-specific metrics", () => {
  assert.match(page, /<CardTitle>Operational snapshot<\/CardTitle>/);
  assert.match(page, /Physical scan runs and scan requests/);
  assert.match(page, /snapshotPeriods = \["1h", "24h", "7d", "30d", "1y"\]/);
  assert.match(page, /name="snapshot"/);
  assert.match(page, /operationalSnapshot\.trend\.map/);
  assert.match(page, /operationalSnapshot\.scanFromCounts\.map/);
  for (const label of ["Runs", "Requests", "Completed", "Limited", "Failed", "Duration", "Completion", "Failures", "Reuse", "No-go", "Active"]) {
    assert.match(page, new RegExp(`\\["${label}"`));
  }
});

test("Admin Scans snapshot uses one cached aggregation and honors traffic visibility", () => {
  assert.match(repository, /ADMIN_SCAN_OPERATIONAL_SNAPSHOT_CONFIG/);
  assert.match(repository, /loadAdminScanOperationalSnapshot/);
  assert.match(repository, /visible_scans as materialized/);
  assert.match(repository, /visible_requests as materialized/);
  assert.match(repository, /date_bin\('5 minutes'/);
  assert.match(repository, /date_trunc\('month'/);
  assert.match(repository, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  assert.match(repository, /certscore-canary/);
  assert.match(repository, /SCAN_NO_GO_SNAPSHOT_OUTCOMES/);
  assert.match(cache, /admin-scan-operational-snapshot-v1/);
  assert.match(cache, /revalidate: 30/);
});

test("snapshot period and traffic filters survive table filtering and pagination", () => {
  assert.match(page, /<input name="snapshot" type="hidden" value=\{activeSnapshotPeriod\}/);
  assert.match(page, /snapshot: activeSnapshotPeriod/);
  assert.match(page, /excludeMacMiniScanBot/);
  assert.match(page, /includeCanary/);
});
