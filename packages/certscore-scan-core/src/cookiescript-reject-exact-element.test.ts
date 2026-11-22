import { createFinalConsentGeometryRefresh } from "./consent-final-geometry-refresh.js";
import dns from "node:dns/promises";
import { bindAccessibilityNodesToDom, passiveButtonSelectorMatches } from "./consent-accessibility-dom-binding.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium, type Page } from "playwright";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { deriveAcceptFirstLayerProof } from "./accept-first-layer-gate.js";
import { runPostAcceptObserver } from "./post-accept-observer.js";
import { buildCanonicalPostAcceptActionRecipes } from "./post-accept-cmp-recipes.js";
import { COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR, COOKIE_SCRIPT_REJECT_ROLE_SELECTOR } from "./cookiescript-reject-selector.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { consentControlsFromAccessibilityTree, filterAccessibilityTreeToFirstLayer, readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
for (const [action, scenario] of [
  ["accept", "direct DOM"], ["reject", "direct DOM"], ["accept", "redirected AX"], ["reject", "redirected AX"],
  ["accept", "Italian banner AX"],
  ["accept", "reload"], ["reject", "reload"],
  ["accept", "reload with replacement cookie"], ["reject", "reload without registration"],
  ["reject", "reload to a different path"],
  ["accept", "reload after interactive capture"], ["reject", "reload after interactive capture"],
  ["accept", "reload while DOMContentLoaded is pending"],
] as const) test(`CookieScript ${action} ${scenario} binds the original and blocks an identical replacement at dispatch`, async t => {
  const redirected = scenario === "redirected AX";
  const italian = scenario === "Italian banner AX";
  const reload = scenario.startsWith("reload");
  const interactive = scenario === "reload after interactive capture";
  const pendingDcl = scenario === "reload while DOMContentLoaded is pending";
  const changedOnReload = scenario === "reload with replacement cookie";
  const leavesPath = scenario === "reload to a different path";
  const publishState = scenario !== "reload without registration";
  const requestedUrl = redirected ? "https://moodmedia.com/" : "https://cookiescript-fixture.example/";
  const url = redirected ? "https://us.moodmedia.com/?utm_source=MoodMedia&utm_medium=redirect&utm_campaign=moodmedia_com" : requestedUrl;
  if (redirected) t.mock.method(dns,"lookup", async (hostname: string) => {
    assert.equal(hostname,"us.moodmedia.com");
    return [{address:"93.184.216.34",family:4}];
  });
  const accept = action === "accept";
  const id = "cookiescript_" + action;
  const label = italian ? "Accetta tutto" : accept ? "Accept All" : "Decline All";
  const exact = accept ? "exactCookieScriptAcceptVerified" : "exactCookieScriptRejectVerified";
  // The retained Italian banner put a language picker and flag styles before the notice.
  const notice = italian || interactive
    ? `<div hidden>${"<span>Italian</span>".repeat(165)}</div>
       <div id="cookiescript_description">Questo sito web utilizza cookie. Utilizziamo i cookie per personalizzare contenuti.</div>`
    : "<p>We use cookies to measure website performance.</p>";
  const html = `<!doctype html><section id="cookiescript_injected" role="dialog" aria-label="Cookie preferences"
 style="position:fixed;background:white;padding:20px">${notice}
 <div id="${id}" role="button" tabindex="0" style="text-transform:uppercase">${label}</div></section>
 ${interactive ? '<img src="/hold-load.svg" alt="">' : ''}
 ${pendingDcl ? '<script defer src="/hold-dcl.js"></script>' : ''}
 <script>let state;
 window.CookieScript = {instance:{categories:()=>['performance','targeting'],currentState:()=>state}};
 document.addEventListener('click', e => {if(e.target.id === '${id}') {
   fetch('/clicked');
   ${reload ? `document.cookie = 'CookieScriptConsent=fixture-${action}; Path=/; Secure';
     setTimeout(() => ${leavesPath ? "location.assign('/different')" : "location.reload()"}, ${publishState ? 450 : 150});` : ''}
   ${publishState ? `state={action:'${action}',categories:${JSON.stringify(accept ? ["strict","performance","targeting"] : ["strict"])}};
   window.dispatchEvent(new Event('${accept ? "CookieScriptAcceptAll" : "CookieScriptReject"}'));` : ''} document.querySelector('section').hidden=true;
 }});</script>`;

  for (const flag of ["CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE","CERTSCORE_REJECT_GATE_PRODUCTION_ENFORCE"]) {
    const previous = process.env[flag];
    process.env[flag] = "1";
    t.after(() => {if (previous === undefined) delete process.env[flag]; else process.env[flag] = previous;});
  }
  const browser = await chromium.launch({args:["--disable-background-networking","--no-proxy-server","--host-resolver-rules=MAP * ~NOTFOUND"]});
  t.after(() => browser.close());
  const newContext = browser.newContext.bind(browser);
  let workerPage: Page;
  let clicks = 0;
  let contexts = 0;
  let releaseLoad!: () => void;
  const loadReleased = new Promise<void>(resolve => {releaseLoad = resolve;});
  t.after(releaseLoad);
  t.mock.method(browser, "newContext", async (options: Parameters<typeof newContext>[0]) => {
    const context = await newContext({...options, serviceWorkers:"block"});
    const captureContext = ++contexts === 1;
    context.on("page", page => {workerPage = page;});
    await context.route("**/*", async route => {
      if (redirected && route.request().url() === requestedUrl) return route.fulfill({contentType:"text/html",
        body:`<script>setTimeout(() => location.replace(${JSON.stringify(url)}),1650)</script>`});
      if (route.request().url() === url) {
        const sent = await route.request().headerValue("cookie");
        if (reload && sent?.includes("CookieScriptConsent=fixture-"+action)) {
          return route.fulfill({contentType:"text/html",body:"<p>The reloaded document</p>",
            headers:changedOnReload ? {"Set-Cookie":"CookieScriptConsent=changed; Path=/; Secure"} : {}});
        }
        return route.fulfill({contentType:"text/html",body:html});
      }
      if (pendingDcl && route.request().url() === new URL("/hold-dcl.js",url).href) {
        // The passive fixture finishes loading. Every action worker must
        // find the exact control while its own DOMContentLoaded is pending.
        if (captureContext) return route.fulfill({contentType:"text/javascript",body:""});
        return;
      }
      if (interactive && route.request().url() === new URL("/hold-load.svg",url).href) {
        if (captureContext) await loadReleased;
        return route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg"/>'});
      }
      if (leavesPath && route.request().url() === new URL("/different",url).href)
        return route.fulfill({contentType:"text/html",body:"<p>A different document</p>"});
      if (route.request().url() === new URL("/clicked",url).href) {clicks++; return route.fulfill({status:204});}
      return route.abort();
    });
    return context;
  });
  const page = await (await browser.newContext()).newPage();
  await page.goto(url, {waitUntil: interactive ? "domcontentloaded" : "load"});
  const cdp = await page.context().newCDPSession(page);
  const loader = async () => (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId;
  const documentIdentity = {source:"cdp_loader_id" as const,token:await loader()};
  const capture = () => capturePassiveConsentControlGeometry(page,{documentIdentity,timeoutMs:1500});
  const scanStartedAtMs = Date.now();
  const observation = await readRapidFirstLayerConsentUiObservation(page, scanStartedAtMs, 1500);
  let geometry = await capture();
  if (interactive) {
    const prior = geometry.controlInspection!;
    assert.equal(prior.structuralCoverage,"limited");
    assert.equal(prior.captureCoverage.documentReadyState,"interactive");
    assert.equal(geometry.candidates.find(c => c.selectorHint === "#"+id)?.consentContextConfirmed,true);
    let waited = 0, captures = 0, frameRevision = 0;
    page.on("framenavigated", () => {frameRevision++;});
    const refresh = createFinalConsentGeometryRefresh({
      scanStartedAtMs, moduleDeadlineAtMs:Date.now()+2300,
      readState:() => ({url:page.url(),documentIdentity,frameRevision,frames:page.frames()}),
      waitForDocumentComplete: async timeout => {
        waited++;
        assert.ok(timeout > 0 && timeout <= 650);
        releaseLoad();
        await page.waitForLoadState("load",{timeout});
      },
      capture: options => {
        captures++;
        return capturePassiveConsentControlGeometry(page, options);
      },
      prepare: async () => ({commitIfCurrent: current => current() ? "canonical.json" : undefined, dispose() {}}),
    });
    const outcome = await refresh({
      observation:{...observation,documentIdentity,documentUrl:url},geometry,
      screenshot:{artifactId:"retained",path:"proof.png",url,documentIdentity,capturedAtMs:0,
        captureMethod:"primary_viewport_fallback",pagePhase:"dom_content_loaded",consentStateAtTime:"pre_consent"},
    });
    assert.equal(outcome.outcome,"retained",JSON.stringify(outcome));
    assert.equal(outcome.geometry?.controlInspection?.captureCoverage.documentReadyState,"complete");
    assert.equal(waited,1);
    assert.equal(captures,1);
    geometry=outcome.geometry!;
  }
  assert.equal(await loader(), documentIdentity.token);
  if (italian || interactive) {
    const contextProved = async () => (await capture()).candidates.find(c => c.selectorHint === "#"+id)?.consentContextConfirmed;
    assert.equal(geometry.candidates.find(c => c.selectorHint === "#"+id)?.consentContextConfirmed,true);
    const description = page.locator("#cookiescript_description");
    await description.evaluate(el => {el.hidden = true;});
    assert.equal(await contextProved(),false);
    await description.evaluate(el => {el.hidden = false; el.after(el.cloneNode(true));});
    assert.equal(await contextProved(),false);
    await description.last().evaluate(el => el.remove());
    await description.evaluate(el => document.body.appendChild(el));
    assert.equal(await contextProved(),false);
    await description.evaluate(el => document.querySelector("section")!.appendChild(el));
  }
  const button = page.locator("#"+id);
  const {nodes} = await cdp.send("Accessibility.getFullAXTree");
  const visible = await filterAccessibilityTreeToFirstLayer(cdp,nodes,page.viewportSize());
  const axControls = async () => consentControlsFromAccessibilityTree(await bindAccessibilityNodesToDom(cdp,visible,{url,identity:documentIdentity}),url).controls;
  const ax = (await axControls()).find(c => c.role === "button")!;
  assert.equal(ax.domBinding?.version,"ax_backend_dom_binding.v4");
  assert.ok(passiveButtonSelectorMatches(ax,"#"+id,action,url,documentIdentity.token));
  assert.ok(!passiveButtonSelectorMatches(ax,"#"+id,action,url,"other-loader"));
  assert.ok(!passiveButtonSelectorMatches(ax,"#"+id,accept ? "reject" : "accept",url,documentIdentity.token));
  await button.evaluate(el => el.after(el.cloneNode(true)));
  assert.ok(!(await axControls()).some(c=>c.domBinding?.verifiedButtonSelector));
  assert.ok(!(await capture()).candidates.some(c => c[exact]));
  await button.last().evaluate(el => el.remove());
  await button.evaluate(el => document.body.appendChild(el));
  assert.ok(!(await capture()).candidates.some(c => c[exact]));
  const scanId = "cookiescript-role-fixture";
  const bundle = {url:requestedUrl,scanId,domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
    consentUiObservations:[{...observation,documentIdentity,documentUrl:url,captureDiagnostics:{
      ...observation.captureDiagnostics,completedChannels:[...observation.captureDiagnostics!.completedChannels,"geometry"]}}]} as CanonicalEvidenceBundle;
  const candidate = geometry.candidates.find(c => c[exact])!;
  assert.equal(candidate.label,label.toUpperCase());
  assert.equal(candidate.cookieScriptUppercaseSourceLabel,label);
  assert.equal(observation.controls.find(c => c.actionType === (accept ? "accept_all" : "reject_all"))?.label, label);
  const proofInput = () => {
    const bytes = Buffer.from(JSON.stringify(geometry));
    return {bundle,scanId,targetUrl:requestedUrl,sourceSha256:hash(JSON.stringify(bundle)),parentDispatchSha256:hash(scanId),
      nowMs:Date.now(),deadlineAtMs:Date.now()+6000,requireExactSelector:true,geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}};
  };
  delete candidate.cookieScriptUppercaseSourceLabel;
  if (accept) assert.equal(deriveAcceptFirstLayerProof(proofInput()),undefined);
  else assert.equal(evaluateRejectGate(proofInput()).outcome,"blocked");
  candidate.cookieScriptUppercaseSourceLabel = label;
  if (redirected || italian) {
    const classified = observation.controls.find(c => c.selectorHint === ax.domBinding?.verifiedButtonSelector)!;
    assert.ok(ax.classifierReasonCodes?.includes("matched_"+action));
    bundle.consentUiObservations[0]!.controls = [{...ax,actionType:classified.actionType}];
  }
  const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
  const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
  for (const replace of [false,true]) {
    const before = clicks;
    const checks: string[] = [];
    let replacement: Promise<void> | undefined;
    const common = {browser,url:requestedUrl,scanId,parentScanId:scanId,
      interactionAuthorization:redirected ? {kind:"scan_target_resolution" as const,requestedUrl,scanId,
        authorizationId:"sharded_scan_resolved_exact_target.v2" as const,maxRedirects:8,resolutionTimeoutMs:5000} : {kind:"scan_target" as const,normalizedUrl:url,scanId,authorizationId:"sharded_scan_exact_target.v1" as const},
      actionSearchTimeoutMs:pendingDcl ? 8000 : 1800,resultBudgetMs:pendingDcl ? 10500 : 7000,confirmationTimeoutMs:reload ? 900 : 300,observationWindowMs:reload ? 1500 : 300,
      onLifecycleEvent:() => {if (replace && !replacement) replacement = workerPage.evaluate(id => {
        const node = document.getElementById(id)!;
        node.replaceWith(node.cloneNode(true));
      },id);}};
    const onRecheck = (outcome: string) => {checks.push(outcome);};
    const packet = await (async () => {
      if (accept) {
        let diagnostic;
        const proof = deriveAcceptFirstLayerProof({...proofInput(),onDecision:d=>{diagnostic=d;}});
        assert.equal(proof?.exactSelector,COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR,JSON.stringify({diagnostic,ax}));
        if (pendingDcl) assert.equal(proof!.expiresAtMs-proof!.issuedAtMs,6000);
        return runPostAcceptObserver({...common,firstLayerProof:proof,recipe:acceptRecipes[0]!,recipeCandidates:acceptRecipes,
          allowCanonicalAcceptDiscovery:true,onAcceptGateFinalRecheck:onRecheck});
      }
      const decision = evaluateRejectGate(proofInput());
      const proof = readRejectFirstLayerProof({...decision,scanId});
      assert.equal(proof?.exactSelector,COOKIE_SCRIPT_REJECT_ROLE_SELECTOR,JSON.stringify({decision,ax}));
      return runPostRefusalObserver({...common,firstLayerProof:proof,recipeSetId:"canonical_cmp_registry",
        recipe:rejectRecipes[0]!,recipeCandidates:rejectRecipes,allowCanonicalRejectDiscovery:true,onRejectGateFinalRecheck:onRecheck});
    })();
    await replacement;
    if (pendingDcl) {
      assert.equal(packet.resolver.recipeId,"passive-exact:CookieScript:accept:v1");
      if (!replace) assert.ok("acceptanceRegistration" in packet && packet.acceptanceRegistration.actionDispatchedAtMs! < 6000);
    }
    assert.deepEqual(checks,[replace ? "failed" : "passed"],JSON.stringify([packet.limitations,packet.interactionDiagnostics]));
    assert.equal(packet.interactionDiagnostics?.click.outcome,replace ? "not_attempted" : "completed");
    assert.equal(clicks-before,replace ? 0 : 1);
    if (!replace) {
      const registration = "acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration;
      if (publishState) assert.equal(registration.status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
      else assert.notEqual(registration.status,"confirmed");
      if (reload && !changedOnReload && !leavesPath) {
        assert.equal(packet.cookieScriptReloadPersistence?.cookieName,"CookieScriptConsent",JSON.stringify(packet.limitations));
        assert.equal(packet.cookieScriptReloadPersistence?.authorizedTargetSha256,packet.exactTargetSha256);
        assert.equal(packet.cookieScriptReloadPersistence?.actionDispatchedAtMs,registration.actionDispatchedAtMs);
        continue;
      }
    }
    assert.equal(packet.cookieScriptReloadPersistence,undefined);
  }
});
