import assert from 'node:assert/strict';
import test from 'node:test';
import {article13DisclosureRejectReason,hasSubstantiveAutomatedDecisionOrProfilingEvidence} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics,EXPLICIT_PROFILING_PRACTICE_PATTERN} from './gdpr-transparency-topic-classifier';
const org='Personal information should not be transferred outside The Example State University unless the transfer is compatible with the disclosed purpose for which it was collected.';
test('an organization boundary alone does not establish an international transfer disclosure',()=>{
 for(const text of [org,org.replace('The Example State University','our company'),org.replace('The Example State University','this organization')])
  for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'international_transfers',{mode}),'insufficient_row_specific_terms');
});
test('organizational context does not hide a separate explicitly geographical transfer disclosure',()=>{
 for(const geo of ['Personal information is transferred to the United States.','Personal data is processed outside the EEA.','International transfers of personal data use standard contractual clauses.'])
  for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(org+' '+geo,'international_transfers',{mode}),null,geo+':'+mode);
});
test('first-party profiling practice statements retain their stated conditional scope',()=>{
 for(const text of ['The Company may use user information for profiling in order to provide personalized advertisements, recommendations, and content tailored to user preferences.','Some of the ways in which we process personal information to connect users with support services may be considered profiling in Covered States.']){
  assert.equal(hasSubstantiveAutomatedDecisionOrProfilingEvidence(text),true);
  assert.ok(classifyGdprTransparencyTopics({section:{body:text}}).matches.some(m=>m.topic==='automated_decision_making_or_profiling'));
  for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'automated_decision_making_or_profiling',{mode}),null,mode);
 }
});
test('questions, hypotheticals, rights and definitions do not acquire the new practice rule',()=>{
 for(const text of ['Does the company use user information for profiling?','If the company may use user information for profiling, contact us.','Profiling means processing of personal information.','You have the right to ask whether we use personal information for profiling.','Some of the ways in which other companies process personal information may be considered profiling.'])assert.equal(EXPLICIT_PROFILING_PRACTICE_PATTERN.test(text),false,text);
});
