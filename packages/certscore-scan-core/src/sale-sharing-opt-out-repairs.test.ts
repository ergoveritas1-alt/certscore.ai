import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium,type Browser} from "playwright";
import {runSaleSharingOptOutObserver} from "./sale-sharing-opt-out-observer";
import {saleSharingOptOutEvidenceSchema} from "@certscore/contracts";

// Synthetic local fixtures only. Every request is localhost or intercepted.
test("bounded explicit opt-out variants, async readback and fail-closed controls",{timeout:45000},async t=>{
  let mode="",submissions=0,entrances=0;
  const server=createServer((req,res)=>{
    if(req.url==="/submit"){submissions++;res.end();return;}
    if(req.url==="/open"){entrances++;res.end();return;}
    if(mode==="slow-navigation"){setTimeout(()=>{if(!res.destroyed)res.end("<!doctype html><body>late</body>");},300);return;}
    const label=mode==="short-label"?"Do Not Sell or Share":mode==="sale-label"?"Do Not Sell My Personal Information":mode==="visible-accept"?"Accept all":mode==="long-label"?"Do Not Sell or Share My Personal Information"+" ".repeat(300)+"Accept all":mode==="save"?"Confirm my choices":"Do Not Sell or Share My Personal Information";
    const labelled=mode==="visible-accept"?'aria-label="Do Not Sell or Share My Personal Information"':mode==="labelledby"?'aria-labelledby="choice-label"':mode==="bad-label-reference"?'aria-labelledby="missing"':mode==="conflicting-name"?'aria-label="Accept all"':"";
    const submit=`<button type="button" ${labelled} class="save-preference-btn-handler onetrust-close-btn-handler">${label}</button>`;
    res.setHeader("Content-Type","text/html");
    if(mode==="http-error")res.statusCode=403;
    res.end(`<!doctype html><html><body><button type="button" ${mode==="class-only"?'':'id="ot-sdk-btn"'} class="ot-sdk-show-settings">${mode==="rights-entrance"?'Submit data request':'Your Privacy Choices'}</button>
      <div id="onetrust-pc-sdk" ${mode==="already-visible"?'':'hidden'}>${mode==="fields"?'<input type="checkbox">':''}${mode==="form"?'<form>':''}${submit}${mode==="form"?'</form>':''}${mode==="duplicate-control"?submit:''}<span id="choice-label">Do Not Sell or Share My Personal Information</span></div>
      <script>let choice=${mode==="already-opted-out"?1:2},reads=0;
      window.__gpp=(command,cb)=>{reads++;const n=reads;
        const reply=()=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:choice,SharingOptOut:choice}}},true);
        if(${JSON.stringify(mode)}==='missing-callback')return;
        if(${JSON.stringify(mode)}==='late-before'){setTimeout(reply,120);return;}
        if(${JSON.stringify(mode)}==='late-after'&&n===2){setTimeout(reply,120);return;}
        if(${JSON.stringify(mode)}==='late-terminal'&&n===3){setTimeout(reply,120);return;}
        if(${JSON.stringify(mode)}==='async'){setTimeout(reply,10);return;}
        reply();if(${JSON.stringify(mode)}==='duplicate-callback')reply();};
      document.querySelector('.ot-sdk-show-settings').onclick=()=>{fetch('/open');document.getElementById('onetrust-pc-sdk').hidden=false;};
      document.querySelector('.save-preference-btn-handler').onclick=()=>{fetch('/submit');choice=1;${mode==="document-change"?'location.href="/other";':''}};
      </script></body></html>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const addr=server.address();assert.ok(addr&&typeof addr!=="string");
  const target=`http://127.0.0.1:${addr.port}/`,browser=await chromium.launch({headless:true});
  const scenarios=["normal","async","class-only","short-label","sale-label","labelledby","already-visible","already-opted-out","save","fields","form","duplicate-control","bad-label-reference","long-label","visible-accept","conflicting-name","rights-entrance","duplicate-callback","missing-callback","late-before","late-after","late-terminal","document-change","http-error","tight-action","slow-navigation"];
  try{
    for(const scenario of scenarios)await t.test(scenario,async()=>{
      mode=scenario;submissions=0;entrances=0;
      const start=Date.now();
      const packet=await runSaleSharingOptOutObserver({browser,parentDispatchSha256:"a".repeat(64),
        ...(scenario==="slow-navigation"?{deadlineAtMs:Date.now()+300}:scenario==="tight-action"?{deadlineAtMs:Date.now()+1400}:{}),
        config:{policyVersion:"bounded_sale_sharing_opt_out.v1",enabled:true,scanId:scenario,exactTargetUrl:target}});
      assert.ok(saleSharingOptOutEvidenceSchema.safeParse(JSON.parse(JSON.stringify(packet))).success);
      assert.ok(Date.now()-start<3250,"original capture cap plus bounded cleanup");
      assert.ok(Buffer.byteLength(JSON.stringify(packet))<32000);
      assert.ok(Buffer.byteLength(JSON.stringify(packet.executionDiagnostics))<1024,"bounded metadata estimate");
      assert.ok(packet.actionCount<=2);
      const complete=["normal","async","class-only","short-label","sale-label","labelledby","already-visible"].includes(scenario);
      assert.equal(packet.status==="complete",complete,JSON.stringify(packet));
      if(complete){
        assert.equal(submissions,1);assert.equal(entrances,scenario==="already-visible"?0:1);
        assert.equal(packet.registration,"confirmed");assert.equal(packet.recipeVersion,"onetrust.explicit_sale_share.v2");
        assert.deepEqual(packet.executionDiagnostics!.decisionReads.map(r=>r.status),["observed","observed","observed"]);
        assert.deepEqual(packet.executionDiagnostics!.milestones.map(m=>m.stage),["usable_document","recipe_selected","control_actionable","submitted","confirmed","observation_completed"]);
        assert.equal(packet.observationWindowMs,500);
        t.diagnostic(`${scenario}: packet ${Buffer.byteLength(JSON.stringify(packet))} bytes; diagnostics ${Buffer.byteLength(JSON.stringify(packet.executionDiagnostics))} bytes; capture ${Date.parse(packet.completedAt)-Date.parse(packet.startedAt)} ms`);
      }else{
        assert.equal(packet.captureComplete,false);assert.deepEqual(packet.requests,[]);
        assert.equal(submissions,["late-after","late-terminal","document-change"].includes(scenario)?1:0);
        if(scenario==="tight-action"){assert.equal(entrances,0);assert.equal(packet.actionCount,0);assert.ok(packet.limitations.includes("insufficient_capture_budget"));}
        if(scenario==="http-error")assert.ok(packet.limitations.includes("document_http_error"));
        if(scenario==="already-opted-out")assert.ok(packet.limitations.includes("already_opted_out"));
        if(scenario==="duplicate-callback")assert.equal(packet.executionDiagnostics!.decisionReads[0]?.status,"duplicate");
        if(scenario==="late-before"||scenario==="missing-callback")assert.equal(packet.executionDiagnostics!.decisionReads[0]?.status,"timeout");
      }
    });
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("insufficient handoff budget never creates an observer context",async()=>{
  let contexts=0;
  const browser={newContext:async()=>{contexts++;throw new Error("unexpected context");}} as unknown as Browser;
  const packet=await runSaleSharingOptOutObserver({browser,deadlineAtMs:Date.now()+100,parentDispatchSha256:"a".repeat(64),
    config:{policyVersion:"bounded_sale_sharing_opt_out.v1",enabled:true,scanId:"reserve",exactTargetUrl:"https://example.test/"}});
  assert.equal(contexts,0);assert.equal(packet.actionCount,0);
});
