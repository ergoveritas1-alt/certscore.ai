import assert from 'node:assert/strict';
import test from 'node:test';
import { bundleReviewNavigation, LIGHT_TOOL_NAMES } from './review-navigation.js';

const scanId = '00000000-0000-4000-8000-000000000123';
test('review navigation preserves retained identity and describes delivery without inventing evidence', () => {
  const bundle = {
    scanId, status: 'completed_limited', url: 'https://example.com/', scanFrom: 'eu_ie',
    completedAt: '2026-10-01T12:00:00Z', reportUrl: 'https://certscore.ai/scan/' + scanId,
    findings: [{ id: 'retained-finding' }], findingsMetadata: { returned: 1, total: 5 },
    preConsentCookiesTrackers: { rows: [], returned: 0, total: 8 },
    transportSecurity: { evidenceRetained: false },
    mcpMetadata: { omittedSections: ['privacyAuditSummary', 'fullReport'] },
  };
  const original = structuredClone(bundle);
  const navigation = bundleReviewNavigation(bundle)!;
  assert.deepEqual(bundle, original);
  assert.deepEqual(navigation.baseline, {
    scanId, url: bundle.url, scanFrom: bundle.scanFrom, completedAt: bundle.completedAt, reportUrl: bundle.reportUrl,
  });
  const byKey = new Map(navigation.evidenceIndex.map(row => [row.key, row]));
  assert.equal(byKey.get('findings')?.total, 5);
  assert.equal(byKey.get('tracking')?.delivery, 'included');
  assert.equal(byKey.get('tracking')?.returned, 0);
  assert.equal(byKey.get('privacy')?.delivery, 'omitted');
  assert.equal(byKey.get('accept')?.delivery, 'not_returned');
  assert.equal(byKey.get('transport')?.delivery, 'included');
  assert.equal(bundle.transportSecurity.evidenceRetained, false);
  assert.deepEqual(byKey.get('gpc')?.retrieval?.arguments, { scanId, section: 'gpc' });
  assert.equal(byKey.get('transport')?.retrieval?.createsScan, false);
  for (const action of navigation.nextActions) {
    assert.ok((LIGHT_TOOL_NAMES as readonly string[]).includes(action.tool));
    assert.equal(action.arguments.scanId, scanId);
    assert.equal(action.createsScan, false);
  }
  assert.equal(navigation.nextActions[0]?.arguments.workpaper, 'tracking');
  assert.match(navigation.optionalReview, /missing later findings as verified fixes/);
});

test('no-go, active, failed and unidentified bundles have no review navigation', () => {
  for (const status of ['queued', 'running', 'finalizing', 'failed', 'cancelled', 'expired', 'no_go']) {
    assert.equal(bundleReviewNavigation({ scanId, status, findings: [{ id: 'preview' }] }), null);
  }
  assert.equal(bundleReviewNavigation({ scanId, status: 'completed_limited', resultDisposition: 'no_go' }), null);
  assert.equal(bundleReviewNavigation({ status: 'completed' }), null);
});

test('zero-findings navigation offers retained evidence without inventing remediation or a new scan', () => {
  const navigation = bundleReviewNavigation({ scanId, status: 'completed', findings: [] })!;
  assert.equal(navigation.baseline.scanFrom, null);
  assert.equal(navigation.baseline.completedAt, null);
  assert.equal(navigation.nextActions.length, 1);
  assert.equal(navigation.nextActions[0]?.tool, 'certscore_get_report_evidence_page');
  assert.doesNotMatch(navigation.optionalReview, /remediation checklist/);
});
