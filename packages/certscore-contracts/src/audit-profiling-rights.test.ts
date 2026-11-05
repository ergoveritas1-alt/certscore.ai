import test from 'node:test';
import assert from 'node:assert/strict';
import {article13DisclosureRejectReason,hasSubstantiveAutomatedDecisionOrProfilingEvidence,hasSubstantiveRightsDisclosure} from './article13-disclosure-rejection';
const right='Minnesota residents also have the right to review the personal information used in the processing and, if it is inaccurate, have the profiling reevaluated.';
const use='Some of the ways in which we process personal information to connect users with health-related support services may be considered profiling in Covered States.';
const modes=['scan_core','retained_report','multilingual_classifier'] as const;
test('a review right alone does not establish a profiling practice in any read mode',()=>{
 for(const text of [right,'Residents have the right to review personal information used for profiling.','Consumers may have a right to review personal data used for automated decisions.','Individuals have the right to object to profiling using their personal information.','Data subjects also have the right to review personal information used for profiling.']){
  assert.equal(hasSubstantiveAutomatedDecisionOrProfilingEvidence(text),false);
  for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'automated_decision_making_or_profiling',{mode}),'insufficient_row_specific_terms');
 }
});
test('supported rights alongside the review sentence stay usable without implying profiling',()=>{
 const text=right+' You have the right to access your personal information.';
 assert.equal(hasSubstantiveRightsDisclosure(text),true);
 for(const mode of modes){
  assert.equal(article13DisclosureRejectReason(text,'data_subject_rights',{mode}),null);
  assert.equal(article13DisclosureRejectReason(text,'automated_decision_making_or_profiling',{mode}),'insufficient_row_specific_terms');
 }
});
test('qualified use and nonuse remain valid disclosures alongside rights',()=>{
 for(const practice of [use,'We do not use personal information for profiling or automated decisions.','We use personal information for profiling to personalize our services.']){
  for(const text of [practice,right+' '+practice,practice+' '+right]){
   assert.equal(hasSubstantiveAutomatedDecisionOrProfilingEvidence(text),true);
   for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'automated_decision_making_or_profiling',{mode}),null,mode+':'+text);
  }
 }
});
test('unrelated uses of right do not suppress a concrete profiling practice',()=>{
 const text='We use personal information for profiling to recommend the right service for each customer.';
 for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'automated_decision_making_or_profiling',{mode}),null);
});
