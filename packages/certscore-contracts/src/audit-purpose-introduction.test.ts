import assert from 'node:assert/strict';import test from 'node:test';
import {article13DisclosureRejectReason} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics,findConcreteEnglishPurposeStatement} from './gdpr-transparency-topic-classifier';
const assurance='The publisher takes privacy very seriously and will process and use your personal data in a safe and secure manner. When you use the service, you want us to handle your personal data with care and ensure that your data does not end up with other companies.';
const intro='This privacy policy is designed to help you understand how we collect, process, store, and share personal information about our users. It also explains what controls you have over how we process your information.';
const overview='This privacy policy applies to all users of our sites and services and covers what information we collect and why we collect it, how we use the information we collect, and the choices you have to access and update that information.';
const own='Put briefly, we use your personal data to be able to offer you Study Material, to inform you about our service and to be able to make personal offers.';
for(const [label,text] of [['assurance',assurance],['intro',intro],['overview',overview],['security assurance','We have appropriate security measures in place to prevent personal information from being accidentally lost or used without authorization.'],['recruitment introduction','Contents How we use the information about you. We are committed to protecting the privacy and security of your personal information.']] as const)test(`purpose ${label} is not a concrete data use`,()=>{
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'processing_purposes',{mode}),'insufficient_row_specific_terms');
 assert.ok(!classifyGdprTransparencyTopics({section:{body:text}}).matches.some(m=>m.topic==='processing_purposes'));
});
test('a separate complete purpose remains eligible in mixed introductory text',()=>{
 for(const text of [own,intro+' '+own,own+' '+assurance]){
  for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'processing_purposes',{mode}),null);
  assert.equal(findConcreteEnglishPurposeStatement(text),own);
 }
});
test('a quoted or questioned example is not a first-party purpose statement',()=>{
 for(const text of ['This policy explains how we use your personal data to provide the service.','Example:\nWe use your personal data to provide the service.','We use your personal data to provide the service?', 'We use this data to provide the service.'])assert.equal(findConcreteEnglishPurposeStatement(text),undefined);
});
test('retained passive nominal purposes stay useful beside an introduction',()=>{
 const text=intro+' Personal data is used solely for fraud prevention and system security.';
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'processing_purposes',{mode}),null);
});
