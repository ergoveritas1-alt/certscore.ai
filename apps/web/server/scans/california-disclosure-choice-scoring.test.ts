import {californiaPriorityGpcFixture,ANALYTICS_URL,QUALIFIED_URL} from "../../lib/scans/test-fixtures/california-priority-gpc";
import {assessGpcPotentialRisk} from "../../lib/scans/california-potential-risk-policy";
import assert from "node:assert/strict";
import test from "node:test";
import {CALIFORNIA_DISCLOSURE_CHOICE_POLICY,californiaPrivacyReviewSchema,consentControlAssessmentSchema,
  deriveConsentControlAssessment,derivePolicySurfaceInspectionOutcome, type CaliforniaPrivacyReview} from "@certscore/contracts";
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {deriveCaliforniaRegulatoryScore,CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION} from "../../lib/scans/california-regulatory-score";
import {projectCaliforniaRegulatoryPriorities} from "../../lib/scans/california-regulatory-priorities";
import {selectRegulatoryReview} from "../../lib/scans/regulatory-review-catalog";
import {projectCaliforniaChoicePresence} from "../../lib/scans/california-choice-presence";

const RIGHTS="california_rights_disclosure_not_observed",ABSENCE="california_privacy_choice_not_observed";
const noNonDiscrimination=CA_FIXTURE_POLICY.replace("We will not discriminate against you for exercising your privacy rights. ","");
const declaresSale=CA_FIXTURE_POLICY.replace("We do not sell or share personal information.","Under the CCPA, we sell personal information.");
function fixture(text:string, current=true) {
  const f=californiaCoverageFixture(text);
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  if(current)f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_DISCLOSURE_CHOICE_POLICY;
  f.bundle.policySurfaceObservations.forEach(row=>{row.documentLanguage="en";});
  return f;
}
function materialize(f:ReturnType<typeof fixture>) {
  const value=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence);
  assert.ok(value);return value;
}
function pipeline(value:CaliforniaPrivacyReview,runtimeArtifacts:Record<string,unknown>={}) {
  const original=JSON.stringify(value);
  const parent=deriveConsentControlAssessment({scan:{scanId:value.scanId,finalUrl:value.documentUrl}});
  parent.californiaPrivacyReview=value;
  const retained=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
    runtimeArtifacts:{...runtimeArtifacts,consentControlAssessment:retained}});
  const score=deriveCaliforniaRegulatoryScore({assessment:retained.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets});
  assert.equal(JSON.stringify(value),original);
  return {retained,packets,score,points:(id:string)=>score.deductions.find(d=>d.findingId===id)?.points??0};
}

test("new capture marker survives the canonical inspection outcome",()=>{
  const f=fixture(CA_FIXTURE_POLICY);
  const inspection=derivePolicySurfaceInspectionOutcome({californiaReviewPolicy:"california-privacy-review.v10",
    californiaDisclosureChoicePolicy:CALIFORNIA_DISCLOSURE_CHOICE_POLICY,privacyChoiceInspection:f.bundle.policySurfaceInspection!.privacyChoiceInspection});
  assert.equal(inspection.californiaDisclosureChoicePolicy,CALIFORNIA_DISCLOSURE_CHOICE_POLICY);
});

test("new non-discrimination-only effect is three points through persisted concern/policy/finding/score; legacy stays twelve",()=>{
  const historical=materialize(fixture(noNonDiscrimination,false));
  const original=JSON.stringify(historical),old=pipeline(historical);
  assert.equal(old.points(RIGHTS),12);
  const current=materialize(fixture(noNonDiscrimination));
  const result=pipeline(current);
  assert.equal(result.points(RIGHTS),3);assert.equal(result.score.score,97);
  assert.equal(result.score.policyVersion,CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION);
  const packet=result.packets.find(p=>p.unifiedFindingId===RIGHTS)!;
  assert.equal(packet.surfacingDecision.reportable,true);
  assert.doesNotMatch(packet.summary,/deduct|points/i);
  assert.equal(packet.scoreEffects?.[0]?.deductionPoints,3);
  assert.equal(packet.scoreEffects?.[0]?.policyVersion,CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION);
  const display=projectCaliforniaRegulatoryPriorities(result.packets).map((row,index)=>({...row,rank:index+1}));
  assert.ok(display.some(d=>d.id===RIGHTS));
  assert.ok(!selectRegulatoryReview(display,"ccpa_cpra").topIssues.some(d=>d.id===RIGHTS));
  assert.equal(JSON.stringify(historical),original);assert.equal(pipeline(historical).points(RIGHTS),12);
});

test("other rights under review do not become omissions or block the three-point sole proven omission",()=>{
  const text=noNonDiscrimination.replace("You have the right to know what personal information we collect.","Access to our platform requires an account.");
  const review=materialize(fixture(text));
  assert.equal(review.contractVersion,"certscore.california-privacy-review.v10");
  if(review.contractVersion!=="certscore.california-privacy-review.v10")return;
  assert.equal(review.rightsAssessment?.topics.find(t=>t.topic==="right_to_know")?.status,"review");
  assert.equal(pipeline(review).points(RIGHTS),3);
});

test("broader core-rights omissions retain twelve once; no omission gives no rights deduction",()=>{
  for(const text of [noNonDiscrimination.replace("You have the right to delete your personal information. ",""),
    CA_FIXTURE_POLICY.replace("You have the right to delete your personal information. ","")]) {
    const result=pipeline(materialize(fixture(text)));
    assert.equal(result.points(RIGHTS),12);assert.equal(result.score.deductions.filter(d=>d.findingId===RIGHTS).length,1);
  }
  assert.equal(pipeline(materialize(fixture(CA_FIXTURE_POLICY))).points(RIGHTS),0);
});

test("complete absence, explicit California sale declaration and missing signal disclosures support six once",()=>{
  const review=materialize(fixture(declaresSale)),result=pipeline(review);
  assert.equal(review.choiceSurface,"not_observed_in_inspected_scope");
  assert.ok(review.contractVersion==="certscore.california-privacy-review.v10"&&review.disclosureChoiceAssessment?.requiredLinkProof);
  assert.equal(result.points(ABSENCE),6);assert.equal(result.score.score,94);
  assert.doesNotMatch(result.packets.find(p=>p.unifiedFindingId===ABSENCE)!.summary,/deduct|points/i);
  assert.equal(projectCaliforniaChoicePresence(result.packets,review.scanId,review.documentUrl)?.state,"not_observed");
  const duplicated=deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:[...result.packets,...result.packets]});
  assert.equal(duplicated.score,94);assert.equal(duplicated.deductions.filter(d=>d.findingId===ABSENCE).length,1);
  const historical=pipeline(materialize(fixture(declaresSale,false)));
  assert.equal(historical.points(ABSENCE),0);assert.equal(historical.score.score,100);
});

test("the approved three- and six-point effects may coexist without duplicating the rights family",()=>{
  const result=pipeline(materialize(fixture(declaresSale.replace("We will not discriminate against you for exercising your privacy rights. ",""))));
  assert.equal(result.points(RIGHTS),3);assert.equal(result.points(ABSENCE),6);assert.equal(result.score.score,91);
});

test("possible signal alternatives, ambiguous or conflicting declarations remain score-neutral for absence",()=>{
  for(const addition of ["We process Global Privacy Control signals.","We process global-privacy-control preferences.","We use frictionless processing.",
    "We recognize browser privacy settings.","We honor universal opt-out preferences.","We do not respond to DNT signals.",
    "We process opt-out requests automatically."]) {
    const review=materialize(fixture(declaresSale+" "+addition));
    assert.equal(pipeline(review).points(ABSENCE),0,addition);
    assert.equal(review.choiceSurface,"not_observed_in_inspected_scope");
  }
  for(const text of [CA_FIXTURE_POLICY,
    declaresSale.replace("Under the CCPA, we sell personal information.","We use analytics to understand visits."),
    declaresSale.replace("Under the CCPA, we sell personal information.","We sell personal information."),
    declaresSale+" We do not sell personal information.",
    declaresSale.replace("Under the CCPA, we sell personal information.","Unlike California law, we sell personal information in Nevada."),
    declaresSale.replace("Under the CCPA, we sell personal information.","For example, under the CCPA we sell personal information."),
    declaresSale.replace("Under the CCPA, we sell personal information.","If California law applies, we may sell personal information.")])
    assert.equal(pipeline(materialize(fixture(text))).points(ABSENCE),0,text);
});

test("incomplete policy, unsupported language, missing text and limited inventory do not support six",()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceObservations.forEach(r=>r.documentLanguage="de");},
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceObservations.forEach(r=>r.translationApplied=true);},
    (f:ReturnType<typeof fixture>)=>{f.policyEvidence.texts=[];},
    (f:ReturnType<typeof fixture>)=>{f.policyEvidence.projection.documents[0]!.documentTextCoverage.status="truncated";},
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";},
  ]) {
    const f=fixture(declaresSale);mutate(f);const review=materialize(f);
    assert.equal(pipeline(review).points(ABSENCE),0);
  }
});

test("positive links preserve presence, prevent absence proof and do not acquire a deduction",()=>{
  const f=fixture(declaresSale);
  f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!,observationId:"choice",
    surfaceType:"do_not_sell_or_share",linkText:"Do Not Sell or Share My Personal Information",url:CA_FIXTURE_URL+"choice",normalizedUrl:CA_FIXTURE_URL+"choice"});
  const review=materialize(f);assert.equal(review.choiceSurface,"observed");
  assert.equal(pipeline(review).points(ABSENCE),0);
  assert.ok(review.choicePresence?.links.length);
  assert.equal(projectCaliforniaChoicePresence(pipeline(review).packets,review.scanId,review.documentUrl)?.state,"observed");
});

test("cross-scan/source/document proofs, invented documents and declaration mutations fail validation",()=>{
  const original=materialize(fixture(declaresSale));
  assert.equal(original.contractVersion,"certscore.california-privacy-review.v10");
  if(original.contractVersion!=="certscore.california-privacy-review.v10")return;
  assert.ok(original.disclosureChoiceAssessment?.requiredLinkProof);
  for(const mutate of [
    (r:typeof original)=>{r.disclosureChoiceAssessment!.scanId="another-scan";},
    (r:typeof original)=>{r.disclosureChoiceAssessment!.sourceHash="c".repeat(64);},
    (r:typeof original)=>{r.disclosureChoiceAssessment!.documentUrl=CA_FIXTURE_URL+"other";},
    (r:typeof original)=>{r.disclosureChoiceAssessment!.requiredLinkProof!.documents[0]!.textSha256="d".repeat(64);},
    (r:typeof original)=>{r.disclosureChoiceAssessment!.requiredLinkProof!.declaration.textSha256="e".repeat(64);},
    (r:typeof original)=>{r.disclosureChoiceAssessment!.requiredLinkProof!.documents.pop();},
    (r:typeof original)=>{r.choiceSurface="unknown";},
  ]){const changed:typeof original=structuredClone(original);mutate(changed);assert.equal(californiaPrivacyReviewSchema.safeParse(changed).success,false);}
  const result=pipeline(original);
  for(const changedPackets of [result.packets.map(p=>({...p,scoreEffects:[]})),
    result.packets.map(p=>({...p,scoreEffects:p.scoreEffects?.map(e=>({...e,policyVersion:"california-regulatory-posture.v12-observed"}))}))])
    assert.equal(deriveCaliforniaRegulatoryScore({assessment:original,checklistRows:[],unifiedFindings:changedPackets}).score,null);
});

test("an older contract rejects new scoring metadata rather than silently changing its historical effect",()=>{
  const current=materialize(fixture(declaresSale));
  assert.equal(californiaPrivacyReviewSchema.safeParse({...current,contractVersion:"certscore.california-privacy-review.v9",policyVersion:"california-privacy-review.v9"}).success,false);
});


test("new disclosure policy preserves the analytics and full GPC recipient schedules",()=>{
  for(const [url,points] of [[ANALYTICS_URL,7],[QUALIFIED_URL,15]] as const) {
    const f=fixture(noNonDiscrimination);f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId="gpc-fixture";
    const review=materialize(f),gpc=californiaPriorityGpcFixture([url]),risk=assessGpcPotentialRisk(gpc);
    const runtime={gpcResponseAssessment:gpc,californiaGpcPotentialRiskAssessment:risk};
    const result=pipeline(review,runtime);
    assert.equal(result.points(RIGHTS),3);assert.equal(result.score.score,100-3-points);
    assert.equal(result.score.policyVersion,CALIFORNIA_DISCLOSURE_CHOICE_SCORE_VERSION);
    assert.equal(result.score.deductions.filter(d=>d.findingId!==RIGHTS).reduce((sum,d)=>sum+d.points,0),points);
  }
});
