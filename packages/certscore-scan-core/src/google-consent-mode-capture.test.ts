import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { networkEventSchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";

test("runtime producer retains request-bound denied-storage context with no interaction or invented cookie", async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end('<!doctype html><title>Consent measurement fixture</title><p>Public page</p><img alt="" src="https://www.google-analytics.com/g/collect?gcs=G100&amp;gcd=13p3p3p2p5l1&amp;npa=1&amp;cid=fixture-private">');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/`;
  const outDir = await mkdtemp(path.join(tmpdir(), "consent-mode-fixture-"));
  try {
    const result = await preConsentRuntimeScanner({
      url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 6000,
      artifactWriter: await createArtifactWriter(outDir), captureScope: "runtime_evidence",
      waitMode: "fast", screenshotMode: "never",
      routeFulfillers: [{ urlPattern: /^https:\/\/www\.google-analytics\.com\/g\/collect\?/, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }],
    });
    const event = result.networkEvents.find(event => event.googleConsentMode);
    assert.ok(event, result.moduleRun.errors.join("; "));
    assert.equal(event.googleConsentMode?.requestId, event.requestId);
    assert.equal(event.googleConsentMode?.timestampMs, event.timestampMs);
    assert.equal(event.googleConsentMode?.gcs, "G100");
    assert.deepEqual(networkEventSchema.parse(event).googleConsentMode, event.googleConsentMode);
    assert.equal(result.cookieEvents.some(cookie => cookie.cookieName.startsWith("_ga")), false);
    assert.doesNotMatch(JSON.stringify(event.googleConsentMode), /fixture-private|13p3p3p2p5l1/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(outDir, { recursive: true, force: true });
  }
});
