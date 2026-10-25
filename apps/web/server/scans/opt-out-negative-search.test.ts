import assert from 'node:assert/strict';
import test from 'node:test';
import {CALIFORNIA_RUNTIME_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,OPT_OUT_ABSENCE_FINDING_ID} from '@certscore/contracts';
import {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,CA_FIXTURE_POLICY} from './california-review-coverage.fixture';
import {projectCaliforniaPrivacyReview} from './california-privacy-review-projection';
import {buildUnifiedFindingDisplayPackets} from '../../lib/scans/unified-findings';
import {projectCaliforniaOptOutPresence} from '../../lib/scans/california-choice-presence';
import {deriveCaliforniaRegulatoryScore} from '../../lib/scans/california-regulatory-score';
function run(text=CA_FIXTURE_POLICY,limited=false){
 const f=californiaCoverageFixture(text);f.bundle.policySurfaceInspection!.californiaReviewPolicy='california-privacy-review.v10';f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
 f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage='en');
 if(limited)f.bundle.policySurfaceInspection!.privacyChoiceInspection=null as never;
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;assert.ok(review.contractVersion==='certscore.california-privacy-review.v10');
 const p=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:CA_FIXTURE_URL}});p.californiaPrivacyReview=review;
 const parent=consentControlAssessmentSchema.parse(p),packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
 return {f,review,parent,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,CA_FIXTURE_URL)};
}
test('complete page and policy negative search supports factual Not observed independently of a no-sale declaration',()=>{
 const r=run();assert.ok(r.review.optOutNegativeSearch);assert.equal(r.presence.state,'not_observed');assert.equal(r.presence.absenceScope,'Starting page and retained policy routes');
 const fact=r.packets.find(p=>p.unifiedFindingId===OPT_OUT_ABSENCE_FINDING_ID)!;assert.ok(fact.surfacingDecision.reportable);assert.equal(fact.scoreEffects?.length??0,0);
 const old=structuredClone(r.parent);assert.ok(old.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');delete old.californiaPrivacyReview.optOutNegativeSearch;delete old.californiaPrivacyReview.broadOptOutAssessment;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:old}});
 assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:r.review,checklistRows:[],unifiedFindings:r.packets}),deriveCaliforniaRegulatoryScore({assessment:old.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}));
 assert.equal(projectCaliforniaOptOutPresence(r.packets,'other',CA_FIXTURE_URL).state,'unknown');
});
test('incomplete inventory, ambiguous instructions, GPC language and search overflow cannot create negative proof',()=>{
 assert.equal(run(CA_FIXTURE_POLICY,true).review.optOutNegativeSearch,undefined);
 for(const text of [CA_FIXTURE_POLICY+' Your Privacy Choices.',CA_FIXTURE_POLICY+' Global Privacy Control is supported.',CA_FIXTURE_POLICY+' To opt out, click [enlace].',CA_FIXTURE_POLICY+' Sentence. '.repeat(257)])assert.equal(run(text).review.optOutNegativeSearch,undefined);
 const r=run(),bad=structuredClone(r.parent);assert.ok(bad.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');bad.californiaPrivacyReview.inspection=null;
 assert.equal(consentControlAssessmentSchema.safeParse(bad).success,false);
});

test('new broad absence rejects homepage-only evidence, DNT and non-English negative searches',()=>{
 for(const text of [CA_FIXTURE_POLICY+' We honor Do Not Track signals.',CA_FIXTURE_POLICY+' You may use a browser signal.',CA_FIXTURE_POLICY+' Cookie preferences are available.']){
  const r=run(text);assert.equal(r.review.choiceSurface,'not_observed_in_inspected_scope');
  assert.equal(r.review.optOutNegativeSearch,undefined);assert.equal(r.presence.state,'unknown');
 }
 const r=run();
 for(const language of ['ja','de',undefined]){
  const f=structuredClone(r.f);f.bundle.policySurfaceObservations.forEach(s=>s.documentLanguage=language);
  const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,f.policyEvidence)!;
  assert.ok(review.contractVersion==='certscore.california-privacy-review.v10');assert.equal(review.optOutNegativeSearch,undefined);assert.equal(review.broadOptOutAssessment?.state,'unknown');
 }
 const review=projectCaliforniaPrivacyReview(r.f.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL)!;
 assert.ok(review.contractVersion==='certscore.california-privacy-review.v10');assert.equal(review.choiceSurface,'not_observed_in_inspected_scope');assert.equal(review.broadOptOutAssessment?.state,'unknown');
 const bad=structuredClone(r.parent);assert.ok(bad.californiaPrivacyReview?.contractVersion==='certscore.california-privacy-review.v10');bad.californiaPrivacyReview.broadOptOutAssessment!.state='observed';
 assert.equal(consentControlAssessmentSchema.safeParse(bad).success,false,'a stored state cannot contradict its evidence');
});
