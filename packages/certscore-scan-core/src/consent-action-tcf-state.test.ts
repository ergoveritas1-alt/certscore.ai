import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { projectPostAcceptEvidenceForReport, projectPostRefusalEvidenceForReport } from "@certscore/contracts";
import { readConsentActionTcfData } from "./consent-action-tcf-state.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";

test("TCF observation follows fresh events, invalidates failed updates, and rebinds API replacement", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.evaluate(`(() => {
      window.subscriptions = 0;
      window.__tcfapi = (command, version, callback) => {
        if (command === 'addEventListener') {
          window.subscriptions++; window.updateConsent = callback;
          callback({ listenerId: 1, eventStatus: 'tcloaded', purpose: { consents: {1:false} } }, true);
        }
      };
    })()`);
    assert.equal((await readConsentActionTcfData(page))?.purposeConsents["1"], false);
    await page.evaluate(`window.updateConsent({listenerId:1,eventStatus:'useractioncomplete',purpose:{consents:{1:true}}},true)`);
    assert.equal((await readConsentActionTcfData(page))?.purposeConsents["1"], true);
    assert.equal(await page.evaluate("window.subscriptions"), 1);
    await page.evaluate("window.updateConsent({},false)");
    assert.equal(await readConsentActionTcfData(page), undefined);
    await page.evaluate(`window.__tcfapi=(command,version,callback)=>{
      if(command==='getTCData')callback({eventStatus:'tcloaded',purpose:{consents:{1:false}}},true);
    }`);
    assert.equal((await readConsentActionTcfData(page))?.purposeConsents["1"], false);
    // A callback from the replaced API cannot overwrite the new document/API state.
    await page.evaluate(`window.updateConsent({eventStatus:'useractioncomplete',purpose:{consents:{1:true}}},true)`);
    assert.equal((await readConsentActionTcfData(page))?.purposeConsents["1"], false);
  } finally { await browser.close(); }
});

for (const action of ["accept", "reject"] as const) {
  for (const outcome of ["matching", "opposite", "partial", "sparse_matching", "sparse_matching_class", "sparse_conflict", "sparse_invalid_envelope", "sparse_missing_map"] as const) {
    test(`${action}: listener-only OneTrust ${outcome} decision preserves confirmation requirements`, async () => {
      let clicks = 0;
      const server = createServer((request, response) => {
        if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
        response.setHeader("content-type", "text/html");
        response.end(`<!doctype html><section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie consent">
          <p>Choose whether to allow optional analytics cookies.</p>
          <button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button></section><script>
          const consents = value => Object.fromEntries(Array.from({length:10},(_,i)=>[i+1,value]));
          const tcString = values => { const bytes=new Uint8Array(32);bytes[0]=8;
            for(let id=1;id<=24;id++)if(values[id]){const offset=152+id-1;bytes[Math.floor(offset/8)]|=1<<(7-offset%8);}
            return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); };
          const envelope = values => ${outcome.startsWith("sparse_")} ? {gdprApplies:true,cmpStatus:'loaded',tcfPolicyVersion:4,cmpId:28,cmpVersion:1,tcString:tcString(values)} : {};
          let current={...envelope(consents(${action !== "accept"})),eventStatus:'tcloaded',listenerId:1,purpose:{consents:consents(${action !== "accept"})}};
          let listener;
          window.__tcfapi=(command,version,callback)=>{
            if(command==='addEventListener'){listener=callback;callback(current,true);}
            if(command==='getTCData')callback(undefined,false);
          };
          document.querySelector('button').onclick=()=>{
            const state=${outcome === "partial" ? "{1:false}" : outcome.startsWith("sparse_") ? action === "reject" ? "{}" : "consents(true)" : `consents(${outcome === "matching" ? action === "accept" : action !== "accept"})`};
            current={...envelope(state),eventStatus:'useractioncomplete',listenerId:1,purpose:{consents:state}};
            ${outcome === "sparse_matching_class" ? "current=Object.assign(new (class TCData {})(),current);" : ""}
            ${outcome === "sparse_conflict" ? "current.tcString=tcString(consents(!state[1]));" : ""}
            ${outcome === "sparse_invalid_envelope" ? "delete current.cmpStatus;current.purpose.consents={1:false};" : ""}
            ${outcome === "sparse_missing_map" ? "delete current.purpose.consents;" : ""}
            if(listener)listener(current,true);
            document.querySelector('section').hidden=true;fetch('/click');
          };</script>`);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      const common = { url: `http://127.0.0.1:${address.port}/`, scanId: `onetrust-listener-${action}`,
        actionSearchTimeoutMs: 1000, confirmationTimeoutMs: 100, observationWindowMs: 50,
        interactionAuthorization: { kind: "loopback", authorizationId: "loopback_local_lab" } as const };
      try {
        const packet = action === "accept"
          ? await runPostAcceptObserver({ ...common, recipe: buildCanonicalPostAcceptActionRecipes().find((r) => r.cmpId === "OneTrust")! })
          : await runPostRefusalObserver({ ...common, recipe: buildCanonicalPostRefusalActionRecipes().find((r) => r.cmpId === "OneTrust")! });
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        assert.equal(clicks, 1);
        assert.equal(registration.status, (outcome === "matching" || outcome.startsWith("sparse_matching")) ? "confirmed" : "unconfirmed");
        if (outcome === "matching" || outcome.startsWith("sparse_matching")) {
          if (outcome.startsWith("sparse_matching")) assert.equal(packet.decisionEvidence?.tcfPurposeEvidence?.policyVersion, "iab_tcf_sparse_purposes.v1");
          assert.equal(packet.decisionEvidence?.decision, action === "accept" ? "granted" : "denied");
          assert.equal(packet.decisionEvidence?.tcfApiSource, "addEventListener");
          const projection = "acceptanceRegistration" in packet
            ? projectPostAcceptEvidenceForReport({ packet }) : projectPostRefusalEvidenceForReport({ packet });
          assert.deepEqual(projection.decisionEvidence, packet.decisionEvidence);
          assert.ok(registration.witnesses.some((w) => w.witnessType === "tcf_user_action_complete"));
        }
      } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    });
  }
}
