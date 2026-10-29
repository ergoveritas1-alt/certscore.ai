import assert from 'node:assert/strict';
import test from 'node:test';
import {captureCaliforniaRejectRequest} from '../../packages/certscore-scan-core/src/california-reject-request';
import {actionConfirmationReview,unsupportedProtocolReview,rankProtocolReviews} from './audit-retained-priorities';
test('late terminal decision does not promote initial registration or missing diagnostics',()=>{
 const row=actionConfirmationReview({acceptanceRegistration:{status:'unconfirmed'},terminalDecisionEvidence:{},interactionDiagnostics:{click:{outcome:'completed'}}},'accept');
 assert.equal(row.registration,'unconfirmed');assert.equal(row.terminalDecisionRetained,true);assert.deepEqual(row.reasons,['diagnostics_not_retained']);assert.equal(row.diagnosticOnly,true);
});
test('unsupported body hashes, field names and shape do not become new findings',()=>{
 const bundle=protocolFixture();
 const rows=unsupportedProtocolReview(bundle);assert.deepEqual(rows[0]?.bodyFieldNames,['event','context']);assert.equal(rows[0]?.newFinding,false);assert.equal(rows[0]?.rawBodyRetained,false);assert.doesNotMatch(JSON.stringify(rows),/private/);
 bundle.gpcObservationSession.requestProofCapture.rows[0]!.documentToken='other';assert.deepEqual(unsupportedProtocolReview(bundle)[0]?.bodyFieldNames,[]);
 const grouped=rankProtocolReviews(rows.map(r=>({...r,scanId:'scan'})));assert.equal(grouped[0]?.requests,1);assert.equal(grouped[0]?.newFindings,0);
});

test('phase reasons stay unavailable for legacy packets and separate for v2',()=>{
 const common={diagnosticOnly:true,initialPasses:4,terminalPasses:1,terminalRead:'verified',reasons:['no_fresh_decision','verified_decision']};
 const legacy=actionConfirmationReview({refusalRegistration:{status:'unconfirmed'},confirmationDiagnostics:{...common,policyVersion:'consent_confirmation_diagnostics.v1'}},'reject');
 assert.equal(legacy.initialReasons,null);assert.equal(legacy.terminalReasons,null);assert.equal(legacy.registration,'unconfirmed');
 const current=actionConfirmationReview({refusalRegistration:{status:'unconfirmed'},confirmationDiagnostics:{...common,policyVersion:'consent_confirmation_diagnostics.v2',initialReasons:['no_fresh_decision'],terminalReasons:['verified_decision'],reasonsTruncated:false}},'reject');
 assert.deepEqual(current.initialReasons,['no_fresh_decision']);assert.deepEqual(current.terminalReasons,['verified_decision']);assert.equal(current.registration,'unconfirmed');
});

function protocolFixture(url="https://analytics.tiktok.com/api/v2/pixel"){
 const fact=captureCaliforniaRejectRequest({url,method:"POST",requestId:"request",startedAtMs:100,httpStatus:204,hasBody:true,body:'{"unreviewed":"private"}',headers:{}})!;
 return {gpcObservationSession:{mainDocument:{documentToken:"doc"},requestProofCapture:{rows:[{eventId:"event",documentToken:"doc",proof:{...fact,contractVersion:"gpc_request_proof.v1"}}]}},networkEvents:[{eventId:"event",requestId:"request",method:"POST",timestampMs:100,requestUrl:url,requestPayloadSignals:{bodyFieldNames:["event","context"],body:"private"}}]};
}
test("protocol triage requires a unique exact event, method, time, URL hash and document join",()=>{
 const base=protocolFixture();assert.equal(unsupportedProtocolReview(base)[0]!.queue,"unresolved_protocol");
 const changes=[(b:any)=>b.networkEvents[0].method="GET",(b:any)=>b.networkEvents[0].timestampMs++,
  (b:any)=>b.networkEvents[0].requestUrl+="?changed=1",(b:any)=>b.gpcObservationSession.requestProofCapture.rows[0].documentToken="other",
  (b:any)=>b.networkEvents.push(structuredClone(b.networkEvents[0])),(b:any)=>b.gpcObservationSession.requestProofCapture.rows[0].proof.urlSha256="bad"];
 for(const change of changes){const b=structuredClone(base);change(b);const row=unsupportedProtocolReview(b)[0]!;assert.equal(row.queue,"source_binding_review");assert.deepEqual(row.bodyFieldNames,[]);}
});
test("URL-qualified, unresolved and missing-event requests cannot merge into one ranked bucket",()=>{
 const tiktok=unsupportedProtocolReview(protocolFixture())[0]!;
 const lotame=unsupportedProtocolReview(protocolFixture("https://bcp.crwdcntrl.net/6/map?xcid=publisher"))[0]!;
 assert.equal(lotame.queue,"already_qualified");assert.equal(lotame.disposition,"preserve_existing_url_qualification");
 const missing=protocolFixture();missing.networkEvents=[];const unjoined=unsupportedProtocolReview(missing)[0]!;
 const ranks=rankProtocolReviews([unjoined,lotame,tiktok].map(r=>({...r,scanId:"scan"})));
 assert.deepEqual(ranks.map(r=>r.queue),["unresolved_protocol","already_qualified","source_binding_review"]);
 assert.equal(ranks.length,3);
 const b=protocolFixture();b.networkEvents[0]!.requestPayloadSignals.bodyFieldNames=["event","event","x".repeat(400),"private=value"];
 assert.deepEqual(unsupportedProtocolReview(b)[0]!.bodyFieldNames,["event"]);
});

// Both versioned phase contracts preserve the same initial/terminal separation.
test('v3 precise diagnostic reasons remain phase-separated without promoting registration',()=>{
 const result=actionConfirmationReview({acceptanceRegistration:{status:'unconfirmed'},confirmationDiagnostics:{policyVersion:'consent_confirmation_diagnostics.v3',diagnosticOnly:true,initialPasses:1,terminalPasses:1,terminalRead:'verified',reasons:['sdk_not_observed','verified_decision'],initialReasons:['sdk_not_observed'],terminalReasons:['verified_decision'],reasonsTruncated:false}},'accept');
 assert.deepEqual(result.initialReasons,['sdk_not_observed']);assert.deepEqual(result.terminalReasons,['verified_decision']);assert.equal(result.registration,'unconfirmed');assert.equal(result.diagnosticVersion,'consent_confirmation_diagnostics.v3');
});
