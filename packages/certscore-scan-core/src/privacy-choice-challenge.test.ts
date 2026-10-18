import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createArtifactWriter} from './artifact-writer';
import {policySurfaceScanner} from './scanners/policy-surface-scanner';

test('privacy-request challenge preserves the observed handoff and stops recovery/traversal', {timeout:20000}, async()=>{
 const hits:string[]=[];
 const server=createServer((req,res)=>{
  hits.push(req.url??'');res.setHeader('Content-Type','text/html');
  if(req.url==='/privacyrequest'){res.writeHead(302,{Location:'/blocked'});res.end();return;}
  if(req.url==='/blocked'){res.end('<title>Robot or human?</title><h1>Robot or human?</h1><p>Activate and hold the button to confirm that you’re human.</p><footer><a href="/trap">Privacy Policy</a><a href="/trap">Do Not Sell My Personal Information</a></footer>');return;}
  if(req.url==='/privacy'){res.end('<title>Privacy Policy</title><main>'+('We collect personal information to provide services and answer customer requests. We retain information for the purposes described here. You can request access, deletion and correction by contacting privacy@example.test. ').repeat(25)+'</main>');return;}
  if(req.url==='/'){res.end('<title>Retail company</title><main>'+('We provide products and services to our customers and offer customer support. ').repeat(20)+'</main><footer><a href="/privacy">Privacy Policy</a><a href="/privacyrequest">Your Privacy Choices</a></footer>');return;}
  res.statusCode=404;res.end('Not found');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;const root=await mkdtemp(path.join(tmpdir(),'choice-challenge-'));
 try{
  const result=await policySurfaceScanner({url:base,normalizedUrl:base,scanStartedAtMs:Date.now(),internalBudgetMs:8000,artifactWriter:await createArtifactWriter(root),nanoAssistProvider:{async classifyLinks(input){return {assistId:input.assistId,rankedCandidates:input.candidates.filter(c=>c.normalizedUrl===base+'/privacy'||c.normalizedUrl===base+'/privacyrequest').map((c,i)=>({candidateId:c.candidateId,likelySurfaceType:c.deterministicSurfaceType,shouldFetch:true,priorityRank:i+1,confidence:0.9,reason:'Fixture ranking',uncertaintyNotes:[]}))};}}});
  const choice=result.policySurfaceObservations.find(r=>r.surfaceType==='your_privacy_choices');
  assert.equal(choice?.status,'failed',JSON.stringify({choice,hits}));assert.equal(choice?.documentEvaluationState,'blocked');assert.equal(choice?.fetchFailureReason,'low_quality_access_challenge');
  assert.equal(choice?.url,'/privacyrequest');assert.equal(choice?.normalizedUrl,base+'/privacyrequest');assert.equal(choice?.finalUrl,base+'/blocked');
  assert.equal(hits.filter(url=>url==='/privacyrequest').length,1);assert.equal(hits.filter(url=>url==='/blocked').length,1);assert.equal(hits.includes('/trap'),false);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
