import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { runtimeEvidenceGraphSchema, runtimeGraphHashInput, RUNTIME_EVIDENCE_GRAPH_LIMITS } from "@certscore/contracts";
import { RuntimeEvidenceGraphBuilder, parseGraphSetCookie } from "./runtime-evidence-graph.js";

const make = (scenario: "pre_consent" | "post_reject" = "pre_consent") => new RuntimeEvidenceGraphBuilder({ scanId: "scan", captureId: "runtime", scenario, mode: "project", startedAt: new Date(Date.now() - 1000).toISOString(), browserVersion: "fixture" });
const request = (id = "1", url = "https://site.test/collect") => ({ requestId: id, timestamp: 1, frameId: "frame", loaderId: "document", documentURL: "https://site.test/", type: "Fetch", request: { url, method: "GET" }, initiator: { type: "script", stack: { callFrames: [{ scriptId: "7", url: "https://vendor.test/widget.js", lineNumber: 0, columnNumber: 1 }] } } });
const response = (id = "1", extra = true) => ({ requestId: id, timestamp: 2, hasExtraInfo: extra, response: { status: 200, url: "https://site.test/collect" } });
const cookie = (path = "/") => ({ name: "same", domain: "site.test", path, value: "private-value", secure: true, httpOnly: true, expires: -1, session: true });
const reqExtra = (id = "1") => ({ requestId: id, associatedCookies: [{ cookie: cookie(), blockedReasons: [] }] });
const resExtra = (id = "1", line = "same=private-value; Path=/; Secure; HttpOnly", blocked = false) => ({ requestId: id, statusCode: 200, headers: { "set-cookie": line, authorization: "private-secret" }, blockedCookies: blocked ? [{ cookieLine: line, blockedReasons: ["SameSiteNoneInsecure"] }] : [] });

for (const order of [[0, 1, 2, 3], [2, 3, 0, 1], [0, 3, 1, 2], [3, 0, 2, 1]]) {
  test(`graph correlates independently ordered ExtraInfo ${order}`, () => {
    const b = make();
    const events = [["Network.requestWillBeSent", request()], ["Network.responseReceived", response()], ["Network.requestWillBeSentExtraInfo", reqExtra()], ["Network.responseReceivedExtraInfo", resExtra()]] as const;
    for (const i of order) b.handle("main", events[i]![0], events[i]![1]);
    b.snapshot([cookie(), cookie("/other")]);
    const graph = b.finish();
    assert.equal(graph.nodes.filter(n => n.kind === "request").length, 1);
    const setter = graph.edges.find(e => e.relation === "response_cookie_attempt")!;
    assert.equal(graph.nodes.find(n => n.id === setter.from)?.kind, "response");
    assert.equal(graph.edges.filter(e => e.relation === "snapshot_confirms").length, 1);
    assert.equal(graph.edges.filter(e => e.relation === "cookie_included").length, 1);
    assert.equal(graph.nodes.find(n => n.id === setter.to)?.outcome, "attempted");
    assert.ok(!JSON.stringify(graph).includes("private-value"));
    assert.ok(!JSON.stringify(graph).includes("private-secret"));
    assert.equal(graph.sourceHash, createHash("sha256").update(runtimeGraphHashInput(graph)).digest("hex"));
  });
}

test("same-URL requests, frame documents and target request IDs remain distinct", () => {
  const b = make();
  for (const [session, id, frame] of [["a", "1", "left"], ["a", "2", "right"], ["b", "1", "left"]]) {
    b.handle(session!, "Network.requestWillBeSent", { ...request(id), frameId: frame });
    b.handle(session!, "Network.responseReceived", response(id, false));
  }
  const g = b.finish();
  assert.equal(g.nodes.filter(n => n.kind === "request").length, 3);
  assert.equal(g.nodes.filter(n => n.kind === "document").length, 3);
  assert.equal(g.nodes.filter(n => n.kind === "frame").length, 3);
});

test("redirect IDs become hop identities; incomplete extras do not leak between hops", () => {
  for (const complete of [true, false]) {
    const b = make();
    b.handle("main", "Network.requestWillBeSent", request());
    b.handle("main", "Network.requestWillBeSentExtraInfo", reqExtra());
    b.handle("main", "Network.responseReceivedExtraInfo", resExtra("1", "first=value; Path=/"));
    b.handle("main", "Network.requestWillBeSent", { ...request("1", "https://site.test/next"), redirectHasExtraInfo: true, redirectResponse: { status: 302 } });
    b.handle("main", "Network.responseReceived", response());
    if (complete) {
      b.handle("main", "Network.requestWillBeSentExtraInfo", reqExtra());
      b.handle("main", "Network.responseReceivedExtraInfo", resExtra("1", "second=value; Path=/"));
    }
    const g = b.finish();
    assert.equal(g.nodes.filter(n => n.kind === "request").length, 2);
    assert.equal(g.edges.filter(e => e.relation === "redirected_from").length, 1);
    assert.equal(g.edges.filter(e => e.relation === "response_cookie_attempt").length, complete ? 2 : 0);
    if (!complete) assert.ok(g.coverage.reasons.includes("extra_info_pairing_incomplete"));
  }
});

test("blocked and partition-unknown writes cannot be snapshot-confirmed", () => {
  const b = make();
  b.handle("main", "Network.requestWillBeSent", request());
  b.handle("main", "Network.responseReceived", response());
  b.handle("main", "Network.requestWillBeSentExtraInfo", reqExtra());
  b.handle("main", "Network.responseReceivedExtraInfo", resExtra("1", "same=private-value; Path=/; Partitioned", true));
  b.snapshot([cookie()]);
  const g = b.finish();
  assert.equal(g.nodes.find(n => n.operation === "http_set")?.outcome, "blocked");
  assert.equal(g.edges.filter(e => e.relation === "snapshot_confirms").length, 0);
});

test("cookie metadata preserves domain/path/default path, expiry and deletion, not raw values", () => {
  const parsed = parseGraphSetCookie("key=secret; Domain=.site.test; Path=/scope; Max-Age=0; Secure; HttpOnly; SameSite=Lax", "https://site.test/a/b")!;
  assert.deepEqual(parsed.cookie, { name: "key", domain: "site.test", path: "/scope", hostOnly: false, identityRedacted: false });
  assert.equal(parsed.cookieAttributes?.maxAge, 0);
  assert.equal(parseGraphSetCookie("key=value", "https://site.test/a/b")?.cookie?.path, "/a");
  assert.ok(!JSON.stringify(parsed).includes("secret"));
  for (const invalid of ["", "-", "+0", "  ", "0oops", "1.5"]) assert.equal(parseGraphSetCookie(`key=value; Max-Age=${invalid}`, "https://site.test/")?.cookieAttributes?.maxAge, undefined);
});

test("graph limits preserve referential integrity and late events cannot mutate the terminal packet", () => {
  const b = make();
  for (let i = 0; i < 2000; i++) b.handle("main", "Network.requestWillBeSent", request(String(i), `https://site.test/${i}?secret=value`));
  const g = b.finish(); const serialized = JSON.stringify(g);
  assert.ok(Buffer.byteLength(serialized) <= RUNTIME_EVIDENCE_GRAPH_LIMITS.bytes);
  assert.equal(g.coverage.status, "partial");
  assert.ok(g.coverage.droppedNodes > 0);
  assert.ok(runtimeEvidenceGraphSchema.safeParse(g).success);
  b.handle("main", "Network.requestWillBeSent", request("late")); b.snapshot([cookie()]);
  assert.equal(JSON.stringify(b.finish()), serialized);
});

test("graph rejects dangling edges, unsafe fields, hashes with malformed syntax and unanchored action status", () => {
  const g = make().finish();
  assert.equal(runtimeEvidenceGraphSchema.safeParse({ ...g, body: "private" }).success, false);
  assert.equal(runtimeEvidenceGraphSchema.safeParse({ ...g, edges: [{ id: "e", from: "missing", to: "other", relation: "response_to", basis: "cdp", directness: "direct" }] }).success, false);
  assert.equal(runtimeEvidenceGraphSchema.safeParse({ ...g, scenario: "post_reject" }).success, false);
  assert.equal(runtimeEvidenceGraphSchema.safeParse({ ...g, sourceHash: "invalid" }).success, false);
  const b = make("post_reject"); b.confirmAction(Date.now());
  assert.equal(b.finish().action?.status, "confirmed");
});

test("stylesheet/font chains retain direct parser source and only unique loaded-resource associations", () => {
  for (const duplicate of [false, true]) {
    const b = make();
    const css = { ...request("css", "https://site.test/style.css"), type: "Stylesheet", initiator: { type: "parser", url: "https://site.test/" } };
    b.handle("main", "Network.requestWillBeSent", css);
    if (duplicate) b.handle("main", "Network.requestWillBeSent", { ...css, requestId: "css-duplicate" });
    b.handle("main", "Network.requestWillBeSent", { ...request("font", "https://fonts.test/font.woff2"), timestamp: 1.1, type: "Font", initiator: { type: "parser", url: "https://site.test/style.css" } });
    const g = b.finish(); const font = g.nodes.find(node => node.resourceType === "Font")!;
    const edge = g.edges.find(edge => edge.to === font.id && edge.relation === "parser_loaded")!;
    assert.equal(g.nodes.find(node => node.id === edge.from)?.kind, "resource"); assert.equal(edge.directness, "direct");
    assert.equal(g.edges.filter(edge => edge.relation === "loaded_resource").length, duplicate ? 0 : 1);
    if (duplicate) assert.ok(g.coverage.reasons.includes("loaded_source_request_ambiguous"));
  }
});

test("probe origin is bound to browser document and stale/forged contexts cannot invent a parent", () => {
  const b = make();
  b.handle("main", "Page.frameNavigated", { frame: { id: "frame", loaderId: "doc1", url: "https://site.test/path/" } });
  b.handle("main", "Runtime.executionContextCreated", { context: { id: 7, auxData: { isDefault: true, frameId: "frame" } } });
  b.probe("main", 7, { operation: "js_set", cookieLine: "key=; Path=/", success: true, documentUrl: "https://forged.test/", origin: "https://forged.test/" });
  b.handle("main", "Runtime.executionContextsCleared", {});
  b.probe("main", 7, { operation: "setItem", name: "forged", success: true });
  const g = b.finish(); assert.equal(g.nodes.find(node => node.operation === "js_set")?.cookie?.domain, "site.test");
  assert.ok(!JSON.stringify(g).includes("forged.test")); assert.ok(!g.nodes.some(node => node.name === "forged"));
  assert.ok(g.coverage.reasons.includes("probe_context_unresolved"));
});

test("cached/worker-served responses and blocked requests retain distinct network identity without message payloads", () => {
  const b = make();
  b.handle("main", "Network.requestWillBeSent", request("cached"));
  b.handle("main", "Network.responseReceived", { ...response("cached", false), response: { status: 200, fromDiskCache: true, fromServiceWorker: true } });
  b.handle("main", "Network.requestWillBeSent", request("blocked"));
  b.handle("main", "Network.loadingFailed", { requestId: "blocked", blockedReason: "inspector" });
  b.handle("main", "Network.webSocketCreated", { requestId: "socket", url: "wss://site.test/stream?private=yes", initiator: request().initiator });
  for (let index = 0; index < 10; index++) b.handle("main", "Network.webSocketFrameReceived", { requestId: "socket", response: { payloadData: "PRIVATE_STREAM_BODY" } });
  const g = b.finish(); assert.equal(g.nodes.filter(node => node.kind === "request").length, 2);
  assert.ok(g.nodes.some(node => node.fromCache && node.fromServiceWorker));
  assert.equal(g.nodes.find(node => node.requestId === "blocked")?.outcome, "blocked");
  assert.equal(g.nodes.find(node => node.kind === "connection")?.messageCount, 10);
  assert.ok(!JSON.stringify(g).includes("PRIVATE_STREAM_BODY"));
});

test("HTTP cookie lifetime survives safe buffering and colliding attempts do not claim a winning setter", () => {
  const b = make();
  for (const id of ["a", "b"]) {
    b.handle("main", "Network.requestWillBeSent", request(id));
    b.handle("main", "Network.responseReceived", response(id));
    b.handle("main", "Network.responseReceivedExtraInfo", resExtra(id, "same=private-value; Path=/; Max-Age=864000; Expires=Thu, 01 Jan 2037 00:00:00 GMT"));
  }
  b.snapshot([cookie()]); const g = b.finish();
  assert.equal(g.nodes.find(node => node.operation === "http_set")?.cookieAttributes?.maxAge, 864000);
  assert.equal(g.nodes.find(node => node.operation === "http_set")?.cookieAttributes?.expires, Date.parse("2037-01-01") / 1000);
  assert.equal(g.edges.filter(edge => edge.relation === "snapshot_confirms").length, 0);
});

test("host-only and domain cookies never collapse and deletion cannot confirm surviving storage", () => {
  const b = make();
  b.handle("main", "Network.requestWillBeSent", request());
  b.handle("main", "Network.responseReceived", response());
  b.handle("main", "Network.responseReceivedExtraInfo", resExtra("1", "same=; Path=/; Max-Age=0"));
  b.snapshot([{ ...cookie(), value: "" }, { ...cookie(), domain: ".site.test", value: "" }]);
  const g = b.finish(); const snapshots = g.nodes.filter(node => node.operation === "snapshot");
  assert.equal(snapshots.length, 2); assert.deepEqual(snapshots.map(node => node.cookie?.hostOnly).sort(), [false, true]);
  assert.equal(g.edges.filter(edge => edge.relation === "snapshot_confirms").length, 0);
});
