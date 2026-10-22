import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCanonicalCookieClassification,resolveCanonicalCookieKnowledge,resolveCanonicalVendor} from './index';
import {californiaProofRecipient,captureCaliforniaRejectRequest} from '../../certscore-scan-core/src/california-reject-request';

test('verified legacy Hotjar session identities are exact, non-essential and share one canonical owner',()=>{
 const ids=new Set<string>();
 for(const name of ['_hjSessionUser_1473729','_hjSession_1473729','_hjSession_1']){
  const c=resolveCanonicalCookieClassification(name,{cookieDomain:'.example.test'});
  assert.equal(c.category,'session_replay');assert.equal(c.essentiality,'non_essential');
  assert.equal(c.provider?.entity,'Hotjar Ltd');ids.add(c.provider!.registryAttribution.entityId);
  assert.equal(resolveCanonicalCookieKnowledge(name,{purposePolicyVersion:'certscore.cookie-purpose.v5'}).essentiality,'unknown');
 }
 assert.equal(ids.size,1);
 for(const name of ['_hjSession_','_hjSessionUser_xxxxxx','_hjSession_*','_hjSessionUser_1_extra','_hjSession_1x','_hjSessionStorageTest','_hjCookieTest','_hjClosedSurveyInvites','_hjDonePolls','_hjMinimizedPolls','_hjUnknown'])
  assert.equal(resolveCanonicalCookieClassification(name).essentiality,'unknown',name);
});

test('vendor-code verified Hotjar collector has endpoint attribution without inventing advertising purpose',()=>{
 const url='https://events.hotjar.io/';
 assert.equal(resolveCanonicalVendor({type:'request',url}).observation?.registryAttribution?.matchKind,'endpoint');
 assert.equal(californiaProofRecipient(url)?.entityId,'ent_1426519b043f');
 // The actual SDK sends two JSON lines. Discovery retains an explicit unknown
 // payload; it does not parse arbitrary event arrays or assert sale/sharing.
 const proof=captureCaliforniaRejectRequest({url,method:'POST',requestId:'fixture',startedAtMs:200,httpStatus:204,hasBody:true,
  body:'{"uuid":"private-fixture"}\n{"events":[]}',headers:{'content-type':'text/plain'}})!;
 assert.equal(proof.proof?.bodyStatus,'unsupported');assert.equal(proof.qualification.activity,'unresolved');
 assert.doesNotMatch(JSON.stringify(proof),/private-fixture/);
 for(const candidate of ['https://events.hotjar.io.evil.test/','https://events.hotjar.io/other','https://static.hotjar.com/c/hotjar-1.js'])
  assert.equal(californiaProofRecipient(candidate),null,candidate);
});
