import assert from 'node:assert/strict';
import test from 'node:test';
import {captureCaliforniaRejectRequest,californiaProofRecipient} from './california-reject-request';
import {readBoundedProtocolJson,classifyCanonicalCollectionEndpoint} from '@certscore/vendor-resolver';
import {californiaRejectRequestEvidenceSchema,isQualifyingSaleSharingRequest} from '@certscore/contracts';
const capture=(url:string,body:string,contentType='application/json')=>captureCaliforniaRejectRequest({url,body,method:'POST',hasBody:true,requestId:'fixture',startedAtMs:200,httpStatus:204,headers:{'content-type':contentType}});

test('source-verified collectors select the exact canonical recipient on both choice paths',()=>{
 for(const url of ['https://analytics.tiktok.com/api/v2/pixel','https://analytics.tiktok.com/api/v2/pixel/act','https://ct.pinterest.com/v3/','https://tr.snapchat.com/p','https://alb.reddit.com/rp','https://a.klaviyo.com/api/track','https://a.klaviyo.com/client/events/'])assert.ok(californiaProofRecipient(url),url);
 for(const url of ['https://analytics.tiktok.com/api/v2/pixel/unknown','https://analytics.tiktok.com/api/v2/pixel2','https://tr.snapchat.com/p2','https://ct.pinterest.com/v30/','https://a.klaviyo.com/client/events.js','https://tr.snapchat.com.evil.test/p','https://alb.reddit.com/rp.js'])assert.equal(californiaProofRecipient(url),null,url);
 for(const url of ['https://s.pinimg.com/ct/core.js','https://sc-static.net/scevent.min.js','https://analytics.tiktok.com/i18n/pixel/events.js','https://ct.pinterest.com/ct.html','https://ct.pinterest.com/stats/','https://pixel-config.reddit.com/v1/config/project'])assert.equal(classifyCanonicalCollectionEndpoint(url,'fetch').observed,false,url);
});

test('reviewed flat and nested collector envelopes keep metadata separate from CA purpose',()=>{
 const shapes:[string,unknown][]=[
  ['https://analytics.tiktok.com/api/v2/pixel',{event:'PageView',context:{pixel:{code:'publisher'},user:{ttp:'private-fixture'},page:{url:'https://site.test/'}},properties:{currency:'USD',value:1}}],
  ['https://tr.snapchat.com/p',{pid:'publisher',ev:'PAGE_VIEW',u_c1:'private-fixture'}],
  ['https://tr.snapchat.com/p',{req:[{t:{pid:'publisher',ev:'PAGE_VIEW',u_c1:'private-fixture'},del:0}],ctx:{url:'https://site.test/',v:'fixture'}}],
  ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',pd:{external_id:'private-fixture'},ed:{currency:'USD'}}],
  ['https://alb.reddit.com/rp',{id:'publisher',event:'PageVisit',uuid:'private-fixture',opt_out:0}],
  ['https://a.klaviyo.com/client/events/',{data:{type:'event',attributes:{properties:{value:1},profile:{data:{type:'profile',attributes:{email:'private-fixture'}}},metric:{data:{type:'metric',attributes:{name:'Viewed Product'}}}}}}],
 ];
 for(const[url,payload]of shapes){const r=capture(url,JSON.stringify(payload));assert.ok(r,url);assert.equal(r.proof?.bodyStatus,'complete',url);assert.equal(r.proof?.policyVersion,'bounded_ca_request_proof.v5');assert.equal(r.qualification.activity,url.includes('klaviyo')?'unresolved':'identified_advertising_collection');assert.doesNotMatch(JSON.stringify(r),/private-fixture/);assert.deepEqual(californiaRejectRequestEvidenceSchema.parse(JSON.parse(JSON.stringify(r))),r);}
});

test('legacy Klaviyo form-encoded JSON and canonical base64 are bounded and privacy-preserving',()=>{
 const event={token:'public',event:'Viewed Product',customer_properties:{$id:'private-fixture'},properties:{value:1}};
 for(const data of [JSON.stringify(event),Buffer.from(JSON.stringify(event)).toString('base64')]){
  const r=capture('https://a.klaviyo.com/api/track',new URLSearchParams({data}).toString(),'application/x-www-form-urlencoded');assert.equal(r?.proof?.bodyStatus,'complete');assert.equal(r?.qualification.activity,'unresolved');assert.doesNotMatch(JSON.stringify(r),/private-fixture/);
 }
});

test('decoded duplicate keys, opaque structures, privacy ambiguity and fixed budgets fail closed',()=>{
 assert.throws(()=>readBoundedProtocolJson('{"ev":"PageView","\\u0065v":"Purchase"}',0),/duplicate_fields/);
 for(const body of ['{"event":"PageView","context":{"user":{"ttp":"x","ttp":"y"}}}',JSON.stringify({events:Array.from({length:17},()=>({event:'PageView'}))}),JSON.stringify({event:'PageView',context:{user:{unreviewed_consent_mode:'allowed'}}}),JSON.stringify({event:'PageView',properties:{content_id:'x'.repeat(32768)}})]){
  const r=capture('https://analytics.tiktok.com/api/v2/pixel',body);assert.notEqual(r?.proof?.bodyStatus,'complete');
 }
 const conflict=capture('https://analytics.tiktok.com/api/v2/pixel',JSON.stringify({events:[{event:'PageView',us_privacy:'1NNN'},{event:'PageView',us_privacy:'1NYN'}]}));assert.equal(conflict?.proof?.bodyStatus,'unsupported');assert.ok(conflict?.proof?.reasons.includes('unsupported_fields'),'unverified TikTok batch format remains unsupported');
 const optout=capture('https://alb.reddit.com/rp',JSON.stringify({id:'publisher',event:'PageVisit',opt_out:1}));assert.ok(optout?.qualification.processingSignals.includes('privacy_signal_invalid'));
 const npa=capture('https://tr.snapchat.com/p',JSON.stringify({pid:'publisher',ev:'PAGE_VIEW',us_privacy:'1NYN'}));assert.ok(npa?.qualification.processingSignals.includes('us_privacy_sale_opt_out'));
});

test('Reddit SDK mirrors routing fields without accepting conflicts or duplicate privacy state',()=>{
 const url='https://alb.reddit.com/rp?id=publisher&event=PageVisit';
 const row=capture(url,'id=publisher&event=PageVisit&uuid=private-fixture&opt_out=0','application/x-www-form-urlencoded');
 assert.equal(row?.proof?.bodyStatus,'complete');assert.equal(row?.proof?.policyVersion,'bounded_ca_request_proof.v5');
 for(const body of ['id=other&event=PageVisit','id=publisher&id=publisher&event=PageVisit'])assert.equal(capture(url,body,'application/x-www-form-urlencoded')?.proof?.bodyStatus,'unsupported');
 assert.equal(capture(url+'&us_privacy=1NNN','id=publisher&event=PageVisit&us_privacy=1NNN','application/x-www-form-urlencoded')?.proof?.bodyStatus,'unsupported');
});

 test('new protocol identity digests stay endpoint-bound and require a same-event publisher and event',()=>{
 for(const[url,payload,field]of [
 ['https://analytics.tiktok.com/api/v2/pixel',{event:'PageView',context:{user:{ttp:'private-fixture'}}},'ttp'],
 ['https://tr.snapchat.com/p',{req:[{t:{pid:'publisher',ev:'PAGE_VIEW',u_c1:'private-fixture'},del:0}]},'u_c1'],
 ['https://alb.reddit.com/rp',{id:'publisher',event:'PageVisit',uuid:'private-fixture'},'uuid'],
 ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',epik:'private-fixture'},'epik'],
 ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',pd:{external_id:'private-fixture'}},'external_id'],
 ]as const){
  const r=capture(url,JSON.stringify(payload))!;assert.ok(r.proof?.identifiers.some(id=>id.field===field&&id.source==='body'));
  assert.equal(r.qualification.activity,url.includes('tiktok')?'unresolved':'identified_advertising_collection');assert.doesNotMatch(JSON.stringify(r),/private-fixture/);
  const altered=structuredClone(r);altered.origin='https://www.facebook.com';altered.path='/tr/';assert.equal(californiaRejectRequestEvidenceSchema.safeParse(altered).success,false);
 }
 const other=capture('https://www.facebook.com/tr/','id=publisher&ev=PageView&uuid=private-fixture','application/x-www-form-urlencoded');
 assert.equal(other?.proof?.bodyStatus,'unsupported');assert.ok(!other?.proof?.identifiers.some(id=>id.field==='uuid'));
 });

test('pixel purpose needs same-event routing, supported identity and no request-local restriction',()=>{
 for(const[url,body]of [
 ['https://analytics.tiktok.com/api/v2/pixel',{pixel_code:'publisher',event:'PageView',ttp:'visitor-fixture'}],
 ['https://tr.snapchat.com/p',{pid:'publisher',ev:'PAGE_VIEW',u_c1:'visitor-fixture'}],
 ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',epik:'visitor-fixture'}],
 ['https://alb.reddit.com/rp',{id:'publisher',event:'PageVisit',uuid:'visitor-fixture'}],
 ]as const){
  const r=capture(url,JSON.stringify(body))!;assert.equal(r.qualification.activity,'identified_advertising_collection',url);
  assert.equal(isQualifyingSaleSharingRequest(capture(url,JSON.stringify({...body,us_privacy:'1NYN'}))!.qualification),false);
  assert.equal(isQualifyingSaleSharingRequest(capture(url,JSON.stringify({...body,rdp:0}))!.qualification),false,'unsupported vendor processing declarations remain neutral');
  for(const key of Object.keys(body)){const partial={...body};delete (partial as Record<string,unknown>)[key];assert.equal(capture(url,JSON.stringify(partial))?.qualification.activity,'unresolved',key);}
 }
 const mixed=capture('https://tr.snapchat.com/p',JSON.stringify({req:[{t:{pid:'publisher',ev:'PAGE_VIEW'},del:0},{t:{u_c1:'visitor-fixture'},del:0}]}));
 assert.equal(mixed?.qualification.activity,'unresolved','different batch entries cannot supply one invented advertising event');
 const multi=capture('https://tr.snapchat.com/p',JSON.stringify({req:[{t:{pid:'publisher',ev:'PAGE_VIEW',u_c1:'visitor-fixture'},del:0},{t:{pid:'publisher',ev:'PURCHASE',u_c1:'another-visitor'},del:0}]}));
 assert.equal(multi?.proof?.bodyStatus,'complete');assert.equal(multi?.qualification.activity,'identified_advertising_collection');
});

test('supported protocol identities take priority within the existing eight-digest cap',()=>{
 const url=new URL('https://analytics.tiktok.com/api/v2/pixel');
 for(const field of ['cid','auid','gacid','gclid','d_cid','d_cid_ic','d_uuid','vi'])url.searchParams.set(field,'generic-fixture');
 url.searchParams.set('ttp','private-fixture');url.searchParams.set('pixel_code','publisher');url.searchParams.set('event','PageView');
 const r=captureCaliforniaRejectRequest({url:url.href,method:'GET',requestId:'fixture',startedAtMs:200,httpStatus:204,hasBody:false,body:null,headers:{}})!;
 assert.equal(r.proof?.identifiers.length,8);assert.ok(r.proof?.identifiers.some(id=>id.field==='ttp'));assert.equal(isQualifyingSaleSharingRequest(r.qualification),true);
});

test('null or empty processing declarations remain explicit invalid signals',()=>{
 for(const opt_out of [null,'']){
  const r=capture('https://alb.reddit.com/rp',JSON.stringify({id:'publisher',event:'PageVisit',uuid:'visitor-fixture',opt_out}))!;
  assert.ok(r.qualification.processingSignals.includes('privacy_signal_invalid'));assert.equal(isQualifyingSaleSharingRequest(r.qualification),false);
 }
});
