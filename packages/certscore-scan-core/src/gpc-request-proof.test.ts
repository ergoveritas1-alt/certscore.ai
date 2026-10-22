import assert from 'node:assert/strict';
import test from 'node:test';
import {createGpcRequestProofCapture,prioritizeGpcRecipients,qualifyGpcRequest} from './gpc-request-proof';
import {isQualifyingSaleSharingRequest,gpcObservationSessionSchema} from '@certscore/contracts';
import {gpcProductionRuntimeFixture} from '../../certscore-contracts/src/test-fixtures/gpc-production';
import {createHash} from 'node:crypto';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const hem='a'.repeat(64);
const url='https://px.ads.linkedin.com/wa/?pid=123&fmt=a';
const headers={'content-type':'text/plain','sec-gpc':'1'};
const event=(i=1,requestUrl=url)=>({eventId:`e${i}`,requestId:`r${i}`,timestampMs:100,method:'POST',requestUrl});
const request=(body:string|null=JSON.stringify({signalType:'PAGE_VISIT',hem}))=>({postData:()=>body,method:()=> 'POST'});
function fixture(e=event()){
 const session=gpcProductionRuntimeFixture().gpcObservationSession!;
 session.requests=[{eventId:e.eventId,timestampMs:100,urlSha256:sha(e.requestUrl),secGpc:'1'}];
 session.requestsObserved=1;session.requestsDropped=0;
 session.captureStartedAtMs=0;session.captureEndedAtMs=1000;
 session.mainDocument!.committedAtMs=50;session.mainDocument!.requestAtMs=10;
 return session;
}
test('bounded GPC capture retains hashed matching proof, never raw body, headers or identifiers',()=>{
 const cap=createGpcRequestProofCapture(()=>150),e=event(),session=fixture(e);
 cap.reserve(e,session.mainDocument!.documentToken,request())!(headers);
 session.requestProofCapture=cap.finish();
 assert.equal(session.requestProofCapture.rows[0]?.proof.qualification.basis,'linkedin_hashed_email');
 assert.equal(JSON.stringify(session.requestProofCapture).includes(hem),false);
 assert.equal(JSON.stringify(session.requestProofCapture).includes('text/plain'),false);
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true,requestAtMs:100})),true);
 assert.equal(gpcObservationSessionSchema.safeParse(session).success,true);
});
test('incomplete supplemental data preserves URL evidence; does not create new eligibility',()=>{
 for(const mode of ['no_capture','missing_headers','unsupported_body','late_headers'] as const){
  const e=event(1,'https://px.ads.linkedin.com/collect/?pid=123&li_fat_id=visitor123'),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
  if(mode!=='no_capture'){
   const callback=cap.reserve(e,session.mainDocument!.documentToken,request('unsupported'))!;
   if(mode!=='late_headers')callback(mode==='missing_headers'?undefined:headers);
   session.requestProofCapture=cap.finish();
   if(mode==='late_headers')callback(headers);
  }
  assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),true,mode);
 }
 const e=event(),session=fixture(),cap=createGpcRequestProofCapture(()=>150);
 cap.reserve(e,session.mainDocument!.documentToken,request())!();session.requestProofCapture=cap.finish();
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),false);
});
test('positive restriction stays request-local and survives detailed-proof eviction',()=>{
 const e=event(1,'https://www.google.com/pagead/conversion/123/?gclid=visitor123'),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
 cap.reserve(e,session.mainDocument!.documentToken,request('rdp=1'))!({'content-type':'application/x-www-form-urlencoded'});
 session.requestProofCapture=cap.finish();
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),false);
 session.requestProofCapture.rows=[];session.requestProofCapture.retentionDropped=1;
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),false);
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest({...e,eventId:'sibling',requestId:'sibling'},session,{gpcDelivered:true})),true);
});
test('wrong document, request ID, method or timestamp cannot supply supplemental identity',()=>{
 for(const mode of ['document','id','method','time'] as const){
  const e=event(),session=fixture(),cap=createGpcRequestProofCapture(()=>150);
  cap.reserve(e,session.mainDocument!.documentToken,request())!(headers);session.requestProofCapture=cap.finish();
  const row=session.requestProofCapture.rows[0]!;
  if(mode==='document')row.documentToken='wrong';
  if(mode==='id')row.proof.requestId='wrong';
  if(mode==='method')row.proof.method='GET';
  if(mode==='time')row.proof.startedAtMs++;
  assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),false,mode);
 }
});
test('duplicate flood cannot consume reserved recipient slots or evict a new recipient',()=>{
 const cap=createGpcRequestProofCapture(()=>150);
 for(let i=0;i<100;i++)cap.reserve(event(i),'doc',request())?.(headers);
 const google=event(101,'https://www.google.com/pagead/conversion/123/?gclid=visitor123');
 cap.reserve(google,'doc',request(null))!({});
 const result=cap.finish();
 assert.equal(result.inspected,41);assert.equal(result.skipped,60);assert.equal(result.rows.length,32);
 assert.equal(result.rows.some(r=>r.eventId==='e101'),true);
 assert.ok(result.rows.every(r=>r.proof.contractVersion==='gpc_request_proof.v1'));
 assert.equal(prioritizeGpcRecipients([{entity:'a',ok:false},{entity:'a',ok:true},{entity:'b',ok:true}],r=>r.entity,r=>r.ok,2).filter(r=>r.ok).length,2);
});
test('terminal snapshot cannot be mutated by a delayed same-request header read',()=>{
 const cap=createGpcRequestProofCapture(()=>150),done=cap.reserve(event(),'doc',request())!;
 const result=cap.finish(),before=JSON.stringify(result);done(headers);
 assert.equal(result.pending,1);assert.equal(JSON.stringify(result),before);
});

test('supplemental GPP compares same-time CMP state but never borrows a later choice',()=>{
 const e=event(1,'https://www.google.com/pagead/conversion/123/'),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
 cap.reserve(e,session.mainDocument!.documentToken,request('gclid=visitor123&gpp=DBABBg~BUoAAABA.YA&gpp_sid=8'))!({'content-type':'application/x-www-form-urlencoded'});
 session.requestProofCapture=cap.finish();
 const context={gpcDelivered:true,requestAtMs:100,cmp:{capturedAtMs:100,sectionId:8 as const,saleNotice:1,sharingNotice:1,saleOptOut:1,sharingOptOut:1,gpc:true}};
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,context)),false);
 assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{...context,cmp:{...context.cmp,capturedAtMs:200}})),true);
});
test('48 inspections and 32 proofs are hard caps; obsolete loader proof cannot evict current proof',()=>{
 const cap=createGpcRequestProofCapture(()=>150);
 const urls=['https://px.ads.linkedin.com/wa/?fmt=a','https://www.google.com/pagead/conversion/123/?gclid=visitor123',
  'https://www.facebook.com/tr/?id=123&ev=PageView&fbp=visitor123','https://bcp.crwdcntrl.net/6/map?xcid=fixture',
  'https://ads.pubmatic.com/AdServer/js/user_sync.html?p=123','https://match.adsrvr.org/track/cmf/generic?ttd_pid=123',
  'https://rtb.openx.net/sync?pid=123','https://pixel.rubiconproject.com/tap.php?v=123'];
 for(let i=0;i<100;i++){const e=event(i,urls[i%urls.length]);cap.reserve(e,'old',request(null))?.({});}
 const result=cap.finish('current');assert.ok(result.inspected<=48);assert.equal(result.rows.length,0);assert.equal(result.retentionDropped+result.failed+result.pending,result.inspected);
});

test('actual invalid body privacy signal remains neutral even when supplemental headers are unavailable',()=>{
 const e=event(1,'https://www.google.com/pagead/conversion/123/?gclid=visitor123'),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
 cap.reserve(e,session.mainDocument!.documentToken,request('rdp=invalid'))!();session.requestProofCapture=cap.finish();
 const result=qualifyGpcRequest(e,session,{gpcDelivered:true});
 assert.ok(result.processingSignals.includes('privacy_signal_invalid'));assert.equal(isQualifyingSaleSharingRequest(result),false);
});

test('new vendor protocol proof persists in the GPC session without new capture slots or purpose inference',()=>{
 for(const [url,body]of [
  ['https://analytics.tiktok.com/api/v2/pixel',{event:'PageView',context:{user:{ttp:'private-fixture'}}}],
  ['https://tr.snapchat.com/p',{req:[{t:{pid:'publisher',ev:'PAGE_VIEW',u_c1:'private-fixture'},del:0}]}],
  ['https://ct.pinterest.com/v3/',{tid:'publisher',event:'pagevisit',epik:'private-fixture'}],
  ['https://alb.reddit.com/rp',{id:'publisher',event:'PageVisit',uuid:'private-fixture'}],
 ]as const){
  const e=event(1,url),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
  cap.reserve(e,session.mainDocument!.documentToken,request(JSON.stringify(body)))!({'content-type':'application/json','sec-gpc':'1'});
  cap.response(e.eventId,204);session.requestProofCapture=cap.finish(session.mainDocument!.documentToken);
  assert.equal(session.requestProofCapture.inspected,1);assert.equal(session.requestProofCapture.rows.length,1);
  assert.equal(session.requestProofCapture.rows[0]!.proof.proof!.policyVersion,'bounded_ca_request_proof.v5');
  assert.equal(session.requestProofCapture.rows[0]!.proof.httpStatus,204);
  assert.equal(gpcObservationSessionSchema.safeParse(session).success,true,url);
  assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true,requestAtMs:100})),!url.includes('tiktok'));
  assert.doesNotMatch(JSON.stringify(session.requestProofCapture),/private-fixture/);
 }
});

test('unsupported vendor metadata preserves independent URL proof and actual opt-out declarations separately',()=>{
 const url='https://alb.reddit.com/rp?id=publisher&event=PageVisit&uuid=visitor123';
 for(const optedOut of [false,true]){
  const e=event(1,url),session=fixture(e),cap=createGpcRequestProofCapture(()=>150);
  const body=JSON.stringify({unreviewed_metadata:{x:'private-fixture'},...(optedOut?{opt_out:1}:{})});
  cap.reserve(e,session.mainDocument!.documentToken,request(body))!({'content-type':'application/json'});
  session.requestProofCapture=cap.finish();
  assert.equal(session.requestProofCapture.rows[0]?.proof.proof?.bodyStatus,'unsupported');
  assert.equal(isQualifyingSaleSharingRequest(qualifyGpcRequest(e,session,{gpcDelivered:true})),!optedOut);
  assert.doesNotMatch(JSON.stringify(session.requestProofCapture),/private-fixture/);
 }
});
