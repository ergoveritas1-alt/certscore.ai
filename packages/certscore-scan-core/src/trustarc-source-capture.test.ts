import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import test from "node:test";
import type { CDPSession } from "playwright";
import { installTrustArcSourceCapture } from "./trustarc-source-capture.js";

const origin = "https://consent.trustarc.com";
const mobvista = "https://www.mobvista.com/en";

function fixture(document = mobvista) {
  const session = new EventEmitter();
  const reads: string[] = [];
  const body = "const consent = 'fixture';";
  let release: ((value: { body: string; base64Encoded: boolean }) => void) | undefined;
  const capture = installTrustArcSourceCapture(Object.assign(session, {
    async send(method: string, params?: { requestId: string }) {
      if (method !== "Network.getResponseBody") return {};
      reads.push(params!.requestId);
      if (params!.requestId === "late") return new Promise(resolve => { release = resolve; });
      return { body, base64Encoded: false };
    },
  }) as unknown as CDPSession, { requestedUrl: document, scanId: "fixture-reject" })!;
  const commit = (url = document, loaderId = "loader") =>
    session.emit("Page.frameNavigated", { frame: { id: "main", loaderId, url } });
  commit();
  const respond = (requestId: string, url: string, options: {
    bytes?: number; frameId?: string; loaderId?: string; type?: string; redirected?: boolean; method?: string;
  } = {}) => {
    const frameId = options.frameId ?? "main";
    const loaderId = options.loaderId ?? "loader";
    session.emit("Network.requestWillBeSent", { requestId, frameId, loaderId,
      request: { url, method: options.method ?? "GET" }, ...(options.redirected ? { redirectResponse: {} } : {}) });
    session.emit("Network.responseReceived", { requestId, frameId, loaderId, type: options.type ?? "Script",
      response: { url, status: 200, mimeType: "text/javascript;charset=UTF-8" } });
    session.emit("Network.dataReceived", { requestId, dataLength: options.bytes ?? Buffer.byteLength(body) });
    session.emit("Network.loadingFinished", { requestId });
  };
  return { capture, body, reads, commit, respond, release: () => release?.({ body, base64Encoded: false }) };
}

for (const [document, path] of [
  ["https://www.delonghi.com/en-us", "/asset/notice.js/v/62bb0e7"],
  [mobvista, "/v2/notice/jz9tfc"],
  ["https://trustarc.com/", "/asset/notice.js/v/186b810"],
] as const) {
  test(`captures TrustArc source on ${document}`, async () => {
    const f = fixture(document);
    f.respond("script", origin + path);
    await Promise.resolve();
    const result = f.capture.finish()!;
    assert.equal(result.documentUrl, document);
    assert.equal(result.assets[0]?.status, "retained");
    assert.equal(result.assets[0]?.body?.sha256, createHash("sha256").update(f.body).digest("hex"));
    assert.equal(Buffer.from(result.assets[0]!.body!.base64, "base64").toString(), f.body);
  });
}

test("only binds observed config to the reviewed frame, loader, tenant and direct GET", async () => {
  const f = fixture();
  const banner = origin + "/cm/jz9tfc/bannerconfig?locale=en&secret=omit";
  f.respond("foreign", origin + "/cm/unreviewed/bannerconfig", { type: "Fetch" });
  f.respond("frame", banner, { type: "Fetch", frameId: "child" });
  f.respond("loader", banner, { type: "Fetch", loaderId: "old" });
  f.respond("redirect", banner, { type: "Fetch", redirected: true });
  f.respond("post", banner, { type: "Fetch", method: "POST" });
  f.respond("log", origin + "/consent/log", { type: "Fetch" });
  f.respond("valid", banner, { type: "Fetch" });
  f.respond("indexes", origin + "/v2/consentcategories/getnonemptyindexes?cmId=jz9tfc", { type: "XHR" });
  await Promise.resolve();
  assert.deepEqual(f.reads, ["valid", "indexes"]);
  const result = f.capture.finish()!;
  assert.deepEqual(result.assets.map(asset => asset.path),
    ["/cm/jz9tfc/bannerconfig", "/v2/consentcategories/getnonemptyindexes"]);
  assert(!JSON.stringify(result).includes("secret"));
});

test("caps decoded bodies and discards pending bodies at freeze or reload", async () => {
  const f = fixture();
  const script = origin + "/v2/notice/jz9tfc";
  f.respond("large", script, { bytes: 512 * 1024 + 1 });
  f.respond("late", script);
  const result = f.capture.finish()!;
  f.release();
  await Promise.resolve();
  assert.deepEqual(f.reads, ["late"]);
  assert.deepEqual(result.assets.map(asset => asset.status), ["body_limit", "body_unavailable"]);

  const reload = fixture();
  reload.respond("late", script);
  reload.commit(mobvista, "replacement-loader");
  reload.release();
  await Promise.resolve();
  assert.equal(reload.capture.finish(), undefined);
});
