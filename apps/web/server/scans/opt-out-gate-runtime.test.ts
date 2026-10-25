import assert from 'node:assert/strict';
import test from 'node:test';
import {GATE_RUNTIME_TEXT_PAGE as pageUrl,GATE_RUNTIME_TEXT_TARGET as targetUrl,CALIFORNIA_NINE_POINT_LINK_POLICY,
 assessBroadOptOutPresence,deriveConsentControlAssessment,consentControlAssessmentSchema,consentUiObservationSchema} from '@certscore/contracts';
import {retainDomOptOutSearch} from '../../../../packages/certscore-scan-core/src/dom-opt-out-label';
import {retainRuntimeOptOutSearch} from '../../../../packages/certscore-scan-core/src/runtime-opt-out-text';
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
import {californiaPriorityGpcFixture,QUALIFIED_URL} from '../../lib/scans/test-fixtures/california-priority-gpc';
import {createHash} from 'node:crypto';
import {projectScopedOptOutSearch} from './scoped-opt-out-search';

function fixture(){
 const f=JSON.parse(JSON.stringify(californiaCoverageFixture()).replaceAll(CA_FIXTURE_URL,pageUrl))as ReturnType<typeof californiaCoverageFixture>;
 f.bundle.normalizedUrl=targetUrl;f.bundle.policySurfaceObservations=[];
 f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_NINE_POINT_LINK_POLICY;
 Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{representativeDocument:false,coverage:'limited'});
 const identity={source:'cdp_loader_id' as const,token:'blocked-consent-loader'},artifactId='dom_text_pre_consent';
 const shell='Performing security verification. This website verifies you are not a bot. Ray ID: test';
 const blocked=retainDomOptOutSearch({value:shell,url:pageUrl,documentIdentity:identity,capturedAtMs:500},artifactId);
 f.bundle.domSnapshots=[{artifactId,url:pageUrl,documentIdentity:identity,capturedAtMs:500,consentStateAtTime:'pre_consent',optOutSearch:blocked}as typeof f.bundle.domSnapshots[number]];
 f.bundle.consentUiObservations=[consentUiObservationSchema.parse({observationId:'consent_ui_pre_consent',documentUrl:pageUrl,documentIdentity:identity,observedAtMs:600,captureStatus:'no_evidence',controls:[],visibleChoiceLabels:[],basis:[],confidence:1,likelyPresent:false})];
 const body='Public starting page with articles, products, services and contact information. '.repeat(8),documentIdentity={source:'cdp_loader_id' as const,token:'runtime-loader'};
 const proof=retainRuntimeOptOutSearch({value:body,url:pageUrl,documentIdentity,capturedAtMs:700,documentReadyState:'complete',documentLanguage:'en'},targetUrl,body)!;
 f.bundle.runtimeMetadataSnapshots=[{artifactId,url:pageUrl,documentIdentity,capturedAtMs:900,consentStateAtTime:'pre_consent',pagePhase:'network_idle',path:'/tmp/runtime-dom.txt',optOutSearch:proof}];
 f.bundle.scanLaneRuns=[{laneId:'runtime_evidence',startedAt:f.bundle.startedAt,completedAt:f.bundle.completedAt,executionOutcome:'success',accessOutcome:'representative_page',challengeDetected:false}as NonNullable<typeof f.bundle.scanLaneRuns>[number]];
 return f;
}
function persist(review:NonNullable<ReturnType<typeof projectCaliforniaPrivacyReview>>,gpcResponseAssessment?:ReturnType<typeof californiaPriorityGpcFixture>){
 const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
 const saved=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:saved,gpcResponseAssessment}});
 return {saved,packets,presence:projectCaliforniaOptOutPresence(packets,review.scanId,review.documentUrl),score:deriveCaliforniaRegulatoryScore({assessment:saved.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets})};
}
function canonical(f=fixture()){
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,pageUrl)!;assert.ok(review?.contractVersion==='certscore.california-privacy-review.v10');return {review,...persist(review,f.bundle.gpcResponseAssessment as ReturnType<typeof californiaPriorityGpcFixture>|undefined)};
}
test('new Gate runtime-only absence survives canonical persistence and projection with unchanged scores and blocked consent evidence',t=>{
 const f=fixture(),original=structuredClone(f.bundle),r=canonical(f);
 assert.equal(r.presence.state,'not_observed');assert.equal(r.presence.absenceScope,'Captured runtime main-document text only');
 assert.ok(r.presence.absenceLimitations?.includes('The separate consent capture showed a verification screen.'));
 assert.equal(r.review.scopedOptOutSearch?.version,'sale_sharing_opt_out_scoped_search.v3');assert.equal(r.review.broadOptOutAssessment?.version,'sale_sharing_opt_out_assessment.v4');
 assert.deepEqual(r.review.broadOptOutAssessment.evidenceRefs,['runtime-dom-text:dom_text_pre_consent','dom-text:dom_text_pre_consent','consent-ui:consent_ui_pre_consent']);
 assert.deepEqual(f.bundle,original);assert.equal(r.review.optOutNegativeSearch,undefined);assert.deepEqual(r.score.deductions,[]);
 const before=structuredClone(r.review);delete before.scopedOptOutSearch;delete before.broadOptOutAssessment;
 const previous=persist(before);assert.deepEqual(r.score,previous.score);
 const serialized=(value:unknown)=>Buffer.byteLength(JSON.stringify(value));
 t.diagnostic(JSON.stringify({measurement:'gate_runtime_text.v1',producerBytes:serialized(f.bundle.runtimeMetadataSnapshots![0]!.optOutSearch),
  assessmentBytes:serialized(r.review.scopedOptOutSearch),incrementalSerializedBytes:serialized({saved:r.saved,packets:r.packets})-serialized({saved:previous.saved,packets:previous.packets})}));
 for(const version of ['sale_sharing_opt_out_assessment.v1','sale_sharing_opt_out_assessment.v2','sale_sharing_opt_out_assessment.v3']as const)
  assert.equal(assessBroadOptOutPresence(r.review,version)?.state,'unknown','Prior assessments cannot acquire the new runtime meaning');
});
const changes:Array<[string,(f:ReturnType<typeof fixture>)=>void]>=[
 ['historical missing bound search',f=>{delete f.bundle.runtimeMetadataSnapshots![0]!.optOutSearch;}],
 ['consent token borrowed for runtime',f=>{f.bundle.runtimeMetadataSnapshots![0]!.documentIdentity!.token='blocked-consent-loader';}],
 ['later metadata token replaces read token',f=>{f.bundle.runtimeMetadataSnapshots![0]!.documentIdentity!.token='later-loader';}],
 ['metadata earlier than original read',f=>{f.bundle.runtimeMetadataSnapshots![0]!.capturedAtMs=650;}],
 ['late runtime snapshot',f=>{f.bundle.runtimeMetadataSnapshots![0]!.capturedAtMs=999999;}],
 ['wrong runtime URL',f=>{f.bundle.runtimeMetadataSnapshots![0]!.url+='other';}],
 ['other source target',f=>{f.bundle.normalizedUrl='https://other.test/';}],
 ['runtime lane failed',f=>{f.bundle.scanLaneRuns![0]!.executionOutcome='failed';}],
 ['runtime lane challenge',f=>{f.bundle.scanLaneRuns![0]!.accessOutcome='bot_challenge';}],
 ['invalid lane timestamp',f=>{f.bundle.scanLaneRuns![0]!.startedAt='invalid';}],
 ['missing runtime lane',f=>{f.bundle.scanLaneRuns=[];}],
 ['duplicate runtime lane',f=>{f.bundle.scanLaneRuns!.push(structuredClone(f.bundle.scanLaneRuns![0]!));}],
 ['duplicate runtime snapshot',f=>{f.bundle.runtimeMetadataSnapshots!.push(structuredClone(f.bundle.runtimeMetadataSnapshots![0]!));}],
 ['truncated body',f=>{f.bundle.runtimeMetadataSnapshots![0]!.optOutSearch!.truncated=true;}],
 ['ambiguous runtime hint',f=>{f.bundle.runtimeMetadataSnapshots![0]!.optOutSearch!.result='ambiguous_hint';}],
 ['positive runtime label',f=>{f.bundle.runtimeMetadataSnapshots![0]!.optOutSearch!.result='specific_signal';}],
 ['missing blocked-consent proof',f=>{delete f.bundle.domSnapshots[0]!.optOutSearch;}],
 ['nonchallenge consent body',f=>{f.bundle.domSnapshots[0]!.optOutSearch!.result='no_qualifying_signal';}],
 ['missing consent checkpoint',f=>{f.bundle.consentUiObservations=[];}],
 ['wrong consent checkpoint token',f=>{f.bundle.consentUiObservations[0]!.documentIdentity!.token='other';}],
 ['visible consent controls',f=>{f.bundle.consentUiObservations[0]!.visibleChoiceLabels=['Privacy choices'];}],
 ['ambiguous dedicated inspection',f=>{f.bundle.policySurfaceInspection!.privacyChoiceInspection!.unnamedControlCount=1;}],
];
for(const [name,change] of changes)test(`Gate runtime absence rejects ${name}`,()=>{
 const f=fixture();change(f);const r=canonical(f);assert.equal(r.presence.state,'unknown');assert.equal(r.review.scopedOptOutSearch,undefined);
});
test('Gate persisted runtime proof cannot change scope, source URL, limits or version',()=>{
 const {review}=canonical();
 for(const patch of [{documentUrl:'https://other.test/'},{limitations:[]},{scope:'captured_main_document_text'},{version:'sale_sharing_opt_out_scoped_search.v2'}]){
  const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=structuredClone(review);
  Object.assign(parent.californiaPrivacyReview.scopedOptOutSearch!,patch);assert.equal(consentControlAssessmentSchema.safeParse(parent).success,false);
 }
});
test('Gate runtime text cannot create or cancel independently eligible nine-point scoring',()=>{
 for(const complete of [false,true]){
  const f=fixture();f.bundle.scanId='gpc-fixture';
  // Synthetic verified GPC fixture with all target URL/hash references changed
  // together; no retained public scan or original worker packet is rewritten.
  const hash=(url:string)=>createHash('sha256').update(url).digest('hex');
  const gpc=JSON.parse(JSON.stringify(californiaPriorityGpcFixture([QUALIFIED_URL])).replaceAll('https://example.test/',pageUrl).replaceAll(hash('https://example.test/'),hash(pageUrl)));
  f.bundle.gpcResponseAssessment=gpc;
  if(complete)Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'complete',representativeDocument:true});
  const after=canonical(f),without=structuredClone(f);delete without.bundle.runtimeMetadataSnapshots![0]!.optOutSearch;
  const before=canonical(without);
  assert.equal(after.presence.state,'not_observed');assert.deepEqual(after.score,before.score);
  assert.equal(after.score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed')?.points??0,complete?9:0);
 }
});
test('Gate runtime scope still rejects unresolved retained policy hints, altered policy bytes and no-go captures',()=>{
 const f=fixture(),{review}=canonical(f),text='You may opt out of advertising by contacting support.';
 const d={evidenceRef:'policy-text:fixture',url:pageUrl+'privacy',text,textSha256:createHash('sha256').update(text).digest('hex')};
 assert.equal(projectScopedOptOutSearch(review,f.bundle,[d]),undefined);
 assert.equal(projectScopedOptOutSearch(review,f.bundle,[{...d,text:'Different policy bytes'}]),undefined);
 f.bundle.scanNoGoAssessment={decision:'no_go'}as typeof f.bundle.scanNoGoAssessment;
 assert.equal(projectScopedOptOutSearch(review,f.bundle,[]),undefined);
});
