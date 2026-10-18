import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { runCmpPreferencesObserver } from "./cmp-preferences-observer.js";
import { cmpAuditAssessmentSchema, cmpPreferenceBudgetMs } from "@certscore/contracts";

test("isolated preference inspection opens Options once, retains categories and inventory, and never saves a choice", { timeout: 15_000 }, async () => {
  const html = await readFile(new URL("./test-fixtures/cmp-test3.html", import.meta.url).pathname, "utf8");
  const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/action/")) actions.push(req.url);
    res.setHeader("Content-Type", req.url?.endsWith(".js") ? "text/javascript" : "text/html");
    res.end(req.url?.endsWith(".js") ? `for (const id of ['onetrust-accept-btn-handler','onetrust-reject-all-handler','save-preferences']) document.getElementById(id).onclick=()=>fetch('/action/'+id);document.getElementById('onetrust-pc-btn-handler').onclick=()=>{fetch('/action/options');document.getElementById('test3-preferences').hidden=false;};` : html);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "preferences-fixture", exactTargetUrl: `http://127.0.0.1:${address.port}/test3.html` } });
    assert.equal(packet.status, "completed", JSON.stringify(packet));
    assert.equal(packet.action.count, 1); assert.equal(packet.action.opened, true);
    assert.equal(packet.support.provider, "OneTrust"); assert.equal(packet.support.state, "partial");
    assert.equal(packet.controls.filter(control => control.kind === "category" && control.enabled).length, 2);
    assert.equal(packet.controls.every(control => control.kind !== "service"), true);
    assert.equal(packet.controlInventoryComplete, true);
    assert.deepEqual(packet.declarations.map(row => row.name), ["OptanonConsent", "_ga", "example_insights_id"]);
    assert.equal(packet.declarationInventoryComplete, false);
    assert.ok(packet.privacyLinks.some(link => link.hitTargetBeforeAction));
    assert.ok(packet.privacyLinks.some(link => link.access?.outcome === "reachable"));
    assert.deepEqual(actions, ["/action/options"]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("CMP integration unavailability cannot stand in for unsupported product capability", () => {
  const ids = ["categories", "services", "privacy_access", "consent_record", "duration", "declared_not_found", "found_not_declared", "cookie_information"];
  const assessment = { version: "cmp_audit_assessment.v1", scanId: "a", sourceSha256: "a".repeat(64), support: { state: "unsupported", provider: "Unrecognized CMP", recipeVersion: null, reason: "adapter_not_available" },
    rows: ids.map(id => ({ id, status: "not_assessed", detail: "", evidenceRefs: [] })) };
  assert.equal(cmpAuditAssessmentSchema.safeParse(assessment).success, true);
  assessment.rows[0] = { id: "categories", status: "feature_not_supported", detail: "No adapter", evidenceRefs: ["packet"] };
  assert.equal(cmpAuditAssessmentSchema.safeParse(assessment).success, false);
});

test("ambiguous Options, unidentified CMPs, hidden sections and explicit service groups stay distinct", { timeout: 25_000 }, async () => {
  let mode = "ambiguous";
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    const scope = mode === "unknown" ? "custom-cookie-panel" : "onetrust-banner-sdk";
    const toggle = mode === "services" ? '<fieldset><legend>Individual services</legend><label><input type="checkbox">Google Analytics</label></fieldset>' : '<label><input type="checkbox">Analytics</label>';
    res.setHeader("Content-Type", "text/html");
    res.end(`<section id="${scope}"><button id="options" type="button" aria-controls="prefs">Manage options</button>${mode === "ambiguous" ? '<button type="button" aria-controls="prefs">Cookie settings</button>' : ''}<div id="prefs" hidden>${toggle}${mode === "hidden" ? '<button aria-expanded="false">Vendors</button>' : ''}</div></section>${["cross-vendor", "cross-vendor-one-options"].includes(mode) ? `<section id="CybotCookiebotDialog">${mode === "cross-vendor" ? '<button aria-controls="prefs">Cookie settings</button>' : '<span>Cookie banner</span>'}</section>` : ''}${mode === "scope-overflow" ? '<div class="brlbs-cmpnt-dialog-box-entrance"></div>'.repeat(1001) : ''}<script>options.onclick=()=>{fetch('/clicked');prefs.hidden=false;};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["ambiguous", "cross-vendor", "cross-vendor-one-options", "scope-overflow", "unknown", "hidden", "services"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      if (["ambiguous", "cross-vendor", "cross-vendor-one-options", "scope-overflow", "unknown"].includes(mode)) { assert.equal(clicks, 0); assert.equal(packet.action.count, 0); assert.equal(packet.controlInventoryComplete, false); }
      if (mode === "unknown") assert.equal(packet.support.state, "unknown");
      if (mode === "hidden") { assert.equal(clicks, 1); assert.equal(packet.controlInventoryComplete, false); }
      if (mode === "services") { assert.equal(clicks, 1); assert.equal(packet.controls[0]?.kind, "service"); }
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("Borlabs delayed entrance opens once without ARIA controls; choices and API declarations stay evidence-bound", { timeout: 30_000 }, async () => {
  let mode = "valid", clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const button = `<button id="CookieBoxPreferencesButton">${mode === "wrong-label" ? "Accept all" : "Individual preferences"}</button>`;
    res.end(`<div class="brlbs-cmpnt-dialog"><div class="brlbs-cmpnt-dialog-box-entrance" hidden>We use cookies <a href="/privacy">Privacy policy</a><label><input type="checkbox">Marketing</label>${button}${mode === "ambiguous" ? button : ""}<button onclick="fetch('/unexpected-save')">Save consent</button></div><section id="preferences" hidden><label><input type="checkbox">Marketing</label><fieldset><legend>Individual services</legend><label><input type="checkbox">Google Analytics</label></fieldset><details><summary>More services</summary></details></section></div><script>
      window.borlabsCookieConfig={settings:{dialogShowDialog:true,dialogShowDialogAfterUserInteraction:true},services:{analytics:{id:'analytics',serviceGroupId:'marketing'}}};
      window.BorlabsCookie={Consents:{hasConsent:()=>false},Services:{findByServiceId:()=>({name:'Google Analytics',serviceGroupId:'marketing',cookies:[{name:'_ga',purpose:'Audience measurement',lifetime:'2 years'}]})},ServiceGroups:{findByServiceGroupId:()=>({name:'Marketing'})}};
      const host=document.createElement('div');document.body.append(host);const root=host.attachShadow({mode:'open'});root.append(document.querySelector('.brlbs-cmpnt-dialog'));
      document.body.style.minHeight='5000px';addEventListener('scroll',()=>root.querySelector('.brlbs-cmpnt-dialog-box-entrance').hidden=false,{once:true});
      root.querySelectorAll('#CookieBoxPreferencesButton').forEach(b=>b.onclick=()=>{fetch('/clicked');${mode === "navigation" ? "location.reload();" : mode === "no-transition" ? "" : "root.querySelector('.brlbs-cmpnt-dialog-box-entrance').hidden=true;root.querySelector('#preferences').hidden=false;"}});
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  try {
    for (mode of ["valid", "ambiguous", "wrong-label", "no-transition", "navigation"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      if (mode === "valid") {
        assert.equal(packet.status, "completed", JSON.stringify(packet));
        assert.equal(packet.support.recipeVersion, "borlabs_preferences.v1");
        assert.equal(packet.inspectionDiagnostic?.passiveDialogReveal, true);
        assert.equal(packet.action.opened, true); assert.equal(clicks, 1);
        assert.deepEqual(packet.controls.map(c => c.kind), ["category", "service"]);
        assert.equal(packet.controlInventoryComplete, false);
        assert.deepEqual(packet.declarations, [{ name: "_ga", purpose: "Audience measurement", duration: "2 years", source: "cmp_api_inventory" }]);
        assert.equal(packet.declarationInventoryComplete, true);
        assert.deepEqual(packet.serviceNames, ["Google Analytics"]);
        assert.deepEqual(packet.declarationCoverage, { scope: "configured_services", configured: 1, resolved: 1, unresolved: 0, truncated: false });
      } else if (mode === "no-transition") {
        assert.equal(clicks, 1); assert.equal(packet.action.opened, false);
        assert.equal(packet.support.reason, "preference_operation_timed_out"); assert.equal(packet.controls[0]?.kind, "category");
        assert.equal(packet.checkpoints?.controlsSurface, "first_layer");
        assert.equal(packet.checkpoints?.privacyLinks, true);
        assert.equal(packet.checkpoints?.declarations, true);
        assert.equal(packet.declarations[0]?.name, "_ga");
      } else if (mode === "navigation") {
        assert.equal(packet.checkpoints, undefined);
        assert.equal(packet.declarations.length, 0);
        assert.equal(packet.serviceNames, undefined);
        assert.equal(packet.controls.length, 0);
        assert.equal(packet.declarationInventoryComplete, false);
      } else { assert.equal(clicks, 0); assert.equal(packet.action.count, 0); }
    }
  } finally {
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test("preference worker memory allowance stays inside the approved compute envelope", () => {
  for (const memory of [512, 2048, 3008, 4096, 8192, 10240]) {
    const budget = cmpPreferenceBudgetMs(memory);
    assert.ok(budget <= 17_000);
    assert.ok((budget + 2000) / 1000 * memory / 1024 <= 56);
  }
  assert.equal(cmpPreferenceBudgetMs(NaN), 3600);
  assert.equal(cmpPreferenceBudgetMs(0), 3600);
});

test("OneTrust registered dialog binding opens only the existing hidden preference node without aria-controls", {timeout: 25_000}, async () => {
  let mode = "valid", clicks = 0, saves = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    if (req.url === "/saved") { saves++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const panel = `<section id="onetrust-pc-sdk" ${mode === "visible" ? "" : "hidden"}><label><input type="checkbox">Analytics</label><button onclick="fetch('/saved')">Save preferences</button></section>`;
    res.end(`<div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler">${mode === "wrong-label" ? "Accept all" : "Cookie settings"}</button></div>${mode === "missing" ? "" : panel}${mode === "duplicate" ? panel : ""}<script>
      document.getElementById('onetrust-pc-btn-handler').onclick=()=>{fetch('/clicked');
        const panel=document.getElementById('onetrust-pc-sdk');
        ${mode === "replace" ? "panel.outerHTML=panel.outerHTML.replace(' hidden','');" : "panel.hidden=false;"}
      };
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["valid", "visible", "wrong-label", "missing", "duplicate", "replace"]) {
      clicks = 0; saves = 0;
      const packet = await runCmpPreferencesObserver({parentDispatchSha256: "a".repeat(64), config: {policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/`}});
      assert.equal(saves, 0);
      if (mode === "valid") {
        assert.equal(packet.status, "completed", JSON.stringify(packet));
        assert.equal(packet.support.recipeVersion, "onetrust_preferences.v3");
        assert.equal(packet.action.count, 1); assert.equal(packet.action.opened, true);
        assert.equal(packet.controls[0]?.kind, "category"); assert.equal(clicks, 1);
      } else {
        assert.equal(packet.action.opened, false, mode); assert.equal(packet.controlInventoryComplete, false, mode);
        assert.equal(clicks, mode === "replace" ? 1 : 0, mode);
        assert.equal(packet.controls.length, 0, mode);
      }
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});


test("registered OneTrust on-demand panel stays under the same vendor root and within the original budget", {timeout: 25_000}, async () => {
  let mode = "lazy", clicks = 0, saves = 0, accepts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    if (req.url === "/saved") { saves++; res.end(); return; }
    if (req.url === "/accepted") { accepts++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const panel = `<section id="${mode === "wrong-panel" ? "unrelated-panel" : "onetrust-pc-sdk"}" role="${mode === "wrong-role" ? "article" : "dialog"}" aria-label="Cookie preferences"><label><input type="checkbox">Analytics</label><fieldset><legend>Individual services</legend><label><input type="checkbox">Example Analytics</label></fieldset><details><summary>Cookies</summary><table><thead><tr><th>Cookie name</th><th>Purpose</th><th>Storage duration</th></tr></thead><tbody><tr><td>hidden_cookie</td><td>Hidden</td><td>1 year</td></tr></tbody></table></details><button onclick="fetch('/saved')">Save preferences</button></section>`;
    res.end(`<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler" aria-label="Cookie settings, Opens the preference center dialog">Cookie settings</button><button onclick="fetch('/accepted')">Accept all</button></div></div><script>
      document.getElementById('onetrust-pc-btn-handler').onclick=()=>{fetch('/clicked');
        ${mode === "navigate" ? "location.reload();" : mode === "never" ? "" : `setTimeout(()=>{
          const root=document.getElementById('onetrust-consent-sdk');
          ${mode === "root-replaced" ? "root.outerHTML=root.outerHTML;" : ""}
          ${mode === "outside-root" ? "document.body" : "document.getElementById('onetrust-consent-sdk')"}.insertAdjacentHTML('beforeend', ${JSON.stringify(panel)});
          ${mode === "duplicate" ? `document.getElementById('onetrust-consent-sdk').insertAdjacentHTML('beforeend', ${JSON.stringify(panel)});` : ""}
        },100);`}
      };
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address=server.address();assert.ok(address && typeof address!=="string");
  const memory=process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE="10240";
  try {
    for(mode of ["lazy", "outside-root", "root-replaced", "duplicate", "wrong-role", "navigate", "never", "wrong-panel"]){
      clicks=0;saves=0;accepts=0;
      const started=Date.now();
      const packet=await runCmpPreferencesObserver({parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:mode,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
      assert.equal(clicks,1,mode);assert.equal(saves,0);assert.equal(accepts,0);
      assert.equal(packet.action.count,1);assert.equal(packet.inspectionDiagnostic?.budgetMs,3600);
      assert.ok(Date.now()-started<4600,`Absolute inspection deadline exceeded: ${mode}`);
      assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.mode,"registered_deferred");
      assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.priorMatches,0);
      if(mode==="lazy"){
        assert.equal(packet.status,"completed",JSON.stringify(packet));assert.equal(packet.action.opened,true);
        assert.deepEqual(packet.controls.map(c=>c.kind),["category","service"]);
        assert.equal(packet.controlInventoryComplete,false,"Unopened sections remain outside complete inspection");
        assert.equal(packet.declarations.length,0,"Closed cookie sections must not be labelled visible inventory");
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.outcome,"opened");
      }else{
        assert.equal(packet.action.opened,false,mode);assert.equal(packet.controls.length,0,mode);assert.equal(packet.declarations.length,0,mode);
        assert.equal(packet.checkpoints?.controls??false,false,mode);
        if(["never","wrong-panel"].includes(mode))assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.outcome,"timed_out");
        if(mode==="duplicate"){
          assert.equal(packet.support.reason,"preference_surface_ambiguous");
          assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.outcome,"ambiguous");
        }
      }
    }
  }finally{
    if(memory===undefined)delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE=memory;
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});

test("busy OneTrust root binding uses the shared deadline instead of abandoning Options at 300 ms", { timeout: 15_000 }, async () => {
  const { chromium } = await import("playwright");
  const { chromiumLaunchOptions } = await import("./playwright-runtime.js");
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="onetrust-consent-sdk"><div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler" aria-label="Cookie settings, Opens the preference center dialog">Cookie settings</button></div></div><script>
      document.getElementById('onetrust-pc-btn-handler').onclick=()=>{fetch('/clicked');document.getElementById('onetrust-consent-sdk').insertAdjacentHTML('beforeend','<section id="onetrust-pc-sdk" role="dialog" aria-label="Cookie preferences"><label><input type="checkbox">Analytics</label><button>Save preferences</button></section>');};
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const newContext = browser.newContext.bind(browser);
  let legacy = true;
  browser.newContext = async options => {
    const context = await newContext(options), newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage(), setDefaultTimeout = page.setDefaultTimeout.bind(page), locator = page.locator.bind(page);
      page.setDefaultTimeout = ms => setDefaultTimeout(legacy ? 300 : ms);
      let blocked = false;
      page.locator = (selector, options) => {
        const control = locator(selector, options);
        if (selector === "#onetrust-consent-sdk") {
          const elementHandle = control.elementHandle.bind(control);
          control.elementHandle = async options => {
            if (!blocked) {
              blocked = true;
              // Real browser main-thread contention after the retained count,
              // before resolving the registered root. No external requests.
              await page.evaluate(() => { setTimeout(() => { const until = Date.now() + 550; while (Date.now() < until) {} }, 0); });
            }
            return elementHandle(options);
          };
        }
        return control;
      };
      return page;
    };
    return context;
  };
  try {
    for (legacy of [true, false]) {
      clicks = 0;
      const started = Date.now();
      const packet = await runCmpPreferencesObserver({ browser, parentDispatchSha256: "a".repeat(64), config: {
        policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: legacy ? "legacy-300ms" : "shared-deadline", exactTargetUrl: `http://127.0.0.1:${address.port}/`,
      } });
      assert.equal(packet.inspectionDiagnostic?.budgetMs, 3600);
      assert.ok(Date.now() - started < 4600);
      if (legacy) {
        assert.equal(packet.status, "limited", JSON.stringify(packet));
        assert.equal(packet.action.count, 0);
        assert.equal(packet.support.reason, "preference_operation_timed_out");
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.outcome, "timed_out");
      } else {
        assert.equal(packet.status, "completed", JSON.stringify(packet));
        assert.equal(packet.action.count, 1); assert.equal(packet.action.opened, true);
        assert.equal(clicks, 1); assert.equal(packet.controls[0]?.label, "Analytics");
      }
    }
  } finally {
    await browser.close();
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("parent cancellation after the single Options dispatch stays distinct from a timeout", { timeout: 6000 }, async () => {
  const controller = new AbortController();
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; controller.abort(); res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="onetrust-banner-sdk"><button id="onetrust-pc-btn-handler">Cookie settings</button></div><section id="onetrust-pc-sdk" hidden><label><input type="checkbox">Analytics</label></section><script>document.getElementById('onetrust-pc-btn-handler').onclick=()=>fetch('/clicked');</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const started = Date.now();
  try {
    const packet = await runCmpPreferencesObserver({ signal: controller.signal, parentDispatchSha256: "a".repeat(64), config: {
      policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "cancel-after-options", exactTargetUrl: `http://127.0.0.1:${address.port}/`,
    } });
    assert.equal(packet.status, "limited"); assert.equal(packet.support.reason, "preference_inspection_cancelled");
    assert.equal(packet.action.count, 1); assert.equal(clicks, 1); assert.equal(packet.action.opened, false);
    assert.equal(packet.controls.length, 0); assert.equal(packet.controlInventoryComplete, false);
    assert.ok(Date.now() - started < 2500, "Cancellation cannot consume the remaining allowance");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("early OneTrust declarations and visible native label targets survive bounded deeper inspection", { timeout: 20_000 }, async () => {
  let mode = "open", clicks = 0;
  const configurationReadStates: string[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/config-read?")) { configurationReadStates.push(req.url); res.end(); return; }
    if (req.url === "/options") { clicks++; res.end(); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<section id="onetrust-banner-sdk"><button aria-controls="prefs" onclick="fetch('/options');document.getElementById('prefs').hidden=false">Cookie settings</button><a href="/privacy-cookies/" aria-label="Privacy and cookie statement">Read notice</a></section>
      ${mode === "open" ? '<section id="prefs" hidden><label><input style="display:none" type="checkbox">Analytics</label><label><input style="opacity:0;width:0;height:0" type="checkbox">Marketing</label><fieldset disabled><label><input style="display:none" type="checkbox">Disabled category</label></fieldset><div hidden><label><input type="checkbox">Hidden category</label></div><details><summary>More cookies</summary><table><tr><td>not_opened</td></tr></table></details></section>' : ''}
      <script>window.OneTrust={GetDomainData:()=>{fetch('/config-read?opened='+Boolean(document.getElementById('prefs')&&!document.getElementById('prefs').hidden));return ({Groups:[{CustomGroupId:'C2',GroupName:'Analytics',VendorServices:[{CustomVendorServiceId:'S1',ServiceName:'Named Analytics'}],Hosts:[{HostId:'H1',HostName:'media.example.test',DisplayName:'Named Media',Cookies:[]}],FirstPartyCookies:[{Name:'_ga',Description:'Audience measurement',Lifespan:'2 years'}]}]})}};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["open", "missing_panel"]) {
      clicks = 0; configurationReadStates.length = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.deepEqual(packet.declarations.map(cookie => cookie.name), ["_ga"]);
      assert.deepEqual(configurationReadStates,[`/config-read?opened=${mode === "open"}`]);
      assert.deepEqual(packet.serviceNames, ["Named Analytics", "Named Media"]);
      assert.deepEqual(packet.declarationCoverage, {scope:"configured_services",configured:2,resolved:2,unresolved:0,truncated:false});
      assert.equal(packet.inspectionDiagnostic?.configuration?.version,"onetrust_loaded_configuration.v4");
      assert.equal(packet.declarationInventoryComplete, false); assert.equal(packet.checkpoints?.declarations, true);
      assert.ok(packet.privacyLinks.some(link => link.hitTargetBeforeAction), JSON.stringify(packet.privacyLinks));
      assert.equal(clicks, mode === "open" ? 1 : 0);
      if (mode === "open") {
        assert.equal(packet.status, "completed");
        assert.deepEqual(packet.controls.filter(control => control.enabled).map(control => control.label), ["Analytics", "Marketing"]);
        assert.ok(!packet.controls.some(control => control.label === "Hidden category"));
        assert.equal(packet.controls.find(control => control.label === "Disabled category")?.enabled, false);
      } else assert.equal(packet.status, "limited");
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("visible first-layer choices survive absent Options without any interaction", { timeout: 10_000 }, async () => {
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    res.setHeader("content-type", "text/html");
    res.end('<section id="onetrust-banner-sdk"><label><input type="checkbox">Analytics</label><button onclick="fetch(\'/clicked\')">Accept all</button></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "first-layer", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.status, "limited"); assert.equal(packet.action.count, 0); assert.equal(clicks, 0);
    assert.equal(packet.checkpoints?.controls, true); assert.equal(packet.checkpoints?.controlsSurface, "first_layer");
    assert.equal(packet.controls[0]?.kind, "category"); assert.equal(packet.controls[0]?.label, "Analytics");
    assert.equal(packet.controlInventoryComplete, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("privacy-link reachability uses bounded real hit targets rather than only the bounding-box center", { timeout: 12_000 }, async () => {
  let mode = "partial";
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`<section id="onetrust-banner-sdk"><button>Accept all</button><a href="/privacy/" style="position:fixed;left:${mode === "offscreen" ? 5000 : 20}px;top:20px;width:200px;height:40px;display:block">Privacy policy</a></section><div style="position:fixed;z-index:10;left:${mode === "partial" ? 100 : 20}px;top:${mode === "partial" ? 30 : 20}px;width:${mode === "partial" ? 40 : 200}px;height:${mode === "partial" ? 20 : 40}px;background:black"></div>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["partial", "covered", "offscreen"]) {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.privacyLinks[0]?.hitTargetBeforeAction, mode === "partial", JSON.stringify(packet));
      assert.equal(packet.privacyLinks[0]?.access?.outcome, mode === "partial" ? "reachable" : mode === "covered" ? "hit_target_missed" : "outside_viewport");
      assert.equal(packet.checkpoints?.privacyLinks, true);
      assert.equal(packet.action.count, 0);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("a missing ready CMP cannot consume the basic-evidence reserve", { timeout: 7000 }, async () => {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "text/html");
    res.end('<section id="onetrust-banner-sdk"><a href="/privacy/">Privacy policy</a><label><input type="checkbox">Analytics</label></section><script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:"C2",GroupName:"Analytics",FirstPartyCookies:[{Name:"_ga",Lifespan:"1 day"}]}]})};</script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  try {
    const started = Date.now();
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "reserve", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.ok(Date.now() - started < 4600);
    assert.equal(packet.inspectionDiagnostic?.budgetMs, 3600);
    assert.equal(packet.support.reason, "preference_readiness_incomplete"); assert.equal(packet.action.count, 0);
    assert.ok(packet.privacyLinks.some(link => link.hitTargetBeforeAction));
    assert.equal(packet.controls[0]?.label, "Analytics"); assert.equal(packet.checkpoints?.controlsSurface, "first_layer");
    assert.equal(packet.declarations[0]?.name, "_ga"); assert.equal(packet.checkpoints?.declarations, true);
    assert.equal(packet.declarationInventoryComplete, false);
  } finally {
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("registered HubSpot, Didomi and Osano panels bind one Options action and reject replacements and ambiguity", { timeout: 45_000 }, async () => {
  const variants = [
    { provider: "HubSpot Consent Banner", root: "hs-banner-parent", banner: 'id="hs-eu-cookie-confirmation"', button: 'id="hs-eu-cookie-settings-button"', panel: 'id="hs-modal-content" role="alertdialog" aria-label="Cookie settings"', deferred: true },
    { provider: "Didomi", root: "didomi-host", banner: 'id="didomi-notice"', button: 'id="didomi-notice-learn-more-button"', panel: 'id="didomi-consent-popup" role="dialog" aria-label="Cookie settings"', deferred: true },
    { provider: "Osano", root: "osano-root", banner: 'class="osano-cm-dialog"', button: 'class="osano-cm-button--type_manage"', panel: 'class="osano-cm-info-dialog" role="dialog" aria-label="Cookie settings"', deferred: false },
  ];
  let variant = variants[0]!, mode = "valid", clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    const panel = `<section ${variant.panel} data-panel><label><input type="checkbox">Analytics</label><button onclick="fetch('/unexpected-save')">Save preferences</button></section>`;
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="${variant.root}" ${variant.provider === "Osano" ? 'class="osano-cm-window"' : ''}><div ${variant.banner}><${mode === "anchor" ? 'a href="#"' : 'button'} ${variant.button} data-options>${mode === "informational-label" ? "Learn more" : "Manage cookies"}</${mode === "anchor" ? 'a' : 'button'}></div>${variant.deferred ? "" : panel.replace('data-panel', 'data-panel hidden')}${mode === "duplicate" ? panel + panel : ""}</div><footer><button>Manage cookies</button></footer><script>
      document.querySelector('#${variant.root} [data-options]').onclick=(event)=>{event.preventDefault();fetch('/clicked');const root=document.getElementById('${variant.root}');
        ${mode === "navigate" ? "location.reload();" : mode === "wrong-panel" ? "root.insertAdjacentHTML('beforeend','<section role=dialog>Other panel</section>');" : variant.deferred ? `${mode === "replace-root" ? "root.outerHTML=root.outerHTML;" : ""}document.getElementById('${variant.root}').insertAdjacentHTML('beforeend', ${JSON.stringify(panel)});` : mode === "replace-root" ? "root.querySelector('[data-panel]').outerHTML=root.querySelector('[data-panel]').outerHTML.replace(' hidden','');" : "root.querySelector('[data-panel]').hidden=false;"}
      };
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  try {
    for (variant of variants) for (mode of ["valid", "anchor", "duplicate", "replace-root", "navigate", "wrong-panel", "informational-label"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `${variant.provider}-${mode}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.support.provider, variant.provider, JSON.stringify(packet));
      assert.ok(packet.action.count <= 1); assert.ok(clicks <= 1);
      if (mode === "informational-label") assert.equal(clicks, 0, "A panel selector alone never authorizes an informational link");
      if (["valid", "anchor"].includes(mode)) {
        assert.equal(packet.status, "completed", JSON.stringify(packet)); assert.equal(packet.action.opened, true); assert.equal(clicks, 1);
        assert.equal(packet.controls[0]?.kind, "category");
      } else { assert.equal(packet.action.opened, false, `${variant.provider}-${mode}`); }
    }
  } finally {
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("configured Drupal cookie identity is bounded, own-data-only and document-bound", { timeout: 20_000 }, async () => {
  let mode = "valid";
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="sliding-popup"><button>Accept cookies</button></div>${mode === "ambiguous" ? '<div id="onetrust-banner-sdk"><button>Accept all</button></div>' : ''}<script>
      window.drupalSettings={eu_cookie_compliance:{cookie_name:${JSON.stringify(mode === "invalid" ? "private=value" : "cookie_compliance")}}};
      ${mode === "getter" ? "Object.defineProperty(window.drupalSettings.eu_cookie_compliance,'cookie_name',{get(){throw new Error('Getter must never run');}});" : ""}
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["valid", "getter", "invalid", "ambiguous"]) {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.action.count, 0);
      assert.deepEqual(packet.configuredConsentCookies, mode === "valid" ? [{ version: "cmp_configured_cookie_identity.v1", configurationPath: "drupalSettings.eu_cookie_compliance.cookie_name", name: "cookie_compliance" }] : []);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("HubSpot deferred alertdialog finishes accessible-name hydration before inspection without a second click", { timeout: 15_000 }, async () => {
  let clicks = 0, saves = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    if (req.url === "/save") { saves++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="hs-banner-parent"><div id="hs-eu-cookie-confirmation"><button id="hs-eu-cookie-settings-button">Manage Cookies</button></div></div><script>
      document.getElementById('hs-eu-cookie-settings-button').onclick=()=>{
        fetch('/clicked');document.getElementById('hs-banner-parent').insertAdjacentHTML('beforeend',${JSON.stringify('<div id="hs-modal-content"><h2 id="hs-modal-introduction">Manage cookies</h2><label><input type="checkbox">Analytics</label><label><input type="checkbox">Marketing</label><button id="save">Save settings</button></div>')});document.getElementById('save').onclick=()=>fetch('/save');
        setTimeout(()=>{const panel=document.getElementById('hs-modal-content');panel.setAttribute('role','alertdialog');panel.setAttribute('aria-labelledby','hs-modal-introduction');},150);
      };
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "hubspot-hydration", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.status, "completed", JSON.stringify(packet)); assert.equal(packet.action.count, 1); assert.equal(packet.action.opened, true);
    assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.verification?.result, "verified");
    assert.equal(packet.controls.length, 2); assert.equal(clicks, 1); assert.equal(saves, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

for (const variant of ["missing_panel", "missing_role", "missing_name"] as const) {
  test(`HubSpot opening cap retains privacy checkpoint before a slow report barrier: ${variant}`, { timeout: 6000 }, async () => {
    let clicks = 0;
    const server = createServer((req, res) => {
      if (req.url === "/clicked") { clicks++; res.end(); return; }
      res.setHeader("Content-Type", "text/html");
      const panel = variant === "missing_panel" ? "" : `<div id="hs-modal-content" ${variant === "missing_name" ? 'role="alertdialog"' : 'aria-label="Preferences"'}><label><input type="checkbox">Analytics</label></div>`;
      res.end(`<a href="/privacy-policy">Privacy policy</a><div id="hs-banner-parent"><div id="hs-eu-cookie-confirmation"><button id="hs-eu-cookie-settings-button">Manage Cookies</button></div></div><script>document.getElementById('hs-eu-cookie-settings-button').onclick=()=>{fetch('/clicked');document.getElementById('hs-banner-parent').insertAdjacentHTML('beforeend',${JSON.stringify(panel)});};</script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const started = Date.now();
    try {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: variant, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.ok(Date.now() - started < 3000, "Optional opening must leave time to retain the packet; it cannot use the 17-second lane allowance");
      assert.equal(clicks, 1); assert.equal(packet.action.count, 1); assert.equal(packet.action.opened, false);
      assert.equal(packet.status, "limited"); assert.equal(packet.support.reason, "preference_operation_timed_out");
      assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.outcome, "timed_out");
      if (variant !== "missing_panel") assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.verification?.result, variant === "missing_role" ? "role_not_ready" : "name_not_ready");
      assert.equal(packet.checkpoints?.privacyLinks, true); assert.equal(packet.privacyLinks.length, 1);
      assert.equal(packet.checkpoints?.controls, false); assert.deepEqual(packet.controls, []);
      assert.equal(packet.controlInventoryComplete, false); assert.equal(packet.declarationInventoryComplete, false);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
}


test("Osano registered widget opens exactly once; hidden, covered, inactive and ambiguous widgets stay neutral", {timeout:20000}, async () => {
  let mode="widget", clicks=0;
  const server=createServer((req,res)=>{
    if(req.url==="/clicked"){clicks++;res.end();return;}
    res.setHeader("content-type","text/html");
    const widget=`<button class="${mode==='unregistered'?'custom-cookie-trigger':'osano-cm-window__widget'}" aria-label="Cookie Preferences" style="${mode==='hidden'?'display:none':mode==='transparent'?'opacity:0':mode==='offscreen'?'position:fixed;left:5000px':''}" ${mode==='disabled'?'disabled':''} ${mode==='foreign-aria'?'aria-controls="foreign"':''}>Cookie Preferences</button>`;
    const panel='<section class="osano-cm-info-dialog" role="dialog" aria-label="Storage Preferences"><label><input type="checkbox">Analytics</label><button onclick="fetch(\'/unexpected-save\')">Save</button></section>';
    res.end(`<div class="osano-cm-window"><div class="osano-cm-dialog">Cookie consent <button>Accept</button></div>${widget}${mode==='ambiguous'?widget:''}${['deferred','outside-panel'].includes(mode)?'':panel.replace('<section','<section hidden')}</div>${mode==='outside-panel'?panel.replace('<section','<section hidden'):''}${mode==='duplicate-root'?'<div class="osano-cm-window"></div>':''}<section id="foreign" hidden>Other settings</section>${mode==='covered'?'<div style="position:fixed;inset:0;z-index:10"></div>':''}<script>${mode==='drift-transparent'?"const original=Element.prototype.getAttribute;Element.prototype.getAttribute=function(name){if(name==='aria-controls'&&this.matches('.osano-cm-window__widget'))this.style.opacity='0';return original.call(this,name);};":''}document.querySelectorAll('.osano-cm-window__widget').forEach(b=>b.onclick=()=>{fetch('/clicked');${mode==='deferred'?"document.querySelector('.osano-cm-window').insertAdjacentHTML('beforeend',"+JSON.stringify(panel)+");":mode==='outside-panel'?"document.querySelector('.osano-cm-info-dialog').hidden=false;":mode==='foreign-aria'?"document.querySelector('#foreign').hidden=false;":"document.querySelector('.osano-cm-info-dialog').hidden=false;"}})</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  try {
    for(mode of ["widget","deferred","hidden","transparent","offscreen","covered","disabled","ambiguous","outside-panel","foreign-aria","unregistered","duplicate-root","drift-transparent"]){
      clicks=0;
      const packet=await runCmpPreferencesObserver({parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:mode,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
      const success=["widget","deferred"].includes(mode);
      assert.equal(clicks,success||["foreign-aria","outside-panel"].includes(mode)?1:0,JSON.stringify(packet));assert.equal(packet.action.opened,success,JSON.stringify(packet));
      if(success){assert.equal(packet.controls[0]?.label,"Analytics");assert.equal(packet.support.recipeVersion,"osano_preferences.v2");}
      else if(mode==="unregistered") assert.equal(packet.inspectionDiagnostic!.optionsResolution!.counts.actionable,0);
      else if(mode==="duplicate-root") assert.equal(packet.inspectionDiagnostic!.surfaceBinding!.outcome,"parent_unbound");
      else if(mode==="drift-transparent") assert.ok(packet.limitations.includes("preference_control_changed"));
      else if(!["outside-panel","foreign-aria","duplicate-root","unregistered"].includes(mode)) {const counts=packet.inspectionDiagnostic!.optionsResolution!.counts;assert.equal(counts[mode==='transparent'?'hidden':mode==='offscreen'?'outside_viewport':mode==='ambiguous'?'actionable':mode as 'hidden'|'covered'|'disabled'],mode==='ambiguous'?2:1,JSON.stringify(packet));assert.equal(packet.controlInventoryComplete,false);}
    }
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("CookieYes category structure recognizes labelled switches without inventing cookie declarations or service identity", { timeout: 30_000 }, async () => {
  let mode = "valid";
  const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/action/")) { actions.push(req.url); res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const categories = ["Functional", "Analytics", "Advertisement", "Others"].map((name, index) => `<div class="cky-accordion">
      <button data-cky-tag="detail-category-title" aria-expanded="false">${name}</button>
      ${mode === "ambiguous" ? '<button data-cky-tag="detail-category-title">Duplicate</button>' : ''}
      <div data-cky-tag="detail-category-toggle" ${mode === "hidden" ? 'hidden' : ''}><input type="checkbox" role="switch" aria-label="Enable ${name}" id="switch${index}"></div>
      <div class="cky-accordion-body"></div></div>`).join("");
    res.end(`<div class="cky-consent-container"><button id="settings" aria-controls="preferences">Settings</button></div>
      <section id="preferences" class="cky-preference-center" data-cky-tag="detail" role="dialog" hidden>${categories}
      <fieldset><legend>Individual services</legend><label><input type="checkbox">Google Analytics</label></fieldset>
      <button onclick="fetch('/action/save')">Save my preferences</button><button onclick="fetch('/action/accept')">Accept all</button><button onclick="fetch('/action/reject')">Reject optional</button></section>
      <script>settings.onclick=()=>{fetch('/action/options');preferences.hidden=false;};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["valid", "ambiguous", "hidden"]) {
      actions.length = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `cookieyes-${mode}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.status, "completed", JSON.stringify(packet));
      assert.deepEqual(actions, ["/action/options"]);
      assert.equal(packet.controls.filter(row => row.kind === "category").length, mode === "valid" ? 4 : 0);
      assert.equal(packet.controls.filter(row => row.kind === "service").length, 1);
      assert.ok(packet.controls.every(row => row.checked === false));
      assert.deepEqual(packet.declarations, []);
      assert.equal(packet.declarationInventoryComplete, false);
      assert.equal(packet.controlInventoryComplete, false);
      if (mode === "valid") assert.equal(packet.support.recipeVersion, "cookieyes_preference_categories.v1");
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("visible verified preferences do not wait for unrelated parser-blocking scripts", { timeout: 10_000 }, async () => {
  const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/slow.js") return; // Deliberately never reaches DOMContentLoaded.
    if (req.url?.startsWith("/action/")) { actions.push(req.url); res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<div id="onetrust-banner-sdk"><button id="settings" aria-controls="preferences">Cookie settings</button></div>
      <section id="preferences" hidden><label><input type="checkbox">Analytics</label><button onclick="fetch('/action/save')">Save preferences</button></section>
      <script>settings.onclick=()=>{fetch('/action/options');preferences.hidden=false;};</script><script src="/slow.js"></script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "loading-cmp", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.status, "completed", JSON.stringify(packet));
    assert.equal(packet.action.opened, true); assert.deepEqual(actions, ["/action/options"]);
    assert.equal(packet.controls[0]?.kind, "category");
    assert.equal(packet.controlInventoryComplete, false, "loading documents cannot prove inventory completeness");
    assert.ok(packet.limitations.includes("preference_document_loading"));
  } finally {
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("HTTP access denials retain their status and never inspect or click a CMP-looking error page", { timeout: 10_000 }, async () => {
  let status = 403; const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { actions.push(req.url); res.end(); return; }
    res.statusCode = status; res.setHeader("Content-Type", "text/html");
    res.end('<div id="onetrust-banner-sdk"><button aria-controls="prefs" onclick="fetch(\'/clicked\')">Cookie settings</button></div><section id="prefs"><label><input type="checkbox">Analytics</label></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (status of [403, 429, 503]) {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `access-${status}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.status, "limited"); assert.equal(packet.support.reason, "preference_page_access_limited");
      assert.equal(packet.inspectionDiagnostic?.navigationHttpStatus, status);
      assert.equal(packet.action.count, 0); assert.deepEqual(packet.controls, []); assert.deepEqual(packet.declarations, []);
      assert.equal(packet.controlInventoryComplete, false); assert.equal(packet.declarationInventoryComplete, false);
    }
    assert.deepEqual(actions, []);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("challenge URL changes cannot mask the initial HTTP denial or retain challenge tokens", { timeout: 10_000 }, async () => {
  let status = 403; const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { actions.push(req.url); res.end(); return; }
    res.statusCode = status; res.setHeader("Content-Type", "text/html");
    res.end(`<script>history.replaceState(null,'','/?__cf_chl_rt_tk=private-fixture-token');</script>
      <div id="onetrust-banner-sdk"><button aria-controls="prefs" onclick="fetch('/clicked')">Cookie settings</button></div><section id="prefs" hidden><label><input type="checkbox">Analytics</label></section>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (status of [403, 429]) {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `challenge-${status}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.status, "limited"); assert.equal(packet.support.reason, "preference_page_access_limited");
      assert.equal(packet.inspectionDiagnostic?.navigationHttpStatus, status);
      assert.equal(packet.finalUrl, null); assert.equal(packet.documentToken, null);
      assert.equal(packet.checkpoints, undefined); assert.deepEqual(packet.controls, []); assert.equal(packet.action.count, 0);
      assert.ok(!JSON.stringify(packet).includes("private-fixture-token"));
    }
    assert.deepEqual(actions, []);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("DataGrail opens one category layer inside the same shadow dialog without changing consent", { timeout: 20_000 }, async () => {
  let mode = "valid"; const actions: string[] = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith('/action/')) { actions.push(req.url); res.end(); return; }
    res.setHeader('Content-Type', 'text/html');
    const categories = `<div class="dg-main-content-policies">${['Necessary','Functional','Analytics','Marketing'].map((name, i) => `<div class="dg-main-content-policy-option"><div class="dg-main-content-policy-option-heading"><strong>${name} Cookies</strong><span class="dg-main-content-policy-option-input"><input type="checkbox" aria-label="${name} Cookies" ${i === 0 ? 'disabled checked' : ''}></span></div><button aria-expanded="false">Details</button></div>`).join('')}</div>`;
    res.end(`<aside class="dg-consent-banner"></aside><script>
      const root=document.querySelector('aside').attachShadow({mode:'open'});
      root.innerHTML='<div class="dg-app" role="dialog" aria-label="Cookie preferences"><button class="dg-button open_layer">${mode === 'wrong-label' ? 'Accept All' : 'Customize My Choices'}</button></div>';
      const panel=root.querySelector('.dg-app');
      const options=panel.querySelector('button');
      ${mode === 'duplicate' ? "panel.append(options.cloneNode(true));" : ''}
      options.onclick=()=>{fetch('/action/options');${mode === 'no-transition' ? '' : mode === 'replacement' ? `panel.outerHTML=${JSON.stringify(`<div class="dg-app" role="dialog">${categories}</div>`)};` : `panel.innerHTML=${JSON.stringify(categories+'<button class="dg-button custom">Save My Choices</button><button>Accept All</button><button>Reject All</button>')};panel.querySelectorAll('button').forEach(b=>b.onclick=()=>fetch('/action/unexpected'));`}};
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address=server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (mode of ['valid','replacement','duplicate','wrong-label','no-transition']) {
      actions.length=0;
      const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:`datagrail-${mode}`,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
      assert.equal(packet.support.provider,'DataGrail');
      if (mode==='valid') {
        assert.equal(packet.status,'completed',JSON.stringify(packet)); assert.equal(packet.action.opened,true);
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.mode,'registered_layer');
        assert.equal(packet.support.recipeVersion,'datagrail_preference_categories.v1');
        assert.equal(packet.controls.filter(c=>c.kind==='category' && c.enabled).length,3);
        assert.equal(packet.controls.filter(c=>c.kind==='category' && !c.enabled && c.checked).length,1);
        assert.ok(packet.controls.filter(c=>c.enabled).every(c=>c.checked===false));
        assert.deepEqual(packet.declarations,[]); assert.equal(packet.declarationInventoryComplete,false);
        assert.equal(packet.controlInventoryComplete,false);
      } else { assert.equal(packet.action.opened,false); assert.equal(packet.controls.length,0); }
      assert.deepEqual(actions,['duplicate','wrong-label'].includes(mode)?[]:['/action/options']);
    }
  } finally { await new Promise<void>(resolve => server.close(()=>resolve())); }
});


test("registered CMP root buttons establish readiness without authorizing Close or Next", { timeout: 12_000 }, async () => {
  let ambiguous = false;
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    const panel = `<section data-testid="widget-container"><label>Google Analytics 4<input type="checkbox"></label><button id="axeptio_btn_close" aria-label="Close cookie settings" aria-controls="preferences">Close</button><button id="axeptio_btn_next">Next</button></section>`;
    res.end(panel + (ambiguous ? panel : "") + '<section id="preferences" hidden><label>Analytics<input type="checkbox"></label></section>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const memory = process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;
  process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "10240";
  try {
    for (ambiguous of [false, true]) {
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "root-control", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.equal(packet.action.count, 0);
      assert.equal(packet.support.provider, "Axeptio");
      assert.equal(packet.support.reason, ambiguous ? "cmp_identity_ambiguous" : "unique_actionable_options_not_resolved");
      assert.equal(packet.controls.length, ambiguous ? 0 : 1);
      if (!ambiguous) assert.equal(packet.controls[0]?.kind, "unclassified", "service label is not a category declaration");
      assert.equal(packet.controlInventoryComplete, false);
    }
  } finally {
    if (memory === undefined) delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE; else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = memory;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("preference privacy hit tests skip unrelated navigation links", { timeout: 10_000 }, async () => {
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(`${Array.from({length: 200}, (_, i) => `<a href="/nav${i}">Navigation ${i}</a>`).join('')}
      <section id="onetrust-banner-sdk"><button>Accept all</button><a style="position:fixed;top:10px;right:10px;z-index:10;background:white" href="/privacy">Privacy policy</a></section>
      <script>
      // Deterministic proof that geometry is never spent on unrelated links.
      document.querySelectorAll('a').forEach(a=>{if(a.textContent.startsWith('Navigation'))a.getClientRects=()=>{throw Error('Unrelated geometry read');};});
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "privacy-priority", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.checkpoints?.privacyLinks, true);
    assert.equal(packet.privacyLinks.length, 1);
    assert.equal(packet.privacyLinks[0]?.access?.outcome, "reachable");
    assert.equal(packet.action.count, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("registered Cookiebot and Termly aria targets may mount after Options inside their retained root", { timeout: 60_000 }, async () => {
  let mode = "valid", provider = "Cookiebot", clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const termly = provider === "Termly";
    const root = termly ? 'data-termly-part="consent-banner"' : 'id="CybotCookiebotDialog"';
    const button = '<button aria-controls="prefs" data-options>Cookie settings</button>';
    const panel = `<section id="prefs" role="tabpanel" ${mode === "unnamed" ? '' : 'aria-label="Cookie preferences"'}><label><input type="checkbox">Analytics</label><button>Save preferences</button></section>`;
    res.end(`<main ${root} data-root>Cookie consent ${termly ? '<span role="button" aria-controls="prefs">Preferences</span><div data-termly-part="banner-actions">' : ''}${button}${mode === "duplicate" ? button : ''}${termly ? '</div>' : ''}</main><script>document.querySelectorAll('[data-options]').forEach(button => button.onclick = () => {fetch('/clicked');const root=document.querySelector('[data-root]');${mode === "replace-root" ? 'root.outerHTML=root.outerHTML;' : ''}${mode === "outside" ? 'document.body' : 'document.querySelector("[data-root]")'}.insertAdjacentHTML('beforeend',${JSON.stringify(panel)});});</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (provider of ["Cookiebot", "Termly"]) for (mode of ["valid", "duplicate", "outside", "replace-root", "unnamed"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `${provider}-${mode}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      const context = `${provider}-${mode}: ${JSON.stringify(packet)}`;
      assert.equal(packet.support.provider, provider, context);
      assert.equal(clicks, mode === "duplicate" ? 0 : 1, context);
      assert.equal(packet.action.opened, mode === "valid", context);
      if (mode === "valid") {
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.verification?.result, "verified", context);
        assert.ok(packet.controls.some(c => c.label === "Analytics"), context);
      } else assert.equal(packet.controlInventoryComplete, false, context);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("Borlabs service accounting remains exact when cookie declarations are malformed, missing or truncated", async () => {
  const { chromium } = await import("playwright");
  const { readBorlabsPreferenceInventory } = await import("./cmp-preferences-observer.js");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.evaluate("window.__name = (value) => value");
    for (const mode of ["valid", "bad-cookie", "missing-cookies", "too-many-cookies", "missing-name", "throwing-group"]) {
      await page.evaluate(mode => {
        const target = window as any;
        const services = Array.from({ length: 8 }, (_, i) => [`service${i}`, { id: `service${i}`, serviceGroupId: "analytics" }]);
        target.borlabsCookieConfig = { services: Object.fromEntries(services) };
        target.BorlabsCookie = {
          Services: { findByServiceId: (id: string) => ({ name: mode === "missing-name" && id === "service0" ? "" : id, serviceGroupId: "analytics",
            cookies: mode === "missing-cookies" ? undefined : mode === "too-many-cookies" ? Array.from({length: 101}, (_, i) => ({name: `cookie${i}`})) : [{ name: "_ga", purpose: "Audience measurement", lifetime: "2 years" }, ...(mode === "bad-cookie" && id === "service0" ? [{ name: "bad cookie" }] : [])] }) },
          ServiceGroups: { findByServiceGroupId: () => { if (mode === "throwing-group") throw new Error("unavailable"); return { name: "Analytics" }; } },
        };
      }, mode);
      const result = await readBorlabsPreferenceInventory(page);
      assert.deepEqual(result.coverage, { scope: "configured_services", configured: 8, resolved: mode === "missing-name" ? 7 : 8, unresolved: mode === "missing-name" ? 1 : 0, truncated: false }, mode);
      assert.equal(result.services.length, result.coverage.resolved, mode);
      assert.equal(result.cookieInventoryComplete, mode === "valid", mode);
      assert.ok(result.declarations.length <= 100);
    }
  } finally { await browser.close(); }
});

test("Iubenda UI-v2 uses the actual shadow banner and never opens a marketing Preferences link", {timeout: 15_000}, async () => {
  let clicks = 0;
  const server = createServer((req, res) => {
    if (req.url === "/clicked") { clicks++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(`<header class="iubenda-header"><button aria-controls="marketing" onclick="fetch('/clicked');document.querySelector('#marketing').hidden=false">Preferences</button><div id="marketing" hidden>Marketing preferences</div></header><tb-banner-wrapper></tb-banner-wrapper><script>document.querySelector('tb-banner-wrapper').attachShadow({mode:'open'}).innerHTML='<section aria-label="Notice"><label><input type="checkbox">Analytics</label><button>Preferences</button><button>Reject</button><button>Accept</button></section>';</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "iubenda-shadow", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.support.provider, "Iubenda", JSON.stringify(packet));
    assert.equal(packet.inspectionDiagnostic?.optionsResolution?.counts.actionable, 1);
    assert.equal(clicks, 0); assert.equal(packet.action.count, 0);
    assert.equal(packet.support.reason, "preference_surface_binding_unavailable");
    assert.ok(packet.controls.some(c => c.label === "Analytics"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("legacy Termly banners without a primary action area retain unique existing-panel inspection", {timeout: 10_000}, async () => {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end('<div id="termly-banner">Cookie consent <button aria-controls="prefs" onclick="document.querySelector(\'#prefs\').hidden=false">Cookie settings</button><section id="prefs" hidden><label><input type="checkbox">Analytics</label></section></div>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "termly-legacy", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.support.provider, "Termly");
    assert.equal(packet.action.opened, true, JSON.stringify(packet));
    assert.equal(packet.action.count, 1);
    assert.ok(packet.controls.some(c => c.label === "Analytics"));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("reviewed sibling portals require unique original controls, unchanged SDK ownership and exact panel structure", {timeout: 60_000}, async () => {
  let provider = "Iubenda", mode = "valid", clicks = 0, choices = 0;
  const server = createServer((req, res) => {
    if (req.url === "/opened") { clicks++; res.end(); return; }
    if (req.url === "/choice") { choices++; res.end(); return; }
    res.setHeader("Content-Type", "text/html");
    const iubenda = provider === "Iubenda";
    const banner = iubenda ? '<tb-banner-wrapper></tb-banner-wrapper>' : '<section id="truste-consent-track"><button id="truste-show-consent">Manage Settings</button></section>';
    const panel = iubenda ? `<div id="iubenda-iframe"><section id="iubenda-iframe-popup" role="alertdialog" ${mode === "unnamed" ? '' : 'aria-label="Your Privacy Choices"'}><div id="purposes-content-container"><div class="purposes-body"><div class="purposes-item"><div class="purposes-item-title"><label for="purpose-4">Measurement</label></div><div class="purposes-checkbox"><input id="purpose-4" type="checkbox"></div></div><button onclick="fetch('/choice')">Save preferences</button></div></div></section></div>`
      : `<section class="truste_box_overlay_inner" id="pop-div3123" role="dialog" ${mode === "unnamed" ? '' : 'aria-label="Cookie preferences"'}><div id="pop-frame123" name="trustarc_cm" class="trustarc_newcm_container truste_popframe"></div></section>`;
    const trustContent = '<section class="gdprAccessiblePrefPanel"><div class="categoryPanelAccessible"><div class="accessibleCategoryHeadingName"><h2>Functional Cookies</h2></div><div role="radiogroup" class="accessibleSwitch"><button role="radio" aria-checked="false" onclick="fetch(\'/choice\')">No</button><button role="radio" aria-checked="false" onclick="fetch(\'/choice\')">Yes</button></div></div></section>';
    res.end(`${banner}<script>
      window._iub={cs:{}};window.truste={eu:{}};
      ${mode === "getter-sdk" ? "Object.defineProperty(window.truste,'eu',{get(){throw Error('getter must not run')}});Object.defineProperty(window._iub,'cs',{get(){throw Error('getter must not run')}});" : ''}
      ${iubenda ? "const root=document.querySelector('tb-banner-wrapper').attachShadow({mode:'open'});root.innerHTML='<section><button class=\"tb-banner-tab-button inactive\">Preferences</button><div hidden><button class=\"tb-banner-tab-button inactive\">Preferences</button></div></section>';" : 'const root=document;'}
      const button=root.querySelector('button');
      ${mode === "duplicate" ? "button.parentElement.append(button.cloneNode(true));" : ''}
      ${mode === "preexisting" ? 'document.body.insertAdjacentHTML("beforeend",'+JSON.stringify(panel)+');' : ''}
      button.onclick=()=>{fetch('/opened');${mode === "replace-root" ? "button.getRootNode().host ? button.getRootNode().host.remove() : document.querySelector('#truste-consent-track').remove();" : ''}
        ${mode === "sdk-change" ? "window._iub.cs={};window.truste.eu={};" : ''}
        document.body.insertAdjacentHTML('beforeend',${JSON.stringify(panel)});
        ${iubenda ? '' : `window.truste.eu.popdiv3='${mode === "wrong-id" ? 'pop-div3999' : 'pop-div3123'}';window.truste.eu.popframe='pop-frame123';document.querySelector('[name="trustarc_cm"]').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(trustContent)};`}
      };
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (provider of ["Iubenda", "TrustArc"]) for (mode of ["valid", "duplicate", "preexisting", "getter-sdk", "replace-root", "sdk-change", "unnamed", ...(provider === "TrustArc" ? ["wrong-id"] : [])]) {
      clicks = choices = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: `${provider}-${mode}`, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      const detail = `${provider}/${mode} ${JSON.stringify(packet)}`;
      assert.equal(choices, 0, detail);
      assert.equal(clicks, ["duplicate", "preexisting", "getter-sdk"].includes(mode) ? 0 : 1, detail);
      assert.equal(packet.action.opened, mode === "valid", detail);
      if (mode === "valid") {
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.mode, "registered_portal", detail);
        assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.verification?.result, "verified", detail);
        assert.equal(packet.controls[0]?.kind, "category", detail);
        if (provider === "TrustArc") assert.equal(packet.controls[0]?.checked, null, "radio choices were observed but no choice state is inferred");
      } else assert.equal(packet.controlInventoryComplete, false, detail);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});


test("TrustArc radio categories require visible consistent pairs and never infer a saved choice", async () => {
  const {chromium} = await import("playwright");
  const {readPreferenceControls, classifyControls} = await import("./cmp-preferences-observer.js");
  const {KNOWN_CMP_REGISTRY} = await import("@website-signal-risk-scanner/shared");
  const recipe = KNOWN_CMP_REGISTRY.find(c => c.canonicalName === "TrustArc")!.preferenceCategoryInventory!;
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    for (const mode of ["unselected", "selected", "both-selected", "missing-state", "extra-choice", "transparent", "aria-hidden", "disabled"]) {
      await page.setContent(`<section id="panel"><div class="gdprAccessiblePrefPanel"><div class="categoryPanelAccessible" ${mode === "transparent" ? 'style="opacity:0"' : mode === "aria-hidden" ? 'aria-hidden="true"' : ''}>
      <div class="accessibleCategoryHeadingName"><h2>Functional Cookies</h2></div><div role="radiogroup" class="accessibleSwitch">
      <button role="radio" aria-checked="${mode === "both-selected" ? 'true' : 'false'}" ${mode === "disabled" ? 'disabled' : ''}>No</button>
      <button role="radio" ${mode === "missing-state" ? '' : `aria-checked="${["selected","both-selected"].includes(mode) ? 'true' : 'false'}"`} ${mode === "disabled" ? 'disabled' : ''}>Yes</button>
      ${mode === "extra-choice" ? '<button role="radio" aria-checked="false">Other</button>' : ''}</div></div></div></section>`);
      const raw = await readPreferenceControls(page.locator("#panel"), recipe);
      const controls = classifyControls(raw.controls);
      if (["transparent", "aria-hidden"].includes(mode)) assert.deepEqual(controls, [], mode);
      else {
        assert.equal(controls[0]?.checked, null, mode);
        assert.equal(controls[0]?.enabled, ["unselected", "selected"].includes(mode), mode);
        assert.equal(raw.controls[0]?.registeredCategory, ["unselected", "selected", "disabled"].includes(mode), mode);
      }
    }
  } finally { await browser.close(); }
});

test("Cookiebot Customize binds the original Details tab panel and never saves a choice", {timeout:20000}, async () => {
  let mode="valid",clicks=0,saves=0;
  const server=createServer((req,res)=>{
    if(req.url==="/opened"){clicks++;res.end();return;}
    if(req.url==="/save"){saves++;res.end();return;}
    res.setHeader("Content-Type","text/html");res.end(`<section id="CybotCookiebotDialog" role="region" aria-label="Cookie choices">
    <p>We use cookies</p><button id="CybotCookiebotDialogBodyLevelButtonCustomize">Customize</button>
    <a id="CybotCookiebotDialogNavDetails" role="tab" aria-controls="${mode==='wrong-controls'?'wrong':'CybotCookiebotDialogTabContentDetails'}" aria-selected="false">Details</a>
    <div id="CybotCookiebotDialogTabContentDetails" role="tabpanel" ${mode==='unnamed'?'':'aria-labelledby="CybotCookiebotDialogNavDetails"'} ${mode==='previsible'?'':'hidden'}><label><input type="checkbox">Analytics</label><button onclick="fetch('/save')">Save</button>
    <div class="CybotCookiebotDialogDetailBodyContentCookieGroup"><a class="CybotCookiebotDialogDetailBodyContentCookieProvider">Google</a><div hidden class="CybotCookiebotDialogDetailBodyContentCookieInfo"><strong class="CybotCookiebotDialogDetailBodyContentCookieInfoTitle">_ga</strong><span class="CybotCookiebotDialogDetailBodyContentCookieInfoDescription">Audience measurement</span><span class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Maximum Storage Duration</b>: 2 years</span><span class="CybotCookiebotDialogDetailBodyContentCookieInfoFooterContent"><b>Type</b>: HTTP Cookie</span></div></div></div>
    </section><script>const root=document.querySelector('section'),button=root.querySelector('button'),panel=root.querySelector('[role=tabpanel]'),tab=root.querySelector('[role=tab]');
    ${mode==='duplicate'?'button.after(button.cloneNode(true));':''}
    button.onclick=()=>{fetch('/opened');${mode==='replace-root'?'const replacement=root.cloneNode(false);root.replaceWith(replacement);replacement.append(button,panel,tab);':''}
      panel.hidden=false;${mode==='unselected'?'':'tab.setAttribute("aria-selected","true");'}
      ${mode==='replace-tab'?'tab.replaceWith(tab.cloneNode(true));':''}
    };</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  try{for(mode of ["valid","wrong-controls","duplicate","previsible","unselected","unnamed","replace-root","replace-tab"]){
    clicks=saves=0;
    const packet=await runCmpPreferencesObserver({parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:"cookiebot-"+mode,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
    assert.equal(saves,0);assert.equal(packet.action.opened,mode==="valid",JSON.stringify({mode,packet}));
    if(mode==="valid"){assert.equal(clicks,1);assert.equal(packet.inspectionDiagnostic?.surfaceBinding?.verification?.result,"verified");assert.ok(packet.controls.some(c=>c.kind==="category"));
      assert.equal(packet.loadedInventory?.records[0]?.provider,"Google");assert.equal(packet.declarations[0]?.source,"cmp_loaded_inventory");assert.equal(packet.declarationInventoryComplete,false);}
    else assert.equal(packet.controlInventoryComplete,false,mode);
  }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test("new read-only coverage policy reserves setup/retention inside 25 GB-seconds", () => {
  for (const memory of [512, 2048, 3008, 4096, 8192, 10240]) {
    const budget = cmpPreferenceBudgetMs(memory, "coverage_25_gb_seconds.v1");
    assert.ok((budget + 2000) / 1000 * memory / 1024 <= 25);
  }
});

test("expired worker capture returns a retained limited preference packet without browser work",async()=>{
 let contexts=0;const browser={newContext:async()=>{contexts++;throw Error("Should not start");}} as unknown as import('playwright').Browser;
 const packet=await runCmpPreferencesObserver({browser,deadlineAtMs:Date.now()-1,parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:"expired-worker",exactTargetUrl:"https://example.test/"}});
 assert.equal(contexts,0);assert.equal(packet.status,"limited");assert.equal(packet.action.count,0);assert.equal(packet.executionDiagnostic?.phase,"browser_start");assert.equal(packet.support.reason,"preference_budget_exhausted");
});

test("HubSpot exact external Options entrance opens its bound root without submitting preferences", {timeout:20_000}, async()=>{
  let mode="valid", clicks=0, saves=0;
  const server=createServer((req,res)=>{
    if(req.url==="/clicked"){clicks++;res.end();return;}
    if(req.url==="/save"){saves++;res.end();return;}
    res.setHeader("Content-Type","text/html");
    res.end(`<div id="hs-banner-parent"><div id="hs-eu-cookie-confirmation" hidden><button id="hs-eu-cookie-settings-button">Manage Cookies</button></div></div><footer>${mode==="form"?'<form>':''}<button type="button" id="hs-eu-cookie-settings-button" data-external>Manage Cookies</button>${mode==="duplicate"?'<button type="button" id="hs-eu-cookie-settings-button">Manage Cookies</button>':''}${mode==="form"?'</form>':''}</footer><script>document.querySelector('[data-external]').onclick=()=>{fetch('/clicked');const root=document.getElementById('hs-banner-parent');${mode==="replace"?'root.outerHTML=root.outerHTML;':''}document.getElementById('hs-banner-parent').insertAdjacentHTML('beforeend','<section id="hs-modal-content" role="alertdialog" aria-label="Cookie settings"><label><input type="checkbox">Analytics</label><button data-save>Save</button></section>');};</script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();assert.ok(address&&typeof address!=="string");
  try{for(mode of ["valid","form","duplicate","replace"]){clicks=0;saves=0;
    const packet=await runCmpPreferencesObserver({parentDispatchSha256:"a".repeat(64),config:{policyVersion:"bounded_cmp_preferences.v1",enabled:true,scanId:`external-${mode}`,exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
    assert.equal(saves,0);assert.ok(clicks<=1);
    if(mode==="valid"){assert.equal(packet.action.opened,true,JSON.stringify(packet));assert.equal(packet.controls[0]?.kind,"category");assert.equal(clicks,1);}
    else{assert.equal(packet.action.opened,false,mode);if(mode!=="replace")assert.equal(clicks,0);}
  }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});


test("unrelated deferred script cannot exhaust basic privacy-link capture on an unidentified CMP visit", { timeout: 12_000 }, async () => {
  const server = createServer((req, res) => {
    if (req.url === "/pending.js") { res.setHeader("Content-Type", "text/javascript"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end('<html><head><script defer src="/pending.js"></script></head><body><a href="/privacy">Privacy policy</a></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "pending-unrelated-script", exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
    assert.equal(packet.inspectionDiagnostic?.revision, "cmp_preferences.v17");
    assert.equal(packet.action.count, 0);
    assert.equal(packet.support.state, "unknown");
    assert.equal(packet.controlInventoryComplete, false);
    assert.equal(packet.checkpoints?.privacyLinks, true, JSON.stringify(packet));
    assert.ok(packet.privacyLinks.some(link => link.url.endsWith("/privacy")));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
