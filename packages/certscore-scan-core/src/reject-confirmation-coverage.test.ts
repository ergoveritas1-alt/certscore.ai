import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { projectPostRefusalEvidenceForReport, consentConfirmationDiagnosticsSchema } from "@certscore/contracts";
import { firstVerifiedConsentRead } from "./consent-confirmation-read.js";
import { readCmpApiConsentSnapshot } from "./cmp-api-consent-state.js";
import { readDocumentedConsentApi } from "./documented-consent-api.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver, type PostRefusalActionRecipe } from "./post-refusal-observer.js";

const missing: PostRefusalActionRecipe = {artifactVersion: "certscore.post_refusal_action_recipe.v1", recipeId: "absent-fixture-recipe",
  controlSelector: "#absent", confirmation: {kind: "local_storage_equals", key: "consent", expectedValue: "rejected"}};
async function fixture(html: string | {main: string; child: string}, run: (url: string, clicks: () => number) => Promise<void>) {
  let clicks = 0;
  const server = createServer((request, response) => {
    if (request.url === "/click") { clicks++; response.writeHead(204).end(); return; }
    response.setHeader("content-type", "text/html; charset=utf-8"); response.end(typeof html === "string" ? html : request.url === "/child" ? html.child : html.main);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}/`, () => clicks); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
async function observe(url: string, recipe = missing, overrides: Partial<Parameters<typeof runPostRefusalObserver>[0]> = {}) {
  return runPostRefusalObserver({scanId: "reject-confirmation-coverage", url, recipe,
    interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"},
    allowCanonicalRejectDiscovery: true, fulfillThirdPartyRequestsLocally: true,
    actionSearchTimeoutMs: 3000, confirmationTimeoutMs: 100, observationWindowMs: 400, ...overrides});
}

test("verified receipt read is independent of a silent TCF read and failed branches", async () => {
  let complete!: (state: string | undefined) => void;
  const pending = new Promise<string | undefined>(resolve => { complete = resolve; });
  assert.equal(await firstVerifiedConsentRead([pending, Promise.resolve("verified")]), "verified");
  complete(undefined);
  assert.equal(await firstVerifiedConsentRead([Promise.reject(Error("unavailable")), Promise.resolve(undefined)]), undefined);
});

test("a stalled documented getter is bounded below the existing terminal read window", async context => {
  context.mock.timers.enable({apis:["setTimeout"]});
  const scope = {evaluate:()=>new Promise(()=>{})} as unknown as import("playwright").Page;
  let finished = false;
  const read = readDocumentedConsentApi(scope,"cookiescript").then(value=>{finished=true;return value;});
  context.mock.timers.tick(149); await Promise.resolve(); assert.equal(finished,false);
  context.mock.timers.tick(1); assert.equal(await read,undefined);
});

for (const provider of ["finsweet", "cookiescript", "cookie_information", "osano"] as const) {
  for (const mode of ["saved", "no_event", "partial", "opposite"] as const) {
    test(`${provider}: ${mode} decision preserves semantic and saved-event gates`, async () => {
      const scope = provider === "finsweet" ? 'fs-consent-element="banner"' : provider === "cookiescript" ? 'id="cookiescript_injected"' : provider === "osano" ? 'class="osano-cm-window"' : 'id="coiOverlay"';
      const id = provider === "cookie_information" ? 'class="coi-banner__decline"' : provider === "osano" ? 'class="osano-cm-deny-all"' : '';
      const script = provider === "finsweet" ? `
        window.state={essential:true,analytics:true,marketing:true,personalization:true};
        window.FinsweetConsentPro={consents:{get:()=>window.state}};
        window.save=()=>{ window.state=${mode === "partial" ? '{essential:true,analytics:false}' : `{essential:true,analytics:${mode === "opposite"},marketing:false,personalization:false}`};
          ${mode === "no_event" ? '' : `document.documentElement.dispatchEvent(new CustomEvent('consentpro:consent-updated'));`} };`
        : provider === "cookiescript" ? `
          window.state={categories:[]};window.CookieScript={instance:{categories:()=>['performance','targeting'],currentState:()=>window.state}};
          window.save=()=>{window.state=${mode === "partial" ? '{action:"reject",categories:["invented"]}' : mode === "opposite" ? '{action:"accept",categories:["performance","targeting"]}' : '{action:"reject",categories:["strict"]}'};
            ${mode === "no_event" ? '' : `dispatchEvent(new Event('CookieScriptReject'));`} };`
        : provider === "cookie_information" ? `
          window.state=true;window.CookieInformation={getConsentGivenFor:key=>window.state};
          window.save=()=>{window.state=${mode === "partial" ? 'undefined' : mode === "opposite" ? 'true' : 'false'};
            document.cookie='CookieInformationConsent=opaque-receipt-after;path=/';
            ${mode === "no_event" ? '' : `dispatchEvent(new Event('CookieInformationConsentGiven'));`} };`
        : `window.handlers=[];window.state=undefined;window.Osano={cm:{getConsent:()=>window.state,
          addEventListener:(event,fn)=>{if(event==='osano-cm-consent-saved')window.handlers.push(fn)}}};
          window.save=()=>{window.state=${mode === "partial" ? '{ANALYTICS:"DENY"}' : `{ESSENTIAL:'ACCEPT',ANALYTICS:'${mode === "opposite" ? 'ACCEPT' : 'DENY'}',MARKETING:'DENY',PERSONALIZATION:'DENY','OPT-OUT':'ACCEPT',STORAGE:'DENY'}`};
            ${mode === "no_event" ? '' : 'window.handlers.forEach(fn=>fn(window.state));'} };`;
      await fixture(`<section ${scope}><p>Choose optional cookies</p><button ${id} onclick="save();fetch('/click');this.parentElement.hidden=true">Reject all</button></section><script>${script}</script>`, async (url, clicks) => {
        const recipe = provider === "cookie_information" || provider === "osano"
          ? buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === (provider === "osano" ? "Osano" : "Cookie Information"))! : missing;
        const packet = await observe(url, recipe);
        assert.equal(clicks(), 1, JSON.stringify(packet.limitations));
        assert.equal(packet.refusalRegistration.status, mode === "saved" ? "confirmed" : "unconfirmed", JSON.stringify(packet.confirmationDiagnostics));
        assert.ok(consentConfirmationDiagnosticsSchema.safeParse(packet.confirmationDiagnostics).success);
        assert.equal(packet.confirmationDiagnostics?.diagnosticOnly, true);
        assert.equal(packet.decisionEvidence?.decision === "denied", mode === "saved");
        if (provider === "osano" && mode === "partial") {
          assert.ok(packet.confirmationDiagnostics?.policyVersion !== "consent_confirmation_diagnostics.v1" &&
            packet.confirmationDiagnostics?.reasons.includes("receipt_format_unsupported"));
          assert.equal(packet.confirmationDiagnostics?.reasons.includes("api_unavailable"), false);
        }
      });
    });
  }
}

test("documented API configuration drift and malformed saved updates cannot reuse prior proof", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<section id="cookiescript_injected"></section><script>window.categories=['performance'];window.state={action:'reject',categories:['strict']};window.CookieScript={instance:{categories:()=>window.categories,currentState:()=>window.state}};</script>`);
    const before = await readCmpApiConsentSnapshot(page, "cookiescript");
    await page.evaluate(() => { (window as any).categories.push("targeting"); dispatchEvent(new Event("CookieScriptReject")); });
    const after = await readCmpApiConsentSnapshot(page, "cookiescript");
    assert.notEqual(before?.configurationSha256, after?.configurationSha256);
    await page.evaluate(() => { (window as any).state={action:"reject",categories:["alien"]}; dispatchEvent(new Event("CookieScriptReject")); });
    assert.equal(await readCmpApiConsentSnapshot(page, "cookiescript"), undefined);
  } finally { await browser.close(); }
});

test("unregistered documented API baselines remain unknown until a complete saved decision is read", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    for (const provider of ["cookie_information","cookiescript","finsweet"] as const) {
      const scope = provider === "cookie_information" ? 'id="coiOverlay"' : provider === "cookiescript" ? 'id="cookiescript_injected"' : 'fs-consent-element="banner"';
      await page.setContent(`<section ${scope}></section><script>window.state=undefined;
        window.CookieInformation={getConsentGivenFor:()=>window.state};
        window.CookieScript={instance:{categories:()=>['performance'],currentState:()=>window.state}};
        window.FinsweetConsentPro={consents:{get:()=>window.state}};</script>`);
      // setContent retains window properties; discard only our previous fixture tracker.
      await page.evaluate(()=>{delete (window as any).__certscoreDocumentedDecisionReaders;});
      const before=await readCmpApiConsentSnapshot(page,provider);
      assert.equal(before?.decision,"unknown"); assert.equal(before?.eventSequence,0);
      await page.evaluate(provider=>{
        (window as any).state=provider==="cookie_information" ? false : provider==="cookiescript"
          ? {action:"reject",categories:["strict"]} : {essential:true,analytics:false,marketing:false,personalization:false};
        if(provider==="finsweet")document.documentElement.dispatchEvent(new Event("consentpro:consent-updated"));
        else dispatchEvent(new Event(provider==="cookiescript" ? "CookieScriptReject" : "CookieInformationConsentGiven"));
      },provider);
      const after=await readCmpApiConsentSnapshot(page,provider);
      assert.equal(after?.decision,"denied");assert.equal(after?.eventSequence,1);
      assert.equal(after?.configurationSha256,before?.configurationSha256);
    }
  } finally {await browser.close();}
});

test("background CMP API outside the live control's registered scope cannot confirm a generic click", async () => {
  await fixture(`<section><p>Choose optional cookies</p><button onclick="window.state={essential:true,analytics:false,marketing:false,personalization:false};document.documentElement.dispatchEvent(new Event('consentpro:consent-updated'));fetch('/click');this.parentElement.hidden=true">Reject all</button></section>
    <script>window.state={essential:true,analytics:true,marketing:true,personalization:true};window.FinsweetConsentPro={consents:{get:()=>window.state}};</script>`, async (url, clicks) => {
    const packet = await observe(url);
    assert.equal(clicks(), 1);
    assert.equal(packet.refusalRegistration.status, "unconfirmed");
    assert.equal(packet.resolver.cmpId, undefined);
    assert.ok(packet.confirmationDiagnostics?.reasons.includes("no_fresh_decision"));
  });
});

test("a changed CookieScript category configuration stays unconfirmed at the observer boundary", async () => {
  await fixture(`<section id="cookiescript_injected"><p>Choose optional cookies</p><button onclick="window.categories.push('targeting');window.state={action:'reject',categories:['strict']};window.dispatchEvent(new Event('CookieScriptReject'));fetch('/click');this.parentElement.hidden=true">Reject all</button></section>
    <script>window.categories=['performance'];window.state={categories:[]};window.CookieScript={instance:{categories:()=>window.categories,currentState:()=>window.state}};</script>`, async (url, clicks) => {
    const packet = await observe(url);
    assert.equal(clicks(),1); assert.equal(packet.refusalRegistration.status,"unconfirmed");
    assert.ok(packet.confirmationDiagnostics?.reasons.includes("configuration_changed"));
  });
});

test("child-frame Reject uses that frame's documented API rather than the main document's background API", async () => {
  await fixture({main:`<iframe src="/child" style="width:700px;height:400px"></iframe>
    <script>window.CookieScript={instance:{categories:()=>{throw Error('wrong document')},currentState:()=>{throw Error('wrong document')}}};</script>`,
    child:`<section id="cookiescript_injected"><p>Choose optional cookies</p><button onclick="window.state={action:'reject',categories:['strict']};window.dispatchEvent(new Event('CookieScriptReject'));fetch('/click');this.parentElement.hidden=true">Reject all</button></section>
      <script>window.state={categories:[]};window.CookieScript={instance:{categories:()=>['performance'],currentState:()=>window.state}};</script>`}, async (url, clicks) => {
    const packet = await observe(url);
    assert.equal(clicks(),1,JSON.stringify(packet.limitations));
    assert.equal(packet.refusalRegistration.status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
    assert.equal(packet.resolver.cmpId,"CookieScript");
  });
});

test("late OneTrust receipt completes terminal read inside the existing window without relabeling initial registration", async () => {
  await fixture(`<section id="onetrust-banner-sdk"><p>Choose optional cookies</p><button id="onetrust-reject-all-handler" onclick="fetch('/click');this.parentElement.hidden=true;setTimeout(()=>document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=after;path=/',600)">Reject all</button></section>
    <script>document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};window.__tcfapi=()=>{};</script>`, async (url, clicks) => {
    const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "OneTrust")!;
    const packet = await observe(url, recipe, {observationWindowMs:1200});
    assert.equal(clicks(),1);
    assert.equal(packet.refusalRegistration.status,"unconfirmed");
    assert.equal(packet.terminalDecisionEvidence?.evidence.decision,"denied", JSON.stringify(packet.confirmationDiagnostics));
    assert.equal(packet.afterActionCapture?.requestedWindowMs,1200);
    assert.ok(packet.terminalDecisionEvidence!.readCompletedAtMs <= packet.afterActionCapture!.actionDispatchedAtMs+1200);
    const projected=projectPostRefusalEvidenceForReport({packet});
    assert.equal(projected.registrationStatus,"unconfirmed");
    assert.equal(projected.refusalExercised,false);
    assert.equal(packet.confirmationDiagnostics?.terminalRead,"verified");
  });
});

for (const key of ["VWD6_ENSIGHTEN_PRIVACY_Analytics", "RSA_ENSIGHTEN_PRIVACY_Advertising", "__privaci_cookie_consents", "consentHeader"]) {
  test(`${key}: undocumented or partial receipt remains unconfirmed with typed diagnostics`, async () => {
    await fixture(`<section><p>Choose optional cookies</p><button onclick="localStorage.setItem('${key}','false');fetch('/click');this.parentElement.hidden=true">Reject all</button></section>`, async (url, clicks) => {
      const packet = await observe(url);
      assert.equal(clicks(),1); assert.equal(packet.refusalRegistration.status,"unconfirmed");
      assert.ok(packet.confirmationDiagnostics?.reasons.includes("no_registered_complete_decision"));
      assert.deepEqual(packet.observations,[]);
    });
  });
}

for (const mode of ["saved", "no_event", "partial", "opposite", "invalid_necessary"] as const) {
  test(`HubSpot Reject with necessary category: ${mode}`, async () => {
    const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "HubSpot Consent Banner")!;
    await fixture(`<section id="hs-eu-cookie-confirmation"><p>Choose optional cookies</p>
      <button id="hs-eu-decline-button" onclick="save();fetch('/click');this.parentElement.hidden=true">Reject all</button></section>
      <script>
      window.handlers=[];window.state={categories:{necessary:true,analytics:true,advertisement:true,functionality:true}};
      window._hsp={push:([command,fn])=>{if(command!=='addPrivacyConsentListener')throw Error('unexpected command');handlers.push(fn);fn(state);}};
      window.save=()=>{window.state={categories:${mode === "partial" ? '{necessary:true,analytics:false}' : `{necessary:${mode !== "invalid_necessary"},analytics:${mode === "opposite"},advertisement:false,functionality:false}`}};
        ${mode === "no_event" ? '' : 'handlers.forEach(fn=>fn(state));'} };
      </script>`, async (url, clicks) => {
      const packet = await observe(url, recipe);
      assert.equal(clicks(), 1);
      assert.equal(packet.refusalRegistration.status, mode === "saved" ? "confirmed" : "unconfirmed");
      assert.equal(packet.decisionEvidence?.decision === "denied", mode === "saved");
      if (mode === "partial" || mode === "invalid_necessary") {
        assert.ok(packet.confirmationDiagnostics?.policyVersion !== "consent_confirmation_diagnostics.v1" &&
          packet.confirmationDiagnostics?.reasons.includes("receipt_format_unsupported"));
        assert.equal(packet.confirmationDiagnostics?.reasons.includes("api_unavailable"), false);
      }
      const projection = projectPostRefusalEvidenceForReport({packet});
      // Loopback lab evidence verifies the observer, but cannot become a
      // production report action or a confirmed customer finding.
      assert.equal(projection.execution?.clickCompleted, false);
      assert.equal(projection.execution?.consentConfirmed, false);
    });
  });
}

for (const mode of ["readback_mismatch", "unsupported_tcf_scope"] as const) {
  test(`Osano Reject preserves the adapter's ${mode} blocker`, async () => {
    const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "Osano")!;
    await fixture(`<section class="osano-cm-window"><p>Choose optional cookies</p>
      <button class="osano-cm-deny-all" onclick="save();fetch('/click');this.parentElement.hidden=true">Reject all</button></section>
      <script>window.handlers=[];window.state=undefined;
      window.Osano={cm:{getConsent:()=>window.state,addEventListener:(name,fn)=>handlers.push(fn)}};
      window.save=()=>{window.state={ESSENTIAL:'ACCEPT',ANALYTICS:'DENY',MARKETING:'DENY',PERSONALIZATION:'DENY','OPT-OUT':'ACCEPT',STORAGE:'DENY'};
        ${mode === "unsupported_tcf_scope" ? "window.__tcfapi=()=>{};handlers.forEach(fn=>fn(state));" : "handlers.forEach(fn=>fn({...state,ANALYTICS:'ACCEPT'}));"}};
      </script>`, async (url, clicks) => {
      const packet = await observe(url, recipe);
      assert.equal(clicks(), 1);
      assert.equal(packet.refusalRegistration.status, "unconfirmed");
      assert.equal(packet.terminalDecisionEvidence, undefined);
      assert.ok(packet.confirmationDiagnostics?.reasons.includes(mode === "readback_mismatch"
        ? "receipt_readback_mismatch" : "configuration_or_groups_unverified"), JSON.stringify(packet.confirmationDiagnostics));
      assert.equal(packet.confirmationDiagnostics?.reasons.includes("api_unavailable"), false);
    });
  });
}
