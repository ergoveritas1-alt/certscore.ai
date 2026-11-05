import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from '../packages/certscore-scan-core/src/post-accept-observer';
import {projectPostAcceptEvidenceForReport,postAcceptEvidencePacketSchema} from '@certscore/contracts';
import {projectPostAcceptForms} from '../apps/web/lib/scans/post-accept-form-projection';
import {verifiedPostAcceptFormSnapshotForRow} from '../apps/web/server/scans/form-snapshot-evidence';
import {observedControlAssessment} from '../apps/web/lib/scans/test-fixtures/observed-control-assessment';

for(const safeForDisplay of [true,false]) test(`late forms reach report with ${safeForDisplay?'verified images':'safety withholding preserved'}`,async t=>{
 let submissions=0;
 const server=createServer((req,res)=>{
  if(req.method==='POST')submissions++;
  res.setHeader('content-type','text/html');
  if(req.url==='/helper'){res.end('<p>helper</p>');return;}
  res.end(`<style>form{display:block;margin:24px;padding:16px;width:420px;border:1px solid #aaa}input{display:block}iframe{display:none}</style>
   <section role="dialog"><p>We use cookies</p><button id="accept">Accept all</button></section>
   <iframe src="/helper"></iframe><iframe src="/helper"></iframe><iframe src="/helper"></iframe><iframe src="/helper"></iframe>
   <script>
   // Owned reproduction of RocketLazyLoadScripts / rocket-allScriptsLoaded.
   let movements=0,ready=false;
   addEventListener('mousemove',()=>{if(++movements===2)setTimeout(()=>{ready=true;dispatchEvent(new Event('rocket-allScriptsLoaded'))},120)});
   document.addEventListener('click',e=>{if(!ready)e.stopImmediatePropagation()},true);
   document.querySelector('button').onclick=()=>{localStorage.setItem('choice','granted');document.querySelector('section').remove();
    setTimeout(()=>fetch('https://js-eu1.hsforms.net/forms/embed/v2.js'),430);
    setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form action="/submit" method="post" aria-label="Contact"><label>Name<input name="name" value="private-fixture-value"></label><label>Email<input type="email" name="email"></label></form>'),800);
    setTimeout(()=>document.body.insertAdjacentHTML('beforeend','<form action="/submit" method="post" aria-label="Newsletter"><label>Email<input type="email" name="email"></label></form>'),1450);
   };</script>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});const original=browser.newContext.bind(browser);
 t.mock.method(browser,'newContext',async(...args:Parameters<typeof browser.newContext>)=>{const c=await original(...args);await c.route('https://js-eu1.hsforms.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));return c});
 try{
  const packet=await runPostAcceptObserver({browser,url:`http://127.0.0.1:${address.port}/`,scanId:'scan-1:accept',parentScanId:'scan-1',
   recipe:{artifactVersion:'certscore.post_accept_action_recipe.v1',recipeId:'owned-deferred-forms',cmpId:'Borlabs Cookie',controlSelector:'#accept',confirmation:{kind:'local_storage_equals',key:'choice',expectedValue:'granted'}},
   actionSearchTimeoutMs:2000,confirmationTimeoutMs:500,observationWindowMs:500,resultBudgetMs:9000,
   formSnapshotReviewer:async()=>({safeForDisplay}),interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}});
  assert.equal(packet.acceptanceRegistration.status,'confirmed');
  assert.equal(packet.formCapture?.frames.flatMap(x=>x.forms).length,2);
  assert.equal(packet.formSnapshotCapture?.contractVersion,'certscore.post_accept_form_snapshots.v8');
  assert.equal(packet.formImageDiagnostics?.outcome,'completed');
  assert.equal(packet.formImageDiagnostics?.observedForms,2);
  assert.equal(packet.formImageDiagnostics?.[safeForDisplay ? 'availableImages' : 'withheldImages'],2);
  assert.equal(submissions,0);assert.ok(!JSON.stringify(packet).includes('private-fixture-value'));
  const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:createHash('sha256').update(JSON.stringify(packet)).digest('hex')});
  const rows=projectPostAcceptForms({consentControlAssessment:observedControlAssessment,postAcceptEvidenceProjection:projection}).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.form.fields.length),[2,1]);
  for(const row of rows){assert.equal(row.snapshot.status,safeForDisplay?'available':'withheld');
   const bytes=verifiedPostAcceptFormSnapshotForRow(packet,row);assert.equal(Boolean(bytes),safeForDisplay);if(bytes)assert.ok(bytes.length>100);}
  assert.ok(!JSON.stringify(projection).includes('"data":'));
  const images=packet.formSnapshotCapture!;assert.equal(postAcceptEvidencePacketSchema.safeParse({...packet,formSnapshotCapture:{...images,followup:{...(images as any).followup,triggerRequestId:'unbound'}}}).success,false);
  assert.equal(postAcceptEvidencePacketSchema.safeParse({...packet,formSnapshotCapture:{...images,followup:{...(images as any).followup,captureDeadlineAtMs:999999}}}).success,false);
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
