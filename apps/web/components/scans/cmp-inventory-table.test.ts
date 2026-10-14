import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCmpTableCopyPayload, CmpInventoryIdentity, cmpCookieBrand } from "./cmp-inventory-table";

test("identity decoration uses bundled logos for services and recognized cookie patterns", () => {
  const service = renderToStaticMarkup(createElement(CmpInventoryIdentity, { name: "HubSpot", kind: "service" }));
  assert.match(service, /src="\/vendor-logos\/hubspot.png"/);
  assert.match(service, /alt=""/);
  for (const [name, logo] of [["hubspotutk", "hubspot"], ["_ga", "google"], ["_ga_*", "google"], ["_GRECAPTCHA", "google"], ["_hjSessionStorageTest", "hotjar"], ["_dc_gtm_*", "google"]] as const) {
    const html = renderToStaticMarkup(createElement(CmpInventoryIdentity, { name, kind: "cookie" }));
    assert.ok(html.includes(`/vendor-logos/${logo}.png`));
    assert.match(html, /cookie pattern/);
    assert.ok(html.includes(name));
    assert.doesNotMatch(html, /https?:/);
  }
  for (const [kind, name] of [["cookie", "google"], ["cookie", "CONSENT"], ["cookie", "test_cookie"], ["cookie", "_rdt_uuid"], ["service", "unknown.example"]] as const) {
    const html = renderToStaticMarkup(createElement(CmpInventoryIdentity, { name, kind }));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img|https?:/);
    assert.ok(html.includes(name));
  }
  const borlabs = renderToStaticMarkup(createElement(CmpInventoryIdentity, { name: "borlabs-cookie", kind: "cookie" }));
  assert.match(borlabs, /Borlabs cookie pattern/);
  assert.match(borlabs, />BO</);
  assert.equal(cmpCookieBrand("test_cookie"), null, "direct domain context must not be invented");
  assert.equal(cmpCookieBrand("CONSENT"), null, "a generic name does not identify a brand");
  assert.equal(cmpCookieBrand("_GRECAPTCHA_extra"), null, "the documented brand match is exact");
  assert.equal(cmpCookieBrand("_grecaptcha"), null, "cookie names are case-sensitive");
  assert.equal(cmpCookieBrand("x".repeat(161)), null);
});

test("copy includes the headers and every retained row beyond the visible eight", () => {
  const rows = Array.from({ length: 36 }, (_, index) => [`cookie_${index}`, "tracking", "2 years"]);
  const before = structuredClone(rows);
  const text = buildCmpTableCopyPayload(["Cookie name / pattern", "Purpose", "Storage duration"], rows);
  assert.equal(text.split("\n").length, 37);
  assert.equal(text.split("\n")[0], "Cookie name / pattern\tPurpose\tStorage duration");
  assert.equal(text.split("\n")[36], "cookie_35\ttracking\t2 years");
  assert.deepEqual(rows, before);
});

test("embedded whitespace cannot split cells into extra spreadsheet rows or columns", () => {
  assert.equal(buildCmpTableCopyPayload(["Service", "Purpose"], [[" Example\tservice ", "First line\r\nSecond line"]]),
    "Service\tPurpose\nExample service\tFirst line Second line");
});

test("request addresses, match labels and captured settings remain plain text", () => {
  assert.equal(buildCmpTableCopyPayload(["Service", "After Reject", "Request"], [["HubSpot", "+301 ms", "js-eu1.hsadspixel.net/pixels.js"]]),
    "Service\tAfter Reject\tRequest\nHubSpot\t+301 ms\tjs-eu1.hsadspixel.net/pixels.js");
  assert.equal(buildCmpTableCopyPayload(["Cookie name", "CMP match"], [["_ga_123", "Matched"], ["unknown", "No match"]]),
    "Cookie name\tCMP match\n_ga_123\tMatched\nunknown\tNo match");
});


test("formula-like site text stays literal while ordinary timing values remain intact", () => {
  const payload = buildCmpTableCopyPayload(["Service", "Purpose"], [["=1+2", "\t@SUM(1,2)"], ["+301 ms", "Normal text"], ["-service", "+SUM(1,2)"]]);
  assert.equal(payload, "Service\tPurpose\n'=1+2\t'@SUM(1,2)\n+301 ms\tNormal text\n'-service\t'+SUM(1,2)");
});
