import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { installRuntimeGraphCapture } from "./runtime-evidence-graph-capture.js";
import { runScan } from "./index.js";

test("real Chromium graph captures response setters, JS attempts, sibling frames, storage and worker requests without changing native behavior", { timeout: 20_000 }, async () => {
  const server = createServer((req, res) => {
    if (req.url === "/widget.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(`document.cookie='js_cookie=private-cookie; Path=/'; localStorage.setItem('local_key','private-storage');
        sessionStorage.setItem('session_key','another-private-value');
        window.__nativeResult = [localStorage.setItem('return_key', 'x') === undefined, localStorage.getItem('local_key'), document.cookie.includes('js_cookie=private-cookie')];
        fetch('/collect?token=never-retain'); new Worker('/worker.js');`);
    } else if (req.url === "/worker.js") {
      res.setHeader("Content-Type", "application/javascript"); res.end("setTimeout(() => fetch('/worker-fetch'), 100);");
    } else if (req.url?.startsWith("/collect")) {
      res.setHeader("Set-Cookie", "server_cookie=private-server-value; Path=/; HttpOnly; SameSite=Lax"); res.end("ok");
    } else if (req.url === "/frame") {
      res.setHeader("Content-Type", "text/html"); res.end("<script>localStorage.setItem('frame_key','frame-private')</script><p>frame</p>");
    } else if (req.url === "/") {
      res.setHeader("Content-Type", "text/html"); res.end('<script src="/widget.js"></script><iframe src="/frame"></iframe><iframe src="/frame"></iframe>');
    } else res.end("ok");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const artifactRoot = await mkdtemp(path.join(tmpdir(), "certscore-runtime-graph-test-"));
  try {
    const context = await browser.newContext(); const page = await context.newPage();
    const capture = await installRuntimeGraphCapture(page, { scanId: "fixture", captureId: "runtime", scenario: "pre_consent", mode: "project", startedAt: new Date().toISOString() });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForResponse(response => response.url().endsWith("/worker-fetch"));
    assert.deepEqual(await page.evaluate("window.__nativeResult"), [true, "private-storage", true]);
    capture.cookies(await context.cookies()); await capture.snapshotStorage();
    const graph = capture.finish();
    assert.ok(graph.nodes.some(node => node.operation === "http_set" && node.cookie?.name === "server_cookie"), "HTTP response setter");
    assert.ok(graph.nodes.some(node => node.operation === "js_set" && node.cookie?.name === "js_cookie"), `JS setter: ${JSON.stringify(graph.coverage)}`);
    assert.ok(graph.nodes.some(node => node.operation === "setItem" && node.name === "local_key"), "storage write");
    assert.ok(graph.nodes.filter(node => node.kind === "frame").length >= 3, "same-URL sibling frame identity");
    assert.ok(graph.nodes.some(node => node.kind === "worker"), "worker target");
    assert.ok(graph.edges.some(edge => edge.relation === "worker_request"), "worker request edge");
    assert.ok(graph.edges.some(edge => edge.relation === "response_cookie_attempt"));
    const serialized = JSON.stringify(graph);
    for (const secret of ["private-cookie", "private-storage", "private-server-value", "another-private-value", "frame-private", "never-retain"]) assert.ok(!serialized.includes(secret), secret);
    assert.ok(!graph.coverage.reasons.includes("protocol_event_invalid"));
    assert.ok(!graph.coverage.reasons.includes("probe_context_unresolved"));
    assert.equal(graph.coverage.pendingTasks, 0);
    await context.close();
    const bundle = await runScan({
      url: `http://127.0.0.1:${address.port}/`, outDir: artifactRoot, profile: "tiny", evidenceLane: "runtime_evidence",
      preConsentModuleDeadlineMs: 5000, preConsentScreenshotMode: "never", runtimeGraph: { scanId: "fixture", mode: "project" },
    });
    const retained = bundle.runtimeEvidenceGraphs?.[0];
    assert.ok(retained, "runtime lane retains graph in canonical bundle");
    assert.ok(retained.nodes.some(node => node.operation === "js_set" && node.cookie?.name === "js_cookie"), "other runtime probes must not bypass graph instrumentation");
    assert.ok(bundle.cookieEvents.some(event => event.operation === "set_cookie_header" && event.cookieName === "server_cookie"), "legacy HTTP cookie evidence retained");
    assert.ok(bundle.cookieEvents.filter(event => event.operation === "set_cookie_header").every(event => !event.setterScriptUrl && !event.setByThirdPartyScript), "HTTP setter must not become a script setter");
    assert.ok(bundle.cookieEvents.filter(event => event.operation === "browser_snapshot").every(event => !event.setterScriptUrl), "name-only snapshot attribution disabled");
    assert.equal(bundle.screenshots.length, 0); assert.equal(bundle.policySurfaceObservations.length, 0);
  } finally {
    await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

test("probes preserve native behavior under page tampering, proxies, long identities and overflow", { timeout: 20_000 }, async () => {
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Adversarial local fixture</title>"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  const results: unknown[] = [];
  try {
    for (const enabled of [false, true]) {
      const context = await browser.newContext(); const page = await context.newPage();
      const capture = enabled ? await installRuntimeGraphCapture(page, { scanId: "adversarial", captureId: "runtime", scenario: "pre_consent", mode: "project", startedAt: new Date().toISOString() }) : undefined;
      await page.goto(`http://127.0.0.1:${address.port}/`);
      const exercise = async () => {
        const root = globalThis as any;
        let nonceLeaked = false;
        Object.defineProperty(Object.prototype, "toJSON", { configurable: true, value: function() { if ((this as any).nonce) nonceLeaked = true; return this; } });
        Object.defineProperty(Array.prototype, "toJSON", { configurable: true, value: function() { if ((this as any).nonce) nonceLeaked = true; return this; } });
        localStorage.setItem("with_to_json", "safe");
        delete (Object.prototype as any).toJSON; delete (Array.prototype as any).toJSON;
        const split = String.prototype.split;
        let callerThrew = false;
        String.prototype.split = (() => { throw new Error("poisoned split"); }) as any;
        try { document.cookie = "native_cookie=retained; Path=/"; } catch { callerThrew = true; }
        String.prototype.split = split;
        const match = RegExp.prototype[Symbol.match];
        RegExp.prototype[Symbol.match] = (() => ["fake", "https://forged.invalid/parent.js"]) as any;
        localStorage.setItem("regex_probe", "safe");
        RegExp.prototype[Symbol.match] = match;
        let customStackCalls = 0;
        root.Error.prepareStackTrace = () => { customStackCalls++; return "at fake (https://forged.invalid/stack.js:1:1)"; };
        localStorage.setItem("custom_stack", "safe");
        delete root.Error.prepareStackTrace;
        document.cookie = `long_path=value; Path=${"/x".repeat(150)}; Partitioned`;
        localStorage.setItem("prefix.".repeat(50) + "one", "x");
        localStorage.setItem("prefix.".repeat(50) + "two", "x");
        const proxyReads: string[] = [];
        let cookieStoreResult = "unsupported";
        if (root.cookieStore) {
          const dictionary = new Proxy({ name: "store_cookie", value: "v", path: "/" }, { get(target, key, receiver) { proxyReads.push(String(key)); return Reflect.get(target, key, receiver); }, getOwnPropertyDescriptor(target, key) { proxyReads.push(`descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); } });
          try { await root.cookieStore.set(dictionary); cookieStoreResult = "resolved"; } catch { cookieStoreResult = "rejected"; }
          try { await root.cookieStore.set({ name: "invalid;name", value: "v" }); } catch { /* Expected native rejection. */ }
        }
        for (let index = 0; index < 1000; index++) localStorage.setItem("hot_key", String(index));
        return { nonceLeaked, callerThrew, customStackCalls, cookieStored: document.cookie.includes("native_cookie=retained"), proxyReads, cookieStoreResult, lastValue: localStorage.getItem("hot_key") };
      };
      const result = await page.evaluate<Awaited<ReturnType<typeof exercise>>>(`(() => { const __name = (fn) => fn; return (${exercise.toString()})(); })()`);
      results.push(result);
      if (capture) {
        capture.cookies(await context.cookies()); await capture.snapshotStorage(); const graph = capture.finish();
        assert.equal(result.nonceLeaked, false); assert.equal(result.callerThrew, false); assert.equal(result.customStackCalls, 0);
        assert.ok(!JSON.stringify(graph).includes("forged.invalid"));
        assert.ok(graph.coverage.reasons.includes("page_stack_formatter_untrusted"));
        assert.ok(graph.coverage.reasons.includes("page_probe_limit"));
        assert.ok(graph.nodes.filter(node => node.operation === "js_set" && node.name === "long_path").every(node => !node.cookie));
        assert.ok(graph.nodes.filter(node => node.captureBasis === "page_realm_snapshot").every(node => node.outcome !== "stored"));
      }
      await context.close();
    }
    assert.deepEqual(results[1], results[0], "probe-on behavior must equal native probe-off behavior");
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
