import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer.js";
import { deriveRuntimeCoverageSummary } from "./index.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
import { startStaticFixtureServer } from "./test-fixtures/static-server.js";

for (const failure of ["timeout", "rejected", "recovered", "timeout_recovered"] as const) {
  test(`runtime inventory ${failure} retains honest coverage despite usable network evidence`, async (t) => {
    const server = await startStaticFixtureServer();
    const browser = await chromium.launch({ headless: true });
    const root = await mkdtemp(path.join(tmpdir(), "certscore-runtime-inventory-"));
    let snapshotCalls = 0;
    const newContext = browser.newContext.bind(browser);
    t.mock.method(browser, "newContext", async (...args) => {
      const context = await newContext(...args);
      const newPage = context.newPage.bind(context);
      t.mock.method(context, "newPage", async () => {
        const page = await newPage();
        const evaluate = page.evaluate.bind(page);
        t.mock.method(page, "evaluate", (fn, arg) => {
          // Intercept only the atomic runtime snapshot; run navigation, probes,
          // network collection and bounded fallback reads in real Chromium.
          if (arg && typeof arg === "object" && "maxFieldCandidates" in arg && "integrityLimits" in arg) {
            snapshotCalls++;
            if (failure === "timeout" || (failure === "timeout_recovered" && snapshotCalls === 1)) return new Promise(() => {});
            if (failure === "rejected" || snapshotCalls === 1) return Promise.reject(new Error("fixture snapshot unavailable"));
          }
          return evaluate(fn, arg);
        });
        return page;
      });
      return context;
    });
    try {
      const url = server.urlFor("policy-footer-privacy");
      const result = await preConsentRuntimeScanner({
        url, normalizedUrl: url, browser,
        scanStartedAtMs: Date.now(), internalBudgetMs: 20_000,
        artifactWriter: await createArtifactWriter(path.join(root, "out")),
        captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      });
      assert.equal(snapshotCalls, 2);
      assert.ok(result.networkEvents.length > 0, "independently observed requests survive");
      const coverage = deriveRuntimeCoverageSummary({
        enabledModules: ["preConsentRuntimeScanner"], modulesRun: [result.moduleRun],
        cookieEvents: result.cookieEvents, cookieSnapshots: result.cookieSnapshots,
        networkEvents: result.networkEvents, normalizedVendorObservations: [], observedJourneys: [],
      });
      if (failure === "recovered" || failure === "timeout_recovered") {
        assert.ok(result.collectionSurfaceInventory, "successful retry retains an inspected inventory, including empty inventory");
        assert.equal(result.moduleRun.status, "completed");
        assert.equal(coverage.coverageStatus, "usable");
      } else {
        assert.equal(result.scriptEvents.length, 0);
        assert.equal(result.collectionSurfaceInventory, undefined);
        assert.equal(result.moduleRun.status, "partial");
        assert.equal(coverage.coverageStatus, "limited_partial");
        assert.ok(coverage.limitationKeys.includes("runtime_page_inventory_unavailable"));
        assert.match(coverage.notes.join(" "), /absence.*not established/i);
      }
      if (failure === "timeout") {
        const timings = result.moduleRun.timingBreakdown ?? [];
        for (const label of ["page evidence: consolidated snapshot", "page evidence: consolidated snapshot retry"]) {
          assert.equal(timings.find(row => row.label === label)?.outcome, "timed_out");
        }
      }
    } finally {
      await browser.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

// A streamed main document reproduces a successful atomic read of an unfinished
// parser. Retaining its early evidence must not imply complete DOM coverage.
for (const streaming of [true, false]) {
  test(`runtime inventory on ${streaming ? "loading" : "parsed"} document preserves evidence and honest coverage`, async () => {
    const { createServer } = await import("node:http");
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.write(`<html><body><h1>Public information</h1><p>${"Visible public content. ".repeat(80)}</p><script>window.earlyEvidence = true;</script>`);
      if (!streaming) response.end('<script>window.laterEvidence = true;</script></body></html>');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as import("node:net").AddressInfo).port;
    const url = `http://127.0.0.1:${port}/`;
    const browser = await chromium.launch({ headless: true });
    const root = await mkdtemp(path.join(tmpdir(), "certscore-runtime-loading-"));
    try {
      const result = await preConsentRuntimeScanner({
        url, normalizedUrl: url, browser,
        scanStartedAtMs: Date.now(), internalBudgetMs: 22_000,
        artifactWriter: await createArtifactWriter(path.join(root, "out")),
        captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      });
      const coverage = deriveRuntimeCoverageSummary({
        enabledModules: ["preConsentRuntimeScanner"], modulesRun: [result.moduleRun],
        cookieEvents: result.cookieEvents, cookieSnapshots: result.cookieSnapshots,
        networkEvents: result.networkEvents, normalizedVendorObservations: [], observedJourneys: [],
      });
      assert.ok(result.scriptEvents.length >= 1, "early DOM evidence survives");
      assert.ok(result.networkEvents.length >= 1, "independent network evidence survives");
      assert.ok(result.collectionSurfaceInventory, "snapshot inventory is retained");
      assert.equal(result.collectionSurfaceInventory.coverage.status, streaming ? "limited" : "complete");
      assert.equal(result.collectionSurfaceInventory.coverage.reasonCodes.includes("document_still_loading"), streaming);
      assert.equal(result.moduleRun.timingBreakdown?.find(row => row.label === "page evidence: consolidated snapshot")?.outcome, "completed");
      assert.equal(coverage.coverageStatus, streaming ? "limited_partial" : "usable");
      assert.equal(coverage.limitationKeys.includes("runtime_page_inventory_document_loading"), streaming);
      if (streaming) assert.match(coverage.notes.join(" "), /absence is not established/);
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}

for (const gpc of [false, true]) {
test(`${gpc ? "GPC preserves" : "baseline advances"} sparse-page settling order after readiness timeout`, async (t) => {
  const { createServer } = await import("node:http");
  const pending = new Set<import("node:http").ServerResponse>();
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.write('<html><head><title>Delayed contact form</title>');
    pending.add(response);
    response.on('close', () => pending.delete(response));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
  const browser = await chromium.launch({ headless: true });
  const root = await mkdtemp(path.join(tmpdir(), "runtime-late-form-"));
  let readinessReads = 0, snapshots = 0;
  const newContext = browser.newContext.bind(browser);
  t.mock.method(browser, "newContext", async (...args) => {
    const context = await newContext(...args);
    const newPage = context.newPage.bind(context);
    t.mock.method(context, "newPage", async () => {
      const page = await newPage();
      const waitForFunction = page.waitForFunction.bind(page);
      t.mock.method(page, "waitForFunction", (fn, arg, options) => {
        if (String(fn).includes('document.readyState')) {
          readinessReads++;
          if (readinessReads === 1) return Promise.reject(new Error('Fixture navigation readiness timeout'));
          // The body arrives during the existing confirmation allowance.
          for (const response of pending) response.end('</head><body><h1>Contact</h1><form><input type="email"><p>Personal data is used for handling your request.</p></form></body></html>');
        }
        return waitForFunction(fn, arg, options);
      });
      const evaluate = page.evaluate.bind(page);
      t.mock.method(page, "evaluate", (fn, arg) => {
        if (arg && typeof arg === "object" && "maxFieldCandidates" in arg) snapshots++;
        return evaluate(fn, arg);
      });
      return page;
    });
    return context;
  });
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, browser, scanStartedAtMs: Date.now(), internalBudgetMs: 20_000,
      artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast", globalPrivacyControlEnabled: gpc });
    assert.equal(readinessReads, gpc ? 1 : 2);
    assert.equal(snapshots, 1, 'settle before capture rather than adding a snapshot retry');
    assert.equal(result.collectionSurfaceInventory?.coverage.status, gpc ? 'limited' : 'complete');
    assert.equal(result.collectionSurfaceInventory?.forms.length, gpc ? 0 : 1);
    if (!gpc) assert.match(result.collectionSurfaceInventory?.forms[0]?.privacyDisclosure?.excerpts[0]?.text ?? '', /handling your request/);
    const timings = result.moduleRun.timingBreakdown ?? [];
    assert.equal(timings.filter(row => row.label === 'no-go candidate confirmation wait').length, 1);
    const confirmationBeforeSnapshot = timings.findIndex(row => row.label === 'no-go candidate confirmation wait') < timings.findIndex(row => row.label === 'page evidence: consolidated snapshot');
    assert.equal(confirmationBeforeSnapshot, !gpc);
    assert.equal(result.moduleRun.errors?.includes('Runtime page inventory captured while the document was loading; later DOM content may be missing.'), gpc);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

}
