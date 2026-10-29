import assert from "node:assert/strict";
import test from "node:test";
import { cohortDecision, extractProgressRow, coveredDay, midnightUtc, localDay, summarizeDays, METRICS, mergeVerifiedProgress, accessibilityProgress } from "./audit-progress";
import { botOriginSql, botOriginWindowSql } from "./audit-bot-origin";
import { renderProgressDashboard } from "./audit-progress-html";
import { extractExportRow, exportIsTest } from "./audit-progress-export";
const origin={scanId:"11111111-1111-4111-8111-111111111111",originalRequestId:"request",originalRequestedAt:"2026-10-24T10:00:00Z",isMacMini:true,isCanary:false,publicationRequestStatus:null};
const inventory={id:origin.scanId,status:"completed",created_at:"2026-10-24T10:00:00Z",hostname:"example.com",scan_from:"eu_ie",lambda_config:{gpcObservationEnabled:true}};
const record={scan:{status:"completed"},runtimeArtifacts:{},snapshot:{consentControlAssessment:{controls:{accept:{state:"observed"},reject:{state:"unknown"},privacyOptOut:{state:"not_observed"}}}},canonicalReportProjection:{checklistRows:[],globalUnifiedFindings:[],topFindingIds:[]}};
const row=()=>extractProgressRow({inventory,origin,record,report:{scanStatus:"completed_limited",accessibilityAudit:{status:"limited",required:true}},refs:[],exportState:"generation_matched"});
test("cohort uses positive original ownership and excludes all canary/test variants",()=>{
  assert.equal(cohortDecision(origin,inventory),"included");
  assert.equal(cohortDecision({...origin,isMacMini:null},inventory),"origin_unverified");
  assert.equal(cohortDecision({...origin,isMacMini:false},inventory),"excluded_other_origin");
  for(const url of ["https://ergoveritas.com/test1.html","https://www.ergoveritas.com/test2.html?loc=US","https://example.com/.well-known/certscore-canary/a"])
    assert.equal(cohortDecision(origin,inventory,{url}),"excluded_canary_or_test");
  assert.equal(cohortDecision(origin,inventory,{url:"https://example.com/test1.html"}),"included");
  assert.equal(cohortDecision({...origin,isCanary:true},inventory),"excluded_canary_or_test");
});
test("unknown controls, missing packets and missing measurements cannot become absence or success",()=>{
  const r=row();assert.equal(r.states["control.reject"],"unknown");assert.equal(r.states["control.options"],"not_checked");assert.equal(r.states["execution.accept"],"not_checked");
  assert.equal(r.states["control.privacyOptOut"],"not_observed");assert.equal(r.states.outcome,"usable_limited");
  const terminal=extractProgressRow({inventory,origin:{...origin,publicationRequestStatus:"terminal_failure"},record,refs:[],exportState:"missing"});
  assert.equal(terminal.states.outcome,"publication_failed");assert.equal(terminal.reportable,false);assert.equal(terminal.states["control.accept"],undefined);
});
test("verified execution and confirmation stay separate",()=>{
  const r=structuredClone(record) as any;r.runtimeArtifacts.postAcceptEvidenceProjection={execution:{policyVersion:"choice_path_execution.v1",status:"succeeded",clickCompleted:true,observationCompleted:true,consentConfirmed:false},registrationStatus:"unconfirmed"};
  const result=extractProgressRow({inventory,origin,record:r,refs:[],exportState:"missing"});assert.equal(result.states["execution.accept"],"succeeded");assert.equal(result.states["registration.accept"],"unconfirmed");
  r.runtimeArtifacts.postAcceptEvidenceProjection.execution.status="succeeded_with_confirmation";
  assert.equal(extractProgressRow({inventory,origin,record:r,refs:[],exportState:"missing"}).states["execution.accept"],"not_checked");
});
test("exports retain semantic registration and aborted states despite operational confirmation",()=>{
 const base:any={scanId:origin.scanId,domain:"example.com",scanStatus:"completed",timestamps:{createdAt:inventory.created_at}};
 const execution={policyVersion:"choice_path_execution.v1",status:"succeeded_with_confirmation",clickCompleted:true,observationCompleted:true,consentConfirmed:true};
 const ref={file:"/cache/report.json",sha256:"abc",role:"archive"};
 for(const [status,expected] of [["unconfirmed","unconfirmed"],["aborted","aborted"],["confirmed_clean","confirmed"],["confirmed_observation","confirmed"],[undefined,"not_checked"]]){
  const exported=extractExportRow({...base,postRefusalObservation:{status,execution}},ref);
  assert.equal(exported.states["registration.reject"],expected);
  assert.equal(exported.states["execution.reject"],"succeeded_with_confirmation");
  assert.equal(exported.states["terminal.reject"],"not_checked");
 }
});
test("matched semantic registration overrides an export but missing proof cannot promote it",()=>{
 const archive={...row(),states:{...row().states,"registration.reject":"confirmed","terminal.reject":"not_checked"}};
 const verified={...row(),states:{...row().states,"registration.reject":"unconfirmed","terminal.reject":"verified"}};
 const merged=mergeVerifiedProgress(archive,verified);
 assert.equal(merged.states["registration.reject"],"unconfirmed");assert.equal(merged.states["terminal.reject"],"verified");
 assert.equal(merged.metricSources?.["registration.reject"],"persisted_semantic_action_evidence");
 assert.equal(archive.states["registration.reject"],"confirmed");
 verified.states["registration.reject"]="not_checked";
 assert.equal(mergeVerifiedProgress(archive,verified).states["registration.reject"],"confirmed");
});
test("Los Angeles dates and DST days preserve 23/25-hour coverage",()=>{
  assert.equal(localDay("2026-10-25T06:59:59Z"),"2026-10-24");
  assert.equal(midnightUtc("2026-03-09")-midnightUtc("2026-03-08"),23*3600000);
  assert.equal(midnightUtc("2026-11-02")-midnightUtc("2026-11-01"),25*3600000);
  assert.equal(coveredDay("2026-10-24",[{start:"2026-10-24T07:00:00Z",end:"2026-10-25T07:00:00Z"}]),true);
});
test("daily rates retain denominators, gaps and duplicate protection",()=>{
  const one=row(),two={...row(),scanId:"22222222-2222-4222-8222-222222222222",createdAt:"2026-10-25T10:00:00Z",states:{...row().states,"control.reject":"observed"}};
  const windows=[{start:"2026-10-24T07:00:00Z",end:"2026-10-26T07:00:00Z"}];const days=summarizeDays([one,two],windows);
  assert.equal(days[1].metrics["control.reject"].deltaPp,100);assert.equal(days[0].metrics["control.reject"].denominator,1);
  assert.throws(()=>summarizeDays([one,one],windows),/Duplicate/);assert.throws(()=>summarizeDays([],[]),/coverage windows/);
});
test("partial samples retain descriptive deltas without claiming complete attempt inventory",()=>{
  const one=row(),two={...row(),scanId:"22222222-2222-4222-8222-222222222222",createdAt:"2026-10-25T10:00:00Z",states:{...row().states,"control.reject":"observed"}};
  const days=summarizeDays([one,two],[{start:"2026-10-24T07:00:00Z",end:"2026-10-26T07:00:00Z",completeInventory:false},{start:"2026-10-25T09:00:00Z",end:"2026-10-25T12:00:00Z"}]);
  assert.equal(days[1].metrics["control.reject"].deltaPp,100);assert.equal(days[1].metrics["control.reject"].stateDeltaPp.unknown,-100);assert.equal(days[1].metrics["control.reject"].stateDeltaPp.observed,100);assert.equal(days[1].metrics["control.reject"].comparison,"partial_day");
  assert.equal(days[0].inventoryHours,0);assert.equal(days[1].inventoryHours,3);assert.equal(days[1].completeDay,false);
});
test("historical exports require retained control completeness and keep missing execution/publication unknown",()=>{
  const exportPacket:any={scanId:origin.scanId,domain:"example.com",scanStatus:"completed",timestamps:{createdAt:inventory.created_at},consentSurfaceEvidence:{firstLayerConsentChoices:{acceptControlObserved:false,controlInventoryComplete:false}},projectedFindings:{items:[{id:"canonical-finding",label:"Returned finding"}],cap:{truncated:true}},gdprEprivacyChecklistRows:{items:[{id:"controller_contact_disclosure",evidenceLabel:"Not confirmed"}]}};
  const ref={file:"/cache/report.json",sha256:"abc",role:"archive"};const first=extractExportRow(exportPacket,ref);
  assert.equal(first.states["control.accept"],"unknown");assert.equal(first.states["execution.accept"],"not_checked");assert.equal(first.states.publication,undefined);assert.equal(first.states["topic.controller_contact"],"unknown");assert.equal(first.findingInventory,false);assert.equal(first.findings[0]?.top,null);
  exportPacket.consentSurfaceEvidence.firstLayerConsentChoices.controlInventoryComplete=true;
  assert.equal(extractExportRow(exportPacket,ref).states["control.accept"],"not_observed");
  assert.equal(exportIsTest({...exportPacket,domain:"ergoveritas.com"}),true);assert.equal(exportIsTest(exportPacket),false);
  assert.throws(()=>extractExportRow({...exportPacket,scan_id:"other"},ref),/identity mismatch/);
});
test("origin SQL is read-only, bounded and uses original creation requests rather than later retrievals",()=>{
  const sql=botOriginSql([origin.scanId]);assert.match(sql,/resolution_mode in \('created_new_scan', 'queued_new_scan'\)/);assert.match(sql,/order by creator.requested_at asc/);assert.match(sql,/origin_key.name in/);assert.doesNotMatch(sql,/insert |update |delete /i);
  assert.throws(()=>botOriginSql([origin.scanId,origin.scanId]),/distinct/);assert.throws(()=>botOriginSql(["'or true"]));
  const window=botOriginWindowSql("2026-10-23T00:00:00Z","2026-10-27T00:00:00Z");assert.match(window,/limit 5001/);assert.match(window,/s.created_at>=/);assert.doesNotMatch(window,/00000000-0000/);
});
test("dashboard escapes embedded source labels and contains no network client",()=>{
  const html=renderProgressDashboard({rows:[],days:[],metrics:METRICS,cohort:"</script><script>alert(1)</script>"});assert.doesNotMatch(html,/<script>alert\(1\)/);assert.doesNotMatch(html,/fetch\(|XMLHttpRequest|WebSocket/);
});

test("matched persisted control assessment remains authoritative over narrower export unknowns",()=>{
 const archive={...row(),states:{...row().states,"control.accept":"unknown"}},verified={...row(),states:{...row().states,"control.accept":"not_observed"}};
 const merged=mergeVerifiedProgress(archive,verified);assert.equal(merged.states["control.accept"],"not_observed");assert.equal(merged.metricSources?.["control.accept"],"persisted_consent_control_assessment");assert.equal(archive.states["control.accept"],"unknown");
 assert.throws(()=>mergeVerifiedProgress(archive,{...verified,states:{...verified.states,evidence:"generation_unverified"}}),/Generation-matched/);
 verified.states["control.accept"]="unknown";archive.states["control.accept"]="observed";assert.equal(mergeVerifiedProgress(archive,verified).states["control.accept"],"unknown");
});
test("limited accessibility results, review items and bounded examples remain distinct from unavailable audit",()=>{
 const states=accessibilityProgress({status:"limited",failedRuleCount:0,reviewRuleCount:2,exampleCoverage:{omittedNodeCount:30}});
 assert.equal(states["accessibility.results"],"rule_results_retained");assert.equal(states["accessibility.coverage"],"limited_with_results");assert.equal(states["accessibility.review"],"review_items_present");assert.equal(states["accessibility.examples"],"bounded_examples_omitted");assert.equal(accessibilityProgress({status:"limited",failedRuleCount:null})["accessibility.coverage"],"limited_without_results");assert.equal(accessibilityProgress({status:"failed"})["accessibility.results"],"not_checked");
});
