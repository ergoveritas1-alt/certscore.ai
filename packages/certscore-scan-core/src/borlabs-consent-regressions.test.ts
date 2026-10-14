import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { captureConsentControlGeometry } from "./consent-control-geometry.js";
import { readRapidFirstLayerConsentUiObservation, detectConsentUi } from "./scanners/pre-consent-runtime-scanner.js";
import { installBorlabsDeferredDialogReveal, revealBorlabsDeferredDialog } from "./borlabs-passive-dialog-reveal.js";
import { readCmpApiConsentSnapshot } from "./cmp-api-consent-state.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostRefusalActionRecipes, CANONICAL_POST_REFUSAL_RECIPE_SET_ID } from "./post-refusal-cmp-recipes.js";
import { buildCanonicalPostAcceptActionRecipes, CANONICAL_POST_ACCEPT_RECIPE_SET_ID } from "./post-accept-cmp-recipes.js";

test("independent action visits initialize and reveal a deferred Borlabs dialog before one verified choice", { timeout: 25_000 }, async () => {
  const clicks: string[] = [];
  const script = `
    window.grants={essential:false,analytics:false};
    window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true},
      services:{essential:{id:'essential',serviceGroupId:'essential'},analytics:{id:'analytics',serviceGroupId:'statistics'}}};
    window.BorlabsCookie={Consents:{hasConsent:id=>window.grants[id]}};
    document.body.style.minHeight='3000px';
    const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'});
    root.innerHTML='<div class="brlbs-cmpnt-dialog-box-entrance" role="dialog" hidden style="position:fixed;top:20px;left:20px;background:white">'+
      '<p>Choose cookies for analytics</p><button id="accept">Accept all</button><button id="reject">Accept essential cookies</button></div>';
    window.dispatchEvent(new Event('borlabs-cookie-after-init'));
    addEventListener('scroll',()=>root.querySelector('[role="dialog"]').hidden=false,{once:true});
    for(const action of ['accept','reject'])root.getElementById(action).onclick=()=>{
      window.grants={essential:true,analytics:action==='accept'};
      window.dispatchEvent(new Event('borlabs-cookie-consent-saved'));
      root.querySelector('[role="dialog"]').hidden=true;fetch('/clicked/'+action);
    };
  `;
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/clicked/")) { clicks.push(req.url); res.end(); return; }
    if (req.url === "/borlabs-cookie.js") {
      res.setHeader("Content-Type", "text/javascript");
      setTimeout(() => res.end(script), 150); return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<!doctype html><body><script src="/borlabs-cookie.js"></script></body>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const common = { url, interactionAuthorization: { authorizationId: "loopback_local_lab", kind: "loopback" as const },
    actionSearchTimeoutMs: 4000, resultBudgetMs: 7000, observationWindowMs: 100, confirmationTimeoutMs: 500 };
  try {
    const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
    const reject = await runPostRefusalObserver({ ...common, scanId: "borlabs-reject", recipe: rejectRecipes[0]!, recipeCandidates: rejectRecipes, recipeSetId: CANONICAL_POST_REFUSAL_RECIPE_SET_ID, allowCanonicalRejectDiscovery: true });
    assert.equal(reject.refusalRegistration.status, "confirmed", JSON.stringify(reject));
    assert.equal(reject.resolver.cmpId, "Borlabs Cookie");
    const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
    const accept = await runPostAcceptObserver({ ...common, scanId: "borlabs-accept", recipe: acceptRecipes[0]!, recipeCandidates: acceptRecipes, recipeSetId: CANONICAL_POST_ACCEPT_RECIPE_SET_ID, allowCanonicalAcceptDiscovery: true });
    assert.equal(accept.acceptanceRegistration.status, "confirmed", JSON.stringify(accept));
    assert.deepEqual(clicks, ["/clicked/reject", "/clicked/accept"]);
    assert.ok(reject.timing.totalMs < 7000 && accept.timing.totalMs < 7000);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("Borlabs content-specific unblocking never becomes first-layer Reject through any inventory channel", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<div class="brlbs-cmpnt-content-blocker" style="margin-top:20px">
      <p>HubSpot collects personal data. Read our privacy policy to unblock this content.</p>
      <a role="button" data-borlabs-cookie-accept-service>Accept required service and unblock content</a>
    </div>`);
    const rapid = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1000);
    const full = await detectConsentUi(page, Date.now(), 0);
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(rapid.rejectControlObserved, false);
    assert.equal(full.rejectControlObserved, false);
    assert.equal(geometry.summary.firstLayerReject, false);
    assert.ok(!geometry.candidates.some(candidate => candidate.actionType === "reject_all"));
  } finally { await browser.close(); }
});

test("a configured deferred Borlabs first layer is revealed by scroll without granting consent", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<main style="height:2000px"></main><script>
      window.BorlabsCookie = {Consents:{hasConsent:()=>false}};
      window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true}};
      window.clicks=0;window.addEventListener('click',()=>window.clicks++);
      window.addEventListener('scroll',()=>document.body.insertAdjacentHTML('beforeend',
        '<div class="brlbs-cmpnt-dialog-box-entrance" role="dialog" style="position:fixed;top:50px;background:white">'+
        '<p>We use cookies for marketing. Choose your privacy preferences.</p><button>Accept all</button>'+
        '<button>Accept essential cookies</button><button>Individual preferences</button></div>'),{once:true});
    </script>`);
    assert.equal(await revealBorlabsDeferredDialog(page), true);
    await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'));
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(geometry.summary.firstLayerAccept, true);
    assert.equal(geometry.summary.firstLayerReject, true);
    assert.equal(geometry.summary.firstLayerOptions, true);
    assert.equal(await page.evaluate(() => (window as any).clicks), 0);
    await page.evaluate(() => { (window as any).borlabsCookieConfig.settings.dialogShowDialogAfterUserInteraction = false; });
    assert.equal(await revealBorlabsDeferredDialog(page), false);
  } finally { await browser.close(); }
});

test("Borlabs confirmation retains complete optional-service state and a fresh saved-consent event", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(`<script>
      window.grants={cmp:false,analytics:false,replay:false};
      window.BorlabsCookie={Consents:{hasConsent:id=>window.grants[id]}};
      window.borlabsCookieConfig={services:{cmp:{id:'cmp',serviceGroupId:'essential'},
        analytics:{id:'analytics',serviceGroupId:'statistics'},replay:{id:'replay',serviceGroupId:'marketing'}}};
    </script>`);
    const baseline = await readCmpApiConsentSnapshot(page, "borlabs");
    assert.equal(baseline?.eventSequence, 0);
    await page.evaluate(() => { (window as any).grants.cmp = true; window.dispatchEvent(new Event("borlabs-cookie-consent-saved")); });
    const denied = await readCmpApiConsentSnapshot(page, "borlabs");
    assert.equal(denied?.decision, "denied");
    assert.equal(denied?.eventSequence, 1);
    assert.notEqual(denied?.canonicalState, baseline?.canonicalState);
    await page.evaluate(() => { (window as any).grants.analytics = true; });
    assert.equal((await readCmpApiConsentSnapshot(page, "borlabs"))?.decision, "mixed");
    await page.evaluate(() => { (window as any).grants.replay = true; window.dispatchEvent(new Event("borlabs-cookie-consent-saved")); });
    assert.equal((await readCmpApiConsentSnapshot(page, "borlabs"))?.decision, "granted");
    await page.evaluate(() => { (window as any).borlabsCookieConfig.services.replay.id = "mismatch"; });
    assert.equal(await readCmpApiConsentSnapshot(page, "borlabs"), undefined);
  } finally { await browser.close(); }
});

for (const mode of ["deferred", "late-api", "disabled", "wrong-target"] as const) {
  test(`Borlabs lifecycle reveal overlaps page loading, once per document: ${mode}`, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const url = "https://fixture.example/consent";
    try {
      await installBorlabsDeferredDialogReveal(page, mode === "wrong-target" ? `${url}/other` : url);
      await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: `<main style="height:2000px"></main><script>
        window.clicks=0;window.scrolls=0;window.addEventListener('click',()=>window.clicks++);
        window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:${mode !== "disabled"}}};
        ${mode !== "late-api" ? "window.BorlabsCookie={Consents:{hasConsent:()=>false}};" : ""}
        window.dispatchEvent(new Event('borlabs-cookie-after-init'));
        // The vendor installs its listener after announcing initialization.
        window.addEventListener('scroll',()=>{window.scrolls++;document.body.dataset.revealed='yes';});
        ${mode === "late-api" ? "document.addEventListener('DOMContentLoaded',()=>{window.BorlabsCookie={Consents:{hasConsent:()=>false}};});" : ""}
      </script>` }));
      await page.goto(url);
      if (mode === "disabled" || mode === "wrong-target") {
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        assert.equal(await page.evaluate(() => (window as any).scrolls), 0);
      } else {
        await page.waitForFunction(() => document.body.dataset.revealed === "yes");
        assert.equal(await revealBorlabsDeferredDialog(page), true);
        assert.equal(await revealBorlabsDeferredDialog(page), true);
        assert.equal(await page.evaluate(() => (window as any).scrolls), 1);
        assert.equal(await page.evaluate(() => scrollY), 1);
      }
      assert.equal(await page.evaluate(() => (window as any).clicks), 0);
      assert.equal(await context.cookies().then(cookies => cookies.length), 0);
    } finally { await browser.close(); }
  });
}
