import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer";
import { runPostRefusalObserver } from "./post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes";
import { inspectLocatorConsentReadiness, inspectLocatorActionability } from "./cmp-control-actionability";

// The real observers used to leave search on an opacity-zero hit target and
// exhaust the later one-second settling allowance before a valid fade finished.
for (const action of ["accept", "reject"] as const) {
  for (const mode of ["fade", "transparent", "duplicate", "changed_label", "inert", "aria_hidden"] as const) {
    test(`resolver scope ${action}: ${mode} preserves the original search and final proof`, async () => {
      let clicks = 0;
      let clickedWhileTransparent = false;
      const server = createServer((request, response) => {
        if (request.url?.startsWith("/click")) {
          clicks++;
          clickedWhileTransparent = request.url.includes("opacity=0");
          response.writeHead(204).end(); return;
        }
        if (request.url === "/otSDKStub.js") { response.setHeader("content-type", "text/javascript"); response.end(""); return; }
        response.setHeader("content-type", "text/html");
        response.end(`<!doctype html><body><script src="/otSDKStub.js"></script>
          <section id="onetrust-banner-sdk" style="opacity:0;position:fixed;top:30px;left:30px;background:white;padding:25px">
          <p>Choose optional analytics cookies.</p><button id="onetrust-${action === "accept" ? "accept-btn" : "reject-all"}-handler">${action === "accept" ? "Accept all" : "Reject all"}</button></section>
          <script>
            const section=document.querySelector('section'), button=document.querySelector('button');
            window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0001',Status:'always active'},{CustomGroupId:'C0002',Status:'inactive'}]})};
            document.cookie='OptanonConsent=groups=C0001:1,C0002:0&receipt=before;path=/';
            button.onclick=()=>{fetch('/click?opacity='+getComputedStyle(section).opacity);document.cookie='OptanonConsent=groups=C0001:1,C0002:${action === "accept" ? 1 : 0}&receipt=after;path=/';section.hidden=true;};
            setTimeout(()=>{
              if('${mode}'==='duplicate')section.append(button.cloneNode(true));
              if('${mode}'==='changed_label')button.textContent='Manage preferences';
              if('${mode}'==='inert')section.inert=true;
              if('${mode}'==='aria_hidden')section.setAttribute('aria-hidden','true');
              if('${mode}'!=='transparent')section.style.opacity='1';
            },1500);
          </script>`);
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address !== "string");
      try {
        const recipes = action === "accept" ? buildCanonicalPostAcceptActionRecipes() : buildCanonicalPostRefusalActionRecipes();
        const recipe = recipes.find(value => value.cmpId === "OneTrust")!;
        const common = { url: `http://127.0.0.1:${address.port}/`, scanId: `scope-${action}-${mode}`,
          recipe, recipeCandidates: [recipe], interactionAuthorization: {kind: "loopback", authorizationId: "loopback_local_lab"} as const,
          actionSearchTimeoutMs: 2600, resultBudgetMs: 6500, confirmationTimeoutMs: 250, observationWindowMs: 150 };
        const started = Date.now();
        const packet = action === "accept"
          ? await runPostAcceptObserver({...common, allowCanonicalAcceptDiscovery: true})
          : await runPostRefusalObserver({...common, allowCanonicalRejectDiscovery: true, recipeSetId: "scope-readiness-fixture"});
        assert.equal(clicks, mode === "fade" ? 1 : 0, JSON.stringify(packet.interactionDiagnostics));
        assert.equal(clickedWhileTransparent, false);
        const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
        if (mode === "fade") {
          assert.equal(registration.status, "confirmed");
          assert.ok(packet.timing.resolverMs >= 1000, "search must retain the pending transparent control");
          assert.ok(packet.interactionDiagnostics?.resolver?.snapshots.some(snapshot => snapshot.state === "control_hidden"));
        } else assert.notEqual(registration.status, "confirmed");
        assert.ok(Date.now() - started < 6500, "no fresh deadline or extra capture window");
      } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
    });
  }
}

test("resolver readiness reads composed ancestry without changing ordinary hit-target facts", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="host" style="opacity:0"></div>');
    await page.evaluate(() => {document.querySelector("#host")!.attachShadow({mode: "open"}).innerHTML = '<button>Accept all</button>';});
    const control = page.locator("button");
    const geometric = await inspectLocatorActionability(control);
    assert.equal(geometric.centerHitTargetRelation, "control_or_descendant");
    assert.equal((await inspectLocatorConsentReadiness(control)).scopeInteractive, false);
    await page.locator("#host").evaluate(host => (host as HTMLElement).style.opacity = "1");
    assert.equal((await inspectLocatorConsentReadiness(control)).scopeInteractive, true);
    for (const attr of ["hidden", "inert", "aria-hidden"]) {
      await page.locator("#host").evaluate((host, attr) => host.setAttribute(attr, "true"), attr);
      assert.equal((await inspectLocatorConsentReadiness(control)).scopeInteractive, false);
      await page.locator("#host").evaluate((host, attr) => host.removeAttribute(attr), attr);
    }
  } finally {await browser.close();}
});
