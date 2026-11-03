import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import type { Page } from "playwright";
import { startGpcObservationSession } from "./gpc-observation-session";
import { createGpcImpactCapture } from "./gpc-impact-capture";
import { collectionPairFixture, collectionFixtureSource } from "./test-fixtures/gpc-collection-pair.cases";
import { buildGpcProductionObservation } from "./gpc-production-observation";
import { buildGpcActivityComparison } from "./gpc-activity-comparison";

async function fixture(t: TestContext) {
  const pair = collectionPairFixture(), b = pair.gpc, epoch = Date.parse(b.startedAt);
  let clock = 0;
  t.mock.method(Date, "now", () => epoch + clock);
  // The impact observer runs a millisecond later. It must retain the original
  // GPC observer's event timestamp, never its own later sampling time.
  const impact = createGpcImpactCapture({ expectedEnabled: true, now: () => clock + 1 });
  const sends: string[] = [];
  const cdp = Object.assign(new EventEmitter(), { send: async (method: string) => {
    sends.push(method);
    return method === "Page.getFrameTree" ? { frameTree: { frame: { id: "main", loaderId: "fixture-loader", url: b.url } } } : {};
  }, detach: async () => {} });
  const page = Object.assign(new EventEmitter(), { context: () => ({ addInitScript: async () => {}, newCDPSession: async () => cdp }),
    isClosed: () => false, url: () => b.url, mainFrame: () => ({}) });
  const session = await startGpcObservationSession({ page: page as unknown as Page, scanId: b.scanId,
    captureId: b.gpcObservationSession!.captureId, scanStartedAtMs: epoch, impactCapture: impact });
  const request = { type: "Document", frameId: "main", loaderId: "fixture-loader", requestId: b.gpcObservationSession!.mainDocument!.requestId,
    request: { url: b.url, headers: { "Sec-GPC": "1" } } };
  cdp.emit("Network.requestWillBeSent", request);
  clock = 1;
  cdp.emit("Page.frameNavigated", { frame: { id: "main", loaderId: "fixture-loader", url: b.url } });
  impact.bindReadback("fixture-loader");
  for (const e of b.networkEvents) { clock = e.timestampMs; session.recordRequest(e); impact.recordRequest(e); }
  const finish = async () => {
    clock = 5980; session.prepareFinalization(); await Promise.resolve(); await Promise.resolve();
    const semantic = structuredClone(b.gpcObservationSession!.semanticObservation!); semantic.capturedAtMs = 5990;
    clock = 6000;
    const s = await session.finish(semantic, { callbacks: 0, dropped: 0, registered: false }, false);
    const capture = impact.finish(b.gpcSignalObservation);
    return { s, capture };
  };
  return { pair, b, impact, session, cdp, sends, request, finish, setClock: (value: number) => { clock = value; } };
}

test("one existing document stream preserves exact commit time and enables the strict original-byte collection packet", async t => {
  const f = await fixture(t);
  try {
    const { s, capture } = await f.finish();
    assert.equal(capture.document!.committedAtMs, 1); assert.equal(s.mainDocument!.committedAtMs, 1);
    assert.deepEqual(capture.invalidationReasons, []); assert.ok(capture.windows.some(w => w.durationMs === 5000));
    assert.deepEqual(f.sends, ["Network.enable", "Page.enable", "Page.getFrameTree", "Page.getFrameTree"]);
    f.b.gpcObservationSession = s; f.b.gpcImpactCapture = capture;
    f.b.gpcPrototypeSessionBinding!.sessionSha256 = createHash("sha256").update(JSON.stringify(s)).digest("hex");
    const gpc = collectionFixtureSource(f.b), baseline = collectionFixtureSource(f.pair.baseline);
    const observation = buildGpcProductionObservation({ scanId: f.b.scanId, source: gpc });
    assert.ok(observation.positiveEvidence?.representativeDocument);
    const packet = buildGpcActivityComparison({ scanId: f.b.scanId, baseline, gpc, observation });
    assert.ok(packet?.collectionComparison); assert.equal(packet.collectionComparison.gpc.rows.length, 1);
    assert.equal(packet.collectionComparison.causedByGpc, "not_established");
  } finally { await f.session.close(); }
});

test("forwarded document changes and history taint still invalidate impact windows", async t => {
  for (const change of ["request", "recommit", "history", "fragment", "unknown"] as const) {
    const f = await fixture(t);
    try {
      f.setClock(800);
      if (change === "request") f.cdp.emit("Network.requestWillBeSent", { ...f.request, loaderId: "next", requestId: "next" });
      else if (change === "recommit") f.cdp.emit("Page.frameNavigated", { frame: { id: "main", loaderId: "fixture-loader", url: f.b.url } });
      else {
        f.cdp.emit("Page.navigatedWithinDocument", { frameId: "main", url: change === "fragment" ? `${f.b.url}#different` : `${f.b.url}changed`, navigationType: change === "unknown" ? undefined : "historyApi" });
        f.cdp.emit("Page.navigatedWithinDocument", { frameId: "main", url: f.b.url, navigationType: "historyApi" });
      }
      const { capture } = await f.finish();
      assert.equal(capture.windows.length, 0, change); assert.ok(capture.limitationKeys.length, change);
    } finally { await f.session.close(); t.mock.restoreAll(); }
  }
});

test("impact rejects an injected future commit time without replacing its binding", () => {
  let clock = 0;
  const capture = createGpcImpactCapture({ expectedEnabled: true, now: () => clock });
  capture.documentRequested({ type: "Document", frameId: "main", loaderId: "loader", request: { url: "https://fixture.test/", headers: { "Sec-GPC": "1" } } }, "main");
  clock = 10; capture.documentCommitted({ loaderId: "loader", url: "https://fixture.test/" }, 11);
  const result = capture.finish(); assert.equal(result.document, null); assert.equal(result.windows.length, 0);
  assert.ok(result.invalidationReasons?.includes("commit_binding_mismatch"));
});
