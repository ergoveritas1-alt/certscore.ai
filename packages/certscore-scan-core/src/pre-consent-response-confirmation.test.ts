import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createArtifactWriter} from './artifact-writer';
import {preConsentRuntimeScanner} from './scanners/pre-consent-runtime-scanner';

test('runtime retains response status before an unfinished response body or optional enrichment', {timeout:20000},async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/collector'){res.writeHead(200,{'content-type':'text/plain'});res.write('bounded response fixture');return;}
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Response fixture</title><main><h1>Owned response fixture</h1><p>Public local fixture content.</p></main><script>fetch("/collector").catch(()=>{});</script>');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const addr=server.address();assert.ok(addr&&typeof addr==='object');
 const directory=await mkdtemp(join(tmpdir(),'response-confirmation-'));
 try{
  const url=`http://127.0.0.1:${addr.port}/`;
  const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,captureScope:'runtime_evidence',screenshotMode:'never',waitMode:'fast',artifactWriter:await createArtifactWriter(directory)});
  const request=result.networkEvents.find(row=>row.requestUrl===url+'collector');assert.ok(request,'collector request captured');
  const response=result.networkResponseEvents.find(row=>row.requestId===request.requestId);assert.equal(response?.status,200);
  assert.equal(response?.responseUrl,request.requestUrl,'confirmation belongs to the exact request');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
