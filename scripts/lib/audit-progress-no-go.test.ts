import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NO_GO_METRICS, NO_GO_TOTAL_METRIC, readAuditNoGoReasons } from './audit-progress-no-go';
import { progressEngine } from './audit-progress-engine';

test('no-go breakdown requires the original export and keeps explicit unknown separate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'audit-no-go-'));
  try {
    const scanId = '00000000-0000-4000-8000-000000000001';
    const createdAt = '2026-11-16T13:00:00.000Z';
    const file = join(directory, 'export.json');
    function fixture(noGo?: { reasonCode: string }) {
      const bytes = JSON.stringify({ scanId, timestamps: { createdAt }, resultDisposition: 'no_go', noGo });
      writeFileSync(file, bytes);
      return { scanId, createdAt, states: { outcome: 'no_go' }, refs: [{
        file, sha256: createHash('sha256').update(bytes).digest('hex'), role: 'hash_verified_bot_archive_export',
      }] };
    }
    const access = fixture({ reasonCode: 'access_denied_or_forbidden_page' });
    assert.deepEqual(readAuditNoGoReasons([access]), { [scanId]: 'access_denied_or_forbidden_page' });
    assert.deepEqual(readAuditNoGoReasons([{ ...access, states: { outcome: 'failed_or_expired' } }]), {});
    assert.deepEqual(readAuditNoGoReasons([{ ...access, originProof: 'production_id_selection_only' }]), {});
    assert.deepEqual(readAuditNoGoReasons([{ ...access, refs: [] }]), {});
    assert.throws(() => readAuditNoGoReasons([{ ...access, createdAt: '2026-11-16T13:00:00.001Z' }]), /timestamp/);
    assert.deepEqual(readAuditNoGoReasons([fixture({ reasonCode: 'unknown' })]), { [scanId]: 'unknown' });
    assert.deepEqual(readAuditNoGoReasons([fixture()]), {});
    assert.deepEqual(readAuditNoGoReasons([fixture({ reasonCode: 'unreviewed_code' })]), {});
    assert.throws(() => readAuditNoGoReasons([access]), /hash or size mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('daily no-go reason rates use only retained no-gos and preserve missing reason evidence', () => {
  const metrics = NO_GO_METRICS;
  const row = (scanId: string, outcome: string, day = '16', originProof?: string) => ({
    scanId, createdAt: `2026-11-${day}T13:00:00Z`, states: { outcome }, originProof,
  });
  const rows = [
    row('known', 'no_go'), row('unknown', 'no_go'), row('missing', 'no_go'),
    row('report', 'usable_complete'), row('failed', 'failed_or_expired'),
    row('id-only', 'no_go', '16', 'production_id_selection_only'),
    row('missing-tomorrow', 'no_go', '17'), row('report-next', 'usable_complete', '18'),
  ];
  const reasons = { known: 'captcha_or_challenge', unknown: 'unknown' };
  const days = ['16', '17', '18', '19'].map(day => ({ date: '2026-11-' + day, completeDay: false }));
  const data = { metrics, days, noGoReasons: reasons, findingIds: [] };
  const output = progressEngine().aggregate(data, rows);
  const metric = 'outcome.no_go_reason.captcha_or_challenge';
  assert.equal(output[0]!.attempts, 6);
  assert.deepEqual(output[0]!.metrics[metric].counts, { recorded: 1, other_reason: 1, unavailable: 1 });
  assert.equal(output[0]!.metrics[metric].rate, 100 / 3);
  assert.equal(output[0]!.metrics['outcome.no_go_reason.unavailable'].numerator, 1);
  assert.equal(output[1]!.metrics[metric].rate, null);
  assert.equal(output[1]!.metrics['outcome.no_go_reason.unavailable'].rate, 100);
  assert.equal(output[2]!.metrics[metric].denominator, 0);
  assert.equal(output[3]!.attempts, 0);
  const total = NO_GO_TOTAL_METRIC.id;
  assert.deepEqual(output.map(day => {
    const { numerator, denominator, rate } = day.metrics[total];
    return [numerator, denominator, rate];
  }), [[3, 6, 50], [1, 1, 100], [0, 1, 0], [0, 0, null]]);
  assert.equal(output[0]!.metrics[total].series['retained_attempt_outcome/v1'].numerator, 3);
  assert.match(progressEngine().stateCsv(output, metrics), /"outcome.no_go_reason.captcha_or_challenge","retained_public_no_go_reason\/v1","recorded","1","3"/);
});
