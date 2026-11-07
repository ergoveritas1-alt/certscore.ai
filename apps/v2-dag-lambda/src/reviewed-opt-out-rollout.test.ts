import test from 'node:test';
import assert from 'node:assert/strict';
import {claimReviewedOptOutRollout,reviewedRouteDispatch} from './reviewed-opt-out-rollout';
import {conditionalConsentFixture} from './test-fixtures/conditional-opt-out';
import {conditionalOptOutCandidate} from './conditional-opt-out';
import {redHatConditionalDispatch} from './redhat-opt-out-dispatch';
import {REDHAT_OPT_OUT_TARGET, REDHAT_OPT_OUT_DOCUMENT} from '@certscore/contracts';

function routeFixture(scanId='production-scan'){
 const bundle=conditionalConsentFixture(scanId);bundle.url='https://gimbal.com/';
 const o=bundle.consentUiObservations[0]!;o.documentUrl='https://infillion.com/';
 Object.assign(o.controls[0]!,{label:'Cookie Settings',actionType:'manage_preferences',selectorHint:'button#onetrust-pc-btn-handler'});
 return {bundle,scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64)};
}
function ledgerFixture(){const records=new Map<string,unknown>();return {records,ledger:{async read(k:string){return records.get(k)??null;},async create(k:string,v:unknown){if(records.has(k))throw Error('duplicate');records.set(k,v);}}};}
const runtime={functionName:'certscore-v2-dag-local',functionVersion:'$LATEST',region:'us-west-1',memoryMb:3008,buildGitSha:'b'.repeat(40)};
const enabled={CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED:'1',CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED:'1',CERTSCORE_REDHAT_OPT_OUT_RELOAD_ENABLED:'1'};
async function withFlags(fn:()=>Promise<void>){const old=Object.fromEntries(Object.keys(enabled).map(k=>[k,process.env[k]]));Object.assign(process.env,enabled);try{await fn();}finally{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}}
function input(scanId='production-scan') {const selected=reviewedRouteDispatch(routeFixture(scanId))!;assert.ok(selected);return {stage:'coordinator' as 'coordinator'|'worker',scanId,targetUrl:'https://gimbal.com/',region:'us-west-1',functionName:runtime.functionName,dispatch:selected.dispatch,parentDispatchSha256:'c'.repeat(64)};}

test('reviewed Settings routes require exact joined label, selector, document and source',()=>{
 const f=routeFixture();assert.ok(reviewedRouteDispatch(f));
 for(const patch of [{scanId:'other'},{sourceSha256:'bad'},{targetUrl:'https://infillion.com/'}])assert.equal(reviewedRouteDispatch({...f,...patch}),null);
 for(const patch of [{visible:false},{visibilityEvidence:'unverified'},{label:'Settings'},{selectorHint:'#other'},{tagName:'input'}]){const b=structuredClone(f.bundle);Object.assign(b.consentUiObservations[0]!.controls[0]!,patch);assert.equal(reviewedRouteDispatch({...f,bundle:b}),null);}
 const b=structuredClone(f.bundle);b.consentUiObservations[0]!.controls.push({...b.consentUiObservations[0]!.controls[0]!});assert.equal(reviewedRouteDispatch({...f,bundle:b}),null);
 const moved=structuredClone(f.bundle);moved.consentUiObservations[0]!.documentUrl='https://elsewhere.example/';assert.equal(reviewedRouteDispatch({...f,bundle:moved}),null);
});
test('former domain holds no longer exclude otherwise eligible exact-target controls',()=>{
 for(const targetUrl of ['https://readcube.com/','https://gimbal.com/','https://infillion.com/']){const bundle=conditionalConsentFixture();bundle.url=targetUrl;bundle.consentUiObservations[0]!.documentUrl=targetUrl;assert.equal(conditionalOptOutCandidate({bundle,scanId:bundle.scanId,targetUrl,sourceSha256:'a'.repeat(64)}).reason,'supported_control');}
});
test('production grants allow different scan IDs and require matching durable parent claims once',()=>withFlags(async()=>{
 const {ledger}=ledgerFixture();for(const scanId of ['scan-one','scan-two']){const i=input(scanId);await claimReviewedOptOutRollout(i,{ledger,runtime});await claimReviewedOptOutRollout({...i,stage:'worker'},{ledger,runtime});await assert.rejects(claimReviewedOptOutRollout({...i,stage:'worker'},{ledger,runtime}),/duplicate/);await assert.rejects(claimReviewedOptOutRollout(i,{ledger,runtime}),/duplicate/);}
}));
test('production claim rejects absent grant flag, absent or changed parent, changed source and runtime',()=>withFlags(async()=>{
 const {ledger}=ledgerFixture(),i=input();await assert.rejects(claimReviewedOptOutRollout({...i,stage:'worker'},{ledger,runtime}));
 for(const patch of [{parentDispatchSha256:'bad'},{targetUrl:'https://elsewhere.example/'},{scanId:'../escape'},{region:'eu-west-1'},{functionName:'other'}])await assert.rejects(claimReviewedOptOutRollout({...i,...patch},{ledger,runtime}));
 for(const patch of [{memoryMb:4096},{buildGitSha:'bad'},{functionName:'other'}])await assert.rejects(claimReviewedOptOutRollout(i,{ledger,runtime:{...runtime,...patch}}));
 await claimReviewedOptOutRollout(i,{ledger,runtime});await assert.rejects(claimReviewedOptOutRollout({...i,stage:'worker',parentDispatchSha256:'d'.repeat(64)},{ledger,runtime}));
 const changed=structuredClone(i);changed.dispatch.rolloutSource!.sourceSha256='e'.repeat(64);await assert.rejects(claimReviewedOptOutRollout({...changed,stage:'worker'},{ledger,runtime}));
 process.env.CERTSCORE_REVIEWED_OPT_OUT_ROLLOUT_ENABLED='0';await assert.rejects(claimReviewedOptOutRollout(input('third'),{ledger,runtime}));
}));
test('Red Hat production authorization preserves source binding without per-scan operator slots',()=>withFlags(async()=>{
 const bundle=conditionalConsentFixture('redhat-production');bundle.url=REDHAT_OPT_OUT_TARGET;bundle.consentUiObservations[0]!.documentUrl=REDHAT_OPT_OUT_DOCUMENT;const selected=redHatConditionalDispatch({bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64),enabled:true})!;assert.ok(selected);
 const {ledger}=ledgerFixture(),i={stage:'coordinator' as const,scanId:bundle.scanId,targetUrl:bundle.url,region:runtime.region,functionName:runtime.functionName,dispatch:selected.dispatch,parentDispatchSha256:'c'.repeat(64)};
 await claimReviewedOptOutRollout(i,{ledger,runtime});await claimReviewedOptOutRollout({...i,stage:'worker'},{ledger,runtime});
}));
test('reviewed apex/www routes preserve the exact counterpart and exclude arbitrary destinations',()=>{
 const bundle=conditionalConsentFixture('apex');bundle.url='https://example.com/';bundle.consentUiObservations[0]!.documentUrl='https://www.example.com/';
 const f={bundle,scanId:bundle.scanId,targetUrl:bundle.url,sourceSha256:'a'.repeat(64)},selected=reviewedRouteDispatch(f)!;
 assert.equal(selected.dispatch.policyVersion,'bounded_sale_sharing_opt_out.v2-apex-www');assert.equal(selected.dispatch.redirectAuthorization!.alternateTargetUrl,'https://www.example.com/');
 for(const documentUrl of ['https://www.example.com/other','https://elsewhere.com/','http://www.example.com/']){const b=structuredClone(bundle);b.consentUiObservations[0]!.documentUrl=documentUrl;assert.equal(reviewedRouteDispatch({...f,bundle:b}),null);}
});
