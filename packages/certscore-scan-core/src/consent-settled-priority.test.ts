import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {createArtifactWriter} from "./artifact-writer.js";
import {preConsentRuntimeScanner} from "./scanners/pre-consent-runtime-scanner.js";

test("protected settled comparison completes before duplicate inventory or late screenshots",{timeout:20000},async()=>{
 let actions=0;
 const server=createServer((req,res)=>{
  if(req.url==="/action"){actions++;res.end();return;}
  res.setHeader("content-type","text/html");
  res.end(`<style>body{background:white;padding:40px}#onetrust-banner-sdk{position:fixed;bottom:30px;left:30px;right:30px;background:#eef1f5;padding:30px}button{background:#123456;color:white;width:180px;height:44px;margin:16px;border:0}</style><main>Local consent proof fixture</main><section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent">We use cookies. Choose your cookie preferences.<button id="onetrust-accept-btn-handler" onclick="fetch('/action')">Accept all</button><button id="onetrust-reject-all-handler" onclick="fetch('/action')">Reject all</button><button id="onetrust-pc-btn-handler" onclick="fetch('/action')">Manage options</button></section>`);
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const addr=server.address();assert.ok(addr&&typeof addr!=="string");
 const root=await mkdtemp(`${tmpdir()}/settled-priority-`),url=`http://127.0.0.1:${addr.port}/`;
 try {
  const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:12000,captureScope:"consent_proof",screenshotMode:"always",waitMode:"fast",artifactWriter:await createArtifactWriter(root)});
  const geometry=JSON.parse(await readFile(`${root}/ConsentControlGeometryEvidence.json`,"utf8"));
  assert.ok(geometry.visualComparison,JSON.stringify(result.moduleRun.timingBreakdown));
  assert.ok(geometry.screenshotArtifactRef.endsWith("screenshot-pre-consent-settled.png"));
  assert.equal(geometry.visualComparison.screenshotArtifactRef,geometry.screenshotArtifactRef);
  assert.equal(geometry.visualComparison.documentToken,geometry.documentIdentity.token);
  assert.ok(geometry.visualComparison.captureSkewMs<=500);
  assert.equal(actions,0);
  assert.ok(result.moduleRun.timingBreakdown?.some(row=>row.label==="paired settled-frame inventory skipped"));
  assert.equal(result.screenshots.some(image=>image.artifactId==="screenshot_pre_consent_geometry_proof"),false,"No duplicate geometry screenshot after the terminal settled packet");
  assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==="consent pixel comparison"&&row.outcome==="completed").length,1);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
