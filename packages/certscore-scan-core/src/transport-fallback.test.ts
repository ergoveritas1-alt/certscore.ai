import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
import { httpTransportFallbackUrl, isNavigationTransportFailure } from "./transport-fallback.js";

test("HTTP transport fallback preserves the complete HTTPS target", () => {
  assert.equal(
    httpTransportFallbackUrl("https://example.com:8443/path?q=1#section"),
    "http://example.com:8443/path?q=1#section",
  );
  assert.equal(httpTransportFallbackUrl("http://example.com/"), null);
  assert.equal(httpTransportFallbackUrl("not a url"), null);
});

test("transport failure classification is bounded to navigation/network failures", () => {
  assert.equal(isNavigationTransportFailure(new Error("page.goto: Timeout 15000ms exceeded")), true);
  assert.equal(isNavigationTransportFailure(new Error("net::ERR_SSL_PROTOCOL_ERROR")), true);
  assert.equal(isNavigationTransportFailure(new Error("HTTP 403 Forbidden")), false);
  assert.equal(isNavigationTransportFailure(new Error("Consent banner was not detected")), false);
});

test("pre-consent navigation recovers through the equivalent HTTP entry URL", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>Recovered public page</h1></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const httpUrl = `http://127.0.0.1:${address.port}/`;
  const httpsUrl = httpUrl.replace(/^http:/, "https:");
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-transport-fallback-"));
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      internalBudgetMs: 10_000,
      normalizedUrl: httpsUrl,
      scanStartedAtMs: Date.now(),
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      url: httpsUrl,
      waitMode: "fast",
    });
    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.equal(result.screenshots[0]?.url, httpUrl);
    assert.ok(result.visualCapture.notes.some((note) => /HTTP entry URL/.test(note)));
    assert.ok(result.networkResponseEvents.some((event) => event.url === httpUrl && event.status === 200));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(tempRoot, { recursive: true, force: true });
  }
});
