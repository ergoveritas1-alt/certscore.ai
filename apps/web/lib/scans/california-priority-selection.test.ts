import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {californiaPrivacyReviewSchema, deriveConsentControlAssessment} from "@certscore/contracts";
import {californiaCoverageFixture, CA_FIXTURE_POLICY, CA_FIXTURE_URL, CA_FIXTURE_SOURCE} from "../../server/scans/california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "../../server/scans/california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "./unified-findings";
import {assessGpcPotentialRisk} from "./california-potential-risk-policy";
import {deriveCaliforniaRegulatoryScore} from "./california-regulatory-score";
import {projectCaliforniaRegulatoryPriorities} from "./california-regulatory-priorities";
import {projectCaliforniaChoicePresence} from "./california-choice-presence";
import {californiaPriorityDemotion, selectCaliforniaPriorityFindings} from "./california-priority-selection";
import {buildAssessmentHighlightsPresentation} from "./assessment-highlights";
import {selectRegulatoryReview} from "./regulatory-review-catalog";
import {californiaPriorityGpcFixture, ANALYTICS_URL, QUALIFIED_URL, UNRESOLVED_AD_URL, californiaPriorityRejectFixture} from "./test-fixtures/california-priority-gpc";
import {FindingRow} from "../../components/scans/report-finding-row";

function canonical(urls: string[] = [], declared = false, extraRuntime: Record<string, unknown> = {}) {
  const text = declared ? CA_FIXTURE_POLICY.replace("We do not sell or share personal information.", "We sell personal information to advertising partners.")
    : CA_FIXTURE_POLICY.replace("We do not sell or share personal information.", "");
  const f: ReturnType<typeof californiaCoverageFixture> = JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,"https://example.test/"));
  f.bundle.url = "https://example.test/"; f.bundle.normalizedUrl = f.bundle.url;
  f.bundle.scanId = "gpc-fixture"; f.policyEvidence.projection.scanId = f.bundle.scanId;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, f.bundle.url, f.policyEvidence)!;
  const parent = deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:f.bundle.url}});parent.californiaPrivacyReview = review;
  const gpc = urls.length ? californiaPriorityGpcFixture(urls) : undefined;
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{...extraRuntime,consentControlAssessment:parent,
    ...(gpc ? {gpcResponseAssessment:gpc,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(gpc)} : {})}});
  const rows = projectCaliforniaRegulatoryPriorities(packets).map((row,i)=>({...row,rank:i+1,pages:[{id:f.bundle.scanId,url:f.bundle.url,homepage:true}]}));
  const score = ()=>deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets});
  return {review,packets,rows,score,gpc};
}
const choice = (r:ReturnType<typeof canonical>)=>r.rows.find(f=>f.id==="california_privacy_choice_not_observed")!;
const collection = (r:ReturnType<typeof canonical>)=>r.rows.find(f=>f.id==="california_collection_review")!;

test("uncorroborated link absence stays in detail and the signal snapshot with identical scoring",()=>{
  const r=canonical(),row=choice(r);assert.ok(row);
  const before=JSON.stringify(r.packets),score=r.score(),snapshot=projectCaliforniaChoicePresence(r.packets,r.review.scanId,r.review.documentUrl);
  assert.equal(californiaPriorityDemotion(row,r.rows),"uncorroborated_choice_absence");
  assert.ok(!selectRegulatoryReview(r.rows,"ccpa_cpra").topIssues.some(f=>f.id===row.id));
  const html=renderToStaticMarkup(React.createElement(FindingRow,{finding:{...row,focus:"CCPA/CPRA",vendors:[]},reviewFocus:"ccpa_cpra"}));
  assert.match(html,/No named sale\/sharing choice found/);
  assert.equal(snapshot?.state,"not_observed");
  assert.deepEqual(projectCaliforniaChoicePresence(r.packets,r.review.scanId,r.review.documentUrl),snapshot);
  assert.deepEqual(r.score(),score);assert.equal(JSON.stringify(r.packets),before);
});
test("declared sale/sharing or qualified same-document GPC evidence preserves choice headline",()=>{
  const declared=canonical([],true);assert.equal(californiaPriorityDemotion(choice(declared),declared.rows),null);
  const verified=canonical([QUALIFIED_URL]);assert.ok(verified.rows.some(r=>r.id==="gpc_response"));
  assert.equal(californiaPriorityDemotion(choice(verified),verified.rows),null);
  const weak=canonical([ANALYTICS_URL]);assert.equal(californiaPriorityDemotion(choice(weak),weak.rows),"uncorroborated_choice_absence");
});
test("choice corroboration cannot borrow another document or scan; missing binding remains conservative",()=>{
  const r=canonical([QUALIFIED_URL]),row=choice(r);
  const otherDoc={...row,evidenceJson:{...row.evidenceJson,californiaPriorityBinding:{...(row.evidenceJson.californiaPriorityBinding as object),documentUrlSha256:"f".repeat(64)}}};
  assert.equal(californiaPriorityDemotion(otherDoc,[otherDoc,...r.rows.filter(f=>f!==row)]),"uncorroborated_choice_absence");
  const otherScanReview=californiaPrivacyReviewSchema.parse({...r.review,scanId:"other-scan"});
  const otherScan={...row,evidenceJson:{...row.evidenceJson,californiaPrivacyReview:otherScanReview}};
  assert.equal(californiaPriorityDemotion(otherScan,[otherScan,...r.rows.filter(f=>f!==row)]),"uncorroborated_choice_absence");
  const missing={...row,evidenceJson:{...row.evidenceJson,californiaPriorityBinding:undefined}};
  assert.equal(californiaPriorityDemotion(missing,[missing,...r.rows.filter(f=>f!==row)]),null);
  assert.equal(californiaPriorityDemotion({...row,evidenceJson:{}},r.rows),null);
});
test("analytics-only review is detailed while collection findings and scoring remain intact",()=>{
  const r=canonical([ANALYTICS_URL]),row=collection(r);assert.ok(row);
  const before=JSON.stringify(r.packets),score=r.score();
  assert.ok(score.deductions.some(d=>d.findingId===row.id));
  assert.equal(californiaPriorityDemotion(row,r.rows),"analytics_only_collection");
  for(const scope of [{kind:"page"},{kind:"site",scannedPages:3}] as const){
    const copy=buildAssessmentHighlightsPresentation(r.rows,scope);
    assert.ok(![...copy.links,...(copy.expanded?.links??[])].some(link=>link.targetId.includes(row.id)));
  }
  const detailed=renderToStaticMarkup(React.createElement(FindingRow,{finding:{...row,focus:"CCPA/CPRA",vendors:[]}}));
  assert.ok(detailed.includes(row.title));assert.match(detailed,/sale\/sharing purpose.*unresolved/i);
  assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
});
test("fully covered unresolved advertising recipients yield one stronger GPC headline",()=>{
  const r=canonical([QUALIFIED_URL,UNRESOLVED_AD_URL]),row=collection(r);assert.ok(row,"Fixture must retain distinct qualified and unresolved collection");
  const before=structuredClone(r.rows),score=r.score();
  assert.equal(californiaPriorityDemotion(row,r.rows),"same_gpc_recipients");
  const selected=selectCaliforniaPriorityFindings(r.rows);
  assert.ok(selected.some(f=>f.id==="gpc_response"));assert.ok(!selected.some(f=>f.id===row.id));
  assert.ok(r.packets.some(p=>p.unifiedFindingId===row.id&&p.surfacingDecision.reportable));
  assert.deepEqual(r.rows,before);assert.deepEqual(r.score(),score);
  for(const scope of [{kind:"page"},{kind:"site",scannedPages:3}] as const){
    const copy=buildAssessmentHighlightsPresentation(r.rows,scope);
    assert.ok(copy.links.some(link=>link.targetId==="gpc-evidence"));
    assert.ok(![...copy.links,...(copy.expanded?.links??[])].some(link=>link.targetId.includes(row.id)));
  }
});
for(const field of ["scanId","sourceSha256","sessionSha256","documentUrlSha256"] as const) test(`recipient-overlap demotion rejects changed ${field}`,()=>{
  const r=canonical([QUALIFIED_URL,UNRESOLVED_AD_URL]),row=collection(r);assert.ok(row);
  const changed={...row,evidenceJson:{...row.evidenceJson,gpcPriorityBinding:{...(row.evidenceJson.gpcPriorityBinding as object),[field]:field==="scanId"?"other-scan":"f".repeat(64)}}};
  assert.equal(californiaPriorityDemotion(changed,[changed,...r.rows.filter(f=>f!==row)]),null);
});
test("overlap requires complete same-path recipient and request proof",()=>{
  const r=canonical([QUALIFIED_URL,UNRESOLVED_AD_URL]),row=collection(r);assert.ok(row);
  const original=row.evidenceJson.assessments as Array<{path:string;sourceSha256:string;rows:Array<Record<string,unknown>>}>;
  for(const mutate of [
    (a:typeof original)=>{a[0]!.path="reject";},
    (a:typeof original)=>{a[0]!.sourceSha256="f".repeat(64);},
    (a:typeof original)=>{a[0]!.rows.find(row=>row.treatment==="potential_risk")!.entityId="ent_000000000000";},
    (a:typeof original)=>{a[0]!.rows.find(row=>row.treatment==="potential_risk")!.evidenceId="unmatched-request";},
    (a:typeof original)=>{a[0]!.rows.find(row=>row.treatment==="potential_risk")!.msFromAnchor=9999;},
  ]){
    const assessments=structuredClone(original);mutate(assessments);
    const changed={...row,evidenceJson:{...row.evidenceJson,assessments}};
    assert.equal(californiaPriorityDemotion(changed,[changed,...r.rows.filter(f=>f!==row)]),null);
  }
  assert.equal(californiaPriorityDemotion(row,[row]),null,"A stronger headline must actually be present");
  assert.equal(californiaPriorityDemotion({...row,evidenceJson:{...row.evidenceJson,gpcPriorityBinding:undefined}},r.rows),null);
});
test("advertising that adds a recipient, malformed metadata and CMS keep existing prominence",()=>{
  const r=canonical([UNRESOLVED_AD_URL]),row=collection(r);assert.ok(row);
  assert.equal(californiaPriorityDemotion(row,r.rows),null);
  const malformed={...row,evidenceJson:{assessments:[{rows:[{purpose:"analytics"}]}]}};
  assert.equal(californiaPriorityDemotion(malformed,[malformed]),null);
  const cms={...row,id:"site_integrity_cms_security",title:"Unsupported CMS branch"};
  assert.ok(selectCaliforniaPriorityFindings([cms]).includes(cms));
});

test("same-document qualified Reject evidence corroborates choice without merging action paths",()=>{
  const runtime=californiaPriorityRejectFixture();
  const r=canonical([],false,runtime),row=choice(r);
  assert.ok(r.packets.some(p=>p.unifiedFindingId==="california_post_reject_collection"));
  assert.equal(californiaPriorityDemotion(row,r.rows),null);
  const bound=row.evidenceJson.californiaPriorityBinding as Record<string,unknown>;
  assert.ok(bound.qualifiedPostReject);
  const wrongScan=structuredClone(runtime);
  if("californiaPostRejectAssessment" in wrongScan) (wrongScan.californiaPostRejectAssessment as {scanId:string}).scanId="other";
  const changed=canonical([],false,wrongScan);
  assert.equal(californiaPriorityDemotion(choice(changed),changed.rows),"uncorroborated_choice_absence");
});
