import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {CALIFORNIA_RUNTIME_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,optOutPresenceSignalSchema} from '@certscore/contracts';
import source from './opt-out-joybuy.fixture.json';
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
const require=createRequire(import.meta.url),serverOnly=require.resolve('server-only');
require.cache[serverOnly]={exports:{},filename:serverOnly,id:serverOnly,loaded:true} as NodeModule;

function fixture(text=source.text){
 const f=JSON.parse(JSON.stringify(californiaCoverageFixture(text)).replaceAll(CA_FIXTURE_URL,source.documentUrl).replaceAll('2026-10-17','2026-10-24')) as ReturnType<typeof californiaCoverageFixture>;
 f.bundle.normalizedUrl='https://joybuy.com/';
 f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
 f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
 const surface=f.bundle.policySurfaceObservations[0]!;
 const artifactId='policy_surface_text_joybuy';
 Object.assign(surface,structuredClone(source.surface),{observationId:'joybuy',retrievedAt:'2026-10-24T12:00:01.000Z',textExcerpt:text,
  contentCoverage:{...source.surface.contentCoverage,sourceTextChars:text.length},
  documentTextCoverage:{status:'complete',sourceTextChars:text.length,retainedTextChars:text.length,limitationKeys:[]},
  artifactRefs:[{artifactId,path:`/tmp/${artifactId}.txt`,artifactType:'other'}]});
 f.bundle.policySurfaceObservations=[surface];
 const artifacts=new Map([[artifactId,{artifactId,fileName:artifactId+'.txt',text,sha256:createHash('sha256').update(text).digest('hex'),sizeBytes:Buffer.byteLength(text),verificationStatus:'verified' as const}]]);
 const context={artifactsById:artifacts,scanId:f.bundle.scanId,generatedAt:f.bundle.completedAt,sourceBundle:{...CA_FIXTURE_SOURCE,verificationStatus:'verified' as const,schemaVersion:'fixture'}};
 return {...f,artifacts,context};
}
function persist(review:NonNullable<ReturnType<typeof projectCaliforniaPrivacyReview>>){
 const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
 const saved=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:saved}});
 return {presence:projectCaliforniaOptOutPresence(packets,review.scanId,review.documentUrl),packets,score:deriveCaliforniaRegulatoryScore({assessment:saved.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets})};
}
async function canonical(f=fixture()){
 const {buildPositiveOptOutPolicyEvidence}=await import('./local-v2-dag-report');
 const positive=buildPositiveOptOutPolicyEvidence(f.bundle,source.documentUrl,f.context);
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,source.documentUrl,undefined,positive)!;
 assert.ok(review?.contractVersion==='certscore.california-privacy-review.v10');
 return {review,positive,...persist(review)};
}
test('Joybuy: loaded source -> persisted assessment -> concern/policy/finding -> shared Observed, with unchanged score and coverage',async()=>{
 const f=fixture(),original=structuredClone(f.bundle),r=await canonical(f);
 assert.equal(r.presence.state,'observed');
 assert.equal(r.presence.signal?.version,'sale_sharing_opt_out_signal.v8');
 assert.equal(r.presence.signal?.scopeLabel,'UK policy: declared advertising-cookie refusal');
 assert.equal(r.presence.signal?.sourceBinding?.kind,'reviewed_policy_redirect');
 assert.equal(r.review.broadOptOutAssessment?.state,'observed');
 assert.equal(r.review.reviewCoverage.sourceDocuments.length,0);
 assert.equal(r.positive.projection.documents[0]!.targetRelationship,'unknown');
 assert.equal(r.positive.projection.documents[0]!.extractionStatus,'unavailable','No ownership or extraction-state repair');
 assert.deepEqual(f.bundle,original,'No original evidence flags or source identities change');
 const before=structuredClone(r.review);delete before.optOutPresenceSignal;delete before.broadOptOutAssessment;
 assert.deepEqual(r.score,persist(before).score,'Scoped signal cannot add or cancel scoring eligibility');
 assert.ok(Buffer.byteLength(JSON.stringify(r.presence.signal))<=2048);
 const finding=r.packets.find(p=>p.unifiedFindingId==='california_policy_opt_out_signal');
 assert.ok(finding?.concernContext?.promotionEligibilities.includes('eligible'));assert.equal(finding?.scoreEffects?.length??0,0);
});

const changes:Array<[string,(f:ReturnType<typeof fixture>)=>void]>=[
 ['wrong source page',f=>{f.bundle.policySurfaceObservations[0]!.linkSourcePageUrl='https://www.joybuy.co.uk/country-selection';}],
 ['wrong report identity',f=>{f.bundle.normalizedUrl='https://www.joybuy.com/';}],
 ['unobserved link',f=>{f.bundle.policySurfaceObservations[0]!.linkObservationState='candidate';}],
 ['guessed link',f=>{f.bundle.policySurfaceObservations[0]!.discoveryMethod='guessed_common_path';}],
 ['missing direct link',f=>{f.bundle.policySurfaceObservations[0]!.directlyLinkedFromScannedPage=false;}],
 ['nonclickable link',f=>{f.bundle.policySurfaceObservations[0]!.clickable=false;}],
 ['missing ancestry',f=>{f.bundle.policySurfaceObservations[0]!.redirectChain=[];}],
 ['extra redirect',f=>{f.bundle.policySurfaceObservations[0]!.redirectChain!.splice(1,0,'https://www.joybuy.com/other');}],
 ['changed source href',f=>{f.bundle.policySurfaceObservations[0]!.redirectChain![0]+='?site=other';}],
 ['changed locale destination',f=>{f.bundle.policySurfaceObservations[0]!.finalUrl='https://www.joybuy.fr/help/cookie-policy';}],
 ['wrong language',f=>{f.bundle.policySurfaceObservations[0]!.documentLanguage='en-us';}],
 ['translation',f=>{f.bundle.policySurfaceObservations[0]!.translationApplied=true;}],
 ['duplicate observation',f=>{f.bundle.policySurfaceObservations.push(structuredClone(f.bundle.policySurfaceObservations[0]!));}],
 ['source outside visit',f=>{f.bundle.policySurfaceObservations[0]!.retrievedAt='2026-10-25T12:00:00.000Z';}],
 ['source before grant',f=>{f.bundle.startedAt='2026-10-23T12:00:00.000Z';f.bundle.completedAt='2026-10-23T12:00:02.000Z';}],
 ['truncated body',f=>{f.bundle.policySurfaceObservations[0]!.documentTextCoverage!.status='truncated';}],
 ['changed retained bytes',f=>{f.artifacts.values().next().value!.text+=' altered';}],
 ['missing retained bytes',f=>{f.artifacts.clear();}],
 ['unverified source bundle',f=>{f.context.sourceBundle.sha256='f'.repeat(64);}],
];
for(const [name,change] of changes)test(`Joybuy rejects ${name}`,async()=>{
 const f=fixture();change(f);const r=await canonical(f);assert.notEqual(r.presence.state,'observed');assert.equal(r.presence.signal,undefined);
});
test('Joybuy generic cookies, analytics-only text and disclaimed instructions cannot supply the new rule',async()=>{
 for(const text of [source.text.replace(source.context,'3.5 Analytics cookies are used for reporting.'),source.text.replace(source.instruction,'You can manage cookies.'),source.text.replace(source.instruction,'For example: '+source.instruction)]){
  assert.equal((await canonical(fixture(text))).presence.signal,undefined);
 }
});
test('Joybuy typed signal cannot lose source provenance, UK scope, purpose or its version',async()=>{
 const signal=(await canonical()).presence.signal!;assert.ok(signal);
 for(const changed of [
  {...signal,sourceBinding:undefined}, {...signal,scopeLabel:'Sitewide opt-out'}, {...signal,contextPassage:undefined},
  {...signal,documentUrl:'https://www.joybuy.co.uk/country-selection'},
  {...signal,sourceBinding:{...signal.sourceBinding,requestedUrl:'https://www.joybuy.com/other'}},
  ...[1,2,3,4,5,6,7].map(v=>({...signal,version:`sale_sharing_opt_out_signal.v${v}`})),
 ])assert.equal(optOutPresenceSignalSchema.safeParse(changed).success,false);
});
test('Joybuy parent assessment binds the scan, source hash, exact report and observation time',async()=>{
 const {review}=await canonical();
 const parent=deriveConsentControlAssessment({scan:{scanId:review.scanId,finalUrl:review.documentUrl}});parent.californiaPrivacyReview=review;
 for(const patch of [{scanId:'other'},{sourceHash:'f'.repeat(64)},{documentUrl:'https://joybuy.com/'},
  {sourceBinding:{...review.optOutPresenceSignal!.sourceBinding,observedAt:'2026-10-25T12:00:01.000Z'}}]){
  const changed=structuredClone(parent);assert.ok(changed.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');
  Object.assign(changed.californiaPrivacyReview.optOutPresenceSignal!,patch);
  assert.equal(consentControlAssessmentSchema.safeParse(changed).success,false);
 }
});
test('Joybuy reviewed source cannot promote no-go attempts or additional extraction limitations',async()=>{
 const {buildPositiveOptOutPolicyEvidence}=await import('./local-v2-dag-report');
 const {projectReviewedOwnerOptOutDocuments}=await import('./opt-out-presence-signal-projection');
 const f=fixture(),{review}=await canonical(f),positive=buildPositiveOptOutPolicyEvidence(f.bundle,source.documentUrl,f.context);
 assert.equal(projectReviewedOwnerOptOutDocuments(f.bundle,CA_FIXTURE_SOURCE.sha256,positive,review).length,1);
 const limited=structuredClone(positive);limited.projection.documents[0]!.limitationKeys.push('policy_text_artifact_text_unavailable');
 assert.equal(projectReviewedOwnerOptOutDocuments(f.bundle,CA_FIXTURE_SOURCE.sha256,limited,review).length,0);
 f.bundle.scanNoGoAssessment={decision:'no_go'} as NonNullable<typeof f.bundle.scanNoGoAssessment>;
 assert.equal(projectReviewedOwnerOptOutDocuments(f.bundle,CA_FIXTURE_SOURCE.sha256,positive,review).length,0);
});
