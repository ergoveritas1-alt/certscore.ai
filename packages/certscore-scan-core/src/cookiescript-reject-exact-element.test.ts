import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium, type Page } from "playwright";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { capturePassiveConsentControlGeometry } from "./consent-control-geometry.js";
import { COOKIE_SCRIPT_REJECT_ROLE_SELECTOR } from "./cookiescript-reject-selector.js";
import { evaluateRejectGate, readRejectFirstLayerProof } from "./reject-gate-shadow-receipt.js";
import { buildCanonicalPostRefusalActionRecipes } from "./post-refusal-cmp-recipes.js";
import { runPostRefusalObserver } from "./post-refusal-observer.js";
import { readRapidFirstLayerConsentUiObservation } from "./scanners/pre-consent-runtime-scanner.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const url = "https://cookiescript-fixture.example/";
const html = `<!doctype html><section id="cookiescript_injected" role="dialog" aria-label="Cookie preferences"
 style="position:fixed;background:white;padding:20px"><p>We use cookies to measure website performance.</p>
 <div id="cookiescript_reject" role="button" tabindex="0" style="text-transform:uppercase">Decline All</div></section>
 <script>let state = {action:null,categories:['strict']};
 window.CookieScript = {instance:{categories:()=>['performance','targeting'],currentState:()=>state}};
 document.addEventListener('click', e => {if(e.target.id === 'cookiescript_reject') {
   fetch('/clicked'); state={action:'reject',categories:['strict']};
   window.dispatchEvent(new Event('CookieScriptReject')); document.querySelector('section').hidden=true;
 }});</script>`;

test("CookieScript role Reject binds the original and blocks an identical replacement at dispatch", async t => {
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
  const button = page.locator("#cookiescript_reject");
  await button.evaluate(el => el.after(el.cloneNode(true)));
  assert.ok(!(await capture()).candidates.some(c => c.exactCookieScriptRejectVerified));
  await button.last().evaluate(el => el.remove());
  await button.evaluate(el => document.body.appendChild(el));
  assert.ok(!(await capture()).candidates.some(c => c.exactCookieScriptRejectVerified));
  const scanId = "cookiescript-role-fixture";
  const bundle = {url,scanId,domSnapshots:[{url,documentIdentity,artifactId:"dom_text_pre_consent",consentStateAtTime:"pre_consent"}],
    consentSurfaceInspection:{inspectedPreInteraction:true,actionableControlObserved:true},
    consentUiObservations:[{...observation,documentIdentity,documentUrl:url,captureDiagnostics:{
      ...observation.captureDiagnostics,completedChannels:[...observation.captureDiagnostics!.completedChannels,"geometry"]}}]} as CanonicalEvidenceBundle;
  const candidate = geometry.candidates.find(c => c.exactCookieScriptRejectVerified)!;
  assert.equal(candidate.label,"DECLINE ALL");
  assert.equal(candidate.cookieScriptUppercaseSourceLabel,"Decline All");
  assert.equal(observation.controls.find(c => c.actionType === "reject_all")?.label, "Decline All");
  const evaluate = () => {
    const bytes = Buffer.from(JSON.stringify(geometry));
    return evaluateRejectGate({bundle,scanId,targetUrl:url,sourceSha256:hash(JSON.stringify(bundle)),parentDispatchSha256:hash(scanId),
      nowMs:Date.now(),geometry:{bytes,sha256:hash(bytes),sizeBytes:bytes.length}});
  };
  delete candidate.cookieScriptUppercaseSourceLabel;
  assert.equal(evaluate().outcome,"blocked");
  candidate.cookieScriptUppercaseSourceLabel = "Decline All";
  const recipes = buildCanonicalPostRefusalActionRecipes();
  for (const replace of [false,true]) {
    const before = clicks;
    const decision = evaluate();
    assert.equal(decision.outcome,"qualified",JSON.stringify(decision));
    const proof = readRejectFirstLayerProof({...decision,scanId});
    assert.equal(proof?.exactSelector,COOKIE_SCRIPT_REJECT_ROLE_SELECTOR);
    const checks: string[] = [];
    let replacement: Promise<void> | undefined;
    const packet = await runPostRefusalObserver({browser,url,scanId,parentScanId:scanId,firstLayerProof:proof,
      interactionAuthorization:{kind:"scan_target",normalizedUrl:url,scanId,authorizationId:"sharded_scan_exact_target.v1"},
      recipeSetId:"canonical_cmp_registry",recipe:recipes[0]!,recipeCandidates:recipes,allowCanonicalRejectDiscovery:true,
      actionSearchTimeoutMs:1800,resultBudgetMs:5000,confirmationTimeoutMs:300,observationWindowMs:300,
      onLifecycleEvent:() => {if (replace && !replacement) replacement = workerPage.evaluate(() => {
        const node = document.querySelector("#cookiescript_reject")!;
        node.replaceWith(node.cloneNode(true));
      });},onRejectGateFinalRecheck:outcome => checks.push(outcome)});
    await replacement;
    assert.deepEqual(checks,[replace ? "failed" : "passed"],JSON.stringify([packet.limitations,packet.interactionDiagnostics]));
    assert.equal(packet.interactionDiagnostics?.click.outcome,replace ? "not_attempted" : "completed");
    assert.equal(clicks-before,replace ? 0 : 1);
    if (!replace) assert.equal(packet.refusalRegistration.status,"confirmed",JSON.stringify(packet.confirmationDiagnostics));
  }
});
