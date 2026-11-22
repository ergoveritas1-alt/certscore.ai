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
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const url = "https://cookiescript-fixture.example/";
for (const action of ["accept","reject"] as const) test(`CookieScript ${action} binds the original and blocks an identical replacement at dispatch`, async t => {
  const accept = action === "accept";
  const id = "cookiescript_" + action;
  const label = accept ? "Accept All" : "Decline All";
  const exact = accept ? "exactCookieScriptAcceptVerified" : "exactCookieScriptRejectVerified";
  const html = `<!doctype html><section id="cookiescript_injected" role="dialog" aria-label="Cookie preferences"
 style="position:fixed;background:white;padding:20px"><p>We use cookies to measure website performance.</p>
 <div id="${id}" role="button" tabindex="0" style="text-transform:uppercase">${label}</div></section>
 <script>let state;
 window.CookieScript = {instance:{categories:()=>['performance','targeting'],currentState:()=>state}};
 document.addEventListener('click', e => {if(e.target.id === '${id}') {
   fetch('/clicked'); state={action:'${action}',categories:${JSON.stringify(accept ? ["strict","performance","targeting"] : ["strict"])}};
   window.dispatchEvent(new Event('${accept ? "CookieScriptAcceptAll" : "CookieScriptReject"}')); document.querySelector('section').hidden=true;
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
  t.mock.method(browser, "newContext", async (options: Parameters<typeof newContext>[0]) => {
    const context = await newContext({...options, serviceWorkers:"block"});
    context.on("page", page => {workerPage = page;});
    await context.route("**/*", route => {
      if (route.request().url() === url) return route.fulfill({contentType:"text/html",body:html});
      if (route.request().url() === url + "clicked") {clicks++; return route.fulfill({status:204});}
      return route.abort();
    });
    return context;
  });
  const page = await (await browser.newContext()).newPage();
  await page.goto(url);
  const cdp = await page.context().newCDPSession(page);
  const loader = async () => (await cdp.send("Page.getFrameTree")).frameTree.frame.loaderId;
  const documentIdentity = {source:"cdp_loader_id" as const,token:await loader()};
  const capture = () => capturePassiveConsentControlGeometry(page,{documentIdentity,timeoutMs:1500});
  const observation = await readRapidFirstLayerConsentUiObservation(page, Date.now(), 1500);
  const geometry = await capture();
  assert.equal(await loader(), documentIdentity.token);
  const button = page.locator("#"+id);
  await button.evaluate(el => el.after(el.cloneNode(true)));
  assert.ok(!(await capture()).candidates.some(c => c[exact]));
  await button.last().evaluate(el => el.remove());
  await button.evaluate(el => document.body.appendChild(el));
  assert.ok(!(await capture()).candidates.some(c => c[exact]));
  const scanId = "cookiescript-role-fixture";
  const bundle = {url,scanId,domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
    consentUiObservations:[{...observation,documentIdentity,documentUrl:url,captureDiagnostics:{
      ...observation.captureDiagnostics,completedChannels:[...observation.captureDiagnostics!.completedChannels,"geometry"]}}]} as CanonicalEvidenceBundle;
  const candidate = geometry.candidates.find(c => c[exact])!;
  assert.equal(candidate.label,label.toUpperCase());
  assert.equal(candidate.cookieScriptUppercaseSourceLabel,label);
  assert.equal(observation.controls.find(c => c.actionType === (accept ? "accept_all" : "reject_all"))?.label, label);
  const proofInput = () => {
    const bytes = Buffer.from(JSON.stringify(geometry));
    return {bundle,scanId,targetUrl:url,sourceSha256:hash(JSON.stringify(bundle)),parentDispatchSha256:hash(scanId),
      nowMs:Date.now(),deadlineAtMs:Date.now()+6000,requireExactSelector:true,geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}};
  };
  delete candidate.cookieScriptUppercaseSourceLabel;
  if (accept) assert.equal(deriveAcceptFirstLayerProof(proofInput()),undefined);
  else assert.equal(evaluateRejectGate(proofInput()).outcome,"blocked");
  candidate.cookieScriptUppercaseSourceLabel = label;
  const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
  const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
  for (const replace of [false,true]) {
    const before = clicks;
    const checks: string[] = [];
    let replacement: Promise<void> | undefined;
    const common = {browser,url,scanId,parentScanId:scanId,
      interactionAuthorization:{kind:"scan_target" as const,normalizedUrl:url,scanId,authorizationId:"sharded_scan_exact_target.v1" as const},
      actionSearchTimeoutMs:1800,resultBudgetMs:5000,confirmationTimeoutMs:300,observationWindowMs:300,
      onLifecycleEvent:() => {if (replace && !replacement) replacement = workerPage.evaluate(id => {
        const node = document.getElementById(id)!;
        node.replaceWith(node.cloneNode(true));
      },id);}};
    const onRecheck = (outcome: string) => {checks.push(outcome);};
    const packet = await (async () => {
      if (accept) {
        const proof = deriveAcceptFirstLayerProof(proofInput());
        assert.equal(proof?.exactSelector,COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR);
        return runPostAcceptObserver({...common,firstLayerProof:proof,recipe:acceptRecipes[0]!,recipeCandidates:acceptRecipes,
          allowCanonicalAcceptDiscovery:true,onAcceptGateFinalRecheck:onRecheck});
      }
      const decision = evaluateRejectGate(proofInput());
      const proof = readRejectFirstLayerProof({...decision,scanId});
      assert.equal(proof?.exactSelector,COOKIE_SCRIPT_REJECT_ROLE_SELECTOR);
      return runPostRefusalObserver({...common,firstLayerProof:proof,recipeSetId:"canonical_cmp_registry",
        recipe:rejectRecipes[0]!,recipeCandidates:rejectRecipes,allowCanonicalRejectDiscovery:true,onRejectGateFinalRecheck:onRecheck});
    })();
    await replacement;
    assert.deepEqual(checks,[replace ? "failed" : "passed"],JSON.stringify([packet.limitations,packet.interactionDiagnostics]));
    assert.equal(packet.interactionDiagnostics?.click.outcome,replace ? "not_attempted" : "completed");
    assert.equal(clicks-before,replace ? 0 : 1);
    if (!replace) assert.equal(("acceptanceRegistration" in packet ? packet.acceptanceRegistration : packet.refusalRegistration).status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
  }
});
