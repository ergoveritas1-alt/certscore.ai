import assert from 'node:assert/strict';
import test from 'node:test';
import {captureBoundRuntimeTextSnapshot,retainRuntimeOptOutSearch} from './runtime-opt-out-text';
import {GATE_RUNTIME_TEXT_PAGE as pageUrl,GATE_RUNTIME_TEXT_TARGET as targetUrl,domOptOutSearchSchema} from '@certscore/contracts';
const domText='Public starting page with articles, products, services and contact information. '.repeat(8);
const binding=()=>({url:pageUrl,documentIdentity:{source:'cdp_loader_id' as const,token:'original-runtime-loader'}});
async function capture(){return (await captureBoundRuntimeTextSnapshot({capture:async()=>({domText,pageUrl,documentReadyState:'complete',documentLanguage:'en'}),readBinding:binding,scanStartedAtMs:0,now:()=>700})).domTextCapture;}
test('runtime text binding samples the existing read exactly once and survives delayed metadata consumption',async()=>{
 let reads=0,bindings=0,time=700,state=binding();
 const result=await captureBoundRuntimeTextSnapshot({capture:async()=>{reads++;return {domText,pageUrl,documentReadyState:'interactive',documentLanguage:'en'};},readBinding:()=>{bindings++;return state;},scanStartedAtMs:0,now:()=>time});
 state={...state,documentIdentity:{...state.documentIdentity,token:'later-loader'}};time=1500;
 const proof=retainRuntimeOptOutSearch(result.domTextCapture,targetUrl,domText);
 assert.equal(reads,1);assert.equal(bindings,2);assert.equal(proof?.version,'dom_opt_out_search.v3');assert.equal(proof?.documentToken,'original-runtime-loader');assert.equal(proof?.capturedAtMs,700);
 assert.ok(proof&&Buffer.byteLength(JSON.stringify(proof))<=1024);
});
test('same-URL reload, changed renderer URL or absent CDP identity cannot create a bound runtime search',async()=>{
 for(const mode of ['reload','url','missing']as const){
  let state=binding();if(mode==='missing')state.documentIdentity=undefined as never;
  const result=await captureBoundRuntimeTextSnapshot({readBinding:()=>state,scanStartedAtMs:0,now:()=>700,capture:async()=>{
   if(mode==='reload')state={...state,documentIdentity:{...state.documentIdentity,token:'new-loader'}};
   return {domText,pageUrl:mode==='url'?pageUrl+'other':pageUrl,documentReadyState:'complete',documentLanguage:'en'};
  }});
  assert.equal(retainRuntimeOptOutSearch(result.domTextCapture,targetUrl,domText),undefined);
 }
});
test('runtime search excludes loading, changed text, unsupported targets and legacy version reinterpretation',async()=>{
 const c=await capture(),proof=retainRuntimeOptOutSearch(c,targetUrl,domText)!;assert.ok(proof);
 for(const [value,target,text] of [[{...c,documentReadyState:'loading'},targetUrl,domText],[c,targetUrl,domText+' changed'],[c,'https://other.test/',domText],[{...c,url:pageUrl+'other'},targetUrl,domText]]as const)
  assert.equal(retainRuntimeOptOutSearch(value,target,text),undefined);
 for(const version of ['dom_opt_out_search.v1','dom_opt_out_search.v2'])assert.equal(domOptOutSearchSchema.safeParse({...proof,version}).success,false);
 for(const documentLanguage of [undefined,'de','ja'])assert.equal(retainRuntimeOptOutSearch({...c,documentLanguage},targetUrl,domText),undefined);
});
test('runtime search retains positive, ambiguous, truncated and unusable outcomes instead of absence',async()=>{
 const c=await capture();
 for(const [value,expected] of [['Do Not Sell or Share My Personal Information','specific_signal'],['Footer\nOpt-Out','ambiguous_hint'],['You can opt out of profiling.','ambiguous_hint'],['Global Privacy Control','ambiguous_hint'],['Performing security verification. This website verifies you are not a bot. Ray ID: example','capture_unusable']]as const)
  assert.equal(retainRuntimeOptOutSearch({...c,value},targetUrl,value)?.result,expected);
 const value=domText.repeat(200);assert.equal(retainRuntimeOptOutSearch({...c,value},targetUrl,value)?.truncated,true);
 for(const [value,url] of [['Login',pageUrl],[domText,'https://celeb.gate.cc/Users/Login']]as const){
  const p=retainRuntimeOptOutSearch({...c,value,url},targetUrl,value);assert.ok(!p||p.version==='dom_opt_out_search.v3'&&p.bodyUsability==='unusable_or_unverified');
 }
});
