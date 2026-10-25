import assert from 'node:assert/strict';
import test from 'node:test';
import {consentControlAssessmentSchema,deriveConsentControlAssessment,policyChoiceMethodsSchema,POLICY_CHOICE_METHOD_FINDING_ID,CALIFORNIA_RUNTIME_LINK_POLICY} from '@certscore/contracts';
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from './california-review-coverage.fixture';
import {projectPolicyChoiceMethods} from './policy-choice-methods-projection';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaChoicePresence,projectCaliforniaPolicyChoiceMethods} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
import {californiaPriorityGpcFixture,QUALIFIED_URL} from '../../lib/scans/test-fixtures/california-priority-gpc';

function fixture(){
  const f=californiaCoverageFixture('Do Not Sell My Info. You may opt-out of communications or request deletion.');
  const parent=f.bundle.policySurfaceObservations[0]!;parent.retrievedAt='2026-10-17T12:00:01.000Z';
  f.bundle.policySurfaceObservations.push({...parent,observationId:'method',surfaceType:'do_not_sell_or_share',
    linkText:'Do Not Sell My Info',url:'mailto:optout@example.test?subject=Do%20Not%20Sell&body=secret',normalizedUrl:'mailto:optout@example.test',
    finalUrl:undefined,parentObservationId:parent.observationId,parentSurfaceUrl:parent.finalUrl,linkSourcePageUrl:parent.finalUrl,
    traversalDepth:1,discoveryMethod:'page_text_link',status:'observed',documentFetchState:'not_attempted',
    linkVisibility:undefined,directlyLinkedFromScannedPage:false,clickable:true,classifierReasonCodes:['context_not_satisfied']});
  return f;
}
function canonical(f:ReturnType<typeof fixture>){
  const url=f.bundle.policySurfaceInspection?.privacyChoiceInspection?.documentUrl??CA_FIXTURE_URL;
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,url)!;
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:url}});parent.californiaPrivacyReview=review;
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
    runtimeArtifacts:{consentControlAssessment:persisted,gpcResponseAssessment:f.bundle.gpcResponseAssessment}});
  return {review,packets,score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets})};
}
test('policy email is informational, source-bound and distinct from homepage presence',()=>{
  const f=fixture();delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;
  const {review,packets}=canonical(f);
  assert.equal(review.choiceSurface,'unknown');assert.equal(review.controls.length,0);assert.equal(review.choicePresence,undefined);
  const method=review.policyChoiceMethods!;assert.ok(method);
  assert.equal(method.methods[0]!.destination,'mailto:optout@example.test');assert.doesNotMatch(JSON.stringify(method),/secret|subject=|body=/);
  const packet=packets.find(p=>p.unifiedFindingId===POLICY_CHOICE_METHOD_FINDING_ID)!;
  assert.ok(packet);assert.equal(packet.surfacingDecision.reportLane,'confidence_and_coverage');assert.ok(packet.surfacingDecision.reportable);
  assert.equal(packet.details?.family,'policy_choice_methods');
  assert.ok(Buffer.byteLength(JSON.stringify(packet.details))<=4096+64,'Compact details do not duplicate the full California assessment');
  assert.equal(packet.scoreEffects?.length??0,0);assert.match(packet.summary,/Homepage availability, sale\/sharing scope and effectiveness are not established/);
  assert.equal(projectCaliforniaChoicePresence(packets,f.bundle.scanId,CA_FIXTURE_URL),null);
  assert.deepEqual(projectCaliforniaPolicyChoiceMethods(packets,f.bundle.scanId,CA_FIXTURE_URL),method);
  const legacy=packets.map(p=>p.unifiedFindingId===POLICY_CHOICE_METHOD_FINDING_ID?{...p,details:{family:'california_privacy_review' as const,projection:review}}:p);
  assert.deepEqual(projectCaliforniaPolicyChoiceMethods(legacy,f.bundle.scanId,CA_FIXTURE_URL),method,'Historical full-assessment projections remain readable');
  assert.equal(projectCaliforniaPolicyChoiceMethods(packets,'wrong',CA_FIXTURE_URL),null);
  assert.equal(projectCaliforniaPolicyChoiceMethods(packets,f.bundle.scanId,CA_FIXTURE_URL+'other'),null);
  assert.equal(projectCaliforniaPolicyChoiceMethods(packets.map(p=>({...p,sourceRefs:[]})),f.bundle.scanId,CA_FIXTURE_URL),null);
  assert.equal(projectCaliforniaPolicyChoiceMethods(packets.map(p=>({...p,surfacingDecision:{...p.surfacingDecision,reportable:false}})),f.bundle.scanId,CA_FIXTURE_URL),null);
});
test('scoped methods do not cancel eligible six-point absence or change GPC scoring',()=>{
  const f=JSON.parse(JSON.stringify(fixture()).replaceAll(CA_FIXTURE_URL,'https://example.test/')) as ReturnType<typeof fixture>;f.bundle.scanId='gpc-fixture';f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
  f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
  f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture([QUALIFIED_URL]);
  const withMethod=canonical(f);f.bundle.policySurfaceObservations.pop();const without=canonical(f);
  assert.ok(withMethod.review.contractVersion==='certscore.california-privacy-review.v10');
  assert.equal(withMethod.review.optOutPresenceSignal,undefined,'A retained structured method avoids duplicating the same policy signal');
  assert.equal(withMethod.review.choiceSurface,'not_observed_in_inspected_scope');
  assert.deepEqual(withMethod.score,without.score);
  assert.equal(withMethod.score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed')?.points,6);
  assert.equal(projectCaliforniaChoicePresence(withMethod.packets,f.bundle.scanId,withMethod.review.documentUrl)?.state,'not_observed');
});
test('unverified, guessed, unrelated, unsafe, unbound and wrong-document evidence cannot create scoped methods',()=>{
  const mutations:Array<(f:ReturnType<typeof fixture>)=>void>=[
    f=>{f.bundle.policySurfaceObservations[2]!.linkObservationState='candidate';},
    f=>{f.bundle.policySurfaceObservations[2]!.discoveryMethod='guessed_common_path';},
    f=>{f.bundle.policySurfaceObservations[2]!.parentObservationId='missing';},
    f=>{f.bundle.policySurfaceObservations[2]!.linkSourcePageUrl=CA_FIXTURE_URL+'other';},
    f=>{f.bundle.policySurfaceObservations[2]!.parentSurfaceUrl=CA_FIXTURE_URL+'other';},
    f=>{f.bundle.policySurfaceObservations[2]!.traversalDepth=2;},
    f=>{f.bundle.policySurfaceObservations[2]!.url='javascript:alert(1)';},
    f=>{f.bundle.policySurfaceObservations[2]!.url='';},
    f=>{f.bundle.policySurfaceObservations[2]!.url='#choices';},
    f=>{f.bundle.policySurfaceObservations[2]!.translationApplied=true;},
    f=>{f.bundle.policySurfaceObservations[0]!.translationApplied=true;},
    f=>{f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[2]!});},
    f=>{f.bundle.policySurfaceObservations[2]!.url='mailto:one@example.test,two@example.test';},
    f=>{f.bundle.policySurfaceObservations[2]!.linkText='Privacy Settings';},
    f=>{f.bundle.policySurfaceObservations[2]!.linkVisibility='hidden';},
    f=>{f.bundle.policySurfaceObservations[0]!.linkSourcePageUrl=CA_FIXTURE_URL+'other';},
    f=>{f.bundle.policySurfaceObservations[0]!.textExcerpt='unrelated';},
    f=>{f.bundle.policySurfaceObservations[0]!.retrievedAt='2020-01-01T00:00:00Z';},
    f=>{f.bundle.policySurfaceObservations[0]!.status='failed';},
    f=>{f.bundle.policySurfaceObservations[0]!.targetRelationship='unknown';},
    f=>{f.bundle.policySurfaceObservations[0]!.documentRole='unknown';},
    f=>{f.bundle.policySurfaceObservations[0]!.directlyLinkedFromScannedPage=false;},
    f=>{f.bundle.policySurfaceObservations.push({...f.bundle.policySurfaceObservations[0]!});},
  ];
  for(const [index,mutate] of mutations.entries()){const f=fixture();mutate(f);assert.equal(projectPolicyChoiceMethods(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL),undefined,`mutation ${index}`);}
  assert.equal(projectPolicyChoiceMethods(fixture().bundle,{...CA_FIXTURE_SOURCE,verificationStatus:'unverified'},CA_FIXTURE_URL),undefined);
});
test('bounded methods retain safe web destinations; schema rejects promotion and broken bundle binding',()=>{
  const f=fixture(),link=f.bundle.policySurfaceObservations[2]!;link.url='https://choices.example.test/form?token=secret#private';
  for(let i=0;i<8;i++)f.bundle.policySurfaceObservations.push({...link,observationId:`method-${i}`});
  const r=canonical(f),methods=r.review.policyChoiceMethods!;assert.equal(methods.methods.length,4);
  assert.equal(methods.methods[0]!.destination,'https://choices.example.test/form');assert.ok(Buffer.byteLength(JSON.stringify(methods))<=4096);
  assert.equal(policyChoiceMethodsSchema.safeParse({...methods,homepagePresence:'observed'}).success,false);
  const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=r.review;
  for(const patch of [{scanId:"other"},{reportDocumentUrl:CA_FIXTURE_URL+"other"}]){
    parent.californiaPrivacyReview.policyChoiceMethods={...methods,...patch};
    assert.equal(consentControlAssessmentSchema.safeParse(parent).success,false);
  }
  parent.californiaPrivacyReview.policyChoiceMethods={...methods,sourceBundleSha256:'f'.repeat(64)};
  assert.equal(consentControlAssessmentSchema.safeParse(parent).success,false);
});
