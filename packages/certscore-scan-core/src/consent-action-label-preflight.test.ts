import assert from "node:assert/strict";
import {createServer} from "node:http";
import test from "node:test";
import {chromium} from "playwright";
import {runPostAcceptObserver} from "./post-accept-observer";
import {runPostRefusalObserver} from "./post-refusal-observer";
import {CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE} from "./post-accept-cmp-recipes";
import {CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE} from "./post-refusal-cmp-recipes";

for(const action of ["accept","reject"] as const) for(const mode of ["observed_only","mixed","supported"] as const){
  test(`generic ${action} discovery preserves ${mode} label eligibility and uniqueness`,async()=>{
    let actions=0;
    const label=action==="accept"?"Принять":"Recusar";
    const supported=action==="accept"?"Accept all":"Reject all";
    const labels=mode==="mixed"?[label,supported]:[mode==="supported"?supported:label];
    const server=createServer((request,response)=>{
      if(request.url==="/action"){actions++;response.writeHead(204).end();return;}
      response.setHeader("content-type","text/html; charset=utf-8");
      response.end(`<!doctype html><html><body><section id="privacy-consent" role="dialog" aria-label="Cookie consent choices"><p>Choose whether this site may use analytics and advertising cookies.</p>${labels.map((text,i)=>`<button id="choice-${i}">${text}</button>`).join("")}</section><script>for(const button of document.querySelectorAll('button'))button.onclick=()=>{localStorage.setItem('consent','${action==="accept"?"granted":"denied"}');document.querySelector('section').hidden=true;fetch('/action',{method:'POST'});};</script></body></html>`);
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();assert.ok(address&&typeof address!=="string");
    const url=`http://127.0.0.1:${address.port}/`,browser=await chromium.launch({headless:true});
    try{
      const common={browser,url,scanId:`local-preflight-${action}`,actionSearchTimeoutMs:2000,confirmationTimeoutMs:100,observationWindowMs:50,
        interactionAuthorization:{authorizationId:"loopback_local_lab",kind:"loopback"} as const};
      const packet=action==="accept"?await runPostAcceptObserver({...common,allowCanonicalAcceptDiscovery:true,
        recipe:{...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,recipeId:"missing-accept",controlSelector:"#registered-not-present"}})
        :await runPostRefusalObserver({...common,allowCanonicalRejectDiscovery:true,
        recipe:{...CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE,recipeId:"missing-reject",controlSelector:"#registered-not-present"}});
      assert.equal(actions,mode==="supported"?1:0);
      assert.equal(packet.interactionDiagnostics?.click.outcome,mode==="supported"?"completed":"not_attempted");
      if(mode==="supported"){
        assert.equal(packet.actionControlProof?.action,action);
        assert.equal(packet.actionControlProof?.accessibleLabel,supported);
        return;
      }
      assert.equal(packet.actionControlProof,undefined);
      const snapshots=packet.interactionDiagnostics?.resolver?.snapshots??[];
      assert.ok(snapshots.some(s=>s.source==="canonical_geometry"&&s.controlLabels.some(l=>l===label.toLowerCase())),"Retain the observed control rather than deleting its evidence");
      assert.equal(snapshots.filter(s=>s.source==="control_proof").length,0,"An observation-only label must stop before baseline/proof handoff");
      if(mode==="observed_only"){
        assert.ok(snapshots.some(s=>s.source==="canonical_geometry"&&s.state==="label_mismatch"&&s.labelMatchCount===0&&s.actionableCount===0));
        assert.equal(packet.resolver.reason,"label_unverifiable","Do not replace a known ineligible label with a missing-control search");
        assert.ok(packet.limitations.includes("resolved_control_label_not_classified"));
        assert.ok(!packet.limitations.includes("resolver_search_budget_exhausted"));
      }
      else assert.ok(snapshots.some(s=>s.source==="canonical_geometry"&&s.state==="multiple_actionable"&&s.actionableCount>=2),"Do not remove an unsupported competing observation to manufacture uniqueness");
    }finally{
      await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });
}
