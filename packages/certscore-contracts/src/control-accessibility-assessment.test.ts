import test from 'node:test';
import assert from 'node:assert/strict';
import {controlAccessibilityAssessmentSchema,controlAccessibilityReceipt,CONTROL_ACCESSIBILITY_RULES,CONTROL_ACCESSIBILITY_REASONS} from './control-accessibility-assessment';
const valid={version:'same_document_controls.v1',scope:'visible_main_document_and_open_shadow_controls',status:'completed',reasons:[],
 controls:[{id:1,intent:'reject',binding:'stable',required:['button-name','nested-interactive'],checks:[['button-name','pass'],['nested-interactive','pass']],complete:true}]};
test('completed control receipts require actual conclusive outcomes and stable binding',()=>{
 assert.ok(controlAccessibilityAssessmentSchema.safeParse(valid).success);
 for(const patch of [{checks:[]},{binding:'changed'},{checks:[['button-name','review']]},{checks:[['button-name','pass']]}])
  assert.equal(controlAccessibilityAssessmentSchema.safeParse({...valid,controls:[{...valid.controls[0],...patch}]}).success,false);
 assert.equal(controlAccessibilityAssessmentSchema.safeParse({...valid,reasons:['control_results_missing']}).success,false);
});
test('bounded control assessments and compact receipts fit retained transport bounds',()=>{
 const maximal=controlAccessibilityAssessmentSchema.parse({...valid,status:'partial',reasons:[...CONTROL_ACCESSIBILITY_REASONS],
  controls:Array.from({length:8},(_,i)=>({id:i+1,intent:'privacy_opt_out',binding:'stable',complete:false,required:[...CONTROL_ACCESSIBILITY_RULES],checks:CONTROL_ACCESSIBILITY_RULES.map(r=>[r,'review'])}))});
 assert.ok(Buffer.byteLength(JSON.stringify(maximal))<8192);
 assert.ok(Buffer.byteLength(JSON.stringify(controlAccessibilityReceipt(maximal)))<128);
});
