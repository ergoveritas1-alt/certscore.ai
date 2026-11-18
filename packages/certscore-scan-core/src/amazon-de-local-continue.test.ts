import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { canTestAmazonDeContinueLocally, tryAmazonDeLocalContinue } from "./amazon-de-local-continue.js";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

const homepage = "https://www.amazon.de/";
const challengePath = "/errors_page/validateCaptcha";
const challengeText = "Klicke auf die Schaltfläche unten, um mit dem Einkauf fortzufahren";

test("the continuation requires the local simulator and the exact Amazon.de homepage", () => {
  const env = { CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true", CERTSCORE_LOCAL_AMAZON_CONTINUE_ENABLED: "true" };
  assert.equal(canTestAmazonDeContinueLocally(env, homepage), true);
  assert.equal(canTestAmazonDeContinueLocally(env, "https://amazon.de/"), true);
  for (const url of ["https://www.amazon.de/help", "https://www.amazon.de/?x=1", "https://www.amazon.com/", "http://www.amazon.de/"]) {
    assert.equal(canTestAmazonDeContinueLocally(env, url), false);
  }
  assert.equal(canTestAmazonDeContinueLocally({}, homepage), false);
  assert.equal(canTestAmazonDeContinueLocally({ ...env, NODE_ENV: "production" }, homepage), false);
});

test("the reviewed one-button form gets one click and requires a verified storefront", async () => {
  const browser = await chromium.launch();
  try {
    for (const scenario of ["storefront", "challenge persists", "visible answer", "different endpoint"] as const) {
      const page = await browser.newPage({ offline: true });
      let submissions = 0;
      const action = scenario === "different endpoint" ? "/other" : challengePath;
      const form = `<p>${challengeText}</p><form action="${action}" method="get">
        <input name="fixture" type="hidden" value="test">
        ${scenario === "visible answer" ? '<input name="answer">' : ""}
        <button type="submit">Weiter shoppen</button></form>`;
      try {
        await page.route("**/*", async route => {
          const url = new URL(route.request().url());
          assert.equal(url.origin, new URL(homepage).origin);
          if (url.pathname === challengePath) {
            submissions += 1;
            assert.equal(route.request().method(), "GET");
          }
          await route.fulfill({ contentType: "text/html; charset=utf-8", body: submissions && scenario === "storefront"
            ? '<script>history.replaceState(null, "", "/");</script><h1>Amazon.de storefront</h1><input id="twotabsearchtextbox" aria-label="Search Amazon.de">'
            : form });
        });
        await page.goto(homepage);
        const result = await tryAmazonDeLocalContinue(page, 2_000);
        const expectedClicks = scenario === "visible answer" || scenario === "different endpoint" ? 0 : 1;
        assert.equal(result.attempted, expectedClicks === 1, scenario);
        assert.equal(submissions, expectedClicks, scenario);
        assert.equal(result.storefrontVerified, scenario === "storefront", scenario);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("runtime capture attempts the continuation after the Amazon.de pending document settles", { timeout: 20_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "amazon-de-pending-"));
  const flags = {
    CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
    CERTSCORE_LOCAL_AMAZON_CONTINUE_ENABLED: "true",
  };
  const previousFlags = Object.entries(flags).map(([name]) => [name, process.env[name]] as const);
  Object.assign(process.env, flags);
  try {
    const form = `<p>${challengeText}</p><form action="${challengePath}" method="get">
      <input type="hidden" name="fixture" value="pending"><button type="submit">Weiter shoppen</button></form>
      <footer>Unsere AGB Datenschutzerklärung © 1996–2025, Amazon.com, Inc. oder Tochtergesellschaften</footer>`;
    const storefront = `<script>history.replaceState(null, "", "/");</script>
      <main><h1>Amazon.de storefront</h1><input id="twotabsearchtextbox" aria-label="Search Amazon.de">
      <p>Find books, clothing and electronics across the public storefront. Browse products, explore offers and compare prices.</p></main>`;
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(root),
      captureScope: "runtime_evidence",
      internalBudgetMs: 12_000,
      normalizedUrl: homepage,
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: homepage,
      waitMode: "fast",
      routeFulfillers: [
        { urlPattern: "**/*", status: 404 },
        {
          urlPattern: homepage,
          status: 202,
          contentType: "text/html; charset=utf-8",
          body: `<body><script>setTimeout(() => {
            document.body.innerHTML = ${JSON.stringify(form)};
          }, 250);</script></body>`,
        },
        {
          urlPattern: /^https:\/\/www\.amazon\.de\/errors_page\/validateCaptcha\?/,
          contentType: "text/html; charset=utf-8",
          body: storefront,
        },
      ],
    });
    assert.ok(result.moduleRun.recoveryDiagnostics?.modes.includes("pending_document_passive_wait"));
    const attempts = result.moduleRun.recoveryDiagnostics?.attempts ?? [];
    assert.equal(attempts[0]?.httpStatus, 202);
    assert.deepEqual(
      attempts.filter(attempt => attempt.mode === "local_amazon_de_continue").map(attempt => attempt.outcome),
      ["success"],
      JSON.stringify({ diagnostics: result.moduleRun.recoveryDiagnostics, notes: result.moduleRun.notes,
        snapshots: result.domSnapshots.map(snapshot => snapshot.textExcerpt) }),
    );
    assert.ok(result.domSnapshots.some(snapshot => snapshot.textExcerpt.includes("Amazon.de storefront")));
  } finally {
    for (const [name, original] of previousFlags) {
      if (original === undefined) delete process.env[name];
      else process.env[name] = original;
    }
    await rm(root, { recursive: true, force: true });
  }
});
