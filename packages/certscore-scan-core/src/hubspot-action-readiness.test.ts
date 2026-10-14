import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium, type Locator } from "playwright";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE } from "./post-accept-cmp-recipes.js";

for (const action of ["accept", "reject"] as const) for (const scenario of ["settles", "persistent", "opposite", "cancelled"] as const) {
  test(`${action}: HubSpot opacity after trial shares the existing readiness deadline: ${scenario}`, {timeout: 10_000}, async t => {
    let clicks = 0, injected = false;
    const controller = new AbortController();
    const server = createServer((req, res) => {
      if (req.url === "/clicked") { clicks++; res.end(); return; }
      res.setHeader("content-type", "text/html");
      res.end(`<section id="hs-eu-cookie-confirmation" aria-label="Cookie preferences"><p>Choose optional cookies</p><button id="choice">${action === "accept" ? "Accept all" : "Decline all"}</button></section><script>choice.onclick=()=>{fetch('/clicked');localStorage.setItem('${action === "accept" ? "certscore:analytics-consent:v1" : "certscore_fixture_consent"}','${action === "accept" ? "granted" : "rejected"}');document.querySelector('section').hidden=true;};</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const browser = await chromium.launch({headless:true});
    const newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (...args: Parameters<typeof browser.newContext>) => {
      const context = await newContext(...args), newPage = context.newPage.bind(context);
      t.mock.method(context, "newPage", async () => {
        const page = await newPage();
        const prototype = Object.getPrototypeOf(page.locator("#choice"));
        const click = prototype.click;
        t.mock.method(prototype, "click", async function(this: Locator, options?: Parameters<Locator["click"]>[0]) {
          if (options?.trial && !injected && await this.getAttribute("id") === "choice") {
            await click.call(this, options); injected = true;
            await page.evaluate(({scenario, action}) => {
              document.querySelector<HTMLElement>('section')!.style.opacity = "0";
              if (scenario === "opposite") document.querySelector('button')!.textContent = action === "accept" ? "Decline all" : "Accept all";
              if (scenario === "settles") setTimeout(() => {document.querySelector<HTMLElement>('section')!.style.opacity="1";}, 850);
            }, {scenario, action});
            if (scenario === "cancelled") setTimeout(() => controller.abort(), 650);
            await new Promise(resolve => setTimeout(resolve, 550));
            return;
          }
          return click.call(this, options);
        });
        return page;
      });
      return context;
    });
    const started = Date.now();
    try {
      const common = {browser, signal:controller.signal, actionSearchTimeoutMs:500, confirmationTimeoutMs:300, observationWindowMs:50,
        interactionAuthorization:{authorizationId:"loopback_local_lab",kind:"loopback" as const},productionProjectable:true,scanId:`hubspot-${action}-${scenario}`,url};
      const packet = action === "accept" ? await runPostAcceptObserver({...common,recipe:{...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
        cmpId:"HubSpot Consent Banner",controlSelector:"#choice",bannerSelector:"#hs-eu-cookie-confirmation"}})
        : await runPostRefusalObserver({...common,recipe:{artifactVersion:"certscore.post_refusal_action_recipe.v1",recipeId:"hubspot-opacity-local",cmpId:"HubSpot Consent Banner",
          controlSelector:"#choice",bannerSelector:"#hs-eu-cookie-confirmation",confirmation:{kind:"local_storage_equals",key:"certscore_fixture_consent",expectedValue:"rejected"}}});
      assert.equal(injected,true,JSON.stringify(packet));
      assert.equal(clicks,scenario === "settles" ? 1 : 0, JSON.stringify(packet));
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      assert.equal(registration.status === "confirmed",scenario === "settles");
      if (scenario === "settles") assert.equal(packet.interactionDiagnostics.click.outcome,"completed");
      assert.ok(Date.now()-started < 4500,"No new readiness or result allowance");
    } finally {t.mock.restoreAll();await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
}

test('Accept preserves unused geometry recovery when HubSpot re-resolution is intercepted',{timeout:12_000},async()=>{
  let mode='transient',clicks=0;
  const server=createServer((req,res)=>{
    if(req.url==='/clicked'){clicks++;res.end();return;}
    res.setHeader('content-type','text/html');
    res.end(`<style>@keyframes move{from{transform:translateX(0)}to{transform:translateX(2px)}}#choice{position:fixed;left:20px;top:40px;width:200px;height:44px;animation:move 40ms linear infinite alternate}#overlay{display:none;position:fixed;inset:0;z-index:100}</style><section id="hs-eu-cookie-confirmation">Choose optional cookies<button id="choice">Accept all</button></section><div id="overlay"></div><script>setTimeout(()=>overlay.style.display='block',350);${mode==='transient' ? "setTimeout(()=>overlay.remove(),2200);" : ''}choice.onclick=()=>{fetch('/clicked');localStorage.setItem('certscore:analytics-consent:v1','granted');document.querySelector('section').hidden=true;};</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
  try{for(mode of ['transient','persistent']){
    clicks=0;const started=Date.now();
    const packet=await runPostAcceptObserver({url:`http://127.0.0.1:${address.port}/`,scanId:mode,actionSearchTimeoutMs:1000,confirmationTimeoutMs:300,observationWindowMs:50,
      interactionAuthorization:{authorizationId:'loopback_local_lab',kind:'loopback'},productionProjectable:true,
      recipe:{...CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,cmpId:'HubSpot Consent Banner',controlSelector:'#choice',bannerSelector:'#hs-eu-cookie-confirmation'}});
    assert.equal(clicks,mode==='transient'?1:0,JSON.stringify(packet));
    assert.equal(packet.acceptanceRegistration.status==='confirmed',mode==='transient');
    assert.ok(Date.now()-started<4500);
    if(mode==='transient'){assert.equal(packet.interactionDiagnostics.click.reResolvedBeforeDispatch,false);assert.ok(packet.limitations.includes('action_dispatch_verified_geometry_fallback'));}
    else assert.equal(packet.interactionDiagnostics.click.failureClass,'intercepted');
  }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
