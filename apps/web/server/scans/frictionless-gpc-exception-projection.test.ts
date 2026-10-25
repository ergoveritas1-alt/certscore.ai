import assert from 'node:assert/strict';
import test from 'node:test';
import {CALIFORNIA_RUNTIME_LINK_POLICY,FRICTIONLESS_GPC_FINDING_ID,consentControlAssessmentSchema,deriveConsentControlAssessment,frictionlessGpcExceptionSchema,type CaliforniaPrivacyReview} from '@certscore/contracts';
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from './california-review-coverage.fixture';
import {californiaPriorityGpcFixture,QUALIFIED_URL,ANALYTICS_URL} from '../../lib/scans/test-fixtures/california-priority-gpc';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {projectFrictionlessGpcException} from './frictionless-gpc-exception-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaFrictionlessGpcException,projectCaliforniaChoicePresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';

const claims=' You have the right to opt out of the sale or sharing of your personal information. We process Global Privacy Control signals in a frictionless manner. Enable Global Privacy Control in your browser settings. To submit a sale/sharing opt-out request, call our telephone line.';
function fixture(text=CA_FIXTURE_POLICY){
  const f=JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,'https://example.test/')) as ReturnType<typeof californiaCoverageFixture>;
  f.bundle.scanId='gpc-fixture';f.policyEvidence.projection.scanId='gpc-fixture';f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
  f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
  f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage='en');return f;
}
function materialize(f:ReturnType<typeof fixture>){const a=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,'https://example.test/',f.policyEvidence);assert.ok(a);assert.equal(a.contractVersion,'certscore.california-privacy-review.v10');return a;}
function pipeline(review:CaliforniaPrivacyReview,gpc?:unknown){
  const p=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});p.californiaPrivacyReview=review;
  const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(p)));
  const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:persisted,gpcResponseAssessment:gpc}});
  return {persisted,packets,score:deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets})};
}
function exception(a:CaliforniaPrivacyReview){assert.ok(a.contractVersion==='certscore.california-privacy-review.v10'&&a.frictionlessGpcException);return a.frictionlessGpcException;}

test('four policy declarations are source-bound facts; they cannot establish a frictionless exception',()=>{
  const f=fixture(CA_FIXTURE_POLICY+claims),a=materialize(f),e=exception(a);assert.equal(e.status,'unresolved');assert.equal(e.basis,'insufficient_evidence');
  assert.deepEqual(e.disclosures.map(d=>d.status),Array(4).fill('declared'));assert.equal(e.unverifiedRequirements.length,5);
  for(const row of e.disclosures){const text=f.policyEvidence.texts.find(d=>'policy-text:'+d.observationId===row.passage!.evidenceRef)!.text;assert.equal(text.slice(row.passage!.start,row.passage!.end),row.passage!.excerpt);}
  const r=pipeline(a),packet=r.packets.find(p=>p.unifiedFindingId===FRICTIONLESS_GPC_FINDING_ID)!;
  assert.ok(packet);assert.equal(packet.surfacingDecision.reportLane,'confidence_and_coverage');assert.equal(packet.scoreEffects?.length??0,0);
  assert.deepEqual(projectCaliforniaFrictionlessGpcException(r.packets,a.scanId,a.documentUrl)?.assessment,e);
  assert.equal(projectCaliforniaFrictionlessGpcException(r.packets,'other',a.documentUrl),null);
  assert.equal(projectCaliforniaFrictionlessGpcException(r.packets,a.scanId,a.documentUrl+'other'),null);
  assert.equal(projectCaliforniaFrictionlessGpcException(r.packets.map(p=>({...p,sourceRefs:[]})),a.scanId,a.documentUrl),null);
  assert.equal(frictionlessGpcExceptionSchema.safeParse({...e,status:'supported'}).success,false);
});

test('quiet or analytics-only GPC capture and mere receipt cannot establish the exception',()=>{
  for(const urls of [[],[ANALYTICS_URL]]){const f=fixture(CA_FIXTURE_POLICY+claims);f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture(urls);
    const a=materialize(f),e=exception(a);assert.equal(e.status,'unresolved');assert.equal(e.gpcContradiction,undefined);
    assert.equal(pipeline(a,f.bundle.gpcResponseAssessment).score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed'),undefined);
  }
});

test('verified qualified collection contradicts exception; six-point weight and independent GPC scoring remain unchanged',()=>{
  const f=fixture(CA_FIXTURE_POLICY+claims);f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture([QUALIFIED_URL]);
  const a=materialize(f),e=exception(a);assert.equal(e.status,'contradicted_in_assessed_scope');assert.equal(e.basis,'qualifying_collection_under_gpc');assert.ok(e.gpcContradiction);
  const r=pipeline(a,f.bundle.gpcResponseAssessment);assert.equal(r.score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed')?.points,6);
  assert.equal(r.score.deductions.find(d=>d.findingId==='gpc_response')?.points,15);
  assert.equal(projectCaliforniaChoicePresence(r.packets,a.scanId,a.documentUrl)?.state,'not_observed');
  const old=structuredClone(a);if(old.contractVersion==='certscore.california-privacy-review.v10')delete old.frictionlessGpcException;
  assert.deepEqual(pipeline(old,f.bundle.gpcResponseAssessment).score,r.score);
  assert.ok(projectCaliforniaFrictionlessGpcException(r.packets,a.scanId,a.documentUrl));
  assert.equal(projectCaliforniaFrictionlessGpcException(pipeline(a).packets,a.scanId,a.documentUrl),null,'runtime contradiction must rejoin original GPC evidence');
});

test('incomplete absence inspection stays unknown despite a separately verified exception counterexample',()=>{
  const f=fixture();f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture([QUALIFIED_URL]);
  const i=f.bundle.policySurfaceInspection!.privacyChoiceInspection!;i.coverage='limited';i.unnamedControlCount=1;
  const a=materialize(f);assert.equal(a.choiceSurface,'unknown');assert.equal(exception(a).basis,'qualifying_collection_under_gpc');
  assert.ok(a.contractVersion==='certscore.california-privacy-review.v10'&&a.disclosureChoiceAssessment?.policyVersion===CALIFORNIA_RUNTIME_LINK_POLICY&&!a.disclosureChoiceAssessment.runtimeLinkProof);
  const r=pipeline(a,f.bundle.gpcResponseAssessment);assert.equal(r.score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed'),undefined);
  assert.equal(projectCaliforniaChoicePresence(r.packets,a.scanId,a.documentUrl),null);
  assert.ok(projectCaliforniaFrictionlessGpcException(r.packets,a.scanId,a.documentUrl));
});

test('existing complete-policy proof remains six; unresolved policy absence creates no new eligibility',()=>{
  const text=CA_FIXTURE_POLICY.replace('We do not sell or share personal information.','Under the CCPA, we sell personal information.');
  const a=materialize(fixture(text)),e=exception(a);assert.equal(e.basis,'required_signal_disclosures_missing');assert.equal(e.status,'contradicted_in_assessed_scope');
  assert.equal(pipeline(a).score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed')?.points,6);
  const neutral=materialize(fixture('Privacy policy. We use cookies.'));assert.equal(exception(neutral).status,'unresolved');
  assert.equal(pipeline(neutral).score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed'),undefined);
});

test('changed source, scan, document, proof, declaration or state cannot supply a canonical exception assessment',()=>{
  const f=fixture(CA_FIXTURE_POLICY+claims);f.bundle.gpcResponseAssessment=californiaPriorityGpcFixture([QUALIFIED_URL]);const a=materialize(f);
  for(const mutate of [
    (e:ReturnType<typeof exception>)=>{e.scanId='other';},
    (e:ReturnType<typeof exception>)=>{e.documentUrl+='other';},
    (e:ReturnType<typeof exception>)=>{e.sourceHash='f'.repeat(64);},
    (e:ReturnType<typeof exception>)=>{e.basis='insufficient_evidence';e.status='unresolved';},
    (e:ReturnType<typeof exception>)=>{e.gpcContradiction!.sourceSha256='f'.repeat(64);},
    (e:ReturnType<typeof exception>)=>{e.disclosures[0]!.passage!.textSha256='f'.repeat(64);},
    (e:ReturnType<typeof exception>)=>{e.disclosures[1]!.passage!.excerpt='We honor GPC.';},
  ]){const copy=structuredClone(a);mutate(exception(copy));assert.equal(consentControlAssessmentSchema.safeParse({...pipeline(a,f.bundle.gpcResponseAssessment).persisted,californiaPrivacyReview:copy}).success,false);}
  const changed=structuredClone(f.bundle.gpcResponseAssessment);if(changed.contractVersion==='certscore.gpc-response-assessment.v3')changed.observation.sessionSha256='f'.repeat(64);
  assert.equal(projectCaliforniaFrictionlessGpcException(pipeline(a,changed).packets,a.scanId,a.documentUrl),null);
});

test('unmarked historical captures retain their original schema, scores and lack of exception findings',()=>{
  const f=fixture();delete f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy;
  const a=materialize(f);assert.ok(a.contractVersion==='certscore.california-privacy-review.v10'&&!a.frictionlessGpcException);
  const before=JSON.stringify(a);const r=pipeline(a);assert.equal(JSON.stringify(a),before);
  assert.ok(!r.packets.some(p=>p.unifiedFindingId===FRICTIONLESS_GPC_FINDING_ID));
});

test('negated, hypothetical, unverified, unsupported or altered policy sources cannot become declared evidence',()=>{
  for(const text of ['We do not process Global Privacy Control in a frictionless manner.','If we process Global Privacy Control, we could use a frictionless manner.','We recommend businesses process GPC in a frictionless manner.','Do we process Global Privacy Control in a frictionless manner?' ,'Our vendors process Global Privacy Control in a frictionless manner.','You can opt out of marketing emails by calling our telephone line.']){
    assert.ok(exception(materialize(fixture(text))).disclosures.every(d=>d.status==='not_established'));
  }
  const f=fixture(CA_FIXTURE_POLICY+claims);f.bundle.policySurfaceObservations.forEach(d=>d.documentLanguage='de');assert.ok(exception(materialize(f)).disclosures.every(d=>d.status==='not_established'));
  const a=materialize(fixture(CA_FIXTURE_POLICY+claims));
  const docs=[{evidenceRef:'policy-text:policy',textSha256:'f'.repeat(64),url:'https://example.test/policy',text:claims}];
  assert.ok(projectFrictionlessGpcException(a,docs).disclosures.every(d=>d.status==='not_established'));
  assert.ok(Buffer.byteLength(JSON.stringify(exception(a)))<=4096);
});
