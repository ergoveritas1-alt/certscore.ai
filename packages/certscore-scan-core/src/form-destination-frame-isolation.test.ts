import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { chromiumLaunchOptions } from './playwright-runtime';
import { createArtifactWriter } from './artifact-writer';
import { preConsentRuntimeScanner } from './scanners/pre-consent-runtime-scanner';

test('passive form trace excludes child-frame requests without dropping normal network evidence', {timeout:30000},async()=>{
  const server=createServer((request,response)=>{
    if(request.url?.startsWith('/main')||request.url==='/child'||request.url==='/child2') {response.writeHead(200,{'content-type':'text/plain'});response.end('ok');return;}
    response.setHeader('content-type','text/html');
    if(request.url==='/embed') {response.end('<!doctype html><title>Child</title><script>fetch("/child").then(()=>location.replace("/embed2"))</script>');return;}
    if(request.url==='/embed2') {response.end('<!doctype html><title>Replacement child</title><script>fetch("/child2")</script>');return;}
    response.end(`<!doctype html><title>Local frame fixture</title><h1>Frame fixture</h1>
      <form><label>Email <input type="email" name="email" value="person@example.test"></label></form>
      <script>addEventListener('load',async()=>{
        // Synthetic native-listener fixture only: no fill, click or submission.
        document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
        await new Promise(resolve=>setTimeout(resolve,60));
        await fetch('/main?email=person%40example.test');
        const frame=document.createElement('iframe');frame.src='/embed';document.body.append(frame);
      });</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/`;
  const root=await mkdtemp(path.join(tmpdir(),'certscore-form-frame-'));
  const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
  try {
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:10000,
      artifactWriter:await createArtifactWriter(root),browser,captureScope:'runtime_evidence',screenshotMode:'never',waitMode:'fast'});
    const trace=result.formDestinationTrace;assert.ok(trace);
    assert.equal(trace.events.length,1,'synthetic main-document event must reach the passive binding');
    const main=result.networkEvents.find(row=>row.requestUrl.startsWith(url+'main?'));
    const child=result.networkEvents.find(row=>row.requestUrl===url+'child');
    assert.ok(main&&child,'both frame requests remain in ordinary network evidence');
    assert.equal(child.isSubFrame,true);
    assert.equal(result.networkEvents.find(row=>row.requestUrl===url+'child2')?.isSubFrame,true,'replacement child document remains ordinary network evidence only');
    const matched=trace.requests.find(row=>row.networkRequestId===main.requestId);
    assert.ok(trace.requests.every(row=>result.networkEvents.find(n=>n.requestId===row.networkRequestId)?.isMainFrame===true),JSON.stringify(trace));
    assert.equal(matched?.matches.length,1);assert.equal(matched?.status,'response_observed',JSON.stringify({trace,responses:result.networkResponseEvents.map(r=>({requestId:r.requestId,status:r.status}))}));
    assert.doesNotMatch(JSON.stringify(trace),/person@example|person%40example/);
  }finally{
    await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(root,{recursive:true,force:true});
  }
});
