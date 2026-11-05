import assert from 'node:assert/strict';import test from 'node:test';
import {article13DisclosureRejectReason,hasSubstantiveLegalBasisEvidence,article13CrossTopicRejectReason} from './article13-disclosure-rejection';
import {classifyGdprTransparencyTopics,hasUnsupportedGermanBasisEvidence,findGermanOwnBasisStatement} from './gdpr-transparency-topic-classifier';
const withdrawal='Sie haben das Recht, eine zuvor erteilte Einwilligung zur Verarbeitung Ihrer personenbezogenen Daten zu widerrufen.';
const erasure='Dies ist insbesondere der Fall, wenn Ihre personenbezogenen Daten für die Zwecke, für die sie erhoben wurden, nicht länger benötigt werden; die Rechtsgrundlage für die Verarbeitung ausschließlich Ihre Einwilligung war und Sie diese widerrufen haben; Sie einer Verarbeitung auf Grundlage berechtigter Interessen (Art. 6 Abs. 1 Buchst.';
const own='In diesen Fällen erfolgt die Verarbeitung Ihrer Daten auf der Rechtsgrundlage des Art. 6 Abs. 1 Buchst. a DSGVO.';
for(const [name,text] of [['withdrawal',withdrawal],['erasure criteria with clipped citation',erasure]] as const)test(`German ${name} is useful rights evidence but not processing-basis evidence`,()=>{
 assert.equal(hasUnsupportedGermanBasisEvidence(text),true);assert.equal(hasSubstantiveLegalBasisEvidence(text),false);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'legal_basis',{mode}),'insufficient_row_specific_terms');
 assert.ok(!classifyGdprTransparencyTopics({section:{heading:'Ihre Rechte',body:text}}).matches.some(m=>m.topic==='legal_basis'));
});
test('separate own processing basis remains eligible alongside withdrawal rights',()=>{
 for(const text of [own,own+' '+withdrawal,withdrawal+' '+own,'Wenn ein Vertrag zwischen Ihnen und uns zustande kommt, verarbeiten wir Ihre Daten zur Erfüllung dieses Vertrages auf Grundlage des Art. 6 Abs. 1 Buchst. b DSGVO.']){
  assert.equal(hasUnsupportedGermanBasisEvidence(text),false);
  for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'legal_basis',{mode}),null,text+':'+mode);
 }
});
test('unrelated topic and English processing-basis behavior stay unchanged',()=>{
 assert.equal(findGermanOwnBasisStatement(own.replace('Art. ', 'Art.'+' '.repeat(700))),undefined);
 assert.equal(article13CrossTopicRejectReason(withdrawal,'data_subject_rights'),null);
 assert.equal(article13DisclosureRejectReason('We process personal data with your consent.','legal_basis'),null);
 for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason('Art. 6 Abs. 1 Buchst. a DSGVO.','legal_basis',{mode}),'insufficient_row_specific_terms');
});

test('generic processing prose cannot lend a basis to a separate clipped German citation',()=>{
 for(const text of ['We process personal information to provide our service. Art. 6 Abs. 1 Buchst.','We process personal information to provide our service. Art. 6 Abs. 1 Buchst. a DSGVO.'])for(const mode of ['scan_core','retained_report','multilingual_classifier'] as const)assert.equal(article13DisclosureRejectReason(text,'legal_basis',{mode}),'insufficient_row_specific_terms');
});
