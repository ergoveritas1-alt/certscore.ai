import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { actionOriginDomStorageObservationSchema } from "@certscore/contracts";
import { installActionDomStorageCapture } from "./action-dom-storage-capture.js";

function fake() {
  const context = Object.assign(new EventEmitter(), { pages: () => [page] });
  const page = { context: () => context };
  let detached = 0;
  const session = Object.assign(new EventEmitter(), { send: async () => ({}), detach: async () => { detached++; } });
  return { context, page: page as any, session: session as any, detached: () => detached };
}
const added = (key: string, origin = "https://owned.example", value = "private value") => ({
  storageId: { securityOrigin: origin, storageKey: origin + "/", isLocalStorage: true }, key, newValue: value,
});

test("origin collector bounds actual events, hashes private fields and freezes all listeners", async () => {
  const f = fake(), capture = await installActionDomStorageCapture(f.page, "https://owned.example/path", async () => f.session);
  for (let i = 0; i < 70; i++) f.session.emit("DOMStorage.domStorageItemAdded", added(`private key ${i}`));
  f.session.emit("DOMStorage.domStorageItemAdded", added("foreign", "https://foreign.example"));
  f.session.emit("DOMStorage.domStorageItemAdded", { storageId: { isLocalStorage: true }, key: "bad" });
  f.context.emit("page", {});
  const result = capture.finish();
  assert.equal(result.setup, "enabled"); assert.equal(result.observedEvents, 72);
  assert.equal(result.rows.length, 64); assert.equal(result.overflowEvents, 7); assert.equal(result.invalidEvents, 1);
  assert.equal(result.foreignOriginEvents, 1); assert.equal(result.additionalPageObserved, true);
  assert.ok(actionOriginDomStorageObservationSchema.safeParse(result).success);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes("owned.example"));
  f.session.emit("DOMStorage.domStorageItemAdded", added("late"));
  assert.deepEqual(capture.finish(), result); assert.equal(result.observedEvents, 72);
  assert.equal(f.session.listenerCount("DOMStorage.domStorageItemAdded"), 0);
  assert.equal(f.context.listenerCount("page"), 0); assert.equal(f.detached(), 1);
  assert.equal(actionOriginDomStorageObservationSchema.safeParse({ ...result, observedEvents: 0 }).success, false);
});

test("setup failure retains a neutral unavailable diagnostic and tears down the partial session", async () => {
  const f = fake(); f.session.send = async () => { throw new Error("injected unavailable domain"); };
  const result = (await installActionDomStorageCapture(f.page, "https://owned.example/", async () => f.session)).finish();
  assert.equal(result.setup, "unavailable"); assert.ok(result.limitations.includes("setup_unavailable"));
  assert.equal(result.observedEvents, 0); assert.equal(f.detached(), 1);
  assert.ok(actionOriginDomStorageObservationSchema.safeParse(result).success);
});

test("foreign origin rows retain actual partition attribution without claiming document ownership", async () => {
  const f = fake(), capture = await installActionDomStorageCapture(f.page, "https://owned.example/", async () => f.session);
  f.session.emit("DOMStorage.domStorageItemAdded", added("foreign", "https://foreign.example"));
  f.session.emit("DOMStorage.domStorageItemsCleared", { storageId: { securityOrigin: "https://owned.example", isLocalStorage: false } });
  const result = capture.finish();
  assert.equal(result.rows[0]!.targetOriginMatch, false);
  assert.equal(result.rows[1]!.storageType, "session_storage");
  assert.equal(result.rows[1]!.keySha256, undefined);
  assert.ok(result.limitations.includes("no_document_or_frame_attribution"));
  assert.ok(actionOriginDomStorageObservationSchema.safeParse(result).success);
});

test("real CDP observes setter-bypass mutations and same-origin other-page writes without changing page APIs", async () => {
  const server = createServer((_, response) => response.end("<!doctype html>"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(), page = await context.newPage();
    const target = `http://127.0.0.1:${(server.address() as any).port}/`;
    const capture = await installActionDomStorageCapture(page, target);
    await page.goto(target);
    const normalBehavior = await page.evaluate(() => {
      const setter = Storage.prototype.setItem;
      localStorage.direct = "first";
      Object.defineProperty(localStorage, "defined", { value: "second", configurable: true, enumerable: true, writable: true });
      delete localStorage.direct;
      sessionStorage.directSession = "third";
      return { setterUnchanged: setter === Storage.prototype.setItem, stored: localStorage.getItem("defined") };
    });
    const other = await context.newPage(); await other.goto(target);
    await other.evaluate(() => { localStorage.otherPage = "fourth"; });
    // Existing protocol round trip only; no polling or observation tail wait.
    await page.evaluate(() => localStorage.length);
    const result = capture.finish();
    assert.equal(normalBehavior.setterUnchanged, true); assert.equal(normalBehavior.stored, "second");
    assert.ok(result.observedEvents >= 5); assert.equal(result.invalidEvents, 0);
    assert.equal(result.additionalPageObserved, true);
    assert.ok(result.rows.some(row => row.event === "removed"));
    assert.ok(result.rows.some(row => row.storageType === "session_storage"));
    assert.ok(actionOriginDomStorageObservationSchema.safeParse(result).success);
    await page.evaluate(() => { localStorage.afterFreeze = "late"; });
    assert.equal(capture.finish().observedEvents, result.observedEvents);
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("resolved authorized target rebinding corrects retained origin flags without promoting diagnostic receipts",async()=>{
 const f=fake(),capture=await installActionDomStorageCapture(f.page,"https://requested.example/",async()=>f.session);
 f.session.emit("DOMStorage.domStorageItemAdded",added("key","https://resolved.example"));
 f.session.emit("DOMStorage.domStorageItemAdded",added("other","https://third.example"));
 assert.equal(capture.bindAuthorizedTarget("https://resolved.example/"),true);
 f.session.emit("DOMStorage.domStorageItemAdded",added("later","https://resolved.example"));
 const result=capture.finish();assert.equal(result.foreignOriginEvents,1);assert.deepEqual(result.rows.map(r=>r.targetOriginMatch),[true,false,true]);
 assert.equal(result.diagnosticOnly,true);assert.ok(result.limitations.includes("source_delivery_not_verified"));
 assert.ok(actionOriginDomStorageObservationSchema.safeParse(result).success);
 assert.equal(capture.bindAuthorizedTarget("https://third.example/"),false);
 const g=fake(),overflow=await installActionDomStorageCapture(g.page,"https://requested.example/",async()=>g.session);
 for(let i=0;i<65;i++)g.session.emit("DOMStorage.domStorageItemAdded",added(String(i),"https://resolved.example"));
 assert.equal(overflow.bindAuthorizedTarget("https://resolved.example/"),false,"omitted origins cannot be reconstructed");
 assert.ok(actionOriginDomStorageObservationSchema.safeParse(overflow.finish()).success);
});
