import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium, type Locator } from "playwright";
import { deriveAcceptFirstLayerProof, scopedConsentActionWindowMs, type AcceptFirstLayerProof } from "@certscore/scan-core/accept-first-layer-gate";
import { type RejectFirstLayerProof } from "@certscore/scan-core/reject-gate-shadow-receipt";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { runPostRefusalObserver } from "@certscore/scan-core/post-refusal-observer";
import { buildCanonicalPostAcceptActionRecipes } from "../../../packages/certscore-scan-core/src/post-accept-cmp-recipes.js";
import { buildCanonicalPostRefusalActionRecipes } from "../../../packages/certscore-scan-core/src/post-refusal-cmp-recipes.js";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "../../../packages/certscore-scan-core/src/post-refusal-target-authorization.js";
import { proofForReadyAction } from "./dedicated-action-release.js";
import { buildConsentClickCheckpoint, verifyConsentClickCheckpoint } from "./reject-click-checkpoint.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

for (const example of [
  { action: "accept", url: "https://weedmaps.com/", selector: 'button[data-testid="cookie-banner-accept"]',
    label: "Accept", documentUrl: "https://weedmaps.com/", attribute: 'data-testid="cookie-banner-accept"' },
  { action: "reject", url: "https://bendingspoons.com/", selector: "button.banner-close-button",
    label: "Continue without accepting", documentUrl: "https://bendingspoons.com/", attribute: 'class="banner-close-button"' },
  { action: "accept", url: "https://moneysupermarket.com/", documentUrl: "https://www.moneysupermarket.com/",
    selector: "#banner-accept", label: "Accept all", attribute: 'id="banner-accept"' },
  { action: "reject", url: "https://moneysupermarket.com/", documentUrl: "https://www.moneysupermarket.com/",
    selector: "#banner-reject", label: "Reject all", attribute: 'id="banner-reject"' },
  { action: "accept", url: "https://ilmattino.it/", documentUrl: "https://www.ilmattino.it/",
    selector: "button.iubenda-cs-accept-btn", label: "ACCETTA E CONTINUA", attribute: 'class="iubenda-cs-accept-btn"' },
  { action: "accept", url: "https://casadellibro.com/", documentUrl: "https://www.casadellibro.com/",
    selector: "#onetrust-accept-btn-handler", label: "Aceptar", attribute: 'id="onetrust-accept-btn-handler"' },
  { action: "reject", url: "https://casadellibro.com/", documentUrl: "https://www.casadellibro.com/",
    selector: "#onetrust-reject-all-handler", label: "Rechazar", attribute: 'id="onetrust-reject-all-handler"' },
  { action: "accept", url: "https://fictionzone.net/", documentUrl: "https://fictionzone.net/",
    selector: "div.cookieControl__BarButtons > button:nth-of-type(1)", label: "Accept", attribute: "" },
  { action: "reject", url: "https://fictionzone.net/", documentUrl: "https://fictionzone.net/",
    selector: "div.cookieControl__BarButtons > button:nth-of-type(2)", label: "Essential only", attribute: "" },
  { action: "accept", url: "https://bt.com/", documentUrl: "https://www.bt.com/",
    selector: "#onetrust-accept-btn-handler", label: "Accept all", attribute: 'id="onetrust-accept-btn-handler"' },
] as const) {
  const rerender = example.url === "https://bt.com/";
  const oneTrust = example.selector.startsWith("#onetrust-");
  const fictionZone = example.url === "https://fictionzone.net/";
  test(`${example.url} retains its exact ${example.action} click ${rerender ? "after a transient element-read failure" : "after the old deadline"}`, { timeout: 30_000 }, async t => {
    const browser = await chromium.launch({ args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
    t.after(() => browser.close());
    const open = browser.newContext.bind(browser);
    const hits: string[] = [];
    let interruptControlRead = false;
    let interrupted = false;
    t.mock.method(browser, "newContext", async (...args: Parameters<typeof open>) => {
      const context = await open({ ...args[0], serviceWorkers: "block" });
      if (rerender) context.once("page", page => {
        const prototype = Object.getPrototypeOf(page.locator(example.selector)) as Locator;
        const read = prototype.elementHandle;
        t.mock.method(prototype, "elementHandle", function(this: Locator, ...arguments_: Parameters<Locator["elementHandle"]>) {
          if (interruptControlRead && this.toString().includes(example.selector)) {
            interruptControlRead = false;
            interrupted = true;
            return Promise.reject(new Error("original element was replaced before the read"));
          }
          return read.apply(this, arguments_);
        });
      });
      await context.route("**/*", async route => {
        const url = route.request().url();
        if (url === example.url && url !== example.documentUrl) {
          return route.fulfill({ contentType: "text/html", body: `<script>location.replace(${JSON.stringify(example.documentUrl)})</script>` });
        }
        if (url === example.documentUrl) {
          const button = `<button type="button" ${example.attribute}
            onclick="if(event.isTrusted) {fetch('/clicked');this.closest('section').hidden=true}">${example.label}</button>`;
          const buttons = fictionZone
            ? `<div class="cookieControl__BarContainer"><div class="cookieControl__BarButtons">${example.action === "reject" ? "<button>Accept</button>" : ""}${button}</div></div>`
            : button;
          const bannerId = oneTrust ? "onetrust-banner-sdk" : example.url === "https://ilmattino.it/" ? "iubenda-cs-banner" : "cookie-banner";
          return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8"><body><script src="/late-consent.js"></script>
            <section id="${bannerId}" role="dialog" aria-label="Cookie consent"><p>Choose which optional cookies are allowed.</p>
            ${buttons}</section></body>` });
        }
        if (url === example.documentUrl + "late-consent.js") {
          if (!rerender) await new Promise(resolve => setTimeout(resolve, 6_500));
          return route.fulfill({ contentType: "text/javascript", body: "" });
        }
        if (url === example.documentUrl + "clicked") hits.push(url);
        return route.abort();
      });
      return context;
    });
    const scanId = "retained-late-control";
    const issuedAtMs = Date.now();
    const timing = { issuedAtMs, expiresAtMs: issuedAtMs + 6_000 };
    const source = {
      sourceSha256: hash("source"), geometrySha256: hash("geometry"), parentDispatchSha256: hash("parent"),
      requestedTargetSha256: hash(example.url), documentSha256: hash(example.documentUrl),
      labelSha256: hash(example.label), selectorSha256: hash(example.selector),
    };
    const binding = example.action === "accept"
      ? { action: "accept" as const, proof: proofForReadyAction<AcceptFirstLayerProof>({
          version: "certscore.accept-first-layer-proof.v1", scanId, exactSelector: example.selector, ...timing, ...source,
        }, Infinity) }
      : { action: "reject" as const, proof: proofForReadyAction<RejectFirstLayerProof>({
          outcome: "qualified", scanId, exactSelector: example.selector, ...timing,
          binding: { ...source, documentTokenSha256: hash("loader"), selectorEvidence: "verified_geometry", labelMatch: "exact" },
        }, Infinity) };
    if (example.url === "https://casadellibro.com/" || fictionZone) {
      assert.equal(binding.proof.expiresAtMs - binding.proof.issuedAtMs, 10_000);
      assert.equal(scopedConsentActionWindowMs(example.action, example.selector, { ...source, labelSha256: hash("Changed label") }), undefined);
      assert.equal(scopedConsentActionWindowMs(example.action, example.selector, { ...source, documentSha256: hash(example.documentUrl + "changed") }), undefined);
      assert.equal(scopedConsentActionWindowMs(example.action, example.selector, { ...source, geometrySha256: undefined }), undefined);
    }
    let recheckedAtMs: number | undefined;
    let verifiedClickAtMs: number | undefined;
    const recheck = (outcome: "passed" | "failed") => { recheckedAtMs = outcome === "passed" ? Date.now() : undefined; };
    const complete = (event: {control: Parameters<typeof buildConsentClickCheckpoint>[1]; dispatchedAtMs: number; completedAtMs: number}) => {
      if (recheckedAtMs === undefined) return;
      const receipt = buildConsentClickCheckpoint(binding, event.control, {
        recheckedAtMs, dispatchedAtMs: event.dispatchedAtMs, completedAtMs: event.completedAtMs,
      });
      if (receipt) verifiedClickAtMs = verifyConsentClickCheckpoint({
        body: receipt, binding, metadataSha256: hash(receipt), coordinatorDispatchAtMs: binding.proof.issuedAtMs,
        verifiedAtMs: Date.now(), deadlineAtMs: binding.proof.expiresAtMs,
      })?.completedAtMs;
    };
    const input = {
      browser, scanId, parentScanId: scanId, url: example.url, recipeSetId: "reviewed-late-control-replay", actionSearchTimeoutMs: 14_000,
      resultBudgetMs: 15_000, confirmationTimeoutMs: 500, observationWindowMs: 100,
      interactionAuthorization: {
        kind: "scan_target_resolution" as const, authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
        scanId, requestedUrl: example.url, maxRedirects: 1, resolutionTimeoutMs: 1_000,
      },
    };
    const acceptRecipes = buildCanonicalPostAcceptActionRecipes();
    const rejectRecipes = buildCanonicalPostRefusalActionRecipes();
    const packet = binding.action === "accept"
      ? await runPostAcceptObserver({ ...input, firstLayerProof: binding.proof,
          recipe: acceptRecipes[0]!, recipeCandidates: acceptRecipes, allowCanonicalAcceptDiscovery: true,
          onAcceptGateFinalRecheck: recheck, onExactAcceptClickCompleted: complete,
          onDiagnosticStage: stage => { if (rerender && stage === "control_proof") interruptControlRead = true; } })
      : await runPostRefusalObserver({ ...input, firstLayerProof: binding.proof,
          recipe: rejectRecipes[0]!, recipeCandidates: rejectRecipes, allowCanonicalRejectDiscovery: true,
          onRejectGateFinalRecheck: recheck, onExactRejectClickCompleted: complete });
    assert.equal(packet.interactionDiagnostics?.click.outcome, "completed", JSON.stringify(packet.limitations));
    assert.ok(verifiedClickAtMs !== undefined);
    if (rerender) assert.ok(interrupted && verifiedClickAtMs < timing.expiresAtMs);
    else assert.ok(verifiedClickAtMs > timing.expiresAtMs);
    assert.ok(binding.proof.expiresAtMs - verifiedClickAtMs >= 200);
    assert.deepEqual(hits, [example.documentUrl + "clicked"]);
    t.diagnostic(`exact receipt at ${verifiedClickAtMs - issuedAtMs} ms; ${binding.proof.expiresAtMs - verifiedClickAtMs} ms reserve`);
  });
}

test("Pusher passive capture binds the same scoped control across generated button classes", async t => {
  const { exactNativeConsentButtonSelector } = await import("../../../packages/certscore-scan-core/src/exact-native-consent-button-selector.js");
  const { capturePassiveConsentControlGeometry } = await import("../../../packages/certscore-scan-core/src/consent-control-geometry.js");
  const { readRapidFirstLayerConsentUiObservation, reconcileConsentUiObservationWithCompletedGeometry } = await import("../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.js");
  const prior = process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE;
  process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE = "1";
  t.after(() => {
    if (prior === undefined) delete process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE;
    else process.env.CERTSCORE_ACCEPT_GATE_PRODUCTION_ENFORCE = prior;
  });

  const browser = await chromium.launch({ args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"] });
  t.after(() => browser.close());
  const context = await browser.newContext({serviceWorkers: "block"});
  await context.route("**/*", route => route.request().url() === "https://pusher.com/"
    ? route.fulfill({ contentType: "text/html", body: `<!doctype html><body>
      <div role="dialog" aria-label="Cookie consent" class="CookiesConsent__Container-sc-18be04b-0">
        <p>We use optional cookies. Accept cookies to allow optional analytics and advertising.</p>
        <div class="CookiesConsent__FormButtons-sc-18be04b-9"><button class="jvSrRs" type="button">Accept</button></div>
      </div></body>` })
    : route.abort());
  const page = await context.newPage();
  await page.goto("https://pusher.com/");
  const client = await context.newCDPSession(page);
  const documentIdentity = { source: "cdp_loader_id" as const, token: (await client.send("Page.getFrameTree")).frameTree.frame.loaderId };
  const started = Date.now();
  const original = await readRapidFirstLayerConsentUiObservation(page, started, 1500);
  const accept = original.controls.find(control => control.actionType === "accept_all");
  assert.ok(accept?.selectorHint);
  await page.locator("button").evaluate(button => { button.className = "changedStyle"; });
  const geometry = await capturePassiveConsentControlGeometry(page, { timeoutMs: 1500, documentIdentity });
  const candidate = geometry.candidates.find(control => control.actionType === "accept_all");
  assert.equal(candidate?.selectorHint, accept.selectorHint);
  assert.equal(candidate?.exactNativeAcceptSelectorVerified, true);
  const documentUrl = page.url();
  const reconciled = reconcileConsentUiObservationWithCompletedGeometry({
    current: { ...original, documentUrl, documentIdentity }, geometry,
    geometryAccessLoaded: true, pageUrl: documentUrl, scanStartedAtMs: started,
  });
  const scanId = "pusher-retained-selector";
  const bytes = Buffer.from(JSON.stringify(geometry));
  const source = hash("pusher-source");
  const proof = deriveAcceptFirstLayerProof({
    bundle: {
      url: documentUrl, scanId, consentUiObservations: [reconciled],
      domSnapshots: [{url: documentUrl, documentIdentity, artifactId: "dom_text_pre_consent", consentStateAtTime: "pre_consent"}],
      consentSurfaceInspection: { inspectedPreInteraction: true, actionableControlObserved: true },
    },
    scanId, targetUrl: documentUrl, sourceSha256: source, parentDispatchSha256: hash(scanId),
    geometry: { bytes, sha256: hash(bytes), sizeBytes: bytes.length }, requireExactSelector: true,
    nowMs: Date.now(), deadlineAtMs: Infinity,
  });
  assert.equal(proof?.exactSelector, accept.selectorHint);
  const button = page.locator("button").first();
  await button.evaluate(element => element.parentElement!.append(element.cloneNode(true)));
  assert.equal(await button.evaluate(exactNativeConsentButtonSelector), undefined);
  await page.locator("button").last().evaluate(element => element.remove());
  await button.evaluate(element => element.setAttribute("formaction", "https://example.invalid/submit"));
  assert.equal(await button.evaluate(exactNativeConsentButtonSelector), undefined);
});
