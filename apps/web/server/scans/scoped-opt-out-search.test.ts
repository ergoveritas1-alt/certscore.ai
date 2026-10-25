import assert from 'node:assert/strict';
import test from 'node:test';
import {CALIFORNIA_NINE_POINT_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,assessBroadOptOutPresence} from '@certscore/contracts';
import {retainDomOptOutSearch} from '../../../../packages/certscore-scan-core/src/dom-opt-out-label';
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,CA_FIXTURE_POLICY} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';

function run(mutate?:(f:ReturnType<typeof californiaCoverageFixture>)=>void,withPolicy=false,text=CA_FIXTURE_POLICY){
 const f=californiaCoverageFixture(text);f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_NINE_POINT_LINK_POLICY;
 const documentIdentity={source:'cdp_loader_id' as const,token:'original-body-loader'};
 const optOutSearch=retainDomOptOutSearch({value:'A usable public website. Product information. Contact. Footer.',url:CA_FIXTURE_URL,documentIdentity,capturedAtMs:900},'dom_text_pre_consent');
 f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:CA_FIXTURE_URL,documentIdentity,capturedAtMs:900,consentStateAtTime:'pre_consent',optOutSearch}as typeof f.bundle.domSnapshots[number]];
 mutate?.(f);
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,withPolicy?f.policyEvidence:undefined)!;assert.ok(review?.contractVersion==='certscore.california-privacy-review.v10');
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=review;
 const saved=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:saved}});
 return {f,review,saved,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,CA_FIXTURE_URL),score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets})};
}
test('scoped Not observed needs its own searched body proof but no complete governing policy',()=>{
 const r=run();assert.equal(r.presence.state,'not_observed');assert.equal(r.review.optOutNegativeSearch,undefined);
 assert.equal(r.review.broadOptOutAssessment?.basis,'scoped_negative_search');assert.equal(r.presence.absenceScope,'Captured starting-page observations');
 assert.deepEqual(r.presence.absenceLimitations,['Complete governing-policy text was not available.']);
 assert.equal(r.presence.absenceSourceUrl,CA_FIXTURE_URL);assert.deepEqual(r.score.deductions,[]);
 const old=structuredClone(r.saved);assert.ok(old.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');delete old.californiaPrivacyReview.scopedOptOutSearch;
 old.californiaPrivacyReview.broadOptOutAssessment=assessBroadOptOutPresence(old.californiaPrivacyReview,'sale_sharing_opt_out_assessment.v1');
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:old}});
 assert.equal(projectCaliforniaOptOutPresence(packets,r.f.bundle.scanId,CA_FIXTURE_URL).state,'unknown');
 assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:old.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}),r.score);
});
test('limited frame/control coverage stays disclosed without changing inspection or scoring eligibility',()=>{
 const r=run(f=>Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',uninspectedFrameCount:1,frameCount:1,inaccessibleFrameCount:1,unnamedControlCount:1}));
 assert.equal(r.presence.state,'not_observed');assert.equal(r.review.choiceSurface,'unknown');assert.equal(r.review.inspection?.coverage,'limited');
 assert.deepEqual(r.presence.absenceLimitations,['Control inspection was limited.','Some frames were not inspected.','Some controls had no readable name.','Complete governing-policy text was not available.']);
 assert.deepEqual(r.score.deductions,[]);
});
test('missing proof, changed identities, capped text and material capture gaps remain Unknown',()=>{
 const changes=[
  (f:ReturnType<typeof californiaCoverageFixture>)=>{delete f.bundle.domSnapshots[0]!.optOutSearch;},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.documentIdentity!.token='other';},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.url+='elsewhere';},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.optOutSearch!.truncated=true;},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.optOutSearch!.result='ambiguous_hint';},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.optOutSearch!.result='capture_unusable';},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots[0]!.optOutSearch!.capturedAtMs=100000;},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{f.bundle.domSnapshots.push(structuredClone(f.bundle.domSnapshots[0]!));},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',documentStable:false});},
  (f:ReturnType<typeof californiaCoverageFixture>)=>{Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',representativeDocument:false});},
 ];
 for(const change of changes)assert.equal(run(change).presence.state,'unknown');
 const bad=run().saved;assert.ok(bad.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');assert.ok(bad.californiaPrivacyReview.scopedOptOutSearch?.version==='sale_sharing_opt_out_scoped_search.v1');bad.californiaPrivacyReview.scopedOptOutSearch.inspectionSourceHash='f'.repeat(64);
 assert.equal(consentControlAssessmentSchema.safeParse(bad).success,false);
});

test('the four unresolved leads cannot become positives or scoped negatives through generic wording',()=>{
 const cases=[
  {name:'Kotlin',body:'Public developer documentation.\nOpt-Out',policy:'Privacy information.',missing:false},
  {name:'SparkFun',body:'Electronics products and documentation.',policy:'SparkFun supports the Do Not Track standard. Install the Google Analytics Opt-Out Browser Add-on.',missing:true},
  {name:'Joybuy',body:'Temporary service interruption.\nPersonalised settings\nManage cookies',policy:'Generic cookie preferences.',missing:false},
  {name:'MyOddBalls',body:'Products, account and contact information.',policy:'We may segment your data for marketing using marketing tools such as Klaviyo and Meta. You can opt out of profiling at any time. Email lookafter@myoddballs.com to exercise your rights.',missing:false},
 ];
 for(const c of cases){
  const r=run(f=>{
   if(c.missing)delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;
   const s=f.bundle.domSnapshots[0]!;s.optOutSearch=retainDomOptOutSearch({value:c.body,url:s.url,documentIdentity:s.documentIdentity,capturedAtMs:s.capturedAtMs},s.artifactId);
  },true,CA_FIXTURE_POLICY+' '+c.policy);
  assert.equal(r.presence.state,'unknown',c.name);assert.equal(r.review.optOutPresenceSignal,undefined,c.name);
 }
});
test('persisted scoped assessment cannot hide its original inspection limits',()=>{
 const r=run(f=>Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,{coverage:'limited',unnamedControlCount:1}));
 const parent=structuredClone(r.saved),review=parent.californiaPrivacyReview!;assert.ok(review.contractVersion==='certscore.california-privacy-review.v10');
 review.scopedOptOutSearch!.limitations=[];review.broadOptOutAssessment=assessBroadOptOutPresence(review);
 assert.equal(consentControlAssessmentSchema.safeParse(parent).success,false);
});

test('historical broad v2 and original scoped v1 proof remain readable without newer usability fields',()=>{
 const r=run();assert.equal(r.review.scopedOptOutSearch?.version,'sale_sharing_opt_out_scoped_search.v1');
 const parent=structuredClone(r.saved);assert.ok(parent.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');
 parent.californiaPrivacyReview.broadOptOutAssessment=assessBroadOptOutPresence(parent.californiaPrivacyReview,'sale_sharing_opt_out_assessment.v2');
 assert.ok(consentControlAssessmentSchema.safeParse(JSON.parse(JSON.stringify(parent))).success);
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
 assert.equal(projectCaliforniaOptOutPresence(packets,r.f.bundle.scanId,CA_FIXTURE_URL).state,'not_observed');
 const legacy=run(f=>{const o=f.bundle.domSnapshots[0]!.optOutSearch!;assert.ok(o.version==='dom_opt_out_search.v2');const {bodyUsability,...rest}=o;f.bundle.domSnapshots[0]!.optOutSearch={...rest,version:'dom_opt_out_search.v1'};});
 assert.equal(legacy.presence.state,'not_observed');assert.equal(legacy.review.scopedOptOutSearch?.version,'sale_sharing_opt_out_scoped_search.v1');
});
