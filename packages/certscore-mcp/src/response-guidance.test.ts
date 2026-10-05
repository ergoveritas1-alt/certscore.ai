import assert from 'node:assert/strict';
import test from 'node:test';
import { withResponseGuidance } from './response-guidance.js';
const result = (structuredContent: Record<string, unknown>) => ({ structuredContent, content: [{ type: 'text' as const, text: 'Original evidence' }] });
const guide = (tool: string, payload: Record<string, unknown>) => withResponseGuidance(tool, {}, result(payload), Date.parse('2026-09-12T12:00:00Z'));
const metadata = (r: ReturnType<typeof guide>) => r._meta!['ai.certscore/responseGuidance'] as any;
test('preserves success schema and original evidence, with honest missing metadata', () => {
  const payload = { scanId: 'abc', status: 'completed', completedAt: '2026-09-12T11:00:00Z' };
  const r = guide('certscore_get_scan_status', payload), g = metadata(r);
  assert.equal(r.structuredContent, payload);
  assert.deepEqual(r.content[0], result(payload).content[0]);
  assert.equal(g.ageSeconds, 3600);
  assert.equal(g.scanFrom, null);
  assert.equal(g.quotaConsumed, null);
  assert.equal(g.nextAction.tool, 'certscore_get_scan_bundle');
});
test('queued, terminal failure and no-go never recommend fetching a completed bundle', () => {
  for (const status of ['queued', 'failed', 'no_go']) {
    const g = metadata(guide('certscore_get_scan_status', { scanId: 'abc', status }));
    assert.equal(g.nextAction.tool, status === 'queued' ? 'certscore_get_scan_status' : null);
  }
});
test('pagination advances and ends without an extra call', () => {
  const page = { scanId: 'abc', pagination: { offset: 5, returned: 5, limit: 5, total: 13, truncated: true } };
  assert.equal(metadata(guide('certscore_list_findings', page)).nextAction.arguments.offset, 10);
  page.pagination.truncated = false;
  assert.equal(metadata(guide('certscore_list_findings', page)).pagination.nextOffset, null);
});

test('focused report continuation keeps the section selector and stops at completion', () => {
  const payload = { scanId: 'retained', section: 'gpc', pagination: { complete: false, nextCursor: 'cursor' } };
  assert.deepEqual(metadata(guide('certscore_get_report_evidence_page', payload)).nextAction.arguments, { scanId: 'retained', cursor: 'cursor', section: 'gpc' });
  assert.equal(metadata(guide('certscore_get_report_evidence_page', { ...payload, pagination: { complete: true, nextCursor: null } })).nextAction.tool, null);
});
test('domain lookup uses retained nested identity and never invents scan age', () => {
  const g = metadata(guide('certscore_get_latest_domain_scan', { scan: { scanId: 'retained', status: 'completed', completedAt: 'invalid' } }));
  assert.equal(g.scanId, 'retained'); assert.equal(g.ageSeconds, null); assert.equal(g.creationDecision, 'not_requested');
  assert.equal(metadata(guide('certscore_get_latest_domain_scan', { scan: null })).nextAction.tool, 'certscore_scan_site');
});
test('tool errors stay untouched for output-schema compatibility', () => {
  const error = { isError: true, content: [{ type: 'text' as const, text: 'error' }] };
  assert.equal(withResponseGuidance('certscore_scan_site', {}, error), error);
});
test('completed-limited no-go takes precedence over bundle guidance and future timestamps stay unknown', () => {
  const g = metadata(guide('certscore_get_scan_status', { scanId: 'abc', status: 'completed_limited', resultDisposition: 'no_go', completedAt: '2099-01-01T00:00:00Z' }));
  assert.equal(g.nextAction.tool, null); assert.equal(g.ageSeconds, null);
});
test('finding explanation text is bounded without changing retained structured evidence', () => {
  const payload = { id: 'finding', plainEnglish: 'x'.repeat(50000), nextStep: 'Review the retained evidence.' };
  const r = guide('certscore_explain_finding', payload);
  assert.equal(r.structuredContent, payload);
  assert.ok(r.content.every(item => item.type !== 'text' || item.text.length < 8000));
});
test('guidance carries canonical risk and actual quota without changing unknowns', () => {
  const g = metadata(guide('certscore_scan_site', { riskLevel: 'monitor', quotaConsumed: false }));
  assert.equal(g.risk, 'monitor'); assert.equal(g.quotaConsumed, false);
  assert.equal(metadata(guide('certscore_scan_site', { quotaConsumed: true })).quotaConsumed, true);
  assert.equal(metadata(guide('certscore_scan_site', { quotaConsumed: 'true' })).quotaConsumed, null);
});
test('nested no-go domain results never recommend the bundle workflow', () => {
  const g = metadata(guide('certscore_get_latest_domain_scan', { scan: { scanId: 'abc', status: 'completed_limited', resultDisposition: 'no_go' } }));
  assert.equal(g.nextAction.tool, null);
});
test('all fourteen tools carry a concrete purpose for tool selection', async () => {
  const { certScoreMcpToolContracts } = await import('@certscore/api-contracts');
  assert.equal(certScoreMcpToolContracts.length, 14);
  for (const contract of certScoreMcpToolContracts) {
    const g = metadata(guide(contract.name, { scanId: 'abc' }));
    assert.ok(g.purpose?.length > 20, contract.name);
  }
});
test('bundle guidance counts the returned nested inventory rows', () => {
  assert.equal(metadata(guide('certscore_get_scan_bundle', { preConsentCookiesTrackers: { rows: [{}, {}] } })).returnedRows, 2);
});


test('follow-ups reference actual returned IDs and remain optional',()=>{
 const g=metadata(guide('certscore_get_scan_bundle',{scanId:'abc',status:'completed',findings:[{id:'retained-finding'}]}));
 assert.equal(g.optionalFollowUps[0].arguments.findingId,'retained-finding');
 const empty=metadata(guide('certscore_get_scan_bundle',{scanId:'abc',status:'completed',findings:[]}));
 assert.deepEqual(empty.optionalFollowUps,[]);
 const active=metadata(guide('certscore_get_scan_status',{scanId:'abc',status:'running',findings:[{id:'not-final'}]}));
 assert.deepEqual(active.optionalFollowUps,[]);
});

test('routine guidance text stays under 800 bytes while full metadata remains available',()=>{
 const result=guide('certscore_get_scan_status',{scanId:'00000000-0000-4000-8000-000000000123',status:'running'});
 const text=result.content.at(-1); assert.equal(text?.type,'text');
 assert.ok(Buffer.byteLength(text!.text as string)<800);
 assert.ok(metadata(result).purpose);
});

test('Light follow-ups are callable and stay within retained evidence, including status responses', () => {
  const light = (tool: string, payload: Record<string, unknown>) => withResponseGuidance(tool, {}, result(payload), undefined, { toolProfile: 'light' });
  const bundle = light('certscore_get_scan_bundle', { scanId: 'retained', status: 'completed', findings: [{ id: 'finding' }], gpcResponse: {} });
  const g = metadata(bundle);
  assert.equal(g.optionalFollowUps.length, 2);
  assert.ok(g.optionalFollowUps.every((action: any) => action.tool === 'certscore_get_report_evidence_page' && action.arguments.scanId === 'retained' && action.createsScan === false));
  assert.match((bundle.content.at(-1) as any).text, /optionalFollowUps/);
  for (const tool of ['certscore_scan_site', 'certscore_get_scan_status']) {
    assert.deepEqual(metadata(light(tool, { scanId: 'retained', status: 'completed', topFindings: [{ id: 'finding' }] })).optionalFollowUps, []);
  }
  for (const state of [{ status: 'failed' }, { status: 'completed_limited', resultDisposition: 'no_go' }]) {
    assert.deepEqual(metadata(light('certscore_get_scan_bundle', { scanId: 'retained', findings: [{ id: 'finding' }], ...state })).optionalFollowUps, []);
  }
});
