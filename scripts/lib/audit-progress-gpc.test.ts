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
test('the retained Google page-view review version preserves the bound CMP readback',()=>{
 const baseline=fixture();
 for(const receipt of ['received','not_received','unknown'] as const){
  const observation={...baseline.gpcResponse.observation!,semanticProbe:'observed',semanticReadiness:undefined,
   registration:{...baseline.gpcResponse.observation!.registration,cmpGpcSignal:receipt}};
  const report={...baseline,gpcResponse:{...baseline.gpcResponse,observation:{...observation,requests:{...observation.requests,
   collectionReview:{policyVersion:'gpc_collection_review.v2-google-page-view',rows:[]}}}}};
  const audit=pairedGpcAudit(report);
  assert.equal(audit.states['detail.gpc.cmp_receipt'],receipt);
  assert.equal(audit.states['detail.gpc.semantic_readiness'],receipt==='unknown'?'explicit_gpc_bit_absent':'reason_not_retained');
  assert.equal(pairedGpcAudit({...report,scanId:'wrong'}).states['detail.gpc.cmp_receipt'],'unavailable');
  report.gpcResponse.observation.requests.collectionReview.policyVersion='gpc_collection_review.unsupported';
  assert.equal(pairedGpcAudit(report).states['detail.gpc.cmp_receipt'],'unavailable');
 }
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
 for(const policyVersion of ['gpc_collection_review.v1','gpc_collection_review.v2-google-page-view'] as const){
  const current=structuredClone(response),observation=current.observation!;
  observation.requests.collectionReview={policyVersion,rows:observation.requests.collectionReview?.rows??[]};
  const report={scanId:pair.gpc.scanId,gpcResponse:current};
  const values=pairedGpcAudit(report).states;
  assert.equal(values['detail.gpc.california_collection'],'recorded',policyVersion);
  assert.equal(values['detail.gpc.assessment_coverage'],comparison.comparison.comparable?'assessed':'inconclusive');
  current.californiaPolicy={applied:false,deductionPoints:0};
  const withoutPolicyFinding=pairedGpcAudit(report).states;
  assert.equal(withoutPolicyFinding['detail.gpc.california_collection'],'not_recorded',policyVersion);
  assert.equal(withoutPolicyFinding['detail.gpc.session_collection'],'positive_retained',policyVersion);
  observation.sourceSha256='f'.repeat(64);
  assert.equal(pairedGpcAudit(report).states['detail.gpc.california_collection'],'unavailable',policyVersion);
  assert.equal(pairedGpcAudit({...report,scanId:'other'}).states['detail.gpc.assessment_coverage'],'unavailable');
 }
});

test("daily readback counts a verified in-window GPP event once and prefers an explicit terminal answer", async () => {
  const {createHash} = await import("node:crypto");
  const {gpcObservationSessionSchema} = await import("@certscore/contracts");
  const hash = (value:unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  for (const received of [true,false]) {
    const {gpc} = collectionPairFixture();
    const session = gpc.gpcObservationSession!, terminal = session.semanticObservation!;
    session.listener = {callbacks:2, registered:true, dropped:0};
    terminal.gppDiagnostics = {reason:"api_unavailable",listenerPolicy:"gpp_listener_ping_data.v1",callbackCount:0,
      sectionList:[],applicableSections:[],diagnosticCodes:["api_unavailable"]};
    const state = {apiVersion:"1.1",sectionId:8,sectionVersion:1,cmpStatus:"loaded",signalStatus:"ready",
      saleNotice:1,sharingNotice:1,saleOptOut:2,sharingOptOut:2,gpc:received} as const;
    terminal.stateTransitions = [{observedAtMs:200,status:"observed",state,stateSha256:hash(state)}];
    const replay = () => {
      gpc.gpcPrototypeSessionBinding!.sessionSha256 = hash(gpcObservationSessionSchema.parse(session));
      const source = collectionFixtureSource(gpc);
      const observation = buildGpcProductionObservation({scanId:gpc.scanId,source});
      return {observation, audit:pairedGpcAudit({scanId:gpc.scanId,gpcResponse:{contractVersion:"certscore.gpc-response-assessment.v3",
        observation,comparison:{gpcArtifact:source.pointer}}})};
    };
    const first = replay();
    assert.deepEqual(first.observation.cmpEventReadback,{source:"gpp_listener_ping_data.v1",sectionId:8,received,observedAtMs:200});
    assert.equal(first.observation.registration.cmpGpcSignal,"unknown");
    assert.equal(first.audit.states["detail.gpc.cmp_receipt"],received ? "received" : "not_received");
    assert.equal(first.audit.states["detail.gpc.cmp_receipt_source"],"gpp_listener_event");
    terminal.usca = {...state,gpc:!received}; terminal.gppStatus = "observed"; terminal.stateSha256 = hash(terminal.usca);
    const both = replay();
    assert.equal(both.audit.states["detail.gpc.cmp_receipt"],received ? "not_received" : "received");
    assert.equal(both.audit.states["detail.gpc.cmp_receipt_source"],"terminal_gpp");
    terminal.stateTransitions[0]!.observedAtMs = 0;
    assert.equal(replay().observation.cmpEventReadback,undefined);
    terminal.stateTransitions[0]!.observedAtMs = 200;
    delete terminal.gppDiagnostics.listenerPolicy;
    assert.equal(replay().observation.cmpEventReadback,undefined);
  }
});

test("displayed explicit GPC messages count once only for a bound GPC visit", async () => {
  const {createHash} = await import("node:crypto");
  const {gpcObservationSessionSchema, HUBSPOT_GPC_SELECTOR, HUBSPOT_GPC_MESSAGES, TRUSTARC_GPC_SELECTOR, COOKIEBOT_GPC_SELECTOR} = await import("@certscore/contracts");
  const {gpc} = collectionPairFixture();
  const session = gpc.gpcObservationSession!, terminal = session.semanticObservation!;
  const replay = () => {
    gpc.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(gpcObservationSessionSchema.parse(session))).digest("hex");
    const source = collectionFixtureSource(gpc);
    const observation = buildGpcProductionObservation({scanId:gpc.scanId,source});
    return pairedGpcAudit({scanId:gpc.scanId,gpcResponse:{contractVersion:"certscore.gpc-response-assessment.v3",
      observation,comparison:{gpcArtifact:source.pointer}}}).states;
  };
  terminal.acknowledgment = [{cmp:"HubSpot Consent Banner",scopeSelector:HUBSPOT_GPC_SELECTOR,
    message:HUBSPOT_GPC_MESSAGES[0],source:"visible_hubspot_gpc_notification"}];
  assert.equal(replay()["detail.gpc.cmp_receipt_source"],"visible_hubspot_gpc_notification");
  terminal.acknowledgment = [{cmp:"TrustArc",scopeSelector:TRUSTARC_GPC_SELECTOR,message:"GPC signal detected.",source:"visible_trustarc_gpc_notification"}];
  assert.equal(replay()["detail.gpc.cmp_receipt_source"],"visible_trustarc_gpc_notification");
  terminal.acknowledgment = [{cmp:"Cookiebot",scopeSelector:COOKIEBOT_GPC_SELECTOR,message:"The GPC signal is honored",source:"visible_cookiebot_gpc_notification"}];
  assert.equal(replay()["detail.gpc.cmp_receipt_source"],"visible_cookiebot_gpc_notification");
  terminal.acknowledgment = [];
  terminal.hubspotGpcApplied = true;
  assert.equal(replay()["detail.gpc.cmp_receipt_source"],"hubspot_applied_gpc");
  delete terminal.hubspotGpcApplied;
  for (const [cmp,scopeSelector] of [["TrustArc","#truste-consent-track"],["Cookiebot","#CybotCookiebotDialog"],["Ketch","#ketch-banner"]]) {
    terminal.acknowledgment = [{cmp,scopeSelector,message:"The GPC signal is honored",source:"visible_cmp_live_status"}];
    assert.equal(replay()["detail.gpc.cmp_receipt"],"received");
  }
  terminal.acknowledgment[0]!.cmp = "TrustArc";
  assert.equal(replay()["detail.gpc.cmp_receipt"],"unknown");
  terminal.acknowledgment = [{cmp:"TrustArc",scopeSelector:"#truste-consent-track",message:"Opt-Out Signal Honored",source:"visible_cmp_live_status"}];
  assert.equal(replay()["detail.gpc.cmp_receipt"],"unknown");
  terminal.acknowledgment[0]!.message = "The GPC signal is honored";
  terminal.navigatorGpc = false;
  assert.notEqual(replay()["detail.gpc.cmp_receipt"],"received");
  terminal.navigatorGpc = true;
  terminal.limitationKeys.push("document_changed_during_semantic_readback");
  assert.notEqual(replay()["detail.gpc.cmp_receipt"],"received");
});
