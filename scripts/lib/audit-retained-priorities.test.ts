import assert from 'node:assert/strict';
import test from 'node:test';
import {actionConfirmationReview,unsupportedProtocolReview,rankProtocolReviews} from './audit-retained-priorities';
test('late terminal decision does not promote initial registration or missing diagnostics',()=>{
 const row=actionConfirmationReview({acceptanceRegistration:{status:'unconfirmed'},terminalDecisionEvidence:{},interactionDiagnostics:{click:{outcome:'completed'}}},'accept');
 assert.equal(row.registration,'unconfirmed');assert.equal(row.terminalDecisionRetained,true);assert.deepEqual(row.reasons,['diagnostics_not_retained']);assert.equal(row.diagnosticOnly,true);
});
test('unsupported body hashes, field names and shape do not become new findings',()=>{
 const bundle={gpcObservationSession:{mainDocument:{documentToken:'doc'},requestProofCapture:{rows:[{eventId:'event',documentToken:'doc',proof:{requestId:'request',origin:'https://analytics.tiktok.com',path:'/api/v2/pixel',method:'POST',proof:{bodyStatus:'unsupported',policyVersion:'retained-v1',reasons:['unsupported_fields'],bodySha256:'a'.repeat(64)}}}]}},networkEvents:[{eventId:'event',requestId:'request',requestPayloadSignals:{bodyFieldNames:['event','context'],body:'private'}}]};
 const rows=unsupportedProtocolReview(bundle);assert.deepEqual(rows[0]?.bodyFieldNames,['event','context']);assert.equal(rows[0]?.newFinding,false);assert.equal(rows[0]?.rawBodyRetained,false);assert.doesNotMatch(JSON.stringify(rows),/private/);
 bundle.gpcObservationSession.requestProofCapture.rows[0]!.documentToken='other';assert.deepEqual(unsupportedProtocolReview(bundle)[0]?.bodyFieldNames,[]);
 const grouped=rankProtocolReviews(rows.map(r=>({...r,scanId:'scan'})));assert.equal(grouped[0]?.requests,1);assert.equal(grouped[0]?.newFindings,0);
});
