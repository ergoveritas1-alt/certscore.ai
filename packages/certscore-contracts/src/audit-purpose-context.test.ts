import assert from 'node:assert/strict';import test from 'node:test';
import {article13DisclosureRejectReason,hasProcessingPurposeDataContext} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics,findBoundedUsageOrRecruitmentPurpose} from './gdpr-transparency-topic-classifier';
const usage='When you use our Services, we may collect information about your engagement with and utilization of our Services, such as processor and memory usage, storage capacity, navigation of our Services, and system-level metrics. We use this data to operate the Services, maintain and improve the performance and utilization of the Services, develop new features, protect the security and safety of our Services and our customers, and provide customer support.';
const recruitment='The situations in which we will process your personal information in accordance with the lawful bases set out above may include: making a decision about your recruitment or appointment;';
for(const [name,text] of [['usage antecedent and purpose',usage],['conditional recruitment list item',recruitment]] as const)test(`bounded ${name} stays literal across consumers`,()=>{
 assert.equal(findBoundedUsageOrRecruitmentPurpose(text),text);assert.ok(text.length<=640);assert.equal(hasProcessingPurposeDataContext(text),true);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'processing_purposes',{mode}),null,mode);
 const m=classifyGdprTransparencyTopics({section:{heading:'Policy section',body:text}}).matches.find(m=>m.topic==='processing_purposes')!;assert.ok(m);assert.equal(m.evidenceExcerpt,text);
});
test('a pronoun cannot borrow a missing or unrelated data antecedent',()=>{
 for(const text of [usage.slice(usage.indexOf('We use this data')),usage.replace('. We use this data','. Another company explains its practices. We use this data'),usage.replace('we may collect','another company may collect')])assert.equal(findBoundedUsageOrRecruitmentPurpose(text),undefined);
});
test('questions, quotations and clipped list items do not acquire the bounded rule',()=>{
 for(const text of ['Example:\n'+usage,'An employer says:\n'+recruitment,recruitment.slice(0,-1),usage.slice(0,-1),usage.replace('support.','support?')])assert.equal(findBoundedUsageOrRecruitmentPurpose(text),undefined);
});
test('long examples cannot exceed the existing compact evidence cap',()=>{
 assert.equal(findBoundedUsageOrRecruitmentPurpose(usage.replace('system-level metrics','system-level metrics '+ 'and other metrics '.repeat(25))),undefined);
});
