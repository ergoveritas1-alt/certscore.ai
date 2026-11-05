import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from '../packages/certscore-scan-core/src/post-accept-observer';

// Reproduce the retained SITS timing using only an owned page/script. No public
// requests, previous-session state, additional activity window or form submission.
for(const loaderMs of [6447,12000])test(`owned slow form loader ${loaderMs}ms respects the original worker ceiling`,async t=>{
 let submissions=0,publicRequests=0;
 const server=createServer(async(req,res)=>{
  if(req.method==='POST')submissions++;
  if(req.url==='/definition'){res.setHeader('content-type','application/json');res.end('{}');return;}
  // Spend the early budget before the click, as in the late-action SITS run.
  await delay(10000);if(res.destroyed)return;
  res.setHeader('content-type','text/html');res.end(`<style>form{display:block;width:420px;padding:16px;margin:20px;border:1px solid #aaa}input{display:block}</style><section role="dialog"><p>Cookie consent</p><button id="accept" onclick="localStorage.setItem('choice','granted');this.parentElement.remove();const s=document.createElement('script');s.src='https://js-eu1.hsforms.net/forms/embed/v2.js';document.head.appendChild(s)">Accept all</button></section>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});const original=browser.newContext.bind(browser);
 t.mock.method(browser,'newContext',async(...args:Parameters<typeof browser.newContext>)=>{
  const context=await original(...args);await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'){await route.fallback();return;}
   if(url.href==='https://js-eu1.hsforms.net/forms/embed/v2.js'){
    await delay(loaderMs);await route.fulfill({contentType:'text/javascript',body:`for(let i=0;i<2;i++)setTimeout(()=>{fetch('/definition');document.body.insertAdjacentHTML('beforeend','<form action="/submit" method="post"><label>Email<input type="email" name="email" value="private-fixture-value"></label></form>')},1700+i*400);`}).catch(()=>undefined);return;
   }
   publicRequests++;await route.abort();
  });return context;
 });
 try{
  const packet=await runPostAcceptObserver({browser,url:`http://127.0.0.1:${address.port}/`,scanId:'owned-slow-loader:accept',parentScanId:'owned-slow-loader',
   recipe:{artifactVersion:'certscore.post_accept_action_recipe.v1',recipeId:'owned-slow-loader',controlSelector:'#accept',confirmation:{kind:'local_storage_equals',key:'choice',expectedValue:'granted'}},
   actionSearchTimeoutMs:2000,confirmationTimeoutMs:500,observationWindowMs:3000,resultBudgetMs:20000,
   formSnapshotReviewer:async()=>({safeForDisplay:true}),interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}});
  const forms=packet.formCapture?.frames.flatMap(frame=>frame.forms)??[];
  const summary={loaderMs,accept:packet.acceptanceRegistration.status,dispatch:packet.acceptanceRegistration.actionDispatchedAtMs,forms:forms.length,images:packet.formImageDiagnostics,formWindow:packet.formCapture?.window,activity:packet.timing.observationMs,total:packet.timing.totalMs};
  t.diagnostic(JSON.stringify(summary));
  assert.equal(packet.acceptanceRegistration.status,'confirmed');assert.equal(publicRequests,0);assert.equal(submissions,0);
  assert.equal(packet.observationWindowMs,3000);assert.ok(packet.timing.observationMs!<3500,'form wait must not extend activity evidence');
  assert.ok(packet.timing.totalMs!<21000,'retain the original 20s worker plus bounded cleanup');
  assert.ok(!packet.network.requests.some(row=>row.sanitizedUrl.endsWith('/definition')));
  assert.ok(!JSON.stringify(packet).includes('private-fixture-value'));
  if(loaderMs===6447){
   assert.equal(forms.length,2);
   const imageCounts=packet.formImageDiagnostics!;
   assert.ok(imageCounts.availableImages>=1);
   assert.equal(imageCounts.availableImages+imageCounts.unavailableImages,2,'every observed form has an image or an explicit unavailable receipt');
   const capture=packet.formSnapshotCapture;
   assert.ok(capture?.contractVersion==='certscore.post_accept_form_snapshots.v8');
   const unavailable=capture.postCaptureSnapshots.snapshots.filter(row=>row.status==='unavailable');
   for(const row of unavailable){assert.equal(row.reason,'capture_budget_exhausted');assert.equal(row.data,undefined);}
  }
  else{assert.equal(forms.length,0);assert.equal(packet.formImageDiagnostics?.outcome,'no_form_observed');}
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
