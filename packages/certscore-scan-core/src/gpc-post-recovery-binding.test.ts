import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";
import { chromiumLaunchOptions } from "./playwright-runtime";

for (const commitBoundary of ["cookie_capture", "after_loader_dispatch"] as const) {
  test(`single GPC loader read handles a recovery commit ${commitBoundary}`, { timeout: 30_000 }, async t => {
    const server = createServer((request, response) => {
      if (request.url === "/collect") { response.writeHead(204); response.end(); return; }
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html lang="en"><title>Recovery binding fixture</title><h1>Public company information</h1><p>${"Ordinary public services and support. ".repeat(25)}</p><script>fetch('/collect')</script></html>`);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/`;
    const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    const root = await mkdtemp(path.join(tmpdir(), "certscore-gpc-recovery-binding-"));
    const newContext = browser.newContext.bind(browser);
    let changed = false, currentPage: import("playwright").Page | undefined;
    const treeReads: number[] = [];
    const commit = async () => {
      assert.ok(currentPage);
      if (changed) return;
      changed = true;
      // Fixture-only navigation at an existing scanner operation simulates a
      // recovery commit. The scanner adds no visit, wait, read or retry.
      await currentPage.goto(`${url}recovered`, { waitUntil: "domcontentloaded" });
    };
    t.mock.method(browser, "newContext", async (...args) => {
      const context = await newContext(...args), newSession = context.newCDPSession.bind(context);
      context.on("page", page => { currentPage = page; });
      t.mock.method(context, "newCDPSession", async (...sessionArgs) => {
        const session = await newSession(...sessionArgs), send = session.send.bind(session), index = treeReads.push(0) - 1;
        t.mock.method(session, "send", ((method: string, ...params: unknown[]) => {
          if (method === "Page.getFrameTree") treeReads[index]!++;
          return (send as (...args: any[]) => Promise<unknown>)(method, ...params);
        }) as typeof session.send);
        return session;
      });
      const cookies = context.cookies.bind(context);
      t.mock.method(context, "cookies", async (...cookieArgs) => {
        if (commitBoundary === "cookie_capture") await commit();
        return cookies(...cookieArgs);
      });
      return context;
    });
    const writer = await createArtifactWriter(root), writeText = writer.writeTextArtifact.bind(writer);
    t.mock.method(writer, "writeTextArtifact", async (...args) => {
      if (commitBoundary === "after_loader_dispatch" && args[0] === "dom-text-pre-consent.txt") await commit();
      return writeText(...args);
    });
    try {
      const result = await preConsentRuntimeScanner({ browser, url, normalizedUrl: url, captureScope: "runtime_evidence",
        screenshotMode: "never", waitMode: "fast", globalPrivacyControlEnabled: true,
        gpcOptOutPrototype: { scanId: "post-recovery-binding" }, scanStartedAtMs: Date.now(), internalBudgetMs: 10_000, artifactWriter: writer });
      assert.equal(changed, true);
      const packet = result.gpcObservationSession; assert.ok(packet);
      assert.equal(packet.terminal, commitBoundary === "cookie_capture" ? "completed" : "incomplete", JSON.stringify(packet.finalization));
      assert.equal(packet.mainDocument !== null, commitBoundary === "cookie_capture");
      if (packet.mainDocument) {
        assert.equal(packet.mainDocument.secGpc, "1");
        assert.equal(packet.mainDocument.documentToken, packet.semanticObservation?.captureBinding?.documentToken);
        assert.equal(packet.semanticObservation?.navigatorGpc, true);
        assert.ok(result.gpcImpactCapture!.capturedAtMs < packet.mainDocument.committedAtMs,
          "Paired comparison remains anchored before recovery; independent terminal proof cannot refresh it");
      } else assert.ok(packet.finalization?.invalidationReasons?.includes("document_commit"));
      assert.deepEqual(treeReads.filter(n => n > 1), [2], "One initial and one terminal tree read, no retry");
      assert.ok(result.gpcSignalObservation?.capturedAtMs !== undefined);
    } finally {
      await browser.close(); server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
