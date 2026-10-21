import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import { EventEmitter } from "node:events";
import { describeAccessReliability, recoveryNavigationTimeout, resetForNavigationRecovery, passiveReadinessTimeout } from "./access-reliability";
import { gpcRuntimeFixture } from "../../certscore-contracts/src/test-fixtures/gpc-runtime";
test("access diagnostics distinguish site challenges from scanner transport/reset faults without promotion", () => {
  for (const [error, reason] of [["page.goto: Navigation is interrupted by another navigation to \"about:blank\"", "navigation_reset_interruption"],
    ["page.goto: Navigation to \"about:blank\" is interrupted by another navigation to \"chrome-error://chromewebdata/\"", "navigation_reset_interruption"],
    ["net::ERR_NETWORK_CHANGED", "network_changed"], ["net::ERR_HTTP2_PROTOCOL_ERROR", "http2_transport_failure"], ["net::ERR_BLOCKED_BY_CLIENT", "client_or_safety_block"],
    ["net::ERR_EMPTY_RESPONSE", "empty_transport_response"], ["Chromium renderer crash event", "renderer_crash"],
    ["Target navigation failed: net::ERR_EMPTY_RESPONSE\ncdpSession.send: Protocol error (Page.stopLoading): Not attached to an active page", "navigation_reset_inactive_page"]]) {
    const b=gpcRuntimeFixture({enabled:true}); b.runtimeCoverage!.coverageStatus="limited_none";b.modulesRun[0]!.errors=[error!];
    const d=describeAccessReliability(b);assert.equal(d.reason,reason);assert.equal(d.positiveAccess,false);assert.equal(d.contradictoryAccessLabels,true);assert.equal(d.scoreEffect,"none");
  }
  const b=gpcRuntimeFixture({enabled:true});b.scanLaneRuns[0]!.accessOutcome="bot_challenge";
  assert.equal(describeAccessReliability(b).reason,"bot_challenge");
  assert.equal(describeAccessReliability(null).reason,"source_unverified");
});
test("recovery consumes only the existing deadline and preserves capture reserve",()=>{
  assert.equal(recoveryNavigationTimeout(35000,7500),7500);
  assert.equal(recoveryNavigationTimeout(1500,7500),500);
  assert.equal(recoveryNavigationTimeout(999,7500),0);
  assert.equal(recoveryNavigationTimeout(-100,7500),0);
});
test("committed-page readiness cannot restart the navigation allowance or consume the capture reserve", () => {
  assert.equal(passiveReadinessTimeout(15000, 12000, 20000), 3000);
  assert.equal(passiveReadinessTimeout(15000, 100, 1500), 500);
  assert.equal(passiveReadinessTimeout(15000, 16000, 20000), 0);
  assert.equal(passiveReadinessTimeout(7500, 7000, 999), 0);
  assert.equal(passiveReadinessTimeout(7500, 7000, 10000), 500);
  assert.equal(passiveReadinessTimeout(15000, Number.NaN, 20000), 0);
});
test("failed reset cannot launch a subsequent navigation and cancellation stops dispatch",async()=>{
 let calls=0;
 let stopped = false;
 const page=Object.assign(new EventEmitter(),{context:()=>({newCDPSession:async()=>({send:async(method:string)=>{assert.equal(method,'Page.stopLoading');stopped=true;},detach:async()=>{}})}),goto:async(url:string,options?:{waitUntil?:string})=>{calls++;assert.equal(stopped,true);assert.equal(url,'about:blank');assert.equal(options?.waitUntil,'commit');throw Error('reset timeout');}}) as unknown as Page;
 await assert.rejects(resetForNavigationRecovery(page,3000),/reset timeout/);
 assert.equal(calls,1);
 const abort=new AbortController();abort.abort(Error('cancelled'));
 await assert.rejects(resetForNavigationRecovery(page,3000,abort.signal),/cancelled/);
 await assert.rejects(resetForNavigationRecovery(page,500),/budget exhausted/);
 assert.equal(calls,1);
});

test("a late stop-loading completion cannot dispatch reset after deadline or cancellation", async () => {
 for (const cancelled of [false, true]) {
  let finishStop!: () => void;
  let calls = 0, detached = 0;
  const controller = new AbortController();
  const page = Object.assign(new EventEmitter(), { context: () => ({ newCDPSession: async () => ({
   send: async () => new Promise<void>(resolve => { finishStop = resolve; }),
   detach: async () => { detached++; },
  }) }), goto: async () => { calls++; } }) as unknown as Page;
  const result = resetForNavigationRecovery(page, cancelled ? 3000 : 1050, controller.signal);
  await Promise.resolve(); await Promise.resolve();
  if (cancelled) controller.abort(Error('cancelled'));
  await assert.rejects(result, cancelled ? /cancelled/ : /deadline/);
  finishStop();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 0);
  assert.equal(detached, 1);
 }
});

test("only the main Chromium error-document commit permits an inactive-page reset to continue", async () => {
 for (const cancelled of [false, true]) {
  let stops = 0, resets = 0;
  const controller = new AbortController();
  let mainUrl = 'about:blank';
  const main = { url: () => mainUrl };
  const page = Object.assign(new EventEmitter(), {
   mainFrame: () => main,
   context: () => ({ newCDPSession: async () => ({
    send: async () => { if (++stops === 1) throw Error('Protocol error (Page.stopLoading): Not attached to an active page'); },
    detach: async () => {},
   }) }),
   goto: async (_url: string, options: { timeout: number }) => { resets++; assert.ok(options.timeout > 0 && options.timeout <= 1000); return null; },
  }) as unknown as Page;
  const result = resetForNavigationRecovery(page, 3000, controller.signal);
  await Promise.resolve(); await Promise.resolve();
  page.emit('framenavigated', { url: () => 'chrome-error://chromewebdata/' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(stops, 1, 'a subframe does not release the pending reset');
  if (cancelled) controller.abort(Error('cancelled'));
  mainUrl = 'chrome-error://chromewebdata/';
  page.emit('framenavigated', main);
  if (cancelled) await assert.rejects(result, /cancelled/);
  else await result;
  assert.equal(stops, 1, 'a terminal error commit does not require another stop');
  assert.equal(resets, cancelled ? 0 : 1);
  assert.equal(page.listenerCount('framenavigated'), 0);
 }
});

test("an error document committed before reset does not require another frame event", async () => {
 let stops = 0, resets = 0;
 const page = Object.assign(new EventEmitter(), {
  mainFrame: () => ({ url: () => 'chrome-error://chromewebdata/' }),
  context: () => ({ newCDPSession: async () => ({
   send: async () => { if (++stops === 1) throw Error('Protocol error (Page.stopLoading): Not attached to an active page'); },
   detach: async () => {},
  }) }),
  goto: async () => { resets++; return null; },
 }) as unknown as Page;
 await resetForNavigationRecovery(page, 3000);
 assert.equal(stops, 1);
 assert.equal(resets, 1);
 assert.equal(page.listenerCount('framenavigated'), 0);
});


test("a committed inactive error renderer resets without another attachment or stop", async () => {
 let attachments = 0, resets = 0, stops = 0, detached = 0;
 const page = Object.assign(new EventEmitter(), {
  mainFrame: () => ({ url: () => 'chrome-error://chromewebdata/' }),
  context: () => ({ newCDPSession: async () => {
   attachments++;
   return {
    send: async () => { stops++; throw Error('Protocol error (Page.stopLoading): Not attached to an active page'); },
    detach: async () => { detached++; },
   };
  } }),
  goto: async (url: string, options: { timeout: number }) => {
   assert.equal(url, 'about:blank');
   assert.ok(options.timeout > 0 && options.timeout <= 1000);
   resets++; return null;
  },
 }) as unknown as Page;
 await resetForNavigationRecovery(page, 3000);
 assert.equal(attachments, 1);
 assert.equal(stops, 1);
 assert.equal(detached, 1);
 assert.equal(resets, 1);
});

test("an inactive page without a committed main error document cannot dispatch a reset", async () => {
 let stops = 0, resets = 0, detached = 0;
 const main = { url: () => 'https://failed.test/' };
 const page = Object.assign(new EventEmitter(), {
  mainFrame: () => main,
  context: () => ({ newCDPSession: async () => ({
   send: async () => { stops++; throw Error('Protocol error (Page.stopLoading): Not attached to an active page'); },
   detach: async () => { detached++; },
  }) }),
  goto: async () => { resets++; return null; },
 }) as unknown as Page;
 const result = resetForNavigationRecovery(page, 1050);
 await Promise.resolve(); await Promise.resolve();
 page.emit('framenavigated', { url: () => 'chrome-error://chromewebdata/' });
 await assert.rejects(result, /deadline/);
 assert.equal(stops, 1);
 assert.equal(resets, 0);
 assert.equal(detached, 1);
 assert.equal(page.listenerCount('framenavigated'), 0);
});

test("error-page drift and unrelated stop errors cannot bypass the recovery gate", async () => {
 for (const unrelated of [false, true]) {
  let resets = 0;
  const main = { url: () => 'https://failed.test/' };
  const page = Object.assign(new EventEmitter(), {
   mainFrame: () => main,
   context: () => ({ newCDPSession: async () => ({
    send: async () => { throw Error(unrelated ? 'Protocol error: session closed' : 'Protocol error (Page.stopLoading): Not attached to an active page'); },
    detach: async () => {},
   }) }),
   goto: async () => { resets++; return null; },
  }) as unknown as Page;
  const result = resetForNavigationRecovery(page, 3000);
  await Promise.resolve(); await Promise.resolve();
  if (!unrelated) {
   main.url = () => 'chrome-error://chromewebdata/'; page.emit('framenavigated', main);
   main.url = () => 'https://changed.test/';
  }
  await assert.rejects(result, unrelated ? /session closed/ : /changed before reset/);
  assert.equal(resets, 0);
 }
});

test("a late initial CDP attachment cannot stop or reset after cancellation", async () => {
 const controller = new AbortController();
 let attach!: (session: unknown) => void;
 let stops = 0, resets = 0, detached = 0;
 const page = Object.assign(new EventEmitter(), {
  mainFrame: () => ({ url: () => 'chrome-error://chromewebdata/' }),
  context: () => ({ newCDPSession: async () => new Promise(resolve => { attach = resolve; }) }),
  goto: async () => { resets++; return null; },
 }) as unknown as Page;
 const result = resetForNavigationRecovery(page, 3000, controller.signal);
 controller.abort(Error('cancelled'));
 await assert.rejects(result, /cancelled/);
 attach({ send: async () => { stops++; }, detach: async () => { detached++; } });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(stops, 0); assert.equal(resets, 0); assert.equal(detached, 1);
 assert.equal(page.listenerCount('framenavigated'), 0);
});
