import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { CDPSession, Page, Request, Response } from "playwright";
import { ONETRUST_REVIEWED_SDKS, oneTrustSdkSourceSchema } from "@certscore/contracts";
import { createOneTrustSdkSourceCapture } from "./onetrust-sdk-source.js";

const pin = ONETRUST_REVIEWED_SDKS.find(row => row.sdkUrl.includes("/202608.1.0/"))!;
const target = "https://owned.example/";
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

async function fixture(order: "native_first" | "playwright_first" = "native_first", options: { deadlineAtEpochMs?: number; signal?: AbortSignal } = {},
  setup: "normal" | "rejected" = "normal", deferCommitPair = false) {
  const pageEvents = new EventEmitter(), nativeEvents = new EventEmitter(), frame = {};
  let url = "about:blank", loader = "original-loader", bodyReads = 0;
  const commands: string[] = [];
  const reads: Array<{ resolve(value: unknown): void; reject(reason: Error): void }> = [];
  const page = Object.assign(pageEvents, { url: () => url, mainFrame: () => frame }) as unknown as Page;
  const session = Object.assign(nativeEvents, { send: (command: string) => {
    commands.push(command);
    if (command === "Page.enable") return setup === "normal" ? Promise.resolve({}) : Promise.reject(Error("Page unavailable"));
    assert.equal(command, "Page.getFrameTree");
    return new Promise((resolve, reject) => reads.push({ resolve, reject }));
  } }) as unknown as CDPSession;
  const capture = createOneTrustSdkSourceCapture(page, () => pin.sdkSha256);
  capture.bindNativeSession(session, options);
  await settle();
  const playwright = (next = url) => { url = next; pageEvents.emit("framenavigated", frame); };
  const commit = (next = url, nextLoader = loader) => {
    loader = nextLoader;
    nativeEvents.emit("Page.frameNavigated", { frame: { id: "main", loaderId: loader, url: next } });
  };
  const history = (next = url, extra = {}) => nativeEvents.emit("Page.navigatedWithinDocument", { frameId: "main", url: next, navigationType: "historyApi", ...extra });
  url = target;
  if (order === "native_first") { commit(); if (!deferCommitPair) playwright(); }
  else { playwright(); if (!deferCommitPair) commit(); }
  async function sdk(extra: Record<string, unknown> = {}, deferredBody?: Promise<Buffer>) {
    const request = { url: () => pin.sdkUrl, method: () => "GET", resourceType: () => "script", frame: () => frame, redirectedFrom: () => null, ...extra } as unknown as Request;
    const response = { request: () => request, status: () => 200, fromServiceWorker: () => false, url: () => pin.sdkUrl,
      headers: () => ({}), body: () => { bodyReads++; return deferredBody ?? Promise.resolve(Buffer.alloc(pin.sdkBytes)); }, ...extra } as unknown as Response;
    pageEvents.emit("request", request); pageEvents.emit("response", response); await settle();
  }
  const noop = () => {
    if (order === "native_first") { history(); playwright(); }
    else { playwright(); history(); }
  };
  const resolve = async (index = reads.length - 1, change = {}) => {
    reads[index]!.resolve({ frameTree: { frame: { id: "main", loaderId: loader, url, ...change } } }); await settle();
  };
  return { capture, page, session, nativeEvents, pageEvents, frame, commands, reads, sdk, noop, history, playwright, commit, resolve, bodyReads: () => bodyReads };
}

for (const order of ["native_first", "playwright_first"] as const) {
  test(`same exact URL history needs a completed native checkpoint: ${order}`, async () => {
    const f = await fixture(order);
    assert.equal(f.capture.diagnostic(), "sdk_not_observed", "ordinary initial commit is not a lost SDK");
    await f.sdk(); const original = f.capture.snapshot(); assert.ok(original);
    const originalJson = JSON.stringify(original);
    f.noop(); assert.equal(f.capture.snapshot(), undefined, "no proof while checkpoint is pending");
    assert.deepEqual(f.commands, ["Page.enable", "Page.getFrameTree"]);
    await f.resolve(); const restored = f.capture.snapshot(); assert.ok(restored);
    assert.notEqual(restored, original, "earlier baseline source objects cannot gain later proof");
    assert.equal(JSON.stringify(original), originalJson);
    assert.equal(restored.documentEpochSha256, original.documentEpochSha256);
    assert.ok(restored.documentContinuity);
    assert.ok(oneTrustSdkSourceSchema.safeParse(restored).success);
    assert.equal(f.bodyReads(), 1, "continuity does not reread SDK bytes");
    f.capture.dispose();
  });
}

for (const change of [{ loaderId: "different-loader" }, { id: "different-frame" }, { url: `${target}?changed` }, { loaderId: "" }]) {
  test(`native checkpoint rejects conflicting identity ${JSON.stringify(change)}`, async () => {
    const f = await fixture(); await f.sdk(); f.noop(); await f.resolve(0, change);
    assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
  });
}

for (const kind of ["fragment", "path", "query", "document_open", "unknown_type", "detach"] as const) {
  test(`a ${kind} transition cannot restore historical source`, async () => {
    const f = await fixture(); await f.sdk();
    if (kind === "document_open") f.nativeEvents.emit("Page.documentOpened", { frame: { id: "main", loaderId: "original-loader", url: target } });
    else if (kind === "detach") f.nativeEvents.emit("Disconnected");
    else if (kind === "unknown_type") { f.history(target, { navigationType: "other" }); f.playwright(target); }
    else {
      const changed = target + (kind === "fragment" ? "#part" : kind === "path" ? "changed" : "?changed=1");
      f.history(changed); f.playwright(changed); f.history(target); f.playwright(target);
    }
    f.noop(); assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 0); f.capture.dispose();
  });
}

test("same-URL full navigation invalidates the old epoch and needs fresh SDK bytes", async () => {
  const f = await fixture(); await f.sdk(); const original = f.capture.snapshot()!;
  f.playwright(); f.commit(target, "reloaded-loader"); assert.equal(f.capture.snapshot(), undefined);
  assert.equal(f.capture.diagnostic(), "sdk_document_changed");
  await f.sdk(); const fresh = f.capture.snapshot(); assert.ok(fresh);
  assert.notEqual(fresh.documentEpochSha256, original.documentEpochSha256);
  assert.equal(fresh.documentContinuity, undefined); assert.equal(f.reads.length, 0); f.capture.dispose();
});

for (const missing of ["native", "playwright"] as const) test(`missing ${missing} event stays quarantined`, async () => {
  const f = await fixture(); await f.sdk();
  if (missing === "native") f.playwright(); else f.history();
  assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 0); f.capture.dispose();
});

test("a later native no-op cannot disguise a missing full-navigation event", async () => {
  const f = await fixture(); await f.sdk(); f.playwright(); f.history();
  assert.equal(f.reads.length, 1);
  await f.resolve(0, { loaderId: "actual-new-loader" });
  assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
});

for (const duplicate of ["native", "playwright"] as const) test(`an unmatched duplicate ${duplicate} event defeats a pending checkpoint`, async () => {
  const f = await fixture(); await f.sdk(); f.noop();
  if (duplicate === "native") f.history(); else f.playwright();
  await f.resolve(); assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 1); f.capture.dispose();
});

test("native event overflow disables restoration without retaining later events", async () => {
  const f = await fixture(); await f.sdk();
  for (let index = 0; index < 10_000; index++) f.history();
  for (let index = 0; index < 20; index++) f.playwright();
  assert.equal(f.reads.length, 0); assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
});

test("checkpoint limit is per action and never resets after a new document", async () => {
  const f = await fixture(); await f.sdk();
  for (let index = 0; index < 2; index++) { f.noop(); await f.resolve(); assert.ok(f.capture.snapshot()); }
  f.playwright(); f.commit(target, "second-loader"); await f.sdk(); assert.ok(f.capture.snapshot());
  f.noop(); assert.equal(f.reads.length, 2); assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
});

test("only one native read runs at a time and stale readbacks cannot restore", async () => {
  const f = await fixture(); await f.sdk(); f.noop(); f.noop();
  assert.equal(f.reads.length, 1); await f.resolve(0);
  assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 2);
  await f.resolve(1); assert.ok(f.capture.snapshot()); f.capture.dispose();
});

for (const invalidation of ["dispose", "full_commit", "abort", "timeout"] as const) test(`late checkpoint discarded after ${invalidation}`, async () => {
  const abort = new AbortController(); const f = await fixture("native_first", { signal: abort.signal });
  await f.sdk(); f.noop();
  if (invalidation === "dispose") f.capture.dispose();
  else if (invalidation === "full_commit") f.commit(target, "replacement");
  else if (invalidation === "abort") abort.abort();
  else await new Promise(resolve => setTimeout(resolve, 110));
  await f.resolve(0); assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 1); f.capture.dispose();
});

test("a duplicate SDK request cannot be erased by a no-op or native checkpoint", async () => {
  const f = await fixture(); await f.sdk(); f.noop(); await f.sdk(); await f.resolve();
  assert.equal(f.capture.snapshot(), undefined); assert.equal(f.bodyReads(), 1);
  f.noop(); assert.equal(f.reads.length, 1); f.capture.dispose();
});

test("source hashing pending at a history event cannot acquire retroactive continuity", async () => {
  const f = await fixture(); let finish!: (bytes: Buffer) => void;
  await f.sdk({}, new Promise(resolve => { finish = resolve; })); f.noop();
  finish(Buffer.alloc(pin.sdkBytes)); await settle();
  assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 0); f.capture.dispose();
});

test("restoration never detaches the shared session or retains its listeners after disposal", async () => {
  const f = await fixture(); await f.sdk(); f.noop(); f.capture.dispose(); await f.resolve();
  assert.equal(f.nativeEvents.listenerCount("Page.frameNavigated"), 0);
  assert.equal(f.nativeEvents.listenerCount("Page.navigatedWithinDocument"), 0);
  assert.equal(f.nativeEvents.listenerCount("Disconnected"), 0);
  assert.equal(f.pageEvents.listenerCount("framenavigated"), 0);
});

test("failed native setup preserves ordinary capture and conservative navigation invalidation", async () => {
  const f = await fixture("native_first", {}, "rejected"); await f.sdk(); assert.ok(f.capture.snapshot());
  f.noop(); assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 0); f.capture.dispose();
});

test("the action deadline prevents another native checkpoint or late restoration", async () => {
  const f = await fixture("native_first", { deadlineAtEpochMs: Date.now() + 35 });
  await f.sdk(); f.noop(); await new Promise(resolve => setTimeout(resolve, 40)); await f.resolve();
  f.noop(); assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 1); f.capture.dispose();
});

test("child-frame events cannot quarantine or restore a main-frame source", async () => {
  const f = await fixture(); await f.sdk(); const source = f.capture.snapshot(); assert.ok(source);
  f.nativeEvents.emit("Page.frameNavigated", { frame: { id: "child", parentId: "main", loaderId: "child-loader", url: target } });
  f.nativeEvents.emit("Page.navigatedWithinDocument", { frameId: "child", url: target, navigationType: "historyApi" });
  f.nativeEvents.emit("Page.documentOpened", { frame: { id: "child", parentId: "main" } });
  f.nativeEvents.emit("Page.frameDetached", { frameId: "child" });
  assert.equal(f.capture.snapshot(), source); assert.equal(f.reads.length, 0); f.capture.dispose();
});

for (const event of ["close", "crash"] as const) test(`page ${event} invalidates pending continuity`, async () => {
  const f = await fixture(); await f.sdk(); f.noop(); f.pageEvents.emit(event); await f.resolve();
  assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
  assert.equal(f.pageEvents.listenerCount(event), 0);
});


test("SDK verified between native commit and Playwright notification survives only a fresh loader checkpoint", async () => {
  const f = await fixture("native_first", {}, "normal", true);
  await f.sdk();
  assert.equal(f.capture.snapshot(), undefined, "an unpaired commit supplies no usable source");
  f.playwright();
  assert.equal(f.capture.snapshot(), undefined);
  assert.equal(f.reads.length, 1, "one bounded read verifies the interleaved source");
  await f.resolve();
  const source = f.capture.snapshot(); assert.ok(source);
  assert.equal(source.documentContinuity?.navigationType, "documentCommit");
  assert.ok(oneTrustSdkSourceSchema.safeParse(source).success);
  assert.equal(f.bodyReads(), 1); f.capture.dispose();
});

for (const change of [{loaderId: "replacement"}, {id: "other-frame"}, {url: target + "other"}]) {
  test(`interleaved commit SDK rejects wrong native identity ${JSON.stringify(change)}`, async () => {
    const f = await fixture("native_first", {}, "normal", true); await f.sdk(); f.playwright();
    assert.equal(f.reads.length, 1); await f.resolve(0, change);
    assert.equal(f.capture.snapshot(), undefined); f.capture.dispose();
  });
}

test("SDK body completing after commit pairing can establish only later fresh proof", async () => {
  const f = await fixture("native_first", {}, "normal", true);
  let finish!: (bytes: Buffer) => void;
  await f.sdk({}, new Promise(resolve => { finish = resolve; })); f.playwright();
  assert.equal(f.capture.snapshot(), undefined); assert.equal(f.reads.length, 0);
  finish(Buffer.alloc(pin.sdkBytes)); await settle();
  assert.equal(f.reads.length, 1); assert.equal(f.capture.snapshot(), undefined);
  await f.resolve(); assert.ok(f.capture.snapshot()); f.capture.dispose();
});
