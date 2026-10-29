import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {chromium, type Frame, type Page} from "playwright";
import {captureConsentControlGeometry} from "./consent-control-geometry.js";
import {runPostAcceptObserver} from "./post-accept-observer.js";
import {runPostRefusalObserver} from "./post-refusal-observer.js";
import {buildCanonicalPostAcceptActionRecipes} from "./post-accept-cmp-recipes.js";
import {buildCanonicalPostRefusalActionRecipes} from "./post-refusal-cmp-recipes.js";

async function setContent(page: Page, html: string) {
  await page.route("**/*", route => route.fulfill({contentType:"text/html", body:html}));
  await page.goto("http://127.0.0.1/geometry-fixture");
}

const banner = (action: "Accept" | "Reject") => `<section role="dialog" aria-label="Cookie consent" style="position:fixed;top:10px;padding:20px;background:white"><p>Choose optional analytics cookies</p><button>${action} all</button></section>`;

test("timed-out action geometry cannot queue duplicate frame reads or reuse a late inventory", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await setContent(page, banner("Accept"));
    const frame = page.mainFrame(), evaluate = frame.evaluate.bind(frame);
    let reads = 0, release!: () => void;
    const held = new Promise<void>(resolve => {release = resolve;});
    frame.evaluate = (async (...args: Parameters<typeof evaluate>) => {
      reads++;
      const result = await evaluate(...args);
      if (reads === 1) await held;
      return result;
    }) as typeof frame.evaluate;
    const options = {timeoutMs:100, avoidOverlappingFrameReads:true};
    const first = await captureConsentControlGeometry(page, options);
    assert.equal(first.controlInspection?.captureCoverage.mainFrameAvailable, false);
    const second = await captureConsentControlGeometry(page, options);
    assert.equal(reads, 1, "the browser RPC remains in flight after the caller's timeout");
    assert.equal(second.controlInspection?.captureCoverage.mainFrameAvailable, false);
    assert.equal(second.candidates.length, 0, "a skipped read cannot invent a control or complete inventory");
    await page.locator("button").evaluate(button => {button.textContent = "Reject all";});
    release();
    await new Promise(resolve => setImmediate(resolve));
    const fresh = await captureConsentControlGeometry(page, {timeoutMs:1000, avoidOverlappingFrameReads:true});
    assert.equal(reads, 2);
    assert.ok(fresh.candidates.some(candidate => candidate.actionType === "reject_all"));
    assert.equal(fresh.candidates.some(candidate => candidate.actionType === "accept_all"), false,
      "the late Accept inventory must be discarded, not shared with the next attempt");
  } finally {await browser.close();}
});

test("one busy child frame does not suppress fresh main-frame geometry", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await setContent(page, `${banner("Accept")}<iframe srcdoc="<p>Unrelated frame</p>"></iframe>`);
    const child = page.frames().find(frame => frame !== page.mainFrame())!;
    assert.ok(child);
    let childReads = 0;
    child.evaluate = (() => {childReads++; return new Promise(() => {});}) as typeof child.evaluate;
    await captureConsentControlGeometry(page, {timeoutMs:100, avoidOverlappingFrameReads:true});
    await page.locator("button").evaluate(button => {button.textContent = "Reject all";});
    const fresh = await captureConsentControlGeometry(page, {timeoutMs:1000, avoidOverlappingFrameReads:true});
    assert.equal(childReads, 1);
    assert.equal(fresh.controlInspection?.captureCoverage.mainFrameAvailable, true);
    assert.equal(fresh.controlInspection?.captureCoverage.capturedFrameCount, 1);
    assert.ok(fresh.candidates.some(candidate => candidate.actionType === "reject_all"));
  } finally {await browser.close();}
});

test("a rejected geometry read releases its slot and independent pages remain independent", async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage(), other = await browser.newPage();
    await setContent(page, banner("Accept")); await setContent(other, banner("Reject"));
    const frame: Frame = page.mainFrame(), evaluate = frame.evaluate.bind(frame);
    let reads = 0;
    frame.evaluate = (async (...args: Parameters<typeof evaluate>) => {
      if (++reads === 1) throw new Error("Execution context was destroyed");
      return evaluate(...args);
    }) as typeof frame.evaluate;
    const options = {timeoutMs:1000, avoidOverlappingFrameReads:true};
    const failed = await captureConsentControlGeometry(page, options);
    assert.equal(failed.controlInspection?.captureCoverage.mainFrameAvailable, false);
    const [fresh, independent] = await Promise.all([
      captureConsentControlGeometry(page, options), captureConsentControlGeometry(other, options),
    ]);
    assert.ok(fresh.candidates.some(candidate => candidate.actionType === "accept_all"));
    assert.ok(independent.candidates.some(candidate => candidate.actionType === "reject_all"));
  } finally {await browser.close();}
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: a late canonical choice remains reachable while unrelated child geometry is pending`, async () => {
    let clicks = 0, childReads = 0;
    const server = createServer((request, response) => {
      if (request.url === "/click") {clicks++; response.writeHead(204).end(); return;}
      response.setHeader("content-type", "text/html");
      if (request.url === "/frame") {response.end("<!doctype html><p>Unrelated content</p>"); return;}
      response.end(`<!doctype html><iframe src="/frame"></iframe><script>
        setTimeout(()=>{const section=document.createElement('section');section.setAttribute('role','dialog');
        section.style='position:fixed;top:10px;left:10px;background:white;padding:20px';
        section.innerHTML='<p>Choose optional analytics cookies</p><button>${action === "accept" ? "Accept" : "Reject"} all</button>';
        section.querySelector('button').onclick=()=>{fetch('/click');section.hidden=true};document.body.append(section)},900);
        </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const browser = await chromium.launch({headless:true}), newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
      const context = await newContext(options);
      context.on("page", page => page.on("frameattached", frame => {
        const evaluate = frame.evaluate.bind(frame);
        frame.evaluate = (async (...args: Parameters<typeof evaluate>) => {
          if (String(args[0]).includes("registrySelectors")) {childReads++; return new Promise(() => {});}
          return evaluate(...args);
        }) as typeof frame.evaluate;
      }));
      return context;
    };
    try {
      const common = {browser, url:`http://127.0.0.1:${address.port}/`, scanId:`geometry-backpressure-${action}`,
        recipeSetId:"geometry-backpressure-fixture",
        interactionAuthorization:{kind:"loopback",authorizationId:"loopback_local_lab"} as const,
        actionSearchTimeoutMs:4000, confirmationTimeoutMs:100, observationWindowMs:100};
      const recipes = action === "accept" ? buildCanonicalPostAcceptActionRecipes() : buildCanonicalPostRefusalActionRecipes();
      const packet = action === "accept"
        ? await runPostAcceptObserver({...common, recipe:recipes[0] as ReturnType<typeof buildCanonicalPostAcceptActionRecipes>[number],
          recipeCandidates:buildCanonicalPostAcceptActionRecipes(), allowCanonicalAcceptDiscovery:true})
        : await runPostRefusalObserver({...common, recipe:recipes[0] as ReturnType<typeof buildCanonicalPostRefusalActionRecipes>[number],
          recipeCandidates:buildCanonicalPostRefusalActionRecipes(), allowCanonicalRejectDiscovery:true});
      assert.equal(clicks, 1, JSON.stringify(packet.interactionDiagnostics));
      assert.equal(childReads, 1, "later resolver passes must not queue work in the busy frame");
      assert.equal(packet.interactionDiagnostics?.click.outcome, "completed");
      assert.equal(packet.decisionEvidence?.decision, "unknown", "a completed path is not semantic confirmation");
    } finally {await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  });
}
