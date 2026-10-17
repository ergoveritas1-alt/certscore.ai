import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium} from "playwright";
import {installRuntimeGraphCapture} from "./runtime-evidence-graph-capture";
test("loaded source evidence is bounded, document-bound, baseline-only and makes no extra requests",{timeout:20_000},async()=>{
  let requests=0;
  const server=createServer((req,res)=>{requests++;res.setHeader("Content-Type",req.url === "/app.js"?"application/javascript":"text/html");res.end(req.url === "/app.js"?`let ref=document.referrer;localStorage.setItem('referrer',ref);
let other=localStorage.getItem('other');if(other!==localStorage.getItem('referrer'))localStorage.removeItem('other');`:`<script>function saveCookie(name,value){document.cookie=name+'='+encodeURIComponent(value)+'; path=/';}saveCookie('choice','private-value');</script><script src="/app.js"></script>`);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  const browser=await chromium.launch({headless:true});
  try{
    for(const scenario of ["pre_consent","gpc"] as const){
      const context=await browser.newContext();const page=await context.newPage();
      const capture=await installRuntimeGraphCapture(page,{scanId:"scan",captureId:`scan:${scenario === "pre_consent"?"runtime_evidence":"gpc_observation"}`,scenario,mode:"project",startedAt:new Date().toISOString()});
      await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForLoadState("networkidle");await capture.snapshotStorage();
      if(scenario === "pre_consent")await page.evaluate(()=>{
        let coercions=0;const key={toString(){coercions++;return "referrer";}};
        localStorage.getItem(key as unknown as string);if(coercions!==1)throw new Error("Repeated native key coercion");
      });
      if(scenario === "pre_consent")await page.evaluate(()=>{
        for(let i=0;i<80;i++)localStorage.getItem("bounded-test");
        localStorage.setItem("after_read_limit","another-private-value");
      });
      const graph=capture.finish()!;const packets=capture.scriptEvidence();
      const reads=capture.storageReadTrace();
      if(scenario === "pre_consent"){
        assert.ok(packets.some(packet=>packet.facts.some(fact=>fact.kind === "storage_referrer_flow")));
        assert.ok(packets.some(packet=>packet.facts.some(fact=>fact.kind === "cookie_parameter_setter")));
        assert.ok(packets.every(packet=>graph.nodes.some(node=>node.kind === "document"&&node.documentId===packet.documentId&&node.frameId===packet.frameId)));
        assert.ok(!JSON.stringify(packets).includes("private-value"));
        assert.equal(reads?.limitReached,true);
        assert.ok(reads!.observations.length<=32);assert.ok(graph.nodes.some(node=>node.kind === "storage"&&node.name === "after_read_limit"),"Read ceiling must preserve write capture");
        const read=reads!.observations.find(row=>row.name === "referrer")!;assert.ok(read);assert.equal(read.valueState,"empty");
        assert.ok(packets.some(packet=>packet.facts.some(fact=>fact.kind === "storage_read_context"&&fact.name === "referrer"&&fact.useContext === "storage_cleanup_check"&&fact.callsite?.line===read.line&&read.column>=fact.callsite.column&&read.column<fact.callsite.endColumn)));
        assert.ok(!JSON.stringify(reads).includes("private-value"));
      }else {assert.deepEqual(packets,[]);assert.equal(reads,undefined);}
      const retainedReads=JSON.stringify(reads);
      const retained=JSON.stringify(packets);await page.reload();assert.equal(JSON.stringify(capture.scriptEvidence()),retained,"freeze prevents late enrichment");assert.equal(JSON.stringify(capture.storageReadTrace()),retainedReads);
      await context.close();
    }
    assert.equal(requests,8,"two ordinary page loads and reloads per scenario; no additional fetches");
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
