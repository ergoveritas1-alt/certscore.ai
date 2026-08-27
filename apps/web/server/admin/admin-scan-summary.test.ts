import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin scan summaries consume the canonical report projection", async () => {
  const source = await readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8");
  assert.match(source, /buildPulseProjection/);
  assert.match(source, /reportSummary/);
  assert.match(source, /topFindingIds\.length/);
  assert.match(source, /const noGo = projectAdminNoGo/);
  assert.match(source, /score: noGo\.isNoGo \? null/);
  assert.match(source, /privacyPolicyPresent: noGo\.isNoGo \? null/);
  assert.match(source, /resultDisposition === "no_go" \? null : "completed_partial"/);
  assert.doesNotMatch(source, /projectExecutiveFindingsFromUnifiedPackets/);
});

test("an explicit final scan outcome replaces stale snapshot state without letting null summaries erase it", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repositorySource, /scan_outcome = coalesce\(excluded\.scan_outcome, scan_snapshots\.scan_outcome\)/);
  assert.doesNotMatch(repositorySource, /scan_outcome = coalesce\(scan_snapshots\.scan_outcome, excluded\.scan_outcome\)/);
});

test("admin summary persistence retains structured no-go evidence and scan-linked Tranco rank", async () => {
  const summarySource = await readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const scanDetailSource = await readFile("apps/web/server/scans/get-scan-by-id.ts", "utf8");
  const migrationSource = await readFile("packages/db/migrations/0144_scan_assessment_and_tranco_rank.sql", "utf8");

  assert.match(summarySource, /scanNoGoAssessment/);
  assert.match(summarySource, /trancoRankFromScanConfig/);
  assert.match(repositorySource, /scan_no_go_assessment/);
  assert.match(repositorySource, /update public\.scan_runtime_artifacts/);
  assert.match(repositorySource, /tranco_rank/);
  assert.match(repositorySource, /scan_snapshots ss/);
  assert.match(scanDetailSource, /snapshotBackedRuntimeArtifacts/);
  assert.match(scanDetailSource, /normalizedSnapshot\.scan_no_go_assessment/);
  assert.match(migrationSource, /add column if not exists tranco_rank integer/);
  assert.match(migrationSource, /add column if not exists scan_no_go_assessment jsonb/);
  assert.match(scanDetailSource, /mergePolicyDisclosureSummaries/);
  assert.match(scanDetailSource, /article13DisclosureSignals/);
  assert.match(scanDetailSource, /gdprTransparencyTopics/);
});

test("API activity resolves authenticated owners and linked scan enrichment", async () => {
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  assert.match(source, /coalesce\(app_user\.email, auth_user\.email, api_key\.created_by\) as requester_name/);
  assert.match(source, /domain\.hostname as scan_domain_hostname/);
  assert.match(source, /scan_completed_at/);
  assert.match(source, /ss\.top_finding_count::int as top_finding_count/);
  assert.match(source, /ss\.tranco_rank/);
  assert.match(source, /ss\.tranco_rank/);
  assert.match(source, /trancoRank:/);
  assert.match(source, /topFindingCount:/);
  assert.doesNotMatch(source, /materializeAdminScanSummar/);
  assert.doesNotMatch(source, /materializeLocalV2DagScanDetail/);
  assert.doesNotMatch(source, /getAnonymousScanById/);
});

test("API activity shows the resolved page URL while preserving raw request metadata", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  assert.match(pageSource, /\{ label: "Page" \}/);
  assert.match(pageSource, /title=\{request\.pageUrl \?\? "Page URL unavailable"\}/);
  assert.match(pageSource, /\{request\.pageUrl \?\? "Page URL unavailable"\}/);
  assert.match(listSource, /requestedUrl: typeof row\.requested_url === "string" \? row\.requested_url : null/);
  assert.match(listSource, /pageUrl: resolvedPageUrl\?\.url \?\? null/);
  assert.doesNotMatch(pageSource, /title=\{request\.normalizedDomain \?\? undefined\}/);
});

test("API activity navigation is read-only and does not repair summaries", async () => {
  const listSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const pageSource = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(listSource, /ss\.admin_summary_generated_at/);
  assert.doesNotMatch(listSource, /materializeAdminScanSummar/);
  assert.doesNotMatch(pageSource, /materializeAdminScanSummaries/);
  assert.doesNotMatch(pageSource, /summary_repair/);
  assert.match(pageSource, /const \[operationalSnapshot, requestPage\] = await Promise\.all\(\[/);
  assert.match(pageSource, /<Suspense fallback=\{<AdminPulseFiltersFallback \/>}/);
  assert.match(pageSource, /listAdminPulseRequestsPage\(requestListInput\)/);
});

test("API activity derives terminal state and score from canonical scan records", async () => {
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  assert.match(source, /PULSE_EFFECTIVE_STATUS_SQL/);
  assert.match(source, /when s\.status in \('completed', 'failed'\)/);
  assert.match(source, /effective_status in \('completed', 'completed_limited'\)/);
  assert.match(source, /loadLatestVersionedScoreAssessments/);
  assert.match(source, /score: assessment\.scoreValue/);
});

test("completion materialization persists the canonical projection before score and acknowledgement", async () => {
  const [source, requestRepositorySource] = await Promise.all([
    readFile("apps/web/app/api/internal/scan-score-materialization/route.ts", "utf8"),
    readFile("apps/web/server/scans/score-materialization-request-repository.ts", "utf8"),
  ]);
  const routeStart = source.indexOf("export async function POST");
  const projectionIndex = source.indexOf('await timedMaterializationPhase(authorizedScanId, "report_projection"', routeStart);
  const verificationIndex = source.indexOf('"projection_verification"', projectionIndex);
  const reportReadyIndex = source.indexOf('reportReady: true', verificationIndex);
  const summaryIndex = source.indexOf("await persistAdminScanSummaryForPublishedRecord", verificationIndex);
  const scoreIndex = source.indexOf("await timedMaterializationPhase(authorizedScanId, \"score_persistence\"", summaryIndex);
  const completeIndex = source.indexOf("await completeScoreMaterializationRequest", scoreIndex);

  assert.ok(projectionIndex >= 0);
  assert.ok(verificationIndex > projectionIndex);
  assert.ok(reportReadyIndex > verificationIndex);
  assert.ok(summaryIndex > reportReadyIndex);
  assert.ok(scoreIndex > summaryIndex);
  assert.ok(completeIndex > scoreIndex);
  assert.match(source, /Admin scan summary persistence was incomplete/);
  assert.match(source, /canonicalScanRecord/);
  assert.match(source, /persistScanReportProjection/);
  assert.match(source, /loadPersistedScanReportProjection/);
  assert.match(source, /classifyScoreMaterializationFailure/);
  assert.match(source, /status: retryable \? 503 : 422/);
  assert.match(source, /code = "retry_exhausted"/);
  assert.match(requestRepositorySource, /retry\.attempt_count >= 24/);
  assert.match(requestRepositorySource, /interval '24 hours'/);
  assert.match(requestRepositorySource, /least\(\s*1800,/);
  assert.match(requestRepositorySource, /next_attempt_at/);
  assert.match(requestRepositorySource, /retry_exhausted:/);
});

test("completion materialization reuses the verified persisted report for admin and score projection", async () => {
  const routeSource = await readFile("apps/web/app/api/internal/scan-score-materialization/route.ts", "utf8");
  const adminSource = await readFile("apps/web/server/admin/admin-scan-summary.ts", "utf8");

  assert.match(routeSource, /persistAdminScanSummaryForPublishedRecord\(canonicalScanRecord\)/);
  assert.match(routeSource, /scanRecord: canonicalScanRecord/);
  assert.match(adminSource, /export async function persistAdminScanSummaryForPublishedRecord/);
  assert.match(adminSource, /return persistAdminScanSummaryForPublishedRecord\(canonicalScanRecord\)/);
});

test("Admin Scans navigation is read-only and Score Shadow has no admin surface", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const layoutSource = await readFile("apps/web/app/app/admin/layout.tsx", "utf8");

  assert.doesNotMatch(pageSource, /materializeAdminScanSummaries/);
  assert.doesNotMatch(pageSource, /summary_repair/);
  assert.match(pageSource, /Promise\.all\(\[/);
  assert.doesNotMatch(layoutSource, /scoring-shadow/);
});

test("Admin Scans separates requester identity from outbound scanner egress", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(pageSource, /\{ label: "Requester IP" \}, \{ label: "Requested" \}/);
  assert.match(pageSource, /\{ label: "Scan ID" \}, \{ label: "Scanner egress" \},/);
  assert.match(pageSource, /\{ label: "Scanner egress" \},\s+\{ label: "Open"/);
  assert.match(pageSource, /formatRequestedDateTime/);
  assert.match(pageSource, /requestedDateTime\.date/);
  assert.match(pageSource, /requestedDateTime\.time/);
  assert.match(pageSource, /Requester IP identifies who reached CertScore/);
  assert.match(pageSource, /scan\.scannerEgressId/);
  assert.match(listSource, /scannerEgressId: scannerEgress\.id/);
  assert.match(listSource, /shouldUseLocalV2DagScanTool\(\)/);
  assert.match(repositorySource, /scan_outcome,\s+stop_reason_code,\s+stop_reason_detail,\s+stop_reason_label,\s+egress_id,\s+egress_type,/);
});

test("Admin Scans gives access outcomes room for at most two visible lines", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(pageSource, /w-\[2957px\] min-w-\[2957px\] table-fixed/);
  assert.match(pageSource, /<ScanSizeCell matrix=\{matrix\} \/>/);
  assert.match(pageSource, /Site load \{website \? `\$\{website\.megabytes\.toFixed\(2\)\} MB` : "—"\}/);
  assert.match(pageSource, /Policy \{policy\?\.compressedKilobytes/);
  assert.match(pageSource, /<col style=\{\{ width: "240px" \}\}/);
  assert.match(pageSource, /\{ label: "Language" \}, \{ label: "Access" \}, \{ label: "Industry" \}/);
  assert.match(pageSource, /width: "80px" \}\} \/><col style=\{\{ width: "240px" \}\} \/><col style=\{\{ width: "160px"/);
  assert.match(pageSource, /line-clamp-2 leading-4/);
  assert.match(pageSource, /title=\{accessLabel\}/);
});

test("Admin activity pagination supports a direct page jump", async () => {
  const controls = await readFile("apps/web/components/ui/pagination-controls.tsx", "utf8");
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(controls, /showPageJump/);
  assert.match(controls, /Go to page/);
  assert.match(controls, /max=\{Math\.max\(1, normalizedPageCount\)\}/);
  assert.match(scansPage, /showPageJump/);
  assert.match(pulsePage, /showPageJump/);
});

test("Admin Scans and API Activity pagination expose immediate feedback while navigation is pending", async () => {
  const controls = await readFile("apps/web/components/ui/pagination-controls.tsx", "utf8");
  const navigationButtons = await readFile("apps/web/components/ui/pagination-navigation-buttons.tsx", "utf8");
  const scansPage = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.doesNotMatch(controls, /"use client"/);
  assert.match(controls, /PaginationNavigationButtons/);
  assert.match(navigationButtons, /const isPageNavigationPending = pendingHref !== null/);
  assert.doesNotMatch(navigationButtons, /useRouter|router\.push|useTransition/);
  assert.doesNotMatch(navigationButtons, /event\.preventDefault\(\);\n    if \(isPageNavigationPending\)/);
  assert.match(navigationButtons, /<a/);
  assert.match(navigationButtons, /aria-busy=\{isPageNavigationPending/);
  assert.match(navigationButtons, /\? "Loading…" : "Previous"/);
  assert.match(navigationButtons, /\? "Loading…" : "Next"/);
  assert.match(scansPage, /<PaginationControls/);
  assert.match(scansPage, /basePath="\/app\/admin\/scans"/);
  assert.match(pulsePage, /<PaginationControls/);
  assert.match(pulsePage, /basePath="\/app\/admin\/pulse"/);
});

test("API activity presents a persisted clear-access summary consistently with its access filter", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  assert.match(pageSource, /request\.accessPostureClass \|\| request\.adminSummaryGeneratedAt \? "Clear"/);
  assert.match(listSource, /when ss\.scan_id is not null then 'clear'/);
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
  const pulsePage = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");

  assert.match(scansSource, /projectAdminNoGo/);
  assert.match(scansSource, /runtimeAssessment: runtimeArtifact\?\.scan_no_go_assessment \?\? overviewSnapshot\?\.scan_no_go_assessment/);
  assert.match(scansSource, /visualAccessReview: runtimeArtifact\?\.visual_access_review \?\? overviewSnapshot\?\.visual_access_review/);
  assert.match(scansSource, /const scoreAssessment = noGo\.isNoGo \? null : legacyScoreAssessmentMap\.get\(scan\.id\) \?\? null/);
  assert.match(pulseSource, /SCAN_NO_GO_SNAPSHOT_OUTCOMES/);
  assert.match(pulseSource, /PULSE_NO_GO_SQL/);
  assert.match(pulseSource, /const canonicalSummary = projectCanonicalSurfaceSummary/);
  assert.match(pulseSource, /const score = canonicalSummary\.score/);
  assert.match(pulseSource, /if \(item\.noGoFlag\)/);
  assert.match(repositorySource, /scan_no_go_assessment/);
  assert.match(repositorySource, /visual_access_review/);
  assert.match(repositorySource, /scanner_evidence_missing/);
  assert.match(repositorySource, /completed_scan_backfill/);
  assert.match(repositorySource, /retainedScannerExecutionEvidenceSql/);
  assert.match(repositorySource, /LOCAL_V2_DAG_LAMBDA_RESULT_RECEIVED_EVENT_TYPE/);
  assert.match(repositorySource, /metadata_json ->> 'resultStatus' = 'completed'/);
  assert.match(repositorySource, /metadata_json #>> '\{artifactPointers,scanArtifactUri\}' like 's3:\/\/%'/);
  assert.match(repositorySource, /metadata_json #>> '\{artifactMetadata,scanArtifactUri,sha256\}' ~ '\^\[a-f0-9\]\{64\}\$'/);
  assert.match(repositorySource, /metadata_json #>> '\{artifactMetadata,scanArtifactUri,sizeBytes\}' ~ '\^\[1-9\]\[0-9\]\*\$'/);
  assert.match(repositorySource, /from scan_snapshots\s+where scan_id = any\(\$1::uuid\[\]\)/);
  assert.match(repositorySource, /from scan_runtime_artifacts\s+where scan_id = any\(\$1::uuid\[\]\)/);
  assert.match(scansPage, /scan\.noGoFlag/);
  assert.match(scansPage, /label: "Tranco"/);
  assert.match(pulsePage, /label: "Tranco"/);
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

test("Admin Scans uses bounded indexed paths for exact domains and scan IDs", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repositorySource, /normalizeAdminExactHostname/);
  assert.match(repositorySource, /normalizeAdminExactScanId/);
  assert.match(repositorySource, /canUseExactIdentityPath/);
  assert.match(repositorySource, /lower\(d\.hostname\) = any\(\$2::text\[\]\)/);
  assert.match(repositorySource, /sr\.normalized_domain = any\(\$2::text\[\]\)/);
  assert.match(repositorySource, /s\.id = \$3::uuid/);
  assert.ok(repositorySource.indexOf("if (canUseExactIdentityPath)") < repositorySource.indexOf("const baseSql = adminScanActivityBaseSql()"));
});

test("Admin Scans streams a route-local result skeleton instead of blocking the Admin shell", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(pageSource, /import \{ Suspense \} from "react"/);
  assert.match(pageSource, /function AdminScansContentFallback/);
  assert.match(pageSource, /<Suspense fallback=\{<AdminScansContentFallback \/>\}>/);
  assert.match(pageSource, /<AdminScansContent resolvedSearchParams=\{resolvedSearchParams\} \/>/);
});

test("authenticated route loading fallbacks do not nest main landmarks", async () => {
  const appLoadingSource = await readFile("apps/web/app/app/loading.tsx", "utf8");
  const adminLoadingSource = await readFile("apps/web/app/app/admin/loading.tsx", "utf8");

  assert.doesNotMatch(appLoadingSource, /<main/);
  assert.doesNotMatch(adminLoadingSource, /<main/);
  assert.match(appLoadingSource, /<section/);
  assert.match(adminLoadingSource, /<section/);
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
    assert.match(page, /placeholder="Domain, scan_id, email, requester, IP/);
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

test("admin activity search supports field-specific exclusion syntax", async () => {
  const source = await readFile("apps/web/lib/admin/activity-search.ts", "utf8");
  const pulseList = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  const scanRepository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  assert.match(source, /domain\|scan_\?id\|email\|requester\|ip\|source/);
  assert.match(source, /replaceAll\(\"\*\", \"%\"\)/);
  assert.match(source, /exclusions\[field\]\.push/);
  assert.match(pulseList, /\$18::text\[\].*sourceIp/s);
  assert.match(scanRepository, /\$18::text\[\].*sourceIp/s);
  assert.match(scanRepository, /\$19::text\[\].*source_filter/s);
});

test("API activity treats Any filter values as unfiltered", async () => {
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  assert.match(source, /normalizeAdminActivityFilter\(input\.freshness, \["any"\]\)/);
  assert.match(source, /normalizeAdminActivityFilter\(input\.scanFrom, \["any"\]\)/);
  assert.match(source, /normalizeAdminActivityFilter\(input\.access, \["any"\]\)/);
  assert.doesNotMatch(source, /input\.freshness\?\.trim\(\) \|\| null/);
});

test("API activity offers a canonical server-side request route filter", async () => {
  const page = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const source = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");
  assert.match(page, /name="route"/);
  assert.match(page, /Any route/);
  assert.match(source, /PULSE_API_ROUTE_SQL/);
  assert.match(source, /\$14::text is null/);
});

test("admin scan activity supports exact source filtering", async () => {
  const searchSource = await readFile("apps/web/lib/admin/activity-search.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");

  assert.match(searchSource, /source\\s\*:\\s\*/);
  assert.match(repositorySource, /lower\(source_filter\) = lower\(\$14\)/);
  assert.match(repositorySource, /requested_by ->> 'anonymous'/);
  assert.match(repositorySource, /then 'homepage-anonymous'/);
  assert.match(pageSource, /source:homepage-anonymous/);
});

test("homepage anonymous full scans retain distinct request provenance", async () => {
  const homepageSource = await readFile("apps/web/app/(marketing)/page.tsx", "utf8");
  const formSource = await readFile("apps/web/components/marketing/domain-scan-form.tsx", "utf8");
  const routeSource = await readFile("apps/web/app/api/full-scan/route.ts", "utf8");

  assert.match(homepageSource, /requestSource="homepage"/);
  assert.match(formSource, /x-certscore-scan-source/);
  assert.match(routeSource, /source: "homepage-anonymous"/);
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

test("public report materialization is read-only with respect to score and admin summary state", async () => {
  const source = await readFile("apps/web/server/scans/get-public-scan-record.ts", "utf8");
  assert.doesNotMatch(source, /persistAdminScanSummaryForRecord/);
  assert.doesNotMatch(source, /persistAdminScanSummary/);
});

test("the rendered report projection cannot mutate canonical or admin-summary score state", async () => {
  const source = await readFile("apps/web/components/scans/shared-scan-detail-view.tsx", "utf8");
  assert.doesNotMatch(source, /persistAdminScanSummary/);
  assert.doesNotMatch(source, /certscore_overall\s*=/);
});

test("admin summary persistence cannot overwrite the canonical score", async () => {
  const source = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const start = source.indexOf("export async function persistAdminScanSummary");
  const end = source.indexOf("\nexport ", start + 1);
  const functionSource = source.slice(start, end > start ? end : undefined);

  assert.doesNotMatch(functionSource, /certscore_overall/);
  assert.doesNotMatch(functionSource, /input\.score/);
  assert.match(functionSource, /top_finding_count/);
});

test("admin summary persistence accepts completed scans without a canonical score", async () => {
  const migration = await readFile("packages/db/migrations/0135_nullable_admin_scan_score.sql", "utf8");
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(migration, /certscore_overall drop not null/);
  assert.match(repository, /certscore_overall: number \| null/);
});

test("admin overview links cross-workspace scans through the admin detail route", async () => {
  const source = await readFile("apps/web/app/app/admin/page.tsx", "utf8");

  assert.match(source, /href=\{`\/app\/admin\/scans\/\$\{scan\.scanId\}`\}/);
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

test("admin users paginate in SQL instead of loading the complete account history", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-admin-users.ts", "utf8");
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const sortSource = await readFile("apps/web/server/admin/admin-users-sort.ts", "utf8");

  assert.match(pageSource, /listAdminUsersPage\(pageSize,/);
  assert.doesNotMatch(pageSource, /listAdminUsers\(\)/);
  assert.match(pageSource, /const \[requestedUserPage, workspaces, mcpActivationFunnel\] = await Promise\.all\(\[/);
  assert.match(pageSource, /app\.admin\.users\.workspaces/);
  assert.match(pageSource, /pendingContent=/);
  assert.doesNotMatch(pageSource, />Last requested</);
  assert.doesNotMatch(pageSource, />Last associated</);
  assert.match(pageSource, /sortKey="lastScan"/);
  assert.match(listSource, /latestActivityAt\(row\.last_associated_scan_at, row\.last_scan_requested_at\)/);
  assert.match(repositorySource, /selected_users as/);
  assert.match(repositorySource, /limit \$1 offset \$2/);
  assert.match(repositorySource, /where scans\.submitted_by_user_id = selected_users\.id/);
  assert.match(sortSource, /lastScan: "greatest\(request_activity\.last_scan_requested_at, associated_activity\.last_scan_at\)"/);
  assert.match(repositorySource, /from mcp_oauth_refresh_tokens tokens/);
  assert.match(repositorySource, /active_mcp_connector_count/);
  assert.match(repositorySource, /from public\.mcp_tool_invocation_events/);
  assert.match(repositorySource, /actor_id = any\(\$1::text\[\]\)/);
  assert.match(repositorySource, /event_name in \('oauth_authorized', 'mcp_initialized', 'mcp_tools_listed'\)/);
  assert.match(repositorySource, /feature = 'mcp:claude'/);
  assert.match(repositorySource, /stage\.event_name = 'mcp_first_tool_invoked'/);
  assert.match(repositorySource, /stage\.event_name = 'mcp_scan_requested'/);
  assert.match(listSource, /mcpTelemetryActorId/);
  assert.match(pageSource, /Claude activation funnel/);
  assert.match(pageSource, /within 24h/);
  assert.match(pageSource, /within 1h/);
  assert.match(pageSource, /activeMcpConnectorCount > 0 \? "authorized" : user\.lastMcpOAuthAuthorizedAt \? "approved" : "authorization ended"/);
  assert.match(pageSource, /lastMcpOAuthAuthorizedAt \?\? user\.lastMcpConnectorAt/);
  assert.match(pageSource, /Activation:/);
  assert.match(pageSource, /awaiting initialization/);
  assert.match(pageSource, /awaiting tool discovery/);
  assert.match(pageSource, /MCP usage \(90d\):/);
  assert.match(pageSource, /lastMcpToolInvocationAt/);
});

test("admin scans poll lightweight status data and refresh only after a status change", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/scans/page.tsx", "utf8");
  const refreshSource = await readFile("apps/web/app/app/admin/scans/admin-scans-auto-refresh.tsx", "utf8");
  const routeSource = await readFile("apps/web/app/api/admin/scans/live-status/route.ts", "utf8");

  assert.match(pageSource, /<AdminScansAutoRefresh targets=\{liveTargets\}/);
  assert.match(refreshSource, /fetch\("\/api\/admin\/scans\/live-status"/);
  assert.match(refreshSource, /result\.fingerprint !== initialFingerprint/);
  assert.doesNotMatch(refreshSource, /setInterval/);
  assert.match(routeSource, /getAdminScanLiveStatus\(targets\)/);
});

test("API activity obtains rows and the filtered total in one paginated query", async () => {
  const pageSource = await readFile("apps/web/app/app/admin/pulse/page.tsx", "utf8");
  const listSource = await readFile("apps/web/server/admin/list-pulse-requests.ts", "utf8");

  assert.match(pageSource, /listAdminPulseRequestsPage\(requestListInput\)/);
  assert.doesNotMatch(pageSource, /countAdminPulseRequests\(requestListInput\)/);
  assert.match(listSource, /count\(\*\) over\(\)::int as filtered_total_count/);
  assert.match(listSource, /limit \$10 offset \$11/);
});

test("admin scan activity materializes filters once for pagination and the total", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repositorySource, /filtered_activity as materialized/);
  assert.match(repositorySource, /paged_activity as/);
  assert.match(repositorySource, /activity_total as/);
  assert.doesNotMatch(repositorySource, /const \[pageResult, countResult\] = await Promise\.all/);
});

test("admin scan overview combines related aggregate counts", async () => {
  const repositorySource = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repositorySource, /count\(\*\) filter \(\s*where coalesce\(fulfilled_by_scan_id, scan_id\) is null/);
  assert.match(repositorySource, /as http_403_count/);
  assert.match(repositorySource, /as http_429_count/);
  assert.match(repositorySource, /as blocked_or_captcha_count/);
});

test("admin scan list logs its expensive production stages separately", async () => {
  const listSource = await readFile("apps/web/server/admin/list-admin-scans.ts", "utf8");

  assert.match(listSource, /app\.admin\.scans\.activity-page/);
  assert.match(listSource, /app\.admin\.scans\.row-enrichment/);
  assert.match(listSource, /app\.admin\.scans\.score-attribution/);
});

test("admin section navigation prefetches only lightweight pages and has a loading boundary", async () => {
  const layoutSource = await readFile("apps/web/app/app/admin/layout.tsx", "utf8");
  const loadingSource = await readFile("apps/web/app/app/admin/loading.tsx", "utf8");
  const actionsSource = await readFile("apps/web/app/app/admin/scans/admin-scan-actions.tsx", "utf8");
  const overviewSource = await readFile("apps/web/app/app/admin/page.tsx", "utf8");
  const appShellSource = await readFile("apps/web/components/dashboard/app-shell.tsx", "utf8");

  assert.match(
    layoutSource,
    /prefetch=\{item\.href === "\/app\/admin\/analytics" \|\| item\.href === "\/app\/admin\/mcp"\}/,
  );
  assert.doesNotMatch(layoutSource, /prefetch=\{true\}/);
  assert.match(loadingSource, /aria-label="Loading admin page"/);
  assert.match(loadingSource, /aria-busy="true"/);
  assert.equal((actionsSource.match(/prefetch=\{false\}/g) ?? []).length, 2);
  assert.equal((overviewSource.match(/prefetch=\{false\}/g) ?? []).length, 7);
  assert.equal((appShellSource.match(/prefetch=\{false\}/g) ?? []).length, 1);
});
