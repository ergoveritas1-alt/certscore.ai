import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {CALIFORNIA_NINE_POINT_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,optOutPresenceSignalSchema} from '@certscore/contracts';
import {retainDomOptOutLabel} from '../../../../packages/certscore-scan-core/src/dom-opt-out-label';
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {projectDomOptOutPresenceSignal} from './opt-out-presence-signal-projection';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
function fixture(text=CA_FIXTURE_POLICY){
 const f=californiaCoverageFixture(text);f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';
 f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_NINE_POINT_LINK_POLICY;
 f.bundle.policySurfaceObservations.forEach(s=>{s.documentLanguage='en';});f.bundle.normalizedUrl=CA_FIXTURE_URL;f.bundle.url=CA_FIXTURE_URL;f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage='limited';return f;
}
function canonical(f:ReturnType<typeof fixture>){
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;assert.ok(review);
 const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=review;
 const persisted=consentControlAssessmentSchema.parse(JSON.parse(JSON.stringify(parent)));
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:persisted}});
 return {review,persisted,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,CA_FIXTURE_URL),
 score:deriveCaliforniaRegulatoryScore({assessment:persisted.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets})};
}
function domFixture(){
 const f=fixture(),value='A substantive website. '.repeat(100)+'\nDo Not Sell or Share My Personal Information';
 const capture={url:CA_FIXTURE_URL,documentIdentity:{source:'cdp_loader_id' as const,token:'independent-consent-document'},capturedAtMs:1000,value};
 f.bundle.domSnapshots=[{artifactId:'dom_text_pre_consent',url:capture.url,documentIdentity:capture.documentIdentity,capturedAtMs:1000,
  path:'/tmp/dom.txt',pagePhase:'network_idle',consentStateAtTime:'pre_consent',textExcerpt:value.slice(0,2000),optOutLabel:retainDomOptOutLabel(capture,'dom_text_pre_consent')}];return f;
}
test('Bloomberg/RCTI-style DOM label beyond the excerpt persists through concern/policy/finding and keeps original inspection unchanged',()=>{
 const f=domFixture(),original=structuredClone(f.bundle.policySurfaceInspection),r=canonical(f);
 assert.equal(r.presence.state,'observed');assert.equal(r.presence.signal?.scope,'observed_page');assert.equal(r.review.choiceSurface,'unknown');
 assert.deepEqual(f.bundle.policySurfaceInspection,original);assert.equal(r.presence.signal?.sourceBinding?.kind,'dom_snapshot');
 assert.equal(r.packets.find(p=>p.unifiedFindingId==='california_policy_opt_out_signal')?.scoreEffects?.length??0,0);
 assert.equal(r.review.contractVersion,'certscore.california-privacy-review.v10');assert.equal(r.score.policyVersion,'california-regulatory-posture.v20-nine-point-link');
});
test('DOM signal rejects wrong source, scan, own token, URL, timestamp, duplicate snapshot and unrelated property',()=>{
 const f=domFixture(),review=canonical(f).review;
 assert.equal(projectDomOptOutPresenceSignal(review,f.bundle,'f'.repeat(64)),undefined);
 for(const mutate of [(x:typeof f)=>{x.bundle.scanId='other';},(x:typeof f)=>{x.bundle.domSnapshots[0]!.documentIdentity!.token='runtime-token';},
  (x:typeof f)=>{x.bundle.domSnapshots[0]!.url='https://other.test/';},(x:typeof f)=>{x.bundle.domSnapshots[0]!.capturedAtMs=999;},
  (x:typeof f)=>{x.bundle.domSnapshots.push(structuredClone(x.bundle.domSnapshots[0]!));}]){
   const x=structuredClone(f);mutate(x);assert.equal(projectDomOptOutPresenceSignal(review,x.bundle,CA_FIXTURE_SOURCE.sha256!),undefined);
 }
});
test('German Google personalized-advertising route is scoped positive; analytics-only and hypothetical instructions stay unresolved',()=>{
 const context='Werbe-Zielgruppen werden verwendet, um personalisierte Werbebotschaften anzuzeigen. ';
 const instruction='Wenn Sie über einen Google-Account verfügen, können Sie der personalisierten Werbung unter folgendem Link widersprechen: https://adssettings.google.com/anonymous?hl=de';
 const r=canonical(fixture(context+instruction));assert.equal(r.presence.state,'observed');assert.equal(r.presence.signal?.scope,'advertising_provider');
 assert.equal(r.presence.signal?.scopeLabel,'Google personalized advertising only');
 for(const text of ['Click here to opt out of Google Analytics.','This is a hypothetical example. '+instruction])assert.notEqual(canonical(fixture(text)).presence.state,'observed');
});
export function localizedFixture(){
 const f=fixture(),parent=f.bundle.policySurfaceObservations[0]!,doc=f.policyEvidence.projection.documents[0]!;
 const text='Política de privacidad Cookies About Us Advertise With Us Aviso legal Política de privacidad Política de contenidos Planes y precios Sus opciones de privacidad Facebook Twitter LinkedIn © 2026 Acme.';
 const sha=createHash('sha256').update(text).digest('hex'),url=new URL('/es/privacy/',CA_FIXTURE_URL).href;
 f.bundle.policySurfaceObservations.push({...parent,observationId:'localized',url,normalizedUrl:url,finalUrl:url,parentObservationId:parent.observationId,
  linkSourcePageUrl:parent.finalUrl,parentSurfaceUrl:parent.finalUrl,traversalDepth:1,directlyLinkedFromScannedPage:false,documentLanguage:'es',ownershipConfidence:0.98,retrievedAt:'2026-10-17T12:00:01.500Z',governingPolicySelection:{contractVersion:'governing_policy_selection.v1',state:'ineligible',score:0,reasonCodes:[]},
  documentTextCoverage:{status:'complete',sourceTextChars:text.length,retainedTextChars:text.length,limitationKeys:[]}});
 f.policyEvidence.projection.documents.push({...doc,observationId:'localized',requestedUrl:url,finalUrl:url,artifactSha256:sha,retainedTextSha256:sha,
  artifactSizeBytes:Buffer.byteLength(text),retainedTextChars:text.length,documentTextCoverage:{status:'complete',sourceTextChars:text.length,retainedTextChars:text.length,limitationKeys:[]}});
 f.policyEvidence.texts.push({observationId:'localized',text});return f;
}
test('All3DP-style linked localized footer is positive without upgrading governing-policy coverage or scores',()=>{
 const f=localizedFixture(),without=structuredClone(f);without.policyEvidence.projection.documents.pop();without.policyEvidence.texts.pop();without.bundle.policySurfaceObservations.pop();
 const r=canonical(f),before=canonical(without);assert.equal(r.presence.state,'observed');assert.equal(r.presence.signal?.scope,'localized_page');
 assert.ok(r.review.contractVersion==='certscore.california-privacy-review.v10'&&before.review.contractVersion==='certscore.california-privacy-review.v10');assert.deepEqual(r.review.reviewCoverage.sourceDocuments,before.review.reviewCoverage.sourceDocuments);assert.equal(r.score.score,before.score.score);assert.deepEqual(r.score.deductions,before.score.deductions);
 assert.equal(r.presence.signal?.sourceBinding?.kind,'linked_policy_page');
 for(const mutate of [(x:typeof f)=>{x.policyEvidence.texts.at(-1)!.text+='altered';},(x:typeof f)=>{x.bundle.policySurfaceObservations.at(-1)!.parentSurfaceUrl='https://other.test/';},
  (x:typeof f)=>{x.bundle.policySurfaceObservations.at(-1)!.targetRelationship='service_provider';}]){const x=structuredClone(f);mutate(x);assert.notEqual(canonical(x).presence.state,'observed');}
 assert.equal(optOutPresenceSignalSchema.safeParse({...r.presence.signal,version:'sale_sharing_opt_out_signal.v3'}).success,false);
});

test('an exact-page named DOM signal blocks a contradictory missing-choice finding while retaining original inspection facts',()=>{
 const f=fixture(CA_FIXTURE_POLICY.replace('We do not sell or share personal information.','Under the CCPA, we sell personal information.'));
 f.bundle.policySurfaceInspection!.privacyChoiceInspection!.coverage='complete';
 const before=canonical(f);assert.equal(before.score.deductions.find(d=>d.findingId==='california_privacy_choice_not_observed')?.points,9);
 f.bundle.domSnapshots=domFixture().bundle.domSnapshots;
 const after=canonical(f);assert.equal(after.presence.state,'observed');assert.equal(after.review.choiceSurface,'not_observed_in_inspected_scope');
 assert.ok(!after.packets.some(p=>p.unifiedFindingId==='california_privacy_choice_not_observed'));
 assert.equal(after.score.deductions.some(d=>d.findingId==='california_privacy_choice_not_observed'),false);
});
