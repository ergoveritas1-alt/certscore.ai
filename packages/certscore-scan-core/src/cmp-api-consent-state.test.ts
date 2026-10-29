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

for (const provider of ["osano", "hubspot"] as const) test(`${provider}: complete documented decisions, fresh events and malformed updates`, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.handlers=[]; window.registrations=0; window.getterReads=0;
      window.state={ANALYTICS:'DENY',MARKETING:'DENY',PERSONALIZATION:'DENY',ESSENTIAL:'ACCEPT','OPT-OUT':'ACCEPT',STORAGE:'DENY'};
      window.Osano={cm:{getConsent:()=>{window.getterReads++;return window.state;},addEventListener:(name,fn)=>{if(name!=='osano-cm-consent-saved')throw Error('wrong event');window.registrations++;window.handlers.push(fn)}}};
      window._hsp={push:([name,fn])=>{if(name!=='addPrivacyConsentListener')throw Error('wrong API');window.registrations++;window.handlers.push(fn)}};
      window.emit=data=>window.handlers.forEach(fn=>fn(data));
    </script>`);
    const baseline = await readCmpApiConsentSnapshot(page, provider);
    assert.equal(baseline?.eventSequence, 0);
    assert.equal(baseline?.decision, provider === "osano" ? "denied" : "unknown");
    const granted = provider === "osano" ? { ANALYTICS: "ACCEPT", MARKETING: "ACCEPT", PERSONALIZATION: "ACCEPT", ESSENTIAL: "ACCEPT", "OPT-OUT": "ACCEPT", STORAGE: "DENY" }
      : { categories: { analytics: true, advertisement: true, functionality: true }, allowed: true };
    await page.evaluate(data => { (window as any).state=data; (window as any).emit(data); }, granted);
    const state = await readCmpApiConsentSnapshot(page, provider);
    assert.equal(state?.decision, "granted"); assert.equal(state?.eventSequence, 1); assert.ok(state?.eventObservedAtEpochMs);
    const beforeReads = await page.evaluate(() => (window as any).getterReads);
    const reasons: string[] = [];
    assert.deepEqual(await readCmpApiConsentSnapshot(page, provider, reason => reasons.push(reason)), state);
    assert.deepEqual(reasons, []);
    assert.equal(await page.evaluate(() => (window as any).getterReads), beforeReads + (provider === "osano" ? 1 : 0));
    for (const data of [null, {allowed:true}, {categories:{analytics:true}}, {ANALYTICS:"ACCEPT"}]) {
      await page.evaluate(data => { (window as any).state=data; (window as any).emit(data); }, data);
      const diagnostics: string[] = [];
      assert.ok([undefined, "unknown"].includes((await readCmpApiConsentSnapshot(page, provider, reason => diagnostics.push(reason)))?.decision));
      assert.deepEqual(diagnostics, ["receipt_format_unsupported"]);
    }
    if (provider === "osano") {
      await page.evaluate(data => { (window as any).state=data; (window as any).emit({ANALYTICS:"ACCEPT"}); }, granted);
      const diagnostics: string[] = [];
      assert.equal(await readCmpApiConsentSnapshot(page, provider, reason => diagnostics.push(reason)), undefined, "malformed event cannot witness an otherwise valid getter");
      assert.deepEqual(diagnostics, ["receipt_readback_mismatch"]);
      await page.evaluate(data=>{(window as any).state=data;(window as any).__tcfapi=()=>{};},granted);
      diagnostics.length = 0;
      assert.equal(await readCmpApiConsentSnapshot(page,provider,reason => diagnostics.push(reason)),undefined,"non-TCF recipe cannot certify IAB purpose decisions");
      assert.deepEqual(diagnostics, ["configuration_or_groups_unverified"]);
    }
    assert.equal(await page.evaluate(() => (window as any).registrations), 1);
  } finally { await browser.close(); }
});

test("Drupal: configured opt-in statuses require a matching fresh write; categories require complete source accounting", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.statusValue=null;window.selected=[];window.writes=[];
      window.drupalSettings={eu_cookie_compliance:{method:'opt_in'}};
      window.Drupal={eu_cookie_compliance:{getCookieStatus:()=>window.statusValue,getAcceptedCategories:()=>window.selected}};
      window.__certscoreReadPostAcceptWrites=()=>window.writes;
    </script>`);
    assert.equal((await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"))?.decision, "unknown");
    await page.evaluate(() => { (window as any).statusValue="2"; });
    assert.equal((await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"))?.eventSequence, 0);
    await page.evaluate(() => { (window as any).writes=[{storageType:"cookie",name:"cookie-agreed",value:"2",sequence:4,observedAtEpochMs:Date.now()}]; });
    const state = await readCmpApiConsentSnapshot(page, "drupal_eu_cookie");
    assert.equal(state?.decision, "granted"); assert.equal(state?.eventSequence, 4);
    await page.evaluate(() => { (window as any).drupalSettings.eu_cookie_compliance.method="categories"; });
    assert.equal(await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"), undefined);
    await page.evaluate(() => Object.assign((window as any).drupalSettings.eu_cookie_compliance, {cookie_categories:["essential","analytics","ads"],cookie_categories_details:{essential:{id:"essential",checkbox_default_state:"required"},analytics:{id:"analytics"},ads:{id:"ads"}}}));
    assert.equal((await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"))?.decision, "mixed");
    await page.evaluate(() => { (window as any).selected=["essential","analytics","ads"]; });
    assert.equal((await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"))?.decision, "granted");
    await page.evaluate(() => { (window as any).drupalSettings.eu_cookie_compliance.method="default"; });
    assert.equal(await readCmpApiConsentSnapshot(page, "drupal_eu_cookie"), undefined);
  } finally { await browser.close(); }
});

test("HubSpot queues one read-only listener before bootstrap without accepting a legacy boolean", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const before=await readCmpApiConsentSnapshot(page,"hubspot");
    assert.equal(before?.canonicalState,"unregistered");assert.equal(before?.eventSequence,0);
    assert.equal(await page.evaluate(()=>(window as any)._hsp.length),1);
    await page.evaluate(()=>{ const command=(window as any)._hsp[0];command[1]({allowed:true}); });
    assert.equal((await readCmpApiConsentSnapshot(page,"hubspot"))?.decision,"unknown");
    await page.evaluate(()=>{ const command=(window as any)._hsp[0];command[1]({categories:{analytics:false,advertisement:false,functionality:false}}); });
    const after=await readCmpApiConsentSnapshot(page,"hubspot");
    assert.equal(after?.decision,"denied");assert.equal(after?.eventSequence,2);assert.ok(after?.eventObservedAtEpochMs);
    assert.equal(await page.evaluate(()=>(window as any)._hsp.length),1);
  } finally {await browser.close();}
});

test("HubSpot: served necessary category preserves optional decisions and rejects unsupported extensions", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<script>
      window.registrations=0;
      window._hsp={push:([name,callback])=>{if(name!=='addPrivacyConsentListener')throw Error('unexpected command');window.registrations++;window.listener=callback;}};
    </script>`);
    const before = await readCmpApiConsentSnapshot(page, "hubspot");
    assert.equal(before?.eventSequence, 0);
    for (const [categories, expected] of [
      [{necessary:true,analytics:true,advertisement:true,functionality:true}, "granted"],
      [{necessary:true,analytics:false,advertisement:false,functionality:false}, "denied"],
      [{necessary:true,analytics:true,advertisement:false,functionality:false}, "mixed"],
      [{analytics:true,advertisement:true,functionality:true}, "granted"],
      [{necessary:false,analytics:true,advertisement:true,functionality:true}, "unknown"],
      [{necessary:"true",analytics:true,advertisement:true,functionality:true}, "unknown"],
      [{necessary:null,analytics:true,advertisement:true,functionality:true}, "unknown"],
      [{necessary:true,analytics:true,advertisement:true}, "unknown"],
      [{necessary:true,analytics:true,advertisement:true,functionality:true,other:true}, "unknown"],
    ] as const) {
      await page.evaluate(categories => (window as any).listener({categories}), categories);
      const reasons: string[] = [];
      const state = await readCmpApiConsentSnapshot(page, "hubspot", r => reasons.push(r));
      assert.equal(state?.decision, expected, JSON.stringify(categories));
      assert.deepEqual(reasons, expected === "unknown" ? ["receipt_format_unsupported"] : []);
      const reread = await readCmpApiConsentSnapshot(page, "hubspot");
      assert.equal(reread?.eventSequence, state?.eventSequence, "reading does not manufacture another saved event");
    }
    assert.equal(await page.evaluate(() => (window as any).registrations), 1);
  } finally { await browser.close(); }
});
