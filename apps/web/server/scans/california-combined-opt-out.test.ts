import {projectAdminScoringEntityCounts} from "../admin/admin-scan-posture-score";
import {SCAN_REPORT_PROJECTION_VERSION} from "./scan-report-projection-contract";
import assert from "node:assert/strict";
import test from "node:test";
import {CALIFORNIA_COMBINED_OPT_OUT_POLICY,CALIFORNIA_NINE_POINT_LINK_POLICY,californiaPrivacyReviewSchema,
  consentControlAssessmentSchema,deriveConsentControlAssessment,gpcResponseAssessmentSchema,type CaliforniaPrivacyReview} from "@certscore/contracts";
import {californiaPriorityGpcFixture,californiaPriorityRejectFixture,QUALIFIED_URL,UNRESOLVED_AD_URL,ANALYTICS_URL} from "../../lib/scans/test-fixtures/california-priority-gpc";
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {deriveCaliforniaRegulatoryScore} from "../../lib/scans/california-regulatory-score";
import {projectCaliforniaRegulatoryPriorities} from "../../lib/scans/california-regulatory-priorities";
import {selectCaliforniaPriorityFindings} from "../../lib/scans/california-priority-selection";
import {CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY} from "../../lib/scans/california-choice-enforcement-policy";
import {CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION} from "../../lib/scans/scoring-policy";
const URL="https://example.test/",ID="california_privacy_choice_not_observed";
const declaration=CA_FIXTURE_POLICY.replace("We do not sell or share personal information.","Under the CCPA, we sell personal information for cross-context behavioral advertising.");
function fixture(urls=[QUALIFIED_URL],text=CA_FIXTURE_POLICY,policy:typeof CALIFORNIA_COMBINED_OPT_OUT_POLICY|typeof CALIFORNIA_NINE_POINT_LINK_POLICY=CALIFORNIA_COMBINED_OPT_OUT_POLICY){
  const f=JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,URL)) as ReturnType<typeof californiaCoverageFixture>;
  f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId="gpc-fixture";
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=policy;
  f.bundle.policySurfaceObservations.forEach(r=>r.documentLanguage="en");
  f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture(urls);
  return f;
}
function project(f:ReturnType<typeof fixture>){
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,URL,f.policyEvidence);
  assert.ok(review?.contractVersion==="certscore.california-privacy-review.v10");return review;
}
function pipeline(review:CaliforniaPrivacyReview,gpc:unknown,reject?:Record<string,unknown>){
  const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
    runtimeArtifacts:{...reject,consentControlAssessment:persisted,gpcResponseAssessment:gpc}});
  return {packets,score:deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}),
    top:selectCaliforniaPriorityFindings(projectCaliforniaRegulatoryPriorities(packets))};
}
function supported(f:ReturnType<typeof fixture>){
  // Explicit synthetic typed state for the policy matrix, never a retained-site repair.
  const a=f.bundle.gpcResponseAssessment!;assert.ok(a.contractVersion==="certscore.gpc-response-assessment.v3");
  a.observation.status="complete";a.observation.delivery.fullContextVerified=true;a.observation.requests.complete=true;
  a.observation.semanticProbe="observed";a.observation.limitationKeys=[];
  a.observation.registration={basis:"current_recorded_state",cmpGpcSignal:"received",sale:"opted_out",sharing:"opted_out",causedByGpc:"not_established"};
  gpcResponseAssessmentSchema.parse(a);return a;
}
function combinedPoints(r:ReturnType<typeof pipeline>){return r.score.deductions.filter(d=>d.findingId===ID).map(d=>d.points);}

test("new combined risk persists, scores fifteen once and keeps GPC in expanded top-finding details",()=>{
  const f=fixture(),review=project(f),r=pipeline(review,f.bundle.gpcResponseAssessment);
  assert.equal(review.disclosureChoiceAssessment?.policyVersion,CALIFORNIA_COMBINED_OPT_OUT_POLICY);
  assert.equal(r.score.policyVersion,CALIFORNIA_COMBINED_OPT_OUT_SCORE_VERSION);
  assert.equal(r.score.score,85);assert.deepEqual(combinedPoints(r),[15]);
  assert.equal(r.score.deductions.filter(d=>d.policyKey===CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY).length,1);
  const p=r.packets.find(p=>p.unifiedFindingId===ID)!;
  assert.equal(p.severity,"high");assert.match(p.title,/Potential failure of California opt-out rights/);
  assert.equal(r.top.filter(p=>p.id===ID||p.id==="gpc_response").length,1);
  assert.ok(r.top.find(p=>p.id===ID)?.evidenceJson.combinedGpcFacts);
  assert.ok(r.packets.some(p=>p.unifiedFindingId==="gpc_response"),"GPC remains available in detailed evidence and scoring inputs");
  assert.doesNotMatch(r.top.find(p=>p.id===ID)!.summary,/points|deduct|15|8/);
  const duplicate=deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:[...r.packets,...r.packets]});
  assert.equal(duplicate.score,85);assert.equal(duplicate.deductions.filter(d=>d.policyKey===CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY).length,1);
});

test("supported recorded GPC plus independent required-method proof scores eight; missing proof or unknown response scores neither branch",()=>{
  const f=fixture([UNRESOLVED_AD_URL],declaration);supported(f);
  const review=project(f),r=pipeline(review,f.bundle.gpcResponseAssessment);
  assert.ok(review.disclosureChoiceAssessment?.requiredLinkProof);
  assert.deepEqual(combinedPoints(r),[8]);assert.equal(r.score.score,92);
  assert.equal(r.packets.find(p=>p.unifiedFindingId===ID)?.severity,"medium");
  assert.equal(r.top.find(p=>p.id===ID)?.title,"Potential missing sale/sharing opt-out method");
  for(const missing of [fixture([UNRESOLVED_AD_URL],declaration),fixture([UNRESOLVED_AD_URL])]){
    if(missing.policyEvidence.texts[0]!.text===CA_FIXTURE_POLICY)supported(missing);
    assert.deepEqual(combinedPoints(pipeline(project(missing),missing.bundle.gpcResponseAssessment)),[]);
  }
});

test("unresolved GPC, analytics, delivery-only ads and missing advertising activity cannot create a combined risk",()=>{
  for(const urls of [[],[ANALYTICS_URL],[UNRESOLVED_AD_URL]]){
    const f=fixture(urls,declaration),r=pipeline(project(f),f.bundle.gpcResponseAssessment);
    assert.deepEqual(combinedPoints(r),[]);assert.equal(r.top.some(p=>p.id===ID),false);
  }
  const f=fixture([],declaration),a=supported(f);a.observation.registration.sale="not_opted_out";
  assert.deepEqual(combinedPoints(pipeline(project(f),a)),[],"Semantic contradiction alone still requires observed advertising activity");
});

test("a broad positive prevents combined absence; standalone qualifying GPC remains",()=>{
  const f=fixture([QUALIFIED_URL],declaration+` For more information and to exercise your right to opt-out of Selling and Sharing, please see our "Your Privacy Choices" page, which contains our Notice of the Right to Opt-Out and opt-out mechanism.`);
  const review=project(f),r=pipeline(review,f.bundle.gpcResponseAssessment);
  assert.equal(review.broadOptOutAssessment?.state,"observed");assert.deepEqual(combinedPoints(r),[]);
  assert.equal(r.top.some(p=>p.id==="gpc_response"),true);assert.equal(r.score.score,85);
});

test("scoped absence, wrong scan/document, unverified delivery and restrictions cannot promote the combined finding",()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.scanId="other";},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.documentUrlSha256="f".repeat(64);},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.delivery.httpHeaderRetained=false;},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.requests.advertisingCollectionQualification!.rows.forEach(r=>r.processingSignals=["google_rdp"]);},
  ]){const f=fixture();mutate(f);assert.deepEqual(combinedPoints(pipeline(project(f),f.bundle.gpcResponseAssessment)),[]);}
});

test("persisted proof cannot score after the original runtime evidence is removed or changed",()=>{
  const f=fixture(),review=project(f);
  assert.deepEqual(combinedPoints(pipeline(review,undefined)),[]);
  const gpc=structuredClone(f.bundle.gpcResponseAssessment!);
  if(gpc.contractVersion!=="certscore.gpc-response-assessment.v3")throw Error("fixture");
  gpc.observation.sessionSha256="d".repeat(64);
  assert.deepEqual(combinedPoints(pipeline(review,gpc)),[]);
  const tampered=structuredClone(review);
  if(tampered.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_COMBINED_OPT_OUT_POLICY)throw Error("fixture");
  tampered.disclosureChoiceAssessment.optOutRisk!.recipientIds=[];
  assert.deepEqual(combinedPoints(pipeline(tampered,f.bundle.gpcResponseAssessment)),[]);
});

test("v3 history keeps nine plus existing GPC; v4 is fifteen total over the same synthetic evidence",()=>{
  const old=fixture([QUALIFIED_URL],CA_FIXTURE_POLICY,CALIFORNIA_NINE_POINT_LINK_POLICY),next=fixture();
  assert.equal(pipeline(project(old),old.bundle.gpcResponseAssessment).score.score,76);
  assert.equal(pipeline(project(next),next.bundle.gpcResponseAssessment).score.score,85);
});


test("recipient scaling and cross-path union replace overlapping charges",()=>{
  const linkedIn="https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture";
  const f=fixture([QUALIFIED_URL,QUALIFIED_URL,linkedIn]),review=project(f);
  const two=pipeline(review,f.bundle.gpcResponseAssessment,californiaPriorityRejectFixture());
  assert.deepEqual(combinedPoints(two),[25]);assert.equal(two.score.score,75);
  assert.equal(two.score.deductions.filter(d=>d.policyKey===CALIFORNIA_CHOICE_ENFORCEMENT_POLICY_KEY).length,1);
  assert.ok(two.packets.some(p=>p.unifiedFindingId==="california_post_reject_collection"));
  const one=fixture(),r=pipeline(project(one),one.bundle.gpcResponseAssessment,californiaPriorityRejectFixture());
  assert.deepEqual(combinedPoints(r),[15]);assert.equal(r.score.score,85);
  const medium=fixture([UNRESOLVED_AD_URL],declaration);supported(medium);
  const stronger=pipeline(project(medium),medium.bundle.gpcResponseAssessment,californiaPriorityRejectFixture());
  assert.equal(stronger.score.score,85,"Eight is absorbed by stronger enforcement evidence, not added to fifteen");
  assert.deepEqual(combinedPoints(stronger),[15]);
});

test("a same-document semantic contradiction can use the base with advertising evidence and unknown recipients",()=>{
  const f=fixture([UNRESOLVED_AD_URL],declaration),a=supported(f);a.observation.registration.sharing="not_opted_out";
  const r=pipeline(project(f),a);assert.deepEqual(combinedPoints(r),[15]);
  const noAds=fixture([],declaration),b=supported(noAds);b.observation.registration.sharing="not_opted_out";
  assert.deepEqual(combinedPoints(pipeline(project(noAds),b)),[]);
});

test("combined score recomputation rejects missing or mismatched canonical effects",()=>{
  const f=fixture(),review=project(f),r=pipeline(review,f.bundle.gpcResponseAssessment);
  for(const packets of [r.packets.filter(p=>p.unifiedFindingId!==ID),r.packets.map(p=>p.unifiedFindingId===ID?{...p,scoreEffects:[]}:p),
    r.packets.map(p=>p.unifiedFindingId===ID?{...p,scoreEffects:p.scoreEffects?.map(e=>({...e,deductionPoints:8}))}:p)]){
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets}).score,null);
  }
  const forged=structuredClone(review);
  forged.broadOptOutAssessment={...forged.broadOptOutAssessment!,state:"observed"};
  assert.equal(californiaPrivacyReviewSchema.safeParse(forged).success,false);
});

test("legacy collection semantics cannot supply a new current-policy combined contradiction",()=>{
  const f=fixture(),a=f.bundle.gpcResponseAssessment!;
  assert.ok(a.contractVersion==="certscore.gpc-response-assessment.v3");
  delete a.observation.requests.advertisingCollectionQualification;
  delete a.observation.requests.gppPropagation;
  gpcResponseAssessmentSchema.parse(a);
  const r=pipeline(project(f),a);
  assert.deepEqual(combinedPoints(r),[]);
  assert.ok(r.packets.some(p=>p.unifiedFindingId==="gpc_response"),"Historical independent GPC semantics are preserved");
});


test("Admin GPC entity counts follow the applied combined recipient family",()=>{
  const f=fixture([QUALIFIED_URL,"https://px.ads.linkedin.com/collect?pid=publisher&li_adsId=visitor-fixture"]),review=project(f),r=pipeline(review,f.bundle.gpcResponseAssessment);
  const snapshot={report_projection_status:"ready",report_projection_version:SCAN_REPORT_PROJECTION_VERSION,report_projection_computed_at:f.bundle.completedAt,
    admin_canonical_score_input:{scanId:review.scanId,projectionScanId:review.scanId,assessment:review,gpcAssessment:f.bundle.gpcResponseAssessment,
      unifiedFindings:r.packets,checklistRows:[]}};
  assert.equal(projectAdminScoringEntityCounts(review.scanId,snapshot,false).gpc,2);
  assert.equal(projectAdminScoringEntityCounts(review.scanId,{...snapshot,admin_canonical_score_input:{...snapshot.admin_canonical_score_input,unifiedFindings:[]}},false).gpc,null);
});
