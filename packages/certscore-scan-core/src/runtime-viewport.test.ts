import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type CDPSession } from "playwright";
import sharp from "sharp";
import { RUNTIME_VIEWPORT_FILENAME, type DomSnapshotArtifact } from "@certscore/contracts";
import { captureRuntimeViewport } from "./runtime-viewport";
import { createArtifactWriter } from "./artifact-writer";
import { chromiumLaunchOptions } from "./playwright-runtime";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";

const url = "https://owned-viewport.example/";
const text = "Our product catalog includes tools, detailed service descriptions and customer resources. ".repeat(5);
const identity = { source: "cdp_loader_id" as const, token: "runtime-loader" };
const snapshot: DomSnapshotArtifact = { url, path: "runtime.txt", artifactId: "dom_text_pre_consent",
  documentIdentity: identity, capturedAtMs: 1, textExcerpt: text, pagePhase: "network_idle", consentStateAtTime: "pre_consent",
  runtimeDocumentCapture: { version: "runtime_document_capture.v1", response: { route: "committed", status: 200,
    documentToken: identity.token, origin: new URL(url).origin, requestUrlSha256: createHash("sha256").update(url).digest("hex") } } };

test("missing, late, blank or differently bound pixels never produce a runtime screenshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "runtime-viewport-"));
  const blank = await sharp({create: {width: 800, height: 600, channels: 3, background: "white"}}).jpeg().toBuffer();
  const data = Buffer.concat([blank, Buffer.alloc(100000)]).toString("base64");
  const binding = { url, documentIdentity: identity, revision: 1 };
  const input = { targetUrl: url, snapshot, scanStartedAtMs: Date.now() - 10, binding, readBinding: () => binding,
    remainingMs: 750, path: join(directory, RUNTIME_VIEWPORT_FILENAME) };
  const session = (send: () => Promise<{data: string}>) => ({ send } as unknown as Pick<CDPSession, "send">);
  try {
    let calls = 0;
    const counted = session(async () => { calls++; return {data}; });
    for (const targetUrl of ["https://other.example/", url + "login", url + "?query=1", url.replace("https:", "http:")])
      assert.equal(await captureRuntimeViewport({...input, targetUrl, session: counted}), undefined);
    assert.equal(calls, 0);
    assert.equal(await captureRuntimeViewport({...input, remainingMs: 0, session: counted}), undefined);
    assert.equal(calls, 0);
    assert.equal(await captureRuntimeViewport({...input, session: counted}), undefined, "padded white viewport");
    let revision = 1;
    assert.equal(await captureRuntimeViewport({...input, readBinding: () => ({...binding, revision}),
      session: session(async () => { revision++; return {data}; })}), undefined);
    assert.equal(await captureRuntimeViewport({...input, remainingMs: 2, session: session(async () => {
      await new Promise(resolve => setTimeout(resolve, 20)); return {data};
    })}), undefined);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(await readdir(directory), []);
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test("a committed readiness timeout retains the original runtime viewport through the scanner", async () => {
  const root = await mkdtemp(join(tmpdir(), "runtime-viewport-browser-"));
  const browser = await chromium.launch(chromiumLaunchOptions({headless: true}));
  let documents = 0, injected = 0, published = 0, unexpected = 0;
  const originalContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await originalContext({...options, serviceWorkers: "block"});
    await context.route("**/*", route => { unexpected++; return route.abort(); });
    const originalPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await originalPage();
      page.on("request", request => { if (request.isNavigationRequest()) documents++; });
      const wait = page.waitForFunction.bind(page);
      page.waitForFunction = async (...args: Parameters<typeof wait>) => {
        if (String(args[0]).includes("wordCount") && !injected++) throw new Error("fixture readiness timeout");
        return wait(...args);
      };
      return page;
    };
    return context;
  };
  try {
    // A bounded patterned product image makes the retained viewport visibly nonblank.
    const pixels = Buffer.alloc(320 * 200 * 3);
    let seed = 1;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const product = await sharp(pixels, {raw: {width: 320, height: 200, channels: 3}}).png().toBuffer();
    const html = '<title>Owned storefront</title><style>body{background:linear-gradient(41deg,#bbc,#fef);font:21px Georgia}article{padding:14px}</style><main><img alt="Product sample" src="data:image/png;base64,' + product.toString('base64') + '">' +
      Array.from({length: 24}, (_, i) => '<article><strong>Product ' + i + '</strong> ' + text + '</article>').join("") + '</main>';
    const result = await preConsentRuntimeScanner({ url, normalizedUrl: url, scanStartedAtMs: Date.now(), internalBudgetMs: 18_000,
      captureScope: "runtime_evidence", localRuntimeViewportEnabled: true, browser, waitMode: "fast",
      routeFulfillers: [{urlPattern: /^https:\/\/owned-viewport\.example\/$/, contentType: "text/html", body: html}],
      onScreenshotCaptured: () => { published++; }, artifactWriter: await createArtifactWriter(root) });
    assert.equal(documents, 1);
    assert.equal(unexpected, 0);
    assert.ok(result.moduleRun.recoveryDiagnostics?.attempts.some(a => a.outcome === "committed_timeout"));
    const shot = result.screenshots[0];
    const dom = result.domSnapshots.find(d => d.artifactId === "dom_text_pre_consent");
    assert.ok(dom?.runtimeDocumentCapture?.response?.status === 200);
    assert.ok(shot && dom.runtimeDocumentCapture.viewport, JSON.stringify({attempted: dom.runtimeDocumentCapture.viewportAttempted, url: dom.url, chars: dom.textExcerpt?.length}));
    assert.equal(published, 1);
    assert.equal(shot.documentIdentity?.token, dom.documentIdentity?.token);
    assert.equal(shot.displayStatus, undefined);
    const bytes = await readFile(shot.path);
    assert.equal(bytes.length, dom.runtimeDocumentCapture.viewport.sizeBytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), dom.runtimeDocumentCapture.viewport.sha256);
  } finally { await browser.close(); await rm(root, {recursive: true, force: true}); }
});
