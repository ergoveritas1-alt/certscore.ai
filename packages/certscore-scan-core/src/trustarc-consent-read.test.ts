import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {parseTrustArcGranularDecision,readTrustArcConsentInPage,readTrustArcConsent} from './trustarc-consent-read';

test('granular TrustArc categories preserve asserted/implied and custom indices without inferring purpose',()=>{
 assert.deepEqual(parseTrustArcGranularDecision({source:'asserted',consentDecision:[3,1]}),{source:'asserted',selectedCategoryIndices:[1,3]});
 assert.deepEqual(parseTrustArcGranularDecision({source:'implied',consentDecision:[0]}),{source:'implied',selectedCategoryIndices:[0]});
 assert.deepEqual(parseTrustArcGranularDecision({source:'asserted',consentDecision:[1,7,64]}),{source:'asserted',selectedCategoryIndices:[1,7,64]});
 for(const values of [1,[1,1],[0,1],[],[100],['1'],[-1],[1.2],Array(17).fill(1),Array(2)])assert.equal(parseTrustArcGranularDecision({source:'asserted',consentDecision:values}),null);
 for(const source of ['unknown',undefined,true])assert.equal(parseTrustArcGranularDecision({source,consentDecision:[1]}),null);
});

test('decoder does not invoke getters, inherit state or retain arbitrary payload fields',()=>{
 let reads=0;const raw={source:'asserted',get consentDecision(){reads++;return [1];}};
 assert.equal(parseTrustArcGranularDecision(raw),null);assert.equal(reads,0);
 assert.equal(parseTrustArcGranularDecision(Object.create({source:'asserted',consentDecision:[1]})),null);
 const list=[1];Object.defineProperty(list,'0',{get(){reads++;return 1;}});
 assert.equal(parseTrustArcGranularDecision({source:'asserted',consentDecision:list}),null);assert.equal(reads,0);
 assert.deepEqual(parseTrustArcGranularDecision({source:'asserted',consentDecision:[1],email:'not-retained'}),{source:'asserted',selectedCategoryIndices:[1]});
});

function fixture(options:{api?:boolean;raw?:unknown;fail?:boolean;move?:boolean;slow?:boolean;accessor?:boolean;frame?:boolean}={}){
 let calls=0,reads=0,now=0;const args:unknown[][]=[];const location={href:'https://example.com/',hostname:'example.com',protocol:'https:'};
 const callApi=function(...values:unknown[]){calls++;args.push(values);if(options.fail)throw Error('sdk');if(options.move)location.href='https://example.com/changed';if(options.slow)now=51;return options.raw??{source:'asserted',consentDecision:[1]};};
 const window:any={};window.top=options.frame?{}:window;
 if(options.api!==false)window.truste={cma:{callApi}};
 if(options.accessor)Object.defineProperty(window,'truste',{get(){reads++;return {cma:{callApi}};}});
 const context=vm.createContext({window,location,performance:{now:()=>now},__name:(fn:unknown)=>fn});
 const run=(url='https://example.com/',budget=50)=>JSON.parse(JSON.stringify(vm.runInContext(`(${readTrustArcConsentInPage.toString()})(${parseTrustArcGranularDecision.toString()},${JSON.stringify(url)},${budget})`,context)));
 return {run,calls:()=>calls,reads:()=>reads,args};
}

test('read performs exactly one current-host granular query and no choice action',()=>{
 const f=fixture();assert.equal(f.run().status,'observed');assert.equal(f.calls(),1);assert.deepEqual(f.args,[['getGDPRConsentDecision','example.com']]);
});

test('unavailable, malformed, moved, failed and over-budget reads cannot confirm state',()=>{
 for(const [options,status] of [[{api:false},'api_unavailable'],[{raw:{source:'asserted',consentDecision:1}},'invalid_response'],[{move:true},'document_changed'],[{fail:true},'api_failed'],[{slow:true},'budget_exhausted'],[{accessor:true},'api_unavailable'],[{frame:true},'document_changed']] as const){
  const f=fixture(options);assert.deepEqual(f.run(),{version:'trustarc.granular-consent-read.v1',status,decision:null});assert.ok(f.calls()<=1);assert.equal(f.reads(),0);
 }
 const f=fixture();assert.equal(f.run('https://other.example/').status,'document_changed');assert.equal(f.calls(),0);
 assert.equal(f.run(undefined,0).status,'budget_exhausted');assert.equal(f.calls(),0);
});

test('host wrapper reuses the existing 50 ms read cap and skips exhausted budgets',async()=>{
 let script='';const page={evaluate:async(value:string)=>{script=value;return {status:'observed'};}};
 assert.equal((await readTrustArcConsent(page as any,'https://example.com/',0)).status,'budget_exhausted');assert.equal(script,'');
 await readTrustArcConsent(page as any,'https://example.com/',500);assert.match(script,/,50\);/);
});
