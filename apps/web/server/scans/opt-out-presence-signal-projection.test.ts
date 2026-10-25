import assert from 'node:assert/strict';
import test from 'node:test';
import {CALIFORNIA_RUNTIME_LINK_POLICY,OPT_OUT_SIGNAL_FINDING_ID,consentControlAssessmentSchema,deriveConsentControlAssessment,optOutPresenceSignalSchema,optOutInstructionLabel} from '@certscore/contracts';
import {californiaCoverageFixture,CA_FIXTURE_POLICY,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {projectOptOutPresenceSignal} from './opt-out-presence-signal-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence,projectCaliforniaChoicePresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
const instruction='For more information and to exercise your right to opt-out of Selling and Sharing, please see our "Your Privacy Choices" page, which contains our Notice of the Right to Opt-Out and opt-out mechanism.';
function fixture(text=CA_FIXTURE_POLICY+' '+instruction){const f=californiaCoverageFixture(text);f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage='en');return f;}
function canonical(f:ReturnType<typeof fixture>){const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;assert.ok(review);const parent=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});parent.californiaPrivacyReview=review;
const p=consentControlAssessmentSchema.parse(parent),packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:p}});
return {p,review,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,CA_FIXTURE_URL),score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets})};}
test('specific retained opt-out instructions support observed without operation verification or a homepage control',()=>{const f=fixture();delete f.bundle.policySurfaceInspection!.privacyChoiceInspection;const r=canonical(f);
assert.equal(r.review.choiceSurface,'unknown');assert.equal(r.presence.state,'observed');assert.equal(projectCaliforniaChoicePresence(r.packets,f.bundle.scanId,CA_FIXTURE_URL),null);
assert.equal(r.presence.signal?.label,'Your Privacy Choices');assert.equal(r.presence.signal?.effectiveness,'not_verified');const fact=r.packets.find(p=>p.unifiedFindingId===OPT_OUT_SIGNAL_FINDING_ID)!;assert.ok(fact.surfacingDecision.reportable);assert.equal(fact.scoreEffects?.length??0,0);
assert.equal(projectCaliforniaOptOutPresence(r.packets,'wrong',CA_FIXTURE_URL).state,'unknown');assert.equal(projectCaliforniaOptOutPresence(r.packets.map(p=>({...p,sourceRefs:[]})),f.bundle.scanId,CA_FIXTURE_URL).state,'unknown');
const old=structuredClone(r.review);assert.ok(old.contractVersion==='certscore.california-privacy-review.v10');delete old.optOutPresenceSignal;delete old.broadOptOutAssessment;const parent=structuredClone(r.p);parent.californiaPrivacyReview=old;const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:old,checklistRows:[],unifiedFindings:packets}),r.score);
});
test('direct opt-out instructions need no claim that the named route is a verified mechanism',()=>{
for(const text of ['To opt out of sale or sharing, visit Your Privacy Choices.','Exercise your right to opt-out of sharing using Your Privacy Choices.','Use Do Not Sell or Share My Personal Information to submit your opt-out request.','To opt-out, see: Do Not Sell or Share My Personal Information in the website footer.','You may opt-out by clicking this Do Not Sell My Info link.']){
  const result=canonical(fixture(text));assert.equal(result.presence.state,'observed',text);assert.equal(result.presence.signal?.effectiveness,'not_verified');
}});
test('v2 recognizes explicit English instructions despite page-level language metadata without altering other language assessments',()=>{
 const f=fixture('The operator provides a «Do Not Sell or Share My Personal Information» opt-out mechanism and treats the Global Privacy Control as a valid opt-out request.');
 f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage='es');const r=canonical(f);
 assert.equal(r.presence.state,'observed');assert.equal(r.presence.signal?.version,'sale_sharing_opt_out_signal.v7');
 assert.ok(r.review.contractVersion==='certscore.california-privacy-review.v10');assert.equal(r.review.rightsAssessment,undefined);
 assert.equal(optOutInstructionLabel('To opt-out, see: Do Not Sell My Info in the footer.'),undefined,'v1 matcher retains its original threshold');
 const {scope,scopeLabel,contextPassage,sourceBinding,...legacy}=r.presence.signal!;
 assert.equal(optOutPresenceSignalSchema.safeParse({...legacy,version:'sale_sharing_opt_out_signal.v1'}).success,true,'existing v1 evidence stays readable');
});
test('a right alone, headings, generic promises, examples and future plans do not create a positive method signal',()=>{for(const text of ['You have the right to opt out of Selling and Sharing.','Your Privacy Choices.','We respect privacy rights.','Our Your Privacy Choices page provides no opt-out mechanism for sale or sharing.',"Our Your Privacy Choices page does not contain an opt-out mechanism for sale or sharing.","Our Your Privacy Choices page doesn’t provide an opt-out mechanism for sale or sharing.",'We plan to provide our "Your Privacy Choices" page containing an opt-out mechanism.','For example, use a "Your Privacy Choices" page with an opt-out mechanism.','You can opt out of marketing by emailing privacy@example.test.','You can install the Google Analytics opt-out browser add-on.','Your Privacy Choices describes your rights to opt-out of selling or sharing.']){const r=canonical(fixture(text));assert.ok(r.review.contractVersion==='certscore.california-privacy-review.v10'&&!r.review.optOutPresenceSignal,text);}});
test('unrelated, altered, translated and unverified policy sources cannot support the signal',()=>{const f=fixture();f.bundle.policySurfaceObservations.forEach(s=>s.translationApplied=true);assert.equal(canonical(f).presence.signal,undefined);
const r=canonical(fixture()),bad=[{evidenceRef:'policy-text:policy',textSha256:'b'.repeat(64),text:instruction,url:CA_FIXTURE_URL+'policy'}];assert.equal(projectOptOutPresenceSignal(r.review,bad),undefined);
const signal=r.presence.signal!;assert.ok(signal);for(const patch of [{scanId:'other'},{sourceHash:'f'.repeat(64)},{documentUrl:CA_FIXTURE_URL+'other'}]){const copy=structuredClone(r.p);assert.ok(copy.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');copy.californiaPrivacyReview.optOutPresenceSignal={...signal,...patch};assert.equal(consentControlAssessmentSchema.safeParse(copy).success,false);}
assert.equal(optOutPresenceSignalSchema.safeParse({...signal,passage:{...signal.passage,excerpt:'You have the right to opt out.'}}).success,false);
});
test('strict absence and historical records retain their original meaning',()=>{const f=fixture();delete f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy;const r=canonical(f);assert.ok(r.review.contractVersion==='certscore.california-privacy-review.v10'&&!r.review.optOutPresenceSignal);const frozen=JSON.stringify(r.p);projectCaliforniaOptOutPresence(r.packets,f.bundle.scanId,CA_FIXTURE_URL);assert.equal(JSON.stringify(r.p),frozen);
const withSignal=canonical(fixture());assert.equal(withSignal.review.choiceSurface,'not_observed_in_inspected_scope');assert.equal(withSignal.presence.state,'observed');assert.ok(Buffer.byteLength(JSON.stringify(withSignal.presence.signal))<=2048);
});
