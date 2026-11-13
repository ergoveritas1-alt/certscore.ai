import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium, type Locator} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer.js';
import {runPostRefusalObserver} from './post-refusal-observer.js';
import {buildCanonicalPostAcceptActionRecipes} from './post-accept-cmp-recipes.js';
import {buildCanonicalPostRefusalActionRecipes} from './post-refusal-cmp-recipes.js';

// Sanity's retained diagnostics show scope ambiguity followed by a fresh
// candidate and exhausted binding time. This reconstructed hydration fixture
// isolates a possible stale-scope read; it is not the original action DOM.
for (const action of ['accept','reject'] as const) for (const mode of ['same-choice','opposite-choice'] as const) {
 test(`${action}: ${mode} hydration cannot auto-wait on an obsolete consent scope`, async t => {
  let clicks=0, replaced=false;
  const server=createServer((req,res)=>{
   if(req.url==='/clicked'){clicks++;res.end('ok');return;}
   res.setHeader('content-type','text/html');res.end(`<style>section{position:fixed;top:20px;left:20px;background:white;padding:20px}button{padding:12px}</style>
    <section id="original-cookie-banner" role="dialog" aria-label="Cookie consent"><p>Choose optional analytics cookies</p><button onclick="fetch('/clicked')">${action==='accept'?'Accept all':'Reject all'}</button></section>`);
  });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
   const context=await newContext(options),newPage=context.newPage.bind(context);
   await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
   context.newPage=async()=>{
    const page=await newPage(),prototype=Object.getPrototypeOf(page.locator('section')),evaluate=prototype.evaluate;
    t.mock.method(prototype,'evaluate',async function(this:Locator,...args:Parameters<Locator['evaluate']>){
     if(!replaced&&String(args[0]).includes('let transparent')){
      replaced=true;
      await page.evaluate(({action,mode})=>{const old=document.querySelector('section')!;const fresh=old.cloneNode(true) as HTMLElement;
       fresh.id='hydrated-cookie-banner';if(mode==='opposite-choice')fresh.querySelector('button')!.textContent=action==='accept'?'Reject all':'Accept all';old.replaceWith(fresh);
      },{action,mode});
     }
     return evaluate.apply(this,args);
    });return page;
   };return context;
  };
  try{
   const address=server.address();assert.ok(address&&typeof address!=='string');
   const common={browser,url:`http://127.0.0.1:${address.port}/`,scanId:`scope-${action}-${mode}`,interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'} as const,
    actionSearchTimeoutMs:2000,resultBudgetMs:4500,confirmationTimeoutMs:100,observationWindowMs:100};
   const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:buildCanonicalPostAcceptActionRecipes()[0]!,allowCanonicalAcceptDiscovery:true}):
    await runPostRefusalObserver({...common,recipe:buildCanonicalPostRefusalActionRecipes()[0]!,allowCanonicalRejectDiscovery:true});
   assert.equal(replaced,true,'fixture must replace the exact scope between count and read');
   assert.equal(clicks,mode==='same-choice'?1:0,JSON.stringify(packet.interactionDiagnostics));
   if(mode==='same-choice')assert.equal(packet.afterActionCapture?.activationStatus,'completed');
   assert.ok(packet.timing.totalMs<4500);
  }finally{t.mock.restoreAll();await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}

for (const action of ['accept','reject'] as const) for (const mode of ['overlapping','competing'] as const) {
 test(`${action}: duplicate Osano scopes ${mode} preserve actionable uniqueness`, async()=>{
  const clicks:string[]=[];
  const choice=action==='accept'?'AKZEPTIEREN':'Ablehnen',cls=action==='accept'?'osano-cm-accept':'osano-cm-deny-all';
  const banner=(id:string)=>`<div class="osano-cm-window" role="dialog"><p>We use optional cookies</p><div class="osano-cm-dialog__buttons"><button class="${cls} osano-cm-buttons__button" onclick="fetch('/clicked/${id}')">${choice}</button></div></div>`;
  const server=createServer((req,res)=>{if(req.url?.startsWith('/clicked/')){clicks.push(req.url.split('/').pop()!);res.end('ok');return;}
   res.setHeader('content-type','text/html');res.end(`<style>.osano-cm-window{position:fixed;top:20px;left:20px;background:white;padding:20px}button{padding:12px}${mode==='competing'?'body>div:nth-child(2) .osano-cm-window{left:450px}':''}</style><div id="original">${banner('covered')}</div><div>${banner('top')}</div>`);
  });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await newContext(options);await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());return context;};
  try{const address=server.address();assert.ok(address&&typeof address!=='string');
   const common={browser,url:`http://127.0.0.1:${address.port}/`,scanId:`duplicates-${action}-${mode}`,recipeSetId:'local-duplicate-scope-fixture',interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'} as const,actionSearchTimeoutMs:2000,resultBudgetMs:4500,confirmationTimeoutMs:100,observationWindowMs:100};
   const a=buildCanonicalPostAcceptActionRecipes(),r=buildCanonicalPostRefusalActionRecipes();
   const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:a[0]!,recipeCandidates:a,allowCanonicalAcceptDiscovery:true}):await runPostRefusalObserver({...common,recipe:r[0]!,recipeCandidates:r,allowCanonicalRejectDiscovery:true});
   assert.deepEqual(clicks,mode==='overlapping'?['top']:[],JSON.stringify(packet.interactionDiagnostics));
   if(mode==='overlapping')assert.equal(packet.afterActionCapture?.activationStatus,'completed');
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 });
}
