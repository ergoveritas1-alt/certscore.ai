import assert from "node:assert/strict";
import test from "node:test";
import { evidenceProgress, sealedEvidenceProgress, evidenceMetricRegistry, summarizeQuantities, QUANTITIES, quantityCsv } from "./audit-progress-evidence";
import {siteIntegrityProjectionFixture} from "../../packages/certscore-contracts/src/site-integrity.fixture";
import { PRIMARY_CHECKLIST_IDS, METRICS, summarizeDays, type ProgressRow } from "./audit-progress";
import { extractExportRow } from "./audit-progress-export";
import {renderProgressDashboard} from "./audit-progress-html";
const source={file:"/local/retained.json",sha256:"abc",role:"archive"};
const packet=()=>({scanId:"11111111-1111-4111-8111-111111111111",domain:"example.com",scanStatus:"completed",timestamps:{createdAt:"2026-10-25T09:00:00Z"},gdprEprivacyChecklistRows:{items:[]}});
test("new canonical checklist checks preserve concerns separately from observed evidence",()=>{
  const r=evidenceProgress({},[{id:"transport_security_tls_certificate",label:"Certificate",evidenceState:"observed",status:"Gap observed"},{id:"pre_consent_cookies_storage",status:"Partial concern"},{id:"controller_contact_disclosure",status:"Observed"}],PRIMARY_CHECKLIST_IDS);
  assert.equal(r.states["checklist.transport_security_tls_certificate"],"gap_observed");
  assert.equal(r.states["checklist.pre_consent_cookies_storage"],"partial_concern");
  assert.equal(r.states["checklist.controller_contact_disclosure"],undefined);
});
test("missing and unknown evidence cannot become an acknowledged GPC response or measured zero",()=>{
  const r=evidenceProgress({gpcResponse:{observation:{acknowledgment:{observed:false,captureComplete:false},registration:{sale:"unknown"}}},formsSummary:{totalObserved:null},accessibilityAudit:{failedRuleCount:null}},[],PRIMARY_CHECKLIST_IDS);
  assert.equal(r.states["detail.gpc.acknowledgment"],"unknown");assert.equal(r.states["detail.gpc.sale"],"unknown");
  assert.equal(r.states["detail.gpc.sharing"],"not_checked");assert.deepEqual(r.measurements,{});
  const complete=evidenceProgress({gpcResponse:{observation:{acknowledgment:{observed:false,captureComplete:true}}},formsSummary:{totalObserved:0}},[],PRIMARY_CHECKLIST_IDS);
  assert.equal(complete.states["detail.gpc.acknowledgment"],"not_observed");assert.equal(complete.measurements["forms.observed"],0);
});
test("after-click activity, projectability, registration and verdict remain independent",()=>{
  const r=evidenceProgress({postAcceptObservation:{productionProjectable:false,verdict:"no_confirmed_post_accept_verdict",indeterminateReason:"acceptance_registration_not_confirmed",afterAction:{requestCount:12,storageWriteCount:0,stopReason:"window_elapsed"}}},[],PRIMARY_CHECKLIST_IDS);
  assert.equal(r.states["detail.accept.projectable"],"not_projectable");assert.equal(r.states["detail.accept.reason"],"acceptance_registration_not_confirmed");
  assert.equal(r.measurements["accept.requests"],12);assert.equal(r.measurements["accept.storage_writes"],0);assert.equal(r.states["detail.reject.verdict"],"not_checked");
});
test("dynamic checklist coverage survives new IDs and records missing historical checks explicitly",()=>{
  const a=extractExportRow({...packet(),gdprEprivacyChecklistRows:{items:[{id:"future_check",label:"New supported field",status:"Not testable"}]}},source),b=extractExportRow({...packet(),scanId:"22222222-2222-4222-8222-222222222222"},source);
  const registry=evidenceMetricRegistry([a,b]),m=registry.find(m=>m.id==="checklist.future_check")!;
  assert.equal(m.label,"New supported field");b.states[m.id]??="not_checked";
  const days=summarizeDays([a,b],[{start:"2026-10-25T07:00:00Z",end:"2026-10-26T07:00:00Z",completeInventory:false}],[...METRICS,...registry]);
  assert.deepEqual(days[0].metrics[m.id].counts,{not_testable:1,not_checked:1});assert.equal(days[0].metrics[m.id].denominator,2);
  assert.equal(new Set(registry.map(m=>m.id)).size,registry.length);
});
test("no-go reports do not enter added evidence-check or numeric denominators",()=>{
  const row=extractExportRow({...packet(),resultDisposition:"no_go",formsSummary:{totalObserved:0},gdprEprivacyChecklistRows:{items:[{id:"future_check",status:"Observed"}]}},source);
  assert.equal(row.reportable,false);assert.equal(row.states["checklist.future_check"],undefined);assert.deepEqual(row.measurements,{});
  assert.equal(summarizeQuantities([row])["forms.observed"]!.eligible,0);
});
test("numeric summaries retain zero, exclude null and reject negative/nonfinite counts",()=>{
  const rows=[0,4,null,-1,Infinity].map((value,i)=>extractExportRow({...packet(),scanId:`11111111-1111-4111-8111-11111111111${i}`,formsSummary:{totalObserved:value}},source));
  const q=summarizeQuantities(rows)["forms.observed"];assert.deepEqual(q,{measured:2,eligible:5,total:4,median:2});
  assert.equal(summarizeQuantities([])["forms.observed"]!.median,null);assert.equal(QUANTITIES.length,21);
});
test("detailed projections require the original scan and bundle hash before contributing counts",()=>{
  const p=siteIntegrityProjectionFixture;
  const good=sealedEvidenceProgress({siteIntegrity:p},p.scanId,p.sourceHash);
  assert.equal(good.states["detail.sealed.site_integrity"],"verified_capture");assert.equal(good.measurements["site.links_inspected"],40);
  for(const [id,hash]of [["other",p.sourceHash],[p.scanId,"c".repeat(64)],[p.scanId,undefined]]){
    const bad=sealedEvidenceProgress({siteIntegrity:p},id!,hash);assert.equal(bad.states["detail.sealed.site_integrity"],"unverified_projection");assert.deepEqual(bad.measurements,{});
  }
});
test("deferred graph reference counts never claim retrieved graph bytes",()=>{
  const id=packet().scanId,sha="a".repeat(64),graph={contractVersion:"certscore.runtime-evidence-graph-projection.v1",scanId:id,status:"limited",sourceBundle:{sha256:sha,sizeBytes:100,verified:true},registryVersion:"fixture",graphs:[],details:{href:`/api/scans/${id}/runtime-evidence-graph`,sha256:"b".repeat(64),scenarioCount:1,nodeCount:12,edgeCount:9},limitations:[],findingOrScoreEffect:false};
  const r=sealedEvidenceProgress({runtimeEvidenceGraphProjection:graph},id,sha);assert.equal(r.states["detail.sealed.relationships"],"deferred_reference_metadata");assert.equal(r.measurements["graph.nodes"],12);
  const absent=sealedEvidenceProgress({},id,sha);assert.equal(absent.measurements["graph.nodes"],undefined);
});
test("numeric CSV leaves unavailable days blank and retains an explicitly measured zero",()=>{
  const a=extractExportRow({...packet(),formsSummary:{totalObserved:0}},source);
  const days=summarizeDays([a],[{start:"2026-10-25T07:00:00Z",end:"2026-10-27T07:00:00Z",completeInventory:false}]);
  const csv=quantityCsv(days).split("\n").filter(s=>s.includes('"forms.observed"'));
  assert.ok(csv[0]?.endsWith('"1","1","0","0"'));assert.ok(csv[1]?.endsWith('"0","0","",""'));
});
test("compact viewer payload preserves absent versus unknown states and omits repeated labels",()=>{
  const html=renderProgressDashboard({metrics:[{id:"first"},{id:"second"},{id:"third"}],rows:[{scanId:"fixture",states:{first:"unknown",third:"observed"},metricLabels:{first:"Repeated label"}}]});
  const embedded=JSON.parse(html.match(/<script id="audit-data" type="application\/json">(.*?)<\/script>/s)![1]!);
  const row=embedded.rows[0],decoded=Object.fromEntries(row.stateCodes.flatMap((code:number,i:number)=>code<0?[]:[[embedded.metricKeys[i],embedded.stateValues[code]]]));
  assert.deepEqual(decoded,{first:"unknown",third:"observed"});assert.equal(row.metricLabels,undefined);assert.equal(row.states,undefined);
});
