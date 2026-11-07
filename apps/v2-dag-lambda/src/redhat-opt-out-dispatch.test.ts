import test from 'node:test';import assert from 'node:assert/strict';
import {conditionalConsentFixture} from './test-fixtures/conditional-opt-out';
import {redHatConditionalDispatch} from './redhat-opt-out-dispatch';
import {REDHAT_OPT_OUT_TARGET,REDHAT_OPT_OUT_DOCUMENT} from '@certscore/contracts';
test('Red Hat conditional dispatch is off by default and requires one verified source control',()=>{
 const bundle=conditionalConsentFixture();bundle.url=REDHAT_OPT_OUT_TARGET;bundle.normalizedUrl=REDHAT_OPT_OUT_TARGET;
 bundle.consentUiObservations[0]!.documentUrl=REDHAT_OPT_OUT_DOCUMENT;
 const input={bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),enabled:true};
 assert(redHatConditionalDispatch(input));assert.equal(redHatConditionalDispatch({...input,enabled:false}),null);
 for(const patch of [{scanId:'different'},{targetUrl:'https://www.redhat.com/en'},{sourceSha256:'invalid'}])assert.equal(redHatConditionalDispatch({...input,...patch}),null);
 const duplicate=structuredClone(bundle);duplicate.consentUiObservations[0]!.controls.push({...duplicate.consentUiObservations[0]!.controls[0]!});assert.equal(redHatConditionalDispatch({...input,bundle:duplicate}),null);
 for(const patch of [{label:'Reject all'},{tagName:'a'},{visibilityEvidence:'unverified'},{visible:false}]){const changed=structuredClone(bundle);Object.assign(changed.consentUiObservations[0]!.controls[0]!,patch);assert.equal(redHatConditionalDispatch({...input,bundle:changed}),null);}
});
