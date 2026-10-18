import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createArtifactWriter} from "./artifact-writer";
import {policySurfaceScanner,highValueSecondaryCandidatesFromPolicyPage,prioritizePolicyCandidateEvaluation} from "./scanners/policy-surface-scanner";

test("governing notice/hub routes outrank a narrow health supplement",()=>{
 const candidates=highValueSecondaryCandidatesFromPolicyPage("https://site.test/",'<a href="/health-privacy-notice">Health Privacy Notice</a><a href="/privacy/privacy-notice.html#choice">Advertising choices</a><a href="/privacy.html">Privacy center</a>',"Privacy information for our services");
 const ranked=prioritizePolicyCandidateEvaluation(candidates);
 const general=ranked.findIndex(c=>c.normalizedUrl.includes('/privacy/privacy-notice.html'));
 const health=ranked.findIndex(c=>c.normalizedUrl.includes('/health-privacy-notice'));
 assert.ok(general>=0&&health>general,JSON.stringify(ranked.map(c=>[c.linkText,c.deterministicSurfaceType])));
 assert.ok(ranked.some(c=>c.normalizedUrl.endsWith('/privacy.html')&&c.deterministicSurfaceType==='privacy_policy'&&!c.observationOnly));
});

test("a blocked policy destination is not retried through rendered recovery",{timeout:20000},async()=>{
 const hits:string[]=[];
 const server=createServer((request,response)=>{
  hits.push(request.url??'');response.setHeader('Content-Type','text/html');
  if(request.url==='/privacy'){response.statusCode=403;response.end('Access denied');}
  else response.end('<main>'+('Welcome to our public service. '.repeat(20))+'</main><footer><a href="/privacy">Privacy Notice</a></footer>');
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 const base=`http://127.0.0.1:${address.port}`;const directory=await mkdtemp(path.join(tmpdir(),'policy-block-stop-'));
 try {
  const result=await policySurfaceScanner({url:base,normalizedUrl:base,scanStartedAtMs:Date.now(),internalBudgetMs:5000,stopAfterAccessBlock:true,artifactWriter:await createArtifactWriter(directory),
   nanoAssistProvider:{async classifyLinks(input){return {assistId:input.assistId,rankedCandidates:input.candidates.filter(c=>c.deterministicSurfaceType==='privacy_policy').map((c,i)=>({candidateId:c.candidateId,likelySurfaceType:c.deterministicSurfaceType,shouldFetch:true,priorityRank:i+1,confidence:0.95,reason:'Fixture evidence',uncertaintyNotes:[]}))};}}});
  assert.equal(hits.filter(url=>url==='/privacy').length,1,JSON.stringify(hits));
  assert.ok(result.policySurfaceObservations.some(s=>s.httpStatus===403));
  assert.ok(!result.moduleRun.timingBreakdown?.some(t=>/rendered fetch fallback|canonical host retry/.test(t.label)));
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});
