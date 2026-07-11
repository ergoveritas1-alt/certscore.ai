import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin scan summaries consume the canonical report projection", async () => {
  const source = await readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8");
  assert.match(source, /buildPulseProjection/);
  assert.match(source, /reportSummary/);
  assert.match(source, /topFindingIds\.length/);
  assert.doesNotMatch(source, /projectExecutiveFindingsFromUnifiedPackets/);
});

test("API activity resolves authenticated owners and linked scan enrichment", async () => {
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  assert.match(source, /coalesce\(app_user\.email, auth_user\.email, api_key\.created_by\) as requester_name/);
  assert.match(source, /domain\.hostname as scan_domain_hostname/);
  assert.match(source, /scan_completed_at/);
  assert.match(source, /ss\.top_finding_count::int as top_finding_count/);
  assert.match(source, /topFindingCount:/);
  assert.doesNotMatch(source, /materializeAdminScanSummar/);
  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
  assert.doesNotMatch(source, /getAnonymousScanById/);
});

test("Admin Scans reads persisted summaries without report materialization in the list request", async () => {
  const source = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  assert.doesNotMatch(source, /materializeAdminScanSummar/);
  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
  assert.match(source, /mapScanRequestRow\(request, linkedScanId \? scansById\.get\(linkedScanId\)/);
});

test("public report materialization persists the canonical summary before returning", async () => {
  const source = await readFile("apps/web/server/scans/get-public-scan-record.ts", "utf8");
  assert.match(source, /persistAdminScanSummaryForRecord\(materialized\)/);
  assert.match(source, /await persistAdminScanSummaryForRecord/);
});

test("the rendered report projection persists its exact score and top-finding count", async () => {
  const source = await readFile("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");
  assert.match(source, /score: executiveAccessLimitationNotice \? null : executiveDisplayedScore/);
  assert.match(source, /topFindingCount: persistedTopFindings\.length/);
  assert.match(source, /const persistedTopFindings = executiveAccessLimitationNotice \? \[\] : topExecutiveFindings/);
});

test("admin summary persistence accepts completed scans without a canonical score", async () => {
  const migration = await readFile("packages/db/migrations/0135_nullable_admin_scan_score.sql", "utf8");
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(migration, /certscore_overall drop not null/);
  assert.match(repository, /certscore_overall: number \| null/);
});

test("admin overview links cross-workspace scans through the admin detail route", async () => {
  const source = await readFile("apps/web/app/app/admin/page.tsx", "utf8");

  assert.match(source, /href=\{`\/app\/admin\/scans\/\$\{scan\.linkedScanId\}`\}/);
  assert.doesNotMatch(source, /href=\{scan\.scanViewHref\} idleContent="Inspect snapshot"/);
});

test("admin scan rows attribute Pulse, SDK, and MCP scans to their API-key owner", async () => {
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");

  assert.match(repository, /loadAdminPulseScanAttributionRows/);
  assert.match(repository, /coalesce\(app_user\.email, auth_user\.email, api_key\.created_by\) as requester_name/);
  assert.match(repository, /resolution_mode in \('created_new_scan', 'queued_new_scan'\)/);
  assert.match(listSource, /pulseAttribution\?\.requester_name/);
  assert.match(listSource, /getRequesterIpFromContext\(pulseAttribution\?\.request_context/);
});

test("authenticated dashboard scans retain a hashed requester IP", async () => {
  const source = await readFile("apps/web/server/domains/create-domain.ts", "utf8");

  assert.match(source, /await headers\(\)/);
  assert.match(source, /createHash\("sha256"\)\.update\(originIp\)\.digest\("hex"\)/);
  assert.match(source, /provenance,/);
});

test("scan request timestamptz defaults preserve the actual request instant", async () => {
  const source = await readFile("apps/web/server/scans/scan-request-log.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0137_scan_request_timestamptz_defaults.sql", "utf8");

  assert.doesNotMatch(source, /default timezone\('utc', now\(\)\)/);
  assert.match(migration, /alter column requested_at set default now\(\)/);
});

test("dashboard Fresh re-scan availability derives directly from server-provided eligible scans", async () => {
  const source = await readFile("apps/web/components/domains/add-domain-form.tsx", "utf8");

  assert.match(source, /hasRecentReusableScanHint \|\| apiHasRecentReusableScan/);
  assert.match(source, /includeFreshRescanOption=\{hasRecentReusableScan\}/);
  assert.doesNotMatch(source, /setHasRecentReusableScan/);
});

test("localhost web development has enough heap for broad authenticated route QA", async () => {
  const packageJson = await readFile("apps/web/package.json", "utf8");

  assert.match(packageJson, /max-old-space-size=4096/);
});
