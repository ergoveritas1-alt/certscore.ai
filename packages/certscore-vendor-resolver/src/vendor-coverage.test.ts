import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCanonicalCookieClassification,resolveCanonicalCookieKnowledge,classifyCanonicalCollectionEndpoint} from './index';
import {captureCaliforniaRejectRequest} from '../../certscore-scan-core/src/california-reject-request';
test('documented cookie identities retain exact provider and purpose while v5 remains historical',()=>{
 for(const [name,category,entity]of [['_clck','session_replay','Microsoft Corporation'],['_ttp','advertising','TikTok Technology Limited'],['hubspotutk','analytics','HubSpot, Inc.'],['_mkto_trk','analytics','Adobe Inc.'],['fs_uid','session_replay','FullStory, Inc.'],['_pin_unauth','advertising','Pinterest, Inc.'],['__kla_id','analytics','Klaviyo, Inc.']]as const){
  const c=resolveCanonicalCookieClassification(name,{cookieDomain:'.example.test'});assert.equal(c.version,'certscore.cookie-purpose.v6');assert.equal(c.category,category);assert.equal(c.essentiality,'non_essential');assert.equal(c.provider?.entity,entity);
 }
 assert.equal(resolveCanonicalCookieKnowledge('_clck',{purposePolicyVersion:'certscore.cookie-purpose.v5'}).essentiality,'unknown');
 for(const name of ['__hs_opt_out','__hs_cookie_cat_pref','fs_cid'])assert.equal(resolveCanonicalCookieClassification(name).essentiality,'essential');
 for(const name of ['_clck_extra','_ttp_custom','fs_uid_other','unknown_cookie','bcookie'])assert.equal(resolveCanonicalCookieClassification(name).essentiality,'unknown');
});
test('supported query identities survive the equivalent bounded form and JSON request',()=>{
 const protocols=[['https://www.facebook.com/tr/',{id:'publisher',ev:'PageView',fbp:'visitor-fixture',dl:'https://example.test/'}],
 ['https://bat.bing.com/action/0',{ti:'publisher',vid:'visitor-fixture'}],
 ['https://gum.criteo.com/fpm/init',{first_party_id:'visitor-fixture'}],
 ['https://fastlane.rubiconproject.com/a/api/fastlane.json',{'eid_pubcid.org':'visitor-fixture'}]]as const;
 for(const [url,fields]of protocols)for(const format of ['form','json']){
  const body=format==='form'?new URLSearchParams(fields).toString():JSON.stringify(fields);
  const row=captureCaliforniaRejectRequest({url,method:'POST',requestId:'fixture',startedAtMs:200,httpStatus:204,hasBody:true,body,headers:{'content-type':format==='form'?'application/x-www-form-urlencoded':'application/json'}});
  assert.ok(row,url);assert.equal(row.proof?.bodyStatus,'complete',url);assert.notEqual(row.qualification.activity,'unresolved',url);assert.doesNotMatch(JSON.stringify(row),/visitor-fixture/);
 }
});
test('privacy ambiguity and budget limits are not waived to accept extra metadata',()=>{
 const input={url:'https://www.facebook.com/tr/',method:'POST',requestId:'fixture',startedAtMs:200,httpStatus:204,hasBody:true,headers:{'content-type':'application/x-www-form-urlencoded'}};
 for(const body of ['id=p&ev=PageView&fbp=visitor-fixture&unreviewed_privacy_mode=1','id=p&ev=PageView&fbp=visitor-fixture&fbp=other','x='.repeat(20000)])assert.notEqual(captureCaliforniaRejectRequest({...input,body})?.proof?.bodyStatus,'complete');
 assert.equal(classifyCanonicalCollectionEndpoint('https://www.clarity.ms/tag/project','fetch').observed,false);
 assert.equal(classifyCanonicalCollectionEndpoint('https://connect.facebook.net/signals/config/123','fetch').observed,false);
});
