import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {CALIFORNIA_RUNTIME_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,optOutPresenceSignalSchema} from '@certscore/contracts';
import cases from './opt-out-cookie-two.fixture.json';
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE,CA_FIXTURE_POLICY} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
const require=createRequire(import.meta.url),serverOnly=require.resolve('server-only');
require.cache[serverOnly]={exports:{},filename:serverOnly,id:serverOnly,loaded:true} as NodeModule;

function persist(review:NonNullable<ReturnType<typeof projectCaliforniaPrivacyReview>>){
 const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
 const saved=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:saved}});
 return {presence:projectCaliforniaOptOutPresence(packets,review.scanId,review.documentUrl),score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets}),packets};
}
for(const c of cases)test(`${c.host}: retained scope survives loaded-source handoff, persistence and canonical findings`,async()=>{
 const {buildPositiveOptOutPolicyEvidence}=await import('./local-v2-dag-report');
 const policy=CA_FIXTURE_POLICY.replaceAll('example.test','fixture.test').repeat(3)+'\n'+c.context+'\n'+c.instruction+'\n'+c.template;
 const f=JSON.parse(JSON.stringify(californiaCoverageFixture(policy)).replaceAll(CA_FIXTURE_URL,c.documentUrl).replaceAll('2026-10-17','2026-10-24')) as ReturnType<typeof californiaCoverageFixture>;
 f.bundle.normalizedUrl=c.documentUrl;f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
 const artifacts=new Map<string,{artifactId:string;fileName:string;text:string;sha256:string;sizeBytes:number;verificationStatus:'verified'}>();
 f.bundle.policySurfaceObservations=f.bundle.policySurfaceObservations.slice(0,1);
 for(const s of f.bundle.policySurfaceObservations){
  const artifactId=`policy_surface_text_${s.observationId}`;
  Object.assign(s,{url:c.sourceUrl,normalizedUrl:c.sourceUrl,finalUrl:c.sourceUrl,documentLanguage:c.host==='gdemoi.ru'?'ru':'en',ownershipConfidence:0.98,retrievedAt:'2026-10-24T12:00:01.000Z',
   targetRelationship:'target_controller',surfaceType:'privacy_policy',
   documentRole:'policy_document',documentTextCoverage:{status:'complete',sourceTextChars:policy.length,retainedTextChars:policy.length,limitationKeys:[]},
   artifactRefs:[{artifactId,path:`/tmp/${artifactId}.txt`,artifactType:'other'}]});
  artifacts.set(artifactId,{artifactId,fileName:artifactId+'.txt',text:policy,sha256:createHash('sha256').update(policy).digest('hex'),sizeBytes:Buffer.byteLength(policy),verificationStatus:'verified' as const});
 }
 const context={artifactsById:artifacts,scanId:f.bundle.scanId,generatedAt:f.bundle.completedAt,sourceBundle:{...CA_FIXTURE_SOURCE,verificationStatus:'verified' as const,schemaVersion:'fixture'}};
 const positive=buildPositiveOptOutPolicyEvidence(f.bundle,c.documentUrl,context);
 const fresh=()=>projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,c.documentUrl,undefined,positive)!;
 const review=fresh();assert.ok(review?.contractVersion==='certscore.california-privacy-review.v10');const actual=persist(review);
 assert.equal(actual.presence.state,'observed');assert.equal(actual.presence.signal?.scope,c.scope);assert.equal(actual.presence.signal?.label,c.label);
 assert.deepEqual(actual.presence.signal?.evidenceLimitations??[],c.limits);
 assert.equal(review.reviewCoverage.sourceDocuments.length,0,'positive-only handoff cannot upgrade governing-policy coverage');
 assert.ok(Buffer.byteLength(JSON.stringify(actual.presence.signal))<=2048);
 const old=structuredClone(review);delete old.optOutPresenceSignal;delete old.broadOptOutAssessment;
 assert.deepEqual(actual.score,persist(old).score,'positive signal does not alter canonical scoring');
 const signal=actual.presence.signal!;assert.equal(optOutPresenceSignalSchema.safeParse({...signal,scope:'wrong'}).success,false);
 if(c.template){
  assert.equal(optOutPresenceSignalSchema.safeParse({...signal,evidenceLimitations:['instruction_destination_unverified']}).success,false,'Template proof cannot lose its quality limitation');
  assert.equal(optOutPresenceSignalSchema.safeParse({...signal,sourceQualityPassage:undefined}).success,false,'Quality claim needs its retained passage');
 }
 assert.equal(optOutPresenceSignalSchema.safeParse({...signal,version:'sale_sharing_opt_out_signal.v6'}).success,false,'New rules cannot reinterpret historical v6');
 // Missing retained bytes and wrong DOM loader identity cannot be repaired by display code.
 for(const a of artifacts.values())a.text+='altered';
 for(const d of f.bundle.domSnapshots)d.documentIdentity!.token='wrong';
 const bad=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,c.documentUrl,undefined,buildPositiveOptOutPolicyEvidence(f.bundle,c.documentUrl,context))!;
 assert.notEqual(persist(bad).presence.state,'observed');
});
test('cookie-refusal rules preserve v6 semantics, source quality and explicit advertising purpose',async()=>{
 const {matchReviewedOptOutRoute,reviewedOptOutRouteCandidates}=await import('@certscore/contracts');
 for(const c of cases){
  assert.ok(matchReviewedOptOutRoute(c.instruction,c.context,true,true));
  assert.equal(matchReviewedOptOutRoute(c.instruction,c.context,true),undefined);
  assert.equal(matchReviewedOptOutRoute(c.instruction,'',true,true),undefined);
  assert.equal([...reviewedOptOutRouteCandidates(c.context+'\nFor example: '+c.instruction,true,true)].length,0);
 }
});
