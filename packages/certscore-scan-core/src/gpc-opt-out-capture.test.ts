import assert from "node:assert/strict";
import test from "node:test";
import { HUBSPOT_GPC_MESSAGES, TRUSTARC_GPC_BRANCH_MESSAGE } from "@certscore/contracts";
import { chromium, type Page } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime.js";
import { installGpcNavigatorSignal } from "./gpc-signal-capture.js";
import { captureGpcOptOutObservation } from "./gpc-opt-out-capture.js";

test("fresh Chromium GPP readback keeps ready, stale, partial and unsupported states separate", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    const cases = ["ready", "canonical_array", "not_ready", "wrong_section", "wrong_version", "bad_core", "duplicate_callback", "async_callback", "microtask_callback", "unavailable", "non_function_api", "false_success", "gpc_echo_only", "duplicate_section", "missing_section", "conflicting_sections", "wrong_core_version"] as const;
    for (const scenario of cases) await t.test(scenario, async () => {
      const context = await browser.newContext(); await installGpcNavigatorSignal(context, true);
      await context.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><p>Public fixture</p>" }));
      const page = await context.newPage(); const started = Date.now();
      await page.goto("https://gpc-prototype.test/");
      await page.evaluate(scenario => {
        const w = window as unknown as { __gpp?: (command: string, cb: (v: unknown, success: boolean) => void) => void };
        if (scenario === "unavailable") return;
        if (scenario === "non_function_api") { (w as Record<string,unknown>).__gpp={queued:true};return; }
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
          if (scenario === "microtask_callback") { queueMicrotask(() => callback(value, true)); return; }
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
      if (scenario === "unavailable" || scenario === "non_function_api") {
        assert.equal(result.gppStatus,"unavailable");assert.equal(result.gppDiagnostics?.callbackCount,0);
        assert.deepEqual(result.gppDiagnostics?.diagnosticCodes, ["api_unavailable"]);
      }
      if (scenario === "async_callback" || scenario === "microtask_callback") {
        assert.equal(result.gppStatus, "not_ready");
        assert.equal(result.gppDiagnostics?.reason, "synchronous_ping_unavailable");
        assert.equal(result.gppDiagnostics?.callbackCount, 0);
        assert.equal(result.usca, null); assert.equal(result.usnat, null);
        assert.equal(result.stateSha256, null);
      }
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

test("exact acknowledgment text from the Saab and Wyze review is captured only as visible CMP status", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  try {
    for (const [text, id] of [
      ["The GPC signal is honored", "CybotCookiebotDialog"],
      ["Opt-Out Signal Honored", "onetrust-banner-sdk"],
    ] as const) await t.test(text, async () => {
      const context = await browser.newContext();
      try {
        await installGpcNavigatorSignal(context, true);
        await context.route("**/*", route => route.fulfill({ contentType: "text/html", body:
          `<p role="status">${text}</p><div id="${id}">
            <div role="status" hidden>${text}</div><p>${text}</p>
            <div role="status" style="position:absolute;top:10000px">${text}</div>
            <div role="status">${text} in our policy</div>
            <div aria-live="polite">${text}</div></div>` }));
        const page = await context.newPage(); const started = Date.now(); await page.goto("https://gpc-prototype.test/");
        const result = await captureGpcOptOutObservation(page, { scanId: "review-fixture", scanStartedAtMs: started });
        assert.equal(result.acknowledgment.length, 1);
        assert.equal(result.acknowledgment[0]?.scopeSelector, `#${id}`);
        assert.equal(result.acknowledgment[0]?.message, text);
        assert.equal(result.gppStatus, "unavailable");
        assert.equal(result.usca, null);
      } finally { await context.close(); }
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

test('a reviewed CMP container can itself supply live-status acknowledgment within the existing node cap',async t=>{
 const browser=await chromium.launch(chromiumLaunchOptions({headless:true}));
 try {
  for(const scenario of ['root_status','root_live','hidden_root','ordinary_root','outside_cmp','node_cap','semantic_only'] as const)await t.test(scenario,async()=>{
   const context=await browser.newContext();
   try {
    await installGpcNavigatorSignal(context,true);
    const html=`<!doctype html><div ${scenario==='outside_cmp'?'':'id="onetrust-banner-sdk"'} ${scenario==='ordinary_root'?'':scenario==='root_live'?'aria-live="polite"':'role="status"'} ${scenario==='hidden_root'?'hidden':''}>Opt-Out Request Honored${scenario==='node_cap'?'<span role="status">Opt-Out Request Honored</span>'.repeat(32):''}</div>`;
    await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
    const page=await context.newPage(),started=Date.now();await page.goto('https://gpc-root-status.test/');
    const result=await captureGpcOptOutObservation(page,{scanId:'root-status',scanStartedAtMs:started,semanticOnly:scenario==='semantic_only'});
    assert.equal(result.gppStatus,'unavailable','visible acknowledgment must never become a GPP receipt');
    assert.equal(result.usca,null);assert.equal(result.usnat,null);
    if(scenario==='node_cap'){
     assert.equal(result.acknowledgmentCaptureComplete,false);
     assert.ok(result.acknowledgment.length<=8);
     assert.ok(result.limitationKeys.includes('acknowledgment_capture_truncated'));
    }else assert.equal(result.acknowledgment.length,['root_status','root_live'].includes(scenario)?1:0);
   } finally {await context.close();}
  });
 } finally {await browser.close();}
});

test("HubSpot dedicated GPC notification requires visible SDK-scoped current-visitor wording", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({headless:true}));
  try {
    for (const scenario of ["docunlock","hubspot","hidden","offscreen","duplicate","ordinary_banner","policy","no_sdk","override","baseline"]) await t.test(scenario, async () => {
      const context = await browser.newContext({serviceWorkers:"block"});
      try {
        const wording = scenario === "policy" ? "We respect Global Privacy Control signals." : HUBSPOT_GPC_MESSAGES[Number(scenario === "hubspot")];
        const node = '<div id="hs-banner-gpc-wording">' + wording + '</div>';
        const dialog = '<div id="hs-banner-gpc" role="dialog" aria-describedby="hs-banner-gpc-wording">' + node + '</div>';
        const html = (scenario === "no_sdk" ? "" : '<script src="https://js.hs-banner.com/v2/3828814/banner.js"></script>') +
          '<div id="hs-banner-parent" ' + (scenario === "hidden" ? 'hidden' : scenario === "offscreen" ? 'style="position:absolute;top:500vh"' : '') + '>' +
          (scenario === "ordinary_banner" ? node : scenario === "duplicate" ? dialog + dialog : dialog) + '</div>';
        await context.route("**/*",route => route.fulfill(route.request().resourceType() === "script"
          ? {contentType:"application/javascript",body:"/* offline SDK request fixture */"} : {contentType:"text/html; charset=utf-8",body:html}));
        const page = await context.newPage(), started = Date.now();
        await page.goto("https://hubspot-fixture.test/" + (scenario === "override" ? "?_hsGpcSignal=TRUE" : ""));
        const sample = await captureGpcOptOutObservation(page,{scanId:"hubspot-fixture",scanStartedAtMs:started,semanticOnly:scenario === "baseline"});
        assert.deepEqual(sample.acknowledgment.map(row => row.source),["docunlock","hubspot"].includes(scenario) ? ["visible_hubspot_gpc_notification"] : []);
        assert.equal(sample.gppStatus,"unavailable");
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});


test("HubSpot applied GPC requires a ready own-data receipt from its loaded SDK", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({headless:true}));
  try {
    for (const scenario of ["applied","false","missing","pending","future","getter","override","no_sdk","baseline"]) await t.test(scenario, async () => {
      const context = await browser.newContext({serviceWorkers:"block"});
      try {
        const code = "window.hsCookieBanner={rawPerfMetrics:{bannerStartAt:0,bannerReadyAt:" +
          (scenario === "pending" ? "undefined" : scenario === "future" ? "1e9" : "1") + ",matchedBannerType:4," +
          (scenario === "getter" ? "get usesGpc(){window.getterInvoked=true;return true}" :
            scenario === "missing" ? "" : "usesGpc:" + (scenario !== "false")) + "}};";
        const html = scenario === "no_sdk" ? "<script>"+code+"</script>" :
          '<script src="https://js.hs-banner.com/v2/3828814/banner.js"></script>';
        await context.route("**/*", route => route.fulfill(route.request().resourceType() === "script"
          ? {contentType:"application/javascript",body:code} : {contentType:"text/html",body:html}));
        const page = await context.newPage(), started = Date.now();
        await page.goto("https://hubspot-fixture.test/" + (scenario === "override" ? "?_hsGpcSignal=TRUE" : ""));
        const sample = await captureGpcOptOutObservation(page,{scanId:"applied",scanStartedAtMs:started,semanticOnly:scenario === "baseline"});
        assert.equal(sample.hubspotGpcApplied,scenario === "applied" ? true : undefined);
        assert.equal(await page.evaluate("window.getterInvoked"),undefined);
        assert.deepEqual(sample.acknowledgment,[]);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});

test("TrustArc and Cookiebot dedicated slots exclude empty and hidden retained templates", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({headless:true}));
  try {
    for (const cmp of ["TrustArc", "Cookiebot"]) {
      for (const scenario of ["visible","template","hidden","policy","ambiguous","duplicate","no_sdk","outside","baseline"]) await t.test(cmp + " " + scenario, async () => {
        const context = await browser.newContext({serviceWorkers:"block"});
        try {
          const trustarc = cmp === "TrustArc";
          const wording = scenario === "template" ? (trustarc ? "" : "[#GPC_TOAST_TEXT#]") : scenario === "ambiguous" ? "Opt-Out Signal Honored" :
            scenario === "policy" ? "We honor Global Privacy Control signals." : "The GPC signal is honored";
          const slot = trustarc ? '<span id="truste-gpc-signal">'+wording+'</span>' :
            '<div class="CybotCookiebotDialogGpcContainer"><div class="CybotCookiebotDialogGpcText">'+wording+'</div></div>';
          const sdk = trustarc ? "//consent.trustarc.com/notice?domain=fixture.test" : "https://consent.cookiebot.com/uc.js";
          const content = (scenario === "no_sdk" ? "" : '<script src="'+sdk+'"></script>') +
            '<div id="'+(scenario === "outside" ? "policy-body" : trustarc ? "truste-consent-track" : "CybotCookiebotDialog")+'" '+
            (scenario === "hidden" ? 'style="display:none"' : "")+'>'+slot+(scenario === "duplicate" ? slot : "")+'</div>';
          await context.route("**/*",route => route.fulfill(route.request().resourceType() === "script" ?
            {contentType:"application/javascript",body:"/* fixture */"} : {contentType:"text/html",body:content}));
          const page = await context.newPage(), started = Date.now(); await page.goto("https://cmp-slot.test/");
          const sample = await captureGpcOptOutObservation(page,{scanId:"cmp-slot",scanStartedAtMs:started,semanticOnly:scenario === "baseline"});
          assert.deepEqual(sample.acknowledgment.map(r=>r.source),scenario === "visible" ?
            [trustarc ? "visible_trustarc_gpc_notification" : "visible_cookiebot_gpc_notification"] : []);
          assert.equal(sample.gppStatus,"unavailable");
        } finally { await context.close(); }
      });
    }
  } finally { await browser.close(); }
});

test("only the displayed TrustArc GPC branch or explicit OneTrust GPC slot supplies a readback", async t => {
  const browser = await chromium.launch(chromiumLaunchOptions({headless:true}));
  try {
    for (const cmp of ["TrustArc","OneTrust"]) for (const scenario of ["visible","hidden","ambiguous","template_state","policy","no_sdk"]) await t.test(cmp+" "+scenario, async () => {
      const context = await browser.newContext({serviceWorkers:"block"});
      try {
        const ta = cmp === "TrustArc", hidden = scenario === "hidden" ? " hidden" : "";
        const message = scenario === "policy" ? "Our policy honors GPC." : ta ? TRUSTARC_GPC_BRANCH_MESSAGE : "Opt-Out Request Honored";
        const html = (scenario === "no_sdk" ? "" : '<script src="'+(ta ? "https://consent.trustarc.com/notice?domain=fixture.test" : "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js")+'"></script>') +
          (ta ? '<div id="truste-consent-track"><div id="truste-consent-text"><p><span class="no-gpc-detected" '+
            (scenario === "ambiguous" ? "" : scenario === "template_state" ? 'style="position:absolute;top:500vh"' : "hidden")+'>Default settings</span><span class="gpc-detected"'+hidden+
            '>This site uses cookies. '+message+' Required cookies remain enabled.</span></p></div></div>' :
            '<div id="onetrust-consent-sdk"><div class="'+(scenario === "ambiguous" ? "ordinary" : scenario === "template_state" ? "ot-optout-signal ot-hide" : "ot-optout-signal")+'"'+hidden+'><span id="ot-pc-gpc-txt">'+message+'</span></div></div>');
        await context.route("**/*",route=>route.fulfill(route.request().resourceType()==="script" ? {contentType:"application/javascript",body:"/* fixture */"} : {contentType:"text/html",body:html}));
        const page=await context.newPage(), started=Date.now();await page.goto("https://cmp-branch.test/");
        const result=await captureGpcOptOutObservation(page,{scanId:"cmp-branch",scanStartedAtMs:started});
        assert.deepEqual(result.acknowledgment.map(r=>r.source),scenario==="visible" ? [ta ? "visible_trustarc_gpc_branch" : "visible_onetrust_gpc_notification"] : []);
      } finally { await context.close(); }
    });
  } finally { await browser.close(); }
});
