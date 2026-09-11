import assert from "node:assert/strict";
import test from "node:test";
import { verifiedGpcPreTransmissionBlock } from "./gpc-pre-transmission-block";
const proof = { failureText: "csp", secGpc: null, timing: { startTime: 0, requestStart: -1, responseStart: -1 },
  responseReceived: false, serviceWorker: false, mainFrame: true, requestLoader: "loader", committedLoader: "loader" };
test("only direct pre-transmission enforcement is eligible; response, worker, timing and loader conflicts remain unknown", () => {
  assert.equal(verifiedGpcPreTransmissionBlock(proof), "csp");
  assert.equal(verifiedGpcPreTransmissionBlock({ ...proof, failureText: "mixed-content" }), "mixed-content");
  for (const failureText of ["net::ERR_BLOCKED_BY_CLIENT", "net::ERR_ABORTED", "net::ERR_FAILED", "", undefined, "CSP", "other"]) {
    assert.equal(verifiedGpcPreTransmissionBlock({ ...proof, failureText }), null);
  }
  for (const delta of [{ responseReceived: true }, { serviceWorker: true }, { mainFrame: false }, { requestLoader: "earlier-loader" },
    { committedLoader: undefined }, { secGpc: "0" }, { secGpc: "1" },
    { timing: { ...proof.timing, startTime: 1 } }, { timing: { ...proof.timing, requestStart: 0 } }, { timing: { ...proof.timing, responseStart: 0 } }]) {
    assert.equal(verifiedGpcPreTransmissionBlock({ ...proof, ...delta }), null, JSON.stringify(delta));
  }
});

import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Request } from "playwright";

test("real Chromium mixed-content enforcement retains same-request proof and sends no HTTP request", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gpc-mixed-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir,"key.pem"), "-out", path.join(dir,"cert.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  let received = 0;
  const http = createServer((_req, res) => { received++; res.end("unreachable"); });
  http.listen(0, "127.0.0.1"); await once(http, "listening");
  const httpPort = (http.address() as { port: number }).port;
  const https = createHttpsServer({ key: await readFile(path.join(dir,"key.pem")), cert: await readFile(path.join(dir,"cert.pem")) }, (_req,res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(`<html><body>Local fixture<script src="http://mixed.fixture:${httpPort}/blocked.js"></script></body></html>`);
  });
  https.listen(0,"127.0.0.1"); await once(https, "listening");
  const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP mixed.fixture 127.0.0.1"] });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, extraHTTPHeaders: { "Sec-GPC": "1" } });
  const page = await context.newPage();
  const failed: Request[] = []; const responses = new Set<Request>();
  page.on("requestfailed", r => failed.push(r)); page.on("response", r => responses.add(r.request()));
  try {
    await page.goto(`https://127.0.0.1:${(https.address() as {port:number}).port}/`);
    const request = failed.find(r => r.url().includes("mixed.fixture"));
    assert.ok(request, "browser emits a request-owned mixed-content failure");
    assert.equal(request.failure()?.errorText, "mixed-content");
    assert.equal(received, 0);
    assert.equal(responses.has(request), false);
    assert.equal(verifiedGpcPreTransmissionBlock({ ...proof, failureText: request.failure()?.errorText, timing: request.timing(),
      responseReceived: responses.has(request), serviceWorker: request.serviceWorker() !== null, mainFrame: request.frame() === page.mainFrame() }), "mixed-content");
  } finally {
    await browser.close(); http.closeAllConnections(); https.closeAllConnections();
    await Promise.all([new Promise<void>(r => http.close(() => r())), new Promise<void>(r => https.close(() => r()))]);
    await rm(dir, { recursive: true, force: true });
  }
});
