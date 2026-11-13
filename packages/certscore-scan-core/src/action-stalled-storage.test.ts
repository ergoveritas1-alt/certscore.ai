import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';
for(const action of ['accept','reject'] as const) for (const failure of (action==='accept'?['storage','baseline','context','setup','cleanup','priming']:['storage','baseline','context','setup','cleanup']) as const) test(`${action}: stalled ${failure} cannot outlive the result budget or click later`,async()=>{
 let clicks=0, injected=false, storageReadCompleted=false, lateContextClosed=false, moves=0;
 const server=createServer((req,res)=>{if(req.url==='/clicked'){clicks++;res.end('ok');return;}res.setHeader('content-type','text/html');res.end(`<section id="banner" role="dialog" aria-label="Cookie consent"><p>Choose optional cookies</p><button id="choice" onclick="fetch('/clicked')">${action==='accept'?'Accept all':'Reject all'}</button></section>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${(server.address() as any).port}/`;
 const browser=await chromium.launch({headless:true}),newContext=browser.newContext.bind(browser);
 let release:()=>void=()=>{};
 const stalled=new Promise<void>(r=>{release=r;});
 browser.newContext=async options=>{
  const context=await newContext(options),newPage=context.newPage.bind(context),close=context.close.bind(context);
  context.close=async()=>{lateContextClosed=true;if(failure==='cleanup'){injected=true;await stalled;}return close();};
  if(failure==='context'){injected=true;await stalled;return context;}
  context.newPage=async()=>{
   const page=await newPage(),evaluate=page.evaluate.bind(page),addInitScript=page.addInitScript.bind(page);
   const move=page.mouse.move.bind(page.mouse);page.mouse.move=async(...args)=>{moves++;return move(...args);};
   page.addInitScript=(async(...args:any[])=>{if(failure==='setup'){injected=true;await stalled;}return (addInitScript as any)(...args);}) as typeof page.addInitScript;
   await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());
   page.evaluate=(async(fn:any,arg:any)=>{
    const source=String(fn),storage=source.includes('Object.entries(window.localStorage)');
    if(failure==='priming'&&source.includes('Array.from(document.scripts)')&&source.includes('RocketLazyLoadScripts')){injected=true;await stalled;return true;}
    if(failure==='storage'&&storage || failure==='baseline'&&storageReadCompleted&&source.includes('__certscoreReadPost')&&!source.includes('defineProperty')){injected=true;await stalled;}
    const value=await evaluate(fn,arg);if(storage)storageReadCompleted=true;return value;
   }) as typeof page.evaluate;
   return page;
  };return context;
 };
 const watchdog=setTimeout(release,3500);
 try {
  const common={browser,url,scanId:`stalled-${action}`,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},resultBudgetMs:1400,actionSearchTimeoutMs:500,confirmationTimeoutMs:50,observationWindowMs:50};
  const recipe={recipeId:'stalled-read',resolverMethod:'local_fixture_recipe' as const,controlSelector:'#choice',bannerSelector:'#banner',confirmation:{kind:'local_storage_equals' as const,key:'consent',expectedValue:'never'}};
  const start=Date.now();
  const packet=action==='accept'?await runPostAcceptObserver({...common,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}}):await runPostRefusalObserver({...common,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
  assert.ok(injected,'exercise actual baseline storage read');
  assert.ok(Date.now()-start<2300,'must return without waiting for stalled browser read');
  assert.equal(packet.interactionDiagnostics?.click.outcome,['cleanup','priming'].includes(failure)?'completed':'not_attempted');
  if(!['cleanup','priming'].includes(failure))assert.equal(packet.cancellation.requested,true);
  release();await new Promise(r=>setTimeout(r,100));assert.equal(clicks,['cleanup','priming'].includes(failure)?1:0);
  if(failure==='priming')assert.equal(moves,0,'late optional probe must never move the pointer');
  if(failure==='context')assert.equal(lateContextClosed,true,'late acquired context must be closed');
 }finally{clearTimeout(watchdog);release();await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
