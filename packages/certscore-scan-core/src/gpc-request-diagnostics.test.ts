import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { CDPSession, Request } from "playwright";
import { createGpcRequestDiagnostics } from "./gpc-request-diagnostics.js";
import { gpcDocumentHash } from "./gpc-signal-capture.js";

const url = "https://example.test/resource?private=value";
const handle = (startTime = 1000) => ({ timing: () => ({ startTime }), method: () => "GET",
  resourceType: () => "script", serviceWorker: () => null, failure: () => null }) as Request;
const request = (id = "request-1", time = 1) => ({ requestId: id, loaderId: "loader", frameId: "main", type: "Script", wallTime: time,
  request: { url, method: "GET", headers: { "Sec-GPC": "1", Cookie: "secret" } } });
const missing = () => [{ eventId: "event-1", timestampMs: 10, urlSha256: gpcDocumentHash(url), secGpc: null }];

test("out-of-order wire headers remain bounded diagnostic evidence without replacing Playwright proof", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
  cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "sec-gpc": "1", Authorization: "secret" }, associatedCookies: ["secret"] });
  cdp.emit("Network.requestWillBeSent", request()); capture.track("event-1", handle(), true);
  const rows = missing(), result = capture.finish(rows), diagnostic = result.missingHeaders[0]!;
  assert.equal(diagnostic.correlation, "unique_url_method_start_time");
  assert.equal(diagnostic.cdp?.extraInfoHeader, "1");
  assert.equal(diagnostic.cdp?.extraInfoStatus, "single_request_single_extra_info");
  assert.equal(rows[0]!.secGpc, null);
  assert(!JSON.stringify(result).includes("secret")); assert(!JSON.stringify(result).includes("private=value"));
  const frozen = JSON.stringify(result); cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "sec-gpc": "0" } });
  assert.equal(JSON.stringify(result), frozen); capture.close();
});

test("duplicate timing candidates and redirect extra-info never borrow a header from a guessed request", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request()); cdp.emit("Network.requestWillBeSent", request("request-2"));
  capture.track("event-1", handle(), true);
  assert.equal(capture.finish(missing()).missingHeaders[0]?.correlation, "ambiguous"); capture.close();
  const other = new EventEmitter(); const redirects = createGpcRequestDiagnostics(other as CDPSession, "main");
  other.emit("Network.requestWillBeSent", request()); other.emit("Network.requestWillBeSent", request("request-1", 2));
  other.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: { "Sec-GPC": "1" } });
  redirects.track("event-1", handle(), true);
  const d = redirects.finish(missing()).missingHeaders[0]!;
  assert.equal(d.cdp?.extraInfoStatus, "ambiguous_redirect_or_extra_info"); assert.equal(d.cdp?.extraInfoHeader, null); redirects.close();
});

test("absent and zero wire headers stay distinct and unavailable timing stays unmatched", () => {
  for (const wire of [null, "0"]) {
    const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
    cdp.emit("Network.requestWillBeSent", request());
    cdp.emit("Network.requestWillBeSentExtraInfo", { requestId: "request-1", headers: wire === null ? {} : { "Sec-GPC": wire } });
    capture.track("event-1", handle(), true);
    assert.equal(capture.finish(missing()).missingHeaders[0]?.cdp?.extraInfoHeader, wire); capture.close();
  }
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request()); capture.track("event-1", handle(-1), true);
  assert.equal(capture.finish(missing()).missingHeaders[0]?.correlation, "timing_unavailable"); capture.close();
});

test("diagnostic memory and retention are bounded and explicitly count overflow", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
  for (let i = 0; i < 5010; i++) cdp.emit("Network.requestWillBeSent", request(`request-${i}`));
  const result = capture.finish(Array.from({length: 300}, (_, i) => ({...missing()[0]!, eventId: `event-${i}`})));
  assert.equal(result.observedCdpRequests, 5010); assert.equal(result.droppedCdpEvents, 10);
  assert.equal(result.missingHeaders.length, 256); assert.equal(result.droppedDiagnostics, 44); capture.close();
});

test("zero timing on a failed request keeps bounded candidates explicitly unbound", () => {
  const cdp = new EventEmitter(); const capture = createGpcRequestDiagnostics(cdp as CDPSession, "main");
  cdp.emit("Network.requestWillBeSent", request());
  cdp.emit("Network.loadingFailed", {requestId:"request-1",blockedReason:"csp"});
  const failed = {...handle(0), failure: () => ({errorText:"net::ERR_BLOCKED_BY_CLIENT"})} as Request;
  capture.track("event-1", failed, true);
  const d = capture.finish(missing()).missingHeaders[0]!;
  assert.equal(d.requestStartEpochMs, null); assert.equal(d.correlation, "timing_unavailable");
  assert.equal(d.cdp, null); assert.equal(d.failureCode, "ERR_BLOCKED_BY_CLIENT");
  assert.equal(d.unboundCandidates?.[0]?.failureCode, "unknown");
  assert.equal(d.unboundCandidates?.[0]?.blockedReason, "csp");
  assert.equal(d.unboundCandidates?.[0]?.extraInfoStatus, "unavailable"); capture.close();
});
