import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createArtifactWriter } from "./artifact-writer.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";
import {
  alternateWwwNavigationUrl,
  boundedRetryAfterMs,
  httpTransportFallbackUrl,
  isNavigationTransportFailure,
  isTransientMainDocumentStatus,
  navigationTransportRecoveryUrls,
} from "./transport-fallback.js";

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
  assert.equal(isNavigationTransportFailure(new Error("net::ERR_TUNNEL_CONNECTION_FAILED")), true);
  assert.equal(isNavigationTransportFailure(new Error("net::ERR_INVALID_AUTH_CREDENTIALS")), true);
  assert.equal(isNavigationTransportFailure(new Error("net::ERR_HTTP_RESPONSE_CODE_FAILURE")), true);
  assert.equal(isNavigationTransportFailure(new Error("HTTP 403 Forbidden")), false);
  assert.equal(isNavigationTransportFailure(new Error("Consent banner was not detected")), false);
});

test("entry navigation recovery stays on bounded apex/www and protocol variants", () => {
  assert.equal(alternateWwwNavigationUrl("https://example.co.uk/path?q=1"), "https://www.example.co.uk/path?q=1");
  assert.equal(alternateWwwNavigationUrl("https://www.example.co.uk/path"), "https://example.co.uk/path");
  assert.equal(alternateWwwNavigationUrl("https://shop.example.co.uk/path"), null);
  assert.equal(alternateWwwNavigationUrl("https://127.0.0.1/path"), null);
  assert.deepEqual(navigationTransportRecoveryUrls("https://example.com/path"), [
    "http://example.com/path",
    "https://www.example.com/path",
    "http://www.example.com/path",
  ]);
});

test("transient response retry is bounded", () => {
  assert.equal(isTransientMainDocumentStatus(429), true);
  assert.equal(isTransientMainDocumentStatus(503), true);
  assert.equal(isTransientMainDocumentStatus(404), false);
  assert.equal(boundedRetryAfterMs("0"), 0);
  assert.equal(boundedRetryAfterMs("10"), 2_000);
  assert.equal(boundedRetryAfterMs("invalid"), 500);
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
    assert.ok(result.visualCapture.notes.some((note) => /recovered through http:/i.test(note)));
    assert.ok(result.networkResponseEvents.some((event) => event.url === httpUrl && event.status === 200));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent navigation retries one transient main-document response", async () => {
  let browserDocumentRequestCount = 0;
  const server = createServer((request, response) => {
    const isBrowserDocument = request.headers["sec-fetch-dest"] === "document";
    if (isBrowserDocument) browserDocumentRequestCount += 1;
    if (isBrowserDocument && browserDocumentRequestCount === 1) {
      response.writeHead(503, { "content-type": "text/html; charset=utf-8", "retry-after": "0" });
      response.end("<!doctype html><html><body><h1>Temporarily unavailable</h1></body></html>");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><html><body><h1>Recovered after retry</h1></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-status-retry-"));
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      internalBudgetMs: 10_000,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      url,
      waitMode: "fast",
    });
    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.equal(browserDocumentRequestCount >= 2, true);
    assert.ok(result.domSnapshots.some((snapshot) => /Recovered after retry/.test(snapshot.textExcerpt)));
    assert.ok(result.visualCapture.notes.some((note) => /transient HTTP 503/i.test(note)));
    assert.ok(result.networkResponseEvents.some((event) => event.status === 503));
    assert.ok(result.networkResponseEvents.some((event) => event.status === 200));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(tempRoot, { recursive: true, force: true });
  }
});
