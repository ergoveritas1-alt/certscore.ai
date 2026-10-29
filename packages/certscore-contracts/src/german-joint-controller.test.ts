import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyGdprTransparencyTopics} from './gdpr-transparency-topic-classifier';
const declaration='Gemeinsam Verantwortliche für den Betrieb dieser Internetseite im Sinne der Europäischen Datenschutz-Grundverordnung (DSGVO) und zugleich Diensteanbieter sind: 1. Beispiel Zeitung GmbH & Co. KG Breiter Gang 10, 49074 Osnabrück. E-Mail: info@example.test.';
test('explicit German website joint-controller declaration retains named entity evidence',()=>{
 const match=classifyGdprTransparencyTopics({text:declaration,retainSemanticAlternatives:true}).matches.find(m=>m.matchedTerm==='benannte gemeinsam verantwortliche fur diese internetseite');
 assert.equal(match?.topic,'controller_contact');assert.equal(match?.matchedLocale,'de');assert.match(match!.evidenceExcerpt,/Beispiel Zeitung/);
});
test('generic responsibility, missing named entity and platform context cannot supply website controller declaration',()=>{
 for(const text of [
 'Gemeinsam Verantwortliche: Bitte kontaktieren Sie uns.',
 declaration.replace('Beispiel Zeitung GmbH & Co. KG','unser Unternehmen'),
 declaration.replace('für den Betrieb dieser Internetseite','für unsere Werbekampagne'),
 declaration.replace('Datenschutz-Grundverordnung (DSGVO)','Geschäftsordnung'),
 'Meta und wir sind gemeinsam verantwortlich für die Verarbeitung von Daten. Mehr Informationen finden Sie auf der Website von Meta Platforms GmbH.',
 ])assert.equal(classifyGdprTransparencyTopics({text,retainSemanticAlternatives:true}).matches.some(m=>m.matchedTerm==='benannte gemeinsam verantwortliche fur diese internetseite'),false,text);
});
export {declaration};
