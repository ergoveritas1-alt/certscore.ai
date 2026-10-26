// Offline behavioral verification: no public requests or production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../infra/aws/ergoveritas-canary/',import.meta.url);
const runtime=readFileSync(new URL('certscore-showcase-canary.js',root),'utf8');
for(const n of [1,2]) for(const gpc of [false,true]) for(const manualChoice of [false,true]) {
  const html=readFileSync(new URL(`test${n}.html`,root),'utf8');
  const cookies=new Map(manualChoice?[['certscore_test2_dns_optout','1']]:[]);
  const requests=[],timers=[],listeners=new Map(),local=new Map(),session=new Map();
  const elements=new Map();
  class Element {constructor(id){this.id=id;this.hidden=false;this.textContent='';} addEventListener(kind,fn){listeners.set(`${this.id}:${kind}`,fn);} querySelector(selector){return get(selector.slice(1));}}
  const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const canvas={width:0,height:0,getContext(kind){return kind==='2d'?{fillText(){},getImageData(){return {data:[]};},measureText(){return {width:1};}}:null;},toDataURL(){return 'data:image/png;base64,fixture';}};
  const document={getElementById:get,querySelector:s=>get(s.slice(1)),addEventListener(){},createElement:tag=>tag==='canvas'?canvas:{},body:{appendChild(){}},documentElement:{dataset:{}}};
  Object.defineProperty(document,'cookie',{get(){return [...cookies].map(([k,v])=>`${k}=${v}`).join('; ');},set(raw){const [pair,...attrs]=raw.split(';');const pos=pair.indexOf('=');const key=pair.slice(0,pos);if(attrs.some(x=>x.trim()==='Max-Age=0'))cookies.delete(key);else cookies.set(key,pair.slice(pos+1));}});
  const storage=map=>({setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
  const context=vm.createContext({document,Element,localStorage:storage(local),sessionStorage:storage(session),navigator:{globalPrivacyControl:gpc},AbortController,URL,URLSearchParams,console,fetch:url=>{requests.push(url);return Promise.resolve({});},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}});
  context.window=context;
  const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(const code of inline)vm.runInContext(code,context);
  if(n===2&&manualChoice){assert.equal(context.__CERTSCORE_CANARY_RESULT__.manualOptOut,true);assert.equal(requests.length,0);continue;}
  vm.runInContext(runtime,context);
  assert.equal(requests.length,n===1?6:gpc?4:5);
  const linkedin=requests.filter(url=>new URL(url).hostname==='px.ads.linkedin.com');
  assert.equal(linkedin.length,n===1?1:0,'One synthetic LinkedIn request on test1, with or without GPC');
  if(n===1){
    const url=new URL(linkedin[0]);
    assert.equal(url.pathname,'/collect/');
    assert.equal(url.searchParams.get('pid'),'certscore-test1-synthetic');
    assert.equal(url.searchParams.get('li_adsId'),'certscore-test1-synthetic');
    assert.equal([...url.searchParams].length,2,'No form values or browser-derived identifiers');
  }
  assert.equal(requests.some(url=>new URL(url).hostname==='www.facebook.com'),true);
  assert.ok(requests.every(url=>!url.includes('ud%5Bem%5D')&&!url.includes('hem=')),'No real or hashed personal details');
  assert.equal(requests.some(url=>new URL(url).hostname==='ct.pinterest.com'),n===1||!gpc);
  const before=requests.length;
  listeners.get('onetrust-reject-all-handler:click')();
  while(timers.length)timers.shift()();
  assert.equal(requests.length-before,n===1?1:2);
  assert.equal(requests.slice(before).some(url=>new URL(url).hostname==='px.ads.linkedin.com'),false,'Reject does not add LinkedIn activity');
  assert.equal(cookies.has(n===1?'_fbp':'_fbc'),false);
  assert.equal(cookies.has(n===1?'_clck':'_clsk'),n===2);
  assert.equal(get('onetrust-banner-sdk').hidden,true);
  assert.equal(local.get(`certscore_test${n}_consent_state`),'denied');
  assert.equal(session.size,0);
  assert.ok(html.includes('noindex, nofollow, noarchive'));
  if(n===2) {
    document.body.dataset={test2ChoiceCookie:'certscore_test2_dns_optout'};
    vm.runInContext(readFileSync(new URL('test2-choice-runtime.js',root),'utf8'),context);
    listeners.get('save-choice:click')();
    assert.equal(cookies.get('certscore_test2_dns_optout'),'1');
    for(const name of ['_ga_TEST2','_fbc','_clsk','ajs_anonymous_id','_epik'])assert.equal(cookies.has(name),false);
    const count=requests.length;
    for(const code of inline)vm.runInContext(code,context);
    assert.equal(context.__CERTSCORE_CANARY_RESULT__.manualOptOut,true);
    assert.equal(requests.length,count,'Saved manual choice prevents later optional requests');
    listeners.get('reset-choice:click')();
    assert.equal(cookies.has('certscore_test2_dns_optout'),false);
  }
}
console.log('Passed: two fixtures, baseline/GPC, manual choice, bounded Reject cleanup and residual activity. No network calls.');
