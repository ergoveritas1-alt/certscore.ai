import assert from "node:assert/strict";
import test from "node:test";
import {chromium, type Browser, type Page} from "playwright";
import {consentFooterOptOutObservationSchema, domSnapshotArtifactSchema} from "@certscore/contracts";
import {captureConsentFooterOptOut, captureConsentFooterOptOutWithOutcome} from "./consent-footer-opt-out.js";
import {captureConsentControlGeometry} from "./consent-control-geometry.js";

let browser: Browser;
test.before(async () => {browser = await chromium.launch({headless:true});});
test.after(async () => {await browser?.close();});
const url = "https://footer-fixture.test/", label = "Do Not Sell or Share My Personal Information";
const identity = {source:"cdp_loader_id" as const, token:"original-loader"};
async function fixture(html: string, fixtureUrl = url) {
  const page = await browser.newPage({viewport:{width:1000,height:700}});
  await page.route("**/*", route => route.request().url() === fixtureUrl ? route.fulfill({
    contentType:"text/html; charset=utf-8",body:'<!DOCTYPE html><style>body{margin:0} a,button{line-height:24px}</style>'+html}) : route.abort());
  await page.goto(fixtureUrl);
  return page;
}
const snapshot = {artifactId:"dom_text_pre_consent",url,capturedAtMs:100,documentIdentity:identity,consentStateAtTime:"pre_consent" as const};
function observe(page: Page, readBinding = () => ({url:page.url(),documentIdentity:identity})) {
  return captureConsentFooterOptOut({page,snapshot:{...snapshot,url:page.url()},readBinding,scanStartedAtMs:Date.now()-500,budgetMs:175});
}
test("a restored, source-bound footer viewport verifies a real control while excluding banner siblings and non-controls", async () => {
  const page = await fixture(`<main style="height:1800px">Cookies and privacy. Your Privacy Choices</main>
    <footer><div id="onetrust-banner-sdk"><button>${label}</button></div>
    <div role="dialog"><button>${label}</button></div><a href="#settings">${label}</a>
    <a href="/privacy">Privacy policy</a><button>Do Not Sell My Newsletter</button></footer>
    <script>window.clicks=0;document.addEventListener('click',()=>window.clicks++)</script>`);
  try {
    const before = await page.screenshot(), packet = await observe(page);
    assert.ok(packet); assert.equal(packet.snapshotAtMs,100); assert.equal(packet.documentToken,identity.token);
    assert.equal(packet.coverage,"complete"); assert.equal(packet.candidates.length,1);
    const [control]=packet.candidates; assert.equal(control?.visibility,"rendered_exposed"); assert.equal(control.view,"footer_position");
    assert.ok(control.matchingPoints > 0);
    assert.deepEqual(await page.screenshot(),before,"original viewport restored, including its pixels");
    assert.equal(await page.evaluate(()=> (window as unknown as {clicks:number}).clicks),0);
    const retained=domSnapshotArtifactSchema.parse({...snapshot,pagePhase:"network_idle",path:"dom-text-pre-consent.txt",footerOptOutObservation:packet});
    assert.deepEqual(retained.footerOptOutObservation,packet);
  } finally {await page.close();}
});
test("covered requires a real unrelated pointer hit above the target and hidden needs independent CSS evidence", async () => {
  const page = await fixture(`<div role="contentinfo" style="position:fixed;left:0;top:40px">
    <a id="c" href="#choices">${label}</a><span id="cover" style="position:absolute;inset:0;background:#ddd;z-index:2"></span>
    <div style="opacity:0"><a href="#opacity">Your California Privacy Choices</a></div>
    <a hidden href="#display">Your Privacy Choices</a>
    <a href="#disabled" style="pointer-events:none">Do Not Sell My Personal Information</a></div>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    const [covered,opacity,hidden,inert] = packet.candidates;
    assert.equal(covered?.scope,"contentinfo");assert.equal(covered.visibility,"covered");assert.equal(covered.occludingPoints,5);
    assert.equal(hidden?.visibility,"hidden");assert.equal(opacity?.visibility,"hidden");assert.equal(inert?.visibility,"unverified");
    await page.evaluate(()=>{document.getElementById("cover")!.remove();document.getElementById("c")!.style.clipPath="inset(100%)";});
    assert.equal((await observe(page))?.candidates[0]?.visibility, "unverified");
  } finally {await page.close();}
});
test("an open shadow footer resolves its own actionable hit; horizontal offscreen, missing and opaque remain limited", async () => {
  const page=await fixture(`<div class="site-footer"><footer-links></footer-links><x-private></x-private>
    <a style="position:absolute;left:3000px;top:0" href="#off">Your Privacy Choices</a></div>
    <script>document.querySelector('footer-links').attachShadow({mode:'open'}).innerHTML='<button>${label}</button>';
    document.querySelector('x-private').attachShadow({mode:'closed'}).innerHTML='<a>Privacy choices</a>';</script>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    const shadow=packet.candidates.find(c=>c.semanticRole==="button")!;assert.equal(shadow.scope,"footer_strip");assert.equal(shadow.visibility,"rendered_exposed");
    assert.equal(packet.candidates.find(c=>c.semanticRole==="link")?.visibility,"offscreen_unverified");
    assert.ok(packet.limitations.includes("opaque_footer_content"));
    await page.evaluate(()=>{document.querySelector(".site-footer")!.remove();});
    assert.deepEqual((await observe(page))?.limitations,["no_footer_landmark"]);
  } finally {await page.close();}
});
test("a changed loader, expired read and forged covered status cannot create usable footer evidence", async () => {
  const page=await fixture(`<footer><a href="#choice">${label}</a></footer>`);
  try {
    let reads=0;
    assert.equal(await observe(page,()=>({url,documentIdentity:{...identity,token:++reads===1?identity.token:"different"}})),undefined);
    assert.equal(await captureConsentFooterOptOut({page,snapshot,readBinding:()=>({url,documentIdentity:identity}),budgetMs:0,scanStartedAtMs:0}),undefined);
    const packet=await observe(page);assert.ok(packet);
    const [row]=packet.candidates;assert.equal(consentFooterOptOutObservationSchema.safeParse({...packet,candidates:[
      {...row,visibility:"covered",matchingPoints:0,occludingPoints:0}]}).success,false);
  } finally {await page.close();}
});

test("computed child visibility can override its parent; tiny screen-reader boxes cannot establish covered controls",async () => {
  const page=await fixture(`<footer><div style="visibility:hidden"><a style="visibility:visible" href="#settings">${label}</a></div>
    <a style="position:absolute;clip:rect(0,0,0,0);width:1px;height:1px;overflow:hidden" href="#sr">Your Privacy Choices</a></footer>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    assert.equal(packet.candidates[0]?.visibility,"rendered_exposed");
    assert.equal(packet.candidates[1]?.visibility,"unverified");
    assert.equal(packet.candidates[1]?.occludingPoints,0);
  } finally {await page.close();}
});

test("the isolated primary consent lane persists the same footer observation in the canonical bundle", async () => {
  const {createServer} = await import("node:http");
  const {mkdtemp,readFile,rm} = await import("node:fs/promises");
  const {join} = await import("node:path");
  const {tmpdir} = await import("node:os");
  const {runScan} = await import("./index.js");
  const {parseCanonicalEvidenceArtifact} = await import("@certscore/contracts/dist/canonical-evidence-artifact.js");
  const directory = await mkdtemp(join(tmpdir(),"certscore-footer-canonical-"));
  const server = createServer((_req,res) => {
    res.setHeader("content-type","text/html; charset=utf-8");
    res.end(`<!doctype html><html lang="en"><head><title>Public catalog</title></head><body>
      <main style="height:1800px"><h1>Product catalog</h1>${"Available public products and services. ".repeat(25)}</main>
      <footer><a href="#choices">${label}</a></footer></body></html>`);
  });
  try {
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();assert.ok(address && typeof address!=="string");
    const bundle=await runScan({url:`http://127.0.0.1:${address.port}/`,profile:"standard",outDir:directory,
      evidenceLane:"consent_proof",captureReplay:false,preConsentScreenshotMode:"always",preConsentModuleDeadlineMs:15000});
    const file=parseCanonicalEvidenceArtifact(await readFile(join(directory,"CanonicalEvidenceBundle.json"))) as typeof bundle;
    const snapshot=bundle.domSnapshots.find(s=>s.artifactId==="dom_text_pre_consent");
    assert.ok(snapshot?.footerOptOutObservation,JSON.stringify(bundle.modulesRun.map(m=>[m.moduleName,m.status,m.errors])));
    assert.deepEqual(file.domSnapshots.find(s=>s.artifactId===snapshot.artifactId)?.footerOptOutObservation,snapshot.footerOptOutObservation);
    assert.equal(snapshot.footerOptOutObservation.candidates[0]?.visibility,"rendered_exposed");
    assert.equal(snapshot.footerOptOutObservation.documentToken,snapshot.documentIdentity?.token);
    assert.equal(snapshot.footerOptOutObservation.documentUrl,snapshot.url);
    assert.equal(snapshot.footerOptOutCapture?.outcome,"captured");
    assert.deepEqual(file.domSnapshots.find(s=>s.artifactId===snapshot.artifactId)?.footerOptOutCapture,JSON.parse(JSON.stringify(snapshot.footerOptOutCapture)));
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
});

test("a delayed named footer control retains each read, its first genuinely covered state, and the restored viewport", async () => {
  const page=await fixture(`<main style="height:2100px">Store catalog</main><footer style="height:160px"><a id="named" href="#choices" style="display:none">${label}</a></footer>
    <div style="position:fixed;inset:0;background:rgba(200,200,200,.2)">Cookie notice</div>
    <script>let fired=false;window.addEventListener("scroll",()=>{if(!fired&&scrollY>50){fired=true;requestAnimationFrame(()=>{
      document.getElementById("named").style.display="inline";});}});</script>`);
  try {
    const initial=await page.screenshot();
    const packet=await observe(page);assert.ok(packet);
    const row=packet.candidates[0]!;
    assert.deepEqual(row.checkpoints?.map(c=>[c.phase,c.visibility]),[["initial","hidden"],["positioned","hidden"],["settled","covered"],["alternate","covered"]]);
    assert.deepEqual(row.checkpoints?.map(c=>c.testedPoints),[0,0,5,5]);
    assert.equal(row.occludingPoints,5);
    assert.ok(row.checkpoints![2]!.elapsedMs>=row.checkpoints![0]!.elapsedMs);
    assert.deepEqual(await page.screenshot(),initial);
  } finally {await page.close();}
});
test("an alternate bounded footer alignment distinguishes a persistent cover from a target a visitor can reach", async () => {
  const page=await fixture(`<main style="height:2100px">Store catalog</main><footer><a href="#choices">${label}</a></footer><div style="height:1200px"></div>
    <div style="position:fixed;top:0;height:56vh;width:100vw;background:white;z-index:4">Cookie notice</div>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    const row=packet.candidates[0]!;
    assert.equal(row.checkpoints?.[0]?.visibility,"offscreen_unverified");
    assert.ok(row.checkpoints?.some(c=>c.phase==="positioned"&&c.visibility==="covered"&&c.occludingPoints===5));
    assert.equal(row.checkpoints?.at(-1)?.phase,"alternate");
    assert.equal(row.visibility,"rendered_exposed");assert.ok(row.matchingPoints>0);
    assert.equal(await page.evaluate(()=>scrollY),0);
  } finally {await page.close();}
});
test("a delayed replacement cannot transfer a previous control name to an unrelated actionable target", async () => {
  const page=await fixture(`<main style="height:2100px">Store catalog</main><footer style="height:140px"><button hidden id="named">${label}</button></footer>
    <script>let fired=false;window.addEventListener("scroll",()=>{if(!fired&&scrollY>50){fired=true;requestAnimationFrame(()=>{
      const el=document.getElementById("named");el.hidden=false;el.textContent="Accept all";});}});</script>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    const row=packet.candidates[0]!;
    assert.equal(row.checkpoints?.[0]?.visibility,"hidden");assert.equal(row.visibility,"unverified");
    assert.ok(row.checkpoints?.every(c=>c.matchingPoints===0));
  } finally {await page.close();}
});

test("document-end CMP strips require the named button and in-flow placement", async () => {
  const page = await fixture(`<main style="height:2100px"></main><footer>Copyright</footer>
    <div class="fc-ccpa-root">
      <div class="fc-dns-dialog"><button class="fc-dns-link">${label}</button></div>
      <div role="dialog"><button>${label}</button></div>
    </div>
    <div><button id="ez-ccpa-reject-all">Do Not Sell My Information</button></div>`);
  try {
    const result = await observe(page);
    assert.ok(result);
    assert.deepEqual(result.candidates.map(c => [c.placementWitness, c.visibility]), [
      ["funding_choices_dns", "rendered_exposed"], ["ezoic_ccpa", "rendered_exposed"],
    ]);
    await page.evaluate(() => document.querySelector(".fc-dns-dialog")!.setAttribute("style", "position:fixed;bottom:0"));
    assert.deepEqual((await observe(page))?.candidates.map(c => c.placementWitness), ["ezoic_ccpa"]);
  } finally {await page.close();}
});

test("short footer labels and the visible OneTrust proxy require their own pointer targets", async () => {
  const page = await fixture(`<footer>
    <a href="/privacy-choices">Do Not Sell My Info</a><a href="/marketing">Do Not Sell My Newsletter</a>
    <div class="--footer-link" style="position:relative;width:180px;height:24px">
      <span class="animated-link --after">Your Privacy Choices</span>
      <div class="animated-link oneTrust ot-sdk-show-settings"
        style="position:absolute;inset:0;opacity:0;cursor:pointer">Your Privacy Choices</div>
    </div>
    <div class="animated-link oneTrust ot-sdk-show-settings">Your Privacy Choices</div>
  </footer>`);
  try {
    const result = await observe(page);
    assert.ok(result);
    assert.deepEqual(result.candidates.map(c => [c.label,c.visibility,c.controlWitness]), [
      ["Do Not Sell My Info","rendered_exposed",undefined],
      ["Your Privacy Choices","rendered_exposed","onetrust_visible_label"],
    ]);
    await page.evaluate(() => document.querySelector(".--after")!.textContent = "Privacy Policy");
    assert.equal((await observe(page))?.candidates.length,1);
  } finally {await page.close();}
});

test("ads privacy choice recognition is scoped to the exact Amazon footer route", async () => {
  const html = `<div id="navFooter" role="contentinfo">
    <a href="/privacyprefs?ref_=footer_iba">Your Ads Privacy Choices</a>
    <a href="/privacyprefs?ref_=unrelated">Your Ads Privacy Choices</a>
    <a href="https://other.test/privacyprefs">Your Ads Privacy Choices</a>
    <a href="/ad-terms">Ad Choices</a>
  </div>`;
  const amazon = await fixture(html,"https://www.amazon.com/");
  const other = await fixture(html);
  try {
    assert.deepEqual((await observe(amazon))?.candidates.map(c => c.controlWitness), ["amazon_ads_privacy_choices"]);
    assert.equal((await observe(other))?.candidates.length,0);
  } finally {await amazon.close();await other.close();}
});

test("an explicitly empty OneTrust footer route can be verified after becoming visible without crediting an unbound anchor", async () => {
  const page=await fixture(`<main style="height:1600px">Store catalog</main><footer style="height:100px">
    <a hidden id="choice" class="ot-sdk-show-settings" style="cursor:pointer" href="">${label}</a>
    <a style="cursor:pointer" href="">Your Privacy Choices</a><a class="ot-sdk-show-settings" style="cursor:pointer">Your California Privacy Choices</a></footer>
    <script>window.addEventListener("scroll",()=>{if(scrollY>50)requestAnimationFrame(()=>document.getElementById("choice").hidden=false);});</script>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    assert.equal(packet.candidates[0]?.checkpoints?.[0]?.visibility,"hidden");
    assert.equal(packet.candidates[0]?.visibility,"rendered_exposed");
    assert.ok(packet.candidates.slice(1).every(c=>c.visibility==="unverified"));
  } finally {await page.close();}
});

test("footer anchors recognize reviewed navigation wording and preserve the original label", async () => {
  const slash = "Do Not Sell/Share My Personal Information";
  const newTab = label + " (opens in a new tab)";
  const page = await fixture(`<main><a href="/choice">${slash}</a></main><footer>
    <a href="https://privacy.fixture.test/form/opt_out" target="_blank" aria-label="${label}">${newTab}</a>
    <a href="#">${slash}</a>
    <a href="/policy">Privacy Notice (opens in a new tab)</a>
    <a href="/rights">Read about ${slash}</a>
    <button>${slash}</button>
    <a href="/consent" aria-label="Accept all cookies">${newTab}</a>
    <a href="javascript:void(0)">${slash}</a>
  </footer>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label, row.visibility]), [
      [newTab, "rendered_exposed"], [slash, "rendered_exposed"], [newTab, "unverified"],
    ]);
  } finally {await page.close();}
});

test("scoped legal navigation records wrapped and occluded named controls", async () => {
  const page = await fixture(`<style>
    #main-footer, .mc4c81cf40_footer {padding:12px;width:160px}
    .cover {position:fixed;inset:0;background:white;z-index:5}
    .spacer {height:1600px}
    .legal-links {width:126px}
  </style>
  <main><div id="main-footer"><nav id="main-footer-nav-v2"><a href="/early">${label}</a></nav></div></main>
  <div class="spacer"></div>
  <div id="main-footer"><div class="wrapper"><nav class="main-footer-nav-v2">
    <nav class="navigation" id="main-footer-nav-v2"><ul><li class="legal-links">
      <a href="/do-not-sell">Do Not Sell My Personal Information</a>
    </li></ul></nav>
  </nav></div></div>
  <div class="mc4c81cf40_footer"><div class="mc4c81cf40_legalFooter">
    <a href="/do-not-sell-or-share">${label}</a>
  </div></div>
  <div class="mc4c81cf40_other"><div class="mc4c81cf40_legalFooter"><a href="/fake">${label}</a></div></div>
  <div class="cover"></div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.scope, row.label, row.visibility]), [
      ["legal_footer_navigation", "Do Not Sell My Personal Information", "covered"],
      ["namespaced_legal_footer", label, "covered"],
    ]);
    for (const row of packet.candidates) {
      assert.ok(row.testedPoints > 0);
      assert.equal(row.testedPoints, row.occludingPoints);
    }
  } finally {await page.close();}
});

test("footer-like names in early content, articles and fixed overlays do not create legal footer evidence", async () => {
  const page = await fixture(`<div id="main-footer"><nav id="main-footer-nav-v2"><a href="/early">${label}</a></nav></div>
    <div style="height:2000px"></div>
    <article><div class="mc4c81cf40_footer"><div class="mc4c81cf40_legalFooter"><a href="/article">${label}</a></div></div></article>
    <div class="mc4c81cf40_footer" style="position:fixed;bottom:0"><div class="mc4c81cf40_legalFooter"><a href="/fixed">${label}</a></div></div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates, []);
    assert.ok(packet.limitations.includes("no_footer_landmark"));
  } finally {await page.close();}
});

test("a href-less OneTrust footer anchor needs a bound settings marker and an actual pointer target", async () => {
  const page = await fixture(`<style>.ot-sdk-show-settings {cursor:pointer}</style>
    <main style="height:1800px">Game</main>
    <div role="contentinfo"><p id="privacy">See our privacy notice.
      <a id="ot-sdk-btn" class="ot-sdk-show-settings">${label}</a>
      <a class="ot-sdk-show-settings">${label}</a>
    </p></div>
    <div id="onetrust-consent-sdk"><div id="onetrust-pc-sdk" hidden>Settings</div></div>
    <script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    const [control, lookalike] = packet.candidates;
    assert.equal(control?.controlWitness, "onetrust_no_href_anchor");
    assert.equal(control?.semanticRole, "settings_control");
    assert.equal(control?.visibility, "rendered_exposed");
    assert.equal(lookalike?.visibility, "unverified");
    assert.equal(await page.evaluate(() => (window as unknown as {clicks: number}).clicks), 0);

    await page.evaluate(() => document.querySelector("#onetrust-pc-sdk")!.remove());
    const withoutPanel = await observe(page);
    assert.equal(withoutPanel?.candidates[0]?.controlWitness, undefined);
    assert.equal(withoutPanel?.candidates[0]?.visibility, "unverified");
  } finally {await page.close();}
});

test("the exact abbreviated footer label requires a real HTTPS privacy-choice route", async () => {
  const label = "Do Not Sell or Share";
  const page = await fixture(`<footer>
    <a href="https://privacy.fixture.test/privacy-rights/">${label}</a>
    <a href="/privacy-policy">${label}</a>
    <a href="#">${label}</a>
    <a href="http://privacy.fixture.test/privacy-rights/">${label}</a>
    <a href="/privacy-choices" download>${label}</a>
    <a href="/privacy-choices">We ${label}</a>
    <p>${label}</p>
  </footer>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label, row.controlWitness, row.visibility]), [
      [label, "abbreviated_privacy_route", "rendered_exposed"],
    ]);
    const forged = {...packet, candidates: [{...packet.candidates[0]!, controlWitness: undefined}]};
    assert.equal(consentFooterOptOutObservationSchema.safeParse(forged).success, false);
  } finally {await page.close();}
});

test("verified footer link destinations support the three reviewed wording variants", async () => {
  const combined = "Do not sell or share my personal information/opt out of targeted advertising";
  const state = "Your State-Specific Privacy Choices";
  const page = await fixture(`<footer id="footer-container">
    <a href="/your-privacy-choices#cookie-button" aria-label="Your Privacy Choices">Your privacy choices , opens in a new tab</a>
    <div id="footer"><a href="/apps/privacy/regions">${state}</a></div>
    <div id="spectrum-footer-legal"><spectrum-legal-links-footer><kite-link>
      <a class="kite-link" href="https://www.spectrum.com/policies/your-privacy-rights-opt-out">${combined}</a>
    </kite-link></spectrum-legal-links-footer></div>
    <a href="/privacy-policy">${state}</a><a href="/policies/advertisement">${combined}</a>
    <button>Your privacy choices, opens in a new tab</button>
    <button>Cookie privacy choices</button><a href="/privacy-policy">Privacy Policy</a>
    <a href="/region-choices">Your Regional Privacy Choices</a>
  </footer>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label,row.controlWitness,row.visibility]), [
      ["Your privacy choices , opens in a new tab","privacy_choices_tab_notice","rendered_exposed"],
      [state,"state_privacy_choices","rendered_exposed"],
      [combined,"sale_sharing_and_targeted_advertising","rendered_exposed"],
    ]);
    assert.ok(packet.limitations.includes("unsupported_control_name"));
    assert.ok(packet.limitations.includes("opaque_footer_content"));
  } finally {await page.close();}
});

test("footer-adjacent choice strips and bounded company legal navigation preserve placement and destination", async () => {
  const page = await fixture(`<main style="height:2000px">Editorial content</main>
    <div class="footer"><div class="footermid"><div class="section-inner section-inner-footer">
      <div class="footer-mid-div"><p>Company</p>
      <a class="footer-link" href="/company/">Privacy Policy</a>
      <a class="footer-link" href="/privacy-policy/privacy-policy/">Your Privacy Choices</a></div>
    </div></div></div>
    <div id="consumer-privacy-footer-wrapper" class="consumer-privacy">
      <button class="consumer-privacy-btn consumer-privacy-footer-btn">${label}</button>
    </div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    const strip = packet.candidates.find(row => row.placementWitness === "consumer_privacy_footer");
    const policy = packet.candidates.find(row => row.controlWitness === "named_privacy_policy_entrance");
    assert.equal(strip?.visibility,"rendered_exposed");
    assert.equal(policy?.visibility,"rendered_exposed");
    assert.equal(policy.scope,"legal_footer_navigation");
    assert.equal(packet.candidates.length,2);

    await page.evaluate(() => {
      const strip = document.getElementById("consumer-privacy-footer-wrapper")!;
      strip.style.cssText = "position:fixed;bottom:0;";
      document.querySelector(".footermid")!.classList.remove("footermid");
    });
    assert.deepEqual((await observe(page))?.candidates,[]);
  } finally {await page.close();}
});

test("document-bound legal footer layouts retain named routes without broad article and footer-class matching", async () => {
  const page = await fixture(`<main style="height:1200px"><article class="column">
    <a href="/Profile/privacy_policy_california_residents/">Do not share my personal information</a>
  </article></main>
  <footer class="page">
    <article class="column"><a href="/Profile/privacy_policy_california_residents/">Do not share my personal information</a></article>
    <article class="column" role="dialog"><a href="/Profile/privacy_policy_california_residents/">Do not share my personal information</a></article>
    <article class="column"><a href="/unrelated">Do not share my personal information</a></article>
  </footer>
  <footer id="uhf-footer"><astro-island><footer>
    <a href="https://privacy.roku.com/ccpa">My privacy choices</a><a href="https://other.test/ccpa">My privacy choices</a>
  </footer></astro-island></footer>
  <section id="f5-footer"><div id="f5-footer-legal-links"><nav>
    <a href="/privacy/opt-out">${label}</a>
  </nav></div></section>
  <div><div class="container"><div id="mspa-footer-html-id" style="display:contents">
    <a href="#">Your Privacy Choices</a>
  </div></div></div>
  <div class="baseline-footer-wrapper"><div class="informa-legal-notice"><div class="baseline-footer">
    <a href="#" style="cursor:pointer">Cookie Preferences / Do Not Sell</a>
    <a href="#">Cookie preferences</a>
  </div></div></div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label, row.controlWitness]), [
      ["Do not share my personal information", "named_privacy_policy_entrance"],
      ["My privacy choices", "roku_privacy_choices"],
      [label, undefined],
      ["Your Privacy Choices", undefined],
      ["Cookie Preferences / Do Not Sell", "cookie_preferences_do_not_sell"],
    ]);
    assert.ok(packet.candidates.every(row => row.visibility === "rendered_exposed"));
  } finally {await page.close();}
});

test("reviewed ARIA suffixes and the alternate OneTrust marker verify their own controls", async () => {
  const sale = "Do Not Sell My Personal Information";
  const providerRoute = "https://brother-privacy.my.onetrust.com/webform/ff262f29-98ea-4e39-8ad9-53d4300405ce/860292b1-11bc-4958-b104-0b9e5e6205bb";
  const page = await fixture(`<footer>
    <a href="${providerRoute}" aria-label="${sale} Company (Opens in a new tab)">${sale}</a>
    <a href="/cookie-policy#sale" aria-label="${label}, opens in a new tab">${label}</a>
    <a id="ot-sdk-btn1" class="ot-sdk-show-settings">${sale}</a>
    <a href="/wrong" aria-label="${sale} Company (Opens in a new tab)">${sale}</a>
    <a href="/other" aria-label="Accept all cookies">${label}</a>
    <a class="ot-sdk-show-settings">${sale}</a>
  </footer><div id="onetrust-consent-sdk"><div id="onetrust-pc-sdk" hidden></div></div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.visibility, row.controlWitness]), [
      ["rendered_exposed", undefined], ["rendered_exposed", undefined],
      ["rendered_exposed", "onetrust_no_href_anchor"], ["unverified", undefined],
      ["unverified", undefined], ["unverified", undefined],
    ]);
  } finally {await page.close();}
});

test("scoped exact footer evidence survives a sluggish optional document traversal inside the original deadline", async () => {
  const page=await fixture(`<main>${"<span>Content</span>".repeat(4800)}</main>
    <footer><nav style="height:75px"><a href="/privacy/opt-out">${label}</a></nav></footer>`);
  try {
    await page.evaluate(()=>{
      const original=document.createTreeWalker.bind(document);
      document.createTreeWalker=(...args: Parameters<Document["createTreeWalker"]>)=>{
        const w=original(...args);
        if(args[0]===document) {
          const next=w.nextNode.bind(w);
          w.nextNode=()=>{const end=performance.now()+0.8;while(performance.now()<end){}return next();};
        }
        return w;
      };
    });
    const packet=await observe(page);assert.ok(packet);
    assert.equal(packet.candidates[0]?.visibility,"rendered_exposed");assert.ok(packet.candidates[0]!.matchingPoints>0);
    assert.ok(packet.limitations.includes("traversal_limited"));
    assert.equal(await page.evaluate(()=>scrollY),0);
  } finally {await page.close();}
});
test("the eventual document-end shadow footer is reached on a long page with honest partial traversal", async () => {
  const page=await fixture(`<main style="height:1700px">${"<span>Content</span>".repeat(3800)}</main><privacy-shell></privacy-shell>
    <script>document.querySelector("privacy-shell").attachShadow({mode:"open"}).innerHTML='<footer><a href="/privacy/opt-out">${label}</a></footer>';</script>`);
  try {
    const packet=await observe(page);assert.ok(packet);
    assert.equal(packet.candidates[0]?.visibility,"rendered_exposed");assert.equal(packet.footerCount,1);
    assert.ok(packet.limitations.includes("traversal_limited"));
  } finally {await page.close();}
});
test("an Astro light-DOM island with an inspected nested footer keeps a separate opaque sibling limited", async () => {
  const page=await fixture(`<footer id="uhf-footer"><astro-island><footer><nav><a href="/privacy/choices">${label}</a></nav></footer></astro-island></footer>`);
  try {
    const packet=await observe(page);assert.ok(packet);assert.equal(packet.footerCount,2);
    assert.equal(packet.candidates[0]?.visibility,"rendered_exposed");assert.ok(!packet.limitations.includes("opaque_footer_content"));
    await page.evaluate(()=>{const e=document.createElement("x-private");document.querySelector("footer")!.append(e);e.attachShadow({mode:"closed"});});
    assert.ok((await observe(page))?.limitations.includes("opaque_footer_content"));
  } finally {await page.close();}
});
test("when a footer-end alignment clamps, an actual pointer hit at the viewport edge can establish exposure",async()=>{
  const page=await fixture(`<main style="height:1850px">Public information</main><footer style="height:90px"><a href="/privacy/opt-out">${label}</a></footer>
    <div style="position:fixed;left:0;right:0;top:600px;height:60px;background:#dedede;z-index:99">Sticky advertising</div>`);
  try{
    const packet=await observe(page);assert.ok(packet);
    const row=packet.candidates[0];assert.ok(row);
    assert.ok(row.checkpoints?.some(c=>c.phase==="positioned"&&c.visibility==="covered"&&c.occludingPoints===c.testedPoints));
    assert.equal(row.checkpoints?.at(-1)?.phase,"alternate");assert.equal(row.visibility,"rendered_exposed");assert.ok(row.matchingPoints>0);
    assert.equal(await page.evaluate(()=>scrollY),0);
  }finally{await page.close();}
});

test("short data wording is captured on both the OneTrust footer button and the Quantcast end strip", async () => {
  const page = await fixture(`
    <main><button>We do not sell my data</button></main>
    <footer><button id="ot-sdk-btn" class="ot-sdk-show-settings">Do not sell my data</button>
      <a href="/privacy">We do not sell my data</a></footer>
    <div class="container-choice-footer-msg"><div class="container-inside">
      <div id="choice-footer-msg" class="ccpa-msg-added" style="position:relative">
        <a href="#" style="cursor:pointer">Do Not Sell My Data</a>
        <span style="position:absolute;inset:0;z-index:2;background:white">Overlay</span>
      </div>
    </div></div>
  `);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label, row.controlWitness, row.visibility]), [
      ["Do not sell my data", "onetrust_footer_sell_data", "rendered_exposed"],
      ["Do Not Sell My Data", "quantcast_footer_sell_data", "covered"],
    ]);
  } finally {await page.close();}
});

test("the California prefix and nonsemantic MSPA control require the reviewed local witness", async () => {
  const caName = "CA: Do Not Sell My Personal Information";
  const page = await fixture(`
    <main><a href="/ccpa">${caName}</a><div onclick="window.clicks++">${label}</div></main>
    <div class="m-footer__legal-bar"><div class="m-footer__legal-bar-container">
      <nav class="m-footer__legal-bar-subnav">
        <a href="/ccpa">${caName}</a><a href="https://other.test/ccpa">${caName}</a>
        <a href="/terms">${caName}</a>
      </nav></div></div>
    <footer class="site-footer-container"><div id="colophon" class="site-footer">
      <div id="consent-module-mspa" onclick="window.clicks++">${label}</div>
      <div id="consent-module-gdpr" onclick="window.clicks++">Privacy settings</div>
    </div></footer>
    <script>window.clicks=0</script>
  `);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.controlWitness, row.visibility]), [
      ["ca_prefixed_sale_link", "rendered_exposed"],
      ["mspa_footer_handler", "rendered_exposed"],
    ]);
    assert.equal(await page.evaluate(() => (window as unknown as {clicks: number}).clicks), 0);
    await page.evaluate(() => document.querySelector("#consent-module-mspa")?.removeAttribute("onclick"));
    assert.deepEqual((await observe(page))?.candidates.map(row => row.controlWitness), ["ca_prefixed_sale_link"]);
  } finally {await page.close();}
});

test("Woot advertising choices require the exact advertising footer destination", async () => {
  const html = `<footer id="global-footer"><div class="privacy">
      <a href="/privacy-settings?ref=w_ngf_privsett">Your Ads Privacy Choices</a>
      <a href="/privacy-settings?ref=unrelated">Your Ads Privacy Choices</a>
    </div><a href="/privacy-settings?ref=w_ngf_privsett">Your Ads Privacy Choices</a></footer>`;
  const own = await fixture(html, "https://www.woot.com/");
  const foreign = await fixture(html);
  try {
    const packet = await observe(own);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.controlWitness, row.visibility]), [
      ["woot_ads_privacy_choices", "rendered_exposed"],
    ]);
    assert.deepEqual((await observe(foreign))?.candidates, []);
  } finally {await Promise.all([own.close(), foreign.close()]);}
});

test("end-of-document legal navigation reaches explicit choices outside semantic footers", async () => {
  const page = await fixture(`<main style="height:1800px">
    <article><a href="/privacy-policy#opt-out">${label}</a><a href="/privacy-policy">Privacy policy</a>
      <a href="/terms">Terms of use</a></article></main>
    <div id="main"><div><p><a href="https://legal.footer-fixture.test/docs/policies/privacy/exercising-your-rights">${label}</a></p>
      <a href="/cookie-policy">Cookie Policy</a><a href="/terms">Terms &amp; Conditions</a></div></div>
    <div class="page-footer-component"><ul class="last-details"><li><a href="/privacy-policy#opt-out">${label}</a></li></ul></div>
    <div class="footer-link"><a href="/privacy-policy">Privacy Policy</a>
      <a href="https://preferences.footer-fixture.test/form/opt_out?locationCode=US-CA">Your Privacy Choices</a></div>
    <div class="footer-link"><a href="/terms">Terms</a><a href="/support">Privacy Guidance</a></div>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.scope,row.label]).sort(), [
      ["legal_footer_navigation",label], ["legal_footer_navigation",label],
      ["legal_footer_navigation","Your Privacy Choices"],
    ]);
    assert.ok(packet.candidates.every(row => row.visibility === "rendered_exposed"));
  } finally { await page.close(); }
});

test("reviewed footer handlers and the sensitive-data route retain only their actual controls", async () => {
  const page = await fixture(`<div id="vsFooterLinks"><a class="qc-ccpa-persistent-link sl_cmp_link">Your Privacy Choices
    <img alt="California Consumer Privacy Act (CCPA) Opt-Out Icon"></a><a>Your Privacy Choices</a></div>
    <footer><div id="layoutFooterInformation"><a id="hlYourPrivacyChoices" onclick="window.choiceActions++">Your Privacy Choices</a></div></footer>
    <div id="__next"><div class="footer"><div><section>
      <a aria-label="do-not-sell-link" href="javascript:window.choiceActions++">Your Privacy Choices: Opt Out of Sale/Targeted Ads
      <svg aria-label="Opt-Out Icon"></svg></a><a href="/policy">DAA Industry Opt Out</a>
    </section></div></div></div>
    <main><dcl-globalfooter><div class="emcmUi-GlobalFooter-under">
      <div class="emcmUi-GlobalFooterUnder"><a class="emcmUi-GlobalFooterUnder-link" href="/ccpa-dsar"><span>Do not sell or share my personal information and limit the use of my sensitive personal information</span></a>
      <a class="emcmUi-GlobalFooterUnder-link" href="https://other.test/ccpa-dsar">Do not sell or share my personal information and limit the use of my sensitive personal information</a>
      <a href="/privacy">${label}</a>
    </div></div></dcl-globalfooter></main><script>window.choiceActions=0</script>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.flatMap(row => row.controlWitness ?? []).sort(), [
      "hal_leonard_footer_handler","hearst_sale_ads_handler","quantcast_persistent_anchor","sale_sharing_and_sensitive_data",
    ]);
    assert.ok(packet.candidates.filter(row => row.controlWitness).every(row => row.visibility === "rendered_exposed"));
    assert.equal(await page.evaluate(() => (window as unknown as {choiceActions:number}).choiceActions), 0);
    await page.evaluate(() => {
      document.querySelector("#hlYourPrivacyChoices")?.removeAttribute("onclick");
      document.querySelector("a.qc-ccpa-persistent-link img")?.remove();
      document.querySelector("a[aria-label='do-not-sell-link']")?.removeAttribute("aria-label");
    });
    assert.deepEqual((await observe(page))?.candidates.flatMap(row => row.controlWitness ?? []), ["sale_sharing_and_sensitive_data"]);
  } finally { await page.close(); }
});

test("contracted sale wording and explicit Hearst sale and ad choices require their own control and route", async () => {
  const contracted = "Don’t sell my info";
  const hearst = "Your Privacy Choices/(Opt-Out of Sale/Targeted Ads)";
  const page = await fixture(`<footer class="site-ftr">
    <div class="copyright"><div id="mspa-footer-html-id">
      <a id="owner" href="#" onclick="window.optOutClicks++">${contracted}</a>
      <a href="#">Don't sell my info</a>
      <a href="#" onclick="window.optOutClicks++">We don't sell my info</a>
    </div></div>
    <a href="#" onclick="window.optOutClicks++">Don't sell my info</a>
  </footer><footer id="footer"><div id="footer-inner"><ul id="footer-legal-items-rows">
    <li class="footer-legal-row-item"><a href="/yourdata">${hearst}</a></li>
    <li class="footer-legal-row-item"><a href="https://foreign.test/yourdata">${hearst}</a></li>
    <li class="footer-legal-row-item"><a href="/yourdata?unexpected=1">${hearst}</a></li>
    <li class="footer-legal-row-item"><a href="/privacy-notice#e">DAA Industry Opt Out</a></li>
    <li><a href="/yourdata">${hearst}</a></li>
  </ul></div></footer><script>window.optOutClicks=0</script>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.label,row.controlWitness,row.semanticRole,row.visibility]), [
      [contracted,"mspa_footer_contracted_sale_handler","settings_control","rendered_exposed"],
      [hearst,"hearst_sale_ads_link","link","rendered_exposed"],
    ]);
    assert.equal(await page.evaluate(() => (window as unknown as {optOutClicks:number}).optOutClicks),0);
    await page.evaluate(() => document.getElementById("owner")!.removeAttribute("onclick"));
    assert.deepEqual((await observe(page))?.candidates.map(row => row.controlWitness),["hearst_sale_ads_link"]);
  } finally { await page.close(); }
});

test("a newly positioned Funding Choices strip confirms exposure after a paint opportunity", async () => {
  const html = `<main style="height:1800px">Content ahead of the legal strip</main>
    <div class="fc-ccpa-root"><div class="fc-dns-dialog">
      <button class="fc-dns-link" style="display:block;width:100%;height:43px">${label}</button>
    </div></div>`;
  const exposed = await fixture(html);
  const covered = await fixture(html + `<iframe id="cover" hidden srcdoc="<p>Floating ad</p>"
    style="position:fixed;bottom:0;left:0;width:100%;height:86px;border:0;z-index:50"></iframe>
    <script>addEventListener('scroll',()=>requestAnimationFrame(()=>{
      if(scrollY>1000)document.getElementById('cover').hidden=false;
    }),{passive:true});</script>`);
  try {
    const exposedPacket = await observe(exposed);
    const exposedRow = exposedPacket?.candidates[0];
    assert.equal(exposedRow?.visibility,"rendered_exposed");
    assert.equal(exposedRow.checkpoints?.at(-1)?.phase,"settled");
    const packet = await observe(covered);
    const row = packet?.candidates[0];
    assert.ok(row);
    assert.equal(row?.placementWitness,"funding_choices_dns");
    assert.equal(row.visibility,"covered");
    assert.equal(row.iframeOccludingPoints,5);
    assert.deepEqual(row.checkpoints?.slice(0,3).map(c => [c.phase,c.visibility,c.iframeOccludingPoints ?? 0]),[
      ["initial","offscreen_unverified",0], ["positioned","rendered_exposed",0], ["settled","covered",5],
    ]);
    assert.equal(await covered.evaluate(() => window.scrollY),0);
    assert.equal(consentFooterOptOutObservationSchema.safeParse({
      ...exposedPacket, candidates:[{...exposedRow,iframeOccludingPoints:5}],
    }).success,false);
  } finally { await Promise.all([exposed.close(),covered.close()]); }
});

test("priority recovery retains the exact Funding Choices strip when optional footer discovery would stall", async () => {
  const page = await fixture(`<main style="height:1800px">News and article links</main>
    <div class="fc-ccpa-root"><div class="fc-dns-dialog">
      <button class="fc-dns-link" style="display:block;width:100%;height:43px">${label}</button>
    </div></div>`);
  try {
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document);
      document.querySelectorAll = (selector: string) => {
        if (selector.includes('[role="contentinfo"]')) {
          const until = performance.now() + 190;
          while (performance.now() < until) { /* simulate crowded optional discovery */ }
        }
        return query(selector);
      };
    });
    const packet = await captureConsentFooterOptOut({page, snapshot, scanStartedAtMs:Date.now()-100,
      readBinding:() => ({url,documentIdentity:identity}), budgetMs:175, prioritizeFundingChoicesStrip:true});
    assert.ok(packet);
    assert.equal(packet.coverage,"limited");
    assert.ok(packet.limitations.includes("traversal_limited"));
    assert.deepEqual(packet.candidates.map(row => [row.placementWitness,row.visibility,row.checkpoints?.at(-1)?.phase]),[
      ["funding_choices_dns","rendered_exposed","settled"],
    ]);
    assert.equal(await page.evaluate(() => window.scrollY),0);
  } finally { await page.close(); }
  const ordinary = await fixture(`<footer><a href="/privacy/choices">${label}</a></footer>`);
  try {
    const packet = await captureConsentFooterOptOut({page:ordinary, snapshot, scanStartedAtMs:Date.now()-100,
      readBinding:() => ({url,documentIdentity:identity}), budgetMs:175, prioritizeFundingChoicesStrip:true});
    assert.equal(packet?.candidates[0]?.scope,"footer");
  } finally { await ordinary.close(); }
});

test("the publisher landmark inside nested open shadow DOM is inspected before unrelated document traversal", async () => {
  const page = await fixture(`<main style="height:1800px">Main site content</main>
    <blz-nav-footer></blz-nav-footer>
    <div hidden>${"<span>Outside footer</span>".repeat(3600)}</div>
    <script>
      const root = document.querySelector("blz-nav-footer").attachShadow({mode:"open"});
      root.innerHTML = '<footer><blz-nav-content-block id="trademark"></blz-nav-content-block></footer>';
      root.querySelector("#trademark").attachShadow({mode:"open"}).innerHTML =
        '<div id="trademark"><a href="https://www.blizzard.com/legal/a97631bf-2b21-4755-a740-5934bd5cb632/">${label}</a></div>';
    </script>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.scope,row.label,row.visibility]),[
      ["footer",label,"rendered_exposed"],
    ]);
    await page.evaluate(() => document.querySelector("blz-nav-footer")!.shadowRoot!.querySelector("footer")!.remove());
    assert.deepEqual((await observe(page))?.candidates,[]);
  } finally { await page.close(); }
});

test("a OneTrust footer text trigger and a combined webform link retain their bound roles and scope", async () => {
  const combined = "Do Not Sell or Share My Personal Information or Limit Use of My Sensitive Personal Information";
  const form = "https://privacyportal-de.onetrust.com/webform/a65e007c-be1f-41dc-93c3-d7020bd23faa/6013bea9-c953-4581-8cdd-6ce79f9a904d";
  const page = await fixture(`<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" hidden></div></div>
    <footer><p style="cursor:pointer" id="ot-sdk-btn" class="ot-sdk-show-settings">Do Not Sell My Personal Information</p>
    <div class="footer__bottom">
      <a href="${form}">${combined}</a>
      <a href="${form.replace("onetrust.com","foreign.test")}">${combined}</a>
      <a href="${form}?unbound=1">${combined}</a>
      <a href="/privacy">Limit use of my sensitive personal information</a>
    </div><p style="cursor:pointer" class="ot-sdk-show-settings">Do Not Sell My Personal Information</p></footer>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.deepEqual(packet.candidates.map(row => [row.semanticRole,row.controlWitness,row.visibility]), [
      ["settings_control","onetrust_footer_text_trigger","rendered_exposed"],
      ["link","onetrust_sensitive_data_webform","rendered_exposed"],
    ]);
    await page.evaluate(() => document.querySelector("#onetrust-consent-sdk")!.remove());
    assert.deepEqual((await observe(page))?.candidates.map(row => row.controlWitness),["onetrust_sensitive_data_webform"]);
  } finally { await page.close(); }
});

test("a dense footer retains a covered OneTrust text trigger when optional discovery would stall", async () => {
  const page = await fixture(`<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" hidden></div></div>
    <main style="height:1800px">Main site content</main>
    <footer>${'<a href="/navigation">Site navigation</a>'.repeat(60)}
      <p style="cursor:pointer" id="ot-sdk-btn" class="ot-sdk-show-settings">Do Not Sell My Personal Information</p>
    </footer><div style="position:fixed;inset:0;z-index:9999" aria-hidden="true"></div>`);
  try {
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document);
      document.querySelectorAll = (selector: string) => {
        if (selector.includes('[role="contentinfo"]')) {
          const until = performance.now() + 190;
          while (performance.now() < until) { /* simulate crowded optional discovery */ }
        }
        return query(selector);
      };
    });
    const packet = await captureConsentFooterOptOut({page, snapshot, scanStartedAtMs:Date.now()-100,
      readBinding:() => ({url,documentIdentity:identity}), budgetMs:175});
    assert.ok(packet);
    assert.equal(packet.coverage,"limited");
    assert.ok(packet.limitations.includes("traversal_limited"));
    assert.deepEqual(packet.candidates.map(row => [row.scope,row.controlWitness,row.visibility]),[
      ["footer","onetrust_footer_text_trigger","covered"],
    ]);
    assert.equal(await page.evaluate(() => window.scrollY),0);
  } finally { await page.close(); }
});

test("OneTrust footer settings bind a form-contained button and a nonsemantic owner without activating either", async () => {
  const page = await fixture(`<form id="outer" action="/never-submit"><footer>
    <button id="ot-sdk-btn" class="ot-sdk-show-settings" style="cursor:pointer">Your Privacy Choices</button>
    <button style="cursor:pointer">Do Not Sell My Personal Information</button>
  </footer></form><div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" hidden></div></div>`);
  try {
    await page.evaluate(() => {
      document.body.dataset.events = "0";
      for (const event of ["click", "submit"]) document.addEventListener(event, e => {
        e.preventDefault(); document.body.dataset.events = "1";
      });
    });
    let packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.controlWitness,row.semanticRole,row.visibility]),[
      ["onetrust_form_footer_settings","settings_control","rendered_exposed"],
      [undefined,"button","unverified"],
    ]);
    await page.evaluate(() => document.querySelector("#ot-sdk-btn")!.setAttribute("formaction", "/also-never-submit"));
    packet = await observe(page);
    assert.equal(packet?.candidates[0]?.visibility,"unverified");
    assert.equal(packet?.candidates[0]?.controlWitness,undefined);
    await page.evaluate(() => {
      document.querySelector("#ot-sdk-btn")!.outerHTML = '<div id="ot-sdk-btn" class="ot-sdk-show-settings" style="cursor:pointer">DO NOT SELL MY PERSONAL INFORMATION</div>';
    });
    assert.equal((await observe(page))?.candidates[0]?.controlWitness,"onetrust_footer_text_trigger");
    await page.evaluate(() => document.querySelector("#onetrust-consent-sdk")!.remove());
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness === undefined && row.visibility !== "rendered_exposed"));
    assert.equal(await page.evaluate(() => document.body.dataset.events),"0");
  } finally { await page.close(); }
});

test("the compound sale and targeted-advertising label stays bound to the qualified footer route", async () => {
  const combined = "DO NOT SELL OR SHARE MY PERSONAL INFORMATION/OPT-OUT OF TARGETED ADVERTISING";
  const route = "/policies/your-privacy-rights-opt-out";
  const page = await fixture(`<footer><a href="${route}">${combined}</a>
    <a href="${route}?ambiguous=1">${combined}</a>
    <a href="https://unrelated.example${route}">${combined}</a>
    <a href="${route}">California consumer limit the use of my sensitive personal information</a></footer>`);
  try {
    assert.deepEqual((await observe(page))?.candidates.map(row => [row.controlWitness,row.visibility]),[
      ["sale_sharing_and_targeted_advertising","rendered_exposed"],
    ]);
  } finally { await page.close(); }
});

test("an end-of-document Funding Choices open-shadow button retains covered evidence separately from a hidden copy", async () => {
  const page = await fixture(`<main style="height:1800px">Public content</main><footer>Ordinary footer</footer>
    <div id="cover" style="position:fixed;inset:0;z-index:9999"></div><div><button hidden>${label}</button></div>
    <div id="widget"></div><script>
      const host = document.querySelector('#widget');
      host.attachShadow({mode:'open'}).innerHTML = '<div class="ipr-container"><button class="ipr-button">${label}</button></div>';
    </script>`);
  try {
    const packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.placementWitness,row.visibility,row.occludingPoints]),[
      ["funding_choices_ipr","covered",5],
    ]);
    await page.evaluate(() => document.querySelector("#cover")!.remove());
    const uncovered = await observe(page);
    assert.equal(uncovered?.candidates[0]?.visibility,"rendered_exposed");
    assert.equal(uncovered?.candidates[0]?.checkpoints?.at(-1)?.phase,"settled");
    await page.evaluate(() => document.querySelector("#widget")!.shadowRoot!.querySelector("button")!.className = "unbound");
    assert.deepEqual((await observe(page))?.candidates,[]);
    assert.equal(await page.evaluate(() => window.scrollY),0);
  } finally { await page.close(); }
});

test("a copyright-side legal rail binds the named privacy entrance and ignores ordinary cookie-policy links", async () => {
  const route = "/legal/cookie-and-similar-technologies-policy";
  const page = await fixture(`<main><div style="width:180px"><div>
    <a href="/privacy">Privacy policy</a><a href="${route}">Your Privacy Choices</a><a href="/help">Help Center</a>
    <a href="${route}">Cookie Policy</a></div><div id="copyright">Copyright © 2012-2026 Publisher</div></div>
    <article><a href="${route}">Your Privacy Choices</a></article></main>`);
  try {
    const packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.scope,row.controlWitness,row.visibility]),[
      ["legal_footer_navigation","named_privacy_policy_entrance","rendered_exposed"],
    ]);
    await page.evaluate(() => document.querySelector("#copyright")!.remove());
    assert.deepEqual((await observe(page))?.candidates,[]);
  } finally { await page.close(); }
});

test("document-end custom legal markup inside main retains a verified button and qualified link", async () => {
  const page = await fixture(`<main><section style="height:2000px">Main content</section>
    <section class="publisher-global-footer"><div class="publisher-footer-bottom">
      <div>© Example Publisher Inc. 2026</div><ul class="site-footer-legal">
        <li><a href="https://owner.example/terms">Terms of service</a></li>
        <li><a href="https://owner.example/privacy">Privacy policy</a></li>
        <li><a href="https://owner.example/privacy#california">Privacy notice for California users</a></li>
        <li><button id="opt">${label}</button></li>
        <li><a href="/your-privacy-choices">Your Privacy Choices</a></li>
        <li><a href="https://foreign.example/your-privacy-choices">Your Privacy Choices</a></li>
        <li><a href="/subscribe">Your Privacy Choices</a></li>
        <li><button>${label}</button></li>
      </ul></div></section></main><script>
      document.body.dataset.clicked = '0';
      document.querySelector('#opt').onclick = () => { document.body.dataset.clicked = '1'; };
    </script>`);
  try {
    const packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.scope,row.semanticRole,row.visibility]),[
      ["custom_legal_footer","button","rendered_exposed"], ["custom_legal_footer","link","rendered_exposed"],
    ]);
    assert.ok(packet?.candidates.every(row => row.view === "footer_position" && row.matchingPoints > 0));
    assert.equal(consentFooterOptOutObservationSchema.safeParse({...packet,
      candidates:[{...packet?.candidates[0], label:"Cookie Settings"}]}).success,false);
    assert.equal(await page.evaluate(() => document.body.dataset.clicked),"0");
    assert.equal(await page.evaluate(() => window.scrollY),0);

    await page.evaluate(() => {
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;inset:0;z-index:3000";
      document.body.append(overlay);
    });
    assert.ok((await observe(page))?.candidates.every(row => row.visibility === "covered" && row.occludingPoints === 5));
    await page.evaluate(() => { document.querySelector('#opt')!.parentElement!.parentElement!.previousElementSibling!.remove(); });
    assert.deepEqual((await observe(page))?.candidates,[]);
  } finally { await page.close(); }
});

test("footer-like legal groups in articles or above the document end add no custom footer results", async () => {
  const group = `<div class="publisher-footer-bottom"><p>2026 © Example Publisher</p><ul class="publisher-footer-legal">
    <li><a href="/terms">Terms of use</a></li><li><a href="/privacy">Privacy policy</a></li>
    <li><button onclick="throw new Error('unexpected click')">${label}</button></li></ul></div>`;
  const page = await fixture(`<main>${group}<div style="height:2000px">Later main content</div>
    <article>${group}</article><div style="position:fixed;bottom:0">${group}</div></main>`);
  try { assert.deepEqual((await observe(page))?.candidates,[]); }
  finally { await page.close(); }
});

test("a labeled terminal Legal column binds a focusable custom button without class-name and inline-listener assumptions", async () => {
  const page = await fixture(`<main style="position:relative;height:2200px"><div>Main site content</div>
    <div style="overflow:hidden;height:20px"><div id="layout" style="position:absolute;bottom:0;width:100%"><div><div><ul class="x123">
      <li><span>Legal</span></li><li><a href="/privacy">Privacy</a></li>
      <li><a href="/terms">Legal &amp; Terms</a></li><li><a href="/cookies">Cookies</a></li>
      <li><div tabindex="0" style="cursor:pointer" id="control" role="button">${label}</div></li>
      <li><div tabindex="0" style="cursor:pointer" role="button">Limit the Use of My Sensitive Personal Information</div></li>
    </ul></div></div><div>© Publisher 2026</div></div></div></main>
    <script>document.querySelector('#control').onclick = () => { throw new Error('unexpected activation'); };</script>`);
  try {
    assert.deepEqual((await observe(page))?.candidates.map(row => [row.label,row.scope,row.visibility]),[
      [label,"custom_legal_footer","rendered_exposed"],
    ]);
    await page.evaluate(() => {
      const control = document.querySelector<HTMLElement>('#control')!;
      control.style.clipPath = 'inset(100%)';
    });
    assert.equal((await observe(page))?.candidates[0]?.visibility,"unverified");
    await page.evaluate(() => { document.querySelector<HTMLElement>('#control')!.style.clipPath = ''; });
    await page.evaluate(() => { document.querySelector<HTMLElement>('#layout')!.style.width = '35%'; });
    assert.deepEqual((await observe(page))?.candidates,[]);
    await page.evaluate(() => { document.querySelector<HTMLElement>('#layout')!.style.width = '100%'; });
    await page.evaluate(() => document.querySelector('#control')!.setAttribute('tabindex','-1'));
    assert.deepEqual((await observe(page))?.candidates,[]);
  } finally { await page.close(); }
});

test("an opacity-delayed same-origin footer choice is rechecked without upgrading an explicitly hidden link", async () => {
  const page = await fixture(`<main style="height:1800px">Main site content</main><footer style="height:500px">
    <div id="reveal" style="opacity:0"><a href="/privacy-choices">Your Privacy Choices</a></div>
    <div aria-hidden="true" style="opacity:0"><a href="/privacy-choices">Your California Privacy Choices</a></div>
    </footer><script>
      let pending = false;
      addEventListener('scroll', () => { if (scrollY > 1000 && !pending) {
        pending = true; setTimeout(() => { document.querySelector('#reveal').style.opacity = '1'; }, 250);
      } });
    </script>`);
  try {
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document);
      document.querySelectorAll = (selector: string) => {
        if (selector.includes('[role="contentinfo"]')) {
          const until = performance.now() + 460;
          while (performance.now() < until) { /* simulate crowded generic discovery */ }
        }
        return query(selector);
      };
    });
    const packet = await captureConsentFooterOptOut({page,snapshot,readBinding:() => ({url,documentIdentity:identity}),
      scanStartedAtMs:Date.now()-500,budgetMs:450,allowExtendedFooterReveal:true});
    assert.equal(packet?.coverage,"limited");
    assert.deepEqual(packet?.candidates.map(row => [row.label,row.visibility,row.checkpoints?.at(-1)?.phase]),[
      ["Your Privacy Choices","rendered_exposed","reveal"],
    ]);
    assert.equal(await page.evaluate(() => window.scrollY),0);
  } finally { await page.close(); }
});

test("the starting-viewport OneTrust settings evidence requires the actual enabled owner, name and pointer access", async () => {
  const page = await fixture(`<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" style="position:fixed;bottom:0;left:0;z-index:10">
    <div id="onetrust-button-group"><button id="onetrust-pc-btn-handler" aria-label="${label}, Opens the preference center dialog">${label}</button>
    <button id="onetrust-reject-all-handler">Reject All</button></div></div></div><footer><a href="/privacy-choices">Your Privacy Choices</a></footer>`);
  const read = () => captureConsentFooterOptOutWithOutcome({page,snapshot,readBinding:() => ({url,documentIdentity:identity}),
    scanStartedAtMs:Date.now()-500,budgetMs:175});
  try {
    const first = await read();
    assert.equal(first.originalOneTrustSettingsEntrance?.documentToken,identity.token);
    assert.equal(first.originalOneTrustSettingsEntrance?.matchingPoints,5);
    assert.deepEqual(first.footerOptOutObservation?.candidates.map(row => row.label),["Your Privacy Choices"]);
    await page.evaluate(() => { document.querySelector('#onetrust-pc-btn-handler')!.setAttribute('aria-label','Cookie Settings'); });
    assert.equal((await read()).originalOneTrustSettingsEntrance,undefined);
    await page.evaluate(value => {
      document.querySelector('#onetrust-pc-btn-handler')!.setAttribute('aria-label',value);
      const cover = document.createElement('div'); cover.style.cssText = 'position:fixed;inset:0;z-index:12'; document.body.append(cover);
    },`${label}, Opens the preference center dialog`);
    assert.equal((await read()).originalOneTrustSettingsEntrance,undefined);
  } finally { await page.close(); }
});

test("a long page keeps its exact Funding Choices end strip under the normal deadline even when the end moves", async () => {
  const page = await fixture(`<main id="feed" style="height:19000px">Sports coverage</main>
    <div class="fc-ccpa-root"><div class="fc-dns-dialog">
      <button class="fc-dns-link" style="display:block;width:100%;height:43px">${label}</button>
    </div></div><div id="overlay" style="position:fixed;inset:0;background:#1113;z-index:9999"></div>`);
  try {
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document);
      document.querySelectorAll = (selector: string) => {
        if (selector.includes('[role="contentinfo"]')) {
          const until = performance.now() + 210;
          while (performance.now() < until) { /* simulate expensive optional discovery */ }
        }
        return query(selector);
      };
      addEventListener("scroll", () => requestAnimationFrame(() => {
        if (window.scrollY > 10000) document.querySelector<HTMLElement>("#feed")!.style.height = "19550px";
      }),{passive:true});
    });
    const result = await captureConsentFooterOptOutWithOutcome({page,snapshot,readBinding:() => ({url,documentIdentity:identity}),
      scanStartedAtMs:Date.now()-500,budgetMs:175});
    assert.equal(result.footerOptOutCapture?.outcome,"captured");
    const packet = result.footerOptOutObservation;
    assert.equal(packet?.coverage,"limited");
    assert.ok(packet?.limitations.includes("traversal_limited"));
    assert.deepEqual(packet?.candidates.map(row => [row.placementWitness,row.visibility,row.matchingPoints,row.occludingPoints]),[
      ["funding_choices_dns","covered",0,5],
    ]);
    assert.equal(packet?.candidates[0]?.checkpoints?.at(-1)?.phase,"alternate");
    assert.equal(await page.evaluate(() => window.scrollY),0);
  } finally { await page.close(); }
});

test("the covered subject-access footer link requires matching visible purpose and a bound first-party route", async () => {
  const path = "/legal/do-not-sell-my-personal-information";
  const aria = `${label} Subject Access Request`;
  const page = await fixture(`<main style="height:1800px">Site content</main><footer>
    <a href="${path}" aria-label="${aria}"><span>${label}</span></a>
    <a href="${path}" aria-label="${aria}" hidden>${label}</a>
    <a href="${path}?unexpected=1" aria-label="${aria}">${label}</a>
    <a href="https://another.test${path}" aria-label="${aria}">${label}</a>
    <a href="/privacy" aria-label="${aria}">${label}</a>
    <a href="${path}" aria-label="Subject Access Request">${label}</a>
    </footer><div id="cover" style="position:fixed;inset:0;background:#0006;z-index:9999"></div>`);
  try {
    await page.evaluate(() => {
      const query = document.querySelectorAll.bind(document);
      document.querySelectorAll = (selector: string) => {
        if (selector.includes('[role="contentinfo"]')) {
          const until = performance.now() + 210;
          while (performance.now() < until) { /* simulate expensive optional discovery */ }
        }
        return query(selector);
      };
    });
    const packet = await observe(page);
    assert.equal(packet?.coverage,"limited");
    assert.equal(packet?.candidates.length,2);
    assert.deepEqual(packet?.candidates.filter(row => row.controlWitness).map(row => [row.controlWitness,row.visibility]),[
      ["sale_sharing_subject_access_request","covered"], ["sale_sharing_subject_access_request","hidden"],
    ]);
    assert.equal(packet?.candidates[0]?.occludingPoints,5);
    await page.reload();
    await page.evaluate(() => { document.querySelector("footer a")!.setAttribute("aria-label","Subject Access Request"); });
    const nonmatches = (await observe(page))?.candidates;
    assert.equal(nonmatches?.length,6);
    assert.ok(nonmatches?.every(row => row.visibility === "unverified" || row.visibility === "hidden"));
    await page.evaluate(value => { document.querySelector("footer a")!.setAttribute("aria-label",value); },aria);
    await page.evaluate(() => document.querySelector("#cover")!.remove());
    assert.equal((await observe(page))?.candidates[0]?.visibility,"rendered_exposed");
  } finally { await page.close(); }
});

test("bound footer sale controls are pointer-checked before the optional footer walk", async () => {
  const legalLinks = '<a href="/privacy">Privacy Policy</a> <a href="/terms">Terms &amp; Conditions</a>';
  const short = "Do not sell/share my information";
  const saleButton = "Do Not Sell/Share My Personal Information";
  const form = "/about/legal/privacy/form/";
  const opener = "javascript:window.UC_UI &amp;&amp; UC_UI.showSecondLayer();";
  const blocker = '<div style="position:fixed;inset:0;z-index:999"></div>';
  const fixtures = [
    {witness:"onetrust_footer_slash_sale_settings", visibility:"covered", markup:
      `<div class="footer"><div>${legalLinks} <button id="ot-sdk-btn">${saleButton}</button></div></div>
      <div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk"></div></div>${blocker}
      <script>document.querySelector('button').onclick = () => {window.activated = true}</script>`},
    {witness:"footer_slash_sale_form_link", visibility:"rendered_exposed", markup:
      `<footer><ul><li><a id="owner" href="${form}">${short}</a></li>
      <li><a href="${form}" hidden>${short}</a></li><li><a href="${form}?bad=1">${short}</a></li></ul></footer>`},
    {witness:"usercentrics_footer_sale_settings", visibility:"covered", markup:
      `<div class="site-footer">${legalLinks}<a id="owner" href="${opener}">${label}</a>
      <a href="${opener}">Manage Cookies</a><a href="${opener} other();">${label}</a></div>
      <aside id="usercentrics-cmp-ui"></aside>${blocker}
      <script>window.UC_UI={showSecondLayer(){window.activated=true}}</script>`},
  ];
  for (const {witness, visibility, markup} of fixtures) {
    const page = await fixture('<main style="height:1900px"></main>' + markup);
    try {
      await page.evaluate(() => {
        const original = document.querySelectorAll.bind(document);
        document.querySelectorAll = (selector: string) => {
          if (selector.startsWith('footer,[role="contentinfo"],#footer')) {
            const until = performance.now() + 200;
            while (performance.now() < until) { /* simulate expensive optional discovery */ }
          }
          return original(selector);
        };
      });
      const packet = await observe(page);
      const rows = packet?.candidates.filter(row => row.visibility === "covered" || row.visibility === "rendered_exposed");
      assert.deepEqual(rows?.map(row => [row.controlWitness,row.visibility]), [[witness,visibility]]);
      assert.ok(packet?.limitations.includes("traversal_limited"));
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await page.evaluate(() => Reflect.get(window,"activated")), undefined);
      if (witness === "footer_slash_sale_form_link") assert.equal(packet?.candidates[1]?.visibility,"hidden");
    } finally {await page.close();}
  }
});

test("footer sale witnesses require the named owner, original scope and exact destination", async () => {
  const page = await fixture(`<main style="height:1900px">
    <div class="footer"><button id="ot-sdk-btn">Do Not Sell/Share My Personal Information</button></div></main>
    <div id="onetrust-consent-sdk"><div id="onetrust-pc-sdk"></div></div>
    <footer><ul><li><a href="https://foreign.test/about/legal/privacy/form/">Do not sell/share my information</a></li></ul>
    <a href="javascript:window.UC_UI &amp;&amp; UC_UI.showSecondLayer();">${label}</a></footer>
    <script>document.querySelector('button').onclick=() => {window.activated=true}</script>`);
  try {
    const packet = await observe(page);
    assert.ok(packet);
    assert.ok(packet.candidates.every(row => !row.controlWitness && row.visibility !== "rendered_exposed" && row.visibility !== "covered"));
  } finally {await page.close();}
});

test("a Didomi footer link needs its reviewed owner, legal landmark and same-page provider marker", async () => {
  const page = await fixture(`<main style="height:1800px"></main><div id="mnFooter"><div>
    Copyright © 2026 Example. <ul><li><a href="/terms">Terms of Service</a></li>
    <li><a href="/privacy">Privacy Policy</a></li><li class="didomi-preferences-link">
    <a id="privacy-link-privacy-settings" style="cursor:pointer" href="javascript:void(0)">Your Privacy Choices</a></li></ul>
    </div></div><div id="didomi-host" hidden></div><script>
    document.getElementById('privacy-link-privacy-settings').addEventListener('click',()=>window.activated=true);
    </script>`);
  try {
    const packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.controlWitness,row.scope,row.visibility]),
      [["didomi_footer_settings","legal_footer_navigation","rendered_exposed"]]);
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")), undefined);
    await page.locator("#didomi-host").evaluate(node => node.remove());
    assert.ok((await observe(page))?.candidates.every(row => row.visibility !== "rendered_exposed" && row.visibility !== "covered"));
  } finally {await page.close();}
});

test("the abbreviated footer link needs the same-origin privacy-preferences route and legal footer navigation", async () => {
  const label = "Do not sell or share my info";
  const destination = "/data-privacy-preferences";
  const page = await fixture(`<main><div style="height:1800px"></div><footer><nav><ul>
    <li><a href="/privacy">Privacy Policy</a></li><li><a href="/terms">Terms of Use</a></li>
    <li><a id="qualified" href="${destination}">${label}</a></li>
    <li><a href="https://foreign.test${destination}">${label}</a></li>
    <li><a href="${destination}?unexpected=1">${label}</a></li>
    <li><a href="${destination}">Privacy settings</a></li></ul></nav></footer></main>`);
  try {
    assert.deepEqual((await observe(page))?.candidates.map(row => [row.controlWitness,row.visibility]),
      [["footer_data_privacy_preferences_link","rendered_exposed"]]);
    await page.locator("#qualified").evaluate(node => node.closest("nav")!.replaceWith(node));
    assert.ok((await observe(page))?.candidates.every(row => row.visibility !== "rendered_exposed" && row.visibility !== "covered"));
  } finally {await page.close();}
});

test("a href-less footer settings anchor keeps callable owner and covered states separate", async () => {
  const page = await fixture(`<main style="height:1800px"></main><footer class="page-footer"><nav><ul>
    <li><a href="/privacy">Privacy Policy</a></li><li><a href="/cookies">Cookie Policy</a></li>
    <li><a id="privacy-settings" style="cursor:pointer">Do Not Sell or Share My Information</a></li></ul></nav></footer>
    <div id="cover" style="position:fixed;inset:0;z-index:99"></div>
    <script>document.getElementById('privacy-settings').onclick=()=>window.activated=true;</script>`);
  try {
    const packet = await observe(page);
    assert.deepEqual(packet?.candidates.map(row => [row.controlWitness,row.visibility,row.matchingPoints,row.occludingPoints]),
      [["footer_sale_sharing_settings_anchor","covered",0,5]]);
    await page.locator("#cover").evaluate(node => node.remove());
    const exposed = (await observe(page))?.candidates[0];
    assert.equal(exposed?.visibility,"rendered_exposed");
    assert.ok(exposed?.checkpoints?.some(row => row.phase === "settled" && row.matchingPoints > 0));
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")), undefined);
    await page.locator("#privacy-settings").evaluate(node => { (node as HTMLAnchorElement).onclick = null; });
    assert.ok((await observe(page))?.candidates.every(row => row.visibility !== "rendered_exposed" && row.visibility !== "covered"));
  } finally {await page.close();}
});

test("a hidden responsive copy does not take the positioning opportunity from the same named footer link", async () => {
  const path = "https://privacy.footer-fixture.test/choices";
  const page = await fixture(`<footer style="position:absolute;left:-900px;top:1100px;visibility:hidden">
    <a href="${path}">Your Privacy Choices</a></footer><main style="height:4200px"></main>
    <footer><a href="${path}">Your Privacy Choices</a></footer>`);
  try {
    const rows = (await observe(page))?.candidates;
    assert.deepEqual(rows?.map(row => [row.label,row.visibility]),
      [["Your Privacy Choices","hidden"],["Your Privacy Choices","rendered_exposed"]]);
    assert.ok(rows?.[1]?.matchingPoints);
    assert.equal(await page.evaluate(() => scrollY),0);
  } finally {await page.close();}
});

test("a publisher's AEM legal list binds sharing preferences to the footer surface", async () => {
  const link = "https://lp.footer-fixture.test/sharing-preferences.html";
  const page = await fixture(`<main style="height:280px"></main><div class="cmp-footerV2">
    <div class="cmp-text"><ul class="cmp-footerV2__links__column__list">
    <li><a href="/privacy">Privacy Notice</a></li><li><a href="/terms">Website Terms and Conditions</a></li>
    <li><a href="${link}" id="legal">${label}</a></li></ul></div></div>
    <div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk" role="dialog" aria-label="Cookie choices" style="position:fixed;top:0">
    <p>Choose how cookies may be used for privacy and advertising.</p><button id="onetrust-pc-btn-handler">${label}</button>
    <button id="onetrust-accept-btn-handler">Accept All</button></div></div>`, "https://www.footer-fixture.test/");
  try {
    const rows = (await observe(page))?.candidates;
    assert.deepEqual(rows?.map(row => [row.scope,row.controlWitness,row.visibility]),
      [["legal_footer_navigation","aem_footer_sharing_preferences_link","rendered_exposed"]]);
    const geometry = await captureConsentControlGeometry(page);
    assert.equal(geometry.candidates.find(row => row.selectorHint === "#legal")?.layer,"footer");
    assert.equal(geometry.candidates.find(row => row.selectorHint === "#onetrust-pc-btn-handler")?.layer,"first_layer");
    await page.locator("#legal").evaluate(node => node.setAttribute("href","https://unrelated.test/sharing-preferences.html"));
    assert.ok((await observe(page))?.candidates.every(row => row.visibility !== "rendered_exposed" && row.visibility !== "covered"));
  } finally {await page.close();}
});

test("a fixed legal footer is reached at document end using its in-flow footer landmark", async () => {
  const page = await fixture(`<main style="position:relative;z-index:3;height:2200px;background:white">Product information</main>
    <div class="site-footer-component" style="height:160px"><div style="position:fixed;z-index:1;bottom:0;width:100%;height:125px">
    <div>Copyright © 2026 Example. <button id="ot-sdk-btn" class="ot-sdk-show-settings">Your Privacy Choices</button>
    <a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a></div></div></div>
    <div id="onetrust-consent-sdk" hidden><div id="onetrust-pc-sdk"></div></div>
    <script>document.getElementById('ot-sdk-btn').onclick=()=>window.activated=true;</script>`);
  try {
    const [row] = (await observe(page))?.candidates ?? [];
    assert.equal(row?.controlWitness, "onetrust_reveal_footer_settings");
    assert.equal(row?.visibility, "rendered_exposed");
    assert.equal(row?.matchingPoints, 5);
    assert.equal(row?.checkpoints?.[0]?.visibility, "covered");
    assert.ok(row?.checkpoints?.some(p => p.phase === "settled" && p.matchingPoints === 5 && p.scrollY > 1000));
    assert.equal(await page.evaluate(() => scrollY), 0);
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")), undefined);
    await page.locator(".site-footer-component").evaluate(node => document.body.prepend(node));
    assert.ok((await observe(page))?.candidates.every(c => c.controlWitness !== "onetrust_reveal_footer_settings"));
  } finally {await page.close();}
});

test("a OneTrust settings button is verified in an in-flow custom legal footer column", async () => {
  const page = await fixture(`<main style="height:2200px">Product information</main>
    <div class="footer-section"><div class="container"><div class="footer-grid" style="height:395px">
      <div class="footer-column" style="height:280px"><div id="legal-heading">LEGAL</div>
        <p><a href="/terms">Terms &amp; Conditions</a></p><p><a href="/privacy">Privacy</a></p>
        <div><button id="ot-sdk-btn" class="ot-sdk-show-settings" style="cursor:pointer">Your Privacy Choices</button></div>
      </div></div><div style="height:80px">© 2026 Example</div></div></div>
    <div id="onetrust-consent-sdk" hidden><div id="onetrust-pc-sdk"></div></div>
    <script>document.getElementById('ot-sdk-btn').addEventListener('click',()=>window.activated=true);</script>`);
  try {
    const [control] = (await observe(page))?.candidates ?? [];
    assert.equal(control?.controlWitness,"onetrust_custom_legal_footer_settings");
    assert.equal(control.scope,"custom_legal_footer");
    assert.equal(control.visibility,"rendered_exposed");
    assert.equal(control.matchingPoints,5);
    assert.equal(await page.evaluate(() => scrollY),0);
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")),undefined);
    await page.locator(".footer-section").evaluate(node => {
      const footer = node as HTMLElement;
      footer.style.opacity = "0";
      let scheduled = false;
      addEventListener("scroll", () => {
        if (scrollY <= 0 || scheduled) return;
        scheduled = true;
        setTimeout(() => {footer.style.opacity = "1";},550);
      });
    });
    const delayed = await captureConsentFooterOptOut({page,snapshot:{...snapshot,url:page.url()},
      readBinding:()=>({url:page.url(),documentIdentity:identity}),scanStartedAtMs:Date.now()-500,
      budgetMs:1050,allowExtendedFooterReveal:true,allowOneTrustCustomFooterReveal:true});
    const [revealed] = delayed?.candidates ?? [];
    assert.equal(revealed?.visibility,"rendered_exposed");
    assert.equal(revealed?.checkpoints?.[0]?.visibility,"hidden");
    assert.ok(revealed?.checkpoints?.some(row=>row.phase === "reveal" && row.elapsedMs >= 625 && row.matchingPoints === 5));
    assert.equal(await page.evaluate(() => scrollY),0);
    await page.locator("#legal-heading").evaluate(node => {node.textContent="Resources";});
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness !== "onetrust_custom_legal_footer_settings"));
    await page.locator("#legal-heading").evaluate(node => {node.textContent="Legal";});
    await page.locator("#onetrust-consent-sdk").evaluate(node => node.remove());
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness !== "onetrust_custom_legal_footer_settings"));
  } finally {await page.close();}
});

test("a bound footer settings link is rechecked after late paint and document growth", async () => {
  const page = await fixture(`<style>html{overflow-anchor:none}</style><main style="height:2300px">Product information</main>
    <div id="footer" style="padding-bottom:50px">
    <div id="legal" style="opacity:0"><a href="/privacy">Privacy Policy</a> <a href="/terms">Terms of Service</a>
    <a id="ensFooterPrivacySettings" role="button" href="#" style="display:inline-block;cursor:pointer">Your Privacy Choices</a></div></div>
    <section id="ensNotifyBanner" role="dialog" style="position:fixed;bottom:0;left:0;right:0;height:100px;z-index:4">Generic cookie notice</section>
    <script>window.addEventListener('scroll',() => {if (scrollY > 100) {
      setTimeout(() => {document.querySelector('main').style.height='2355px';},275);
      setTimeout(() => {document.querySelector('main').style.height='2390px';},440);
      setTimeout(() => {
        document.querySelector('main').style.height='2370px';
        document.querySelector('#legal').style.opacity='1';
      },1040);
      setTimeout(() => {document.querySelector('#ensNotifyBanner').style.bottom='26px';},1130);
    }},{once:true});
    document.querySelector('#ensFooterPrivacySettings').addEventListener('click',()=>window.activated=true);</script>`);
  try {
    const read = () => captureConsentFooterOptOut({page,snapshot:{...snapshot,url:page.url()},
      readBinding:()=>({url:page.url(),documentIdentity:identity}),scanStartedAtMs:Date.now()-500,budgetMs:2050,
      allowExtendedFooterReveal:true,allowEnsightenFooterReveal:true});
    const packet = await read();
    const [row] = packet?.candidates ?? [];
    assert.equal(row?.controlWitness,"ensighten_footer_settings_anchor");
    assert.equal(row?.visibility,"rendered_exposed");
    assert.equal(row?.checkpoints?.[0]?.visibility,"hidden");
    const revealed = row.checkpoints?.find(point => point.phase === "reveal");
    assert.ok(revealed && revealed.elapsedMs >= 1230 && revealed.matchingPoints > 0);
    assert.ok(Math.abs(revealed.bounds[1] + revealed.bounds[3] - packet!.viewport[1]) <= 1);
    assert.equal(consentFooterOptOutObservationSchema.safeParse({...packet,candidates:[
      {...row,controlWitness:undefined,semanticRole:"button"},
    ]}).success,false,"only the bound Ensighten witness can retain a delayed checkpoint");
    assert.equal(await page.evaluate(()=>scrollY),0);
    assert.equal(await page.evaluate(()=>Reflect.get(window,"activated")),undefined);
    await page.locator("#legal").evaluate(node => {node.setAttribute("hidden","");});
    assert.ok((await read())?.candidates.every(control => control.matchingPoints === 0 && control.visibility !== "rendered_exposed"));
    await page.locator("#legal").evaluate(node => node.removeAttribute("hidden"));
    await page.locator("#ensNotifyBanner").evaluate(node => node.remove());
    assert.ok((await read())?.candidates.every(control => control.controlWitness !== "ensighten_footer_settings_anchor"));
  } finally {await page.close();}
});

test("a named footer dialog launcher remains covered by an active native modal", async () => {
  const page = await fixture(`<main style="height:1800px">News</main>
    <footer><ul><li><a href="/privacy">Privacy Notice</a></li>
    <li><a id="launcher" href="#" aria-label="Do not sell or share my data, opens a dialog">Do not sell or share my data</a></li></ul></footer>
    <dialog id="notice"><p>Use the footer's “Do not sell or share my data” link.</p><button>Accept</button></dialog>
    <script>document.getElementById('launcher').onclick = () => {window.activated=true;};
    document.getElementById('notice').showModal();</script>`);
  try {
    const [covered] = (await observe(page))?.candidates ?? [];
    assert.equal(covered?.controlWitness,"footer_sale_sharing_dialog_anchor");
    assert.equal(covered?.visibility,"covered");
    assert.equal(covered?.matchingPoints,0);
    assert.ok(covered.occludingPoints > 0);
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")),undefined);
    assert.equal(await page.evaluate(() => document.querySelector("dialog:modal")?.id),"notice");
    await page.locator("#launcher").evaluate(anchor => {(anchor as HTMLAnchorElement).onclick=null;});
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness !== "footer_sale_sharing_dialog_anchor"));
  } finally {await page.close();}
});

test("a target-bearing footer launcher needs the callable owner and exact affirmative modal instruction", async () => {
  const page = await fixture(`<main style="height:1800px">News</main><footer><ul>
    <li><a hidden href="#other">Do not sell my Personal Information</a></li>
    <li><a id="launcher" target="_blank" href="#" aria-label="Do not sell or share my data, opens a dialog">Do not sell or share my data</a></li></ul></footer>
    <dialog id="notice"><p>Personalized advertising. You can opt out of the sale or sharing of your data, at any time clicking the “Do not sell or share my data” button at the bottom of the webpage.</p><button>Accept</button></dialog>
    <script>document.getElementById('launcher').onclick = () => {window.activated=true;};
    document.getElementById('notice').showModal();</script>`);
  try {
    const [owner] = (await observe(page))?.candidates ?? [];
    assert.equal(owner?.controlWitness,"footer_sale_sharing_dialog_notice");
    assert.equal(owner.visibility,"covered");
    assert.equal(owner.occludingPoints,5);
    assert.equal(await page.evaluate(() => scrollY),0);
    assert.equal(await page.evaluate(() => Reflect.get(window,"activated")),undefined);
    assert.equal(await page.evaluate(() => document.querySelector("dialog:modal")?.id),"notice");
    const notice = page.locator("#notice p");
    const originalNotice = await notice.textContent();
    await notice.evaluate(p => p.textContent='You cannot opt out by clicking the “Do not sell or share my data” button at the bottom of the webpage.');
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness !== "footer_sale_sharing_dialog_notice"));
    await notice.evaluate((p,text) => {p.textContent=text;},originalNotice);
    await page.locator("#launcher").evaluate(anchor => {(anchor as HTMLAnchorElement).onclick=null;});
    assert.ok((await observe(page))?.candidates.every(row => row.controlWitness !== "footer_sale_sharing_dialog_notice"));
  } finally {await page.close();}
});
