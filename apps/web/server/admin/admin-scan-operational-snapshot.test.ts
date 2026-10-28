import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("apps/web/app/app/admin/scans/page.tsx", "utf8");
const repository = readFileSync("apps/web/server/admin/repository.ts", "utf8");
const cache = readFileSync("apps/web/server/admin/admin-query-cache.ts", "utf8");
const component = readFileSync("apps/web/components/admin/admin-operational-snapshot.tsx", "utf8");
const contract = readFileSync("apps/web/lib/admin/admin-operational-snapshot.ts", "utf8");
const actions = readFileSync("apps/web/server/admin/list-admin-scans.ts", "utf8");

test("Admin Scans renders a bounded operational snapshot with scan-specific metrics", () => {
  assert.match(page, /<AdminOperationalSnapshot/);
  assert.match(component, /<CardTitle>Operational snapshot<\/CardTitle>/);
  assert.match(page, /Same filters as the table/);
  assert.match(contract, /\["1h", "24h", "7d", "30d", "1y"\]/);
  assert.match(component, /name=\{periodName\}/);
  assert.match(page, /operationalSnapshot\.trend\.map/);
  assert.match(page, /operationalSnapshot\.regions\.map/);
  for (const label of ["Runs", "Request-only", "Completed", "Limited", "Failed", "Duration", "Completion", "Failures", "Reuse", "No-go", "Active"]) {
    assert.match(page, new RegExp(`label: "${label}"`));
  }
});

test("Admin Scans snapshot uses one cached aggregation and honors traffic visibility", () => {
  assert.match(repository, /ADMIN_OPERATIONAL_SNAPSHOT_CONFIG/);
  assert.match(repository, /loadAdminScanOperationalSnapshot/);
  assert.match(repository, /visible_scans as materialized/);
  assert.match(repository, /visible_requests as materialized/);
  assert.match(contract, /date_bin\('5 minutes'/);
  assert.match(contract, /date_trunc\('month'/);
  assert.match(repository, /MAC_MINI_SCAN_BOT_API_KEY_NAMES/);
  assert.match(repository, /certscore-canary/);
  assert.match(repository, /SCAN_NO_GO_SNAPSHOT_OUTCOMES/);
  assert.match(cache, /admin-scan-operational-snapshot-v3/);
  assert.match(cache, /revalidate: 30/);
});

test("snapshot period and traffic filters survive table filtering and pagination", () => {
  assert.match(page, /timeSpan: activeTimeSpan/);
  assert.match(page, /adminScanActivityHref\(sharedParams, values\)/);
  assert.doesNotMatch(page, /activeSnapshotPeriod/);
  assert.match(page, /excludeMacMiniScanBot/);
  assert.match(page, /includeCanary/);
});

test("Admin Scans keeps imported types out of the server action export surface", () => {
  assert.doesNotMatch(actions, /export type \{ AdminScanOperationalSnapshot/);
  assert.match(page, /ADMIN_SCAN_ACTIVITY_PERIODS/);
  assert.match(page, /resolveAdminScanActivityPeriod/);
});

test("Admin Scans does not append an inferred posture to outcome filter labels", () => {
  assert.match(page, /filterOptions\.outcomes\.map\(\(outcome\) => <option[^>]+>\{formatFilterLabel\(outcome\)\}/);
  assert.doesNotMatch(page, /filterOptions\.outcomes\.map\(\(outcome\) => <option[^>]+>\{formatScanOutcome\(outcome/);
});
