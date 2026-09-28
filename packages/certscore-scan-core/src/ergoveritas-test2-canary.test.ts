import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { classifyPrivacySurface, locateCaliforniaNoticePassages } from "@certscore/contracts";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer.js";
import { policySurfaceScanner } from "./scanners/policy-surface-scanner.js";

const canaryRoot = new URL("../../../infra/aws/ergoveritas-canary/", import.meta.url);
const assetNames = [
  "test2.html", "certscore-review-canary.js", "test2-choice-runtime.js",
  "test2-do-not-sell-or-share.html", "test2-privacy-choices.html", "test2-cookie-settings.html",
  "test2-notice-at-collection.html", "test2-privacy-policy.html", "test2-cookie-policy.html",
];
const expectedCookieNames = ["_ga_TEST2", "_gat_TEST2", "_fbc", "_clsk", "ajs_anonymous_id", "mp_test2_mixpanel"];

test("owned test2 canary separates manual Do Not Sell/Share from unchanged GPC activity", { timeout: 60_000 }, async () => {
  const assets = new Map(await Promise.all(assetNames.map(async (name) => [name, await readFile(new URL(name, canaryRoot))] as const)));
  const server = createServer((request, response) => {
    const name = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
    const content = assets.get(name);
    response.writeHead(content ? 200 : 404, { "content-type": name.endsWith(".js") ? "text/javascript" : "text/html", "cache-control": "no-store" });
    response.end(content ?? "Not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://localhost:${address.port}/test2.html`;
  const browser = await chromium.launch({ headless: true });

  try {
    async function visit(gpc: boolean) {
      const context = await browser.newContext(gpc ? { extraHTTPHeaders: { "Sec-GPC": "1" } } : {});
      if (gpc) await context.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true }));
      const page = await context.newPage();
      const requests: string[] = [];
      await page.route("https://**/*", async (route) => {
        requests.push(route.request().url());
        await route.fulfill({ status: 204, body: "" });
      });
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.dataset.certscoreCanaryReady === "true");
      return { context, page, requests };
    }

    const baseline = await visit(false);
    assert.equal(baseline.requests.length, 6);
    assert.deepEqual((await baseline.context.cookies(url)).map((cookie) => cookie.name).filter((name) => expectedCookieNames.includes(name)).sort(), [...expectedCookieNames].sort());
    assert.equal(await baseline.page.locator('a[href="/test2-do-not-sell-or-share.html"]').textContent(), "Do Not Sell or Share My Personal Information");
    assert.equal(await baseline.page.locator('a[href="/test2-privacy-choices.html"]').textContent(), "Your Privacy Choices");
    assert.equal(await baseline.page.locator('a[href="/test2-cookie-settings.html"]').textContent(), "Cookie Settings");
    assert.equal(await baseline.page.locator("#test2-choice-status").textContent(), "No manual privacy choice is saved in this browser.");
    for (const [path, kind] of [
      ["test2-do-not-sell-or-share.html", "do_not_sell_or_share"],
      ["test2-privacy-choices.html", "your_privacy_choices"],
      ["test2-cookie-settings.html", "cookie_settings"],
      ["test2-notice-at-collection.html", "notice_at_collection"],
      ["test2-privacy-policy.html", "privacy_policy"],
      ["test2-cookie-policy.html", "cookie_policy"],
    ] as const) {
      const link = baseline.page.locator(`a[href="/${path}"]`);
      assert.equal(await link.isVisible(), true, `${path} must be a visible starting-page link`);
      assert.equal(classifyPrivacySurface({ linkText: (await link.textContent()) ?? "" }).surfaceType, kind);
    }
    for (const name of assetNames.filter((asset) => asset.endsWith(".html"))) {
      const response = await fetch(new URL(name, url));
      assert.equal(response.status, 200, `${name} must be reachable from the starting page`);
    }
    const artifactDir = await mkdtemp(path.join(tmpdir(), "certscore-test2-policy-"));
    try {
      const policy = await policySurfaceScanner({
        url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 12_000,
        discoveryMode: "fast", artifactWriter: await createArtifactWriter(artifactDir),
      });
      for (const kind of ["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]) {
        const link = policy.policySurfaceObservations.find(observation => observation.surfaceType === kind);
        assert.equal(link?.linkVisibility, "visible", `${kind} must retain live visibility proof`);
        assert.equal(link?.accessibleNameSource, "text", `${kind} must retain its accessible name`);
        assert.equal(link?.linkSourcePageUrl, url, `${kind} must remain bound to the starting page`);
      }
    } finally {
      await rm(artifactDir, { recursive: true, force: true });
    }
    assert.match(assets.get("test2-notice-at-collection.html")!.toString(), /Categories collected and purposes[\s\S]*Sale or sharing[\s\S]*Retention[\s\S]*Opt-out methods/);
    assert.match(assets.get("test2-privacy-policy.html")!.toString(), /Global Privacy Control[\s\S]*does not reduce optional cookies or requests/);
    const noticePage = await baseline.context.newPage();
    await noticePage.goto(new URL("test2-notice-at-collection.html", url).toString());
    const passages = locateCaliforniaNoticePassages(await noticePage.locator("body").innerText());
    assert.deepEqual(passages.map((passage) => passage.topic), ["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"]);
    await noticePage.close();
    const policyPage = await baseline.context.newPage();
    await policyPage.goto(new URL("test2-privacy-policy.html", url).toString());
    const policyPassages = locateCaliforniaNoticePassages(await policyPage.locator("body").innerText());
    assert.deepEqual(policyPassages.map((passage) => passage.topic), ["sale_sharing", "collection_purposes", "retention", "privacy_rights", "opt_out_methods"]);
    await policyPage.close();

    const gpc = await visit(true);
    assert.deepEqual(gpc.requests.sort(), baseline.requests.sort());
    assert.deepEqual((await gpc.context.cookies(url)).map((cookie) => cookie.name).filter((name) => expectedCookieNames.includes(name)).sort(), [...expectedCookieNames].sort());
    await gpc.context.close();

    const stalledContext = await browser.newContext();
    const stalledPage = await stalledContext.newPage();
    await stalledPage.route("https://**/*", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      await route.fulfill({ status: 204, body: "" }).catch(() => undefined);
    });
    await stalledPage.goto(url);
    const boundedSettlements = await stalledPage.evaluate(async () => Promise.race([
      (window as typeof window & { __CERTSCORE_TEST2_TRACKER_SETTLED__: Promise<string[]> }).__CERTSCORE_TEST2_TRACKER_SETTLED__,
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("Tracker request lifetime was not bounded")), 1_000)),
    ]));
    assert.deepEqual(boundedSettlements, Array(6).fill("stopped"));
    await stalledContext.close();

    await baseline.page.locator('a[href="/test2-do-not-sell-or-share.html"]').click();
    assert.equal(await baseline.page.locator("h1").textContent(), "Do Not Sell or Share My Personal Information");
    await baseline.page.locator("#save-choice").click();
    assert.match(await baseline.page.locator("#choice-status").textContent() ?? "", /This manual choice is saved/);
    await baseline.page.goto(url);
    assert.equal(await baseline.page.locator("#test2-choice-status").textContent(), "A manual privacy choice is active in this browser.");
    assert.equal(await baseline.page.locator("#onetrust-banner-sdk").isVisible(), false);
    assert.equal(baseline.requests.length, 6, "a saved manual opt-out must prevent new optional requests");
    const afterCookies = (await baseline.context.cookies(url)).map((cookie) => cookie.name);
    assert.ok(afterCookies.includes("certscore_test2_dns_optout"));
    assert.equal(afterCookies.some((name) => expectedCookieNames.includes(name)), false);
    await baseline.context.close();

    for (const [path, marker] of [
      ["test2-privacy-choices.html", "certscore_test2_optional_off"],
      ["test2-cookie-settings.html", "certscore_test2_optional_off"],
    ] as const) {
      const visitWithChoice = await visit(false);
      await visitWithChoice.page.locator(`a[href="/${path}"]`).click();
      await visitWithChoice.page.locator("#save-choice").click();
      await visitWithChoice.page.goto(url);
      assert.equal(visitWithChoice.requests.length, 6, `${path} should stop later optional requests`);
      assert.equal((await visitWithChoice.context.cookies(url)).some((cookie) => cookie.name === marker), true);
      assert.equal((await visitWithChoice.context.cookies(url)).some((cookie) => expectedCookieNames.includes(cookie.name)), false);
      await visitWithChoice.context.close();
    }
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
