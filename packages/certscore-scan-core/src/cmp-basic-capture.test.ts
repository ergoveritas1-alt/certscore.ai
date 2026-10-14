import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { captureCmpBasicEvidence } from "./cmp-basic-capture.js";

test("passive first-layer inventory is bounded, document-bound and never opens or changes consent", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="onetrust-banner-sdk"><a href="https://example.test/privacy">Privacy policy</a><label><input type="checkbox">Analytics</label><button onclick="window.actions++">Manage options</button><section hidden><label><input type="checkbox">Marketing</label></section></div><script>
      window.actions=0;window.reads=0;window.OneTrust={GetDomainData:()=>{window.reads++;return {Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',Description:'Audience measurement',Lifespan:'2 years'}]}]}}};
    </script>`);
    let token = "loader-1";
    const input = {page,scanId:"fixture",targetUrl:"https://example.test/",scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token}),isCurrent:()=>true};
    const started = Date.now();
    const packet = await captureCmpBasicEvidence(input);
    assert.ok(packet); assert.deepEqual(packet.controls.map(row=>row.label),["Analytics"]);
    assert.deepEqual(packet.declarations.map(row=>row.name),["_ga"]);
    assert.equal(packet.privacyLinks[0]?.hitTargetBeforeAction,true);
    assert.ok(packet.limitations.includes("declaration_inventory_not_complete"));
    assert.equal(await page.evaluate(()=>(window as any).actions),0);
    assert.ok(Date.now()-started < 350,"basic read remains inside opportunistic slice");
    assert.equal(await captureCmpBasicEvidence({...input,isCurrent:()=>false}),undefined);
    let reads=0;
    assert.equal(await captureCmpBasicEvidence({...input,readBinding:()=>({url:page.url(),token:++reads===1?"loader-1":"loader-2"})}),undefined);
    await page.locator("body").evaluate(body=>{ const other=document.createElement("div");other.id="CybotCookiebotDialog";body.append(other); });
    assert.equal(await captureCmpBasicEvidence(input),undefined,"ambiguous vendor scopes do not bind basic facts");
  } finally { await browser.close(); }
});

test("required consent lane retains passive basics when the CMP appears after its first empty inventory", {timeout:20000}, async () => {
  const {createServer}=await import("node:http");
  const {mkdtemp,rm}=await import("node:fs/promises");
  const {tmpdir}=await import("node:os");
  const {createArtifactWriter}=await import("./artifact-writer.js");
  const {preConsentRuntimeScanner}=await import("./scanners/pre-consent-runtime-scanner.js");
  const server=createServer((req,res)=>{res.setHeader("content-type","text/html");res.end(`<main>Fixture content for a consent proof document.</main><script>setTimeout(()=>{
    window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',Description:'Analytics',Lifespan:'2 years'}]}]})};
    document.body.insertAdjacentHTML('beforeend','<section id="onetrust-banner-sdk">We use cookies <a href="/privacy">Privacy policy</a><label><input type="checkbox">Analytics</label><button id="onetrust-accept-btn-handler">Accept all</button><button id="onetrust-reject-all-handler">Reject all</button><button id="onetrust-pc-btn-handler">Manage options</button></section>');
  },400);</script>`);});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const address=server.address();assert.ok(address&&typeof address!=="string");
  const url=`http://127.0.0.1:${address.port}/`,root=await mkdtemp(`${tmpdir()}/cmp-basic-lane-`);
  try {
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,
      cmpBasicScanId:"late-fixture",artifactWriter:await createArtifactWriter(root),captureScope:"consent_proof",screenshotMode:"always"});
    assert.ok(result.cmpBasicEvidence,JSON.stringify(result.moduleRun.timingBreakdown?.filter(row=>row.label==='passive CMP basics')));
    assert.equal(result.cmpBasicEvidence.scanId,"late-fixture");
    assert.ok(result.domSnapshots.some(row=>row.documentIdentity?.token===result.cmpBasicEvidence?.documentToken));
    assert.deepEqual(result.cmpBasicEvidence.declarations.map(row=>row.name),["_ga"]);
    assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==='passive CMP basics').length,1);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});
