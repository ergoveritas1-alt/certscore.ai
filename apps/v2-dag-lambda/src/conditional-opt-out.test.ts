import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalConsentFixture} from './test-fixtures/conditional-opt-out';
import {conditionalOptOutCandidate} from './conditional-opt-out';
import {conditionalOptOutDecisionSchema,OPT_OUT_REJECTION_REASONS} from '@certscore/contracts';

test('rejection diagnostics name existing gates without changing a successful route',()=>{
 const original=conditionalConsentFixture();
 const run=(bundle=original,boundControls=false)=>conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),boundControls});
 assert.equal(run().rejection,undefined);
 const cases:Array<[Record<string,unknown>,string]>=[
  [{visible:false},'control_not_visible'],[{visibilityEvidence:'unverified'},'control_visibility_unverified'],
  [{layer:'unknown'},'control_not_first_layer'],[{consentContextEvidence:'unverified'},'local_consent_context_missing'],
  [{tagName:'span'},'element_type_not_supported'],[{tagName:'a'},'link_route_not_eligible'],
  [{label:'Cookie Settings'},'label_not_direct_opt_out'],[{selectorHint:'#other'},'selector_not_supported_by_matching_recipe'],
 ];
 for(const [patch,reason] of cases){
  const bundle=structuredClone(original);Object.assign(bundle.consentUiObservations[0]!.controls[0]!,patch);
  const decision=run(bundle);assert.equal(decision.status,'skipped');
  assert.ok(conditionalOptOutDecisionSchema.safeParse(decision).success,JSON.stringify(decision));
  assert.equal(decision.rejection![5][OPT_OUT_REJECTION_REASONS.indexOf(reason as any)],1);
  assert.deepEqual(decision.rejection![6][0]!.slice(0,2),[0,0]);
  if(reason==='selector_not_supported_by_matching_recipe')assert.equal(decision.rejection![6][0]![3],3);
 }
 const noCandidate=structuredClone(original);noCandidate.consentUiObservations[0]!.controls=[];
 assert.equal(run(noCandidate).rejection![5][0],1);
 const nativeMissing=structuredClone(original);nativeMissing.consentUiObservations[0]!.controls[0]!.selectorHint='#other';
 assert.equal(run(nativeMissing,true).rejection![6][0]![3],2);
});

test('diagnostics share existing 32 observation and 128 control bounds with eight samples',()=>{
 const bundle=conditionalConsentFixture();
 const o=bundle.consentUiObservations[0]!;o.controls[0]!.selectorHint='#unsupported';
 o.controls=Array.from({length:129},()=>structuredClone(o.controls[0]!));
 bundle.consentUiObservations=Array.from({length:33},()=>structuredClone(o));
 const d=conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),boundControls:true});
 assert.ok(conditionalOptOutDecisionSchema.safeParse(d).success);
 assert.deepEqual(d.rejection!.slice(0,5),[1,1,32,4096,7]);
 assert.equal(d.rejection![5][12],4096);assert.equal(d.rejection![6].length,8);
 assert.ok(Buffer.byteLength(JSON.stringify(d.rejection))<=512);
 assert.ok(Buffer.byteLength(JSON.stringify(d))<=2048);
});
test('conditional opt-out requires a joined supported label, locator and document',()=>{
 const bundle=conditionalConsentFixture();const run=(b=bundle)=>conditionalOptOutCandidate({bundle:b,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64)});
 assert.equal(run().reason,'supported_control');
 const dom=structuredClone(bundle);delete dom.consentUiObservations[0]!.controls[0]!.visibilityEvidence;delete dom.consentUiObservations[0]!.controls[0]!.layer;dom.consentUiObservations[0]!.controls[0]!.selectorHint='#ot-sdk-btn';assert.equal(run(dom).reason,'supported_control');
 for(const patch of [{visible:false},{tagName:'a'},{selectorHint:'#other-id'},{selectorHint:'button.not-ot-sdk-show-settings'},{label:'Cookie Settings'},{visibilityEvidence:'unverified'},{consentContextEvidence:'unverified'}]){
  const b=structuredClone(bundle);Object.assign(b.consentUiObservations[0]!.controls[0]!,patch);assert.equal(run(b).status,'skipped');
 }
 const moved=structuredClone(bundle);moved.consentUiObservations[0]!.documentUrl='https://other.example/';assert.equal(run(moved).status,'skipped');
 const missing=structuredClone(bundle);delete missing.consentUiObservations[0]!.documentIdentity;assert.equal(run(missing).status,'skipped');
 const ambiguous=structuredClone(bundle);ambiguous.consentUiObservations[0]!.controls.push({...ambiguous.consentUiObservations[0]!.controls[0]!,selectorHint:'button#second.ot-sdk-show-settings'});assert.equal(run(ambiguous).reason,'ambiguous_control');
 assert.equal(conditionalOptOutCandidate({bundle,scanId:'other',targetUrl:bundle.url,sourceSha256:'a'.repeat(64)}).reason,'source_unverified');
 assert.equal(conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:'https://gimbal.com/',sourceSha256:'a'.repeat(64)}).reason,'target_changed');
 assert.equal(conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:'https://www.example.com/',sourceSha256:'a'.repeat(64)}).reason,'target_changed');
});

test('v3 separates redirected source presence from unchanged execution eligibility',()=>{
 const bundle=conditionalConsentFixture();const observation=bundle.consentUiObservations[0]!;
 observation.documentUrl='https://redirect.example/landing';
 const control=observation.controls[0]!;control.selectorHint='#truste-show-consent';control.semanticallyInteractive=true;
 delete control.consentContextEvidence;delete control.visibilityEvidence;
 const run=()=>conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),boundControls:true});
 const {rejection,...decision}=run();assert.ok(rejection);assert.deepEqual(decision,{version:'conditional_opt_out_dispatch.v3',scanId:bundle.scanId,status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),controlObserved:true,observationId:observation.observationId,supportedRoute:false});
 for(const patch of [{visible:false},{visibilityEvidence:'unverified'},{consentContextEvidence:'unverified'},{semanticallyInteractive:false},{actionType:'manage_preferences'},{label:'Cookie Settings'},{layer:'unknown'}]){
  const saved={...control};Object.assign(control,patch);assert.equal(run().controlObserved,false,JSON.stringify(patch));Object.keys(control).forEach(k=>delete (control as any)[k]);Object.assign(control,saved);
 }
 delete observation.documentIdentity;assert.equal(run().controlObserved,false);
});

test('v3 presence rejects conflicting native document bindings and unbound source facts',()=>{
 const bundle=conditionalConsentFixture(),o=bundle.consentUiObservations[0]!,c=o.controls[0]!;
 o.documentUrl='https://redirect.example/';
 c.domBinding={version:'ax_backend_dom_binding.v1',axNodeId:'29',backendNodeId:29,nodeType:1,tagName:'button',documentUrl:o.documentUrl,documentIdentity:{source:'cdp_loader_id',token:'different-loader'}};
 const run=(extra={})=>conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),boundControls:true,...extra});
 assert.equal(run().controlObserved,false);c.domBinding.documentIdentity=o.documentIdentity!;assert.equal(run().controlObserved,true);
 c.domBinding.documentUrl='https://other.example/';assert.equal(run().controlObserved,false);
 assert.equal(run({sourceSha256:'bad'}).controlObserved,undefined);assert.equal(run({scanId:'other'}).controlObserved,undefined);
 assert.equal(run({targetUrl:'https://gimbal.com/'}).reason,'target_changed');
});
