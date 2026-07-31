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
  classifyNavigationFailure,
  httpsTransportUpgradeUrl,
  httpTransportFallbackUrl,
  isLikelyInfrastructureHomepageTarget,
  isNavigationTransportFailure,
  isPendingMainDocumentStatus,
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

test("HTTPS transport upgrade preserves the complete HTTP target", () => {
  assert.equal(
    httpsTransportUpgradeUrl("http://example.com:8080/path?q=1#section"),
    "https://example.com:8080/path?q=1#section",
  );
  assert.equal(httpsTransportUpgradeUrl("https://example.com/"), null);
  assert.equal(httpsTransportUpgradeUrl("not a url"), null);
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
    "https://www.example.com/path",
    "http://example.com/path",
    "http://www.example.com/path",
  ]);
  assert.deepEqual(navigationTransportRecoveryUrls("http://example.com/path"), [
    "https://example.com/path",
    "https://www.example.com/path",
    "http://www.example.com/path",
  ]);
});

test("navigation failures distinguish target, TLS, and unresolved route failures", () => {
  assert.equal(
    classifyNavigationFailure(new Error("net::ERR_CERT_COMMON_NAME_INVALID"), "https://example.com/"),
    "tls_or_certificate_error",
  );
  assert.equal(
    classifyNavigationFailure(new Error("net::ERR_CONNECTION_REFUSED"), "https://example.com/"),
    "target_unreachable_or_unsuitable",
  );
  assert.equal(
    classifyNavigationFailure(new Error("net::ERR_TUNNEL_CONNECTION_FAILED"), "https://example.com/"),
    "navigation_transport_failure",
  );
  assert.equal(
    classifyNavigationFailure(new Error("page.goto: Timeout 7500ms exceeded"), "https://cdn-kaspi.kz/"),
    "target_unreachable_or_unsuitable",
  );
  assert.equal(isLikelyInfrastructureHomepageTarget("https://alicdn.com/"), true);
  assert.equal(isLikelyInfrastructureHomepageTarget("https://cdn-kaspi.kz/"), true);
  assert.equal(isLikelyInfrastructureHomepageTarget("https://ad-srv.net/"), true);
  assert.equal(isLikelyInfrastructureHomepageTarget("https://codeable.io/"), false);
});

test("transient response retry is bounded", () => {
  assert.equal(isTransientMainDocumentStatus(429), true);
  assert.equal(isTransientMainDocumentStatus(503), true);
  assert.equal(isTransientMainDocumentStatus(404), false);
  assert.equal(isPendingMainDocumentStatus(202), true);
  assert.equal(isPendingMainDocumentStatus(200), false);
  assert.equal(boundedRetryAfterMs("0"), 0);
  assert.equal(boundedRetryAfterMs("10"), 2_000);
  assert.equal(boundedRetryAfterMs("invalid"), 500);
});

test("pre-consent navigation recovers one sparse pending 202 document", async () => {
  let browserDocumentRequestCount = 0;
  const server = createServer((request, response) => {
    const isBrowserDocument = request.headers["sec-fetch-dest"] === "document";
    if (isBrowserDocument) browserDocumentRequestCount += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (isBrowserDocument && browserDocumentRequestCount === 1) {
      response.writeHead(202);
      response.end("<!doctype html><html><body></body></html>");
      return;
    }
    response.writeHead(200);
    response.end("<!doctype html><html><body><h1>Recovered pending public page</h1><p>Privacy choices and public navigation are available.</p></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-pending-document-recovery-"));
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
    assert.ok(browserDocumentRequestCount >= 2);
    assert.ok(result.moduleRun.recoveryDiagnostics?.modes.includes("pending_document_passive_wait"));
    assert.ok(result.moduleRun.recoveryDiagnostics?.modes.includes("pending_document_same_region_retry"));
    assert.ok(result.domSnapshots.some((snapshot) => /Recovered pending public page/.test(snapshot.textExcerpt)));
    assert.ok(result.networkResponseEvents.some((event) => event.status === 202));
    assert.ok(result.networkResponseEvents.some((event) => event.status === 200));
  } finally {
    server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pre-consent runtime retains delayed consent controls after a sparse pending 202 document", async () => {
  let browserDocumentRequestCount = 0;
  const server = createServer((request, response) => {
    const isBrowserDocument = request.headers["sec-fetch-dest"] === "document";
    if (isBrowserDocument) browserDocumentRequestCount += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (isBrowserDocument && browserDocumentRequestCount === 1) {
      response.writeHead(202);
      response.end("<!doctype html><html><body></body></html>");
      return;
    }
    response.writeHead(200);
    response.end(`<!doctype html><html><body><main id="app"></main><script>
      setTimeout(() => {
        const make = (codes) => String.fromCharCode(...codes);
        const section = document.createElement("section");
        section.setAttribute("role", "dialog");
        section.setAttribute("aria-label", make([67, 104, 111, 105, 99, 101, 115]));
        for (const codes of [
          [65, 99, 99, 101, 112, 116, 32, 97, 108, 108],
          [82, 101, 106, 101, 99, 116, 32, 97, 108, 108],
          [67, 111, 111, 107, 105, 101, 32, 115, 101, 116, 116, 105, 110, 103, 115],
        ]) {
          const button = document.createElement("button");
          button.textContent = make(codes);
          section.appendChild(button);
        }
        document.getElementById("app").appendChild(section);
      }, 3000);
    </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-pending-document-delayed-consent-"));
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      internalBudgetMs: 12_000,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      screenshotCaptureMode: "viewport_first",
      screenshotMode: "always",
      url,
      waitMode: "fast",
    });
    const observation = result.consentUiObservations[0];
    const timingLabels = result.moduleRun.timingBreakdown?.map((entry) => entry.label) ?? [];
    assert.ok(browserDocumentRequestCount >= 2);
    assert.equal(observation?.acceptControlObserved, true);
    assert.equal(observation?.rejectControlObserved, true);
    assert.equal(observation?.managePreferencesControlObserved, true);
    assert.equal(
      observation?.basis.includes("recapture:late_accessibility_tree"),
      true,
      "delayed controls should be retained by the pending-document accessibility retry",
    );
    assert.equal(
      timingLabels.includes("page evidence: late accessibility consent retry"),
      true,
      "pending-document recovery should schedule the bounded late accessibility retry",
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(tempRoot, { recursive: true, force: true });
  }
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

test("pre-consent navigation gives a strong 403 challenge one bounded passive same-region retry", async () => {
  let requestCount = 0;
  const server = createServer((request, response) => {
    const browserDocumentRequest = request.headers["sec-fetch-dest"] === "document";
    if (browserDocumentRequest) requestCount += 1;
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (browserDocumentRequest && requestCount === 1) {
      response.writeHead(403);
      response.end("<!doctype html><html><body><h1>Checking your browser</h1><p>Performing security verification.</p></body></html>");
      return;
    }
    response.writeHead(200);
    response.end("<!doctype html><html><body><h1>Recovered public site</h1><p>Products, company information, support, news, and public navigation are now available.</p></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-challenge-recovery-"));
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      internalBudgetMs: 12_000,
      normalizedUrl: url,
      scanStartedAtMs: Date.now(),
      screenshotMode: "selective",
      url,
      waitMode: "fast",
    });
    assert.ok(requestCount >= 2);
    assert.ok(result.moduleRun.recoveryDiagnostics?.modes.includes("security_challenge_passive_wait"));
    assert.ok(result.moduleRun.recoveryDiagnostics?.modes.includes("security_challenge_same_region_retry"));
    assert.ok(result.domSnapshots.some((snapshot) => /Recovered public site/.test(snapshot.textExcerpt)));
  } finally {
    server.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
