import assert from "node:assert/strict";
import test from "node:test";
import {chromium, type Browser} from "playwright";
import {readRapidFirstLayerConsentUiObservation} from "./scanners/pre-consent-runtime-scanner.js";

let browser: Browser;
test.before(async () => {browser = await chromium.launch({headless: true});});
test.after(async () => {await browser?.close();});
const notice = `<section role="dialog" aria-label="Privacy" style="position:fixed;bottom:0;left:0;right:0;background:white;padding:20px">
  <p>We use cookies for analytics. You can choose your cookie preferences.</p>
  <button>Accept</button><button>Reject All</button><button>Manage Preferences</button></section>`;
async function inspect(body: string) {
  const page = await browser.newPage({viewport: {width:1366,height:900}});
  let requests = 0;
  try {
    await page.route("**/*", route => {requests++; return route.abort();});
    await page.setContent(`<style>body{margin:0}button{padding:12px;margin:4px}</style>${body}
      <script>window.fixtureClicks=0;document.addEventListener('click',()=>window.fixtureClicks++)</script>`);
    const result = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
    assert.equal(requests,0);
    assert.equal(await page.evaluate(() => (window as unknown as {fixtureClicks:number}).fixtureClicks),0);
    return result;
  } finally {await page.close();}
}
function assertChoices(result: Awaited<ReturnType<typeof inspect>>) {
  assert.equal(result.acceptControlObserved,true);
  assert.equal(result.rejectControlObserved,true);
  assert.equal(result.managePreferencesControlObserved,true);
}

test("hidden named CMP templates do not suppress a separate visible consent dialog", async () => {
  for (const hidden of [
    '<aside id="onetrust-consent-sdk" hidden>We use cookies for advertising. Manage consent preferences.</aside>',
    '<div id="onetrust-consent-sdk" style="display:none"><button>Accept All</button><button>Reject All</button></div>',
    '<div id="onetrust-consent-sdk"><div id="onetrust-pc-sdk" hidden><button>Accept All</button></div></div>',
  ]) assertChoices(await inspect(hidden+notice));
});

test("a non-actionable named CMP wrapper does not suppress visible choices elsewhere", async () => {
  assertChoices(await inspect('<div id="onetrust-consent-sdk">Manage consent preferences</div>'+notice));
});

test("a zero-size CMP wrapper preserves visible positioned descendant controls", async () => {
  assertChoices(await inspect('<div id="onetrust-consent-sdk" style="width:0;height:0">'+notice+'</div>'));
});

test("visible canonical CMP controls retain priority over unrelated page choices", async () => {
  const result=await inspect('<div id="onetrust-consent-sdk">'+notice+'</div><div style="position:fixed;top:0"><p>Account preferences</p><button>Settings</button><button>Accept</button></div>');
  assertChoices(result);
  assert.equal(result.controls.filter(c=>c.actionType==='accept_all').length,1);
  assert.equal(result.controls.some(c=>c.label==='Settings'),false);
});

test("hidden-only and audience controls remain non-consent without manufactured positives", async () => {
  const result=await inspect('<div id="onetrust-consent-sdk" hidden><button>Accept All</button></div><section role="dialog"><p>Choose your country. Terms and Privacy Policies.</p><button>Accept</button></section>');
  assert.notEqual(result.acceptControlObserved,true);
  assert.notEqual(result.rejectControlObserved,true);
});

test("hidden CMP fallback retains child-frame discovery", async () => {
  const escaped=notice.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  assertChoices(await inspect(`<div id="onetrust-consent-sdk" hidden>Manage consent preferences</div><iframe title="Privacy" style="width:1200px;height:800px;border:0" srcdoc="${escaped}"></iframe>`));
});

test("fallback keeps the existing candidate cap and records truncation", async () => {
  const result=await inspect('<div id="onetrust-consent-sdk" hidden>Manage consent preferences</div>'+ '<button>Unrelated</button>'.repeat(5100)+notice);
  assert.notEqual(result.acceptControlObserved,true);
  assert.ok(result.inventoryDiagnostics?.timingMarkers.some(x=>x==='rapid_inventory_truncated'),JSON.stringify(result.inventoryDiagnostics));
});
