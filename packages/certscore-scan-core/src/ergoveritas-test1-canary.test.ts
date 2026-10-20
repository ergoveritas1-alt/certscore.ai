import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer.js";
import { runAccessibilityAudit } from "./accessibility-audit.js";
import { policySurfaceScanner } from "./scanners/policy-surface-scanner.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

const canaryRoot = new URL("../../../infra/aws/ergoveritas-canary/", import.meta.url);
const assets = ["test1.html", "test1-privacy-policy.html", "certscore-review-canary.js"];

async function withCanary(run: (url: string, requests: string[]) => Promise<void>) {
  const contents = new Map(await Promise.all(assets.map(async name => [name, await readFile(new URL(name, canaryRoot))] as const)));
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    const name = new URL(request.url ?? "/", "http://localhost").pathname.slice(1);
    const content = contents.get(name);
    response.writeHead(content ? 200 : 404, { "content-type": name.endsWith(".js") ? "text/javascript" : "text/html" });
    response.end(content ?? "Not found");
  });
  await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await run(`http://localhost:${address.port}/test1.html`, requests);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

test("test1 keeps original choice behavior while exposing three real WCAG barriers and an inert PII form", { timeout: 60_000 }, async () => {
  await withCanary(async (url, localRequests) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const outbound: string[] = [];
      await context.route("https://**/*", async route => {
        outbound.push(route.request().url());
        await route.fulfill({ status: 204, body: "" });
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => document.documentElement.dataset.certscoreCanaryReady === "true");
      assert.equal(outbound.length, 6);
      assert.equal(outbound.some(request => request.includes("promotion.example")), false);
      for (const control of ["#onetrust-accept-btn-handler", "#onetrust-reject-all-handler", "#onetrust-pc-btn-handler"]) {
        assert.equal(await page.locator(control).isVisible(), true);
      }
      assert.equal(await page.locator('a[href="/test1-privacy-policy.html"]').first().isVisible(), true);
      const audit = await runAccessibilityAudit({ page, scanId: "owned-test1-canary", documentIdentity: () => ({ token: "test1-document" }) });
      assert.equal(audit.engineVersion, "4.11.3");
      for (const [ruleId, selector] of [["image-alt", "#test1-missing-alt"], ["label", "#test1-email"], ["button-name", "#test1-unnamed-button"]] as const) {
        const violation = audit.violations.find(row => row.ruleId === ruleId);
        assert.ok(violation?.representativeNodes.some(node => node.selectors.includes(selector)), `${ruleId}: ${JSON.stringify(audit)}`);
        assert.ok(violation.impact === "serious" || violation.impact === "critical");
      }
      await page.locator("#test1-full-name").fill("Synthetic Person");
      await page.locator("#test1-email").fill("synthetic@example.test");
      await page.locator("#test1-preview-enquiry").click();
      assert.match(await page.locator("#test1-form-status").innerText(), /no values have been sent or saved/);
      await page.evaluate(() => (document.querySelector("form") as HTMLFormElement).requestSubmit());
      await page.waitForTimeout(150);
      assert.equal(page.url(), url);
      assert.equal(localRequests.some(request => /POST|demo-submit|Synthetic|synthetic%40/.test(request)), false);
      assert.equal(outbound.length, 6);
      const state = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      assert.doesNotMatch(state, /Synthetic Person|synthetic@example/);
      await page.locator("#onetrust-accept-btn-handler").click();
      assert.equal(await page.locator("#onetrust-banner-sdk").isVisible(), true, "Accept remains an unimplemented comparison, not a fabricated confirmation");
      await page.locator("#onetrust-reject-all-handler").click();
      await page.waitForFunction(() => localStorage.getItem("certscore_test1_consent_state") === "denied");
      await page.waitForTimeout(150);
      assert.equal(outbound.length, 7);
      assert.match(outbound[6]!, /en=reject_ignored/);
      assert.equal(await page.locator("#onetrust-banner-sdk").isVisible(), false);
      await page.evaluate(() => (document.querySelector("form") as HTMLFormElement).submit());
      await page.waitForTimeout(150);
      assert.equal(page.url(), url);
      assert.equal(localRequests.some(request => /POST|demo-submit/.test(request)), false);
      await context.close();

      const noScript = await browser.newContext({ javaScriptEnabled: false });
      const noScriptPage = await noScript.newPage();
      await noScriptPage.goto(url);
      const formRequests: string[] = [];
      noScriptPage.on("request", request => formRequests.push(request.url()));
      await noScriptPage.locator("#test1-email").fill("synthetic@example.test");
      await noScriptPage.locator("#test1-email").press("Enter");
      await noScriptPage.evaluate(() => (document.querySelector("form") as HTMLFormElement).submit());
      await noScriptPage.waitForTimeout(150);
      assert.equal(noScriptPage.url(), url);
      assert.deepEqual(formRequests, []);
      assert.equal(localRequests.some(request => /POST|demo-submit/.test(request)), false);
      await noScript.close();
    } finally {
      await browser.close();
    }
  });
});

test("test1 scanner retains the PII inventory, local notice and concealed link without following or submitting them", { timeout: 60_000 }, async () => {
  await withCanary(async (url, requests) => {
    const root = await mkdtemp(path.join(tmpdir(), "certscore-test1-runtime-"));
    try {
      const result = await preConsentRuntimeScanner({
        url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 12_000,
        artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence",
        screenshotMode: "never", waitMode: "fast",
        routeFulfillers: [{ urlPattern: /^https:\/\//, status: 204, body: "", contentType: "text/plain" }],
      });
      const form = result.collectionSurfaceInventory?.forms.find(row => row.title === "Demo service enquiry");
      assert.ok(form, JSON.stringify(result.collectionSurfaceInventory));
      assert.equal(form.retainedFieldCount, 5);
      for (const category of ["name", "email", "phone", "address", "free_text"]) {
        assert.ok(form.fields.some(field => field.semanticCategory === category), `${category}: ${JSON.stringify(form.fields)}`);
      }
      assert.equal(form.method, "post");
      assert.ok(form.privacyDisclosure?.excerpts.some(excerpt => excerpt.links.some(link => link.url === new URL("test1-privacy-policy.html", url).href)));
      assert.equal(requests.some(request => /POST|demo-submit/.test(request)), false);
      const integrity = result.siteIntegrityObservation;
      assert.ok(integrity);
      assert.equal(integrity.links.length, 1);
      assert.equal(integrity.links[0]?.destinationDomain, "promotion.example");
      assert.equal(integrity.links[0]?.concealment, "offscreen_position");
      assert.match(integrity.links[0]?.codeProof?.lines.join("\n") ?? "", /left:-9999px/);
      assert.equal(result.networkEvents.some(event => event.requestUrl.includes("promotion.example")), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

test("test1 policy is visibly discoverable and retains source-bound transparency sections without a model call", { timeout: 60_000 }, async () => {
  await withCanary(async url => {
    const root = await mkdtemp(path.join(tmpdir(), "certscore-test1-policy-"));
    try {
      const result = await policySurfaceScanner({
        url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 12_000,
        discoveryMode: "fast", artifactWriter: await createArtifactWriter(root),
        nanoAssistProvider: { async classifyLinks() { throw new Error("The explicit owned policy needs no model-assisted discovery"); } },
      });
      const policy = result.policySurfaceObservations.find(row => row.surfaceType === "privacy_policy" && row.status === "fetched" && row.normalizedUrl.endsWith("/test1-privacy-policy.html"));
      assert.ok(policy, JSON.stringify(result.policySurfaceObservations));
      const topics = policy.retainedArticle13SectionEvidence.filter(row => row.signalObserved === "observed").map(row => row.coverageArea);
      for (const topic of ["controller_contact", "processing_purposes", "legal_basis", "recipients_or_vendor_categories", "data_retention", "data_subject_rights", "international_transfers", "supervisory_authority", "automated_decision_making_or_profiling"]) {
        assert.ok(topics.includes(topic as typeof topics[number]), `${topic}: ${topics.join(", ")}`);
      }
      for (const row of policy.retainedArticle13SectionEvidence.filter(row => row.signalObserved === "observed")) {
        assert.equal(row.selectedPolicySectionUrl, new URL("test1-privacy-policy.html", url).href);
        assert.match(row.evidenceTextSha256 ?? "", /^[a-f0-9]{64}$/);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
