import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {extractPolicySections,retainedPolicySectionsForObservation,retainedArticle13SectionEvidenceFromSections} from './scanners/policy-surface-scanner';
const usage='When you use our Services, we may collect information about your engagement with and utilization of our Services, such as processor and memory usage, storage capacity, navigation of our Services, and system-level metrics. We use this data to operate the Services, maintain and improve the performance and utilization of the Services, develop new features, protect the security and safety of our Services and our customers, and provide customer support.';
const recruitment='The situations in which we will process your personal information in accordance with the lawful bases set out above may include: making a decision about your recruitment or appointment;';
const text=usage;
const url='https://publisher.example/privacy',hash=(s:string)=>createHash('sha256').update(s).digest('hex');
test('retained section preserves the usage-data antecedent with its purpose',()=>{
 const parent=text+' We describe our information practices here. '+ 'Further details about our practices appear in this policy. '.repeat(8);
 const result=retainedArticle13SectionEvidenceFromSections([{sourceUrl:url,heading:'Usage of our Services.',textExcerpt:parent,extractionMethod:'html_heading_hierarchy',sourceOffsetBasis:'sanitized_html',documentTextSha256:hash(parent),quality:'strong',extractionState:'complete',charStart:0,charEnd:parent.length}],url).find(e=>e.coverageArea==='processing_purposes')!;
 assert.equal(result.signalObserved,'observed');assert.equal(result.selectedPolicySectionExcerpt,text);assert.equal(result.evidenceTextSha256,hash(text));assert.equal(result.sourceDocumentTextSha256,hash(parent));
});
for(const text of [usage,recruitment])test('fresh visible-text fallback retains the bounded purpose with exact source offsets: '+text.slice(0,20),()=>{
 const source='Privacy policy. '+ 'We explain our information practices in this policy document. '.repeat(25)+'Usage of our Services. '+text+' Your rights. '+ 'You may ask us to explain the information held about your account. '.repeat(20);
 const sections=retainedPolicySectionsForObservation(extractPolicySections({html:'',sourceUrl:url,visibleText:source}));
 const exact=sections.find(s=>s.textExcerpt===text)!;assert.ok(exact);assert.equal(source.slice(exact.charStart,exact.charEnd),text);assert.equal(exact.documentTextSha256,hash(source.trim()));assert.equal(exact.evidenceTextSha256,hash(text));assert.ok(sections.length<=20);
 const e=retainedArticle13SectionEvidenceFromSections(sections,url).find(e=>e.coverageArea==='processing_purposes')!;assert.equal(e.signalObserved,'observed');assert.equal(e.selectedPolicySectionExcerpt,text);
});
