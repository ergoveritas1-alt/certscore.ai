import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {CONSENT_ACCEPT_POST_CLICK_REQUEST_LIMIT,projectPostAcceptEvidenceForReport} from '@certscore/contracts';
import {runPostAcceptObserver} from './post-accept-observer';
import {buildCanonicalPostAcceptActionRecipes} from './post-accept-cmp-recipes';

for(const overflowInsideWindow of [false,true]) test(`unconfirmed Accept freezes terminal evidence and preserves ${overflowInsideWindow?'genuine in-window truncation':'complete in-window capture'}`,async(t)=>{
 let clicks=0,lateRequests=0;
 const server=createServer((req,res)=>{
  if(req.url==='/click'){clicks++;res.writeHead(204).end();return;}
  if(req.url?.startsWith('/inside/')){res.writeHead(204).end();return;}
  if(req.url?.startsWith('/late/')){lateRequests++;res.writeHead(204).end();return;}
  if(req.url!=='/'){res.writeHead(404).end();return;}
  res.setHeader('content-type','text/html');res.end(`<section role="dialog"><p>We use cookies. Choose your cookie consent.</p><button onclick="fetch('/click');${overflowInsideWindow?`for(let i=0;i<${CONSENT_ACCEPT_POST_CLICK_REQUEST_LIMIT+18};i++)fetch('/inside/'+i);`:''}this.parentElement.hidden=true">Accept all</button></section>`);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 const browser=await chromium.launch({headless:true});const newContext=browser.newContext.bind(browser);let injected=false;
 t.mock.method(browser,'newContext',async(...args:Parameters<typeof browser.newContext>)=>{
  const context=await newContext(...args);const newPage=context.newPage.bind(context);
  t.mock.method(context,'newPage',async()=>{
   const page=await newPage(),evaluate=page.evaluate.bind(page);let storageReads=0;
   t.mock.method(page,'evaluate',async(fn:any,arg:any)=>{
    if(String(fn).includes('Object.entries(window.localStorage)')&&++storageReads===2){
     // This is terminal readback after the original dispatch-relative window.
     // All traffic is loopback, and real requests still reach the server.
     await evaluate(async count=>{await Promise.all(Array.from({length:count},(_,i)=>fetch('/late/'+i)));localStorage.setItem('late_unconfirmed_write','fixture');},CONSENT_ACCEPT_POST_CLICK_REQUEST_LIMIT+18);
     injected=true;
    }
    return evaluate(fn,arg);
   });return page;
  });return context;
 });
 try {
  const recipes=buildCanonicalPostAcceptActionRecipes();
  const packet=await runPostAcceptObserver({browser,url:`http://127.0.0.1:${address.port}/`,scanId:'unconfirmed-freeze:accept',parentScanId:'unconfirmed-freeze',recipe:recipes[0]!,recipeCandidates:recipes,allowCanonicalAcceptDiscovery:true,recipeSetId:'canonical-consent-control-accept-v6',actionSearchTimeoutMs:1500,confirmationTimeoutMs:50,observationWindowMs:1000,interactionAuthorization:{kind:'loopback',authorizationId:'loopback_local_lab'}});
  assert.equal(clicks,1);assert.equal(injected,true);assert.equal(lateRequests,CONSENT_ACCEPT_POST_CLICK_REQUEST_LIMIT+18);
  assert.equal(packet.acceptanceRegistration.status,'unconfirmed');assert.equal((packet.captureCoverage?.requestsDroppedAfterAction??0)>0,overflowInsideWindow);
  assert.ok(!packet.network.requests.some(row=>row.sanitizedUrl.includes('/late/')));
  assert.ok(!packet.afterActionCapture?.storageWrites.some(row=>row.name==='late_unconfirmed_write'));
  assert.ok(packet.network.requests.some(row=>row.sanitizedUrl.endsWith('/click')));
  const projection=projectPostAcceptEvidenceForReport({packet,packetSha256:createHash('sha256').update(JSON.stringify(packet)).digest('hex')});
  assert.equal(projection.execution?.status,overflowInsideWindow?'limited':'succeeded');assert.equal(projection.execution?.consentConfirmed,false);
 }finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
