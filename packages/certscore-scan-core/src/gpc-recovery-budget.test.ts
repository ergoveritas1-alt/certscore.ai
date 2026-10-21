import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createArtifactWriter } from "./artifact-writer";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner";
import { gpcDocumentHash } from "./gpc-signal-capture";

const content = `<!doctype html><html><body><h1>Company information</h1><p>${"Public products, services and company information. ".repeat(30)}</p></body></html>`;

test("an inactive Chromium error renderer can use the single existing reset and HTTPS-to-HTTP candidate", { timeout: 20000 }, async t => {
  let documents = 0, stops = 0, blankCommits = 0, resetDurationMs = 0;
  const server = createServer((req, res) => {
    if (req.headers["sec-fetch-dest"] === "document") { documents++; assert.equal(req.headers["sec-gpc"], "1"); }
    res.setHeader("Content-Type", "text/html"); res.end(content);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `https://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
  const browser = await chromium.launch({ headless: true }), root = await mkdtemp(path.join(tmpdir(), "gpc-inactive-error-"));
  const newContext = browser.newContext.bind(browser);
  t.mock.method(browser, "newContext", async (...args) => {
    const context = await newContext(...args), attach = context.newCDPSession.bind(context);
    context.on("page", page => {
      page.on("framenavigated", frame => {
        if (frame === page.mainFrame() && frame.url() === "about:blank") blankCommits++;
      });
      const goto = page.goto.bind(page);
      t.mock.method(page, "goto", async (...args) => {
        const started = Date.now();
        if (args[0] === "about:blank") assert.ok(args[1]!.timeout! > 0 && args[1]!.timeout! <= 1000);
        try { return await goto(...args); }
        finally { if (args[0] === "about:blank") resetDurationMs = Date.now() - started; }
      });
    });
    t.mock.method(context, "newCDPSession", async (...attachArgs) => {
      const session = await attach(...attachArgs), send = session.send.bind(session);
      // The actual TLS navigation/error commit is real. Fault injection keeps
      // the error renderer inactive for stopLoading, as in the retained failures.
      t.mock.method(session, "send", async (method, params) => {
        if (method === "Page.stopLoading") { stops++; throw Error("Protocol error (Page.stopLoading): Not attached to an active page"); }
        return send(method, params);
      });
      return session;
    });
    return context;
  });
  try {
    const result = await preConsentRuntimeScanner({ browser, artifactWriter: await createArtifactWriter(root), captureScope: "runtime_evidence",
      globalPrivacyControlEnabled: true, gpcOptOutPrototype: { scanId: "inactive-error-recovery" },
      internalBudgetMs: 8000, normalizedUrl: url, url, scanStartedAtMs: Date.now(), screenshotMode: "never", waitMode: "fast" });
    assert.equal(result.moduleRun.status, "completed", result.moduleRun.errors.join("; "));
    assert.equal(stops, 1); assert.equal(blankCommits, 1); assert.equal(documents, 1);
    const session = result.gpcObservationSession!;
    assert.equal(session.terminal, "completed");
    assert.equal(session.mainDocument?.secGpc, "1");
    assert.equal(session.semanticObservation?.navigatorGpc, true);
    assert.ok(result.moduleRun.durationMs! < 8000);
    assert.ok(result.moduleRun.recoveryDiagnostics!.modes.includes("transport_alternate_reset"));
    assert.ok(resetDurationMs <= 1000);
    t.diagnostic(JSON.stringify({ stops, blankCommits, documents, moduleMs: result.moduleRun.durationMs, resetDurationMs }));
  } finally {
    await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("GPC retains requests during existing passive artifact work while preserving the paired freeze and loader anchor", { timeout: 20000 }, async t => {
  for (const [changeUrl, stallMetadata] of [[false, false], [true, false], [false, true]]) await t.test(
    changeUrl ? "URL drift remains incomplete" : stallMetadata ? "stalled metadata cannot consume terminal proof allowance" : "stable passive work retains a late request", async () => {
    let probes = 0;
    const server = createServer((req, res) => {
      if (req.url === "/during-write") { assert.equal(req.headers["sec-gpc"], "1"); res.end("retained"); return; }
      if (req.url === "/terminal-probe") { probes++; res.end("probe"); return; }
      res.setHeader("Content-Type", "text/html"); res.end(content);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/`;
    const browser = await chromium.launch({ headless: true }), root = await mkdtemp(path.join(tmpdir(), "gpc-passive-tail-"));
    if (stallMetadata) {
      const newContext = browser.newContext.bind(browser);
      t.mock.method(browser, "newContext", async (...args) => {
        const context = await newContext(...args);
        context.on("page", page => {
          const evaluate = page.evaluate.bind(page);
          t.mock.method(page, "evaluate", async (fn, arg) => {
            if (String(fn).includes("wordpressAssetObserved")) return new Promise(() => {});
            return evaluate(fn, arg);
          });
        });
        return context;
      });
    }
    const writer = await createArtifactWriter(root), write = writer.writeTextArtifact.bind(writer);
    let injected = false;
    writer.writeTextArtifact = async (name, text) => {
      if (name === "dom-text-pre-consent.txt") {
        const page = browser.contexts()[0]!.pages()[0]!;
        injected = true;
        // Activity is anchored to an existing artifact write, with no timer or
        // extra wait in production. The one terminal probe becomes ready here.
        await page.evaluate(async changed => {
          if (changed) history.replaceState(null, "", "/changed");
          await fetch("/during-write");
          (window as unknown as { __gpp: unknown }).__gpp = (command: string, callback: (value: unknown, success: boolean) => void) => {
            if (command === "ping") { void fetch("/terminal-probe"); callback({ gppVersion: "1.1", cmpStatus: "loaded", signalStatus: "ready", applicableSections: [-1], sectionList: [] }, true); }
          };
        }, changeUrl);
      }
      return write(name, text);
    };
    try {
      const result = await preConsentRuntimeScanner({ browser, artifactWriter: writer, captureScope: "runtime_evidence",
        globalPrivacyControlEnabled: true, gpcOptOutPrototype: { scanId: "passive-tail" },
        internalBudgetMs: 8000, normalizedUrl: url, url, scanStartedAtMs: Date.now(), screenshotMode: "never", waitMode: "fast" });
      assert.ok(injected); assert.equal(probes, 1, "one existing terminal probe");
      const session = result.gpcObservationSession!;
      const late = result.networkEvents.find(e => e.requestUrl === `${url}during-write`)!;
      assert.ok(late);
      assert.ok(session.requests.some(r => r.eventId === late.eventId && r.secGpc === "1" && r.urlSha256 === gpcDocumentHash(late.requestUrl)));
      assert.ok(late.timestampMs > result.gpcImpactCapture!.capturedAtMs, "the paired capture stays frozen before this activity");
      assert.equal(session.terminal, changeUrl ? "incomplete" : "completed");
      assert.equal(session.finalization?.documentUnchanged, !changeUrl);
      assert.equal(result.gpcSignalObservation?.prototypeSessionSha256, createHash("sha256").update(JSON.stringify(session)).digest("hex"));
      const timings = result.moduleRun.timingBreakdown!;
      const index = (label: string) => timings.findIndex(r => r.label === label);
      assert.equal(timings.filter(r => r.label === "GPC opt-out prototype").length, 1);
      assert.ok(index("GPC observation finalization") > index("page evidence: transport security"));
      if (stallMetadata) assert.equal(timings.find(r => r.label === "page evidence: site metadata")?.outcome, "timed_out");
      assert.ok(!timings.some(r => r.label === "GPC matched observation minimum"));
      assert.ok(result.moduleRun.durationMs! < 8000);
      t.diagnostic(JSON.stringify({ changeUrl, probes, pairedFrozenAtMs: result.gpcImpactCapture!.capturedAtMs,
        lateRequestAtMs: late.timestampMs, sessionEndedAtMs: session.captureEndedAtMs,
        terminal: session.terminal, moduleMs: result.moduleRun.durationMs }));
    } finally {
      await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
