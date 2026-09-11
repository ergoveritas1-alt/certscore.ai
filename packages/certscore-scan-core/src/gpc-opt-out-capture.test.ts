import assert from "node:assert/strict";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime.js";
import { installGpcNavigatorSignal } from "./gpc-signal-capture.js";
import { captureGpcOptOutObservation } from "./gpc-opt-out-capture.js";

test("fresh Chromium GPP readback keeps ready, stale, partial and unsupported states separate", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    const cases = ["ready", "canonical_array", "not_ready", "wrong_section", "wrong_version", "bad_core", "duplicate_callback", "async_callback", "unavailable", "false_success", "gpc_echo_only", "duplicate_section", "missing_section", "conflicting_sections", "wrong_core_version"] as const;
    for (const scenario of cases) await t.test(scenario, async () => {
      const context = await browser.newContext(); await installGpcNavigatorSignal(context, true);
      await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Public fixture</p>" }));
      const page = await context.newPage(); const started = Date.now();
      await page.goto("https://gpc-prototype.test/");
      await page.evaluate(scenario => {
        const w = window as unknown as { __gpp?: (command: string, cb: (v: unknown, success: boolean) => void) => void };
        if (scenario === "unavailable") return;
        w.__gpp = (command, callback) => {
          if (command !== "ping") throw Error("Only passive ping is authorized");
          const value = { gppVersion: scenario === "wrong_version" ? "1.0" : "1.1", cmpStatus: "loaded",
            signalStatus: scenario === "not_ready" ? "not ready" : "ready", sectionList: scenario === "duplicate_section" ? [8, 8] : scenario === "missing_section" ? [] : [8],
            applicableSections: scenario === "wrong_section" ? [7] : [8], gppString: "PRIVATE_GPP_MUST_NOT_BE_RETAINED",
            parsedSections: { usca: scenario === "gpc_echo_only" ? [{ SubsectionType: 1, Gpc: true }] :
              [{ Version: scenario === "wrong_core_version" ? 2 : 1, SaleOptOutNotice: 1, SharingOptOutNotice: 1,
                SaleOptOut: scenario === "bad_core" ? "1" : 1, SharingOptOut: 1 }, { [scenario === "canonical_array" ? "GpcSegmentType" : "SubsectionType"]: 1, Gpc: true }] } };
          if (scenario === "conflicting_sections") value.parsedSections.usca.push({ Version: 1, SaleOptOutNotice: 1, SharingOptOutNotice: 1, SaleOptOut: 2, SharingOptOut: 2 });
          if (scenario === "async_callback") { setTimeout(() => callback(value, true), 10); return; }
          callback(value, scenario !== "false_success");
          if (scenario === "duplicate_callback") callback(value, true);
        };
      }, scenario);
      const result = await captureGpcOptOutObservation(page, { scanId: "fresh-fixture", scanStartedAtMs: started });
      assert.equal(result.gppStatus === "observed", scenario === "ready" || scenario === "canonical_array");
      assert.equal(result.navigatorGpc, true);
      assert.ok(result.capturedAtMs >= result.documentStartedAtMs);
      if (scenario === "not_ready") assert.deepEqual(result.gppDiagnostics?.diagnosticCodes, ["signal_status_not_ready"]);
      if (scenario === "wrong_version") assert.deepEqual(result.gppDiagnostics?.diagnosticCodes, ["gpp_version_unsupported"]);
      if (scenario === "unavailable") assert.deepEqual(result.gppDiagnostics?.diagnosticCodes, ["api_unavailable"]);
      assert.ok((result.gppDiagnostics?.diagnosticCodes ?? []).every(code => /^[a-z0-9_]+$/.test(code)));
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE_GPP|gppString/);
      assert.deepEqual(result.acknowledgment, []);
      await context.close();
    });
  } finally { await browser.close(); }
});

test("fresh acknowledgment capture requires visible current-status wording inside a canonical CMP scope", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    for (const scenario of ["live", "hidden", "policy_text", "receipt", "promise", "outside_cmp", "ordinary_paragraph"] as const) await t.test(scenario, async () => {
      const context = await browser.newContext(); await installGpcNavigatorSignal(context, true);
      const text = scenario === "receipt" ? "Your request was received" : scenario === "promise" ? "We honor Global Privacy Control" : "Opt-Out Request Honored";
      const html = `<div ${scenario === "outside_cmp" ? "" : 'id="onetrust-banner-sdk"'}><div ${scenario === "hidden" ? 'style="display:none"' : ""} ${scenario === "policy_text" || scenario === "ordinary_paragraph" ? "" : 'role="status"'}>${text}</div></div>`;
      await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: html }));
      const page = await context.newPage(); const started = Date.now(); await page.goto("https://gpc-prototype.test/");
      const result = await captureGpcOptOutObservation(page, { scanId: "fresh-status", scanStartedAtMs: started });
      assert.equal(result.acknowledgment.length, scenario === "live" ? 1 : 0);
      assert.equal(result.gppStatus, "unavailable", "a displayed acknowledgment never becomes semantic registration");
      await context.close();
    });
  } finally { await browser.close(); }
});

test("same-URL document replacement during readback invalidates the browser-native binding", async () => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    const context = await browser.newContext(); await installGpcNavigatorSignal(context, true);
    await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Reload fixture</p>" }));
    const page = await context.newPage(), session = await context.newCDPSession(page);
    await session.send("Page.enable");
    let token: string | undefined;
    session.on("Page.frameNavigated", event => { if (!event.frame.parentId) token = event.frame.loaderId; });
    const started = Date.now(); await page.goto("https://gpc-prototype.test/");
    const firstToken = token; assert.ok(firstToken);
    const replacingPage = { url: () => page.url(), evaluate: async (fn: any, arg: any) => {
      const result = await page.evaluate(fn, arg); await page.reload(); return result;
    } } as unknown as Page;
    const result = await captureGpcOptOutObservation(replacingPage, { scanId: "reload", scanStartedAtMs: started,
      binding: { captureId: "1a111111-1111-4111-8111-111111111111", documentIdentity: () => token ? { source: "cdp_loader_id", token } : undefined } });
    assert.notEqual(token, firstToken);
    assert.equal(result.captureBinding, null);
    assert.ok(result.limitationKeys.includes("semantic_document_identity_unverified"));
  } finally { await browser.close(); }
});
