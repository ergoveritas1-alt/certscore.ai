import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";
import { classifyConsentControlLabel, consentActionControlProofSchema } from "@certscore/contracts";
import { assertReviewedRejectDispatchAllowed, buildConsentActionControlProof } from "./cmp-action-control-proof.js";
import { buildCanonicalPostRefusalActionRecipes, CANONICAL_POST_REFUSAL_RECIPE_SET_ID } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";

const recipe = buildCanonicalPostRefusalActionRecipes().find(r => r.cmpId === "OneTrust" && !r.accessibleControl)!;
const instructions = {
  "Strictly Necessary": 'By clicking "Strictly Necessary" you only agree to the storing of strictly necessary cookies.',
  "Essential Cookies": 'You can refuse them by clicking "Essential Cookies".',
};
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

test("Portuguese refusal is exact, contextual and keeps semantic vetoes", () => {
  const result = classifyConsentControlLabel({usage: "action", label: "Rejeitar", hasConsentContext: true});
  assert.equal(result.intent, "reject");assert.equal(result.confidence, 0.91);
  for (const label of ["Rejeitar?", "Como rejeitar", "Rejeitar compra", "Rejeitar ou aceitar"]) {
    const unsafe = classifyConsentControlLabel({usage: "action", label, hasConsentContext: true});
    assert.ok(unsafe.intent !== "reject" || unsafe.confidence < 0.8, label);
  }
  assert.notEqual(classifyConsentControlLabel({usage: "action", label: "Rejeitar", hasConsentContext: false}).intent, "reject");
});

test("necessary-only action proof is scoped, label-bound and tamper checked", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    const proof = () => buildConsentActionControlProof({action: "reject", page, control: page.locator('#onetrust-reject-all-handler').first(),
      observedAtMs: 1, cmpId: "OneTrust", recipeId: recipe.recipeId, selectorHint: recipe.controlSelector,
      authorizedTargetSha256: hash(page.url())});
    for (const [label, text] of Object.entries(instructions)) {
      const html = `<section id="onetrust-banner-sdk"><p>${text}</p><button type="button" id="onetrust-reject-all-handler">${label}</button></section>`;
      await page.setContent(html);
      const result = await proof();assert.equal(result.status, "verified", JSON.stringify(result));
      if (result.status !== "verified") continue;
      assert.equal(consentActionControlProofSchema.safeParse(result.proof).success, true);
      assert.equal(result.proof.actionSemantics, "canonical_necessary_only_recipe");
      for (const mutate of ["instructions", "label", "duplicate"] as const) {
        await page.setContent(html);
        if (mutate === "instructions") await page.locator('p').evaluate(element => element.remove());
        if (mutate === "label") await page.locator('button').evaluate(element => {element.textContent = "Accept all";});
        if (mutate === "duplicate") await page.locator('button').evaluate(element => element.after(element.cloneNode(true)));
        await assert.rejects(assertReviewedRejectDispatchAllowed({page,control:page.locator('button').first(),proof:result.proof}), /binding_changed/);
      }
      for (const change of [{labelBoundNecessaryOnly: undefined}, {authorizedTargetSha256: undefined},
        {cmpId: "CookieYes"}, {recipeId: "fixture"}, {selectorHint: "button"}, {action: "accept"},
        {contractVersion: "certscore.consent_action_control_proof.v1"}, {classifierConfidence: 1},
        {labelBoundNecessaryOnly: {...result.proof.labelBoundNecessaryOnly, contextText: "Necessary cookies are required."}}]) {
        assert.equal(consentActionControlProofSchema.safeParse({...result.proof, ...change}).success, false, JSON.stringify(change));
      }
      for (const bad of [
        html.replace(`<p>${text}</p>`, "<p>Necessary cookies are required.</p>"),
        html.replace("<p>", '<p hidden>'), html.replace("<p>", '<p style="opacity:0">'),
        html.replace(`<p>${text}</p>`, "") + `<aside>${text}</aside>`,
        html.replace('id="onetrust-banner-sdk"', 'id="preferences"'),
        `<form>${html}</form>`, html.replace('type="button"', 'type="submit"'),
        '<form id="transaction"></form>'+html.replace('type="button"','form="transaction"'),
        html.replace('type="button"', 'type="button" disabled'),
        html.replace('type="button"', 'type="button" aria-label="Accept all"'),
        html + '<section id="onetrust-banner-sdk">Other banner</section>',
        html.replace('</section>', `<button type="button" id="onetrust-reject-all-handler">${label}</button></section>`),
      ]) {
        await page.setContent(bad);assert.notEqual((await proof()).status, "verified", bad);
      }
      await page.setContent(html);
      await page.locator('button').evaluate(element => element.removeAttribute('type'));
      assert.equal((await proof()).status,"verified","default button outside every form is non-transactional");
      const ordinary = await buildConsentActionControlProof({action: "reject",page,control:page.locator('#onetrust-reject-all-handler'),
        observedAtMs:1,recipeId:"unregistered",selectorHint:recipe.controlSelector,authorizedTargetSha256:hash(page.url())});
      assert.notEqual(ordinary.status,"verified");
      assert.equal(classifyConsentControlLabel({usage:"action",label,contextText:text,hasConsentContext:true}).intent,"unknown");
    }
  } finally {await browser.close();}
});

test("Portuguese final dispatch guard rejects label, source and banner drift", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const html = '<section id="onetrust-banner-sdk"><p>Utilizamos cookies.</p><button type="button" id="onetrust-reject-all-handler">Rejeitar</button></section>';
    await page.setContent(html);
    const result = await buildConsentActionControlProof({action:"reject",page,control:page.locator('button'),cmpId:"OneTrust",
      observedAtMs:1,recipeId:recipe.recipeId,selectorHint:recipe.controlSelector,authorizedTargetSha256:hash(page.url())});
    assert.equal(result.status,"verified");if(result.status!=="verified")return;
    for (const mutation of [
      html.replace('>Rejeitar<','>Accept all<'),
      html.replace('type="button"','type="button" aria-label="Accept all"'),
      html.replace('id="onetrust-banner-sdk"','id="unrelated"'),
      html.replace('</section>','<button type="button" id="onetrust-reject-all-handler">Rejeitar</button></section>'),
    ]) {await page.setContent(mutation);await assert.rejects(assertReviewedRejectDispatchAllowed({page,control:page.locator('button').first(),proof:result.proof}),/binding_changed/);}
  } finally {await browser.close();}
});

for (const label of ["Strictly Necessary", "Essential Cookies", "Rejeitar"] as const) {
  test(`canonical Reject observer dispatches ${label} once and verifies a complete fresh receipt`, async () => {
    let clicks = 0;
    const text = label === "Rejeitar" ? "Utilizamos cookies. Pode aceitar ou rejeitar cookies." : instructions[label];
    const server = createServer((request, response) => {
      if (request.url === "/clicked") {clicks++;response.end("ok");return;}
      response.setHeader("content-type", "text/html");
      response.end(`<section id="onetrust-banner-sdk"><p>${text}</p><button id="onetrust-reject-all-handler">${label}</button></section>
        <script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
        document.cookie='OptanonConsent=groups=C0001:1,C0002:0&stamp=before;path=/';
        document.querySelector('button').onclick=()=>{fetch('/clicked');document.cookie='OptanonConsent=groups=C0001:1,C0002:0&stamp=after;path=/';document.querySelector('section').remove()};</script>`);
    });
    await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
    const address=server.address();assert.ok(address && typeof address!=="string");
    try {
      const packet = await runPostRefusalObserver({scanId:`eligible-${label}`,url:`http://127.0.0.1:${address.port}/`,recipe,
        recipeCandidates:buildCanonicalPostRefusalActionRecipes(),allowCanonicalRejectDiscovery:true,
        recipeSetId:CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
        interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},resultBudgetMs:5000,
        actionSearchTimeoutMs:1000,confirmationTimeoutMs:300,observationWindowMs:100,dispatchDelayMs:0});
      assert.equal(clicks,1,JSON.stringify(packet.limitations));assert.equal(packet.interactionDiagnostics?.click.outcome,"completed");
      assert.equal(packet.refusalRegistration.status,"confirmed");
      assert.equal(packet.decisionEvidence?.decision,"denied");
      assert.equal(consentActionControlProofSchema.safeParse(packet.actionControlProof).success,true);
    } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}

test("Reject guard veto remains unattempted even when a fresh refusal receipt appears", async () => {
  let clicks = 0, lifecycleEvents = 0, contextReads = 0, mutations = 0;
  const server = createServer((request, response) => {
    if (request.url === "/clicked") {clicks++;response.end("ok");return;}
    response.setHeader("content-type", "text/html");
    response.end(`<section id="onetrust-banner-sdk"><p>${instructions["Strictly Necessary"]}</p>
      <button type="button" id="onetrust-reject-all-handler">Strictly Necessary</button></section>
      <script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
      document.cookie='OptanonConsent=groups=C0001:1,C0002:0&stamp=before;path=/';
      document.querySelector('button').onclick=()=>fetch('/clicked');</script>`);
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  const address = server.address();assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({headless:true});
  const probe = await browser.newPage();
  // Inject drift at the final proof read, after both initial bound-context reads.
  // Interception is test-only; no observer hook changes production eligibility.
  const locatorPrototype = Object.getPrototypeOf(probe.locator("button"));
  const evaluate = locatorPrototype.evaluate;
  locatorPrototype.evaluate = async function(fn: unknown, arg: any, ...rest: unknown[]) {
    if (arg?.bannerSelector === "#onetrust-banner-sdk" &&
      arg?.controlSelector === "#onetrust-reject-all-handler" && ++contextReads === 3) {
      mutations++;
      await evaluate.call(this, (element: Element) => {
        element.closest("section")?.querySelector("p")?.remove();
        document.cookie='OptanonConsent=groups=C0001:1,C0002:0&stamp=unsolicited;path=/';
      });
    }
    return evaluate.call(this,fn,arg,...rest);
  };
  try {
    const packet = await runPostRefusalObserver({scanId:"guard-veto",url:`http://127.0.0.1:${address.port}/`,browser,
      recipe,recipeCandidates:buildCanonicalPostRefusalActionRecipes(),allowCanonicalRejectDiscovery:true,
      recipeSetId:CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
      interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"},resultBudgetMs:5000,
      actionSearchTimeoutMs:1000,confirmationTimeoutMs:300,observationWindowMs:100,dispatchDelayMs:0,
      onLifecycleEvent:()=>{lifecycleEvents++;}});
    assert.equal(mutations,1,"fixture must reach the final dispatch proof");
    assert.equal(clicks,0);assert.equal(lifecycleEvents,0);
    assert.equal(packet.refusalRegistration.status,"not_attempted");
    assert.equal(packet.interactionDiagnostics?.click.outcome,"not_attempted");
    assert.equal(packet.afterActionCapture,undefined);
    assert.equal(packet.decisionEvidence?.decision,"unknown");
    assert.equal(packet.decisionEvidence?.basis,"unverified");
    assert.ok(packet.limitations.includes("reviewed_reject_dispatch_guard_failed"));
  } finally {
    locatorPrototype.evaluate = evaluate;
    await browser.close();server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
