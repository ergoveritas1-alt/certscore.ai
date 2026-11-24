import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { chromium, type Page } from "playwright";
import { classifyConsentControlLabel, type CanonicalEvidenceBundle } from "@certscore/contracts";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { readDocumentedConsentApi } from "./documented-consent-api.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import { readRapidFirstLayerConsentUiObservation, filterAccessibilityTreeToFirstLayer, consentControlsFromAccessibilityTree, consentUiControlActionTypeFromClassification } from "./scanners/pre-consent-runtime-scanner.js";
import { bindAccessibilityNodesToDom } from "./consent-accessibility-dom-binding.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

for (const [action, nativeAx, delayed] of [
  ["accept",false,false], ["reject",false,false], ["accept",true,false], ["reject",true,false], ["reject",true,true],
] as const) {
  test(`Localhost Cookie Information ${action} binds the ${nativeAx ? "verified AX" : "rendered caption"} and rechecks the exact ARIA-labelled button${delayed ? " after a delayed banner appears" : ""}`, async t => {
    const accept = action === "accept";
    const flag = accept ? "CERTSCORE_ACCEPT_GATE_PRODUCTION_SHADOW" : "CERTSCORE_REJECT_GATE_PRODUCTION_SHADOW";
    const previous = process.env[flag];
    process.env[flag] = "1";
    t.after(() => {
      if (previous === undefined) delete process.env[flag];
      else process.env[flag] = previous;
    });
    const ariaLabel = accept ? "Accept all" : "Decline all";
    const className = accept ? "coi-banner__accept" : "coi-banner__decline";
    const buttonId = accept ? "choice" : "declineButton";
    const selector = "#" + buttonId;
    let clicks = 0;
    let visits = 0;
    const server = createServer((request, response) => {
      if (request.url === "/click" && request.method === "POST") {
        clicks++;
        response.writeHead(204).end();
        return;
      }
      if (request.url === "/hold.js") {
        if (request.headers["x-fixture-passive"] === "1") {
          response.writeHead(200, {"content-type": "text/javascript"}).end("");
        }
        return;
      }
      if (request.url !== "/" || request.method !== "GET") {
        response.writeHead(404).end();
        return;
      }
      visits++;
      const delayBanner = delayed && request.headers["x-fixture-passive"] !== "1";
      response.writeHead(200, {"content-type": "text/html"}).end(`<!doctype html>
          <div id="coiOverlay" role="banner" style="padding: 24px${delayBanner ? "; visibility: hidden" : ""}"><div id="coi-banner-wrapper" class="coi-banner__wrapper" style="width: 420px"
              role="dialog" aria-modal="true" aria-label="Cookie preferences">
          <p>We use optional cookies to measure website performance.</p>
          <button id="${buttonId}" class="${className}" aria-label="${ariaLabel}">${ariaLabel.toUpperCase()}</button>
          </div></div><aside id="cookie-information-help" hidden>Cookie information</aside><script>
          window.cicl=['cookie_cat_necessary','cookie_cat_functional'];
          window.cicc={cookie_cat_necessary:true};
          window.CookieInformation={getConsentGivenFor:key=>window.cicc[key]};
          document.addEventListener('click',e=>{if(e.target.id==='${buttonId}' && e.isTrusted){
            fetch('/click',{method:'POST'});
            window.cicc.cookie_cat_functional=${accept};
            document.querySelector('#coiOverlay').remove();
            dispatchEvent(new Event('CookieInformationConsentGiven'));
          }});
          ${delayBanner ? 'setTimeout(() => {document.querySelector("#coiOverlay").style.visibility = "visible"}, 100);' : ""}
          </script>${accept || delayed ? "" : '<script defer src="/hold.js"></script>'}`);
    });
    t.after(() => {
      server.closeAllConnections();
      return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const browser = await chromium.launch({
      args:["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    });
    t.after(() => browser.close());
    let page: Page;
    let contexts = 0;
    const newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (options: Parameters<typeof newContext>[0]) => {
      const passiveCapture = ++contexts === 1;
      const context = await newContext({...options, serviceWorkers:"block",
        extraHTTPHeaders:{...options?.extraHTTPHeaders, ...(passiveCapture ? {"x-fixture-passive":"1"} : {})}});
      context.on("page", opened => {page = opened;});
      await context.route("**/*", route => new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue() : route.abort());
      return context;
    });
    const passive = await browser.newContext();
    const capturedPage = await passive.newPage();
    await capturedPage.goto(url);
    const client = await passive.newCDPSession(capturedPage);
    const documentIdentity = {source:"cdp_loader_id" as const, token:(await client.send("Page.getFrameTree")).frameTree.frame.loaderId};
    const observation = await readRapidFirstLayerConsentUiObservation(capturedPage, Date.now(), 1500);
    const geometry = await capturePassiveConsentControlGeometry(capturedPage, {documentIdentity, timeoutMs:1500});
    const axTree = nativeAx ? await client.send("Accessibility.getFullAXTree") : undefined;
    const axNodes = axTree ? await filterAccessibilityTreeToFirstLayer(client, axTree.nodes, capturedPage.viewportSize()) : [];
    const axControls = nativeAx ? consentControlsFromAccessibilityTree(
      await bindAccessibilityNodesToDom(client, axNodes, {url, identity:documentIdentity}),url).controls : [];
    await passive.close();
    const candidate = geometry.candidates.find(row => row.selectorHint === selector);
    assert.equal(candidate?.label, ariaLabel.toUpperCase());
    assert.equal(candidate.ariaLabel, ariaLabel);
    assert.equal(candidate.containerSelectorHint, "#coi-banner-wrapper");
    assert.ok(observation.controls.some(row => row.selectorHint === selector));
    // The retained Appodeal inventory used the rendered caption for this selector.
    const controls = nativeAx ? axControls.filter(row => row.domBinding?.verifiedButtonSelector === selector).flatMap(row => {
      const actionType = consentUiControlActionTypeFromClassification(classifyConsentControlLabel({
        label: row.label, linkRole: row.role, contextText: row.nearbyConsentText, hasConsentContext: true,
      }));
      return actionType ? [{...row, actionType}] : [];
    }) :
      observation.controls.map(row => row.selectorHint === selector ? {...row,label:candidate.label} : row);
    if (nativeAx) assert.equal(controls.length,1);
    const scanId = `cookie-information-${action}`;
    const bundle = {
      url, scanId, domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
      consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
      consentUiObservations:[{...observation,controls,documentIdentity,documentUrl:url,captureDiagnostics:{
        ...observation.captureDiagnostics,completedChannels:[...observation.captureDiagnostics!.completedChannels,"geometry"]}}],
    } as CanonicalEvidenceBundle;
    const parentDispatchSha256 = hash(scanId);
    for (const replacement of [false,true]) {
      const bytes = Buffer.from(JSON.stringify(geometry));
      const nowMs = Date.now();
      const proofInput = {bundle,scanId,targetUrl:url,parentDispatchSha256,sourceSha256:hash(JSON.stringify(bundle)),nowMs,
        deadlineAtMs:nowMs+6000,requireExactSelector:true,geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}};
      if (nativeAx && !replacement) {
        const qualifies = (input: typeof proofInput) => accept ? deriveAcceptFirstLayerProof(input) :
          readRejectFirstLayerProof({...evaluateRejectGate(input),scanId});
        const withoutExactBinding = bundle.consentUiObservations.map(row => ({...row, controls: row.controls.map(control => {
          const {verifiedButtonSelector: _selector, ...binding} = control.domBinding!;
          return {...control, domBinding:{...binding, version:"ax_backend_dom_binding.v1" as const}};
        })}));
        assert.equal(qualifies({...proofInput,bundle:{...bundle,consentUiObservations:withoutExactBinding}}), undefined);
        const otherLoader = {...documentIdentity, token: documentIdentity.token + "-different"};
        const wrongSnapshot = bundle.domSnapshots.map(row => ({...row, documentIdentity:otherLoader}));
        assert.equal(qualifies({...proofInput,bundle:{...bundle,domSnapshots:wrongSnapshot}}), undefined);
      }
      if (!replacement) {
        const qualifies = (input: typeof proofInput) => accept ? deriveAcceptFirstLayerProof(input) :
          readRejectFirstLayerProof({...evaluateRejectGate(input),scanId});
        const row = bundle.consentUiObservations[0]!;
        const repeated = { ...row, observedAtMs: row.observedAtMs + 1 };
        assert.ok(qualifies({...proofInput,bundle:{...bundle,consentUiObservations:[row,repeated]}}));
        assert.equal(qualifies({...proofInput,bundle:{...bundle,consentUiObservations:[
          {...row,controls:[...row.controls,...row.controls]},
        ]}}),undefined);
        const competing = {...repeated,controls:repeated.controls.map(x=>({...x,selectorHint:"#replacement"}))};
        assert.equal(qualifies({...proofInput,bundle:{...bundle,consentUiObservations:[row,competing]}}),undefined);
        if (!accept) {
          const startedAt = new Date(nowMs - 1000).toISOString();
          const inventory = {...row, observedAtMs:500, inventoryOutcome:"complete_with_controls" as const,
            captureDiagnostics:{completedChannels:["dom_inventory","accessibility_tree"] as ("dom_inventory" | "accessibility_tree")[],
              failedChannels:[],timedOutChannels:[]}};
          const read = (elapsed: number, additional = inventory) => {
            const retained = Buffer.from(JSON.stringify({...geometry,capturedAt:new Date(nowMs-1000+elapsed).toISOString()}));
            return qualifies({...proofInput, bundle:{...bundle,startedAt,consentUiObservations:[additional]},
              geometry:{bytes:retained,sha256:hash(retained),sizeBytes:retained.length}});
          };
          assert.ok(read(600));
          assert.equal(read(499),undefined);
          assert.equal(read(1001),undefined);
          assert.equal(read(600,{...inventory,basis:[...inventory.basis,"geometry:checkpoint_precedes_latest_inventory"]}),undefined);
        }
      }
      const checks: string[] = [];
      const exactClickReceipts: Array<{ dispatchedAtMs: number; completedAtMs: number }> = [];
      let replaced: Promise<void> | undefined;
      let readinessAtDispatch: Promise<string> | undefined;
      const baselineClicks = clicks;
      const options = {
        browser,url,scanId,parentScanId:scanId,
        interactionAuthorization:{kind:"loopback" as const,authorizationId:"loopback_local_lab" as const},
        actionSearchTimeoutMs:2500,resultBudgetMs:6500,confirmationTimeoutMs:400,observationWindowMs:300,
        onLifecycleEvent:() => {
          if (!accept && !readinessAtDispatch) readinessAtDispatch = page.evaluate(() => document.readyState);
          if (replacement && !replaced) replaced = page.locator(selector).evaluate(button => button.replaceWith(button.cloneNode(true)));
        },
      };
      const packet = await (async () => {
        if (accept) {
          const recipe = buildCanonicalPostAcceptActionRecipes().find(row => row.cmpId === "Cookie Information");
          let blockReason: string | undefined;
          const proof = deriveAcceptFirstLayerProof({...proofInput, onDecision: decision => {
            if (decision.outcome === "blocked") blockReason = decision.reason;
          }});
          assert.ok(recipe && proof, blockReason);
          assert.equal(proof.labelSource, "aria_label");
          assert.equal(proof.labelSha256, hash(ariaLabel));
          assert.equal(proof.expiresAtMs - proof.issuedAtMs, 6000);
          return runPostAcceptObserver({...options,recipe,firstLayerProof:proof,
            onAcceptGateFinalRecheck:value=>checks.push(value),
            onExactAcceptClickCompleted:event=>exactClickReceipts.push(event),
          });
        }
        const recipe = buildCanonicalPostRefusalActionRecipes().find(row => row.cmpId === "Cookie Information");
        const decision = evaluateRejectGate(proofInput);
        const proof = readRejectFirstLayerProof({...decision,scanId});
        assert.ok(recipe && proof, decision.outcome === "blocked" ? decision.reason : undefined);
        assert.equal(proof.binding.labelSource, "aria_label");
        assert.equal(proof.binding.labelSha256, hash(ariaLabel));
        assert.equal(proof.expiresAtMs - proof.issuedAtMs, 6000);
        return runPostRefusalObserver({...options, recipe, firstLayerProof:proof,
          onRejectGateFinalRecheck:value=>checks.push(value),
          onExactRejectClickCompleted: event => exactClickReceipts.push(event),
        });
      })();
      await replaced;
      if (!accept) assert.equal(await readinessAtDispatch, delayed ? "complete" : "interactive");
      if (delayed) {
        assert.ok(packet.interactionDiagnostics?.resolver?.snapshots.some(row => row.source === "control_proof"));
        assert.ok(packet.interactionDiagnostics?.resolver?.snapshots.every(row => row.source === "control_proof"));
      }
      assert.deepEqual(checks,[replacement ? "failed" : "passed"],JSON.stringify(packet.limitations));
      assert.equal(packet.interactionDiagnostics?.click.outcome,replacement ? "not_attempted" : "completed");
      assert.equal(clicks-baselineClicks,replacement ? 0 : 1);
      assert.equal(exactClickReceipts.length, replacement ? 0 : 1);
      if (exactClickReceipts[0]) {
        assert.ok(exactClickReceipts[0].dispatchedAtMs >= nowMs);
        assert.ok(exactClickReceipts[0].completedAtMs >= exactClickReceipts[0].dispatchedAtMs);
      }
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      if (!replacement) {
        assert.ok(registration.actionDispatchedAtMs! < 6000);
        assert.equal(registration.status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
        assert.ok(registration.witnesses.some(witness=>witness.witnessType==="cmp_api_state" && witness.key==="cookie_information"));
      }
    }
    assert.equal(visits,3,"One real localhost capture and two independent action visits");
    assert.equal(clicks,1,"Only the expected original button completed a trusted local click");
  });
}

test("Cookie Information SDK state must follow a trusted click on the original owning button", async t => {
  const browser = await chromium.launch({args:["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  await page.setContent(`
    <div id="coiOverlay"><button id="choice">Accept all</button></div>
    <div id="cookie-information-help"><button id="other">Accept all</button></div>
    <script>
      window.cicl=['cookie_cat_necessary','cookie_cat_functional'];
      window.cicc={cookie_cat_necessary:true};
      window.CookieInformation={getConsentGivenFor:key=>window.cicc[key]};
      document.addEventListener('click',event=>{
        if(event.target.id==='choice') document.querySelector('#coiOverlay').remove();
        window.cicc.cookie_cat_functional=true;
        dispatchEvent(new Event('CookieInformationConsentGiven'));
      });
    </script>`);
  const read = (actionDispatchedAtEpochMs: number) =>
    readDocumentedConsentApi(page, "cookie_information", undefined, {actionDispatchedAtEpochMs});
  const choice = page.locator("#choice");
  const other = page.locator("#other");
  assert.equal(await readDocumentedConsentApi(page, "cookie_information", undefined, {control:other}), undefined);
  const baseline = await readDocumentedConsentApi(page, "cookie_information", undefined, {control:choice});
  assert.equal(baseline?.eventSequence, 0);
  const dispatchTime = Date.now();
  await other.click();
  assert.equal(await read(dispatchTime), undefined);
  await choice.evaluate(button => button.dispatchEvent(new MouseEvent("click", {bubbles:true})));
  assert.equal(await read(dispatchTime), undefined);
  // The synthetic click removed the original owner. A new matching node cannot inherit the binding.
  await page.locator("body").evaluate(body => body.insertAdjacentHTML("afterbegin", '<div id="coiOverlay"><button id="choice">Accept all</button></div>'));
  await choice.click();
  assert.equal(await read(dispatchTime), undefined);
  await page.evaluate(() => document.body.insertAdjacentHTML("afterbegin",
    '<div id="coiOverlay"><button id="choice">Accept all</button></div><div id="coiOverlay"></div>'));
  const reasons: string[] = [];
  assert.equal(await readDocumentedConsentApi(page, "cookie_information", reason => reasons.push(reason), {control:choice}), undefined);
  assert.deepEqual(reasons, ["receipt_ambiguous"]);
});
