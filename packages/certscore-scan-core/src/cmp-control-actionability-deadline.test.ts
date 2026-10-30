import assert from "node:assert/strict";
import test from "node:test";
import type { Frame, Locator, Page } from "playwright";
import {
  dispatchLocatorClickWithVerifiedGeometry,
  inspectLocatorConsentReadiness,
  locatorActionabilitySupportsVerifiedDispatch,
  waitForLocatorVerifiedGeometry,
} from "./cmp-control-actionability.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const geometry = {
  scopeInteractive: true,
  boundingBoxInViewport: true,
  centerHitTargetRelation: "control_or_descendant" as const,
};

function fixture(input: { geometryRead?: Promise<typeof geometry>; cleanup?: Promise<void>; enabled?: boolean } = {}) {
  let reads = 0, clicks = 0, disposals = 0;
  const handle = {
    isVisible: async () => true,
    isEnabled: async () => input.enabled ?? true,
    evaluate: async () => { reads++; return input.geometryRead ?? geometry; },
    dispose: async () => { disposals++; await input.cleanup; },
  };
  const control = {
    elementHandle: async () => handle,
    click: async () => { clicks++; },
  } as unknown as Locator;
  return { control, reads: () => reads, clicks: () => clicks, disposals: () => disposals };
}

test("geometry recovery discards a positive read arriving after its original deadline", async () => {
  const pending = deferred<typeof geometry>(), f = fixture({geometryRead: pending.promise});
  const timer = setTimeout(() => pending.resolve(geometry), 100);
  try { assert.equal(await waitForLocatorVerifiedGeometry(f.control, 20), undefined); }
  finally { clearTimeout(timer); pending.resolve(geometry); }
});

test("aborting a pending geometry read releases the caller without waiting for the browser result", async () => {
  const pending = deferred<typeof geometry>(), f = fixture({geometryRead: pending.promise});
  const stop = new AbortController();
  const result = waitForLocatorVerifiedGeometry(f.control, 2_000, stop.signal);
  await new Promise(resolve => setImmediate(resolve)); stop.abort();
  let timer: NodeJS.Timeout | undefined;
  try {
    assert.equal(await Promise.race([result, new Promise<string>(resolve => {timer = setTimeout(() => resolve("still_waiting"), 100);})]), undefined);
  } finally { if (timer) clearTimeout(timer); pending.resolve(geometry); await result; }
});

test("forced geometry dispatch rejects a late positive read instead of starting a fresh click allowance", async () => {
  const pending = deferred<typeof geometry>(), f = fixture({geometryRead: pending.promise});
  const timer = setTimeout(() => pending.resolve(geometry), 100);
  try {
    await assert.rejects(dispatchLocatorClickWithVerifiedGeometry(f.control, 20), /no longer safely actionable|budget/i);
    assert.equal(f.clicks(), 0);
  } finally { clearTimeout(timer); pending.resolve(geometry); }
});

test("a pending actual frame read cannot queue replacement Locator reads or share a stale positive result", async () => {
  const scope = {} as Page, pending = deferred<typeof geometry>();
  const first = fixture({geometryRead: pending.promise}), second = fixture();
  const firstResult = await inspectLocatorConsentReadiness(first.control, {deadlineAtMs: Date.now() + 20, scope});
  assert.equal(firstResult.scopeInteractive, false);
  const secondResult = await inspectLocatorConsentReadiness(second.control, {deadlineAtMs: Date.now() + 100, scope});
  assert.equal(secondResult.scopeInteractive, false);
  assert.equal(second.reads(), 0, "new Locator object must not queue work in the same pending frame");
  pending.resolve(geometry); await new Promise(resolve => setImmediate(resolve));
  const fresh = await inspectLocatorConsentReadiness(second.control, {deadlineAtMs: Date.now() + 100, scope});
  assert.equal(fresh.scopeInteractive, true);
  assert.equal(second.reads(), 1, "only a new read can provide later evidence");
});

test("a busy frame does not block a different frame and cleanup cannot extend the read deadline", async () => {
  const pending = deferred<typeof geometry>(), cleanup = deferred<void>();
  const first = fixture({geometryRead: pending.promise}), other = fixture({cleanup: cleanup.promise});
  const firstResult = await inspectLocatorConsentReadiness(first.control, {deadlineAtMs: Date.now() + 20, scope: {} as Page});
  assert.equal(firstResult.scopeInteractive, false);
  const independent = fixture();
  assert.equal((await inspectLocatorConsentReadiness(independent.control, {
    deadlineAtMs: Date.now() + 100, scope: {} as Page,
  })).scopeInteractive, true);
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      inspectLocatorConsentReadiness(other.control, {deadlineAtMs: Date.now() + 100, scope: {} as Page}),
      new Promise<undefined>(resolve => {timer = setTimeout(() => resolve(undefined), 200);}),
    ]);
    assert.ok(result);
    assert.equal(locatorActionabilitySupportsVerifiedDispatch(result.actionability), false, "cleanup exhaustion must not return an expired positive result");
  } finally { if (timer) clearTimeout(timer); pending.resolve(geometry); cleanup.resolve(); }
});

test("expired or cancelled reads issue no browser command and disabled controls remain ineligible", async () => {
  const f = fixture(), stop = new AbortController(); stop.abort();
  for (const options of [{deadlineAtMs: Date.now() - 1}, {deadlineAtMs: Date.now() + 100, signal: stop.signal}]) {
    assert.equal((await inspectLocatorConsentReadiness(f.control, options)).scopeInteractive, false);
  }
  assert.equal(f.reads(), 0);
  const disabled = fixture({enabled: false});
  const result = await inspectLocatorConsentReadiness(disabled.control, {deadlineAtMs: Date.now() + 100});
  assert.equal(locatorActionabilitySupportsVerifiedDispatch(result.actionability), false);
});

test("Page and its main Frame share one pending actual-read slot", async () => {
  const frame = {} as Frame, page = {mainFrame: () => frame} as Page;
  const pending = deferred<typeof geometry>(), first = fixture({geometryRead: pending.promise}), second = fixture();
  try {
    await inspectLocatorConsentReadiness(first.control, {deadlineAtMs: Date.now() + 20, scope: page});
    assert.equal((await inspectLocatorConsentReadiness(second.control, {
      deadlineAtMs: Date.now() + 100, scope: frame,
    })).scopeInteractive, false);
    assert.equal(second.reads(), 0);
  } finally { pending.resolve(geometry); }
});

test("synchronous cleanup failure releases the scope without inventing failed geometry", async () => {
  const scope = {} as Frame, first = fixture(), second = fixture();
  const handle = await first.control.elementHandle(); assert.ok(handle);
  handle.dispose = () => { throw new Error("already detached"); };
  assert.equal((await inspectLocatorConsentReadiness(first.control, {deadlineAtMs: Date.now() + 100, scope})).scopeInteractive, true);
  assert.equal((await inspectLocatorConsentReadiness(second.control, {deadlineAtMs: Date.now() + 100, scope})).scopeInteractive, true);
  assert.equal(second.reads(), 1);
});
