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
  assert.equal(requests.length,n===2&&gpc?4:5);
  assert.equal(requests.some(url=>new URL(url).hostname==='www.facebook.com'),true);
  assert.ok(requests.every(url=>!url.includes('ud%5Bem%5D')&&!url.includes('hem=')),'No real or hashed personal details');
  assert.equal(requests.some(url=>new URL(url).hostname==='ct.pinterest.com'),n===1||!gpc);
  const before=requests.length;
  listeners.get('onetrust-reject-all-handler:click')();
  while(timers.length)timers.shift()();
  assert.equal(requests.length-before,n===1?1:2);
  assert.equal(cookies.has(n===1?'_fbp':'_fbc'),false);
  assert.equal(cookies.has(n===1?'_clck':'_clsk'),n===2);
  assert.equal(get('onetrust-banner-sdk').hidden,true);
  assert.equal(local.get(`certscore_test${n}_consent_state`),'denied');
  assert.equal(session.size,0);
  assert.ok(html.includes('noindex, nofollow, noarchive'));
}
console.log('Passed: two fixtures, baseline/GPC, manual choice, bounded Reject cleanup and residual activity. No network calls.');
