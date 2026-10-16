import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { cmpBasicEvidenceSchema, projectSdkCmpServices } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { captureCmpBasicEvidence } from "./cmp-basic-capture.js";
import { readPassiveDidomiServiceInventory } from "./didomi-service-inventory.js";

const definition = KNOWN_CMP_REGISTRY.find(row => row.canonicalName === "Didomi")!;
const markup = `<div id="didomi-host"><section class="didomi-notice-banner"><p>We use cookies</p><button>Accept all</button><button>Reject all</button><button>Configure</button></section></div>`;
async function setup(page: import("playwright").Page, vendors: unknown[]) {
  await page.setContent(markup);
  await page.evaluate(vendors => {
    const w = window as any;
    w.clicks = 0; document.addEventListener("click", () => w.clicks++);
    w.getterCalls = 0; w.otherCalls = 0; w.vendors = vendors;
    Object.defineProperty(w, "Didomi", {configurable: true, writable: true, value: {getRequiredVendors() {w.getterCalls++; return w.vendors;}, getCurrentUserStatus() {w.otherCalls++; throw Error("No consent-state read");}, preferences: {show() {w.otherCalls++; throw Error("No opening");}}}});
    w.didomiOnReady = {stub: true, push(callback: any) {callback(w.Didomi);}};
  }, vendors);
}

test("passive Didomi names are exact configured vendors with no requests, clicks or consent-state access", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage(); let requests = 0; page.on("request", () => requests++);
    await setup(page, [{id: "c:analytics", name: "Example Analytics", cookieMaxAgeSeconds: 999, purposeIds: ["measurement"]},
      {id: 42, name: "Example Video"}, {id: "c:same-name", name: "Example Analytics"}, {id: "c:domain", name: "example.test"},
      {id: "c:markup", name: '<img src="https://example.test/unwanted-request">Invented Analytics'}]);
    const input = {page, scanId: "fixture", targetUrl: page.url(), scanStartedAtMs: Date.now(), readBinding: () => ({url: page.url(), token: "loader"}), isCurrent: () => true};
    const packet = await captureCmpBasicEvidence(input);
    assert.equal(packet?.contractVersion, "certscore.cmp-basic-evidence.v4");
    assert.deepEqual(packet?.serviceNames, ["Example Analytics", "Example Video"]);
    assert.deepEqual(packet?.sdkServiceInventory?.records.map(row => row.id), ["c:analytics", "42", "c:same-name"]);
    assert.equal(packet?.sdkServiceInventory?.unresolvedRecordCount, 2);
    assert.deepEqual(packet?.declarations, []); assert.deepEqual(packet?.controls, []);
    assert.equal(packet?.inventoryManifest, undefined);
    assert.ok(!JSON.stringify(packet).includes("cookieMaxAgeSeconds"));
    assert.deepEqual(await page.evaluate(() => [(window as any).clicks, (window as any).getterCalls, (window as any).otherCalls]), [0, 1, 0]);
    assert.equal(requests, 0);
    for (const mutate of [
      (p: any) => p.provider = "OneTrust", (p: any) => p.contractVersion = "certscore.cmp-basic-evidence.v1",
      (p: any) => p.sdkServiceInventory.documentToken = "other", (p: any) => p.sdkServiceInventory.getter = "getVendors",
      (p: any) => p.sdkServiceInventory.rootSelector = "body", (p: any) => p.sdkServiceInventory.readiness = "assumed",
      (p: any) => p.sdkServiceInventory.records[0].name = "Changed", (p: any) => delete p.sdkServiceInventory,
      (p: any) => p.serviceNames.push("Invented"), (p: any) => delete p.captureProgress.declarationsAtMs,
      (p: any) => p.sdkServiceInventory.inspectedRecordCount++, (p: any) => p.sdkServiceInventory.records[1].id = p.sdkServiceInventory.records[0].id,
      (p: any) => p.declarations.push({name: "invented", purpose: "Analytics", duration: "1 year", source: "cmp_api_inventory"}),
    ]) {const invalid = structuredClone(packet); mutate(invalid); assert.equal(cmpBasicEvidenceSchema.safeParse(invalid).success, false, mutate.toString());}
    let reads = 0;
    assert.equal((await captureCmpBasicEvidence({...input, readBinding: () => ({url: page.url(), token: ++reads >= 3 ? "changed" : "loader"})}))?.sdkServiceInventory, undefined);
  } finally {await browser.close();}
});

test("Didomi services require immediate documented readiness and stable, unique root, notice and SDK", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    for (const mode of ["not-ready", "wrong-api", "missing-root", "duplicate-root", "missing-notice", "duplicate-notice", "sdk-replaced", "notice-replaced", "throws", "api-getter"]) {
      await setup(page, [{id: "c:example", name: "Example Analytics"}]);
      await page.evaluate(mode => {
        const w = window as any, root = document.querySelector("#didomi-host")!, notice = root.firstElementChild!;
        if (mode === "not-ready") w.didomiOnReady = [];
        if (mode === "wrong-api") w.didomiOnReady.push = (callback: any) => callback({});
        if (mode === "missing-root") root.remove(); if (mode === "duplicate-root") document.body.append(root.cloneNode(true));
        if (mode === "missing-notice") notice.remove(); if (mode === "duplicate-notice") root.append(notice.cloneNode(true));
        if (mode === "sdk-replaced") w.Didomi.getRequiredVendors = () => {w.Didomi = {}; return w.vendors;};
        if (mode === "notice-replaced") w.Didomi.getRequiredVendors = () => {notice.replaceWith(notice.cloneNode(true)); return w.vendors;};
        if (mode === "throws") w.Didomi.getRequiredVendors = () => {throw Error("not available");};
        if (mode === "api-getter") Object.defineProperty(w, "Didomi", {get() {throw Error("unsafe accessor");}});
      }, mode);
      assert.equal(await readPassiveDidomiServiceInventory(page, definition, "loader"), undefined, mode);
      if (mode === "not-ready") {
        await page.evaluate(() => {const w = window as any; w.didomiOnReady[0](w.Didomi);});
        assert.equal(await page.evaluate(() => (window as any).getterCalls), 0, "Late readiness must never perform a read");
      }
    }
    await setup(page, [{id: "c:example", name: "Example Analytics"}]);
    await page.evaluate(() => {const w = window as any; w.didomiOnReady = []; w.didomiOnReady.push = function (callback: any) {callback(w.Didomi); return 0;};});
    assert.equal((await readPassiveDidomiServiceInventory(page, definition, "loader"))?.records.length, 1, "Immediate array callback compatibility");
  } finally {await browser.close();}
});

test("Didomi vendor extraction keeps malformed identities, accessors, duplicate IDs and bounded lists partial", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page, [{id: "duplicate", name: "Name One"}, {id: "duplicate", name: "Name Two"}, {id: "valid", name: "Example Analytics"}, {id: "email", name: "owner@example.test"}]);
    await page.evaluate(() => {const w = window as any; w.vendors.push({id: "accessor", get name() {throw Error("unsafe accessor");}});});
    const partial = await readPassiveDidomiServiceInventory(page, definition, "loader");
    assert.deepEqual(partial?.records, [{id: "valid", name: "Example Analytics"}]); assert.equal(partial?.unresolvedRecordCount, 4);
    await setup(page, Array.from({length: 120}, (_, i) => ({id: `vendor_${i}`, name: `Vendor ${i}`})));
    const bounded = await readPassiveDidomiServiceInventory(page, definition, "loader");
    assert.equal(bounded?.records.length, 100); assert.equal(bounded?.sourceRecordCount, 120); assert.equal(bounded?.truncated, true);
    assert.equal(projectSdkCmpServices(bounded!).length, 100);
  } finally {await browser.close();}
});
