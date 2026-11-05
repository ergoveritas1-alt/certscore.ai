import assert from 'node:assert/strict';
import test from 'node:test';
import {article13DisclosureRejectReason} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics,findGermanTransferDisclosure} from './gdpr-transparency-topic-classifier';
export const nonuse = 'In der Regel übermitteln wir Ihre Daten nicht in andere Länder oder Drittländer (Länder, die weder Mitglied der Europäischen Union noch des Europäischen Wirtschaftsraums sind) oder an internationale Organisationen. Eine Datenübermittlung in Drittländer kann jedoch ausnahmsweise stattfinden, soweit dies zur Ausführung von Leistungen Ihnen gegenüber erforderlich, gesetzlich vorgeschrieben ist oder Sie uns Ihre Einwilligung erteilt haben.';
export const safeguard = 'Die Übermittlung personenbezogener Daten in solche Drittstaaten außerhalb der EU erfolgt nur, soweit die Europäische Kommission diesbezüglich einen sog. Angemessenheitsbeschluss (Art. 45 Abs. 3 DS-GVO) beschlossen hat (siehe hier ) oder Garantien gem. Art. 46 DS-GVO vorgesehen sind, insbesondere von der Europäischen Kommission erlassene Standarddatenschutzklauseln gem. Art 46 Abs. 2 Buchst. c DS-GVO (siehe hier ).';
for (const [kind,text] of [['nonuse and exceptions',nonuse],['complete safeguards',safeguard]] as const) test(`German ${kind} stays complete across three consumers and canonical classifier`,()=>{
 assert.equal(findGermanTransferDisclosure(text),text);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'international_transfers',{mode}),null,mode);
 for(const input of [{section:{body:text}},{section:{heading:'Policy section',body:text}},{section:{heading:'Datenübermittlung in Drittstaaten',body:text}},{text:'Datenschutz. '+text}]){
  const m=classifyGdprTransparencyTopics(input).matches.find(m=>m.topic==='international_transfers');
  assert.ok(m);assert.equal(m.matchedLocale,'de');assert.equal(m.evidenceExcerpt,text);
 }
});
test('German geography and actual own declaration are required',()=>{
 for(const text of [nonuse.replaceAll('Drittländer','Abteilungen').replace('andere Länder','andere Teams'), 'Sie können die Übertragung Ihrer Daten an einen anderen Verantwortlichen verlangen.', 'Eine Datenübermittlung in Drittländer kann rechtlich zulässig sein.', 'Datenübermittlung in Drittstaaten'])assert.equal(findGermanTransferDisclosure(text),undefined);
});
test('questions, templates and third-party quotes cannot supply an own transfer declaration',()=>{
 for(const prefix of ['Die Behörde sagt:\n', 'Mustertext:\n', 'Beispiel: ','Die Behörde sagt: ','Ein anderes Unternehmen erklärt: ','Sie fragen, ob: ','Mustertext: ','„','Wenn ']){
  assert.equal(findGermanTransferDisclosure(prefix+nonuse),undefined,prefix);
  assert.equal(findGermanTransferDisclosure(prefix+safeguard),undefined,prefix);
 }
});
test('truncated safeguards and an incomplete exception remain unsupported',()=>{
 for(const text of [safeguard.slice(0,251),safeguard.slice(0,-1),nonuse.slice(0,nonuse.indexOf(' Eine')),nonuse.slice(0,-1)]){
  assert.equal(findGermanTransferDisclosure(text),undefined);
  for(const mode of ['scan_core','retained_report'] as const)assert.notEqual(article13DisclosureRejectReason(text,'international_transfers',{mode}),null);
 }
});
test('source declaration remains literal, bounded and cannot bridge paragraphs',()=>{
 assert.equal(findGermanTransferDisclosure(nonuse.replace('soweit','soweit '+ 'zusätzlich '.repeat(80))),undefined);
 assert.equal(findGermanTransferDisclosure(nonuse.replace(' Eine Datenübermittlung',' Ein anderer Verantwortlicher erklärt: Eine Datenübermittlung')),undefined);
 assert.equal(findGermanTransferDisclosure('Datenschutz. Datenübermittlung in Drittstaaten '+nonuse),nonuse);
});
