import assert from "node:assert/strict";
import test from "node:test";
import { getEventListeners } from "node:events";
import type { BrowserContext, Page } from "playwright";
import { SALE_SHARING_EXACT_ROUTE_POLICY, saleSharingExactRouteAuthorization, type SaleSharingOptOutDispatch } from "@certscore/contracts";
import { createGimbalPageWithGuards, usesGimbalSetupOverlap } from "./gimbal-setup-overlap";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  const events: string[] = [], abort = new AbortController();
  const pageWork = deferred<Page>(), identity = deferred<void>(), network = deferred<void>();
  let url = "about:blank", remainingMs = 200;
  const page = {url: () => url, close: async () => {events.push("page.close");}} as unknown as Page;
  const context = {
    newPage: () => {events.push("page.start"); return pageWork.promise;},
    close: async () => {events.push("context.close");},
  } as unknown as BrowserContext;
  const input = {context, signal: abort.signal, remaining: () => {
    if (remainingMs <= 0) throw Error("observation_budget_or_cancellation");
    return remainingMs;
  }, installIdentityGuard: async () => {events.push("identity.start"); await identity.promise; events.push("identity.done");},
  installNetworkGuard: async () => {events.push("network.start"); await network.promise; events.push("network.done");}};
  return {input, page, pageWork, identity, network, events, abort,
    setUrl: (value: string) => {url=value;}, expire: () => {remainingMs=0;}};
}

test("only the exact Gimbal v3 grant selects overlap", () => {
  const config = (target: string) => ({enabled: true, policyVersion: SALE_SHARING_EXACT_ROUTE_POLICY,
    scanId: "fixture", exactTargetUrl: target, exactRouteAuthorization: saleSharingExactRouteAuthorization(target)}) as SaleSharingOptOutDispatch;
  assert.equal(usesGimbalSetupOverlap(config("https://gimbal.com/")), true);
  for (const target of ["https://readcube.com/", "https://infillion.com/", "http://gimbal.com/", "https://www.gimbal.com/", "https://gimbal.com/path", "https://gimbal.com/?x=1", "https://gimbal.com/#x"]) {
    assert.equal(usesGimbalSetupOverlap(config(target)), false, target);
  }
  const valid = config("https://gimbal.com/");
  for (const patch of [
    {policyVersion: "bounded_sale_sharing_opt_out.v1"},
    {policyVersion: "bounded_sale_sharing_opt_out.v2-apex-www"},
    {exactRouteAuthorization: undefined},
    {exactRouteAuthorization: {...valid.exactRouteAuthorization!, routeId: "readcube.v1"}},
    {exactRouteAuthorization: {...valid.exactRouteAuthorization!, targets: ["https://infillion.com/other"]}},
    {exactRouteAuthorization: {...valid.exactRouteAuthorization!, targets: ["https://infillion.com/", "https://other.test/"]}},
  ]) assert.equal(usesGimbalSetupOverlap({...valid, ...patch} as SaleSharingOptOutDispatch), false);
});

for (const pageFirst of [true, false]) test(`both branches start; page ${pageFirst ? "first" : "last"} cannot bypass ordered guards`, async () => {
  const f = fixture(); let usable = false;
  const work = createGimbalPageWithGuards(f.input).then(page => {usable=true; return page;});
  await flush();
  assert.deepEqual(f.events, ["page.start", "identity.start"]);
  if (pageFirst) f.pageWork.resolve(f.page);
  // Even a pre-resolved network promise must not install before identity ends.
  f.network.resolve(); await flush(); assert.equal(usable, false);
  assert.equal(f.events.includes("network.start"), false);
  f.identity.resolve(); await flush();
  assert.ok(f.events.indexOf("identity.done") < f.events.indexOf("network.start"));
  if (!pageFirst) {assert.equal(usable, false); f.pageWork.resolve(f.page);}
  assert.equal(await work, f.page); assert.equal(usable, true);
  assert.equal(f.events.includes("context.close"), false);
  assert.equal(getEventListeners(f.abort.signal, "abort").length, 0);
});

test("identity failure closes context; late page is closed; network never installs", async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/identity failed/);
  f.identity.reject(Error("identity failed")); await rejected;
  assert.ok(f.events.includes("context.close"));
  f.pageWork.resolve(f.page); await flush();
  assert.ok(f.events.includes("page.close"));
  assert.equal(f.events.includes("network.start"), false);
});

test("page failure closes context and prevents a late identity result starting network", async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/page failed/);
  f.pageWork.reject(Error("page failed")); await rejected;
  f.identity.resolve(); await flush();
  assert.ok(f.events.includes("context.close"));
  assert.equal(f.events.includes("network.start"), false);
});

test("network failure after page success cannot release the page", async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/network failed/);
  f.pageWork.resolve(f.page); f.identity.resolve(); await flush();
  f.network.reject(Error("network failed")); await rejected;
  assert.ok(f.events.includes("context.close"));
  assert.equal(getEventListeners(f.abort.signal, "abort").length, 0);
});

for (const phase of ["initial", "network"]) test(`cancellation during ${phase} setup exits without waiting for stalled branches`, {timeout:1000}, async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/observation_budget_or_cancellation/);
  await flush();
  if (phase === "network") {f.identity.resolve(); await flush();}
  f.abort.abort(); await rejected;
  assert.ok(f.events.includes("context.close"));
  assert.equal(getEventListeners(f.abort.signal, "abort").length, 0);
  f.pageWork.resolve(f.page);
  if (phase === "initial") f.identity.reject(Error("late identity failure"));
  else f.network.reject(Error("late network failure"));
  await flush(); assert.ok(f.events.includes("page.close"));
});

test("already-cancelled setup performs no page or guard operation", async () => {
  const f=fixture(); f.abort.abort();
  await assert.rejects(createGimbalPageWithGuards(f.input), /observation_budget_or_cancellation/);
  assert.ok(f.events.every(event=>event === "context.close"));
});

test("expired absolute deadline performs no setup; no new timeout is allocated", async () => {
  const f=fixture(); f.expire();
  await assert.rejects(createGimbalPageWithGuards(f.input), /observation_budget_or_cancellation/);
  assert.ok(f.events.every(event=>event === "context.close"));
});

for (const phase of ["page", "identity", "network"]) test(`deadline exhaustion at ${phase} completion fails closed`, async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/observation_budget_or_cancellation/);
  await flush();
  if (phase === "network") {f.identity.resolve(); await flush();}
  f.expire();
  if (phase === "page") f.pageWork.resolve(f.page);
  else if (phase === "identity") f.identity.resolve();
  else f.network.resolve();
  await rejected;
  assert.ok(f.events.includes("context.close"));
  f.pageWork.resolve(f.page); f.identity.resolve(); f.network.resolve(); await flush();
});

for (const late of [false, true]) test(`nonblank page ${late ? "after waiting for guards" : "on creation"} is rejected`, async () => {
  const f=fixture(), work=createGimbalPageWithGuards(f.input);
  const rejected=assert.rejects(work,/gimbal_setup_not_blank/);
  if (!late) f.setUrl("https://infillion.com/");
  f.pageWork.resolve(f.page); await flush();
  if (late) f.setUrl("https://infillion.com/");
  f.identity.resolve(); f.network.resolve(); await rejected;
  assert.ok(f.events.includes("context.close"));
});

test("cleanup failure does not replace the original setup failure", async () => {
  const f=fixture(); f.input.context.close=async()=>{throw Error("cleanup failed");};
  const work=createGimbalPageWithGuards(f.input), rejected=assert.rejects(work,/page failed/);
  f.pageWork.reject(Error("page failed")); await rejected;
  f.identity.reject(Error("late failure")); await flush();
});
