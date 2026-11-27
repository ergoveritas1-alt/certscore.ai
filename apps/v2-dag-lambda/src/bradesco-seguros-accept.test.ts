import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";
import { BRADESCO_SEGUROS_ACCEPT_CONTROL as scope } from "@certscore/contracts";
import { buildCanonicalPostAcceptActionRecipes } from "@certscore/scan-core/post-accept-cmp-recipes";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "@certscore/scan-core/post-refusal-target-authorization";
import { buildWorkerDiscoveredClick, verifyWorkerDiscoveredClick, type WorkerDiscoveredClick } from "./worker-discovered-click";

const sha = (input: Buffer | string) => createHash("sha256").update(input).digest("hex");

for (const scenario of ["scrollable", "late_scrollable", "unscrollable", "wrong_notice", "duplicate"] as const) {
  test(`Bradesco Seguros Accept rechecks the original button with ${scenario} clipping`, {timeout: 15_000}, async t => {
    const browser = await chromium.launch({args: ["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
    t.after(() => browser.close());
    const open = browser.newContext.bind(browser);
    let clicks = 0;
    let scroll: {left: number; x: number; y: number; fullyVisible: boolean} | undefined;
    const callbacks: WorkerDiscoveredClick[] = [];
    // The recorded banner occupies x=76–516. Its button occupies x=432–577.
    // The fixture makes the banner horizontally scrollable only in the cases
    // where the browser must prove that it can expose the full hit target.
    // The original worker first observed the clipped button at 6,692 ms.
    const late = scenario === "late_scrollable";
    const button = '<button id="adopt-accept-all-button" type="button">Aceitar cookies</button>';
    const panel = `<div id="cookie-banner" role="dialog" aria-label="Aviso de cookies">
      <p>${scenario === "wrong_notice" ? "Veja as notícias do dia." : scope.notice}</p>
      <div class="adopt-c-eHHyAV"><button id="reject" type="button">Rejeitar cookies não necessários</button>
        ${button}${scenario === "duplicate" ? button : ""}</div>
    </div>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body { min-height: 1800px; }
      #cookie-banner { position: absolute; left: 76px; top: 554px; width: 440px; height: 270px;
        overflow-x: ${scenario === "unscrollable" ? "clip" : "auto"}; background: white; }
      .adopt-c-eHHyAV { position: absolute; left: 54px; top: 204px; display: flex; gap: 30px; width: max-content; }
      button { width: 145px; height: 42px; }
      #reject { width: 272px; }
    </style>${late ? "" : panel}<script>
      ${late ? `setTimeout(() => document.body.insertAdjacentHTML("beforeend", ${JSON.stringify(panel)}), 6692);` : ""}
      document.addEventListener("click", event => {
        if (!event.isTrusted || event.target.id !== "adopt-accept-all-button") return;
        const banner = event.target.closest("#cookie-banner");
        const fullyVisible = event.target.getBoundingClientRect().right <= banner.getBoundingClientRect().right;
        fetch("/fixture-click", {method: "POST", body:JSON.stringify({left:banner.scrollLeft, x:scrollX, y:scrollY, fullyVisible})});
        banner.hidden = true;
      });
    </script>`;
    t.mock.method(browser, "newContext", async options => {
      const context = await open({...options, serviceWorkers: "block", viewport: {width: 1366, height: 900}});
      await context.addInitScript("globalThis.__name ??= value => value;");
      await context.route("**/*", route => {
        const url = route.request().url();
        if (url === scope.requestedUrl)
          return route.fulfill({contentType: "text/html", body: `<script>location.replace(${JSON.stringify(scope.documentUrl)})</script>`});
        if (url === scope.documentUrl) return route.fulfill({contentType: "text/html", body: html});
        if (url === new URL("/fixture-click", scope.documentUrl).href && route.request().method() === "POST") {
          clicks++;
          scroll = route.request().postDataJSON();
          return route.fulfill({status: 204});
        }
        return route.abort("blockedbyclient");
      });
      return context;
    });

    const scanId = "bradesco-retained-clipping";
    const started = Date.now();
    const recipes = buildCanonicalPostAcceptActionRecipes();
    const packet = await runPostAcceptObserver({
      browser, url: scope.requestedUrl, scanId, parentScanId: scanId, productionProjectable: true,
      recipe: recipes[0]!, recipeCandidates: recipes, allowCanonicalAcceptDiscovery: true,
      actionSearchTimeoutMs: late ? 14_000 : 3_000, resultBudgetMs: late ? 20_000 : 7_000,
      observationWindowMs: 300, confirmationTimeoutMs: 400,
      interactionAuthorization: {kind: "scan_target_resolution", authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
        scanId, requestedUrl: scope.requestedUrl, maxRedirects: 8, resolutionTimeoutMs: 1_500},
      onWorkerDiscoveredClick: callback => callbacks.push(callback),
    });
    if (scenario !== "scrollable" && !late) {
      assert.equal(clicks, 0);
      assert.deepEqual(callbacks, []);
      return;
    }
    assert.equal(clicks, 1, JSON.stringify({resolver: packet.resolver, limitations: packet.limitations}));
    assert.deepEqual(scroll, {left: 61, x: 0, y: 0, fullyVisible: true});
    assert.equal(callbacks.length, 1);
    assert.equal(packet.actionControlProof?.authorizedTargetSha256, scope.documentSha256);
    assert.ok(packet.actionControlProof?.classifierReasonCodes.includes(scope.proofReason));
    const binding = {scanId, action: "accept" as const, parentDispatchSha256: sha(scanId), requestedUrl: scope.requestedUrl};
    const bytes = Buffer.from(JSON.stringify(packet));
    const receipt = buildWorkerDiscoveredClick(binding, callbacks[0]!, bytes);
    assert.ok(receipt);
    const verified = verifyWorkerDiscoveredClick({binding, body: receipt, metadataSha256: sha(receipt),
      packetBytes: bytes, packetSha256: sha(bytes), workerDispatchedAtMs: started, readAtMs: Date.now()});
    assert.ok(verified && verified.reserveMs >= 200);
    t.diagnostic(`Bradesco verified 1/1 Accept with ${verified.reserveMs} ms in reserve after scrolling only its banner by ${scroll.left} px`);
  });
}
