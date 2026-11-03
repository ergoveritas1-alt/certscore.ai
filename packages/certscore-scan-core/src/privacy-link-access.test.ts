import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { readPrivacyLinkAccess, privacyPolicyLinkCandidates } from "./privacy-link-access.js";

test("existing link read diagnoses reachability without clicks, scrolling or navigation", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const fixtures = [
      ["reachable", '<a href="https://example.test/privacy"><span>Privacy policy</span></a>'],
      ["outside_viewport", '<a style="position:absolute;top:1500px" href="https://example.test/privacy">Privacy policy</a>'],
      ["not_rendered", '<a style="display:none" href="https://example.test/privacy">Privacy policy</a>'],
      ["hidden", '<a style="visibility:hidden" href="https://example.test/privacy">Privacy policy</a>'],
      ["reachable", '<div aria-hidden="true"><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["transparent", '<div style="opacity:0"><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["inactive", '<div inert><a href="https://example.test/privacy">Privacy policy</a></div>'],
      ["pointer_disabled", '<a style="pointer-events:none" href="https://example.test/privacy">Privacy policy</a>'],
      ["hit_target_missed", '<a href="https://example.test/privacy">Privacy policy</a><div style="position:fixed;inset:0;z-index:10"></div>'],
      ["reachable", '<div style="pointer-events:none"><a style="pointer-events:auto" href="https://example.test/privacy">Privacy policy</a></div>'],
    ];
    for (const [outcome, html] of fixtures) {
      await page.setContent(`${html}<script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`);
      const rows = await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {});
      assert.equal(rows[0]?.access.outcome, outcome, html);
      assert.equal(rows[0]?.hitTargetBeforeAction, outcome === "reachable");
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.evaluate(() => (window as any).clicks), 0);
      assert.equal(page.url(), "about:blank");
    }
    await page.setContent('<div id="host"></div>');
    await page.evaluate(() => document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = '<a href="https://example.test/privacy">Privacy policy</a>');
    assert.equal((await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {}))[0]?.access.outcome, "reachable");
    const candidates = [{ index: 0, url: "https://example.test/other", label: "Privacy policy" }];
    assert.deepEqual(await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, { candidates }), []);
    candidates[0]!.url = "https://example.test/privacy"; candidates[0]!.label = "Changed label";
    assert.deepEqual(await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, { candidates }), []);
    await page.evaluate("{ let time = 0; Object.defineProperty(performance, 'now', { value: () => time += 100 }); }");
    assert.equal((await page.locator("a[href]").evaluateAll(readPrivacyLinkAccess, {}))[0]?.access.outcome, "inspection_incomplete");
  } finally { await browser.close(); }
});

test("optional footer verification scrolls once, restores the view, and never treats a covered link as reachable", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:800,height:600}});
    for (const mode of ["reachable", "covered", "inert", "changed"]) {
      await page.setContent(`<div style="height:2000px"></div><footer ${mode === "inert" ? "inert" : ""}><a href="https://example.test/privacy">Privacy policy</a></footer>
        ${mode === "covered" ? '<div style="position:fixed;inset:0;z-index:99"></div>' : ''}
        <script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`);
      const candidates=[{index:0,url:mode === "changed" ? "https://example.test/changed" : "https://example.test/privacy",label:"Privacy policy"}];
      const rows=await page.locator('a[href]').evaluateAll(readPrivacyLinkAccess,{candidates,allowOneDocumentScroll:true});
      assert.equal(await page.evaluate(()=>scrollY),0);
      assert.equal(await page.evaluate(()=>(window as any).clicks),0);
      if(mode === "changed") {assert.deepEqual(rows,[]);continue;}
      assert.equal(rows[0]?.hitTargetBeforeAction,mode === "reachable",mode);
      if(mode !== "inert") {
        assert.equal(rows[0]?.access.version,"privacy_link_access.v2");
        assert.equal(rows[0]?.access.scroll?.restored,true);
        assert.ok((rows[0]?.access.scroll?.inspectedY ?? 0)>0);
      }
    }
  } finally {await browser.close();}
});


test("bounded privacy verification prefers an explicit policy over a general privacy portal",()=>{
 const candidates=privacyPolicyLinkCandidates([
  {index:0,url:'https://example.test/privacy-portal',label:'Privacy'},
  {index:1,url:'https://example.test/legal/privacy-policy',label:'Privacy policy'},
 ]);
 assert.equal(candidates[0]?.index,1);
});

test("the single public-policy scroll cannot be spent on a policy generator or template",()=>{
 const candidates=privacyPolicyLinkCandidates([
  {index:0,url:"https://example.test/products/privacy-policy-generator/",label:"Privacy Policy Generator"},
  {index:1,url:"https://example.test/resources/templates/privacy-policy-template/",label:"Privacy Policy Template"},
  {index:2,url:"https://example.test/our-privacy-policy/",label:"Our Privacy Policy"},
 ]);
 assert.deepEqual(candidates.map(c=>c.index),[2]);
});

test("a visually rendered modal under aria-hidden has pointer access without asserting accessibility exposure",async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.setContent('<div aria-hidden="true"><section role="dialog" aria-modal="true"><p>Cookies and privacy</p><a href="https://example.test/privacy">Privacy Policy</a></section></div>');
  const rows=await page.locator('a[href]').evaluateAll(readPrivacyLinkAccess,{});
  assert.equal(rows[0]?.access.outcome,'reachable');assert.equal(rows[0]?.hitTargetBeforeAction,true);
  assert.equal(rows[0]?.access.exclusion,undefined);
  assert.equal(await page.getByRole('link').count(),0);
  assert.equal(await page.locator('[aria-hidden]').getAttribute('aria-hidden'),'true');
 }finally{await browser.close();}
});

test("aria-hidden cannot override physical blockers or create policy-link hit proof",async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:800,height:600}});
  for(const [outcome,body] of [
   ['not_rendered','<section style="display:none"><a href="https://example.test/privacy">Privacy Policy</a></section>'],
   ['hidden','<section style="visibility:hidden"><a href="https://example.test/privacy">Privacy Policy</a></section>'],
   ['transparent','<section style="opacity:0"><a href="https://example.test/privacy">Privacy Policy</a></section>'],
   ['inactive','<section inert><a href="https://example.test/privacy">Privacy Policy</a></section>'],
   ['hit_target_missed','<a href="https://example.test/privacy">Privacy Policy</a><div style="position:fixed;inset:0;z-index:999"></div>'],
   ['not_rendered','<style>[aria-hidden=true]{display:none}</style><a href="https://example.test/privacy">Privacy Policy</a>'],
  ]){
   await page.setContent(`<div aria-hidden="true">${body}</div>`);
   const rows=await page.locator('a[href]').evaluateAll(readPrivacyLinkAccess,{});
   assert.equal(rows[0]?.access.outcome,outcome);assert.equal(rows[0]?.hitTargetBeforeAction,false);
  }
 }finally{await browser.close();}
});
