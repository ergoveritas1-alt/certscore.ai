import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { cmsVersionEvidenceSchema, type SiteMetadata } from "@certscore/contracts";
import { readDocumentSiteMetadata, captureWordpressFeedVersion, readWordpressFeedGenerator } from "./cms-version-capture";
const rss = (version = "6.8.3") => `<rss version="2.0"><channel><title>Fixture</title><generator>https://wordpress.org/?v=${version}</generator><item><title>Post</title></item></channel></rss>`;
const metadata = (): SiteMetadata => ({ contractVersion: "certscore.site-metadata.v1", title: "", language: "en", generators: [], wordpressAssetObserved: true, versionEvidence: [], feedLinks: ["https://cms.example/feed/"] });
const input = () => ({ metadata: metadata(), documentUrl: "https://cms.example/", deadlineAtMs: Date.now() + 10_000 });
const response = (body = rss(), headers = {}) => new Response(body, { headers: { "content-type": "application/rss+xml; charset=UTF-8", ...headers } });

test("RSS and Atom retain exact WordPress generator evidence, not post content", () => {
  assert.equal(readWordpressFeedGenerator(rss())?.version, "6.8.3");
  assert.equal(readWordpressFeedGenerator(rss().replace("<title>Fixture</title>", "<title><![CDATA[Fixture]]></title>").replace("<title>Post</title>", "<description><![CDATA[<p>Blog post</p>]]></description>"))?.version, "6.8.3");
  assert.equal(readWordpressFeedGenerator(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title><generator version="6.8" uri="https://wordpress.org/">WordPress</generator><entry/></feed>`)?.version, "6.8");
  for (const body of [rss("6.8-beta"), rss().replace("<generator>", "<title><generator>").replace("</generator>", "</generator></title>"), `<rss><channel><item><generator>https://wordpress.org/?v=6.8.3</generator></item></channel></rss>`, `<!DOCTYPE rss>${rss()}`, `<html>${rss()}</html>`, rss().replace("<generator>", "<![CDATA[<generator>").replace("</generator>", "</generator>]]>"), rss().replace("<title>Fixture</title>", "<generator>https://wordpress.org/?v=6.7</generator>")]) assert.equal(readWordpressFeedGenerator(body), null, body);
});

test("one linked feed fetch retains bounded generator, hash and cookie-free identity", async () => {
  let calls = 0;
  const proof = await captureWordpressFeedVersion({ ...input(), headers: { "User-Agent": "ConsentCheckBot", Cookie: "do-not-forward", Authorization: "do-not-forward" }, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, "https://cms.example/feed/"); assert.equal(init?.redirect, "manual"); assert.equal(init?.credentials, "omit");
    assert.equal(new Headers(init?.headers).get("user-agent"), "ConsentCheckBot"); assert.equal(new Headers(init?.headers).get("cookie"), null); assert.equal(new Headers(init?.headers).get("authorization"), null);
    return response();
  } });
  assert.equal(calls, 1); assert.equal(proof?.version, "6.8.3");
  assert.equal(proof?.kind === "feed_generator" && proof.bodySha256, createHash("sha256").update(rss()).digest("hex"));
  assert.equal(cmsVersionEvidenceSchema.safeParse(proof).success, true);
});

test("known/declaration-conflicted versions, missing/cross-origin links and expired scans never fetch", async () => {
  const cases = [ { ...metadata(), generators: ["WordPress 6.8"] }, { ...metadata(), generators: ["WordPress 6.8-beta"] }, { ...metadata(), generators: ["WordPress version 6.8"] }, { ...metadata(), generators: ["WordPress 6.8", "WordPress 6.7"] }, { ...metadata(), wordpressAssetObserved: false }, { ...metadata(), feedLinks: [] }, { ...metadata(), feedLinks: ["https://third.example/feed/"] }, { ...metadata(), feedLinks: ["https://cms.example/feed/?secret=value"] } ];
  for (const row of cases) assert.equal(await captureWordpressFeedVersion({ ...input(), metadata: row, fetchImpl: async () => { assert.fail("must not fetch"); } }), null);
  assert.equal(await captureWordpressFeedVersion({ ...input(), deadlineAtMs: Date.now(), fetchImpl: async () => { assert.fail("expired"); } }), null);
});

test("redirects, non-XML, oversized bodies and unavailable feeds fail closed without retry", async () => {
  for (const res of [new Response(null, { status: 302, headers: { location: "https://third.example/" } }), response(rss(), { "content-type": "text/html" }), response(rss(), { "content-length": "262145" }), response("x".repeat(262145)), new Response(null, { status: 404 })]) {
    let calls = 0;
    assert.equal(await captureWordpressFeedVersion({ ...input(), fetchImpl: async () => { calls++; return res; } }), null);
    assert.equal(calls, 1);
  }
});

test("deadline bounds a stalled fetch, stalled body and parent abort", async () => {
  const started = Date.now(); let aborted = false;
  assert.equal(await captureWordpressFeedVersion({ ...input(), deadlineAtMs: Date.now() + 100, fetchImpl: async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; }); return await new Promise<Response>(() => {});
  } }), null);
  assert.equal(aborted, true); assert.ok(Date.now() - started < 500);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("<rss>")); }, cancel() { cancelled = true; } });
  assert.equal(await captureWordpressFeedVersion({ ...input(), deadlineAtMs: Date.now() + 100, fetchImpl: async () => new Response(stream, { headers: { "content-type": "application/rss+xml" } }) }), null);
  assert.equal(cancelled, true);
  const parent = new AbortController();
  const pending = captureWordpressFeedVersion({ ...input(), signal: parent.signal, fetchImpl: async () => { parent.abort(); return await new Promise<Response>(() => {}); } });
  assert.equal(await pending, null);
});

test("real local browser captures comments, curated assets and one linked feed", async () => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url === "/feed/") { res.setHeader("content-type", "application/rss+xml"); res.end(rss("6.8")); return; }
    if (req.url !== "/") { res.end(""); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<html lang="en"><head><title>CMS fixture</title><link rel="alternate" type="application/rss+xml" href="/feed/"/><script src="/wp-includes/js/wp-embed.min.js?ver=6.8.3&secret=removed"></script><script src="/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"></script><script src="/wp-content/plugins/plugin.js?ver=9.9.9"></script></head><body><!-- generator="WordPress/6.8" --><p>Fixture</p></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); await page.goto(url);
    const captured = await readDocumentSiteMetadata(page, () => ({ token: "local-loader" })); assert.ok(captured);
    assert.deepEqual(captured.versionEvidence?.map(row => [row.kind, row.version]), [["html_generator_comment", "6.8"], ["core_asset_version", "6.8.3"]]);
    assert.equal(JSON.stringify(captured).includes("secret"), false);
    assert.deepEqual(captured.feedLinks, [`${url}feed/`]);
    // Comment already establishes the version; feed must not duplicate its request.
    assert.equal(await captureWordpressFeedVersion({ metadata: captured, documentUrl: url, deadlineAtMs: Date.now() + 1000 }), null);
    assert.equal(hits.filter(value => value === "/feed/").length, 0);
    const feed = await captureWordpressFeedVersion({ metadata: { ...captured, versionEvidence: captured.versionEvidence?.filter(row => row.kind !== "html_generator_comment") }, documentUrl: url, deadlineAtMs: Date.now() + 1000 });
    assert.equal(feed?.version, "6.8"); assert.equal(hits.filter(value => value === "/feed/").length, 1);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("production runtime lane retains a feed declaration and GPC never repeats its request", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createArtifactWriter } = await import("./artifact-writer");
  const { preConsentRuntimeScanner } = await import("./scanners/pre-consent-runtime-scanner");
  let feedRequests = 0;
  const server = createServer((req, res) => {
    if (req.url === "/feed/") { feedRequests++; res.setHeader("content-type", "application/rss+xml"); res.end(rss("6.8")); return; }
    if (req.url !== "/") { res.end(""); return; }
    res.setHeader("content-type", "text/html");
    res.end(`<html lang="en"><head><link rel="alternate" type="application/rss+xml" href="/feed/"/><script src="/wp-includes/js/wp-embed.min.js?ver=6.8.3"></script></head><body><h1>Owned CMS fixture</h1><p>${"Public product information. ".repeat(100)}</p></body></html>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/`;
  const root = await mkdtemp(join(tmpdir(), "certscore-cms-runtime-"));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const gpc of [false, true]) {
      const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, browser, scanStartedAtMs: Date.now(), internalBudgetMs: 20_000,
        artifactWriter: await createArtifactWriter(join(root, String(gpc))), captureScope: "runtime_evidence", waitMode: "fast", screenshotMode: "never", globalPrivacyControlEnabled: gpc });
      const proof = result.domSnapshots.at(-1)?.siteMetadata?.versionEvidence?.find(row => row.kind === "feed_generator");
      assert.equal(proof?.version, gpc ? undefined : "6.8");
      assert.equal(feedRequests, 1);
      assert.ok(result.domSnapshots.at(-1)?.documentIdentity?.token);
    }
  } finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); }
});
