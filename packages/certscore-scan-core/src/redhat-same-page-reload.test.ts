import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {RedHatSamePageReload,REDHAT_FINAL_URL} from './redhat-same-page-reload';

const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
function fixture(){
 const original={frameId:'frame',loaderId:'old',url:REDHAT_FINAL_URL,sourceSha256:'a5b3cb7d74d2863fa04970c72facaf0055bf129225d27d7313741415b6ee5b73'};const r=new RedHatSamePageReload(original);
 const network={requestId:'net',type:'Document',frameId:'frame',loaderId:'new',documentURL:REDHAT_FINAL_URL,request:{url:REDHAT_FINAL_URL,method:'GET'}};
 const request={requestId:'fetch',networkId:'net',frameId:'frame',request:{url:REDHAT_FINAL_URL,method:'GET'}};
 const row={actions:1,submitted:true,dispatchedAtMs:1000,sourceBundleSha256:'a5b3cb7d74d2863fa04970c72facaf0055bf129225d27d7313741415b6ee5b73',documentTokenSha256:hash('old'),before:{value:{status:'observed',decision:{source:'implied'}}}};
 const event={reason:'reload',isMainFrame:true,exactDestination:REDHAT_FINAL_URL,sourceDocumentSha256:hash('old'),actionAtMs:1000,atMs:1200};
 return {r,network,request,row,entries:{scheduled:{...event},requested:{...event}}};
}
test('one reload requires action, browser reason, network/loader and response provenance',()=>{
 const f=fixture();f.r.observeNetwork(f.network);assert.equal(f.r.authorizeRequest(f.request,f.row,f.entries,1250),true);
 assert.equal(f.r.commit({id:'frame',url:REDHAT_FINAL_URL,loaderId:'new'}),false);
 assert.equal(f.r.verifyResponse({...f.request,responseStatusCode:200}),true);
 assert.equal(f.r.commit({id:'frame',url:REDHAT_FINAL_URL,loaderId:'new'}),true);
 assert.equal(f.r.accepts({id:'frame',url:REDHAT_FINAL_URL,loaderId:'new'}),true);
 assert.equal(f.r.accepts({id:'frame',url:REDHAT_FINAL_URL,loaderId:'old'}),false);
 assert.equal(f.r.authorizeRequest(f.request,f.row,f.entries,1300),false);
});
test('other URLs, forms, redirects, frames, stale/missing provenance and late requests fail closed',()=>{
 const mutations:Array<(f:ReturnType<typeof fixture>)=>void>=[
  f=>f.request.request.url+='?x=1',f=>f.request.request.url+='/',f=>f.request.request.method='POST',
  f=>(f.request.request as any).hasPostData=true,f=>f.request.frameId='child',f=>(f.request as any).redirectedRequestId='other',
  f=>f.network.loaderId='old',f=>f.network.documentURL='https://other.example/',f=>(f.network as any).redirectResponse={},
  f=>f.row.actions=0,f=>f.row.submitted=false,f=>f.row.documentTokenSha256='b'.repeat(64),f=>f.row.sourceBundleSha256='b'.repeat(64),
  f=>f.entries.requested.reason='formSubmissionGet',f=>f.entries.scheduled.atMs=999,f=>f.entries.requested.isMainFrame=false,
  f=>delete (f.entries as any).requested,f=>f.request.networkId='missing',
 ];
 for(const mutate of mutations){const f=fixture();mutate(f);f.r.observeNetwork(f.network);assert.equal(f.r.authorizeRequest(f.request,f.row,f.entries,1250),false);}
 const late=fixture();late.r.observeNetwork(late.network);assert.equal(late.r.authorizeRequest(late.request,late.row,late.entries,1751),false);
 for(const status of [301,302,204,403,500]){const f=fixture();f.r.observeNetwork(f.network);assert(f.r.authorizeRequest(f.request,f.row,f.entries,1250));assert.equal(f.r.verifyResponse({...f.request,responseStatusCode:status}),false);}
 const location=fixture();location.r.observeNetwork(location.network);assert(location.r.authorizeRequest(location.request,location.row,location.entries,1250));assert.equal(location.r.verifyResponse({...location.request,responseStatusCode:200,responseHeaders:[{name:'Location',value:REDHAT_FINAL_URL}]}),false);
});
