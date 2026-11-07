import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalConsentFixture} from './test-fixtures/conditional-opt-out';
import {conditionalOptOutCandidate} from './conditional-opt-out';
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
 assert.equal(conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:'https://gimbal.com/',sourceSha256:'a'.repeat(64)}).reason,'held_target');
 assert.equal(conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:'https://www.example.com/',sourceSha256:'a'.repeat(64)}).reason,'target_changed');
});

test('v3 separates redirected source presence from unchanged execution eligibility',()=>{
 const bundle=conditionalConsentFixture();const observation=bundle.consentUiObservations[0]!;
 observation.documentUrl='https://redirect.example/landing';
 const control=observation.controls[0]!;control.selectorHint='#truste-show-consent';control.semanticallyInteractive=true;
 delete control.consentContextEvidence;delete control.visibilityEvidence;
 const run=()=>conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),boundControls:true});
 assert.deepEqual(run(),{version:'conditional_opt_out_dispatch.v3',scanId:bundle.scanId,status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:'a'.repeat(64),controlObserved:true,observationId:observation.observationId,supportedRoute:false});
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
 assert.equal(run({targetUrl:'https://gimbal.com/'}).reason,'held_target');
});
