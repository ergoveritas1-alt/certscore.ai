import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer';
import {runPostRefusalObserver} from './post-refusal-observer';
const fixtures=JSON.parse(readFileSync(new URL('../../certscore-contracts/fixtures/retained-no-first-layer-actions-20261113.json',import.meta.url),'utf8'));

for(const fixture of fixtures) for(const action of ['accept','reject'] as const) for(const lateControl of [false,true]) {
 test(`${fixture.host} ${action}: ${lateControl?'genuine control becomes actionable':'no first-layer action must not click privacy or dismissal'}`,async()=>{
  const observation=fixture.bundle.consentUiObservations.at(-1);
  assert.equal(observation.acceptControlObserved,false);
  assert.equal(observation.rejectControlObserved,false);
  const archon=fixture.host==='archonph.com';
  if(archon)assert.deepEqual(observation.controls.map((c:{actionType:string})=>c.actionType),['do_not_sell_share','other']);
  else assert.equal(observation.inventoryOutcome,'complete_empty');
  let wrongClicks=0,choiceClicks=0;
  // Minimal semantic reconstruction from retained labels/context, not original HTML.
  const server=createServer((req,res)=>{
   if(req.url==='/wrong'){wrongClicks++;res.end('ok');return;}
   if(req.url==='/choice'){choiceClicks++;res.end('ok');return;}
   if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
   res.setHeader('content-type','text/html');
   res.end(`<main><h1>Public website</h1><a href="/wrong">Privacy</a></main>${archon?`<section id="aphnb" role="region" aria-label="Privacy notice"><p>This site uses analytics and ad-measurement tags (Google, Microsoft, LinkedIn) to see how it performs.</p><a id="aphnb-pc" href="#" onclick="fetch('/wrong');return false">Privacy choices</a><button id="aphnb-x" aria-label="Dismiss" onclick="fetch('/wrong')">×</button></section>`:''}
    <script>${lateControl?`setTimeout(()=>{const el=document.createElement('section');el.id='cookie-banner';el.setAttribute('role','dialog');el.setAttribute('aria-label','Cookie consent');el.innerHTML='<p>Choose whether to allow optional analytics cookies.</p><button id="choice">${action==='accept'?'Accept all':'Reject all'}</button>';document.body.append(el);document.getElementById('choice').onclick=()=>{localStorage.setItem('consent','${action}');fetch('/choice');};},500);`:''}</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/`;
  const browser=await chromium.launch({headless:true});
  const original=browser.newContext.bind(browser);
  browser.newContext=async options=>{const context=await original(options);await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(url).origin?route.continue():route.abort());return context;};
  try{
   const common={browser,url,scanId:`no-first-layer-${action}`,interactionAuthorization:{kind:'loopback' as const,authorizationId:'loopback_local_lab'},
    actionSearchTimeoutMs:1500,confirmationTimeoutMs:100,observationWindowMs:100,productionProjectable:false};
   const recipe={recipeId:'local-genuine-control',resolverMethod:'owned_site_recipe' as const,controlSelector:'#choice',bannerSelector:'#cookie-banner',confirmation:{kind:'local_storage_equals' as const,key:'consent',expectedValue:action}};
   const packet=action==='accept'?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_accept_action_recipe.v1'}}):await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,recipe:{...recipe,artifactVersion:'certscore.post_refusal_action_recipe.v1'}});
   assert.equal(wrongClicks,0,'settings, privacy links and dismissal are not Accept/Reject');
   assert.equal(choiceClicks,lateControl?1:0);
   assert.equal(packet.interactionDiagnostics?.click.outcome,lateControl?'completed':'not_attempted');
   const registration='acceptanceRegistration' in packet?packet.acceptanceRegistration:packet.refusalRegistration;
   if(lateControl){
    if(action==='accept')assert.equal(registration.status,'confirmed');
    else {assert.equal(packet.afterActionCapture?.activationStatus,'completed');assert.equal(registration.status,'unconfirmed');assert.ok(packet.confirmationDiagnostics?.reasons.includes('no_registered_complete_decision'));}
   }
   else {assert.equal(registration.status,'not_attempted');assert.equal(packet.resolver.found,false);}
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
}
