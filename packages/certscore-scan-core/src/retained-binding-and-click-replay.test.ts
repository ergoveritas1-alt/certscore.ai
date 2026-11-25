import caiaHandlers from "./test-fixtures/caia-consent-handlers.json";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { chromium } from "playwright";
import {
  CAIA_ACCEPT_CONTROL, DAFITI_ADOPT_ACCEPT_CONTROL, consentActionControlProofSchema, postAcceptEvidencePacketSchema,
  postRefusalEvidencePacketSchema, type CanonicalEvidenceBundle,
} from "@certscore/contracts";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { bindAccessibilityNodesToDom } from "./consent-accessibility-dom-binding.js";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import {
  consentControlsFromAccessibilityTree, consentUiObservationFromAccessibilityInventory,
  filterAccessibilityTreeToFirstLayer, readRapidFirstLayerConsentUiObservation,
  reconcileConsentUiObservationWithCompletedGeometry,
} from "./scanners/pre-consent-runtime-scanner.js";

const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const adopt = DAFITI_ADOPT_ACCEPT_CONTROL;
const prozis = "https://www.prozis.com/us/us/";
const nrdc = "https://www.nrdc.org/";
const secretHostess = "https://secrethostess.com/";
const oneTrust = "#onetrust-accept-btn-handler";
const cookieBotAccept = "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll";
const cookieBotReject = "#CybotCookiebotDialogBodyButtonDecline";

function choiceScript(controls: Array<{selector: string; action: string}>) {
  return `<script>
    for (const {selector, action} of ${JSON.stringify(controls)}) {
      const button = document.querySelector(selector);
      button?.addEventListener('click', event => {
        if (!event.isTrusted) return;
        fetch('/clicked/' + action, {method:'POST'});
        const granted = action === 'accept';
        document.cookie = 'CookieConsent=' + encodeURIComponent(JSON.stringify({
          necessary:true, preferences:granted, statistics:granted, marketing:granted
        })) + ';path=/';
        document.cookie = 'OptanonConsent=groups=C0001:1,C0002:' + (granted ? '1' : '0') + ';path=/';
        button.closest('section').hidden = true;
      });
    }
  </script>`;
}

const prozisMarkup = `<section role="dialog" id="CybotCookiebotDialog" aria-label="Cookie preferences">
  <p>We use cookies. Choose which cookies to allow.</p>
  <button id="configure">Cookie settings</button><button id="details">Privacy preferences</button>
  <button id="${cookieBotAccept.slice(1)}">Allow all cookies</button>
  <button id="${cookieBotReject.slice(1)}">Use necessary cookies only</button>
</section><script>window.Cookiebot = {};</script>` + choiceScript([
  {selector: cookieBotAccept, action: "accept"}, {selector: cookieBotReject, action: "reject"},
]);
const adoptMarkup = `<section role="dialog" id="cookie-banner" aria-label="Configurações de cookies">
  <p>Usamos cookies para melhorar sua experiência. Você pode configurar cookies.</p>
  <button type="button" id="adopt-accept-all-button">Aceitar</button>
</section>` + choiceScript([{selector: adopt.controlSelector, action: "accept"}]);
const oneTrustMarkup = `<section role="dialog" id="onetrust-banner-sdk" aria-label="Cookie preferences">
  <p>We use cookies. Choose optional cookies.</p>
  <div id="onetrust-button-group"><button id="onetrust-accept-btn-handler">Allow all</button></div>
</section><script>
  window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
  document.cookie='OptanonConsent=groups=C0001:1,C0002:0;path=/';
</script>` + choiceScript([{selector: oneTrust, action: "accept"}]);

async function replayFixture(t: TestContext, url: string, passiveMarkup: string, workerMarkup = passiveMarkup) {
  for (const flag of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW", "CERTSCORE_REJECT_GATE_PRODUCTION_SHADOW"]) {
    const previous = process.env[flag];
    process.env[flag] = "1";
    t.after(() => { if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous; });
  }
  const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const clicks: string[] = [];
  let contextCount = 0;
  const newContext = browser.newContext.bind(browser);
  t.mock.method(browser, "newContext", async (options: Parameters<typeof newContext>[0]) => {
    const passive = ++contextCount === 1;
    const context = await newContext({...options, serviceWorkers: "block"});
    await context.route("**/*", async route => {
      const request = route.request();
      if (request.url() === url) {
        await route.fulfill({contentType: "text/html", body: '<meta charset="utf-8"><main>Local fixture</main>' +
          (passive ? passiveMarkup : workerMarkup)});
      } else if (request.method() === "POST" && new URL(request.url()).origin === new URL(url).origin &&
          /^\/clicked\/(accept|reject)$/.test(new URL(request.url()).pathname)) {
        clicks.push(new URL(request.url()).pathname.split("/").at(-1)!);
        await route.fulfill({status: 204});
      } else {
        await route.abort();
      }
    });
    return context;
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const startedAtMs = Date.now();
  await page.goto(url);
  const cdp = await context.newCDPSession(page);
  const documentIdentity = {source: "cdp_loader_id" as const, token: (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId};
  const raw = await readRapidFirstLayerConsentUiObservation(page, startedAtMs, 1500);
  assert.ok(raw.captureDiagnostics?.completedChannels.includes("dom_inventory"));
  const geometry = await capturePassiveConsentControlGeometry(page, {documentIdentity, timeoutMs: 1500});
  const current = {...raw, documentIdentity, documentUrl: url};
  let observation = reconcileConsentUiObservationWithCompletedGeometry({
    current, geometry, geometryAccessLoaded: true, pageUrl: url, scanStartedAtMs: startedAtMs,
  });
  if (url === prozis) {
    // The retained production observation came from AX. Read the original
    // backend nodes through Chromium with DOM controls ahead of both action buttons.
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const visible = await filterAccessibilityTreeToFirstLayer(cdp, tree.nodes, page.viewportSize());
    const bound = await bindAccessibilityNodesToDom(cdp, visible, {url, identity: documentIdentity});
    const inventory = {...consentControlsFromAccessibilityTree(bound, url), captureStatus: "completed" as const};
    const axObservation = consentUiObservationFromAccessibilityInventory(inventory, startedAtMs, url, documentIdentity);
    observation = {...observation, controls: axObservation.controls, acceptControlObserved: axObservation.acceptControlObserved,
      rejectControlObserved: axObservation.rejectControlObserved};
    for (const selector of [cookieBotAccept, cookieBotReject]) {
      assert.ok(observation.controls.some(control => control.domBinding?.verifiedButtonSelector === selector), selector);
    }
  }
  await context.close();
  const scanId = new URL(url).hostname;
  const bundle = {
    url, scanId, startedAt: new Date(startedAtMs).toISOString(),
    domSnapshots: [{url, documentIdentity, artifactId: "dom_text_pre_consent", consentStateAtTime: "pre_consent"}],
    consentSurfaceInspection: {inspectedPreInteraction: true, inspectionCompleted: true,
      actionableControlObserved: observation.acceptControlObserved || observation.rejectControlObserved},
    consentUiObservations: [observation],
  } as CanonicalEvidenceBundle;
  const bytes = Buffer.from(JSON.stringify(geometry));
  const gateInput = () => {
    const nowMs = Date.now();
    return {
      bundle, scanId, targetUrl: url, sourceSha256: sha(JSON.stringify(bundle)), parentDispatchSha256: sha(scanId),
      geometry: {bytes, sha256: sha(bytes), sizeBytes: bytes.length}, nowMs, deadlineAtMs: nowMs + 6_000,
    };
  };
  const observerInput = {
    browser, url, scanId, parentScanId: scanId, actionSearchTimeoutMs: 5_800, confirmationTimeoutMs: 500,
    observationWindowMs: 300, resultBudgetMs: 7_000,
    interactionAuthorization: {kind: "scan_target" as const, authorizationId: "sharded_scan_exact_target.v1" as const,
      scanId, normalizedUrl: url},
  };
  return {gateInput, observerInput, observation, geometry, clicks};
}

test("Prozis replay binds both Cookiebot AX controls and delivers exact click receipts", async t => {
  const fixture = await replayFixture(t, prozis, prozisMarkup);
  const proof = deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector: true});
  assert.ok(proof, JSON.stringify(fixture.observation.controls));
  assert.equal(proof.exactSelector, cookieBotAccept);
  const acceptClicks: number[] = [];
  const accept = postAcceptEvidencePacketSchema.parse(await runPostAcceptObserver({
    ...fixture.observerInput, firstLayerProof: proof, allowCanonicalAcceptDiscovery: true,
    recipe: buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "Cookiebot")!,
    onExactAcceptClickCompleted: click => acceptClicks.push(click.completedAtMs),
  }));
  assert.equal(accept.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(accept.resolver));
  assert.equal(acceptClicks.length, 1);
  const acceptReserveMs = proof.expiresAtMs - acceptClicks[0]!;
  assert.ok(acceptReserveMs >= 200);
  t.diagnostic(`Prozis Accept receipt, action reserve ${acceptReserveMs} ms`);
  const decision = evaluateRejectGate(fixture.gateInput());
  assert.equal(decision.outcome, "qualified", JSON.stringify(decision));
  const rejectProof = readRejectFirstLayerProof({...decision, scanId: fixture.observerInput.scanId});
  assert.ok(rejectProof);
  assert.equal(rejectProof.exactSelector, cookieBotReject);
  const rejectClicks: number[] = [];
  const reject = postRefusalEvidencePacketSchema.parse(await runPostRefusalObserver({
    ...fixture.observerInput, firstLayerProof: rejectProof,
    parentDispatchSha256: fixture.gateInput().parentDispatchSha256, allowCanonicalRejectDiscovery: true,
    recipe: buildCanonicalPostRefusalActionRecipes().find(recipe => recipe.cmpId === "Cookiebot")!,
    onExactRejectClickCompleted: click => rejectClicks.push(click.completedAtMs),
  }));
  assert.equal(reject.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(reject.resolver));
  assert.equal(rejectClicks.length, 1);
  const rejectReserveMs = rejectProof.expiresAtMs - rejectClicks[0]!;
  assert.ok(rejectReserveMs >= 200);
  t.diagnostic(`Prozis Reject receipt, action reserve ${rejectReserveMs} ms`);
  assert.deepEqual(fixture.clicks, ["accept", "reject"]);
});

for (const changed of [false, true]) {
  test(`Dafiti replay ${changed ? "blocks a changed live banner" : "delivers one scoped Accept receipt"}`, async t => {
    const fixture = await replayFixture(t, adopt.targetUrl, adoptMarkup, changed ? adoptMarkup.replace('id="cookie-banner"', 'id="other-banner"') : adoptMarkup);
    let blocked: string | undefined;
    const proof = deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector: true,
      onDecision: decision => { if (decision.outcome === "blocked") blocked = decision.reason; }});
    assert.ok(proof, JSON.stringify({blocked, controls: fixture.observation.controls, geometry: fixture.geometry.candidates}));
    const clicks: number[] = [];
    const packet = postAcceptEvidencePacketSchema.parse(await runPostAcceptObserver({
      ...fixture.observerInput, firstLayerProof: proof, allowCanonicalAcceptDiscovery: true,
      recipe: buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "OneTrust")!,
      onExactAcceptClickCompleted: click => clicks.push(click.completedAtMs),
    }));
    if (changed) {
      assert.deepEqual(clicks, []);
      assert.deepEqual(fixture.clicks, []);
    } else {
      assert.ok(consentActionControlProofSchema.safeParse(packet.actionControlProof).success);
      assert.equal(packet.actionControlProof?.recipeId, adopt.recipeId, JSON.stringify({resolver:packet.resolver,limitations:packet.limitations}));
      assert.deepEqual(fixture.clicks, ["accept"]);
      assert.equal(clicks.length, 1);
      const reserveMs = proof.expiresAtMs - clicks[0]!;
      assert.ok(reserveMs >= 200);
      t.diagnostic(`Dafiti Accept receipt, action reserve ${reserveMs} ms`);
    }
  });
}

test("SecretHostess replay leaves the age-gate Decline outside consent authorization", async t => {
  const fixture = await replayFixture(t, secretHostess, `<section role="dialog" aria-label="Age verification">
    <p>Confirm you are old enough to enter this website.</p>
    <a id="age_agree_decline_button" href="/underage">Decline</a>
  </section>`);
  assert.equal(deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector: true}), undefined);
  assert.equal(evaluateRejectGate(fixture.gateInput()).outcome, "blocked");
  assert.deepEqual(fixture.clicks, []);
});

test("NRDC replay with the retained disabled or obstructed stages never clicks", async t => {
  const worker = oneTrustMarkup + `<style>#blocker { position:fixed; inset:0; z-index:1000; }</style>
    <div id="blocker"></div><script>
    const consentButton = document.querySelector('${oneTrust}');
    setTimeout(() => { consentButton.disabled = true; document.querySelector('#blocker').hidden = true; }, 3_616);
    setTimeout(() => { document.querySelector('#blocker').hidden = false; consentButton.disabled = false; }, 4_749);
    setTimeout(() => { consentButton.disabled = true; document.querySelector('#blocker').hidden = true; }, 5_048);
    </script>`;
  const fixture = await replayFixture(t, nrdc, oneTrustMarkup, worker);
  const proof = deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector: true});
  assert.ok(proof);
  const packet = await runPostAcceptObserver({
    ...fixture.observerInput, firstLayerProof: proof,
    recipe: buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "OneTrust")!,
    onExactAcceptClickCompleted: () => assert.fail("Disabled or obstructed control dispatched a click"),
  });
  assert.equal(packet.interactionDiagnostics?.click.outcome, "not_attempted");
  assert.deepEqual(fixture.clicks, []);
});

test("NRDC timing variant retains a receipt if the exact OneTrust control becomes actionable with reserve", async t => {
  const worker = oneTrustMarkup + `<script>
    const consentButton = document.querySelector('${oneTrust}');
    consentButton.disabled = true;
    setTimeout(() => { consentButton.disabled = false; }, 5_100);
  </script>`;
  const fixture = await replayFixture(t, nrdc, oneTrustMarkup, worker);
  const proof = deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector: true});
  assert.ok(proof);
  const clicks: number[] = [];
  const packet = postAcceptEvidencePacketSchema.parse(await runPostAcceptObserver({
    ...fixture.observerInput, firstLayerProof: proof,
    recipe: buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "OneTrust")!,
    onExactAcceptClickCompleted: click => clicks.push(click.completedAtMs),
  }));
  assert.equal(packet.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(packet.interactionDiagnostics));
  assert.equal(clicks.length, 1);
  assert.deepEqual(fixture.clicks, ["accept"]);
  const reserveMs = proof.expiresAtMs - clicks[0]!;
  assert.ok(reserveMs >= 200);
  t.diagnostic(`NRDC actionable fixture variant, action reserve ${reserveMs} ms`);
});

test("CAIA's Swedish cookie banner records Accept and Settings and leaves Reject unobserved", async t => {
  const fixture = await replayFixture(t, "https://caiacosmetics.se/", `
    <nav><button id="account-settings">Inställningar</button></nav>
    <section role="dialog" aria-labelledby="cookie-title"
      style="position:fixed;inset:auto 1rem 1rem;background:#fff;padding:1rem">
      <h2 id="cookie-title">Cookies och liknande tekniker</h2>
      <p>Beauty Icons AB använder cookies och liknande lagringstekniker för anpassat innehåll.
        Läs mer om cookies i vår <a href="/cookiepolicy">cookiepolicy</a>.</p>
      <button type="button" id="cookie-settings">INSTÄLLNINGAR</button>
      <button type="button" id="cookie-accept">JAG GODKÄNNER</button>
    </section>`);
  const controls = fixture.observation.controls.filter(control => control.visible);
  for (const [label, action] of [["JAG GODKÄNNER", "accept_all"], ["INSTÄLLNINGAR", "manage_preferences"]]) {
    assert.ok(controls.some(control => control.label === label && control.actionType === action),
      JSON.stringify({label, controls: controls.map(control => [control.label, control.actionType, control.selectorHint])}));
    assert.ok(fixture.geometry.candidates.some(candidate =>
      candidate.label === label && candidate.actionType === action &&
      candidate.layer === "first_layer" && candidate.decisionStatus === "confirmed_visible"),
    `The retained geometry should confirm ${label}`);
  }
  assert.ok(!controls.some(control => control.selectorHint === "#account-settings" || control.actionType === "reject_all"));
  assert.equal(fixture.observation.acceptControlObserved, true);
  assert.equal(fixture.observation.managePreferencesControlObserved, true);
  assert.equal(fixture.observation.rejectControlObserved, false);
  assert.equal(deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector:true}), undefined);
  assert.equal(evaluateRejectGate(fixture.gateInput()).outcome, "blocked");
  assert.deepEqual(fixture.clicks, []);
});

for (const variant of ["original", "extra-listener", "changed-writer", "duplicate", "moved"] as const) {
  test(`CAIA exact published span and listener chain, ${variant}`, async t => {
    const caia = CAIA_ACCEPT_CONTROL;
    const markup = `
      <nav><button id="account-settings">Inställningar</button></nav>
      <div id="cookie_consent_manager_wrapper">
        <div id="cookie_consent" style="position:fixed;inset:auto 1rem 1rem;background:#fff;padding:1rem">
          <div id="cookie_consent_text">
            <p>Cookies och liknande tekniker. Vi använder cookies för personanpassad marknadsföring.</p>
            <div class="button-wrapper" style="display:flex;gap:1rem">
              <span class="Knapp_Generell" id="cookie_consent_manage">INSTÄLLNINGAR</span>
              <span class="Knapp_Generell" id="cookie_consent_manage_rec">JAG GODKÄNNER</span>
            </div>
          </div>
        </div>
        <div id="cookie_consent_manager" style="display:none">
          ${[1,2,3,4].map(id => `<input type="checkbox" value="${id}">`).join("")}
          <div id="cookie_consent_manager_confirm">SPARA</div>
        </div>
      </div>`;
    const handlers = (change: typeof variant) => `<script>
      var cm_action = ${caiaHandlers.apply};
      var set_cookie_consent = ${change === "changed-writer" ? "() => {}" : caiaHandlers.write};
      var consent_action = () => fetch("/clicked/accept", {method:"POST"});
      document.getElementById("cookie_consent_manage_rec").addEventListener("click", ${caiaHandlers.accept});
      document.getElementById("cookie_consent_manager_confirm").addEventListener("click", ${caiaHandlers.confirm});
      ${change === "extra-listener" ? 'document.querySelector("#cookie_consent_manage_rec").addEventListener("click", () => {});' : ""}
      ${change === "duplicate" ? 'document.querySelector("#cookie_consent_manage_rec").after(document.querySelector("#cookie_consent_manage_rec").cloneNode(true));' : ""}
      ${change === "moved" ? 'document.body.prepend(document.querySelector("#cookie_consent_manage_rec"));' : ""}
    </script>`;
    const fixture = await replayFixture(t, caia.targetUrl, markup + handlers("original"), markup + handlers(variant));
    let blocked: string | undefined;
    const proof = deriveAcceptFirstLayerProof({...fixture.gateInput(), requireExactSelector:true,
      onDecision: decision => { if (decision.outcome === "blocked") blocked = decision.reason; }});
    assert.ok(proof, JSON.stringify({blocked, controls:fixture.observation.controls,
      geometry:fixture.geometry.candidates.filter(candidate => candidate.tagName === "span"),
      inspection:fixture.geometry.controlInspection}));
    assert.equal(proof.exactSelector, caia.controlSelector);
    assert.equal(evaluateRejectGate(fixture.gateInput()).outcome, "blocked");
    const receipts: number[] = [];
    const packet = postAcceptEvidencePacketSchema.parse(await runPostAcceptObserver({
      ...fixture.observerInput, firstLayerProof:proof, allowCanonicalAcceptDiscovery:true,
      recipe:buildCanonicalPostAcceptActionRecipes().find(recipe => recipe.cmpId === "OneTrust")!,
      onExactAcceptClickCompleted: click => receipts.push(click.completedAtMs),
    }));
    if (variant !== "original") {
      assert.deepEqual(fixture.clicks, []);
      assert.deepEqual(receipts, []);
      assert.notEqual(packet.interactionDiagnostics?.click.outcome, "completed");
      return;
    }
    assert.equal(packet.actionControlProof?.recipeId, caia.recipeId,
      JSON.stringify({resolver:packet.resolver, limitations:packet.limitations}));
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
    assert.equal(packet.acceptanceRegistration.status, "confirmed");
    assert.ok(packet.acceptanceRegistration.witnesses.some(witness => witness.key === caia.cookieName));
    assert.deepEqual(fixture.clicks, ["accept"]);
    assert.equal(receipts.length, 1);
    const reserveMs = proof.expiresAtMs - receipts[0]!;
    assert.ok(reserveMs >= 200);
    t.diagnostic(`CAIA verified Accept receipt and consent cookie, action reserve ${reserveMs} ms`);
  });
}
