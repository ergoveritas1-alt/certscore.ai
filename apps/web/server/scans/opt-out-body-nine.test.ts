import assert from 'node:assert/strict';
import test from 'node:test';
import {CALIFORNIA_NINE_POINT_LINK_POLICY,consentUiObservationSchema,assessBroadOptOutPresence,consentControlAssessmentSchema,deriveConsentControlAssessment} from '@certscore/contracts';
import {retainDomOptOutSearch} from '../../../../packages/certscore-scan-core/src/dom-opt-out-label';
import cases from './opt-out-body-nine.fixture.json';
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {projectScopedOptOutSearch} from './scoped-opt-out-search';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
function fixture(c=cases[0]!){
 const f=JSON.parse(JSON.stringify(californiaCoverageFixture()).replaceAll(CA_FIXTURE_URL,c.documentUrl))as ReturnType<typeof californiaCoverageFixture>;
 f.bundle.normalizedUrl=c.documentUrl;f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_NINE_POINT_LINK_POLICY;
 if(c.inspection)Object.assign(f.bundle.policySurfaceInspection!.privacyChoiceInspection!,c.inspection);else delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;
 const documentIdentity={source:'cdp_loader_id' as const,token:'own-pre-consent-document'};
 const body='Public starting page with products, research, news, services and contact information. '.repeat(8);
 const optOutSearch=retainDomOptOutSearch({value:body,url:c.documentUrl,documentIdentity,capturedAtMs:700},'dom_text_pre_consent');
 f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:c.documentUrl,documentIdentity,capturedAtMs:700,consentStateAtTime:'pre_consent',optOutSearch}as typeof f.bundle.domSnapshots[number]];
 f.bundle.consentUiObservations=[consentUiObservationSchema.parse({likelyPresent:false,basis:[],confidence:1,observationId:'consent_ui_pre_consent',observedAtMs:900,documentUrl:c.documentUrl,documentIdentity:{...documentIdentity},documentReadyState:c.checkpointReadyState,
  captureStatus:'no_evidence',inventoryOutcome:c.checkpointOutcome,layerInspected:'first_layer',visibleChoiceLabels:[],controls:[],captureDiagnostics:{completedChannels:['dom_inventory'],failedChannels:[],timedOutChannels:[]}})];
 return f;
}
function canonical(f:ReturnType<typeof fixture>){
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,f.bundle.normalizedUrl)!;assert.ok(review?.contractVersion==='certscore.california-privacy-review.v10');
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:f.bundle.normalizedUrl}});parent.californiaPrivacyReview=review;
 const saved=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:saved}});
 return {review,saved,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,f.bundle.normalizedUrl),score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets})};
}
for(const c of cases)test(`${c.host}: own body/checkpoint supports scoped Not observed without repairing inspection`,()=>{
 const f=fixture(c),before=structuredClone(f.bundle.policySurfaceInspection!.privacyChoiceInspection),r=canonical(f);
 assert.equal(r.presence.state,'not_observed');assert.equal(r.presence.absenceScope,'Captured main-document text only');assert.ok(r.presence.absenceLimitations?.length);
 assert.equal(r.review.scopedOptOutSearch?.version,'sale_sharing_opt_out_scoped_search.v2');assert.deepEqual(r.review.broadOptOutAssessment?.evidenceRefs,['dom-text:dom_text_pre_consent','consent-ui:consent_ui_pre_consent']);assert.deepEqual(r.review.inspection,before??null);
 assert.deepEqual(f.bundle.policySurfaceInspection!.privacyChoiceInspection,before);assert.deepEqual(r.score.deductions,[]);
 assert.equal(r.review.optOutNegativeSearch,undefined,'Independent body proof cannot supply strict negative evidence');
 const old=structuredClone(r.saved);assert.ok(old.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');delete old.californiaPrivacyReview.scopedOptOutSearch;
 old.californiaPrivacyReview.broadOptOutAssessment=assessBroadOptOutPresence(old.californiaPrivacyReview,'sale_sharing_opt_out_assessment.v2');
 assert.ok(consentControlAssessmentSchema.safeParse(old).success);
});
test('own-document proof cannot borrow loaders, URLs, times, incomplete reads or legacy body usability',()=>{
 const mutations=[
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations=[];},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.documentIdentity!.token='runtime-loader';},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.documentUrl+='other';},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.observedAtMs=99999;},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.documentReadyState='loading';},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.captureStatus='observed';},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.layerInspected='unknown';},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.captureDiagnostics!.failedChannels=['dom_inventory'];},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.captureDiagnostics!.timedOutChannels=['dom_inventory'];},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations[0]!.captureDiagnostics!.completedChannels=[];},
  (f:ReturnType<typeof fixture>)=>{f.bundle.consentUiObservations.push(structuredClone(f.bundle.consentUiObservations[0]!));},
  (f:ReturnType<typeof fixture>)=>{const o=f.bundle.domSnapshots[0]!.optOutSearch!;assert.ok(o.version==='dom_opt_out_search.v2');o.bodyUsability='unusable_or_unverified';},
  (f:ReturnType<typeof fixture>)=>{const o=f.bundle.domSnapshots[0]!.optOutSearch!;const {bodyUsability,...legacy}=o as typeof o&{bodyUsability:string};f.bundle.domSnapshots[0]!.optOutSearch={...legacy,version:'dom_opt_out_search.v1'};},
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);assert.equal(canonical(f).presence.state,'unknown');}
 const r=canonical(fixture()),bad=structuredClone(r.saved);assert.ok(bad.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');const proof=bad.californiaPrivacyReview.scopedOptOutSearch!;assert.ok(proof.version==='sale_sharing_opt_out_scoped_search.v2');proof.checkpoint.documentToken='other';
 assert.equal(consentControlAssessmentSchema.safeParse(bad).success,false);
 const bundle=structuredClone(fixture().bundle);bundle.scanNoGoAssessment={decision:'no_go'}as typeof bundle.scanNoGoAssessment;
 assert.equal(projectScopedOptOutSearch(r.review,bundle,[]),undefined);
});
