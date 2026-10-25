import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { technologyCaptureSchema, TECHNOLOGY_CAPTURE_MAX_BYTES } from "@certscore/contracts";
import { readDocumentSiteMetadata } from "./cms-version-capture";
import { retainTechnologyResponse } from "./technology-response-capture";

test("header capture retains only bounded reviewed declarations and omits identifier values", () => {
  const empty = { version: "certscore.technology-capture.v1" as const, observations: [], truncated: false };
  const capture = retainTechnologyResponse(empty, { server: "nginx/1.26.1 (private banner)", "x-powered-by": "Next.js", via: "1.1 abcd.cloudfront.net (CloudFront)", "x-amz-cf-id": "secret-id", "set-cookie": "session=secret" }, "request-1", "loader-1");
  assert.deepEqual(capture.observations.map(row => row.value), ["server: nginx/1.26.1", "x-powered-by: Next.js", "via: CloudFront; x-amz-cf-id: present"]);
  assert.doesNotMatch(JSON.stringify(capture), /private|secret|abcd/);
  assert.equal(technologyCaptureSchema.safeParse(capture).success, true);
  assert.ok(Buffer.byteLength(JSON.stringify(capture)) <= TECHNOLOGY_CAPTURE_MAX_BYTES);
  assert.deepEqual(retainTechnologyResponse(empty, { server: "nginxFake/1.2.3", via: "1.1 example.test (CloudFront)", "x-amz-cf-id": "id" }, "r", "d"), empty);
  assert.deepEqual(retainTechnologyResponse(empty, { server: "a".repeat(10000), "x-powered-by": "SomethingElse" }, "r", "d"), empty);
  assert.equal(retainTechnologyResponse(empty, { "x-powered-by": "PHP/8.3.12" }, "r", "d").observations[0]?.value, "x-powered-by: PHP/8.3.12");
});

test("existing DOM read adds no requests, omits child-frame technology and preserves CMS metadata", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests: string[] = [];
  await page.route("**/*", async route => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: "text/html", body: route.request().url().endsWith("/child") ? '<script src="/vue.global.js"></script>' :
      '<meta name="generator" content="WordPress 6.8"><meta name="generator" content="WP Rocket 3.20.2"><script type="application/json" id="__NEXT_DATA__">{}</script><script src="/_next/static/app.js?secret=hidden"></script><iframe src="/child"></iframe>' });
  });
  try {
    await page.goto("http://fixture.test/");
    const baseline = await readDocumentSiteMetadata(page, () => ({ token: "loader" }));
    const before = requests.length;
    const extended = await readDocumentSiteMetadata(page, () => ({ token: "loader" }), true);
    assert.ok(extended?.technology);
    assert.equal(requests.length, before);
    const stable = (metadata: typeof extended) => ({ ...metadata, technology: undefined,
      googleTagContext: metadata?.googleTagContext ? { ...metadata.googleTagContext, capturedAtEpochMs: undefined } : undefined });
    assert.deepEqual(stable(extended), stable(baseline));
    assert.ok(extended.technology.observations.some(row => row.value.includes("__NEXT_DATA__")));
    assert.ok(extended.technology.observations.some(row => row.value === "/_next/static/app.js"));
    assert.doesNotMatch(JSON.stringify(extended.technology), /secret|hidden|vue/);
    assert.ok(Buffer.byteLength(JSON.stringify(extended.technology)) <= TECHNOLOGY_CAPTURE_MAX_BYTES);
    let call = 0;
    assert.equal(await readDocumentSiteMetadata(page, () => ({ token: ++call === 1 ? "old" : "new" }), true), null);
  } finally { await browser.close(); }
});

test("production baseline captures exact navigation headers; GPC does not", async () => {
  const { preConsentRuntimeScanner } = await import("./scanners/pre-consent-runtime-scanner");
  const { createArtifactWriter } = await import("./artifact-writer");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const server = createServer((req, res) => {
    res.setHeader("server", "nginx/1.26.1"); res.setHeader("content-type", "text/html");
    res.end('<html><head><meta name="generator" content="Ghost 5.10.1"></head><body><h1>Owned technology fixture</h1><p>' + "Public product information. ".repeat(100) + '</p></body></html>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(join(tmpdir(), "certscore-technology-"));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const gpc of [false, true]) {
      const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, browser, scanStartedAtMs: Date.now(), internalBudgetMs: 20_000,
        artifactWriter: await createArtifactWriter(join(root, String(gpc))), captureScope: "runtime_evidence", waitMode: "fast", screenshotMode: "never", globalPrivacyControlEnabled: gpc });
      const snapshot = result.domSnapshots.at(-1)!;
      if (gpc) assert.equal(snapshot.siteMetadata?.technology, undefined);
      else {
        const capture = snapshot.siteMetadata?.technology;
        assert.ok(capture?.observations.some(row => row.value === "server: nginx/1.26.1"));
        assert.equal(capture.responseDocumentToken, snapshot.documentIdentity?.token);
        assert.ok(result.networkEvents.some(row => row.requestId === capture.responseRequestId && row.isMainFrame && row.resourceType === "document"));
      }
    }
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
