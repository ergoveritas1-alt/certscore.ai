import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { installConsentActionDiscovery } from "./consent-action-discovery.js";

test("consent action discovery wakes on late CMP runtime and DOM controls", async () => {
  const server = createServer((request, response) => {
    if (request.url === "/cmp-runtime.js") {
      response.setHeader("content-type", "application/javascript; charset=utf-8");
      response.end("window.__cmpRuntimeLoaded = true;");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body><div id="root"></div><script>
      setTimeout(() => {
        const runtime = document.createElement('script');
        runtime.src = '/cmp-runtime.js';
        document.head.appendChild(runtime);
        document.querySelector('#root').innerHTML =
          '<section role="dialog"><button>Accept</button><button>Reject</button></section>';
      }, 100);
    </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const discovery = await installConsentActionDiscovery(page);
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "commit" });
    const revision = discovery.revision;
    await discovery.waitForSignal(revision, 1_000);
    await page.waitForFunction(() => Boolean((window as any).__cmpRuntimeLoaded));
    assert.ok(discovery.revision > revision);
    assert.ok(discovery.runtimeUrls().some((url) => url.endsWith("/cmp-runtime.js")));
    assert.equal(await page.getByRole("button", { name: "Reject" }).count(), 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const quietRevision = discovery.revision;
    const quietWaitStartedAt = Date.now();
    await discovery.waitForSignal(quietRevision, 40);
    const quietWaitMs = Date.now() - quietWaitStartedAt;
    assert.ok(quietWaitMs >= 30, `quiet wait returned too early: ${quietWaitMs}ms`);
    assert.ok(quietWaitMs < 500, `quiet wait exceeded its bounded timer: ${quietWaitMs}ms`);
  } finally {
    discovery.dispose();
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
  }
});

for(const signal of ["mutation","OneTrustGroupsUpdated","OTConsentApplied"] as const) test(`discovery: ${signal} wakes without a request, SDK read or choice claim`,async()=>{
  const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(String(error)));
  const discovery=await installConsentActionDiscovery(page);
  try{
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><p id="target">Neutral fixture</p>'}));
    await page.goto('https://discovery.test/');await new Promise(r=>setTimeout(r,100));
    const revision=discovery.revision,urls=discovery.runtimeUrls();
    await page.evaluate(kind=>{
      if(kind==='mutation')document.querySelector('#target')!.setAttribute('aria-label','Changed');
      else window.dispatchEvent(new CustomEvent(kind,{detail:['C0001','C0002']}));
    },signal);
    await discovery.waitForSignal(revision,500);
    assert.ok(discovery.revision>revision,`${signal} must wake independently of network events`);
    assert.deepEqual(discovery.runtimeUrls(),urls);
    assert.equal(await page.evaluate(()=>document.cookie),'');
    assert.equal(await page.evaluate(()=>typeof (window as any).OneTrust),'undefined');
    assert.deepEqual(errors,[],"serialized init script must not require bundler globals");
    discovery.dispose();const disposedRevision=discovery.revision;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('OneTrustGroupsUpdated')));
    await new Promise(r=>setTimeout(r,50));assert.equal(discovery.revision,disposedRevision);
  }finally{discovery.dispose();await browser.close();}
});
