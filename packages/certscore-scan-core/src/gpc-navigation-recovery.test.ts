import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createGpcNavigationRecovery,selectGpcRecoveryCapture} from './gpc-navigation-recovery';
import {createGpcImpactCapture} from './gpc-impact-capture';
import type {GpcSignalObservation} from '@certscore/contracts';
const first='https://example.test/first',last='https://example.test/final';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
function setup(enabled=true,deadline=6000){
 let now=0;const c=createGpcNavigationRecovery({expectedEnabled:enabled,now:()=>now,deadlineMs:deadline});
 const control=createGpcImpactCapture({expectedEnabled:enabled,now:()=>now});
 const both=(method:string,...args:any[])=>{(c as any)[method](...args);(control as any)[method](...args);};
 function request(token='first',url=first){both('documentRequested',{type:'Document',frameId:'main',loaderId:token,request:{url,headers:enabled?{'Sec-GPC':'1'}:{}}},'main');}
 function commit(token='first',url=first){both('documentCommitted',{loaderId:token,url});}
 function event(id:string){both('recordRequest',{eventId:id,timestampMs:now,requestUrl:'https://example.test/'+id});}
 function finish(token='final',url=last){both('bindReadback',token);const proof={expectedEnabled:enabled,documentUrlSha256:hash(url),capturedAtMs:now} as GpcSignalObservation;const originalCapture=c.finish(proof),r={...c.finishRecovery(proof),originalCapture};assert.deepEqual(r.originalCapture,control.finish(proof),'original evidence must remain exact');return r;}
 return{c,control,both,request,commit,event,finish,set:(v:number)=>{now=v;}};
}
function recovered(enabled=true,end=4000){const s=setup(enabled);s.request();s.set(100);s.commit();s.set(200);s.event('before');s.set(300);s.request('final',last);s.set(400);s.commit('final',last);s.set(500);s.event('after');s.set(end);return s.finish();}
test('one navigation yields a separate final-document candidate and preserves original evidence',()=>{const r=recovered();assert.equal(r.status,'candidate_available');assert.equal(r.attemptCount,1);assert.equal(r.originalCapture.windows.length,0);assert.ok(r.originalCapture.invalidationReasons?.includes('document_recommitted'));assert.equal(r.finalDocumentCapture?.windows.at(-1)?.durationMs,3000);assert.equal(r.finalDocumentCapture?.windows.at(-1)?.requestCount,1);assert.equal(r.productionProjectable,false);});
test('stable and same-URL history keep the original usable capture without a restart',()=>{for(const history of [false,true]){const s=setup();s.request();s.set(100);s.commit();if(history)s.both('navigatedWithinDocument',{url:first,navigationType:'historyApi'},'first');s.set(4000);const r=s.finish('first',first);assert.equal(r.status,'not_attempted');assert.equal(r.originalCapture.windows.length,4);assert.equal(r.finalDocumentCapture,null);}});
test('redirect hops before recovered commit use the final verified request',()=>{const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final','https://example.test/redirect');s.set(250);s.request('final',last);s.set(300);s.commit('final',last);s.set(3500);const r=s.finish();assert.equal(r.status,'candidate_available');assert.equal(r.attemptCount,1);});
test('same-URL reload is a fresh document and can yield a candidate',()=>{const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('reload',first);s.set(300);s.commit('reload',first);s.set(3500);assert.equal(s.finish('reload',first).status,'candidate_available');});
test('repeated navigation or duplicate commit cannot silently restart again',()=>{for(const mode of ['request','commit']){const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final',last);s.set(300);s.commit('final',last);s.set(400);if(mode==='request'){s.request('third',last);s.commit('third',last);}else s.commit('final',last);s.set(4000);const r=s.finish(mode==='request'?'third':'final');assert.equal(r.status,'candidate_unavailable');assert.equal(r.attemptCount,1);}});
test('wrong loader, URL, readback and short window keep the candidate unavailable',()=>{for(const mode of ['loader','url','readback','short']){const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final',last);s.set(300);s.commit(mode==='loader'?'other':'final',mode==='url'?first:last);s.set(mode==='short'?400:4000);const r=s.finish(mode==='readback'?'other':'final');assert.equal(r.status,'candidate_unavailable',mode);assert.equal(r.finalDocumentCapture?.windows.length,0);}});
test('changed route, fragment, unknown history and renderer crash stop the candidate',()=>{for(const mode of ['route','fragment','unknown','crash']){const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final',last);s.set(300);s.commit('final',last);s.set(400);if(mode==='crash')s.both('invalidate','renderer_crash');else s.both('navigatedWithinDocument',{url:mode==='route'?first:mode==='fragment'?last+'#x':last,navigationType:mode==='unknown'?undefined:'historyApi'},'final');s.set(4000);assert.equal(s.finish().status,'candidate_unavailable');}});
test('budget exhaustion never adds a wait or extends a window',()=>{for(const start of [200,6000]){const s=setup(true,6000);s.request();s.set(100);s.commit();s.set(start);s.request('final',last);s.set(start+100);s.commit('final',last);s.set(6500);const r=s.finish();assert.notEqual(r.status,'candidate_available');assert.ok(r.limitationKeys.includes('existing_budget_exhausted'));}});
test('request overflow remains explicit and unavailable',()=>{const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final',last);s.set(300);s.commit('final',last);s.set(400);for(let i=0;i<5001;i++)s.event('request-'+i);s.set(4000);const r=s.finish();assert.equal(r.status,'candidate_unavailable');assert.ok(r.limitationKeys.includes('request_capture_overflow'));});
test('freeze is idempotent and ignores late callbacks',()=>{const s=setup();s.request();s.set(100);s.commit();s.set(200);s.request('final',last);s.set(300);s.commit('final',last);s.set(4000);const r=s.finish(),json=JSON.stringify(r);s.c.invalidate('renderer_crash');s.c.documentCommitted({loaderId:'late',url:first});assert.strictEqual(s.c.finish(),r.originalCapture);assert.deepEqual(s.c.finishRecovery(),(({originalCapture,...rest})=>rest)(r));assert.equal(JSON.stringify(r),json);});
test('an experiment-level identity limitation cannot reuse the original as a candidate',()=>{const s=setup(false);s.request('first',last);s.set(100);s.commit('first',last);s.c.documentRequested({type:'Document',frameId:'main'},'main');s.set(4000);const r=s.finish('first',last);assert.ok(r.limitationKeys.includes('navigation_identity_unverified'));assert.equal(selectGpcRecoveryCapture({gpcImpactCapture:r.originalCapture,gpcNavigationRecovery:r} as any),undefined);});

test('original and candidate share the original freeze checkpoint even when clock reads advance',()=>{
 let time=0;
 const c=createGpcNavigationRecovery({expectedEnabled:true,now:()=>time++,deadlineMs:6000});
 const req=(token:string,url:string)=>c.documentRequested({type:'Document',frameId:'main',loaderId:token,request:{url,headers:{'Sec-GPC':'1'}}},'main');
 req('first',first);time=100;c.documentCommitted({loaderId:'first',url:first});
 time=200;req('final',last);time=300;c.documentCommitted({loaderId:'final',url:last});
 time=3500;c.bindReadback('final');
 const proof={expectedEnabled:true,documentUrlSha256:hash(last),capturedAtMs:3500} as GpcSignalObservation;
 const original=c.finish(proof),recovery=c.finishRecovery(proof);
 assert.equal(recovery.status,'candidate_available');
 assert.equal(recovery.finalDocumentCapture!.capturedAtMs,original.capturedAtMs);
 assert.deepEqual(recovery.finalDocumentCapture!.document,original.document);
 assert.ok(selectGpcRecoveryCapture({gpcImpactCapture:original,gpcNavigationRecovery:recovery} as any));
});

test('crossing the deadline during original freeze preserves original evidence and limits only recovery',()=>{
 let time=0,atFreeze=false;
 const c=createGpcNavigationRecovery({expectedEnabled:true,now:()=>atFreeze?time++:time,deadlineMs:4000});
 const req=(token:string,url:string)=>c.documentRequested({type:'Document',frameId:'main',loaderId:token,request:{url,headers:{'Sec-GPC':'1'}}},'main');
 req('first',first);time=100;c.documentCommitted({loaderId:'first',url:first});
 time=200;req('final',last);time=300;c.documentCommitted({loaderId:'final',url:last});
 time=3999;c.bindReadback('final');time=4000;atFreeze=true;
 const proof={expectedEnabled:true,documentUrlSha256:hash(last),capturedAtMs:3999} as GpcSignalObservation;
 const original=c.finish(proof),recovery=c.finishRecovery(proof);
 assert.ok(original.invalidationReasons!.includes('document_recommitted'));
 assert.equal(recovery.status,'candidate_unavailable');
 assert.ok(recovery.limitationKeys.includes('existing_budget_exhausted'));
 assert.equal(recovery.finalDocumentCapture!.capturedAtMs,original.capturedAtMs);
});
