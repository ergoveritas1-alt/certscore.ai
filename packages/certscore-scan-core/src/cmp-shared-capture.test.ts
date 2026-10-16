import assert from "node:assert/strict";
import test from "node:test";
import {chromium} from "playwright";
import {cmpInventoryManifestSchema,completeConfiguredCmpNames,cmpBasicEvidenceSchema} from "@certscore/contracts";
import {captureCmpNameManifest} from "./cmp-inventory-manifest-capture.js";
import {captureCmpBasicEvidence} from "./cmp-basic-capture.js";
import {readCookieYesPreferenceInventory} from "./cookieyes-preference-inventory.js";
import {readOneTrustPreferenceInventory} from "./onetrust-preference-inventory.js";

test("compact name accounting is independent of descriptions and never reads cookie values or getters",()=>{
  let getters=0;
  const rows=Array.from({length:180},(_,i)=>({cookieID:`cookie_${i}`,get value(){getters++;throw Error("private")}}));
  const manifest=cmpInventoryManifestSchema.parse(captureCmpNameManifest([rows],"cookieID","cookieyes_category_configuration.v1"));
  assert.equal(manifest.names.length,180);assert.equal(completeConfiguredCmpNames(manifest),true);assert.equal(getters,0);
  Object.defineProperty(rows[0],"cookieID",{get(){getters++;return "invented"}});
  const unresolved=captureCmpNameManifest([rows,undefined],"cookieID","cookieyes_category_configuration.v1");
  cmpInventoryManifestSchema.parse(unresolved);assert.equal(unresolved.unresolvedRecordCount,1);assert.equal(unresolved.unresolvedSources,1);
  assert.equal(completeConfiguredCmpNames(unresolved),false);assert.equal(getters,0);
  const large=cmpInventoryManifestSchema.parse(captureCmpNameManifest([Array.from({length:1000},(_,i)=>({cookieID:`cookie_${i}`}))],"cookieID","cookieyes_category_configuration.v1"));
  assert.equal(large.names.length,256);assert.equal(large.unresolvedRecordCount,744);assert.equal(large.truncated,true);
  assert.equal(completeConfiguredCmpNames({...manifest,source:"cookiebot_loaded_declarations.v1"}),false);
  assert.equal(completeConfiguredCmpNames({...manifest,source:"onetrust_group_cookie_lists.v1"}),false);
  assert.equal(cmpInventoryManifestSchema.safeParse({...manifest,sourceRecordCount:1}).success,false);
});

test("passive control checkpoint survives expiry before secondary work; drift invalidates publication",async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.setContent('<div id="onetrust-banner-sdk"><label><input type="checkbox">Analytics</label><button>Manage options</button></div>');
    let allowed=true;const checkpoints:any[]=[];
    const input={page,scanId:"checkpoint",targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:"loader"}),
      isCurrent:()=>allowed,onCheckpoint:(packet:any)=>{checkpoints.push(packet);allowed=false;}};
    const retained=await captureCmpBasicEvidence(input);
    assert.equal(checkpoints.length,1);assert.deepEqual(retained?.controls.map(c=>c.label),["Analytics"]);
    assert.ok(retained?.captureProgress?.controlsAtMs!==undefined);assert.equal(retained?.captureProgress?.privacyLinksAtMs,undefined);
    assert.deepEqual(retained?.declarations,[]);cmpBasicEvidenceSchema.parse(retained);
    allowed=true;let reads=0;
    assert.equal(await captureCmpBasicEvidence({...input,readBinding:()=>({url:page.url(),token:++reads===1?"old":"new"})}),undefined);
    assert.equal(checkpoints.length,1,"No new checkpoint from a changed document");
  }finally{await browser.close()}
});

test("CookieYes and OneTrust capture compact breadth before their description allowance is exhausted",async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.setContent('<main>Fixture</main>');
    await page.evaluate(()=>{
      (window as any).cookieyes={_ckyStore:{_categories:[{slug:"analytics",cookies:Array.from({length:180},(_,i)=>({cookieID:`cookie_${i}`}))}]}};
      (window as any).OneTrust={GetDomainData(){return {Groups:[{CustomGroupId:"C2",VendorServices:Array.from({length:90},(_,i)=>({CustomVendorServiceId:`service_${i}`,ServiceName:`Service ${i}`})),FirstPartyCookies:Array.from({length:180},(_,i)=>({Name:`cookie_${i}`}))}]};}};
    });
    const cookieyes=await readCookieYesPreferenceInventory(page),oneTrust=await readOneTrustPreferenceInventory(page);
    assert.equal(cookieyes?.declarations.length,100);assert.equal(cookieyes?.inventoryManifest?.names.length,180);
    assert.equal(oneTrust?.declarations.length,20);assert.equal(oneTrust?.inventoryManifest?.names.length,180);
    assert.equal(completeConfiguredCmpNames(cookieyes?.inventoryManifest),true);
    assert.equal(completeConfiguredCmpNames(oneTrust?.inventoryManifest),false);
  }finally{await browser.close()}
});

test("the consent lane retains a positive basic checkpoint while the original document is still parsing",{timeout:15000},async()=>{
  const {createServer}=await import("node:http"),{mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os");
  const {createArtifactWriter}=await import("./artifact-writer.js"),{preConsentRuntimeScanner}=await import("./scanners/pre-consent-runtime-scanner.js");
  const server=createServer((_req,res)=>{
    res.setHeader("content-type","text/html");res.write('<html><body><section id="onetrust-banner-sdk"><p>We use cookies.</p><label><input type="checkbox">Analytics</label><button id="onetrust-accept-btn-handler">Accept all</button><button id="onetrust-reject-all-handler">Reject all</button><button id="onetrust-pc-btn-handler">Manage options</button></section><script>window.OneTrust={GetDomainData(){return {Groups:[{CustomGroupId:"C2",FirstPartyCookies:[{Name:"_ga",Description:"Audience measurement",Lifespan:"2 years"}]}]}}};</script>');
    setTimeout(()=>res.end('</body></html>'),1500);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  const root=await mkdtemp(`${tmpdir()}/cmp-early-checkpoint-`),url=`http://127.0.0.1:${address.port}/`;
  try {
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,cmpBasicScanId:"early-stream",artifactWriter:await createArtifactWriter(root),captureScope:"consent_proof",screenshotMode:"always"});
    assert.ok(result.cmpBasicEvidence?.captureProgress?.controlsAtMs!==undefined);
    assert.ok(result.cmpBasicEvidence.captureProgress.controlsAtMs<1500,JSON.stringify(result.cmpBasicEvidence.captureProgress));
    assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==="passive CMP basics").length,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true})}
});
