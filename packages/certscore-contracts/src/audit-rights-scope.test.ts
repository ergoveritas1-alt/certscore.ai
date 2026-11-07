import test from 'node:test';import assert from 'node:assert/strict';
import {article13DisclosureRejectReason} from './article13-disclosure-rejection';
import {findBoundedEnglishRightsStatement} from './gdpr-transparency-topic-classifier';
const modes=['scan_core','retained_report','multilingual_classifier'] as const;
const verify=(text:string,observed:boolean)=>{for(const mode of modes)assert.equal(article13DisclosureRejectReason(text,'data_subject_rights',{mode})===null,observed,mode+':'+text);};
test('a concrete personal-information review right qualifies in every reader',()=>{
 for(const text of ['Minnesota residents also have the right to review the personal information used in the processing and, if it is inaccurate, have the profiling reevaluated.','Consumers may have a right to review your personal data.'])verify(text,true);
});
test('generic rights headings and directory-request navigation do not establish a substantive right',()=>{
 for(const text of ['Your Rights. Read our privacy policy. Cookie Notice. Security. Contact Us.','Data Subject Rights. Read our notice to learn about our privacy policy.','Privacy controls. Read our privacy policy and cookie notice.','Submit a request to access non-public RDDS data.'])verify(text,false);
});
test('specific rights headings and separate personal-data rights remain useful',()=>{
 for(const text of ['Your right to object to us processing your information.','Submit a request to access non-public RDDS data. You have the right to access your personal information.','You have the right to access your personal registration data.'])verify(text,true);
});
test('scoped and delegated rights remain presence evidence without implying complete GDPR rights',()=>{
 for(const text of ['These rights include the right to access your health information and the right to amend your health information. Please contact your healthcare provider.','Eligible students have the right to access their education records and request amendment of inaccurate records.','If you are seeking to exercise your rights under the CCPA, contact our customer directly. We process your personal information on their behalf.'])verify(text,true);
});
test('data-processing consent withdrawal remains substantive without relying on a generic heading',()=>{
 verify('If you have provided consent for the processing of your personal information, you may have the right to withdraw your consent.',true);
 verify('Your Rights. You may have the right to withdraw from your purchase contract within fourteen days.',false);
});

test('new rights candidates retain source scope without accepting questions or examples',()=>{
 const clause='Residents have the right to review your personal information.';
 assert.equal(findBoundedEnglishRightsStatement(clause),clause);
 for(const value of ['If residents have the right to review your personal information, contact us.','Do residents have the right to review your personal information?','Example: "'+clause+'"','We explain whether residents have the right to review your personal information.'])assert.equal(findBoundedEnglishRightsStatement(value),undefined,value);
});
test('new rights candidate bounds reject clipped and oversized source sentences',()=>{
 assert.equal(findBoundedEnglishRightsStatement('Residents have the right to review your personal information'),undefined);
 assert.equal(findBoundedEnglishRightsStatement('Residents have the right to review your personal information '+ 'through the portal '.repeat(40)+'.'),undefined);
});
