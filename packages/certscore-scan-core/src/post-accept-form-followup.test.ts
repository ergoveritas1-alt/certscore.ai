import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {runPostAcceptObserver} from './post-accept-observer';
import {isPendingFormBootstrap} from './post-accept-form-load';

test('form-only follow-up captures late frames without extending activity evidence', async t => {
 const server=createServer((req,res)=>{
  res.setHeader('content-type','text/html');
  if(req.url==='/form'){res.end('<form><label>Email<input type="email" name="email"></label></form>');return;}
  if(req.url==='/late'){res.end('ok');return;}
  res.end(`<section role="dialog"><p>Choose cookie consent</p><button onclick="localStorage.setItem('choice','granted');this.parentElement.hidden=true;fetch('https://js-eu1.hsforms.net/forms/embed/v2.js');setTimeout(()=>{fetch('/late');for(let i=0;i<2;i++){let f=document.createElement('iframe');f.src='/form';document.body.appendChild(f)}},800)">Accept all</button></section>`);
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});const original=browser.newContext.bind(browser);
 t.mock.method(browser,'newContext',async(...args:Parameters<typeof browser.newContext>)=>{const c=await original(...args);await c.route('https://js-eu1.hsforms.net/**',r=>r.fulfill({contentType:'text/javascript',body:''}));return c});
 try{
  const packet=await runPostAcceptObserver({browser,url:`http://127.0.0.1:${address.port}/`,scanId:'tail:accept',parentScanId:'tail',
    recipe:{artifactVersion:'certscore.post_accept_action_recipe.v1',recipeId:'owned-tail',controlSelector:'button',confirmation:{kind:'local_storage_equals',key:'choice',expectedValue:'granted'}},
    actionSearchTimeoutMs:1000,confirmationTimeoutMs:500,observationWindowMs:500,resultBudgetMs:8000,
    interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}});
  assert.equal(packet.acceptanceRegistration.status,'confirmed');
  assert.equal(packet.formCapture?.version,'post_accept_form_capture.v4');
  assert.equal(packet.formCapture?.frames.reduce((n,f)=>n+f.forms.length,0),2);
  assert.ok(packet.formCapture!.window!.endedAtMs>packet.formCapture!.followup!.originalWindowEndedAtMs);
  assert.ok(packet.formCapture!.window!.endedAtMs<=packet.formCapture!.followup!.workerDeadlineAtMs);
  assert.equal(packet.observationWindowMs,500);
  assert.ok(!packet.network.requests.some(r=>r.sanitizedUrl.endsWith('/late')));
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('form bootstrap hints require exact approved endpoints',()=>{
 assert.equal(isPendingFormBootstrap('https://js-eu1.hsforms.net/forms/embed/v2.js'),true);
 for(const url of ['https://js-eu1.hsforms.net.evil.test/forms/embed/v2.js','http://js-eu1.hsforms.net/forms/embed/v2.js','https://js-eu1.hsforms.net/arbitrary','garbage'])assert.equal(isPendingFormBootstrap(url),false);
});
