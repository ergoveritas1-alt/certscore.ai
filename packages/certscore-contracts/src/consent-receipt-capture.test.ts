import test from 'node:test';
import assert from 'node:assert/strict';
import {consentReceiptCaptureSchema} from './consent-receipt-capture.js';
const sample=()=>({policyVersion:'consent_receipt_capture.v1' as const,diagnosticOnly:true as const,scanId:'owned',action:'reject' as const,
 authorizedTargetSha256:'a'.repeat(64),clockOriginAtEpochMs:100,actionDispatchedAtEpochMs:200,frozenAtEpochMs:400,
 documentStable:true,cancelled:false,observationsTruncated:false,processingLimited:false,observations:[{phase:'initial' as const,source:'cookie' as const,
 keySha256:'b'.repeat(64),valueSha256:'c'.repeat(64),readAtEpochMs:300,available:true,cookieMultiplicity:'unique' as const,identitySha256:'e'.repeat(64),format:'json' as const,
 facts:[{pathSha256:'d'.repeat(64),value:false}],factsLimited:false,omittedFields:1,writeObservedAtEpochMs:250.125}]});
test('receipt observations retain fractional native clocks and explicit incompleteness',()=>{
 assert.equal(consentReceiptCaptureSchema.safeParse(sample()).success,true);
 assert.equal(consentReceiptCaptureSchema.safeParse({...sample(),observationsTruncated:true,processingLimited:true}).success,true);
});
test('receipt observations reject raw values, late events, invalid phases and invalidated sessions',()=>{
 for(const patch of [{value:'visitor-secret'},{eventObservedAtEpochMs:301},{readAtEpochMs:199},{facts:[{pathSha256:'d'.repeat(64),value:'someone@example.com'}]}]){
  const s=sample();Object.assign(s.observations[0]!,patch);assert.equal(consentReceiptCaptureSchema.safeParse(s).success,false);
 }
 for(const patch of [{cancelled:true},{documentStable:false}])assert.equal(consentReceiptCaptureSchema.safeParse({...sample(),...patch}).success,false);
});
test('receipt evidence is bounded and observations never carry a verified consent assertion',()=>{
 const s=sample();assert.equal(consentReceiptCaptureSchema.safeParse({...s,observations:Array(9).fill(s.observations[0])}).success,false);
 assert.equal(consentReceiptCaptureSchema.safeParse({...s,diagnosticOnly:false}).success,false);
 assert.equal(consentReceiptCaptureSchema.safeParse({...s,consentConfirmed:true}).success,false);
});
