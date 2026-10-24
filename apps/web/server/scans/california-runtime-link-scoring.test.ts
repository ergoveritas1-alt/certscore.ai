import assert from "node:assert/strict";
import test from "node:test";
import {CALIFORNIA_RUNTIME_LINK_POLICY,CALIFORNIA_DISCLOSURE_CHOICE_POLICY,californiaPrivacyReviewSchema,
  consentControlAssessmentSchema,deriveConsentControlAssessment,type CaliforniaPrivacyReview} from "@certscore/contracts";
import {californiaPriorityGpcFixture,QUALIFIED_URL,ANALYTICS_URL} from "../../lib/scans/test-fixtures/california-priority-gpc";
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {deriveCaliforniaRegulatoryScore,CALIFORNIA_RUNTIME_LINK_SCORE_VERSION} from "../../lib/scans/california-regulatory-score";
import {assessGpcPotentialRisk} from "../../lib/scans/california-potential-risk-policy";
import {projectCaliforniaChoicePresence} from "../../lib/scans/california-choice-presence";

const URL="https://example.test/",ABSENCE="california_privacy_choice_not_observed";
function fixture(urls=[QUALIFIED_URL],policy:typeof CALIFORNIA_RUNTIME_LINK_POLICY|typeof CALIFORNIA_DISCLOSURE_CHOICE_POLICY|undefined=CALIFORNIA_RUNTIME_LINK_POLICY,text=CA_FIXTURE_POLICY) {
  const f=JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,URL)) as ReturnType<typeof californiaCoverageFixture>;
  f.bundle.scanId="gpc-fixture";f.policyEvidence.projection.scanId="gpc-fixture";
  f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";
  if(policy)f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=policy;
  f.bundle.policySurfaceObservations.forEach(r=>r.documentLanguage="en");
  f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture(urls);
  return f;
}
function project(f:ReturnType<typeof fixture>,text=true){
  const r=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,URL,text?f.policyEvidence:undefined);
  assert.ok(r);return r;
}
function canonical(review:CaliforniaPrivacyReview,gpc:unknown){
  const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:URL}});parent.californiaPrivacyReview=review;
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
    runtimeArtifacts:{consentControlAssessment:persisted,gpcResponseAssessment:gpc,californiaGpcPotentialRiskAssessment:assessGpcPotentialRisk(gpc)}});
  const score=deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets});
  return {packets,score,points:score.deductions.find(d=>d.findingId===ABSENCE)?.points??0,persisted};
}

test("runtime basis persists and adds six once alongside the existing fifteen-point GPC family",()=>{
  const f=fixture(),review=project(f),r=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(r.points,6);assert.equal(r.score.score,79);assert.equal(r.score.policyVersion,CALIFORNIA_RUNTIME_LINK_SCORE_VERSION);
  assert.equal(r.score.deductions.find(d=>d.findingId==="gpc_response")?.points,15);
  assert.equal(projectCaliforniaChoicePresence(r.packets,review.scanId,URL)?.state,"not_observed");
  assert.doesNotMatch(r.packets.find(p=>p.unifiedFindingId===ABSENCE)!.summary,/points|deduct|violation/i);
  const duplicate=deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:[...r.packets,...r.packets]});
  assert.equal(duplicate.score,79);assert.equal(duplicate.deductions.filter(d=>d.findingId===ABSENCE).length,1);
});

test("runtime proof does not require English policy text, a sale declaration or complete policy coverage",()=>{
  for(const lang of ["en","ko"]){
    const f=fixture();f.bundle.policySurfaceObservations.forEach(r=>r.documentLanguage=lang);
    const review=project(f,false),r=canonical(review,f.bundle.gpcResponseAssessment);
    assert.equal(r.points,6);assert.equal(r.score.score,79);
    assert.ok(review.contractVersion==="certscore.california-privacy-review.v10"&&!review.reviewCoverage.captureCoverage.policyTextComplete);
  }
});

test("a negative policy claim stays a claim; positive runtime corroboration preserves independent absence review",()=>{
  const text=CA_FIXTURE_POLICY.replace("We do not sell or share personal information.","We do not sell personal information. Under the CCPA, we do not share personal information for cross-context behavioral advertising.");
  const f=fixture([QUALIFIED_URL],CALIFORNIA_RUNTIME_LINK_POLICY,text),review=project(f);assert.ok(review.contractVersion==="certscore.california-privacy-review.v10");
  if(review.contractVersion!=="certscore.california-privacy-review.v10")return;
  assert.equal(review.saleSharingAssessment?.choiceBasis,"declared_neither");
  assert.equal(review.reviewCoverage.families.find(r=>r.id==="privacy_choices")?.status,"review");
  assert.equal(canonical(review,f.bundle.gpcResponseAssessment).points,6);
});

test("source captures without v2 preserve prior absence neutrality despite identical qualified GPC evidence",()=>{
  for(const version of [undefined,CALIFORNIA_DISCLOSURE_CHOICE_POLICY]){
    const f=fixture([QUALIFIED_URL],version);
    // Explicit undefined uses the function default; remove it to emulate old captures.
    if(!version)delete f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy;
    const review=project(f),r=canonical(review,f.bundle.gpcResponseAssessment);
    assert.equal(r.points,0);assert.equal(r.score.score,85);
    assert.notEqual(r.score.policyVersion,CALIFORNIA_RUNTIME_LINK_SCORE_VERSION);
  }
});

test("three-point non-discrimination treatment and qualified collection remain independent in v2",()=>{
  const text=CA_FIXTURE_POLICY.replace("We will not discriminate against you for exercising your privacy rights. ","");
  const f=fixture([QUALIFIED_URL],CALIFORNIA_RUNTIME_LINK_POLICY,text),r=canonical(project(f),f.bundle.gpcResponseAssessment);
  assert.equal(r.points,6);assert.equal(r.score.deductions.find(d=>d.findingId==="california_rights_disclosure_not_observed")?.points,3);
  assert.equal(r.score.score,76);
});

test("analytics-only collection, restricted processing, failed or unverified GPC cannot supply the runtime basis",()=>{
  const f=fixture([ANALYTICS_URL]),r=canonical(project(f),f.bundle.gpcResponseAssessment);
  assert.equal(r.points,0);assert.equal(r.score.deductions.find(d=>d.findingId==="california_collection_review")?.points,7);
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.delivery.httpHeaderRetained=false;},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.documentUrlSha256="f".repeat(64);},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.scanId="other";},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.requests.advertisingCollectionQualification!.rows.forEach(r=>r.processingSignals=["google_rdp"]);},
  ]){const changed=fixture();mutate(changed);assert.equal(canonical(project(changed),changed.bundle.gpcResponseAssessment).points,0);}
});

test("a stored runtime proof alone or an ineligible sibling GPC finding does not authorize an extra deduction",()=>{
  const f=fixture(),review=project(f),r=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(canonical(review,undefined).points,0);
  for(const packets of [r.packets.filter(p=>p.unifiedFindingId!=="gpc_response"),
    r.packets.map(p=>p.unifiedFindingId==="gpc_response"?{...p,scoreEffects:[]}:p),
    r.packets.map(p=>p.unifiedFindingId==="gpc_response"?{...p,presentationDecision:{...p.presentationDecision,status:"suppress" as const}}:p)]) {
    const score=deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets});
    assert.ok(!score.deductions.some(d=>d.findingId===ABSENCE));
  }
});

test("runtime proof source, session, request and inspection joins fail closed",()=>{
  const f=fixture(),review=project(f);assert.ok(review.contractVersion==="certscore.california-privacy-review.v10");
  if(review.contractVersion!=="certscore.california-privacy-review.v10"||review.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_RUNTIME_LINK_POLICY)throw Error("Expected new runtime assessment");
  for(const field of ["gpcSourceSha256","gpcSessionSha256","documentUrlSha256"] as const){
    const changed:typeof review=structuredClone(review);
    if(changed.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_RUNTIME_LINK_POLICY)throw Error("Wrong policy");
    changed.disclosureChoiceAssessment.runtimeLinkProof![field]="d".repeat(64);
    assert.equal(canonical(changed,f.bundle.gpcResponseAssessment).points,0,field);
  }
  const changed:typeof review=structuredClone(review);
  if(changed.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_RUNTIME_LINK_POLICY)throw Error("Wrong policy");
  changed.disclosureChoiceAssessment.runtimeLinkProof!.inspectionSourceHash="d".repeat(64);
  assert.equal(californiaPrivacyReviewSchema.safeParse(changed).success,false);
});
