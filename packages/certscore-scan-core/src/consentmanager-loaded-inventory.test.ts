import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";
import { cmpBasicEvidenceSchema } from "@certscore/contracts";
import { captureCmpBasicEvidence } from "./cmp-basic-capture.js";
import { readPassiveConsentmanagerLoadedInventory } from "./consentmanager-loaded-inventory.js";

const definition = KNOWN_CMP_REGISTRY.find(row => row.canonicalName === "Consentmanager")!;
// Structural fixture from the public display_cookielist SDK template; values
// are synthetic. No private SDK object, cookie sample or API call is required.
const headers = `<th class="cmptxt_cookiename">Cookiename</th><th class="cmptxt_cookiesample">Sample value</th><th class="cmptxt_expire">Expire</th><th class="cmptxt_cookietype">Type</th><th class="cmptxt_domain">Domain</th><th class="cmptxt_vendor">Vendor</th><th> </th>`;
const record = (name: string, type = "HTTP Cookie", provider = "Example Analytics") => `<tr data-cmptype="${type}"><td>${name}</td><td>DO_NOT_RETAIN_VISITOR_VALUE</td><td>1 year</td><td>${type}</td><td>example.test</td><td>${provider}</td><td><a href="https://example.test/privacy">Privacy policy</a></td></tr><tr data-cmptype="${type}"><td colspan="7" class="cmpcookieinfotable_descr">Audience measurement</td></tr>`;
const content = (rows = record("_ga")) => `<div id="cmpbox"><button onclick="window.actions++">Options</button><section class="cmpcookiesdescrbox" hidden><table class="cmpcookietbl"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section></div><script>window.actions=0;window.sdkReads=0;Object.defineProperty(window,'cmpmngr',{get(){window.sdkReads++;throw Error('Private SDK access forbidden')}});</script>`;

test("passive Consentmanager capture retains explicit declarations without clicks, fetches, private state or sample values", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage(); let requests = 0;
    page.on("request", () => requests++);
    await page.setContent(content(record("_ga") + record("settings", "HTML Local Storage") + record("unspecified", "Analytics", "example.test")));
    const input = {page, scanId: "fixture", targetUrl: page.url(), scanStartedAtMs: Date.now(), readBinding: () => ({url: page.url(), token: "loader"}), isCurrent: () => true};
    const packet = await captureCmpBasicEvidence(input);
    assert.equal(packet?.contractVersion, "certscore.cmp-basic-evidence.v3");
    assert.deepEqual(packet?.declarations, [{name: "_ga", purpose: "Audience measurement", duration: "1 year", source: "cmp_loaded_inventory"}]);
    assert.deepEqual(packet?.loadedInventory?.records.map(row => row.storageType), ["cookie", "local_storage", "unknown"]);
    assert.equal(packet?.loadedInventoryBinding?.documentToken, "loader");
    assert.ok(packet?.limitations.includes("declaration_inventory_not_complete"));
    assert.ok(!JSON.stringify(packet).includes("DO_NOT_RETAIN_VISITOR_VALUE"));
    assert.equal(requests, 0);
    assert.deepEqual(await page.evaluate(() => [(window as any).actions, (window as any).sdkReads]), [0, 0]);
    for (const mutate of [
      (p: any) => p.provider = "Cookiebot", (p: any) => p.contractVersion = "certscore.cmp-basic-evidence.v2",
      (p: any) => p.loadedInventory.version = "cookiebot_loaded_declarations.v1", (p: any) => p.loadedInventoryBinding.documentToken = "other",
      (p: any) => delete p.captureProgress.declarationsAtMs, (p: any) => p.declarations[0].name = "invented",
      (p: any) => p.loadedInventoryBinding.panelSelector = "table",
      (p: any) => p.loadedInventory.inventoryManifest = {version: "cmp_inventory_manifest.v1", source: "cookiebot_loaded_declarations.v1", names: ["_ga"], sourceRecordCount: 1, resolvedRecordCount: 1, unresolvedRecordCount: 0, unresolvedSources: 0, truncated: false},
    ]) {const invalid = structuredClone(packet); mutate(invalid); assert.equal(cmpBasicEvidenceSchema.safeParse(invalid).success, false);}
    let reads = 0;
    assert.equal((await captureCmpBasicEvidence({...input, readBinding: () => ({url: page.url(), token: ++reads >= 3 ? "changed" : "loader"})}))?.loadedInventory, undefined);
  } finally {await browser.close();}
});

test("Consentmanager loaded declarations fail closed on missing, outside, duplicate and malformed tables", async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    for (const mode of ["missing", "outside", "duplicate-root", "duplicate-table", "duplicate-name-column", "mixed-column", "nested", "bad-span", "replaced"]) {
      await page.setContent(content());
      await page.evaluate(mode => {
        const root = document.querySelector("#cmpbox")!, panel = root.querySelector(".cmpcookiesdescrbox")!, table = panel.querySelector("table")!;
        if (mode === "missing") panel.remove();
        if (mode === "outside") document.body.append(panel);
        if (mode === "duplicate-root") document.body.append(root.cloneNode(true));
        if (mode === "duplicate-table") panel.append(table.cloneNode(true));
        if (mode === "duplicate-name-column") table.querySelector("th.cmptxt_expire")!.className = "cmptxt_cookiename";
        if (mode === "mixed-column") table.querySelector("th.cmptxt_expire")!.classList.add("cmptxt_vendor");
        if (mode === "nested") table.querySelector("td")!.innerHTML = "<table></table>";
        if (mode === "bad-span") table.querySelector("th")!.setAttribute("rowspan", "2");
        if (mode === "replaced") table.querySelector("td")!.textContent = "truncated...";
      }, mode);
      const loaded = await readPassiveConsentmanagerLoadedInventory(page, definition);
      if (mode === "replaced") assert.equal(loaded?.records.length, 0); else assert.equal(loaded, undefined, mode);
    }
    await page.setContent(content(record("_ga").replace('data-cmptype="HTTP Cookie"><td colspan', 'data-cmptype="other"><td colspan')));
    const mismatch = await readPassiveConsentmanagerLoadedInventory(page, definition);
    assert.equal(mismatch?.records[0]?.purpose, "");
    assert.ok(mismatch!.unresolvedRecords > 0);
    await page.setContent(content(record("_ga").replace('<td>1 year</td>', '<td colspan="2">1 year</td>')));
    assert.equal((await readPassiveConsentmanagerLoadedInventory(page, definition))?.records.length, 0);
    await page.setContent(content(Array.from({length: 300}, (_, i) => record(`cookie_${i}`)).join("")));
    const bounded = await readPassiveConsentmanagerLoadedInventory(page, definition);
    assert.equal(bounded?.records.length, 100); assert.equal(bounded?.truncated, true);
  } finally {await browser.close();}
});
