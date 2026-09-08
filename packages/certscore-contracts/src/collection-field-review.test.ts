import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyCollectionFieldReview as classify} from './collection-field-review.js';
test('canonical field review covers sensitive, personal, unstructured and operational categories',()=>{
 for(const [label,category] of [['Medical symptoms','special_category'],['Religious affiliation','special_category'],['Criminal convictions','criminal_offence'],['Passport number','government_identifier'],['Routing number','financial_payment'],['Security question','credentials'],['Email','personal_contact'],['Date of birth','identity_profile'],['Postal code','location'],['Marketing email','marketing_contact'],['Company name','operational'],['Quantity','operational']] as const)assert.equal(classify({label,inputType:'text'}).category,category,label);
 assert.equal(classify({inputType:'file'}).category,'file_upload');assert.equal(classify({inputType:'textarea'}).category,'free_text');
});
test('only captured selected positive marketing controls get an opt-in review marker',()=>{
 const field={inputType:'checkbox',controlKind:'checkbox',label:'Send me newsletters'};
 assert.equal(classify({...field,checkedState:'checked'}).preselectedMarketing,true);
 for(const checkedState of [undefined,'unknown','mixed','unchecked'])assert.equal(classify({...field,checkedState}).preselectedMarketing,false);
 assert.equal(classify({...field,checkedState:'checked',label:'Do not send me newsletters'}).preselectedMarketing,false);
 assert.equal(classify({...field,checkedState:'checked',label:'Accept terms'}).preselectedMarketing,false);
});
