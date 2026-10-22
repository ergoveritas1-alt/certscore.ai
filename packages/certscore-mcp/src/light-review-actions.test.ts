import assert from 'node:assert/strict';
import test from 'node:test';
import { lightReviewActions } from './light-review-actions.js';

const scanId = '00000000-0000-4000-8000-000000000123';
const reportUrl = `https://certscore.ai/scan/${scanId}`;
const bundle = { scanId, reportUrl, status: 'completed', findings: [{ id: 'canonical-finding' }] };

test('offers the exact returned report and one checklist without modifying findings', () => {
  const before = structuredClone(bundle);
  const actions = lightReviewActions(bundle)!;
  assert.deepEqual(bundle, before);
  assert.deepEqual(actions.openReport, { type: 'open_url', label: 'Open the full CertScore.ai report', url: reportUrl, createsScan: false });
  assert.deepEqual(actions.followUp, { type: 'prompt', label: 'Turn these findings into a developer checklist', context: 'returned_findings',
    prompt: 'certscore_remediation_checklist', arguments: { scanId }, createsScan: false, requiresUserRequest: true });
  assert.ok(Buffer.byteLength(JSON.stringify(actions)) < 800);
});

test('does not invent, truncate or redirect report URLs', () => {
  for (const value of [undefined, '', 'invalid', reportUrl.replace('https:', 'http:'), reportUrl.replace('certscore.ai', 'certscore.ai.evil.test'),
    reportUrl.replace('https://', 'https://user:secret@'), reportUrl.replace(scanId, 'another-scan'), `${reportUrl}/other`, `${reportUrl}?${'x'.repeat(1024)}`]) {
    assert.equal(lightReviewActions({ ...bundle, reportUrl: value })?.openReport, undefined);
  }
  const shared = `${reportUrl}?share=returned-value#evidence`;
  assert.equal(lightReviewActions({ ...bundle, reportUrl: shared })?.openReport?.url, shared);
  assert.equal(lightReviewActions({ ...bundle, reportUrl: undefined, links: { report: reportUrl } })?.openReport?.url, reportUrl);
});

test('selects context from returned canonical delivery and retains the original scan', () => {
  const cases = [
    { payload: { findingsMetadata: { truncated: true } }, context: 'more_findings' },
    { payload: { mcpMetadata: { canonicalFindingsComplete: false } }, context: 'more_findings' },
    { payload: { findings: [], preConsentCookiesTrackers: { total: 3 } }, context: 'tracking_inventory' },
    { payload: { findings: [], status: 'completed_limited' }, context: 'limited_coverage' },
  ];
  for (const { payload, context } of cases) {
    const action = lightReviewActions({ ...bundle, ...payload })!.followUp;
    assert.equal(action.context, context);
    assert.equal(action.tool, 'certscore_get_report_evidence_page');
    assert.equal(action.arguments?.scanId, scanId);
    assert.equal(action.createsScan, false);
    assert.equal(action.requiresUserRequest, true);
    assert.equal(action.arguments?.workpaper, context === 'tracking_inventory' ? 'tracking' : undefined);
  }
});

test('future rechecks are offers with no executable scan call or invented fix claim', () => {
  for (const payload of [{ findings: [] }, { findings: [], detail: 'full', preConsentCookiesTrackers: { total: 2 } }]) {
    const action = lightReviewActions({ ...bundle, ...payload })!.followUp;
    assert.equal(action.type, 'offer');
    assert.equal(action.context, 'future_change');
    assert.equal(action.createsScan, true);
    assert.equal(action.requiresUserRequest, true);
    assert.equal(action.tool, undefined);
    assert.equal(action.arguments, undefined);
    assert.doesNotMatch(action.label, /clean|compliant|fix verified/i);
  }
});

test('active, failed, unknown, no-go and unidentified results have no review actions', () => {
  for (const status of ['queued', 'running', 'finalizing', 'failed', 'expired', 'cancelled', 'unknown', undefined]) {
    assert.equal(lightReviewActions({ ...bundle, status }), null);
  }
  assert.equal(lightReviewActions({ ...bundle, status: 'completed_limited', resultDisposition: 'no_go' }), null);
  for (const id of [undefined, '', 'bad/id', 'x'.repeat(129)]) assert.equal(lightReviewActions({ ...bundle, scanId: id }), null);
});
