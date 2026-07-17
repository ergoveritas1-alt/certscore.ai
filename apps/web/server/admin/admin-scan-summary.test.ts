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

test("API activity groups SDK and MCP result retrieval under the initiating logical request", async () => {
  const listSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const statusSource = await readFile("apps/web/lib/pulse/status.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/pulse/repository.ts", "utf8");

  assert.match(listSource, /LOGICAL_PULSE_ACTIVITY_PREDICATE/);
  assert.match(listSource, /request_context ->> 'mode' = 'scanId'/);
  assert.match(listSource, /in \('sdk', 'mcp'\)/);
  assert.match(statusSource, /\/api\/v1\/pulse\?jobId=/);
  assert.match(repositorySource, /result_pulse_url = coalesce\(result_pulse_url, \$3\)/);
});

test("admin activity consumes the canonical reason-specific no-go outcome registry", async () => {
  const scansSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const pulseSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(scansSource, /projectAdminNoGo/);
  assert.match(scansSource, /runtimeAssessment: runtimeArtifact\?\.scan_no_go_assessment/);
  assert.match(pulseSource, /SCAN_NO_GO_SNAPSHOT_OUTCOMES/);
  assert.match(pulseSource, /PULSE_NO_GO_SQL/);
  assert.match(repositorySource, /scan_no_go_assessment/);
  assert.match(repositorySource, /visual_access_review/);
  assert.match(scansPage, /scan\.noGoFlag/);
});

test("Admin Scans filters and counts the complete retained activity set in SQL", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(repositorySource, /loadAdminScanActivityPageRefs/);
  assert.match(repositorySource, /select count\(\*\)::int as total_count/);
  assert.match(repositorySource, /from scan_activity/);
  assert.doesNotMatch(listSource, /ADMIN_FILTER_ACTIVITY_WINDOW_LIMIT/);
  assert.doesNotMatch(pageSource, /25_000/);
  assert.match(pageSource, /scanPage\.totalCount/);
});

test("Admin Scans exposes server-side freshness, metadata, origin, and time-span filters", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  for (const name of ["freshness", "access", "outcome", "language", "industry", "scanFrom", "timeSpan"]) {
    assert.match(pageSource, new RegExp(`name=\\"${name}\\"`));
    assert.match(listSource, new RegExp(name));
    assert.match(repositorySource, new RegExp(
      name === "scanFrom" ? "scan_from_filter" :
        name === "timeSpan" ? "activity_at >=" :
          name === "access" ? "access_filter" : `${name}_filter`
    ));
  }
  assert.match(repositorySource, /limit \$8 offset \$9/);
  assert.match(pageSource, /Past 4 hours/);
  assert.match(pageSource, /Past 31 days/);
  assert.match(repositorySource, /from public\.industries/);
  assert.match(repositorySource, /order by sort_order asc, label asc/);
  assert.match(repositorySource, /outcomesParameter: "\$12"/);
});

test("admin activity pages use one search prompt across domain, scan, email, requester, and IP", async () => {
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const scanList = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const pulseList = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  for (const page of [scansPage, pulsePage]) {
    assert.match(page, /placeholder="Domain, scan_id, email, requester, IP"/);
    assert.match(page, /name="q"/);
    assert.doesNotMatch(page, /name="email"/);
  }
  assert.match(scanList, /loadAdminScanActivityPageRefs/);
  assert.match(await readFile("apps/web/server/admin/repository.ts", "utf8"), /coalesce\(au\.email, bau\.email/);
  assert.match(pulseList, /coalesce\(app_user\.email, auth_user\.email, api_key\.created_by, ''\) ilike/);
  assert.match(pulseList, /pr\.requested_by::text ilike/);
  assert.match(pulseList, /request_context ->> 'sourceIp'/);
  assert.match(pulseList, /request_context ->> 'originIp'/);
  assert.match(pulseList, /request_context ->> 'ipHash'/);
  assert.match(pulseList, /request_context -> 'provenance' ->> 'originIp'/);
});

test("admin activity pages share one page-level navigation overlay and API report links", async () => {
  const actions = await readFile("apps/web/app/app/admin/scans/admin-scan-actions.tsx", "utf8");
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(actions, /createPortal/);
  assert.match(actions, /AdminNavigationProvider/);
  assert.match(actions, /if \(navigation\) return false/);
  assert.match(scansPage, /<AdminNavigationProvider>/);
  assert.match(pulsePage, /<AdminNavigationProvider>/);
  assert.match(pulsePage, /<AdminReportLink/);
  assert.match(pulsePage, /getAdminAuthenticatedScanHref\(request\.scanId\)/);
});

test("language cells expose evidence source and confidence without generic English fallback", async () => {
  const languageSource = await readFile("apps/web/lib/scans/primary-language.ts", "utf8");
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.doesNotMatch(languageSource, /GENERIC_ENGLISH_TLDS/);
  assert.match(languageSource, /inferPrimaryLanguage/);
  assert.match(scansPage, /primaryLanguageConfidence/);
  assert.match(pulsePage, /primaryLanguageSource/);
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
  assert.match(listSource, /requesterIpAttributionFromContext\(pulseAttribution\?\.request_context/);
  assert.match(repository, /pulse_attribution\.request_context as pulse_request_context/);
  assert.match(repository, /abs\(extract\(epoch from \(pr\.requested_at - sr\.requested_at\)\)\) <= 30/);
});

test("authenticated dashboard scans retain internal requester IP attribution and hash-only scanner provenance", async () => {
  const createDomainSource = await readFile("apps/web/server/domains/create-domain.ts", "utf8");
  const createFullScanSource = await readFile("apps/web/server/scans/create-full-scan.ts", "utf8");

  assert.match(createDomainSource, /const requesterIpContext = getScanRequesterIpContext\(requestHeaders\)/);
  assert.match(createDomainSource, /originIp: requesterIpContext\.ipHash/);
  assert.match(createDomainSource, /requesterIpContext,/);
  assert.match(createFullScanSource, /sourceIp: requesterIpContext\.sourceIp/);
  assert.match(createFullScanSource, /ipHash: requesterIpContext\.ipHash/);
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
