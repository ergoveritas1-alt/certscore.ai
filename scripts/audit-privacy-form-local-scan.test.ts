import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { consentControlAssessmentSchema, deriveConsentControlAssessment } from '@certscore/contracts';
import { createArtifactWriter } from '../packages/certscore-scan-core/src/artifact-writer';
import { publicNetworkGuardEnabled } from '../packages/certscore-scan-core/src/public-network-guard';
import { preConsentRuntimeScanner } from '../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner';
import { californiaCoverageFixture, CA_FIXTURE_URL } from '../apps/web/server/scans/california-review-coverage.fixture';
import { projectCaliforniaPrivacyReview } from '../apps/web/server/scans/california-privacy-review-projection';
import { redirectPublicationHarness } from '../apps/web/server/scans/redirect-publication.fixture';
import { reportRequestScanFixture } from '../apps/web/server/scans/report-forms.fixture';
import { buildMonth } from './audit-progress-month';
import { verifyMasterValueParity } from './lib/audit-master-parity';
import { renderProgressDashboard } from './lib/audit-progress-html';
import { PRIVACY_FORM_RECEIPT_FIELDS, PRIVACY_FORM_RECEIPT_VERSION } from './lib/audit-privacy-form-receipt';
import { assertCurrentPriorityExtraction, buildAuditDeltaQuery } from './lib/audit-delta-query';
import { auditSqlOverrideFits } from './lib/audit-prod-db-bounded';
import { MAC_MINI_SCAN_BOT_API_KEY_NAMES } from '../apps/web/lib/admin/mac-mini-scan-bot';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** The local SQL fixture uses an isolated cluster with no TCP listener. */
function runInventorySql(root: string, sql: string, snapshot: any, row: any, pendingRefreshIds: string[]) {
  const pgRoot = mkdtempSync(path.join(tmpdir(), 'cs-audit-pg-'));
  const data = path.join(pgRoot, 'data'), socket = pgRoot, port = '55432';
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PG')) delete env[key];
  const run = (command: string, args: string[], input?: string) => {
    const result = spawnSync(command, args, { input, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 2_000_000 });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
    return result.stdout;
  };
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const earlier = literal(new Date(Date.parse(row.created_at) - 3_600_000).toISOString());
  const pending = pendingRefreshIds.map((id, index) => ({
    scanId: literal(id),
    createdAt: index === 0 ? literal(row.created_at) : earlier,
    requestId: literal(`pulse_req_pending_${index}`),
  }));
  run('initdb', ['-D', data, '--no-locale', '--encoding=UTF8', '--auth=trust']);
  try {
    run('pg_ctl', ['-D', data, '-l', path.join(pgRoot, 'server.log'), '-o', `-h '' -k ${socket} -p ${port}`, '-w', 'start']);
    const setup = `
      create table domains(id uuid, hostname text);
      create table scans(id uuid, domain_id uuid, created_at timestamptz, updated_at timestamptz,
        status text, scan_config_json jsonb, activity_traffic jsonb);
      create table scan_pages(scan_id uuid, page_url text);
      create table pulse_requests(scan_id uuid, public_id text, requested_at timestamptz,
        requested_by jsonb, request_context jsonb, requested_url text, request_channel text, resolution_mode text);
      create table scan_requests (like pulse_requests including all);
      alter table scan_requests add fulfilled_by_scan_id uuid;
      create table integration_api_keys(public_id text, name text);
      create table scan_score_materialization_requests(scan_id uuid, status text);
      create table scan_snapshots(scan_id uuid, report_projection_source_hash text,
        report_projection_payload_sha256 text, report_projection_version text, report_projection_status text,
        report_projection_payload jsonb);
      insert into scans values(${literal(row.scanId)},null,${literal(row.created_at)},${literal(row.created_at)},'completed','{}','{}');
      insert into integration_api_keys values('fixture-key',${literal(MAC_MINI_SCAN_BOT_API_KEY_NAMES[0]!)});
      insert into pulse_requests values(${literal(row.scanId)},${literal(row.originalRequestId)},${literal(row.created_at)},
        '{"apiKeyId":"fixture-key"}','{}',${literal(CA_FIXTURE_URL)},'sdk','created_new_scan');
      insert into scan_snapshots values(${literal(row.scanId)},${literal(snapshot.report_projection_source_hash)},
        ${literal(snapshot.report_projection_payload_sha256)},${literal(snapshot.report_projection_version)},'ready',
        ${literal(JSON.stringify(snapshot.report_projection_payload))});
      insert into scans values ${pending.map(({ scanId, createdAt }) => `(${scanId},null,${createdAt},${createdAt},'running','{}','{}')`).join(',')};
      insert into pulse_requests values ${pending.map(({ scanId, requestId, createdAt }) =>
        `(${scanId},${requestId},${createdAt},'{"apiKeyId":"fixture-key"}','{}',${literal(CA_FIXTURE_URL)},'sdk','created_new_scan')`).join(',')};`;
    const args = ['-X', '-h', socket, '-p', port, '-d', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'];
    run('psql', args, setup);
    const query = 'begin transaction read only;\n' + sql + '\ncommit;\n';
    writeFileSync(path.join(root, 'fixture-delta-query.sql'), query, { flag: 'wx' });
    const rows = run('psql', args, query).trim().split('\n').map(line => JSON.parse(line));
    const expected = [row.scanId, ...pendingRefreshIds].sort();
    assert.deepEqual(rows.map(row => row.scanId).sort(), expected);
    assert.ok(rows.every(row => row.cohort_total === expected.length));
    assertCurrentPriorityExtraction(rows);
    return rows;
  } finally {
    spawnSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { env, timeout: 30_000 });
    rmSync(pgRoot, { recursive: true, force: true });
  }
}

test('launched offline scan feeds all seven receipt fields into an isolated daily dashboard', async () => {
  assert.equal(publicNetworkGuardEnabled(), false, 'This fixture relies on test-only interception before any DNS lookup');
  const output = process.env.CERTSCORE_AUDIT_FIXTURE_OUTPUT;
  const root = output ? path.resolve(output) : mkdtempSync(path.join(tmpdir(), 'certscore-privacy-form-scan-'));
  if (output) mkdirSync(root, { mode: 0o700 });
  const save = (name: string, value: unknown) => {
    const file = path.join(root, name), bytes = Buffer.from(JSON.stringify(value) + '\n');
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
    return { file, bytes: bytes.length, sha256: digest(bytes) };
  };
  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP * ~NOTFOUND', '--disable-background-networking', '--disable-quic'],
    proxy: { server: 'http://127.0.0.1:9' },
  });
  const fetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('Network fetch forbidden in local scan fixture'); };
  try {
    let blocked = 0;
    const interactions: string[] = [];
    const openContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await openContext({ ...options, serviceWorkers: 'block' });
      await context.route('**/*', async route => { blocked++; await route.abort('blockedbyclient'); });
      await context.exposeBinding('recordAuditFixtureInteraction', (_source, kind: string) => interactions.push(kind));
      await context.addInitScript(() => {
        const report = (window as unknown as { recordAuditFixtureInteraction: (kind: string) => void }).recordAuditFixtureInteraction;
        for (const kind of ['submit', 'input', 'change', 'click']) document.addEventListener(kind, () => report(kind), true);
        HTMLFormElement.prototype.submit = () => report('submit-method');
        HTMLFormElement.prototype.requestSubmit = () => report('request-submit-method');
      });
      return context;
    };
    const started = new Date();
    const createdAt = started.toISOString();
    const scanId = randomUUID();
    const runtime = await preConsentRuntimeScanner({
      url: CA_FIXTURE_URL, normalizedUrl: CA_FIXTURE_URL, scanStartedAtMs: started.getTime(),
      internalBudgetMs: 20_000, artifactWriter: await createArtifactWriter(path.join(root, 'runtime')),
      browser, captureScope: 'runtime_evidence', waitMode: 'fast', screenshotMode: 'never',
      formSnapshotReviewer: async () => ({ safeForDisplay: true }),
      routeFulfillers: [{
        urlPattern: /^https:\/\/california-fixture\.test\/$/, contentType: 'text/html',
        body: '<html lang="en"><head><title>Contact us</title></head><body><h1>Contact us</h1><p>Send a question about your account and we will respond.</p><form method="post" action="/never-submit"><label>Email<input type="email" value="synthetic-secret@example.test"></label><p>We collect email addresses to respond to your requests. <a href="/notice">Notice at Collection</a></p><button>Send</button></form><footer><a href="/policy">Privacy Policy</a></footer></body></html>',
      }],
    });
    assert.equal(runtime.moduleRun.status, 'completed', runtime.moduleRun.errors.join(', '));
    assert.deepEqual(interactions, []);
    const inventory = runtime.collectionSurfaceInventory;
    assert.ok(inventory);
    assert.equal(inventory.forms[0]?.actionRelationship, 'self');
    assert.equal(inventory.forms[0]?.fields[0]?.semanticCategory, 'email');

    // Only the runtime lane is launched. Policy documents and their provenance are deterministic fixtures.
    const fixture = californiaCoverageFixture();
    const completedAt = new Date().toISOString();
    Object.assign(fixture.bundle, { scanId, startedAt: createdAt, completedAt, collectionSurfaceInventory: inventory });
    fixture.bundle.policySurfaceInspection!.californiaReviewPolicy = 'california-privacy-review.v10';
    fixture.bundle.policySurfaceInspection!.privacyChoiceInspection!.capturedAt = completedAt;
    fixture.bundle.policySurfaceObservations.forEach(surface => { surface.documentLanguage = 'en'; });
    const bundle = save('bundle.json', fixture.bundle);
    const manifest = save('manifest.json', { scanId });
    const source = { verificationStatus: 'verified', sha256: bundle.sha256 };
    fixture.policyEvidence.projection.scanId = scanId;
    fixture.policyEvidence.projection.sourceBundle.sha256 = bundle.sha256;
    const california = projectCaliforniaPrivacyReview(fixture.bundle, source, CA_FIXTURE_URL, fixture.policyEvidence);
    assert.ok(california && 'rightsAssessment' in california && california.rightsAssessment);
    assert.ok('saleSharingAssessment' in california && california.saleSharingAssessment);
    const consent = deriveConsentControlAssessment({ scan: { scanId, finalUrl: CA_FIXTURE_URL } });
    consent.californiaPrivacyReview = california;
    const require = createRequire(import.meta.url);
    require.cache[require.resolve('server-only')] = { exports: {}, loaded: true } as NodeModule;
    const { deriveCollectionSurfaceAssessment } = await import('../apps/web/server/scans/local-v2-dag-report');
    const collectionSurfaceAssessment = deriveCollectionSurfaceAssessment({
      bundle: fixture.bundle, canonicalDocumentUrl: CA_FIXTURE_URL, scanId, assessedAt: completedAt,
    });
    const originalRequestId = 'pulse_req_local_fixture';
    const record = reportRequestScanFixture();
    Object.assign(record.scan, { id: scanId, createdAt, startedAt: createdAt, completedAt,
      domainHostname: 'california-fixture.test', requestedUrl: CA_FIXTURE_URL, scanConfigJson: { normalizedUrl: CA_FIXTURE_URL } });
    record.runtimeArtifacts = {
      consentControlAssessment: consentControlAssessmentSchema.parse(consent), collectionSurfaceAssessment,
      gdprNarrowPostureSource: { ...source, scanId, targetUrl: CA_FIXTURE_URL },
    };
    Object.assign(record, {
      signalEnrichmentWorkflow: { findingsReady: true, mergedSignalsReady: true },
      events: [{ id: 'local-result', createdAt: completedAt, eventType: 'v2_lambda_result.received', metadataJson: { artifactMetadata: {
        scanArtifactUri: { sha256: bundle.sha256, sizeBytes: bundle.bytes },
        manifestUri: { sha256: manifest.sha256, sizeBytes: manifest.bytes },
      } } }],
    });
    const localEnv = {
      NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/fixture', DATABASE_READ_URL: 'postgresql://localhost/fixture',
      NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3000', CERTSCORE_PRIVACY_FORM_FIXTURE_DIR: path.join(root, 'fixture-inbox'),
      CERTSCORE_AUDIT_PRIVACY_FORM_PROJECTION_ENABLED: '1',
    };
    const originalEnv = Object.fromEntries(Object.keys(localEnv).map(key => [key, process.env[key]]));
    const mainList = 'artifacts/daily-scan-audit/privacy-form-inputs.json';
    const readMainList = () => existsSync(mainList) ? readFileSync(mainList) : null;
    const mainBefore = readMainList();
    const harness = await redirectPublicationHarness();
    const list = path.join(localEnv.CERTSCORE_PRIVACY_FORM_FIXTURE_DIR, 'privacy-form-inputs.json');
    mkdirSync(localEnv.CERTSCORE_PRIVACY_FORM_FIXTURE_DIR, { mode: 0o700 });
    let snapshot: any;
    try {
      Object.assign(process.env, localEnv, { NODE_ENV: 'production' });
      harness.state.record = record;
      harness.state.localPrivacyFormOrigin = { original_request_id: originalRequestId, requested_url: CA_FIXTURE_URL,
        traffic_class: 'fixture', created_at: createdAt, report_projection_computed_at: completedAt };
      await harness.pipeline.persistScanReportProjection(record);
      const committed = harness.state.writes.find((write: { sql: string }) => write.sql.includes('insert into public.scan_snapshots'));
      assert.ok(committed);
      const params = committed.params;
      snapshot = {
        report_projection_status: 'ready', report_projection_computed_at: completedAt, report_projection_version: params[28],
        report_projection_source_hash: params[29], report_projection_payload: JSON.parse(params[37]),
        report_projection_payload_sha256: params[38], report_projection_payload_size_bytes: params[39],
      };
      save('snapshot.json', snapshot);
      Object.assign(record, { snapshot });
      assert.ok(snapshot.report_projection_payload.auditPrivacyForm);
      assert.equal(existsSync(list), false, 'Production skips local file writes');
      const report = harness.pipeline.readPersistedScanReportProjection(record);
      assert.ok(report);
      assert.equal(Object.hasOwn(report, 'auditPrivacyForm'), false);
      const publicReport = harness.pipeline.buildCanonicalReportExport(report);
      assert.ok(publicReport);
      assert.doesNotMatch(JSON.stringify(publicReport), /auditPrivacyForm|certscore.audit-privacy-form-projection/);
      Object.assign(process.env, { NODE_ENV: 'test' });
      await harness.pipeline.publishCanonicalScanReportProjection({ scanId, organizationId: null, publicationTrigger: 'authorized_worker' });
      const indexed = readFileSync(list);
      assert.equal(JSON.parse(indexed.toString()).length, 1);
      const retry = await harness.pipeline.publishCanonicalScanReportProjection({ scanId, organizationId: null, publicationTrigger: 'authorized_worker' });
      assert.equal(retry.reason, 'already_published');
      assert.equal(harness.state.localPrivacyFormLookups, 2);
      assert.deepEqual(readFileSync(list), indexed, 'Retry must reuse the original receipt');
      Object.assign(process.env, { NODE_ENV: 'production' });
      await harness.pipeline.publishCanonicalScanReportProjection({ scanId, organizationId: null, publicationTrigger: 'authorized_worker' });
      assert.equal(harness.state.localPrivacyFormLookups, 2, 'Production must skip the local handoff');
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) Reflect.deleteProperty(process.env, key);
        else process.env[key] = value;
      }
      await harness.close();
    }
    assert.deepEqual(readMainList(), mainBefore);
    const [receipt] = JSON.parse(readFileSync(list, 'utf8'));
    const { generation, projectionSourceHash, projectionPayloadSha256 } = receipt.binding;
    assert.doesNotMatch(readFileSync(receipt.file, 'utf8'), /synthetic-secret|California Privacy Notice/);
    const origin = { scanId, originalRequestId, isMacMini: true, isCanary: false, publicationRequestStatus: 'completed' };
    const origins = save('bot-origins.json', { version: 'certscore.audit-bot-origin.v1', readOnly: true, rows: [origin] });
    const standard = { scanId, scanStatus: 'completed', domain: 'california-fixture.test', timestamps: { createdAt },
      calibrationContext: { isSynthetic: true }, meta: { projectionVersion: 'pulse-public-v11', reportProjectionVersion: generation, reportProjectionSourceHash: projectionSourceHash } };
    mkdirSync(path.join(root, 'evidence'));
    const exportRef = save('evidence/' + scanId + '.json', standard);

    const start = new Date(started.getTime() - 60_000).toISOString();
    const end = new Date(Date.now() + 60_000).toISOString();
    const version = 'certscore.audit-choice-summary.v2';
    const syntheticRow = { ...origin, status: 'completed', created_at: createdAt, projection_status: 'ready',
      projection_version: generation, projection_payload_sha256: projectionPayloadSha256, projection_source_hash: projectionSourceHash,
      control_assessment: null, choice_audit: { version }, auditPrivacyForm: snapshot.report_projection_payload.auditPrivacyForm };
    const pendingRefreshIds = Array.from({ length: 100 }, (_, index) => {
      const hash = digest('pending-forward-' + index).slice(0, 32);
      return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
    });
    const sql = buildAuditDeltaQuery({ overlapStartUtc: start, windowEndUtc: end, pendingRefreshIds }, false, true);
    const launch = auditSqlOverrideFits({ marker: 'MACMINI_DELTA_IDS', readOnly: true, sql });
    assert.ok(launch.limitBytes - launch.bytes >= 256, JSON.stringify(launch));
    const executedLocalSql = process.env.CERTSCORE_AUDIT_FIXTURE_PG === '1';
    const inventoryRows = executedLocalSql ? runInventorySql(root, sql, snapshot, syntheticRow, pendingRefreshIds) : [syntheticRow];
    const delivered = inventoryRows.find(row => row.scanId === scanId);
    assert.ok(delivered);
    assert.equal(delivered.auditPrivacyForm, syntheticRow.auditPrivacyForm);
    assert.equal(delivered.originalRequestId, originalRequestId);
    const inventoryRef = save('delta-inventory.json', {
      version: 'certscore.mac-mini-direct-id-inventory.v1', readOnly: true, start, end, choiceAuditVersion: version,
      pendingRefreshIds, rows: inventoryRows,
    });
    const prior = save('prior.json', { windows: [{ runId: 'mac-mini-local-archive', start, end }], optOutExtracts: [] });
    const optOutInputsFile = path.join(root, 'opt-out-inputs.json');
    const prepared = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-audit-opt-out-inputs.ts',
      prior.file, inventoryRef.file, optOutInputsFile, save('empty-inbox.json', []).file], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(prepared.status, 0, prepared.stderr);
    const [inventoryReceipt] = JSON.parse(readFileSync(optOutInputsFile, 'utf8')).privacyFormReceipts;
    assert.equal(inventoryReceipt.delivery, 'delta_inventory');
    assert.equal(inventoryReceipt.sha256, receipt.sha256);

    // Check the normal monthly entry point excludes the explicitly synthetic export.
    mkdirSync(path.join(root, 'empty-sealed-run'));
    const frozen = save('empty-sealed-run/begin.json', { windowStartUtc: start, windowEndUtc: end });
    save('empty-sealed-run/pass-a-seal.json', frozen);
    save('empty-sealed-run/work-inventory-v2.json', []);
    save('empty-sealed-run/evidence-retrieval-receipts.json', []);
    const runs = save('runs.json', [{ path: path.join(root, 'empty-sealed-run') }]);
    save('cache-manifest.json', { version: 'certscore.mac-mini-evidence-cache.v1', sourceWrites: 0, start, end,
      receipts: [{ ...exportRef, state: 'copied', scanId }] });
    const normal = await buildMonth({ runsFile: runs.file, originsFile: origins.file, cacheRoot: root,
      out: path.join(root, 'normal-exclusion-check'), optOutInputsFile });
    assert.equal(normal.rows.length, 0);
    assert.equal(normal.errors.length, 0);
    assert.equal(normal.exclusionCounts.excluded_canary_or_test, 1);
    assert.deepEqual(normal.privacyFormReceipts, [inventoryReceipt]);
    const carriedFile = path.join(root, 'carried-opt-out-inputs.json');
    const carried = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prepare-audit-opt-out-inputs.ts',
      '--retained-only', path.join(root, 'normal-exclusion-check', 'dashboard.json'), carriedFile], {
      encoding: 'utf8', timeout: 20_000,
    });
    assert.equal(carried.status, 0, carried.stderr);
    assert.deepEqual(JSON.parse(readFileSync(carriedFile, 'utf8')).privacyFormReceipts, [inventoryReceipt]);

    // A separate local archive simulates the reportable path through the normal
    // builder. It never participates in the real or exclusion-check cache.
    const previewCache = path.join(root, 'fixture-preview-cache');
    mkdirSync(path.join(previewCache, 'evidence'), { recursive: true });
    const previewExport = save('fixture-preview-cache/evidence/' + scanId + '.json', {
      ...standard, domain: 'california-fixture.example', calibrationContext: undefined,
    });
    save('fixture-preview-cache/cache-manifest.json', { version: 'certscore.mac-mini-evidence-cache.v1',
      sourceWrites: 0, start, end, receipts: [{ ...previewExport, state: 'copied', scanId }] });
    const previewOrigins = save('fixture-preview-origins.json', { version: 'certscore.audit-bot-origin.v1', readOnly: true, rows: [] });
    const preview = await buildMonth({ runsFile: runs.file, originsFile: previewOrigins.file, cacheRoot: previewCache,
      out: path.join(root, 'isolated-preview-build'), optOutInputsFile });
    assert.equal(preview.errors.length, 0);
    assert.equal(preview.includedRows, 1);
    preview.cohort = 'CertScore.ai local scan fixture only. Excluded from daily totals.';
    assert.ok(preview.masterValueParity);
    assert.deepEqual(preview.masterValueParity.p2Coverage.compactReceipts, { matched: 1, referenced: 1 });
    assert.equal(preview.masterValueParity.p2Coverage.persistedSources.matchingScans, 0);
    assert.throws(() => verifyMasterValueParity({ ...preview, privacyFormReceipts: [{ ...inventoryReceipt, sha256: '0'.repeat(64) }] }), /immutable inventory delivery/);
    assert.throws(() => verifyMasterValueParity({ ...preview, privacyFormReceipts: [{ ...receipt, binding: { ...receipt.binding, projectionPayloadSha256: '0'.repeat(64) } }] }), /current ID/);
    const html = renderProgressDashboard(preview).replace('<main>', '<main><p><strong>LOCAL FIXTURE ONLY · excluded from daily audit totals</strong></p>');
    const dashboard = path.join(root, 'dashboard.html');
    writeFileSync(dashboard, html, { flag: 'wx' });
    save('dashboard.json', preview);
    const viewer = await openContext({ serviceWorkers: 'block' });
    const dashboardUrl = pathToFileURL(dashboard).href;
    await viewer.route('**/*', async route => {
      if (route.request().url() === dashboardUrl) await route.continue();
      else { blocked++; await route.abort('blockedbyclient'); }
    });
    const page = await viewer.newPage();
    await page.goto(dashboardUrl);
    await page.locator('#coverageComparison > summary').click();
    for (const id of PRIVACY_FORM_RECEIPT_FIELDS) {
      const field = preview.masterValueParity.p2Coverage.items.find(item => item.legacyId === id);
      assert.equal(field?.availableScans, 1, id);
      assert.equal(field.groups[0]?.schema, PRIVACY_FORM_RECEIPT_VERSION, id);
      const details = page.locator(`[data-matrix-item="${id}"] .p2-coverage`);
      assert.match(await details.locator(':scope > summary').textContent() ?? '', /1 \/ 1 scans/);
      await details.locator(':scope > summary').click();
      const group = details.locator('.p2-measurement-group');
      assert.match(await group.textContent() ?? '', /certscore.audit-privacy-form-receipt.v1/);
      if (id === 'collection.field.semantic_category') assert.match(await group.textContent() ?? '', /email: 1/);
      else if (id === 'collection.form.action_relationship') assert.match(await group.textContent() ?? '', /self: 1/);
      else assert.ok(await group.locator('.p2-assessment-values').count(), id);
    }
    await viewer.close();
    save('fixture-verification.json', { status: 'passed', scanId, runtime: runtime.moduleRun.status,
      launchedFixtureScans: 1, policySource: 'checked-in fixture', publicRequests: 0, blockedRequests: blocked,
      interactions: interactions.length, fixtureExcludedFromDailyTotals: true, receiptBytes: receipt.bytes,
      inventoryProjectionBytes: Buffer.byteLength(delivered.auditPrivacyForm), executedLocalSql, launch, productionQueries: 0,
      inventoryRows: inventoryRows.length, pendingIdsVerified: executedLocalSql ? pendingRefreshIds.length : 0,
      verifiedDashboardFields: PRIVACY_FORM_RECEIPT_FIELDS });
  } finally {
    globalThis.fetch = fetch;
    await browser.close();
    if (!output) rmSync(root, { recursive: true, force: true });
  }
});
