import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { captureCmpBasicEvidence, isCmpBasicCaptureReady, summarizeCmpTransport, finishPassiveCmpPrivacyLinks } from "./cmp-basic-capture.js";

test("loader and wrapper recognition reserve the single passive read until the existing late visual/inventory work", () => {
  const observation = {
    observationId: "cmp-loader", observedAtMs: 10, sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent", consentStateAtTime: "pre_consent" as const,
    entity: "OneTrust", vendor: "OneTrust", confidence: 0.95, directVsInferred: "direct" as const,
    evidenceRefs: [], signals: [
      { signalType: "script_url" as const, matchedField: "hostname", matchedValueRedacted: "cdn.cookielaw.org", confidence: 0.95, resolverBasis: [] },
      { signalType: "global" as const, matchedField: "global_name", matchedValueRedacted: "OptanonWrapper", confidence: 0.95, resolverBasis: [] },
    ],
  };
  const input = { controlsObserved: false, lateInspectionComplete: false, runtimeObservations: [observation] };
  assert.equal(isCmpBasicCaptureReady(input), false, "A loader plus a wrapper is not the loaded configuration API");
  assert.equal(isCmpBasicCaptureReady({ ...input, lateInspectionComplete: true }), true, "Use the original read once the existing late inspection completes");
  assert.equal(isCmpBasicCaptureReady({ ...input, controlsObserved: true }), true);
  const domOnly = { ...observation, signals: [{ ...observation.signals[0]!, signalType: "dom_selector" as const }] };
  assert.equal(isCmpBasicCaptureReady({ ...input, runtimeObservations: [domOnly] }), false, "Installed markup is not a ready SDK");
  assert.equal(isCmpBasicCaptureReady({ ...input, runtimeObservations: [domOnly], lateInspectionComplete: true }), true);
  const api = { ...observation, signals: [{ ...observation.signals[1]!, matchedValueRedacted: "OneTrust" }] };
  assert.equal(isCmpBasicCaptureReady({ ...input, runtimeObservations: [api] }), true, "Registered API root can schedule; capture still validates the actual API");
  assert.equal(isCmpBasicCaptureReady({ ...input, lateInspectionComplete: true, runtimeObservations: [{ ...api, directVsInferred: "inferred" }] }), false);
  assert.equal(isCmpBasicCaptureReady({ ...input, lateInspectionComplete: true, runtimeObservations: [{ ...api, confidence: 0.4 }] }), false);
  assert.equal(isCmpBasicCaptureReady({ ...input, lateInspectionComplete: true, runtimeObservations: [] }), false);
});

test("CMP transport diagnostics join exact request identities and keep missing responses unresolved", () => {
  const observation = { signals: [1, 2, 3, 4].map(id => ({ signalType: "script_url", sourceEventId: `net_${id}` })) };
  const input = {
    observations: [observation],
    requests: [1, 2, 3, 4].map(id => ({ eventId: `net_${id}`, requestId: `req_${id}` })),
    responses: [{ requestId: "req_1" }],
    failures: [{ requestId: "req_2", failureText: "net::ERR_ABORTED" }, { requestId: "req_4", failureText: "private URL or resolver message" }],
  } as Parameters<typeof summarizeCmpTransport>[0];
  assert.deepEqual(summarizeCmpTransport(input), { version: "cmp_transport.v1", requests: 4, responses: 1,
    failed: 2, unresolved: 1, failureCodes: ["ERR_ABORTED", "other"] });
  assert.deepEqual(summarizeCmpTransport({ ...input, failures: [] }).failureCodes, []);
});

test("deferred Cookiebot policy access checks the page after visual capture, restores scroll, and rejects foreign or changed documents",async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:800,height:600}});
    await page.route('https://example.test/',r=>r.fulfill({contentType:'text/html',body:'<main>Fixture</main>'}));await page.goto('https://example.test/');
    const content=`<div id="CybotCookiebotDialog"><button>Customize</button><section hidden><a href="https://example.test/privacy-policy">Privacy policy</a></section></div><div style="height:2000px"></div><footer><a href="https://vendor.test/privacy-policy">Privacy policy</a><a href="https://example.test/privacy-policy">Privacy policy</a></footer><script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`;
    for(const covered of [false,true]){
      await page.setContent(content+(covered?'<div style="position:fixed;inset:0;z-index:999"></div>':''));
      const input={page,scanId:'public-policy',targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:'loader'}),isCurrent:()=>true};
      const packet=await captureCmpBasicEvidence({...input,deferPublicPrivacyLinks:true});assert.ok(packet);
      assert.equal(packet.captureProgress?.privacyLinksAtMs,undefined,'No scroll during the early visual work');
      const result=await finishPassiveCmpPrivacyLinks({...input,packet});assert.ok(result);
      assert.ok(result.privacyLinks.every(link=>new URL(link.url).origin==='https://example.test'));
      assert.equal(result.privacyLinks.some(link=>link.hitTargetBeforeAction),!covered);
      assert.ok(result.privacyLinks.some(link=>link.access?.scroll?.restored));
      assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.evaluate(()=>(window as any).clicks),0);
      assert.equal(await finishPassiveCmpPrivacyLinks({...input,packet,readBinding:()=>({url:page.url(),token:'new-loader'})}),undefined);
      assert.equal(await finishPassiveCmpPrivacyLinks({...input,packet,isCurrent:()=>false}),undefined);
    }
  }finally{await browser.close();}
});

test("passive Cookiebot reads hidden declarations without clicks or visible-control claims", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage(); let requests=0;
    await page.route('**/*',route=>{requests++;return route.abort();});
    const card=`<div class="CybotCookiebotDialogDetailBodyContentCookieGroup"><div class="CybotCookiebotDialogDetailBodyContentCookieProvider">Google</div>
      <div class="CybotCookiebotDialogDetailBodyContentCookieInfo"><span class="CybotCookiebotDialogDetailBodyContentCookieInfoTitle">_ga</span>
      <p class="CybotCookiebotDialogDetailBodyContentCookieInfoDescription">Audience measurement</p><div class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Maximum Storage Duration</b>: 2 years</div>
      <div class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Type</b>: HTTP Cookie</div></div></div>`;
    const content=`<div id="CybotCookiebotDialog"><button>Customize</button><div hidden id="CybotCookiebotDialogTabContentDetails" role="tabpanel">${card}<label><input type="checkbox">Hidden category</label></div></div><script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`;
    const input={page,scanId:"passive-cookiebot",targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:"loader"}),isCurrent:()=>true};
    await page.setContent(content);
    const packet=await captureCmpBasicEvidence(input);
    assert.equal(packet?.contractVersion,"certscore.cmp-basic-evidence.v2");
    assert.deepEqual(packet?.declarations,[{name:"_ga",purpose:"Audience measurement",duration:"2 years",source:"cmp_loaded_inventory"}]);
    assert.equal(packet?.loadedInventory?.records[0]?.provider,"Google");
    assert.deepEqual(packet?.inventoryManifest?.names,["_ga"]);
    assert.equal(packet?.loadedInventoryBinding?.documentToken,"loader");
    assert.deepEqual(packet?.controls,[],"Hidden controls do not become observed choices");
    assert.equal(await page.evaluate(()=>(window as any).clicks),0);assert.equal(requests,0);
    for (const mode of ["missing","outside","duplicate-root","duplicate-panel"]) {
      await page.setContent(content);
      await page.evaluate(mode=>{const root=document.querySelector('#CybotCookiebotDialog')!,panel=document.querySelector('#CybotCookiebotDialogTabContentDetails')!;
        if(mode==='missing')panel.remove();if(mode==='outside')document.body.append(panel);
        if(mode==='duplicate-root')document.body.append(root.cloneNode(true));if(mode==='duplicate-panel')root.append(panel.cloneNode(true));},mode);
      assert.equal((await captureCmpBasicEvidence(input))?.loadedInventory,undefined,mode);
    }
    await page.setContent(content);
    let checks=0;
    const stale=await captureCmpBasicEvidence({...input,readBinding:()=>({url:page.url(),token:++checks>=3?'new-loader':'loader'})});
    assert.equal(stale?.loadedInventory,undefined,"Drift after the controls checkpoint preserves only earlier facts");
  } finally {await browser.close();}
});

test("passive first-layer inventory is bounded, document-bound and never opens or changes consent", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="onetrust-banner-sdk"><p id="onetrust-policy-text">For this, we use unique identifiers like your IP address and share your data with 2 partners (Vimeo, Google).</p><a href="https://example.test/privacy">Privacy policy</a><label><input type="checkbox">Analytics</label><button onclick="window.actions++">Manage options</button><section hidden><label><input type="checkbox">Marketing</label></section></div><script>
      window.actions=0;window.reads=0;window.OneTrust={GetDomainData:()=>{window.reads++;return {Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',VendorServices:[{CustomVendorServiceId:'S1',ServiceName:'<strong>Named Analytics</strong>'}],FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:false,Length:'730',DurationType:365}]}]}}};
    </script>`);
    let token = "loader-1";
    const input = {page,scanId:"fixture",targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token}),isCurrent:()=>true};
    const started = Date.now();
    const packet = await captureCmpBasicEvidence(input);
    assert.ok(packet); assert.deepEqual(packet.controls.map(row=>row.label),["Analytics"]);
    assert.deepEqual(packet.declarations.map(row=>row.name),["_ga"]);
    assert.deepEqual(packet.declarations,[{name:"_ga",purpose:"Audience measurement",duration:"2 years",source:"cmp_api_inventory"}]);
    assert.ok(packet.limitations.includes("onetrust_loaded_configuration.v4"));
    assert.deepEqual(packet.serviceNames,["Named Analytics"]);
    assert.deepEqual(packet.serviceDisclosures?.[0]?.names,["Vimeo","Google"]);
    assert.equal(packet.privacyLinks[0]?.hitTargetBeforeAction,true);
    assert.deepEqual(packet.privacyLinks[0]?.access,{version:"privacy_link_access.v1",outcome:"reachable"});
    assert.ok(packet.limitations.includes("declaration_inventory_not_complete"));
    assert.equal(await page.evaluate(()=>(window as any).actions),0);
    assert.equal(await page.evaluate(()=>(window as any).reads),1,"One already-loaded configuration read; no additional getter call");
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

test("passive Drupal identity uses the existing scope read and rejects getters and loader drift", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="sliding-popup"><button>Accept cookies</button></div><script>window.drupalSettings={eu_cookie_compliance:{cookie_name:'cookie_compliance'}};</script>`);
    const input = { page, scanId: "fixture", targetUrl: page.url(), scanStartedAtMs: Date.now(), readBinding: () => ({ url: page.url(), token: "loader-1" }), isCurrent: () => true };
    const packet = await captureCmpBasicEvidence(input);
    assert.equal(packet?.configuredConsentCookies?.[0]?.name, "cookie_compliance");
    await page.evaluate(() => { Object.defineProperty((window as any).drupalSettings.eu_cookie_compliance, "cookie_name", { get() { throw Error("No getter allowed"); } }); });
    assert.deepEqual((await captureCmpBasicEvidence(input))?.configuredConsentCookies, []);
    let reads = 0;
    assert.equal(await captureCmpBasicEvidence({ ...input, readBinding: () => ({ url: page.url(), token: ++reads === 1 ? "loader-1" : "loader-2" }) }), undefined);
  } finally { await browser.close(); }
});


test("passive inventory shares registered category identities and preserves ambiguous labels", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const input = { page, scanId: "category-fixture", targetUrl: page.url(), scanStartedAtMs: Date.now(), readBinding: () => ({ url: page.url(), token: "loader-1" }), isCurrent: () => true };
    for (const ambiguous of [false, true]) {
      await page.setContent(`<div class="cky-consent-container"><section class="cky-preference-center" data-cky-tag="detail" role="dialog"><div class="cky-accordion">
        <h3 data-cky-tag="detail-category-title">Others</h3>${ambiguous ? '<h3 data-cky-tag="detail-category-title">Another category</h3>' : ''}
        <div data-cky-tag="detail-category-toggle"><input type="checkbox" role="switch" aria-label="Enable Others"></div>
      </div></section></div>`);
      const packet = await captureCmpBasicEvidence(input);
      assert.equal(packet?.provider, "CookieYes");
      assert.equal(packet?.controls[0]?.kind, ambiguous ? "unclassified" : "category");
      assert.equal(packet?.controls[0]?.checked, false);
      assert.deepEqual(packet?.declarations, []);
      assert.ok(packet?.limitations.includes("declaration_inventory_not_complete"));
    }
  } finally { await browser.close(); }
});

test("passive Axeptio inventory uses its exact registered widget without treating service labels as categories", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const panel = `<section data-testid="widget-container"><label>Google Analytics 4<input type="checkbox"></label><button id="axeptio_btn_close" aria-label="Close cookie settings">Close</button><a href="https://example.test/privacy">Privacy policy</a></section>`;
    const input = { page, scanId: "axeptio-fixture", targetUrl: page.url(), scanStartedAtMs: Date.now(), readBinding: () => ({ url: page.url(), token: "loader-1" }), isCurrent: () => true };
    await page.setContent(panel);
    const packet = await captureCmpBasicEvidence(input);
    assert.equal(packet?.provider, "Axeptio");
    assert.deepEqual(packet?.controls, [{ label: "Google Analytics 4", kind: "unclassified", enabled: true, checked: false }]);
    assert.equal(packet?.privacyLinks[0]?.hitTargetBeforeAction, true);
    await page.setContent(panel + panel);
    assert.equal(await captureCmpBasicEvidence(input), undefined, "duplicate widget binding stays unknown");
    await page.setContent(panel.replace('aria-label="Close cookie settings"', 'aria-label="Unrelated Close"'));
    assert.equal(await captureCmpBasicEvidence(input), undefined, "wrong Close label cannot bind the widget");
  } finally { await browser.close(); }
});


test("a known SDK without a mounted CMP keeps readiness but never supplies an actionable scope", async()=>{
  const {readCmpScopeInventory}=await import("./cmp-scope-inventory.js");
  const {KNOWN_CMP_REGISTRY}=await import("@website-signal-risk-scanner/shared");
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.route("https://static.axept.io/**",r=>r.fulfill({body:"",contentType:"application/javascript"}));
    await page.setContent('<script src="https://static.axept.io/sdk.js"></script><main>Public page</main>');
    const result=await readCmpScopeInventory(page,KNOWN_CMP_REGISTRY.filter(d=>d.domSelectors?.length||d.preferenceScopeSelector));
    assert.equal(result.runtimeIdentified,true);assert.deepEqual(result.indices,[]);
  }finally{await browser.close();}
});

test("scope inventory separates provably inactive SDK roots from visible consent UI without erasing ambiguity", async () => {
  const { readCmpScopeInventory } = await import("./cmp-scope-inventory.js");
  const { KNOWN_CMP_REGISTRY } = await import("@website-signal-risk-scanner/shared");
  const definitions = KNOWN_CMP_REGISTRY.filter(d => ["Didomi", "HubSpot Consent Banner"].includes(d.canonicalName));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const mode of ["hidden", "visible", "zero-size", "shadow-hidden", "aria-hidden", "inert", "visibility-override"]) {
      await page.setContent(`<div id="didomi-host"><div class="didomi-notice-banner"><button>Manage cookies</button></div></div><div id="parent" ${mode === "hidden" ? 'style="display:none"' : mode === "aria-hidden" ? 'aria-hidden="true"' : mode === "inert" ? 'inert' : mode === "visibility-override" ? 'style="visibility:hidden"' : ''}><div id="hs-eu-cookie-confirmation" ${mode === "visibility-override" ? 'style="visibility:visible"' : ''}>${mode === "zero-size" ? '' : '<button>Manage cookies</button>'}</div></div>`);
      if (mode === "shadow-hidden") await page.evaluate(() => {
        const host = document.createElement("div"); host.hidden = true; document.body.append(host);
        host.attachShadow({ mode: "open" }).append(document.querySelector("#parent")!);
      });
      const result = await readCmpScopeInventory(page, definitions);
      const inactive = ["hidden", "shadow-hidden", "aria-hidden", "inert"].includes(mode);
      assert.deepEqual(result.indices.map(i => definitions[i]!.canonicalName), inactive ? ["Didomi"] : definitions.map(d => d.canonicalName), mode);
      assert.equal(result.scopeStates.find(s => definitions[s.index]!.canonicalName === "HubSpot Consent Banner")!.state, inactive ? "inactive" : ["zero-size", "visibility-override"].includes(mode) ? "unverified" : "visible", mode);
    }
  } finally { await browser.close(); }
});

test("Termly public policy reachability is captured after visuals without Options, navigation or disclosure products",async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:800,height:600}});let requests=0;
  await page.route('**/*',route=>{requests++;return route.fulfill({contentType:'text/html',body:''});});await page.goto('https://example.test/');const initialRequests=requests;
  const content=`<section data-termly-part="consent-banner"><button>Accept all</button><button>Reject all</button><button onclick="window.clicks++">Options</button><a hidden href="/hidden-privacy">Privacy policy</a></section><a href="/products/privacy-policy-generator/">Privacy Policy Generator</a><a href="/resources/templates/privacy-policy-template/">Privacy Policy Template</a><div style="height:1800px"></div><footer><a href="/our-privacy-policy/">Our Privacy Policy</a><a href="https://foreign.test/privacy">Privacy Policy</a></footer><script>window.clicks=0;document.addEventListener('click',()=>window.clicks++);</script>`;
  for(const covered of [false,true]){
   await page.setContent(content+(covered?'<div style="position:fixed;inset:0;z-index:9999"></div>':''));
   const input={page,scanId:'termly-link-fixture',targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:'loader'}),isCurrent:()=>true};
   const packet=await captureCmpBasicEvidence({...input,deferPublicPrivacyLinks:true});assert.ok(packet);assert.equal(packet.provider,'Termly');assert.equal(packet.captureProgress?.privacyLinksAtMs,undefined);
   const result=await finishPassiveCmpPrivacyLinks({...input,packet});assert.ok(result);
   assert.equal(result.privacyLinks.some(l=>l.url==='https://example.test/our-privacy-policy/' && l.hitTargetBeforeAction),!covered);
   assert.ok(!result.privacyLinks.some(l=>/generator|template|foreign/.test(l.url)));
   assert.ok(result.privacyLinks.some(l=>l.access?.scroll?.restored));assert.equal(await page.evaluate(()=>scrollY),0);assert.equal(await page.evaluate(()=>(window as any).clicks),0);
   assert.equal(requests,initialRequests);assert.equal(await finishPassiveCmpPrivacyLinks({...input,packet,readBinding:()=>({url:page.url(),token:'foreign'})}),undefined);
  }
 }finally{await browser.close();}
});

test("Termly consent-proof schedules the registered public-policy read after visuals inside its existing allowance",{timeout:20000},async()=>{
 const {createServer}=await import('node:http');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const {createArtifactWriter}=await import('./artifact-writer.js');const {preConsentRuntimeScanner}=await import('./scanners/pre-consent-runtime-scanner.js');
 const requests:string[]=[];const server=createServer((req,res)=>{requests.push(req.url!);res.setHeader('content-type','text/html');res.end(`<main>Local consent-proof privacy-link fixture.</main><section data-termly-part="consent-banner"><button>Accept all</button><button>Reject all</button><button onclick="fetch('/unexpected-options')">Manage preferences</button></section><a href="/products/privacy-policy-generator/">Privacy Policy Generator</a><div style="height:1800px"></div><footer><a href="/our-privacy-policy/">Our Privacy Policy</a></footer>`);});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const url=`http://127.0.0.1:${address.port}/`,root=await mkdtemp(`${tmpdir()}/termly-policy-link-`);
 try{
  const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,cmpBasicScanId:'termly-policy-link',captureScope:'consent_proof',screenshotMode:'always',artifactWriter:await createArtifactWriter(root)});
  assert.equal(result.cmpBasicEvidence?.privacyLinks.some(l=>l.url===`${url}our-privacy-policy/` && l.hitTargetBeforeAction),true);
  assert.equal(result.cmpBasicEvidence?.privacyLinkInspection?.scope,'same_origin_page');
  const timing=result.moduleRun.timingBreakdown!.filter(t=>['passive CMP basics','passive CMP privacy links'].includes(t.label));assert.equal(timing.length,2);
  assert.ok(timing.reduce((n,t)=>n+t.durationMs,0)<=350,JSON.stringify(timing));
  assert.ok(!requests.includes('/our-privacy-policy/'));assert.ok(!requests.includes('/unexpected-options'));
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});}
});

test("passive CMP facts bind a redirected final document without broadening action authorization", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.route('https://final.example.test/',route=>route.fulfill({contentType:'text/html',body:`<div id="onetrust-banner-sdk"><label><input type="checkbox">Analytics</label></div><script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:true}]}]})};window.actions=0;document.addEventListener('click',()=>window.actions++);</script>`}));
    await page.goto('https://final.example.test/');
    const input={page,scanId:'redirect-fixture',targetUrl:'https://original.example.test/',scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:'loader-final'}),isCurrent:()=>true};
    const packet=await captureCmpBasicEvidence(input);
    assert.ok(packet);assert.equal(packet.targetUrl,input.targetUrl);assert.equal(packet.documentUrl,page.url());
    assert.equal(packet.documentBindingPolicy,'passive_final_document.v1');assert.equal(packet.declarations[0]?.name,'_ga');
    assert.equal(await page.evaluate(()=>(window as any).actions),0);
    let reads=0;
    assert.equal(await captureCmpBasicEvidence({...input,readBinding:()=>({url:page.url(),token:++reads===1?'loader-final':'changed-loader'})}),undefined);
  } finally {await browser.close();}
});

test("a recognized CMP with an inactive banner retains loaded facts without claiming visible controls", {timeout:20000}, async () => {
  const {createServer}=await import('node:http');
  const {mkdtemp,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {createArtifactWriter}=await import('./artifact-writer.js');
  const {preConsentRuntimeScanner}=await import('./scanners/pre-consent-runtime-scanner.js');
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<html><body><main>Public page content.</main><div id="onetrust-banner-sdk" hidden></div><script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:true}]}]})};</script></body></html>`);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/`,root=await mkdtemp(`${tmpdir()}/cmp-inactive-`);
  try {
    const result=await preConsentRuntimeScanner({url,normalizedUrl:url,scanStartedAtMs:Date.now(),internalBudgetMs:6000,
      cmpBasicScanId:'inactive-fixture',artifactWriter:await createArtifactWriter(root),captureScope:'consent_proof',screenshotMode:'always'});
    assert.ok(result.cmpBasicEvidence,JSON.stringify(result.moduleRun.timingBreakdown?.filter(row=>row.label==='passive CMP basics')));
    assert.deepEqual(result.cmpBasicEvidence.controls,[]);
    assert.deepEqual(result.cmpBasicEvidence.declarations.map(row=>row.name),['_ga']);
    assert.equal(result.moduleRun.timingBreakdown?.filter(row=>row.label==='passive CMP basics').length,1);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('registered loaded OneTrust data survives an absent banner without fabricating visible controls',async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();await page.setContent(`<main>Page without a banner.</main><script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:true}]}]})};</script>`);
  const input={page,scanId:'sdk-only',targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:'sdk-loader'}),isCurrent:()=>true};
  const packet=await captureCmpBasicEvidence(input);assert.ok(packet);assert.deepEqual(packet.controls,[]);assert.deepEqual(packet.privacyLinks,[]);assert.deepEqual(packet.declarations.map(row=>row.name),['_ga']);
  await page.evaluate(()=>Object.defineProperty(window,'OneTrust',{configurable:true,get(){throw Error('Getter must not be invoked')}}));
  assert.equal(await captureCmpBasicEvidence(input),undefined);
 }finally{await browser.close();}
});


test("configuration-only SDK discovery supports bounded class methods while refusing getters and global prototypes", async () => {
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const input={page,scanId:"sdk-prototype",targetUrl:page.url(),scanStartedAtMs:Date.now(),readBinding:()=>({url:page.url(),token:"loader"}),isCurrent:()=>true};
    await page.setContent(`<main>Public page without a consent dialog.</main><script>window.OneTrust=new class {GetDomainData(){return {Groups:[{CustomGroupId:'C0002',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',description:'Audience measurement',IsSession:true}]}]}}}();</script>`);
    assert.deepEqual((await captureCmpBasicEvidence(input))?.declarations.map(row=>row.name),["_ga"]);
    for(const mode of ["own-getter","prototype-getter","root-getter","global-prototype"]) {
      await page.setContent(`<main>Public page</main><script>window.reads=0;window.OneTrust={};</script>`);
      await page.evaluate(`((mode)=>{
        const w=window;const getter=()=>{w.reads++;return ()=>({Groups:[]});};
        if(mode==='own-getter')Object.defineProperty(w.OneTrust,'GetDomainData',{get:getter});
        if(mode==='prototype-getter')Object.setPrototypeOf(w.OneTrust,Object.defineProperty({},'GetDomainData',{get:getter}));
        if(mode==='root-getter')Object.defineProperty(w,'OneTrust',{get:getter,configurable:true});
        if(mode==='global-prototype')Object.defineProperty(Object.prototype,'GetDomainData',{value:()=>({Groups:[]}),configurable:true});
      })(${JSON.stringify(mode)})`);
      assert.equal(await captureCmpBasicEvidence(input),undefined,mode);
      assert.equal(await page.evaluate(()=>(window as any).reads),0,mode);
      await page.evaluate(()=>{delete (Object.prototype as any).GetDomainData;delete (window as any).OneTrust;});
    }
  } finally {await browser.close();}
});
