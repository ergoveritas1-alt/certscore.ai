import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {CALIFORNIA_NINE_POINT_LINK_POLICY,CALIFORNIA_RUNTIME_LINK_POLICY,CALIFORNIA_DISCLOSURE_CHOICE_POLICY,californiaPrivacyReviewSchema,
  consentControlAssessmentSchema,deriveConsentControlAssessment,privacyChoiceInspectionSchema,type CaliforniaPrivacyReview} from "@certscore/contracts";
import {californiaPriorityGpcFixture,QUALIFIED_URL,ANALYTICS_URL} from "../../lib/scans/test-fixtures/california-priority-gpc";
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {deriveCaliforniaRegulatoryScore,CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION,CALIFORNIA_RUNTIME_LINK_SCORE_VERSION} from "../../lib/scans/california-regulatory-score";
import {assessGpcPotentialRisk} from "../../lib/scans/california-potential-risk-policy";
import {projectCaliforniaChoicePresence} from "../../lib/scans/california-choice-presence";
import {projectCaliforniaOptOutPresence} from "../../lib/scans/california-choice-presence";
import {OPT_OUT_ABSENCE_FINDING_ID} from "@certscore/contracts";

const URL="https://example.test/",ABSENCE="california_privacy_choice_not_observed";
function fixture(urls=[QUALIFIED_URL],policy:typeof CALIFORNIA_NINE_POINT_LINK_POLICY|typeof CALIFORNIA_RUNTIME_LINK_POLICY|typeof CALIFORNIA_DISCLOSURE_CHOICE_POLICY|undefined=CALIFORNIA_RUNTIME_LINK_POLICY,text=CA_FIXTURE_POLICY) {
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
  const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
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

test("newly complete Not observed evidence enters the existing six-point finding rather than a neutral alternative",()=>{
  const complete=fixture(),limited=structuredClone(complete);
  limited.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";
  const beforeReview=project(limited),afterReview=project(complete);
  assert.ok(afterReview.contractVersion==="certscore.california-privacy-review.v10"&&afterReview.optOutNegativeSearch);
  const before=canonical(beforeReview,limited.bundle.gpcResponseAssessment),after=canonical(afterReview,complete.bundle.gpcResponseAssessment);
  assert.equal(projectCaliforniaOptOutPresence(before.packets,beforeReview.scanId,URL).state,"unknown");
  assert.equal(projectCaliforniaOptOutPresence(after.packets,afterReview.scanId,URL).state,"not_observed");
  assert.equal(before.points,0);assert.equal(after.points,6);assert.equal(before.score.score!-after.score.score!,6);
  assert.ok(after.packets.find(p=>p.unifiedFindingId===ABSENCE)?.scoreEffects?.some(e=>e.appliesTo==="california_posture"&&e.deductionPoints===6));
  assert.equal(after.packets.some(p=>p.unifiedFindingId===OPT_OUT_ABSENCE_FINDING_ID),false,"Qualifying absence is not routed to the neutral informational finding");
  const duplicate=deriveCaliforniaRegulatoryScore({assessment:afterReview,checklistRows:[],unifiedFindings:[...after.packets,...after.packets]});
  assert.equal(duplicate.deductions.filter(d=>d.findingId===ABSENCE).length,1);
  assert.equal(canonical(afterReview,undefined).points,0,"Missing runtime corroboration cannot reuse a stored scoring proof");
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
    // Keep the new internal cross-proof join consistent so this case still
    // exercises revalidation against the original, unchanged GPC assessment.
    if(changed.frictionlessGpcException?.gpcContradiction){
      const paired={gpcSourceSha256:"sourceSha256",gpcSessionSha256:"sessionSha256",documentUrlSha256:"documentUrlSha256"} as const;
      changed.frictionlessGpcException.gpcContradiction[paired[field]]="d".repeat(64);
    }
    assert.equal(canonical(changed,f.bundle.gpcResponseAssessment).points,0,field);
  }
  const changed:typeof review=structuredClone(review);
  if(changed.disclosureChoiceAssessment?.policyVersion!==CALIFORNIA_RUNTIME_LINK_POLICY)throw Error("Wrong policy");
  changed.disclosureChoiceAssessment.runtimeLinkProof!.inspectionSourceHash="d".repeat(64);
  assert.equal(californiaPrivacyReviewSchema.safeParse(changed).success,false);
});


test("a legacy complete inspection cannot gain runtime scoring or discard other valid evidence",()=>{
  const f=fixture(),i=f.bundle.policySurfaceInspection!.privacyChoiceInspection!;
  const fields=["documentUrl","capturedAt","sourceHash","scope","coverage","namedChoiceCandidateCount","unnamedControlCount",
    "candidateEnumerationTruncated","uninspectedFrameCount","uninspectedShadowRootCount","supportedDocumentLanguage","representativeDocument","documentStable","rightsMethods"];
  f.bundle.policySurfaceInspection!.privacyChoiceInspection={contractVersion:"certscore.privacy-choice-inspection.v1",
    ...Object.fromEntries(Object.entries(i).filter(([key])=>fields.includes(key)))} as typeof i;
  const review=project(f);assert.equal(canonical(review,f.bundle.gpcResponseAssessment).points,0);
});

test("exact query-bound complete inspection uses the existing six-point rule and cannot borrow another document",()=>{
  const exact=URL+"?redirect=%2F";
  const f=JSON.parse(JSON.stringify(fixture()).replaceAll(JSON.stringify(URL),JSON.stringify(exact))) as ReturnType<typeof fixture>;
  const gpc=f.bundle.gpcResponseAssessment!;
  assert.equal(gpc.contractVersion,"certscore.gpc-response-assessment.v3");
  if(gpc.contractVersion!=="certscore.gpc-response-assessment.v3")throw new Error("Expected synthetic v3 fixture");
  // This is synthetic typed evidence, never a retained-source repair. Its
  // independently joined document hash must match the query-bearing URL too.
  gpc.observation.documentUrlSha256=createHash("sha256").update(exact).digest("hex");
  f.bundle.policySurfaceInspection!.privacyChoiceInspection=privacyChoiceInspectionSchema.parse({
    ...f.bundle.policySurfaceInspection!.privacyChoiceInspection,
    contractVersion:"certscore.privacy-choice-inspection.v7",documentUrl:exact,
    readinessPolicy:"document_bound_dom_inventory.v1",documentReadyState:"complete",limitationKeys:[],
  });
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,exact,f.policyEvidence)!;
  assert.ok(review);assert.equal(review.choiceSurface,"not_observed_in_inspected_scope");
  assert.equal(canonical(review,f.bundle.gpcResponseAssessment).points,6);
  const unbound=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,URL,f.policyEvidence)!;
  assert.equal(unbound.choiceSurface,"unknown");
  assert.equal(canonical(unbound,f.bundle.gpcResponseAssessment).points,0);
});


test("new nine-point policy persists, scores once and preserves the six-point historical runtime policy",()=>{
  for(const [policy,points,total] of [[CALIFORNIA_RUNTIME_LINK_POLICY,6,79],[CALIFORNIA_NINE_POINT_LINK_POLICY,9,76]] as const){
    const f=fixture([QUALIFIED_URL],policy),review=project(f),result=canonical(review,f.bundle.gpcResponseAssessment);
    assert.equal(result.points,points);assert.equal(result.score.score,total);
    assert.equal(result.score.policyVersion,policy===CALIFORNIA_NINE_POINT_LINK_POLICY?CALIFORNIA_NINE_POINT_LINK_SCORE_VERSION:CALIFORNIA_RUNTIME_LINK_SCORE_VERSION);
    assert.equal(result.score.deductions.find(d=>d.findingId==="gpc_response")?.points,15);
    assert.ok(review.contractVersion==="certscore.california-privacy-review.v10"&&review.optOutNegativeSearch);
    assert.ok(!result.packets.some(p=>p.unifiedFindingId===OPT_OUT_ABSENCE_FINDING_ID));
    const duplicate=deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:[...result.packets,...result.packets]});
    assert.equal(duplicate.score,total);assert.equal(duplicate.deductions.filter(d=>d.findingId===ABSENCE).length,1);
    assert.equal(canonical(review,undefined).points,0,"Stored proof cannot replace independently verified GPC");
    assert.doesNotMatch(result.packets.find(p=>p.unifiedFindingId===ABSENCE)!.summary,/deduct|points/i);
  }
});

test("new nine-point weight does not relax complete inspection, identity or runtime eligibility",()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";},
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.unnamedControlCount=1;},
    (f:ReturnType<typeof fixture>)=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.uninspectedFrameCount=1;},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.scanId="other";},
    (f:ReturnType<typeof fixture>)=>{const a=f.bundle.gpcResponseAssessment!;if(a.contractVersion==="certscore.gpc-response-assessment.v3")a.observation.delivery.httpHeaderRetained=false;},
  ]){const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY);mutate(f);assert.equal(canonical(project(f),f.bundle.gpcResponseAssessment).points,0);}
  const analytics=fixture([ANALYTICS_URL],CALIFORNIA_NINE_POINT_LINK_POLICY);
  assert.equal(canonical(project(analytics),analytics.bundle.gpcResponseAssessment).points,0);
});

test("newly complete absence uses nine; legacy declaration and runtime captures remain six",()=>{
  const complete=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY),limited=structuredClone(complete);
  limited.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage="limited";
  const before=canonical(project(limited),limited.bundle.gpcResponseAssessment),after=canonical(project(complete),complete.bundle.gpcResponseAssessment);
  assert.equal(before.points,0);assert.equal(after.points,9);assert.equal(before.score.score!-after.score.score!,9);
  const text=CA_FIXTURE_POLICY.replace("We do not sell or share personal information.","Under the CCPA, we sell personal information.");
  for(const [policy,points] of [[CALIFORNIA_DISCLOSURE_CHOICE_POLICY,6],[CALIFORNIA_RUNTIME_LINK_POLICY,6],[CALIFORNIA_NINE_POINT_LINK_POLICY,9]] as const){
    const f=fixture([QUALIFIED_URL],policy,text);delete f.bundle.gpcResponseAssessment;
    const review=project(f),r=canonical(review,undefined);
    assert.equal(r.points,points);assert.equal(r.score.score,100-points);
  }
});

test('advertising-cookie DOM choices preserve the separate required named-link policy and nine-point weight',async()=>{
 const {retainDomOptOutLabel}=await import('../../../../packages/certscore-scan-core/src/dom-opt-out-label');
 const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY),documentIdentity={source:'cdp_loader_id' as const,token:'independent-cookie-page'};
 const value='We use cookies for personalized advertising. Reject all';
 const optOutLabel=retainDomOptOutLabel({value,url:URL,documentIdentity,capturedAtMs:900},'dom_text_pre_consent');assert.ok(optOutLabel);
 f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:URL,documentIdentity,capturedAtMs:900,consentStateAtTime:'pre_consent',optOutLabel} as typeof f.bundle.domSnapshots[number]];
 const review=project(f),result=canonical(review,f.bundle.gpcResponseAssessment);
 assert.equal(projectCaliforniaOptOutPresence(result.packets,review.scanId,URL).state,'observed');
 assert.equal(result.points,9,'purpose-scoped cookie choices cannot erase a separately eligible named-link finding');
 assert.equal(result.score.deductions.filter(d=>d.findingId===ABSENCE).length,1);
});

test('scoped observation leaves complete and limited inspection scoring eligibility unchanged',async()=>{
 const {retainDomOptOutSearch}=await import('../../../../packages/certscore-scan-core/src/dom-opt-out-label');
 for(const limited of [false,true]){
  const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY);
  if(limited)Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',unnamedControlCount:1});
  const beforeReview=project(f,false),before=canonical(beforeReview,f.bundle.gpcResponseAssessment);
  const documentIdentity={source:'cdp_loader_id' as const,token:'source-owned-body'};
  const optOutSearch=retainDomOptOutSearch({value:'Public starting page, products and contact details.',url:URL,documentIdentity,capturedAtMs:900},'dom_text_pre_consent');
  f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:URL,documentIdentity,capturedAtMs:900,consentStateAtTime:'pre_consent',optOutSearch}as typeof f.bundle.domSnapshots[number]];
  const review=project(f,false),after=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(projectCaliforniaOptOutPresence(after.packets,review.scanId,URL).state,'not_observed');
  assert.equal(after.points,limited?0:9);assert.deepEqual(after.score,before.score);
 }
});
test('new provider and browser declarations cannot erase independent named-link scoring proof',async()=>{
 const cases=(await import('./opt-out-reviewed-five.fixture.json')).default;
 for(const c of cases){
  const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY,c.instruction),review=project(f),result=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(projectCaliforniaOptOutPresence(result.packets,review.scanId,URL).state,'observed',c.host);
  assert.equal(result.points,9,c.host);assert.equal(result.score.deductions.filter(d=>d.findingId===ABSENCE).length,1);
 }
});

test('independent body observations cannot create nine-point eligibility from missing or limited inspections',async()=>{
 const {retainDomOptOutSearch}=await import('../../../../packages/certscore-scan-core/src/dom-opt-out-label');
 const {consentUiObservationSchema}=await import('@certscore/contracts');
 for(const mode of ['missing','unstable','truncated']as const){
  const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY);
  if(mode==='missing')delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;
  else Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',...(mode==='unstable'?{documentStable:false}:{candidateEnumerationTruncated:true})});
  const before=canonical(project(f,false),f.bundle.gpcResponseAssessment);
  const documentIdentity={source:'cdp_loader_id' as const,token:'own-independent-main-document'};
  const optOutSearch=retainDomOptOutSearch({value:'Public website information with research, products, news and contact details. '.repeat(8),url:URL,documentIdentity,capturedAtMs:700},'dom_text_pre_consent');
  f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:URL,documentIdentity,capturedAtMs:700,consentStateAtTime:'pre_consent',optOutSearch}as typeof f.bundle.domSnapshots[number]];
  f.bundle.consentUiObservations=[consentUiObservationSchema.parse({observationId:'consent_ui_pre_consent',observedAtMs:900,documentUrl:URL,documentIdentity,documentReadyState:'complete',captureStatus:'no_evidence',inventoryOutcome:'complete_empty',layerInspected:'first_layer',captureDiagnostics:{completedChannels:['dom_inventory']},likelyPresent:false,basis:[],confidence:1})];
  const review=project(f,false),after=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(projectCaliforniaOptOutPresence(after.packets,review.scanId,URL).state,'not_observed');
  assert.equal(after.points,0);assert.equal(after.score.score,85);assert.deepEqual(after.score,before.score);
 }
});
test('the two advertising-cookie declarations preserve independently eligible nine-point scoring',async()=>{
 const cases=(await import('./opt-out-cookie-two.fixture.json')).default;
 for(const c of cases){
  const f=fixture([QUALIFIED_URL],CALIFORNIA_NINE_POINT_LINK_POLICY,CA_FIXTURE_POLICY+' '+c.context+' '+c.instruction+' '+c.template),review=project(f),result=canonical(review,f.bundle.gpcResponseAssessment);
  assert.equal(projectCaliforniaOptOutPresence(result.packets,review.scanId,URL).state,'observed',c.host);assert.equal(result.points,9,c.host);
  assert.equal(result.score.deductions.filter(d=>d.findingId===ABSENCE).length,1);
 }
});
