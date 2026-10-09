import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceState, checklistSummary, supportingResources, ingestionTiming } from './result-handling.mjs';

test('initial and reconciled terminal 409s never schedule evidence polling', () => {
  for (const attempts of [0, 1, 3]) {
    const state = evidenceState({ error: 'Scan unavailable', classification: {
      httpStatus: 409, apiErrorCode: 'scan_unavailable', errorType: 'api_error'
    }, attempts });
    assert.equal(state.status, 'unavailable');
    assert.equal(state.errorType, 'evidence_unavailable');
    assert.equal(state.nextAttemptAt, null);
    assert.equal(state.terminal, true);
  }
});

test('temporary errors retain bounded reconciliation; retained no-go evidence is not an error', () => {
  const classification = { httpStatus: 503, apiErrorCode: 'internal_error', errorType: 'api_error_transient' };
  const pending = evidenceState({ error: 'Temporary', classification, now: 0 });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.nextAttemptAt, '1970-01-01T00:00:30.000Z');
  assert.equal(evidenceState({ error: 'Temporary', classification, attempts: 3 }).errorType, 'evidence_retry_exhausted');
  const retained = evidenceState({ payload: { resultDisposition: 'no_go', noGo: { reasonCode: 'blank_or_unusable_page' } } });
  assert.equal(retained.status, 'retained');
  assert.equal(retained.nextAttemptAt, null);
  assert.equal(retained.errorType, null);
  assert.equal(evidenceState({ error: 'Other conflict', classification: { httpStatus: 409, apiErrorCode: 'other' } }).terminal, false);
});

test('privacy and cookie-policy statuses are independent canonical checklist rows', () => {
  const payload = { gdprEprivacyChecklistRows: { items: [
    { id: 'cookie_notice_policy_availability', status: 'Observed' },
    { id: 'privacy_notice_availability', status: 'Not observed' },
    { id: 'accept_consent_control', status: 'Observed' },
  ] } };
  assert.equal(checklistSummary(payload).privacyPolicyCaptured, 'Not observed');
  assert.equal(checklistSummary(payload).cookiePolicyCaptured, 'Observed');
  assert.equal(checklistSummary(payload).acceptControlSeen, 'Observed');
  assert.equal(checklistSummary({}).privacyPolicyCaptured, null);
  assert.equal(checklistSummary({ gdprEprivacyChecklistRows: { items: payload.gdprEprivacyChecklistRows.items.slice(0, 1) } }).privacyPolicyCaptured, null);
});

test('supporting reads overlap and retain partial success without adding requests', async () => {
  const started = [];
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const work = supportingResources({
    findings: async () => { started.push('findings'); await barrier; return [1]; },
    resources: async () => { started.push('resources'); await barrier; throw new Error('Unavailable'); },
    evidence: async () => { started.push('evidence'); await barrier; return { score: 85 }; },
  });
  await Promise.resolve();
  assert.deepEqual(started, ['findings', 'resources', 'evidence']);
  release();
  const result = await work;
  assert.deepEqual(result.findings, { status: 'fulfilled', value: [1] });
  assert.equal(result.resources.status, 'rejected');
  assert.deepEqual(result.evidence.value, { score: 85 });
});

test('end-to-end ingestion time includes supporting reads and is distinct from scan runtime', () => {
  assert.deepEqual(ingestionTiming({ submittedAt: '1970-01-01T00:00:00Z', completedAt: '1970-01-01T00:00:31Z', supportingStartedAt: 50000, now: 60000 }), {
    botTotalSeconds: 60, supportingResourceSeconds: 10, completedToIngestedSeconds: 29,
  });
  assert.equal(ingestionTiming({ now: 0 }).botTotalSeconds, null);
});
