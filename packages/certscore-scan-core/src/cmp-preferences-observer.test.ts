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
    res.end(`<section id="${scope}"><button id="options" type="button" aria-controls="prefs">Manage options</button>${mode === "ambiguous" ? '<button type="button" aria-controls="prefs">Cookie settings</button>' : ''}<div id="prefs" hidden>${toggle}${mode === "hidden" ? '<button aria-expanded="false">Vendors</button>' : ''}</div></section>${mode === "cross-vendor" ? '<section id="CybotCookiebotDialog"><button aria-controls="prefs">Cookie settings</button></section>' : ''}${mode === "scope-overflow" ? '<div class="brlbs-cmpnt-dialog-box-entrance"></div>'.repeat(1001) : ''}<script>options.onclick=()=>{fetch('/clicked');prefs.hidden=false;};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["ambiguous", "cross-vendor", "scope-overflow", "unknown", "hidden", "services"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      if (["ambiguous", "cross-vendor", "scope-overflow", "unknown"].includes(mode)) { assert.equal(clicks, 0); assert.equal(packet.action.count, 0); assert.equal(packet.controlInventoryComplete, false); }
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
        assert.equal(packet.support.reason, "preference_budget_exhausted"); assert.equal(packet.controls[0]?.kind, "category");
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
        assert.equal(packet.support.recipeVersion, "onetrust_preferences.v2");
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
  const server = createServer((req, res) => {
    if (req.url === "/options") { clicks++; res.end(); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<section id="onetrust-banner-sdk"><button aria-controls="prefs" onclick="fetch('/options');document.getElementById('prefs').hidden=false">Cookie settings</button><a href="/privacy-cookies/" aria-label="Privacy and cookie statement">Read notice</a></section>
      ${mode === "open" ? '<section id="prefs" hidden><label><input style="display:none" type="checkbox">Analytics</label><label><input style="opacity:0;width:0;height:0" type="checkbox">Marketing</label><fieldset disabled><label><input style="display:none" type="checkbox">Disabled category</label></fieldset><div hidden><label><input type="checkbox">Hidden category</label></div><details><summary>More cookies</summary><table><tr><td>not_opened</td></tr></table></details></section>' : ''}
      <script>window.OneTrust={GetDomainData:()=>({Groups:[{CustomGroupId:'C2',GroupName:'Analytics',FirstPartyCookies:[{Name:'_ga',Description:'Audience measurement',Lifespan:'2 years'}]}]})};</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    for (mode of ["open", "missing_panel"]) {
      clicks = 0;
      const packet = await runCmpPreferencesObserver({ parentDispatchSha256: "a".repeat(64), config: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: mode, exactTargetUrl: `http://127.0.0.1:${address.port}/` } });
      assert.deepEqual(packet.declarations.map(cookie => cookie.name), ["_ga"]);
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
