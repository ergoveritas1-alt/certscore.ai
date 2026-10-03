import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCollectionSurfaceInventory, classifyCollectionSurfaceSemanticCategory as classify, type CollectionSurfaceCaptureRow } from './collection-surface-inventory';
import { classifyCollectionFieldReview as review } from '@certscore/contracts';

const cases = [
 ['en','First name','Last name','Phone','Postal code','Email','Send me newsletters','Do not send me newsletters'],
 ['de','Vorname','Nachname','Telefonnummer','PLZ','E-Mail','Ich möchte den Newsletter erhalten','Ich möchte keinen Newsletter erhalten'],
 ['fr','Prénom','Nom de famille','Téléphone','Code postal','Courriel','Je souhaite recevoir la newsletter','Je ne souhaite pas recevoir la newsletter'],
 ['es','Nombre','Apellidos','Teléfono','Código postal','Correo electrónico','Quiero recibir el boletín','No deseo recibir el newsletter'],
 ['it','Nome','Cognome','Telefono','Codice postale','Posta elettronica','Desidero ricevere la newsletter','Non desidero ricevere la newsletter'],
 ['pt','Nome','Sobrenome','Telefone','Código postal','Correio eletrónico','Quero receber a newsletter','Não quero receber a newsletter'],
 ['nl','Voornaam','Achternaam','Telefoonnummer','Postcode','E-mailadres','Ik wil de nieuwsbrief ontvangen','Ik wil geen nieuwsbrief ontvangen'],
];
const expected = ['name','name','phone','address','email'];
function field(label: string, rest: Partial<CollectionSurfaceCaptureRow> = {}): CollectionSurfaceCaptureRow {
 return {label, inputType:'text', elementType:'input', groupKey:'form', structure:'native_form', required:false, disabled:false, readOnly:false, domOrder:0, ...rest};
}
for (const [locale,...labels] of cases) test(`${locale}: labels and choice meaning survive bounded inventory projection`, () => {
 for (const [i,label] of labels.slice(0,5).entries()) {
   assert.equal(classify(field(` ${label}* `)),expected[i],label);
 }
 const rows = Array.from({length:20},(_,i) => field(labels[i%5]!,{domOrder:i}));
 rows.push(field(labels[5]!,{domOrder:20,inputType:'checkbox',controlKind:'checkbox',checkedState:'checked'}));
 rows.push(field(labels[6]!,{domOrder:21,inputType:'checkbox',controlKind:'checkbox',checkedState:'checked'}));
 const inventory=buildCollectionSurfaceInventory({pageUrl:'https://example.test/',rows,inspectedFieldCandidateCount:22,candidateScanTruncated:false},Date.now());
 const form=inventory.forms[0]!;
 assert.equal(form.fields.length,20);
 assert.equal(form.fieldsTruncated,true);
 assert.equal(form.fields.find(f=>f.label===labels[5])?.review?.preselectedMarketing,true);
 assert.equal(form.fields.find(f=>f.label===labels[6])?.review?.preselectedMarketing,false);
 assert.equal(form.fields.find(f=>f.label===labels[4])?.review?.category,'personal_contact');
});

test('autocomplete tokens do not acquire meaning through substrings or scope prefixes',()=>{
 for(const [token,category] of [['username','unknown'],['organization','unknown'],['shipping','unknown'],['billing','unknown'],['work','unknown'],['tel-national','phone'],['section-checkout shipping work tel-country-code','phone'],['cc-name','payment_card'],['section-a billing postal-code','address'],['invalid given-name','unknown'],['x-given-name','unknown']] as const) {
   assert.equal(classify(field('',{autocompleteToken:token})),category,token);
 }
 assert.equal(classify(field('Téléphone',{autocompleteToken:'given-name'})),'unknown');
 assert.equal(review({inputType:'text',label:'Téléphone',semanticCategory:'unknown'}).category,'unknown');
 for(const label of ['Company name','File name','Firmenname','Nom de fichier','Nombre de empresa','Nome del file','Nome da empresa','Bedrijfsnaam','Transport','Fecha de llegada','Nom de votre animal']) assert.equal(classify(field(label)),'unknown',label);
});

test('choice shape and explicit meaning prevent sensitive or ambiguous opt-in metadata',()=>{
 for(const label of ['Health newsletter','Newsletter','Recevoir ou refuser la newsletter','Не получать newsletter','Newsletter abbestellen','Marketing preferences']) {
  const f=field(label,{inputType:'checkbox',controlKind:'checkbox',checkedState:'checked'});
  assert.equal(classify(f),'boolean_choice');
  const result=review({...f,semanticCategory:classify(f)});
  assert.equal(result.category,'unknown');
  assert.equal(result.preselectedMarketing,false,label);
 }
 for(const state of ['unchecked','mixed','unknown']) assert.equal(review({inputType:'checkbox',controlKind:'checkbox',checkedState:state,label:'Quiero recibir el boletín',semanticCategory:'boolean_choice'}).preselectedMarketing,false);
});

 test('localized changes preserve existing review-only sensitive and operational metadata', () => {
  for (const [label, expected] of [['Religious affiliation','special_category'],['Criminal convictions','criminal_offence'],['Quantity','operational'],['Security question','credentials']] as const) {
    const f=field(label);
    assert.equal(review({...f,semanticCategory:classify(f)}).category,expected,label);
  }
 });
