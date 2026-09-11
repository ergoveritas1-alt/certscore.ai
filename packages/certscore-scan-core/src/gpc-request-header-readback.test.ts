import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { chromium, type Browser, type Page, type Request } from "playwright";
import { chromiumLaunchOptions } from "./playwright-runtime.js";
import { captureGpcOptOutObservation } from "./gpc-opt-out-capture.js";
import { startGpcObservationSession } from "./gpc-observation-session.js";

async function fixtureServer() {
  let receivedSecGpc: string | undefined;
  const server = createServer((request, response) => {
    receivedSecGpc = request.headers["sec-gpc"];
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><html><body><p>GPC request fixture</p></body></html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}/`, get receivedSecGpc() { return receivedSecGpc; } };
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function finishFixture(page: Page, session: Awaited<ReturnType<typeof startGpcObservationSession>>, scanId: string, captureId: string, started: number) {
  const cdp = await page.context().newCDPSession(page);
  const tree = await cdp.send("Page.getFrameTree");
  const loaderId = tree.frameTree.frame.loaderId as string;
  const semantic = await captureGpcOptOutObservation(page, {
    scanId,
    scanStartedAtMs: started,
    monitorKey: session.monitorKey,
    binding: { captureId, documentIdentity: () => ({ source: "cdp_loader_id", token: loaderId }) },
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  return session.finish(semantic, { callbacks: 0, dropped: 0, registered: false }, false);
}

test("request header readback recovers Sec-GPC from the same Chromium request", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "11111111-1111-4111-8111-111111111111";
    const session = await startGpcObservationSession({ page, scanId: "header-recovery", captureId, scanStartedAtMs: started });
    let navigationRequest: Request | undefined;
    page.on("request", (request) => { if (request.isNavigationRequest()) navigationRequest = request; });
    await page.goto(fixture.url);
    assert.equal(fixture.receivedSecGpc, "1");
    assert.ok(navigationRequest);
    session.recordRequest({ eventId: "fixture-navigation", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} }, navigationRequest);
    const packet = await finishFixture(page, session, "header-recovery", captureId, started);
    const row = packet.requests.find((request) => request.eventId === "fixture-navigation");
    assert.equal(row?.secGpc, "1");
    assert.equal(row?.headerSource, "all_headers_readback");
    assert.equal(packet.limitationKeys.includes("request_header_readback_incomplete"), false);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});

test("absent and explicit zero headers never become an enabled GPC header", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "22222222-2222-4222-8222-222222222222";
    const session = await startGpcObservationSession({ page, scanId: "header-negative", captureId, scanStartedAtMs: started });
    await page.goto(fixture.url);
    session.recordRequest({ eventId: "absent", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} });
    session.recordRequest({ eventId: "zero", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: { secGpc: "0" } });
    const packet = await finishFixture(page, session, "header-negative", captureId, started);
    assert.equal(packet.requests.find((request) => request.eventId === "absent")?.secGpc, null);
    assert.equal(packet.requests.find((request) => request.eventId === "zero")?.secGpc, "0");
    assert.equal(packet.requests.some((request) => request.secGpc === "1"), false);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});

test("a delayed allHeaders readback cannot mutate the frozen post-finish packet", async () => {
  const browser: Browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
  const fixture = await fixtureServer();
  try {
    const context = await browser.newContext({ extraHTTPHeaders: { "Sec-GPC": "1" } });
    const page = await context.newPage();
    const started = Date.now();
    const captureId = "33333333-3333-4333-8333-333333333333";
    const session = await startGpcObservationSession({ page, scanId: "header-delayed", captureId, scanStartedAtMs: started });
    await page.goto(fixture.url);
    let release!: (headers: Record<string, string>) => void;
    const delayed = { allHeaders: () => new Promise<Record<string, string>>((resolve) => { release = resolve; }) };
    session.recordRequest({ eventId: "delayed", timestampMs: Date.now() - started, requestUrl: fixture.url, requestHeaders: {} }, delayed);
    const packet = await finishFixture(page, session, "header-delayed", captureId, started);
    const before = JSON.stringify(packet.requests);
    assert.equal(packet.terminal, "incomplete");
    assert.ok(packet.limitationKeys.includes("request_header_readback_incomplete"));
    release({ "sec-gpc": "1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(JSON.stringify(packet.requests), before);
    assert.equal(packet.requests[0]?.secGpc, null);
    await context.close();
  } finally { await closeServer(fixture.server); await browser.close(); }
});
