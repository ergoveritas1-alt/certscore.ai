import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { Page } from "playwright";
import { createPassiveEvidenceActivityTracker } from "./passive-evidence-quiet-window.js";
import { RUNTIME_LOADING_DOCUMENT_SETTLE_MAX_MS, waitForLoadingRuntimeDocument } from "./runtime-document-settle.js";

function fixturePage(state: DocumentReadyState = "loading", stalled = false) {
  const events = new EventEmitter();
  const frame = {};
  const page = Object.assign(events, {
    evaluate: () => stalled ? new Promise<DocumentReadyState>(() => {}) : Promise.resolve(state),
    mainFrame: () => frame,
  });
  return { events, frame, page: page as unknown as Page };
}

function assertClean(events: EventEmitter) {
  assert.equal(events.listenerCount("domcontentloaded"), 0);
  assert.equal(events.listenerCount("framenavigated"), 0);
  assert.equal(events.listenerCount("close"), 0);
}

test("parsed runtime documents skip the extra wait and quiet interval", async () => {
  const { page, events } = fixturePage("interactive");
  const tracker = createPassiveEvidenceActivityTracker(0);
  tracker.markRequestStarted({});
  const result = await waitForLoadingRuntimeDocument({ page, timeoutMs: 10_000, tracker });
  assert.equal(result.status, "already_ready");
  assert.ok(result.elapsedMs < 250);
  assertClean(events);
});

test("loading runtime documents wait for parsing and late embed requests to settle", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const { page, events } = fixturePage();
  const tracker = createPassiveEvidenceActivityTracker();
  const request = {};
  const promise = waitForLoadingRuntimeDocument({ page, timeoutMs: 10_000, tracker });
  await Promise.resolve();
  t.mock.timers.tick(100);
  events.emit("domcontentloaded");
  tracker.markRequestStarted(request);
  t.mock.timers.tick(300);
  let completed = false;
  void promise.then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false, "the parser completing does not erase a pending embed request");
  tracker.markRequestFinished(request);
  for (let i = 0; i < 10; i++) t.mock.timers.tick(25);
  const result = await promise;
  assert.equal(result.status, "settled");
  assert.equal(result.elapsedMs, 650);
  assertClean(events);
});

test("the loading allowance has one ten-second cap even when a caller requests more", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const { page, events } = fixturePage();
  const promise = waitForLoadingRuntimeDocument({ page, timeoutMs: 30_000, tracker: createPassiveEvidenceActivityTracker() });
  await Promise.resolve();
  t.mock.timers.tick(10_000);
  assert.deepEqual(await promise, { elapsedMs: RUNTIME_LOADING_DOCUMENT_SETTLE_MAX_MS, status: "timed_out" });
  assertClean(events);
});

test("pending requests after parsing cannot turn an expired settle window into complete coverage", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const { page, events } = fixturePage();
  const tracker = createPassiveEvidenceActivityTracker();
  const promise = waitForLoadingRuntimeDocument({ page, timeoutMs: 300, tracker });
  await Promise.resolve();
  tracker.markRequestStarted({});
  events.emit("domcontentloaded");
  t.mock.timers.tick(300);
  assert.equal((await promise).status, "timed_out");
  assertClean(events);
});

for (const terminal of ["cancelled", "document_changed", "unavailable"] as const) {
  test(`runtime settling stops and removes listeners when ${terminal}`, async () => {
    const { page, events, frame } = fixturePage();
    const controller = new AbortController();
    const promise = waitForLoadingRuntimeDocument({ page, signal: controller.signal, timeoutMs: 10_000, tracker: createPassiveEvidenceActivityTracker() });
    await Promise.resolve();
    if (terminal === "cancelled") controller.abort();
    else events.emit(terminal === "document_changed" ? "framenavigated" : "close", frame);
    assert.equal((await promise).status, terminal);
    assertClean(events);
  });
}

test("a stalled readiness read fails closed within 500ms", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  const { page, events } = fixturePage("loading", true);
  const promise = waitForLoadingRuntimeDocument({ page, timeoutMs: 10_000, tracker: createPassiveEvidenceActivityTracker() });
  t.mock.timers.tick(500);
  assert.deepEqual(await promise, { elapsedMs: 500, status: "unavailable" });
  assertClean(events);
});
