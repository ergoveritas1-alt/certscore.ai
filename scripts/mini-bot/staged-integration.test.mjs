import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Explicitly requires a staged copy, never imports or starts the installed bot.
const stage = process.env.MINI_BOT_STAGE_DIR;
if (!stage) {
  test('mini bot ingestion regressions require an explicitly staged external checkout', { skip: 'Set MINI_BOT_STAGE_DIR to a patched bot copy.' }, () => {});
} else {
process.env.CERTSCORE_SCAN_TARGET = 'local';
process.env.CERTSCORE_API_KEY = 'local_test';
process.env.DATA_DIR ||= '/tmp/certscore-mini-bot-regressions';
globalThis.fetch = async () => { throw new Error('Live HTTP is forbidden in bot regression tests.'); };
const load = name => import(pathToFileURL(path.resolve(stage, name)).href);
const { scanDomain, Daemon } = await load('daemon.js');
const { ensureResultSchema, parseCertScoreResult } = await load('result_parser.js');
const { CertScoreApiError } = await load('node_modules/@certscore/sdk/dist/errors.js');

function scratchDb() {
  const sqlite = new DatabaseSync(':memory:');
  const columns = `domain rank scan_from paired_scan_id status score scan_id job_id submit_latency_ms submitted_at scanned_at bot_ingested_at
    analyzed_at tracker_count cookie_count request_count finding_count scan_time_seconds sdk_wall_seconds queued_seconds scanner_runtime_seconds
    details privacy_policy_captured cookie_policy_captured accept_control_seen reject_control_seen options_preferences_control_seen
    evidence_status evidence_error evidence_retrieved_at next_attempt_at error_type http_status api_error_code reconcile_attempts
    bot_total_seconds supporting_resource_seconds completed_to_ingested_seconds`.split(/\s+/);
  sqlite.exec(`CREATE TABLE scans (id INTEGER PRIMARY KEY, ${columns.map(name => `${name} ${name === 'reconcile_attempts' ? 'INTEGER DEFAULT 0' : 'TEXT'}`).join(', ')});`);
  const values = params => params.map(value => typeof value === 'boolean' ? Number(value) : value);
  return {
    async run(sql, params = []) { const result = sqlite.prepare(sql).run(...values(params)); return { changes: result.changes, lastID: result.lastInsertRowid }; },
    async get(sql, params = []) { return sqlite.prepare(sql).get(...values(params)); },
    async all(sql, params = []) { return sqlite.prepare(sql).all(...values(params)); },
    close() { sqlite.close(); },
  };
}

const scan = {
  scanId: '00000000-0000-4000-8000-000000000001', status: 'completed_limited', score: null,
  createdAt: '2026-10-09T23:00:00Z', startedAt: '2026-10-09T23:00:01Z', completedAt: '2026-10-09T23:00:20Z',
  resultDisposition: 'no_go', noGo: { reasonCode: 'blank_or_unusable_page' },
};
const unavailable = () => { throw new CertScoreApiError('Terminal evidence unavailable', { status: 409, code: 'scan_unavailable' }); };
const client = evidence => ({
  scans: { create: async () => scan, get: async () => scan, status: async () => scan,
    preConsentCookiesTrackers: async () => ({ summary: { trackerCount: 0, cookieCount: 0, requestCount: 0 } }) },
  findings: { list: async () => ({ findings: [] }) },
  pulse: { evidence },
});

test('initial terminal-unavailable ingestion retains canonical reason and never queues reconciliation', async () => {
  const db = scratchDb();
  try {
    await ensureResultSchema(db);
    const result = await scanDomain('example.test', 1, client(unavailable), db);
    const row = await db.get('SELECT * FROM scans');
    assert.equal(result.evidencePending, false);
    assert.equal(row.status, 'completed_limited');
    assert.equal(row.evidence_status, 'unavailable');
    assert.equal(row.error_type, 'evidence_unavailable');
    assert.equal(row.next_attempt_at, null);
    assert.equal(row.score, null);
    assert.equal(JSON.parse(row.details).scanResource.noGo.reasonCode, 'blank_or_unusable_page');
    assert.equal(parseCertScoreResult(row.details), null);
    assert.equal((await db.all('SELECT * FROM scan_result_derivatives')).length, 0);
    assert.notEqual(row.bot_total_seconds, null);
    let calls = 0;
    await Daemon.prototype.reconcilePending.call({ db, dataDir: process.env.DATA_DIR, certscore: { scans: { status() { calls++; } } } });
    assert.equal(calls, 0);
  } finally { db.close(); }
});

test('temporary evidence on completed_limited remains eligible, then terminal 409 retires it', async () => {
  const db = scratchDb();
  try {
    await ensureResultSchema(db);
    await db.run(`INSERT INTO scans (id, domain, scan_from, scan_id, status, evidence_status) VALUES (1, 'example.test', 'eu_ie', ?, 'completed_limited', 'pending')`, [scan.scanId]);
    let calls = 0;
    const api = client(() => { calls++; return unavailable(); });
    await Daemon.prototype.reconcilePending.call({ db, dataDir: process.env.DATA_DIR, certscore: api });
    let row = await db.get('SELECT * FROM scans');
    assert.equal(calls, 1);
    assert.equal(row.evidence_status, 'unavailable');
    assert.equal(row.next_attempt_at, null);
    assert.equal(JSON.parse(row.details).scanResource.noGo.reasonCode, 'blank_or_unusable_page');
    assert.equal((await db.all('SELECT * FROM scan_result_derivatives')).length, 0);
    await Daemon.prototype.reconcilePending.call({ db, dataDir: process.env.DATA_DIR, certscore: api });
    assert.equal(calls, 1);
  } finally { db.close(); }
});

test('retained no-go payload and distinct privacy/cookie rows persist through both ingestion paths', async () => {
  const db = scratchDb();
  const payload = { resultDisposition: 'no_go', noGo: scan.noGo, gdprEprivacyChecklistRows: { items: [
    { id: 'privacy_notice_availability', status: 'Not observed' },
    { id: 'cookie_notice_policy_availability', status: 'Observed' },
  ] } };
  try {
    await ensureResultSchema(db);
    await scanDomain('example.test', 1, client(async () => payload), db);
    let row = await db.get('SELECT * FROM scans');
    assert.equal(row.privacy_policy_captured, 'Not observed');
    assert.equal(row.cookie_policy_captured, 'Observed');
    assert.equal(row.evidence_status, 'retained');
    const derived = await db.get('SELECT * FROM scan_result_derivatives');
    assert.equal(derived.privacy_policy_status, 'Not observed');
    assert.equal(derived.cookie_policy_status, 'Observed');
    await db.run("UPDATE scans SET evidence_status = 'pending', privacy_policy_captured = 'Incorrect old cookie status'");
    await Daemon.prototype.reconcilePending.call({ db, dataDir: process.env.DATA_DIR, certscore: client(async () => ({ ...payload, gdprEprivacyChecklistRows: { items: payload.gdprEprivacyChecklistRows.items.slice(1) } })) });
    row = await db.get('SELECT * FROM scans');
    assert.equal(row.privacy_policy_captured, null);
    assert.equal(row.cookie_policy_captured, 'Observed');
    assert.equal(row.evidence_status, 'retained');
    assert.equal((await db.get('SELECT * FROM scan_result_derivatives')).privacy_policy_status, null);
  } finally { db.close(); }
});

test('canonical choice execution drives both action derivatives independently of registration', () => {
  const execution = { policyVersion: 'choice_path_execution.v1', status: 'succeeded', clickCompleted: true, observationCompleted: true, consentConfirmed: false };
  for (const [key, prefix] of [['postAcceptObservation', 'accept'], ['postRefusalObservation', 'reject']]) {
    const result = parseCertScoreResult({ [key]: { status: 'unconfirmed', execution } });
    assert.equal(result[`${prefix}_click_completed`], 1);
    assert.equal(result[`${prefix}_capture_status`], 'complete');
    assert.equal(result[`${prefix}_registration_verified`], 0);
    const invalid = parseCertScoreResult({ [key]: { status: 'confirmed_clean', execution: { ...execution, observationCompleted: false },
      afterAction: { activationStatus: 'completed' } } });
    assert.equal(invalid[`${prefix}_click_completed`], null);
    assert.equal(invalid[`${prefix}_registration_verified`], null);
  }
});

}
