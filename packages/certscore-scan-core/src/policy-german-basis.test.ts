import assert from 'node:assert/strict';import test from 'node:test';import {createHash} from 'node:crypto';
import {retainedArticle13SectionEvidenceFromSections} from './scanners/policy-surface-scanner';
const own='In diesen Fällen erfolgt die Verarbeitung Ihrer Daten auf der Rechtsgrundlage des Art. 6 Abs. 1 Buchst. a DSGVO.';
const rights='Sie haben das Recht, eine zuvor erteilte Einwilligung zur Verarbeitung Ihrer personenbezogenen Daten zu widerrufen.';
const toc='Inhalt VERANTWORTLICHER UND DATENSCHUTZBEAUFTRAGTER ZWECKE UND RECHTSGRUNDLAGE FÜR DIE VERARBEITUNG PERSONENBEZOGENER DATEN WELCHE PERSONENBEZOGENEN DATEN WERDEN VERARBEITET? DAUER DER SPEICHERUNG IHRER PERSONENBEZOGENEN DATEN EMPFÄNGER DER DATEN IHRE RECHTE KANN SICH DIE VERARBEITUNG DER PERSONENBEZOGENEN DATEN BZW. DIESE DATENSCHUTZERKLÄRUNG ÄNDERN?';
const url='https://publisher.example/privacy',hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const section=(heading:string,textExcerpt:string)=>({sourceUrl:url,heading,textExcerpt,extractionMethod:'html_heading_hierarchy' as const,sourceOffsetBasis:'sanitized_html' as const,documentTextSha256:hash(textExcerpt),evidenceTextSha256:hash(textExcerpt),quality:'strong' as const,extractionState:'complete' as const});
test('own processing basis outranks both rights wording and a topic inventory',()=>{
 const parent='Für einige Verarbeitungszwecke benötigen wir Ihre Einwilligung, die wir gesondert einholen. '+own+' Dies ist der Fall bei Werbung per E-Mail.';
 for(const ss of [[section('Inhalt',toc),section('Ihre Rechte',rights),section('Zwecke und Rechtsgrundlagen',parent)],[section('Zwecke und Rechtsgrundlagen',parent),section('Ihre Rechte',rights),section('Inhalt',toc)]]){
  const e=retainedArticle13SectionEvidenceFromSections(ss,url).find(e=>e.coverageArea==='legal_basis')!;assert.equal(e.signalObserved,'observed');assert.equal(e.selectedPolicySectionExcerpt,own);assert.equal(e.evidenceTextSha256,hash(own));assert.equal(e.sourceDocumentTextSha256,hash(parent));
 }
});
test('a withdrawal-rights section does not assert a processing basis or a missing basis',()=>{
 for(const body of [rights,toc]){const e=retainedArticle13SectionEvidenceFromSections([section('Ihre Rechte',body)],url).find(e=>e.coverageArea==='legal_basis');assert.ok(!e||e.signalObserved==='not_confirmed');}
});
