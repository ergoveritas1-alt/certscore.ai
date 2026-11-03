import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer";
import { chromiumLaunchOptions } from "./playwright-runtime";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";
import { startStaticFixtureServer } from "./test-fixtures/static-server";
import { retainCommittedConsentHttpStatus } from "./consent-committed-response";
import type { ConsentGeometryAccessDiagnostic } from "./consent-geometry-access";

test("committed status only completes loaded, successful, same-loader access evidence", () => {
  const binding = { url: "https://example.test/", documentIdentity: { source: "cdp_loader_id" as const, token: "synthetic-loader" } };
  const response = { ...binding, httpStatus: 200 };
  const access: ConsentGeometryAccessDiagnostic = { status: "loaded", reasonCodes: [] };
  assert.deepEqual(retainCommittedConsentHttpStatus(access, response, binding, binding), { ...access, httpStatus: 200 });
  assert.doesNotMatch(JSON.stringify(retainCommittedConsentHttpStatus(access, response, binding, binding)), /synthetic-loader|example\.test|documentIdentity|documentRevision/);
  assert.deepEqual(access, { status: "loaded", reasonCodes: [] });
  for (const update of [{ httpStatus: 0 }, { httpStatus: 199 }, { httpStatus: 300 }, { httpStatus: 403 },
    { httpStatus: 200.5 }, { url: "https://other.test/" }, { url: "file:///private" },
    { documentIdentity: undefined }, { documentIdentity: { source: "cdp_loader_id" as const, token: "replacement" } }])
    assert.equal(retainCommittedConsentHttpStatus(access, { ...response, ...update }, binding, binding), access);
  for (const status of ["unknown", "timeout", "access_no_go", "navigation_error", "rate_limited_or_security_challenge"] as const) {
    const limited = { ...access, status };
    assert.equal(retainCommittedConsentHttpStatus(limited, response, binding, binding), limited);
  }
  for (const limited of [{ ...access, httpStatus: 403 }, { ...access, reasonCodes: ["bot_security_check"] }])
    assert.equal(retainCommittedConsentHttpStatus(limited, response, binding, binding), limited);
  assert.equal(retainCommittedConsentHttpStatus(access, undefined, binding, binding), access);
  assert.equal(retainCommittedConsentHttpStatus(access, response, binding,
    { ...binding, documentIdentity: { ...binding.documentIdentity, token: "same-url-new-loader" } }), access);
  // The access read can finish on the original document before a later geometry
  // read observes a replacement. The artifact write must compare that geometry.
  const replacementGeometry = { ...binding, documentIdentity: { ...binding.documentIdentity, token: "geometry-replacement-loader" } };
  assert.equal(retainCommittedConsentHttpStatus(access, response, replacementGeometry, replacementGeometry), access);
  assert.equal(retainCommittedConsentHttpStatus(access, response, { ...binding, documentIdentity: undefined }, binding), access);
});

for (const scenario of ["stable", "server_redirect", "same_url_replacement"] as const)
test(`consent committed response: ${scenario} retains only its own status after a DOM readiness timeout`, async () => {
  const server = await startStaticFixtureServer();
  const root = await mkdtemp(join(tmpdir(), "certscore-committed-response-"));
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  let navigations = 0, injectedTimeouts = 0, contexts = 0, documentRequests = 0, unexpectedRequests = 0;
  const targetUrl = server.urlFor("consent-cmp-static-canonical-controls");
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    contexts++;
    const context = await newContext({ ...options, serviceWorkers: "block" });
    await context.route("**/*", route => {
      // The fixture owns its CMP markup; satisfy its exact script locally.
      if (route.request().url() === "https://consent.cookiebot.com/uc.js" && route.request().method() === "GET")
        return route.fulfill({ contentType: "application/javascript", body: "/* synthetic fixture CMP script */" });
      if (new URL(route.request().url()).origin === new URL(targetUrl).origin) return route.continue();
      unexpectedRequests++; return route.abort("blockedbyclient");
    });
    if (scenario === "server_redirect") await context.route("**/redirect-start", route =>
      route.fulfill({ status: 302, headers: { location: targetUrl }, body: "" }));
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      page.on("request", request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++; });
      const goto = page.goto.bind(page), wait = page.waitForLoadState.bind(page);
      page.goto = async (...args) => {
        navigations++;
        const response = await goto(...args);
        if (scenario === "same_url_replacement") await page.reload({ waitUntil: "commit" });
        return response;
      };
      page.waitForLoadState = async (...args) => {
        if (args[0] === "domcontentloaded" && injectedTimeouts++ === 0)
          throw new Error("page.waitForLoadState: Timeout 15000ms exceeded");
        return wait(...args);
      };
      return page;
    };
    return context;
  };
  try {
    const url = scenario === "server_redirect" ? new URL("/redirect-start", targetUrl).href : targetUrl;
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url,
      scanStartedAtMs: Date.now(), internalBudgetMs: 8_000, browser,
      artifactWriter: await createArtifactWriter(root), captureScope: "consent_proof",
      screenshotMode: "always", screenshotCaptureMode: "viewport_first", waitMode: "fast" });
    assert.equal(injectedTimeouts > 0, true);
    assert.equal(navigations, 1);
    assert.equal(contexts, 1);
    assert.equal(unexpectedRequests, 0);
    assert.equal(documentRequests, scenario === "stable" ? 1 : 2);
    assert.ok(result.moduleRun.recoveryDiagnostics?.attempts.some(a => a.outcome === "committed_timeout"));
    assert.equal(result.moduleRun.recoveryDiagnostics?.attempts.length, 1);
    assert.ok(!result.moduleRun.timingBreakdown?.some(t => t.label === "page evidence: late accessibility consent retry"));
    const geometry = JSON.parse(await readFile(join(root, "ConsentControlGeometryEvidence.json"), "utf8"));
    assert.equal(geometry.access.status, "loaded");
    assert.equal(geometry.access.httpStatus, scenario === "same_url_replacement" ? undefined : 200);
    assert.equal(geometry.documentIdentity.token, result.consentUiObservations[0]?.documentIdentity?.token);
  } finally {
    await browser.close(); await server.close(); await rm(root, { recursive: true, force: true });
  }
});
