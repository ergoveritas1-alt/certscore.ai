import assert from 'node:assert/strict';
import test from 'node:test';
import { lightReviewActions } from './light-review-actions.js';

const scanId = '00000000-0000-4000-8000-000000000123';
const reportUrl = `https://certscore.ai/scan/${scanId}`;
const bundle = { scanId, reportUrl, status: 'completed', findings: [{ id: 'canonical-finding' }] };
const postureScores = { contractVersion: 'certscore.posture-scores.v1',
  gdprEprivacy: { posture: 'gdpr_eprivacy', score: 30, policyVersion: 'eu-version', coverage: 'scored', scope: 'starting_page' },
  ccpaCpra: { posture: 'ccpa_cpra', score: 81, policyVersion: 'ca-version', coverage: 'limited', scope: 'starting_page' } };

test('offers the exact returned report and one checklist without modifying findings', () => {
  const before = structuredClone(bundle);
  const actions = lightReviewActions(bundle)!;
  assert.deepEqual(bundle, before);
  assert.deepEqual(actions.openReport, { type: 'open_url', label: 'Open the full CertScore.ai report', url: reportUrl, createsScan: false });
  assert.deepEqual(actions.followUp, { type: 'prompt', label: 'Turn these findings into a developer checklist', context: 'returned_findings',
    prompt: 'certscore_remediation_checklist', arguments: { scanId }, createsScan: false, requiresUserRequest: true });
  assert.ok(Buffer.byteLength(JSON.stringify(actions)) < 1500);
});

test('does not invent, truncate or redirect report URLs', () => {
  for (const value of [undefined, '', 'invalid', reportUrl.replace('https:', 'http:'), reportUrl.replace('certscore.ai', 'certscore.ai.evil.test'),
    reportUrl.replace('https://', 'https://user:secret@'), reportUrl.replace(scanId, 'another-scan'), `${reportUrl}/other`, `${reportUrl}?${'x'.repeat(1024)}`]) {
    assert.equal(lightReviewActions({ ...bundle, reportUrl: value })?.openReport, undefined);
    assert.equal(lightReviewActions({ ...bundle, reportUrl: value })?.reportViews, undefined);
  }
  const shared = `${reportUrl}?share=returned-value#evidence`;
  assert.equal(lightReviewActions({ ...bundle, reportUrl: shared })?.openReport?.url, shared);
  assert.equal(lightReviewActions({ ...bundle, reportUrl: undefined, links: { report: reportUrl } })?.openReport?.url, reportUrl);
});

test('focus links preserve access and identity while scores retain their canonical posture and coverage', () => {
  const input = { ...bundle, reportUrl: `${reportUrl}?share=returned-value&reviewFocus=ccpa_cpra#evidence`,
    scanFrom: 'california', score: 30, postureScores };
  const before = structuredClone(input);
  const actions = lightReviewActions(input)!;
  assert.deepEqual(input, before);
  assert.equal(actions.openReport?.url, input.reportUrl);
  assert.equal(actions.reportViews?.length, 2);
  for (const [index, focus, score, coverage] of [[0, 'gdpr_eprivacy', 30, 'scored'], [1, 'ccpa_cpra', 81, 'limited']] as const) {
    const view = actions.reportViews![index]!;
    const url = new URL(view.url);
    assert.equal(url.origin, 'https://certscore.ai');
    assert.equal(url.pathname, `/scan/${scanId}`);
    assert.equal(url.searchParams.get('share'), 'returned-value');
    assert.deepEqual(url.searchParams.getAll('reviewFocus'), [focus]);
    assert.equal(url.hash, '#evidence');
    assert.equal(view.reviewFocus, focus);
    assert.equal(view.score, score);
    assert.equal(view.coverage, coverage);
    assert.equal(view.scope, 'starting_page');
    assert.equal(view.createsScan, false);
    assert.equal(view.type, 'open_url');
  }
});

test('focus navigation never fills missing or invalid posture scores from the overall score or region', () => {
  for (const scores of [undefined, { ...postureScores, contractVersion: 'unsupported' },
    { ...postureScores, ccpaCpra: { ...postureScores.ccpaCpra, score: 101 } },
    { ...postureScores, gdprEprivacy: { ...postureScores.gdprEprivacy, posture: 'ccpa_cpra' } }]) {
    const views = lightReviewActions({ ...bundle, score: 30, scanFrom: 'california', postureScores: scores })!.reportViews!;
    assert.equal(views.length, 2);
    assert.ok(views.every(view => !('score' in view) && !('coverage' in view)));
  }
  const views = lightReviewActions({ ...bundle, postureScores: { ...postureScores,
    ccpaCpra: { ...postureScores.ccpaCpra, score: null, coverage: 'unavailable' } } })!.reportViews!;
  assert.equal(views[0]!.score, 30);
  assert.equal(views[1]!.score, null);
  assert.equal(views[1]!.coverage, 'unavailable');
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
