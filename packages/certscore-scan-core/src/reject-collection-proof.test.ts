import assert from 'node:assert/strict';
import test from 'node:test';
import {readPostRefusalRequestBody,classifyPostRefusalRequestPurpose} from './post-refusal-observer';
import {captureCaliforniaRejectRequest,californiaProofRecipient} from './california-reject-request';

test('opaque body reads retain URL collection metadata without inventing body absence or identifiers',()=>{
 for(const method of ['GET','POST']){
  const request={method:()=>method,postData:():string|null=>{throw Error('opaque request');}};
  const read=readPostRefusalRequestBody(request);assert.equal(read.body,undefined);assert.equal(read.hasBody,method==='POST');
  const proof=captureCaliforniaRejectRequest({url:'https://www.google-analytics.com/g/collect?v=2&cid=fixture-client',method,
   requestId:'opaque',startedAtMs:200,httpStatus:204,...read,headers:{}})!;
  assert.equal(proof.httpStatus,204);assert.equal(proof.entity.entityId,'ent_7509263a9ab6');
  assert.equal(proof.proof?.bodyStatus,method==='POST'?'unavailable':'absent');
  assert.doesNotMatch(JSON.stringify(proof),/fixture-client/);
 }
});
test('reviewed Reddit, load-balanced Clarity and StackAdapt collectors reach typed proof without widening purpose eligibility',()=>{
 for(const [url,entity] of [['https://alb.reddit.com/rp','ent_8dc0787fe589'],['https://g.clarity.ms/collect','ent_02b1b951db45'],
  ['https://tags.srv.stackadapt.com/js_tracking?uid=fixture-publisher','ent_c77df19fd748']] as const){
  assert.equal(californiaProofRecipient(url)?.entityId,entity,url);
  assert.equal(classifyPostRefusalRequestPurpose(url).nonEssential,true);
  const proof=captureCaliforniaRejectRequest({url,method:'POST',requestId:'fixture',startedAtMs:200,httpStatus:204,
   hasBody:true,body:'opaque',headers:{'content-type':'text/plain'}})!;
  assert.equal(proof.entity.entityId,entity);assert.equal(proof.qualification.activity,'unresolved');
  assert.equal(proof.proof?.bodyStatus,'unsupported');
 }
 for(const url of ['https://alb.reddit.com/rp/config','https://alb.reddit.com.evil.test/rp','https://g.clarity.ms/collect/config',
  'https://g.clarity.ms.evil.test/collect','https://tags.srv.stackadapt.com.evil.test/js_tracking',
  'https://www.clarity.ms/tag/fixture','https://www.redditstatic.com/ads/pixel.js'])assert.equal(californiaProofRecipient(url),null,url);
});
