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
import {findingEvidenceAnchor} from "./report-evidence-navigation";
import {buildRegulatoryAssessmentHighlights} from "./regulatory-assessment-highlights";
import {buildAssessmentBrief} from "./assessment-brief";
import {type CaliforniaPotentialRiskAssessment} from "./california-potential-risk-contract";

function canonical(urls: string[] = [], declared = false, extraRuntime: Record<string, unknown> = {}, soleDisclosureOmission = false,
  riskPolicy: CaliforniaPotentialRiskAssessment["policyVersion"] = "california.collection-review.v3-retained-scope") {
  let text = declared ? CA_FIXTURE_POLICY.replace("We do not sell or share personal information.", "We sell personal information to advertising partners.")
    : CA_FIXTURE_POLICY.replace("We do not sell or share personal information.", "");
  if(soleDisclosureOmission)text=text.replace("We will not discriminate against you for exercising your privacy rights. ","");
  const f: ReturnType<typeof californiaCoverageFixture> = JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,"https://example.test/"));
  f.bundle.url = "https://example.test/"; f.bundle.normalizedUrl = f.bundle.url;
  f.bundle.scanId = "gpc-fixture"; f.policyEvidence.projection.scanId = f.bundle.scanId;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, f.bundle.url, f.policyEvidence)!;
  const parent = deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:f.bundle.url}});parent.californiaPrivacyReview = review;
  const gpc = urls.length ? californiaPriorityGpcFixture(urls) : undefined;
  const packets = buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{...extraRuntime,consentControlAssessment:parent,
    ...(gpc ? {gpcResponseAssessment:gpc,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(gpc,riskPolicy)} : {})}});
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
test("analytics-only collection is a qualified California top issue with intact qualifications, findings and scoring",()=>{
  const r=canonical([ANALYTICS_URL]),row=collection(r);assert.ok(row);
  const before=JSON.stringify(r.packets),score=r.score();
  assert.ok(score.deductions.some(d=>d.findingId===row.id));
  assert.equal(californiaPriorityDemotion(row,r.rows),null);
  const top=selectRegulatoryReview(r.rows,"ccpa_cpra").topIssues;
  assert.ok(top.some(f=>f.id===row.id));
  assert.equal(top.find(f=>f.id===row.id)?.status,"Partial concern");
  assert.notEqual(row.priority,"high");
  for(const scope of [{kind:"page"},{kind:"site",scannedPages:3}] as const){
    const copy=buildAssessmentHighlightsPresentation(r.rows,scope);
    assert.ok([...copy.links,...(copy.expanded?.links??[])].some(link=>link.targetId===findingEvidenceAnchor(row.id)));
    assert.match(`${copy.text} ${copy.expanded?.text??""}`,/sale\/sharing purpose.*unresolved/i);
    assert.match(`${copy.text} ${copy.expanded?.text??""}`,/non-personalized ads declared/);
  }
  const detailed=renderToStaticMarkup(React.createElement(FindingRow,{finding:{...row,focus:"CCPA/CPRA",vendors:[]}}));
  assert.ok(detailed.includes(row.title));assert.match(detailed,/sale\/sharing purpose.*unresolved/i);
  assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
});

for(const [policy,points] of [["california.collection-review.v1",5],["california.collection-review.v2",7],["california.collection-review.v3-retained-scope",7]] as const)
  test(`${policy}: top-issue selection preserves the historical assessment and original score effect`,()=>{
    const r=canonical([ANALYTICS_URL],false,{},false,policy),before=JSON.stringify(r.packets),score=r.score();
    const selected=selectRegulatoryReview(r.rows,"ccpa_cpra").topIssues;
    assert.equal(selected.find(row=>row.id==="california_collection_review")?.status,"Partial concern");
    assert.equal(score.deductions.find(row=>row.findingId==="california_collection_review")?.points,points);
    assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
  });

test("qualified collection joins the top list without upgrading its status or displacing a stronger narrative",()=>{
  const r=canonical([ANALYTICS_URL],true),row=collection(r),before=JSON.stringify(r.packets),score=r.score();
  const baseline=buildRegulatoryAssessmentHighlights(r.rows.filter(f=>f!==row),"ccpa_cpra",{kind:"page"});
  const actual=buildRegulatoryAssessmentHighlights(r.rows,"ccpa_cpra",{kind:"page"});
  assert.deepEqual(actual.topIssues.filter(f=>f.id!==row.id),baseline.topIssues);
  assert.equal(actual.topIssues.find(f=>f.id===row.id)?.status,"Partial concern");
  assert.equal(buildAssessmentBrief(r.rows,{kind:"page"}).secondary.find(f=>f.id===row.id)?.prominence,"supporting");
  assert.ok(actual.highlights.text.startsWith(baseline.highlights.text.split(".")[0]!));
  const text=`${actual.highlights.text} ${actual.highlights.expanded?.text??""}`;
  assert.match(text,/sale\/sharing purpose.*unresolved/i);
  assert.match(text,/non-personalized ads declared/);
  assert.match(text,/does not establish.*(?:opt-out failure|legal violation)|do not establish a legal violation/);
  assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
});

test("supporting collection never borrows another framework or appears as an unqualified title when its whole evidence cannot fit",()=>{
  const r=canonical([ANALYTICS_URL]),row=collection(r);
  const eu=buildRegulatoryAssessmentHighlights(r.rows,"gdpr_eprivacy",{kind:"page"});
  assert.doesNotMatch(`${eu.highlights.text} ${eu.highlights.expanded?.text??""}`,/Collection under privacy-choice|Google LLC|sale\/sharing purpose/);
  const oversized={...row,summary:`${"An unfamiliar processing restriction must remain attached. ".repeat(30)}${row.summary}`};
  const copy=buildAssessmentHighlightsPresentation([oversized],{kind:"page"});
  assert.doesNotMatch(`${copy.text} ${copy.expanded?.text??""}`,/Collection under privacy-choice|An unfamiliar processing restriction/);
  assert.equal(copy.links.length,0);
});

test("sparse California results list collection as review while the sole disclosure omission remains detailed-only",()=>{
  const r=canonical([ANALYTICS_URL],false,{},true),before=JSON.stringify(r.packets),score=r.score();
  const actual=buildRegulatoryAssessmentHighlights(r.rows,"ccpa_cpra",{kind:"page"},{score:score.score});
  assert.deepEqual(actual.topIssues.map(f=>f.id),["california_collection_review"]);
  const copy=`${actual.highlights.text} ${actual.highlights.expanded?.text??""}`;
  assert.match(actual.highlights.text,/^“Collection under privacy-choice conditions”/);
  assert.doesNotMatch(copy,/non-discrimination/i);
  assert.match(copy,/purpose is unresolved|purpose.*remains unresolved/);
  assert.match(copy,/non-personalized ads declared/);
  assert.doesNotMatch(copy,/No priority|No CCPA|Assessment incomplete|collection notices|deduct|points/);
  assert.ok(actual.highlights.text.length<=500);assert.ok((actual.highlights.expanded?.text.length??0)<=1000);
  assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
});

test("purpose-qualified GPC risk precedes collection review in the California ranking",()=>{
  const r=canonical([QUALIFIED_URL,"https://events.hotjar.io/"]),before=JSON.stringify(r.packets),score=r.score();
  const selected=selectRegulatoryReview(r.rows,"ccpa_cpra").topIssues;
  const gpcIndex=selected.findIndex(row=>row.id==="gpc_response");
  const reviewIndex=selected.findIndex(row=>row.id==="california_collection_review");
  assert.ok(gpcIndex>=0 && reviewIndex>gpcIndex);
  assert.equal(selected[reviewIndex]!.status,"Partial concern");
  assert.equal(JSON.stringify(r.packets),before);assert.deepEqual(r.score(),score);
});

test("removing an editorial exclusion cannot promote nonreportable or ineligible collection packets",()=>{
  const r=canonical([ANALYTICS_URL]);
  const original=r.packets.find(packet=>packet.unifiedFindingId==="california_collection_review")!;
  assert.ok(original);
  for(const mutate of [
    (packet:typeof original)=>{packet.surfacingDecision.reportable=false;},
    (packet:typeof original)=>{packet.presentationDecision.status="suppress";},
    (packet:typeof original)=>{packet.concernContext!.promotionEligibilities=[];},
    (packet:typeof original)=>{packet.concernContext!.externalSurfacingEligibilities=[];},
  ]){
    const packet=structuredClone(original);mutate(packet);
    const rows=projectCaliforniaRegulatoryPriorities([packet]);
    assert.ok(!rows.some(row=>row.id==="california_collection_review"));
  }
  const absent=canonical();
  assert.ok(!selectRegulatoryReview(absent.rows,"ccpa_cpra").topIssues.some(row=>row.id==="california_collection_review"));
});

test("an omitted oversized supporting observation cannot lend its action to a different displayed finding",()=>{
  const r=canonical([ANALYTICS_URL],false,{},true),row=collection(r);
  const findings=r.rows.map(f=>f===row?{...f,summary:`${"Unfamiliar qualification. ".repeat(80)}${f.summary}`}:f);
  const copy=buildRegulatoryAssessmentHighlights(findings,"ccpa_cpra",{kind:"page"}).highlights;
  assert.doesNotMatch(`${copy.text} ${copy.expanded?.text??""}`,/non-discrimination/i);
  assert.doesNotMatch(`${copy.text} ${copy.expanded?.text??""}`,/Review effective recipient settings|Unfamiliar qualification|Collection under privacy-choice/);
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
