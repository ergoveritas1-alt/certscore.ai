import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { consentUiObservationSchema, postAcceptEvidencePacketSchema } from "@certscore/contracts";
import { createArtifactWriter } from "../../../packages/certscore-scan-core/src/artifact-writer";
import { preConsentRuntimeScanner } from "../../../packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner";
import { buildCanonicalPostAcceptActionRecipes } from "@certscore/scan-core/post-accept-cmp-recipes";
import { runPostAcceptObserver } from "@certscore/scan-core/post-accept-observer";
import { RESOLVED_SCAN_TARGET_AUTHORIZATION_ID } from "@certscore/scan-core/post-refusal-target-authorization";
import { buildWorkerDiscoveredClick, verifyWorkerDiscoveredClick, type WorkerDiscoveredClick } from "./worker-discovered-click";

const requested = "https://bootbarn.com/";
const storefront = "https://www.bootbarn.com/";
const challenge = storefront + "on/demandware.store/Sites-bootbarn_us-Site/default/PX-Show";
// The redirect, button labels and Accept selector come from the retained scan.
// The banner markup, challenge and navigation timing are controlled fixtures.
const banner = `<main><h1>Boot Barn</h1><p>Shop boots and western wear.</p></main>
  <section id="onetrust-banner-sdk" role="dialog" aria-label="Cookie preferences"><p id="onetrust-policy-text">
  We use cookies to personalize content, including for targeted ads.</p><div id="onetrust-button-group">
  <button id="onetrust-pc-btn-handler">Manage Preferences</button>
  <button id="onetrust-accept-btn-handler">Accept All</button></div></section>
  <script>document.querySelector("#onetrust-accept-btn-handler").addEventListener("click", event => {
    if (event.isTrusted) { document.querySelector("section").hidden = true; fetch("/fixture-click", {method:"POST"}); }
  });</script>`;
const challengeHtml = "<main><h1>Access denied</h1><p>Please verify you are human.</p></main>";
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

for (const sameUrl of [false, true]) {
  const transition = sameUrl ? "same-URL reload" : "PX-Show navigation";
  test(`Boot Barn preserves document ownership and verifies independent Accept after ${transition}`, async t => {
    const dir = await mkdtemp(join(tmpdir(), "boot-barn-document-"));
    t.after(() => rm(dir, {recursive:true, force:true}));
    const browser = await chromium.launch({args:["--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND"]});
    t.after(() => browser.close());
    const contexts = browser.newContext.bind(browser);
    const commits: Array<{url: string; loader: string; worker: boolean}> = [];
    const clicks: boolean[] = [];
    let worker = false;
    let replace: (() => Promise<unknown>) | undefined;
    let servingChallenge = false;
    let replaced: Promise<unknown> | undefined;
    t.mock.method(browser, "newContext", async (options: Parameters<typeof contexts>[0]) => {
      const context = await contexts({...options, serviceWorkers:"block"});
      await context.addInitScript("globalThis.__name ??= value => value;");
      await context.route("**/*", route => {
        const url = route.request().url();
        if (url === requested) return route.fulfill({contentType:"text/html", body:`<script>location.replace(${JSON.stringify(storefront)})</script>`});
        if (url === challenge || (sameUrl && url === storefront && servingChallenge && !worker)) return route.fulfill({status:403, contentType:"text/html", body:challengeHtml});
        if (url === storefront) return route.fulfill({contentType:"text/html", body:banner});
        if (url === storefront + "fixture-click" && route.request().method() === "POST") {
          clicks.push(worker);
          return route.fulfill({status:204});
        }
        return route.abort();
      });
      const newPage = context.newPage.bind(context);
      t.mock.method(context, "newPage", async () => {
        const page = await newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Page.enable");
        cdp.on("Page.frameNavigated", ({frame}) => {
          if (!frame.parentId) commits.push({url:frame.url, loader:frame.loaderId, worker});
        });
        if (!worker) replace = () => {
          servingChallenge = true;
          return sameUrl ? page.evaluate(() => location.reload()) : page.evaluate(url => location.replace(url), challenge);
        };
        return page;
      });
      return context;
    });

    const scanId = "boot-barn-document-replay";
    const passive = await preConsentRuntimeScanner({url:requested, normalizedUrl:requested, browser,
      scanStartedAtMs:Date.now(), internalBudgetMs:16000, artifactWriter:await createArtifactWriter(dir),
      captureScope:"consent_proof", screenshotMode:"always", screenshotCaptureMode:"viewport_first", waitMode:"fast",
      onFirstLayerObservation: observation => {
        if (!replaced && replace && observation.documentUrl === storefront && observation.acceptControlObserved)
          replaced = replace();
      },
    });
    assert.ok(replaced, JSON.stringify({commits, errors:passive.moduleRun.errors, rows:passive.consentUiObservations}));
    await replaced;
    const rows = passive.consentUiObservations.map(row => consentUiObservationSchema.parse(row));
    const expectedLoader = (url: string, worker: boolean) => {
      const matches = commits.filter(commit => commit.url === url && commit.worker === worker);
      assert.equal(matches.length, 1, JSON.stringify(commits));
      return matches[0]!.loader;
    };
    const passiveCommits = commits.filter(commit => !commit.worker && (commit.url === storefront || commit.url === challenge));
    const replacementUrl = sameUrl ? storefront : challenge;
    assert.deepEqual(passiveCommits.map(commit => commit.url), [storefront, replacementUrl]);
    const [originalLoader, replacementLoader] = passiveCommits.map(commit => commit.loader);
    assert.notEqual(originalLoader, replacementLoader);
    assert.deepEqual(rows.map(row => [row.documentUrl, row.documentIdentity?.token]), [
      [storefront, originalLoader], [replacementUrl, replacementLoader],
    ]);
    assert.equal(new Set(rows.map(row => row.observationId)).size, 2);
    const [early, late] = rows;
    assert.ok(early!.acceptControlObserved && early!.managePreferencesControlObserved);
    assert.equal(early!.rejectControlObserved, false);
    assert.ok(early!.controls.some(control => control.selectorHint === "#onetrust-accept-btn-handler" && control.label === "Accept All"));
    assert.equal(late!.acceptControlObserved || late!.managePreferencesControlObserved || late!.rejectControlObserved, false);
    assert.deepEqual(late!.controls, []);
    assert.deepEqual(clicks, []);

    worker = true;
    const started = Date.now();
    const receipts: WorkerDiscoveredClick[] = [];
    const recipes = buildCanonicalPostAcceptActionRecipes();
    const packet = postAcceptEvidencePacketSchema.parse(await runPostAcceptObserver({browser, url:requested, scanId,
      parentScanId:scanId, recipe:recipes[0]!, recipeCandidates:recipes, productionProjectable:true,
      allowCanonicalAcceptDiscovery:true, onWorkerDiscoveredClick: click => receipts.push(click),
      interactionAuthorization:{kind:"scan_target_resolution", authorizationId:RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
        scanId, requestedUrl:requested, maxRedirects:1, resolutionTimeoutMs:1400},
      actionSearchTimeoutMs:5800, resultBudgetMs:7000, confirmationTimeoutMs:500, observationWindowMs:300,
    }));
    assert.deepEqual(clicks, [true]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]!.control.selectorHint, "#onetrust-accept-btn-handler");
    assert.equal(receipts[0]!.control.authorizedTargetSha256, sha(storefront));
    assert.notEqual(expectedLoader(storefront, true), originalLoader);
    const binding = {scanId, action:"accept" as const, parentDispatchSha256:sha(scanId), requestedUrl:requested};
    const packetBytes = Buffer.from(JSON.stringify(packet));
    const body = buildWorkerDiscoveredClick(binding, receipts[0]!, packetBytes);
    assert.ok(body);
    const verified = verifyWorkerDiscoveredClick({binding, body, metadataSha256:sha(body), packetBytes, packetSha256:sha(packetBytes),
      workerDispatchedAtMs:started, readAtMs:Date.now()});
    assert.ok(verified && verified.reserveMs >= 200);
    t.diagnostic(`Boot Barn verified 1/1 Accept with ${verified.reserveMs} ms reserve and two independently bound passive observations`);
  });
}
