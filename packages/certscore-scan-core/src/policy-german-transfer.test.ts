import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {extractPolicySections,retainedPolicySectionsForObservation,retainedArticle13SectionEvidenceFromSections} from './scanners/policy-surface-scanner';
const text='In der Regel übermitteln wir Ihre Daten nicht in andere Länder oder Drittländer (Länder, die weder Mitglied der Europäischen Union noch des Europäischen Wirtschaftsraums sind) oder an internationale Organisationen. Eine Datenübermittlung in Drittländer kann jedoch ausnahmsweise stattfinden, soweit dies zur Ausführung von Leistungen Ihnen gegenüber erforderlich, gesetzlich vorgeschrieben ist oder Sie uns Ihre Einwilligung erteilt haben.';
const url='https://publisher.example/privacy',hash=(s:string)=>createHash('sha256').update(s).digest('hex');
test('retained section selects complete German nonuse together with exceptions',()=>{
 const parent=text+' Einige der Dienstleister verarbeiten personenbezogene Daten in Drittländern. '+ 'Weitere Angaben finden Sie in dieser Datenschutzerklärung. '.repeat(8);
 const result=retainedArticle13SectionEvidenceFromSections([{sourceUrl:url,heading:'Datenübermittlung in Drittstaaten',textExcerpt:parent,extractionMethod:'html_heading_hierarchy',sourceOffsetBasis:'sanitized_html',documentTextSha256:hash(parent),quality:'strong',extractionState:'complete',charStart:0,charEnd:parent.length}],url).find(e=>e.coverageArea==='international_transfers')!;
 assert.equal(result.signalObserved,'observed');assert.equal(result.selectedPolicySectionExcerpt,text);assert.equal(result.evidenceTextSha256,hash(text));assert.equal(result.sourceDocumentTextSha256,hash(parent));
});
test('fresh visible-text fallback retains the complete bounded source declaration and exact offsets',()=>{
 const source='Datenschutz. '+ 'Wir verarbeiten Informationen zur Erbringung unserer Leistungen. '.repeat(25)+'Datenübermittlung in Drittstaaten '+text+' Ihre Rechte. '+ 'Sie können Auskunft über Ihre personenbezogenen Daten verlangen. '.repeat(20);
 const sections=retainedPolicySectionsForObservation(extractPolicySections({html:'',sourceUrl:url,visibleText:source}));
 const exact=sections.find(s=>s.textExcerpt===text)!;assert.ok(exact);assert.equal(source.slice(exact.charStart,exact.charEnd),text);assert.equal(exact.documentTextSha256,hash(source.trim()));assert.equal(exact.evidenceTextSha256,hash(text));assert.ok(sections.length<=20);
 const e=retainedArticle13SectionEvidenceFromSections(sections,url).find(e=>e.coverageArea==='international_transfers')!;assert.equal(e.signalObserved,'observed');assert.equal(e.selectedPolicySectionExcerpt,text);
});
