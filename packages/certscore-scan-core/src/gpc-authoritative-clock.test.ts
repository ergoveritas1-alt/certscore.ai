import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Page } from "playwright";
import { createGpcImpactCapture } from "./gpc-impact-capture";
import { startGpcObservationSession } from "./gpc-observation-session";
import { gpcProductionRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-production";

const url = "https://example.test/";
const request = { type: "Document", frameId: "main", loaderId: "loader", requestId: "doc", request: { url, headers: { "Sec-GPC": "1" } } };

test("original commit time is preserved even when forwarding happens later", () => {
  let now = 10;
  const capture = createGpcImpactCapture({ expectedEnabled: true, now: () => now });
  capture.documentRequested(request, "main");
  now = 120;
  capture.documentCommitted({ loaderId: "loader", url }, 100);
  assert.equal(capture.remainingObservationMs(5000), 4980);
  now = 200;
  assert.equal(capture.finish().document?.committedAtMs, 100);
});

test("invalid original event times stay unverified instead of being rounded or replaced", () => {
  for (const observedAtMs of [9, 121, 100.5, NaN, Infinity]) {
    let now = 10;
    const capture = createGpcImpactCapture({ expectedEnabled: true, now: () => now });
    capture.documentRequested(request, "main"); now = 120;
    capture.documentCommitted({ loaderId: "loader", url }, observedAtMs);
    const packet = capture.finish();
    assert.equal(packet.document, null);
    assert.deepEqual(packet.windows, []);
    assert.ok(packet.invalidationReasons?.includes("commit_binding_mismatch"));
  }
});

test("GPC observer forwards one main-document stream with exactly its retained commit time", async () => {
  const b = gpcProductionRuntimeFixture();
  const started = Date.now() - 1000;
  const cdp = Object.assign(new EventEmitter(), { send: async (method: string) => method === "Page.getFrameTree"
    ? { frameTree: { frame: { id: "main", loaderId: "fixture-loader", url: b.url } } } : {}, detach: async () => {} });
  const page = Object.assign(new EventEmitter(), { context: () => ({ addInitScript: async () => {}, newCDPSession: async () => cdp }),
    isClosed: () => false, url: () => b.url, mainFrame: () => ({}) });
  const calls: { kind: string; at?: number; token?: string }[] = [];
  const capture = createGpcImpactCapture({ expectedEnabled: true, now: () => Date.now() - started });
  const session = await startGpcObservationSession({ page: page as unknown as Page, scanId: b.scanId,
    captureId: b.gpcObservationSession!.captureId, scanStartedAtMs: started, impactCapture: {
      documentRequested: (p, id) => { calls.push({ kind: "request" }); capture.documentRequested(p, id); },
      documentCommitted: (p, at) => { calls.push({ kind: "commit", at }); capture.documentCommitted(p, at); },
      navigatedWithinDocument: (p, token) => { calls.push({ kind: "within", token }); capture.navigatedWithinDocument(p, token); },
    } });
  try {
    const doc = { ...request, loaderId: "fixture-loader", request: { ...request.request, url: b.url } };
    cdp.emit("Network.requestWillBeSent", { ...doc, frameId: "child" });
    cdp.emit("Page.frameNavigated", { frame: { id: "child", parentId: "main", loaderId: "child", url: b.url } });
    cdp.emit("Network.requestWillBeSent", doc);
    cdp.emit("Page.frameNavigated", { frame: { id: "main", loaderId: "fixture-loader", url: b.url } });
    cdp.emit("Page.navigatedWithinDocument", { frameId: "main", url: b.url, navigationType: "historyApi" });
    assert.deepEqual(calls.map(c => c.kind), ["request", "commit", "within"]);
    session.prepareFinalization(); await Promise.resolve(); await Promise.resolve();
    const packet = await session.finish(b.gpcObservationSession!.semanticObservation!, { callbacks: 0, dropped: 0, registered: false }, false);
    assert.equal(packet.terminal, "completed");
    assert.equal(packet.mainDocument?.committedAtMs, calls[1]!.at);
    assert.equal(capture.finish().document?.committedAtMs, packet.mainDocument?.committedAtMs);
    assert.equal(calls[2]!.token, "fixture-loader");
    cdp.emit("Network.requestWillBeSent", doc);
    assert.equal(calls.length, 3, "finished observers never forward late events");
  } finally { await session.close(); }
});
