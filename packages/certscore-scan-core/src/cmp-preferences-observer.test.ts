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
