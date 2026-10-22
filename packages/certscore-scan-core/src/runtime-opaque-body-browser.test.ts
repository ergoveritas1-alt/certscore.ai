import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";

test("opaque POST reaches passive network, same-Request response and GPC observation", { timeout: 30_000 }, async () => {
  const server = createServer((request, response) => {
    if (request.url === "/collect") { response.writeHead(204); response.end(); return; }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><title>Opaque body fixture</title><h1>Passive capture fixture</h1><p>Read-only capture of a fixture request.</p><script>fetch("/collect",{method:"POST",body:"private-fixture-payload"})</script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(path.join(tmpdir(), "certscore-opaque-runtime-"));
  const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  let injected = 0;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options);
    context.on("page", page => page.on("request", request => {
      if (request.url() === `${url}collect`) {
        injected++;
        request.postData = () => { throw Error("opaque-private-fixture-payload"); };
      }
    }));
    return context;
  };
  try {
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 10_000,
      artifactWriter: await createArtifactWriter(root), browser, captureScope: "runtime_evidence", screenshotMode: "never", waitMode: "fast",
      globalPrivacyControlEnabled: true, gpcOptOutPrototype: { scanId: "opaque-runtime" } });
    assert.equal(injected, 1);
    const request = result.networkEvents.find(row => row.requestUrl === `${url}collect`);
    assert.ok(request, JSON.stringify(result.moduleRun));
    assert.equal(request.requestPayloadSignals, undefined);
    assert.equal(result.networkResponseEvents.find(row => row.requestId === request.requestId)?.status, 204);
    assert.ok(result.gpcObservationSession?.requests.some(row => row.eventId === request.eventId));
    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.doesNotMatch(JSON.stringify({ request, session: result.gpcObservationSession, trace: result.formDestinationTrace }), /private-fixture-payload/);
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
