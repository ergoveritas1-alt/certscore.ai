import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer";
import { runPostRefusalObserver } from "./post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes";

for (const action of ["accept","reject"] as const) for(const mode of ["visible","delayed","covered","duplicate","disabled","wrong_label","marker_only","initialization_only","unregistered","no_runtime"] as const)
 test(`OneTrust ${action}: loading ${mode} preserves registered control and semantic guards`,async()=>{
  let clicks=0,clickState:string|undefined;const timers=new Set<ReturnType<typeof setTimeout>>();
  const server=createServer((request,response)=>{
    if(request.url?.startsWith('/click')){clicks++;clickState=new URL(request.url,'http://fixture').searchParams.get('state')??undefined;response.writeHead(204).end();return;}
    if(request.url==='/otSDKStub.js'){response.setHeader('content-type','text/javascript');response.end('');return;}
    if(request.url==='/parser-block.js'){const timer=setTimeout(()=>{timers.delete(timer);response.end('');},2500);timers.add(timer);return;}
    response.setHeader('content-type','text/html');response.end(`<!doctype html><html><body>
      ${mode==='no_runtime'?'':'<script src="/otSDKStub.js"></script>'}<section id="onetrust-banner-sdk" ${mode==='delayed'?'hidden':''} style="position:fixed;top:10px;background:white;padding:20px">
      <p>Choose optional analytics cookies.</p>${mode==='marker_only'||mode==='initialization_only'?'':Array.from({length:mode==='duplicate'?2:1},()=>`<button ${mode==='disabled'?'disabled':''} id="onetrust-${action==='accept'?'accept-btn':'reject-all'}-handler">${mode==='wrong_label'?'Privacy policy':action==='accept'?'Accept all':'Reject all'}</button>`).join('')}</section>
      ${mode==='covered'?'<div style="position:fixed;inset:0;background:white;z-index:9999">Overlay</div>':''}
      <script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
      document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
      if(document.querySelector('button'))document.querySelector('button').onclick=()=>{fetch('/click?state='+document.readyState);document.cookie='OptanonConsent=groups=C0001:1,C0002:${action==='accept'?1:0}&receipt=after;path=/';document.querySelector('section').hidden=true;};</script>
      ${mode==='delayed'?"<script>setTimeout(()=>{document.querySelector('section').hidden=false;window.dispatchEvent(new CustomEvent('OneTrustGroupsUpdated'));},150);</script>":''}
      ${mode==='initialization_only'?"<script>setTimeout(()=>window.dispatchEvent(new CustomEvent('OneTrustGroupsUpdated',{detail:['C0001','C0002']})),150);</script>":''}
      <script src="/parser-block.js"></script></body></html>`);
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
  try{
    const common={url:`http://127.0.0.1:${addr.port}/`,scanId:`onetrust-loading-${action}`,interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'} as const,
      actionSearchTimeoutMs:1000,resultBudgetMs:5000,confirmationTimeoutMs:200,observationWindowMs:100};
    let recipes=action==='accept'?buildCanonicalPostAcceptActionRecipes():buildCanonicalPostRefusalActionRecipes();
    if(mode==='unregistered')recipes=recipes.map(recipe=>recipe.cmpId==='OneTrust'?{...recipe,recipeId:'unregistered-lookalike'}:recipe);
    const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:recipes[0]!,recipeCandidates:recipes,allowCanonicalAcceptDiscovery:true})
      :await runPostRefusalObserver({...common,recipe:recipes[0]!,recipeCandidates:recipes,recipeSetId:"onetrust-loading-regression",allowCanonicalRejectDiscovery:true});
    const positive=mode==='visible'||mode==='delayed';
    assert.equal(clicks,positive?1:0,JSON.stringify({resolver:packet.resolver,diagnostics:packet.interactionDiagnostics}));if(positive)assert.equal(clickState,'loading');
    const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;
    if(positive){assert.equal(registration.status,'confirmed');assert.equal(packet.decisionEvidence?.decision,action==='accept'?'granted':'denied');}
    else{assert.notEqual(registration.status,'confirmed');assert.equal(packet.decisionEvidence?.decision,'unknown');}
  }finally{for(const timer of timers)clearTimeout(timer);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});


test("OneTrust Reject: late runtime with busy geometry preserves the existing verified fallback",async()=>{
  let clicks=0;const server=createServer((request,response)=>{
    if(request.url==='/otSDKStub.js'){response.setHeader('content-type','text/javascript');response.end('');return;}
    if(request.url==='/click'){clicks++;response.writeHead(204).end();return;}
    response.setHeader('content-type','text/html');response.end(`<!doctype html><body><main>Local fixture</main><script>
      setTimeout(()=>{const runtime=document.createElement('script');runtime.src='/otSDKStub.js';document.head.appendChild(runtime);
        document.body.insertAdjacentHTML('beforeend','<section id="onetrust-banner-sdk" style="position:fixed;top:0;background:white;padding:20px"><p>Choose optional analytics cookies.</p><button id="onetrust-reject-all-handler">Reject all</button></section>');
        window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
        document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
        document.querySelector('button').onclick=()=>{fetch('/click');document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=after;path=/';document.querySelector('section').hidden=true;};
      },200);</script>`);
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
  const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await newContext(options),newPage=context.newPage.bind(context);
    context.newPage=async()=>{const page=await newPage(),frame=page.mainFrame(),evaluate=frame.evaluate.bind(frame),locator=frame.locator.bind(frame);
      frame.evaluate=(async(...args:Parameters<typeof evaluate>)=>{
        if(String(args[0]).includes('registrySelectors')){await new Promise(r=>setTimeout(r,1100));throw Error('bounded geometry unavailable');}
        return evaluate(...args);
      }) as typeof frame.evaluate;
      frame.locator=(...args:Parameters<typeof locator>)=>{const loc=locator(...args),count=loc.count.bind(loc);
        if(!String(args[0]).includes('onetrust'))loc.count=async()=>{await new Promise(r=>setTimeout(r,260));return count();};return loc;};
      return page;};return context;};
  try{
    const recipes=buildCanonicalPostRefusalActionRecipes();
    const packet=await runPostRefusalObserver({browser,url:`http://127.0.0.1:${addr.port}/`,scanId:'late-runtime-routing',
      interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'},recipe:recipes[0]!,recipeCandidates:recipes,
      recipeSetId:'late-runtime-routing',allowCanonicalRejectDiscovery:true,actionSearchTimeoutMs:1600,confirmationTimeoutMs:200,observationWindowMs:100,resultBudgetMs:5000});
    assert.equal(clicks,1,JSON.stringify(packet.interactionDiagnostics));assert.equal(packet.refusalRegistration.status,'confirmed');assert.equal(packet.resolver.cmpId,'OneTrust');
  }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
