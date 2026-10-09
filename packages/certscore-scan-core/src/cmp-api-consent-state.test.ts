import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readCmpApiConsentSnapshot } from "./cmp-api-consent-state.js";

// Termly documents consent events as { categories, cookies, uuid }, rather than
// { consentState }. Replays keep the synchronous getter stale to exercise the
// event evidence independently of that getter. No public site is contacted.
// https://support.termly.io/hc/en-us/articles/30710442081553
async function withTermly(replay: (page: import("playwright").Page) => Promise<void>) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.handlers=[];
      window.state={essential:true,performance:false,analytics:false,advertising:false,social_networking:false,unclassified:false};
      window.Termly={getConsentState:()=>({...window.state}),on:(event,handler)=>{if(event==='consent')window.handlers.push(handler)}};
      window.emit=data=>window.handlers.forEach(handler=>handler(data));
    </script>`);
    await replay(page);
  } finally { await browser.close(); }
}

test("Termly documented category events confirm their current complete state despite a stale getter", async () => {
  await withTermly(async page => {
    const baseline = await readCmpApiConsentSnapshot(page, "termly");
    assert.equal(baseline?.decision, "denied");
    await page.evaluate(() => (window as any).emit({categories:["essential","performance","analytics","advertising","social_networking","unclassified"],cookies:[],uuid:"private-visitor-id"}));
    const granted = await readCmpApiConsentSnapshot(page, "termly");
    assert.equal(granted?.decision, "granted");
    assert.equal(granted?.eventSequence, 1);
    assert.notEqual(granted?.canonicalState, baseline?.canonicalState);
    assert.equal(JSON.stringify(granted).includes("private-visitor-id"), false);
    await page.evaluate(() => (window as any).emit({categories:["essential"],cookies:[]}));
    const denied = await readCmpApiConsentSnapshot(page, "termly");
    assert.equal(denied?.decision, "denied");
    assert.equal(denied?.eventSequence, 2);
    await page.evaluate(() => (window as any).emit({categories:["essential","analytics"]}));
    assert.equal((await readCmpApiConsentSnapshot(page, "termly"))?.decision, "mixed");
  });
});

test("Termly malformed or unknown category events never supply a fresh consent witness", async () => {
  await withTermly(async page => {
    const baseline = await readCmpApiConsentSnapshot(page, "termly");
    for (const categories of [undefined, "analytics", ["invented_category"], ["essential","analytics","analytics"], ["essential",true]]) {
      await page.evaluate(categories => (window as any).emit({categories}), categories);
      const state = await readCmpApiConsentSnapshot(page, "termly");
      assert.equal(state?.eventSequence, baseline?.eventSequence);
      assert.equal(state?.canonicalState, baseline?.canonicalState);
    }
    // The undocumented payload must not replace a verified live state.
    await page.evaluate(() => (window as any).emit({consentState:{analytics:true}}));
    assert.equal((await readCmpApiConsentSnapshot(page, "termly"))?.decision, "denied");
  });
});

test("Termly incomplete synchronous purpose maps remain unverifiable", async () => {
  await withTermly(async page => {
    await page.evaluate(() => { (window as any).state={essential:true,analytics:true}; });
    assert.equal(await readCmpApiConsentSnapshot(page, "termly"), undefined);
    await page.evaluate(() => { (window as any).state={essential:true,performance:false,analytics:true,advertising:"true",social_networking:false,unclassified:false}; });
    assert.equal(await readCmpApiConsentSnapshot(page, "termly"), undefined);
  });
});

test("Transcend reads local consent without invoking cross-domain synchronization", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.syncCalls=0;
      window.airgap={
        getConsent:()=>({confirmed:true,purposes:{Functional:true,Analytics:true,Advertising:true,SaleOfInfo:true,MarketingCommunications:'Auto'},timestamp:'2026-10-08T00:00:00Z'}),
        sync:()=>{window.syncCalls++;return new Promise(()=>{});}
      };
    </script>`);
    const state = await Promise.race([
      readCmpApiConsentSnapshot(page, "transcend"),
      new Promise<undefined>(resolve => setTimeout(resolve, 500)),
    ]);
    assert.equal(state?.decision, "granted");
    assert.equal(await page.evaluate(() => (window as any).syncCalls), 0);
  } finally {
    await browser.close();
  }
});
