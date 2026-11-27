import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";
import { classifyConsentControlLabel, consentActionControlProofSchema, REVIEWED_COOKIE_ACCEPT_CONTROLS, REVIEWED_COOKIE_REJECT_CONTROLS, UNSW_NECESSARY_ONLY_REJECT } from "@certscore/contracts";
import { assertReviewedRejectDispatchAllowed, buildConsentActionControlProof, dispatchWorkerDiscoveredConsentControl } from "./cmp-action-control-proof.js";
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

for (const label of ["Strictly Necessary", "Essential Cookies", "Accept only necessary", "Rejeitar"] as const) {
  test(`canonical Reject observer dispatches ${label} once and verifies a complete fresh receipt`, async () => {
    let clicks = 0;
    const text = label === "Rejeitar" ? "Utilizamos cookies. Pode aceitar ou rejeitar cookies." : label === "Accept only necessary" ? "We use cookies for analytics and advertising." : instructions[label];
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

test("OneTrust's exact Accept only necessary label uses versioned named proof, never generic action vocabulary", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const html = '<section id="onetrust-banner-sdk"><p>We use cookies for analytics and advertising.</p><button type="button" id="onetrust-reject-all-handler">Accept only necessary</button></section>';
    const proof = () => buildConsentActionControlProof({action:"reject",page,control:page.locator('#onetrust-reject-all-handler').first(),
      observedAtMs:1,cmpId:"OneTrust",recipeId:recipe.recipeId,selectorHint:recipe.controlSelector,authorizedTargetSha256:hash(page.url())});
    await page.setContent(html);
    const result = await proof();assert.equal(result.status,"verified",JSON.stringify(result));
    if(result.status!=="verified")return;
    assert.equal(result.proof.labelBoundNecessaryOnly?.policyVersion,"label_bound_necessary_only_reject.v2");
    assert.equal(consentActionControlProofSchema.safeParse(result.proof).success,true);
    assert.equal(consentActionControlProofSchema.safeParse({...result.proof,labelBoundNecessaryOnly:{...result.proof.labelBoundNecessaryOnly,policyVersion:"label_bound_necessary_only_reject.v1"}}).success,false,"historical v1 does not acquire the new label");
    assert.equal(classifyConsentControlLabel({label:"Accept only necessary",hasConsentContext:true,usage:"action"}).intent,"unknown");
    for(const bad of [html.replace('id="onetrust-banner-sdk"','id="other"'),`<form>${html}</form>`,
      html.replace('type="button"','type="button" aria-label="Accept all"'),html.replace('Accept only necessary','Accept only necessary or accept all'),
      html.replace('</section>','<button id="onetrust-reject-all-handler">Accept only necessary</button></section>')]) {
      await page.setContent(bad);assert.notEqual((await proof()).status,"verified",bad);
      await assert.rejects(assertReviewedRejectDispatchAllowed({page,control:page.locator('#onetrust-reject-all-handler').first(),proof:result.proof}),/binding_changed/);
    }
  } finally {await browser.close();}
});


const unsw = UNSW_NECESSARY_ONLY_REJECT;
for (const {site, url, requestedUrl, label, text, policyVersion} of [
  {site: "IATA", url: "https://www.iata.org/", requestedUrl: "https://iata.org/", label: "Accept Only Necessary",
    text: "Selecting Accept All enables tracking technologies. Selecting Accept Only Necessary or withdrawing your consent will disable them.",
    policyVersion: "label_bound_necessary_only_reject.v2"},
  {site: "UNSW", url: unsw.documentUrl, requestedUrl: unsw.requestedUrl, label: unsw.label,
    text: unsw.instruction, policyVersion: unsw.policyVersion},
] as const) {
  test(`the independent ${site} Reject worker rechecks the same native button and visible instructions`, async t => {
    const buttonSelector = "#onetrust-reject-all-handler";
    const html = `<section id="onetrust-banner-sdk"><p>${text}</p>
      <button type="button" id="onetrust-reject-all-handler">${label}</button></section>`;
    const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
    t.after(() => browser.close());
    const context = await browser.newContext({serviceWorkers: "block"});
    // tsx keeps nested function names in callbacks serialized into Chromium.
    await context.addInitScript("globalThis.__name ??= value => value;");
    const page = await context.newPage();
    await context.route("**/*", route => route.request().url() === url
      ? route.fulfill({contentType: "text/html", body: html}) : route.abort("blockedbyclient"));
    for (const mutation of ["none", "instructions changed", "duplicate", "opposite accessible label", "different request"]) {
      await page.goto(url);
      const proof = await buildConsentActionControlProof({
        page, control: page.locator(buttonSelector), bindElement: true, workerDiscovered: true, action: "reject",
        observedAtMs: 1, cmpId: "OneTrust", recipeId: recipe.recipeId, selectorHint: recipe.controlSelector,
        authorizedTargetSha256: hash(url),
      });
      assert.ok(proof.status === "verified" && proof.boundElement, JSON.stringify(proof));
      assert.equal(proof.proof.labelBoundNecessaryOnly?.policyVersion, policyVersion);
      await proof.boundElement.evaluate(element => {
        element.addEventListener("click", event => {
          if (event.isTrusted) element.setAttribute("data-clicked", "true");
        });
      });
      if (mutation === "instructions changed") {
        // Preserve the qualifying sentence while replacing the surrounding instructions.
        await page.locator("p").evaluate(element => element.prepend("Changed instructions. "));
      } else if (mutation === "duplicate") {
        await proof.boundElement.evaluate(element => element.parentElement?.append(element.cloneNode(true)));
      } else if (mutation === "opposite accessible label") {
        await proof.boundElement.evaluate(element => element.setAttribute("aria-label", "Accept all"));
      }
      const deadlineAtMs = Date.now() + 2_000;
      let committed = 0;
      const result = dispatchWorkerDiscoveredConsentControl({
        page, requestedUrl: mutation === "different request" ? url : requestedUrl, control: proof.boundElement, proof: proof.proof,
        deadlineAtMs, assertCurrent: () => {}, commit: () => { committed++; },
      });
      if (mutation === "none") {
        const click = await result;
        assert.ok(consentActionControlProofSchema.safeParse(click.control).success);
        assert.equal(click.control.labelBoundNecessaryOnly?.policyVersion, policyVersion);
        assert.ok(deadlineAtMs - click.completedAtMs >= 200);
        assert.equal(committed, 1);
        assert.equal(await page.locator("[data-clicked]").count(), 1);
      } else {
        await assert.rejects(result, /worker_consent_control_(?:unbound|changed)|worker_consent_exact_selector_unavailable/, mutation);
        assert.equal(committed, 0, mutation);
        assert.equal(await page.locator("[data-clicked]").count(), 0, mutation);
      }
    }
  });
}


test("reviewed worker cookie controls require a visible notice and a unique non-transactional button", async t => {
  const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const context = await browser.newContext({serviceWorkers: "block"});
  await context.addInitScript("globalThis.__name ??= value => value;");
  const page = await context.newPage();
  for (const [action, controls] of [["accept", REVIEWED_COOKIE_ACCEPT_CONTROLS], ["reject", REVIEWED_COOKIE_REJECT_CONTROLS]] as const) {
    for (const scope of controls) {
      const labelAttribute = "labelSource" in scope && scope.labelSource === "aria_label" ? ` aria-label="${scope.label}"` : "";
      const button = `<button type="button" id="${scope.controlSelector.slice(1)}"${labelAttribute}>${scope.label}</button>`;
      const html = `<meta charset="utf-8"><section id="${scope.bannerSelector.slice(1)}"><p>${scope.notice}</p>${button}</section>`;
      await context.route("**/*", route => route.request().url() === scope.documentUrl
        ? route.fulfill({contentType: "text/html", body: html}) : route.abort("blockedbyclient"));
      const getProof = () => buildConsentActionControlProof({
        page, control: page.locator(scope.controlSelector).first(), bindElement: true, workerDiscovered: true, action,
        observedAtMs: 1, recipeId: `canonical-control:${action}:fixture`, selectorHint: scope.controlSelector,
        authorizedTargetSha256: scope.documentSha256,
      });
      await page.goto(scope.documentUrl);
      const verified = await getProof();
      assert.ok(verified.status === "verified" && verified.boundElement, `${scope.documentUrl} ${JSON.stringify(verified)}`);
      assert.ok(consentActionControlProofSchema.safeParse(verified.proof).success, scope.documentUrl);
      assert.ok(verified.proof.classifierReasonCodes.includes(scope.proofReason));
      await page.locator("p").evaluate(element => {element.style.opacity = "0";});
      let committed = false;
      await assert.rejects(dispatchWorkerDiscoveredConsentControl({
        page, requestedUrl: "requestedUrl" in scope ? scope.requestedUrl : scope.documentUrl, control: verified.boundElement,
        proof: verified.proof, deadlineAtMs: Date.now() + 2_000, assertCurrent: () => {}, commit: () => {committed = true;},
      }), /worker_consent_control_changed_before_dispatch/, scope.documentUrl);
      assert.equal(committed, false, scope.documentUrl);
      for (const changed of [html.replace(button, button + button), `<form>${html}</form>`]) {
        await page.setContent(changed);
        assert.notEqual((await getProof()).status, "verified", scope.documentUrl);
      }
      await context.unroute("**/*");
    }
  }
});

test("independent worker separates sibling consent choices while guarding same-intent duplicates", async t => {
  const url = "https://fixture.example.com/";
  const selector = "#cookie-choices button";
  const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const context = await browser.newContext({serviceWorkers: "block"});
  await context.addInitScript("globalThis.__name ??= value => value;");
  await context.route("**/*", route => route.request().url() === url
    ? route.fulfill({contentType: "text/html", body: `<section role="dialog" aria-label="Cookie choices" id="cookie-choices">
        <button type="button">Accept all</button><button type="button">Reject all</button>
        <button type="button">Cookie settings</button></section>`})
    : route.abort("blockedbyclient"));
  const page = await context.newPage();

  for (const action of ["accept", "reject"] as const) {
    const label = action === "accept" ? "Accept all" : "Reject all";
    const equivalent = action === "accept" ? "Allow all cookies" : "Decline all";
    for (const change of ["none", "second choice", "label", "replacement"]) {
      await page.goto(url);
      await page.locator("#cookie-choices").evaluate(group => {
        group.addEventListener("click", event => {
          if (event.isTrusted && event.target instanceof HTMLButtonElement) {
            group.setAttribute("data-clicked", event.target.textContent ?? "");
          }
        });
      });
      const proof = await buildConsentActionControlProof({
        page, control: page.getByRole("button", {name: label, exact: true}), bindElement: true, workerDiscovered: true,
        action, observedAtMs: 1, recipeId: `canonical-control:${action}:group-fixture`,
        selectorHint: selector, authorizedTargetSha256: hash(url),
      });
      assert.ok(proof.status === "verified" && proof.boundElement, JSON.stringify(proof));
      if (change === "second choice") {
        await page.locator("#cookie-choices").evaluate((group, competingLabel) => {
          const competitor = document.createElement("button");
          competitor.type = "button";
          competitor.textContent = competingLabel;
          group.append(competitor);
        }, equivalent);
      } else if (change === "label") {
        await proof.boundElement.evaluate((element, changedLabel) => {element.textContent = changedLabel;}, equivalent);
      } else if (change === "replacement") {
        await proof.boundElement.evaluate(element => element.replaceWith(element.cloneNode(true)));
      }
      let commitCount = 0;
      const deadlineAtMs = Date.now() + 2_000;
      const result = dispatchWorkerDiscoveredConsentControl({
        page, requestedUrl: url, control: proof.boundElement, proof: proof.proof, deadlineAtMs,
        assertCurrent: () => {}, commit: () => {commitCount++;},
      });
      if (change === "none") {
        const clicked = await result;
        assert.ok(deadlineAtMs - clicked.completedAtMs >= 200);
        assert.equal(commitCount, 1);
        assert.equal(await page.locator("#cookie-choices").getAttribute("data-clicked"), label);
      } else {
        await assert.rejects(result, /worker_consent_(?:control_changed|exact_selector_unavailable)/, change);
        assert.equal(commitCount, 0);
        assert.equal(await page.locator("#cookie-choices").getAttribute("data-clicked"), null);
      }
    }
  }
});
