import assert from "node:assert/strict";
import test from "node:test";
import { pairedGpcAudit } from "./audit-progress-gpc";
import { buildGpcActivityComparison } from "../../packages/certscore-scan-core/src/gpc-activity-comparison";
import { buildGpcProductionObservation } from "../../packages/certscore-scan-core/src/gpc-production-observation";
import { collectionPairFixture, collectionFixtureSource } from "../../packages/certscore-scan-core/src/test-fixtures/gpc-collection-pair.cases";
function fixture(atMs = 500) {
  const p = collectionPairFixture(undefined, undefined, atMs), baseline = collectionFixtureSource(p.baseline), gpc = collectionFixtureSource(p.gpc);
  const observation = buildGpcProductionObservation({ scanId: p.gpc.scanId, source: gpc });
  return { scanId: p.gpc.scanId, gpcResponse: { contractVersion: "certscore.gpc-response-assessment.v3", activityComparison: buildGpcActivityComparison({ scanId: p.gpc.scanId, baseline, gpc, observation }),
    comparison: { baselineArtifact: baseline.pointer, gpcArtifact: gpc.pointer },
    observation } };
}
test("daily GPC audit measures paired requests, duration and positive samples without GPP", () => {
  const r = fixture(), a = pairedGpcAudit(r);
  assert.equal(a.states['detail.gpc.paired_pair'], 'measured');
  assert.equal(a.states['detail.gpc.paired_collection'], 'retained_samples');
  assert.equal(a.measurements['gpc.paired.duration_ms'], 5000);
  assert.equal(a.measurements['gpc.paired.baseline.collection_sample'], 1);
  assert.equal(a.measurements['gpc.paired.gpc.identified_sample'], 1);
  assert.match(a.scope, /window_5000ms/);
});
test("missing/invalid source pairs stay in unknown counts and never create numeric zeroes", () => {
  assert.deepEqual(pairedGpcAudit({}).measurements, {});
  for (const mutate of [
    (r: ReturnType<typeof fixture>) => { r.scanId = 'wrong'; },
    (r: ReturnType<typeof fixture>) => { r.gpcResponse.comparison.baselineArtifact.sha256 = '0'.repeat(64); },
  ]) { const r = fixture(); mutate(r); const a = pairedGpcAudit(r); assert.equal(a.states['detail.gpc.paired_pair'], 'invalid_or_unbound'); assert.equal(a.measurements['gpc.paired.duration_ms'], undefined); }
});
test("legacy comparison and conflicting collection packet preserve independent request facts", () => {
  const r = fixture(); delete r.gpcResponse.activityComparison!.collectionComparison;
  let a = pairedGpcAudit(r); assert.equal(a.states['detail.gpc.paired_pair'], 'measured');
  assert.equal(a.states['detail.gpc.paired_collection'], 'unavailable'); assert.equal(a.measurements['gpc.paired.gpc.collection_sample'], undefined);
  const changed = fixture(); changed.gpcResponse.activityComparison!.collectionComparison!.gpc.rows[0]!.label = 'Tampered';
  a = pairedGpcAudit(changed); assert.equal(a.states['detail.gpc.paired_pair'], 'measured');
  assert.equal(a.states['detail.gpc.paired_collection'], 'invalid_or_unbound');
  assert.equal(a.measurements['gpc.paired.gpc.advertising_requests'], 1); assert.equal(a.measurements['gpc.paired.gpc.collection_sample'], undefined);
});

test("daily request quantities keep different verified window series separate", async () => {
  const { progressEngine } = await import("./audit-progress-engine");
  const rows = [1000, 5000].map(ms => ({ scanId: String(ms), site: "fixture.test", createdAt: "2026-11-02T20:00:00Z", reportable: true,
    states: {}, measurements: { "gpc.paired.gpc.advertising_requests": 1 }, findings: [],
    metricSources: { "gpc.paired.gpc.advertising_requests": `public_export/pulse-public-v11/scan-report-projection-v27/window_${ms}ms` } }));
  const days = progressEngine().aggregate({ days: [{ date: "2026-11-02", completeDay: true }], metrics: [], quantities: [{ id: "gpc.paired.gpc.advertising_requests" }] }, rows);
  const q = days[0].quantities["gpc.paired.gpc.advertising_requests"];
  assert.equal(q.source, "mixed_sources"); assert.equal(q.total, null); assert.equal(q.median, null); assert.equal(q.delta, null);
  assert.equal(Object.keys(q.series).length, 2); assert.ok(Object.values(q.series).every((s: any) => s.total === 1));
});

test("daily audit keeps later full-session collection visible when the early paired count is zero", () => {
  const r = fixture(5500), a = pairedGpcAudit(r);
  assert.equal(a.measurements['gpc.paired.gpc.collection_sample'], 0);
  assert.equal(a.measurements['gpc.session.advertising_collection'], 1);
  assert.equal(a.states['detail.gpc.session_collection'], 'positive_retained');
  delete r.gpcResponse.activityComparison;
  const withoutPair = pairedGpcAudit(r);
  assert.equal(withoutPair.states['detail.gpc.paired_pair'], 'unavailable');
  assert.equal(withoutPair.measurements['gpc.session.advertising_collection'], 1);
});

test("daily audit counts only source-bound CMP snapshots and preserves availability separately", async () => {
  const { gpcProductFixture } = await import("../../apps/web/lib/scans/test-fixtures/gpc-product");
  const f = gpcProductFixture();
  const r = { scanId: f.assessment.observation.scanId, gpcResponse: { ...f.assessment, cmpStateComparison: f.cmpStateComparison } };
  assert.equal(pairedGpcAudit(r).states["detail.gpc.paired_cmp"], "available");
  assert.equal(pairedGpcAudit(fixture()).states["detail.gpc.paired_cmp"], "unavailable");
  assert.equal(pairedGpcAudit({ ...r, gpcResponse: { cmpStateComparison: f.cmpStateComparison } }).states["detail.gpc.paired_cmp"], "invalid_or_unbound");
  assert.equal(pairedGpcAudit({ ...r, gpcResponse: { ...r.gpcResponse, observation: { status: "complete" } } }).states["detail.gpc.paired_cmp"], "invalid_or_unbound");
  const changed = structuredClone(r); changed.gpcResponse.cmpStateComparison!.sourceHashes.baseline = "0".repeat(64);
  assert.equal(pairedGpcAudit(changed).states["detail.gpc.paired_cmp"], "invalid_or_unbound");
});

test('audit exposes informative request pairs, qualified activity facts and independent CMP receipt',()=>{
 const r=fixture();const a=pairedGpcAudit(r);
 assert.equal(a.states['detail.gpc.paired_advertising_opportunity'],'baseline_activity_retained');
 assert.equal(a.measurements['gpc.session.supported_activity_requests'],1);
 assert.equal(a.measurements['gpc.session.unresolved_activity_requests'],0);
 assert.equal(a.states['detail.gpc.semantic_readiness'],'reason_not_retained');
 assert.equal(a.measurements['gpc.session.semantic_read_ms'],undefined);
 const late=pairedGpcAudit(fixture(5500));assert.equal(late.states['detail.gpc.early_zero_later_collection'],'early_zero_full_visit_positive');
});
test('bound CMP snapshots expose per-axis transitions without inferring causation',async()=>{
 const {gpcProductFixture}=await import('../../apps/web/lib/scans/test-fixtures/gpc-product');const f=gpcProductFixture();
 const a=pairedGpcAudit({scanId:f.assessment.observation.scanId,gpcResponse:{...f.assessment,cmpStateComparison:f.cmpStateComparison}});
 assert.equal(a.states['detail.gpc.paired_sale_transition'],`${f.cmpStateComparison!.baseline.sale}_to_${f.cmpStateComparison!.gpc.sale}`);
 assert.equal(a.states['detail.gpc.cmp_receipt'],f.assessment.observation.registration.cmpGpcSignal);
 const bad=structuredClone(f);bad.cmpStateComparison!.sourceHashes.gpc='0'.repeat(64);
 assert.equal(pairedGpcAudit({scanId:f.assessment.observation.scanId,gpcResponse:{...f.assessment,cmpStateComparison:bad.cmpStateComparison}}).states['detail.gpc.paired_sale_transition'],'unavailable');
});


test("daily CMP scope distinguishes main-document snapshots without changing legacy availability", async () => {
  const {gpcProductFixture} = await import("../../apps/web/lib/scans/test-fixtures/gpc-product");
  const f = gpcProductFixture();
  const r:any = {scanId:f.assessment.observation.scanId,gpcResponse:{...f.assessment,cmpStateComparison:f.cmpStateComparison}};
  assert.equal(pairedGpcAudit(r).states["detail.gpc.paired_cmp_scope"],"full_context");
  r.gpcResponse.observation.delivery.fullContextVerified=false;
  assert.equal(pairedGpcAudit(r).states["detail.gpc.paired_cmp"],"invalid_or_unbound");
  r.gpcResponse.cmpStateComparison={...f.cmpStateComparison,contractVersion:"certscore.gpc-cmp-state-comparison.v2",scope:"main_document"};
  const audit=pairedGpcAudit(r);
  assert.equal(audit.states["detail.gpc.paired_cmp"],"available");
  assert.equal(audit.states["detail.gpc.paired_cmp_scope"],"main_document");
  assert.equal(audit.cmpScope,"certscore.gpc-cmp-state-comparison.v2/main_document");
});

test('four-question assessment coverage does not promote incomplete packets or neutral records',()=>{
 const r=fixture();
 Object.assign(r.gpcResponse,{status:'no_observable_response',californiaPolicy:{applied:false,deductionPoints:0}});
 const a=pairedGpcAudit(r);
 assert.equal(a.states['detail.gpc.assessment_coverage'],'unavailable');
 assert.equal(a.states['detail.gpc.california_collection'],'unavailable');
});

test('recorded California collection is independent of comparison direction and neutral record surfacing',async()=>{
 const {buildGpcResponseAssessment}=await import('../../packages/certscore-scan-core/src/gpc-response-assessment');
 const {buildGpcProductionAssessment}=await import('../../packages/certscore-scan-core/src/gpc-production-observation');
 const {apiV2GpcResponseSchema}=await import('../../packages/certscore-api-contracts/src/scan-observation-results');
 const pair=collectionPairFixture(), b=collectionFixtureSource(pair.baseline),g=collectionFixtureSource(pair.gpc);
 const comparison=buildGpcResponseAssessment({baseline:pair.baseline,baselineArtifact:b.pointer,gpc:pair.gpc,gpcArtifact:g.pointer});
 const assessment=buildGpcProductionAssessment({scanId:pair.gpc.scanId,source:g,comparison});
 const {baselineArtifact,gpcArtifact,delivery,evidenceRefs,...c}=assessment.comparison;
 const response=apiV2GpcResponseSchema.parse({contractVersion:assessment.contractVersion,status:assessment.status,findingTitle:assessment.findingTitle,
  summary:'Synthetic retained evidence',observation:assessment.observation,scoreEffect:'none',legalInterpretation:'not_assessed',
  comparison:{...c,baselineArtifact:{lane:'runtime_evidence',sha256:b.pointer.sha256,sizeBytes:b.pointer.sizeBytes},gpcArtifact:{lane:'gpc_observation',sha256:g.pointer.sha256,sizeBytes:g.pointer.sizeBytes},delivery:{status:delivery.status}},
  californiaPolicy:{applied:true,deductionPoints:15},evidenceUrl:'https://example.test/evidence'});
 const report={scanId:pair.gpc.scanId,gpcResponse:response};
 const values=pairedGpcAudit(report).states;
 assert.equal(values['detail.gpc.california_collection'],'recorded');
 assert.equal(values['detail.gpc.assessment_coverage'],comparison.comparison.comparable?'assessed':'inconclusive');
 response.californiaPolicy={applied:false,deductionPoints:0};
 assert.equal(pairedGpcAudit(report).states['detail.gpc.california_collection'],'not_recorded');
 response.observation!.sourceSha256='f'.repeat(64);
 assert.equal(pairedGpcAudit(report).states['detail.gpc.california_collection'],'unavailable');
 assert.equal(pairedGpcAudit({...report,scanId:'other'}).states['detail.gpc.assessment_coverage'],'unavailable');
});
