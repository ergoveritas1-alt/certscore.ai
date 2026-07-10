import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScanFromMarker } from "./scan-from-icons";
import { SCAN_FROM_OPTIONS, ScanFromSelect } from "./scan-from-select";

test("ScanFromSelect always submits core local v2 profile and Lambda option fields", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeLocalV2ScanProfileOption: true,
      includeScanFromOptions: false,
      localV2RunViaLambdaValue: true,
      localV2ScanProfileValue: "tiny",
      variant: "icon"
    })
  );

  assert.match(html, /<input[^>]*name="localV2ScanProfile"[^>]*value="standard"/);
  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
  assert.doesNotMatch(html, />Tiny</);
});

test("ScanFromSelect defaults Lambda on and fresh re-scan off", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeFreshRescanOption: true,
      includeLocalV2ScanProfileOption: true,
      includeScanFromOptions: false,
      variant: "icon"
    })
  );

  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
  assert.doesNotMatch(html, /<input[^>]*name="forceNewScan"[^>]*value="true"/);
});

test("ScanFromSelect renders scan-from choices before option toggles", () => {
  const source = readFileSync(join(process.cwd(), "apps/web/components/scans/scan-from-select.tsx"), "utf8");

  assert.equal(source.indexOf(">Scan from<") < source.indexOf(">Options<"), true);
  assert.equal(source.indexOf("menuOptions.map") < source.indexOf(">Fresh re-scan<"), true);
});

test("ScanFromSelect defaults to EU-IR and keeps Local-extension last", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeLocalExtension: true,
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_ie"/);
  assert.equal(SCAN_FROM_OPTIONS.map((option) => option.value).join(","), "eu_ie,eu_de,california,local_extension");
});

test("ScanFromSelect maps legacy default values to the selectable regional default", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      value: "default" as never,
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_ie"/);
  assert.match(html, /EU-IR/);
  assert.doesNotMatch(html, /Default production scan/);
});

test("California scan marker renders as a flag graphic instead of literal sentinel text", () => {
  const html = renderToStaticMarkup(createElement(ScanFromMarker, { flag: "california", selected: false }));

  assert.match(html, /<svg/);
  assert.match(html, /h-4 w-5/);
  assert.doesNotMatch(html, />california</);
});

test("ScanFromSelect hides restricted scan controls from non-admin users", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeLocalV2ScanProfileOption: true,
      localV2RunViaLambdaValue: false,
      value: "eu_de",
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_ie"/);
  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
  assert.doesNotMatch(html, /EU-DE/);
  assert.doesNotMatch(html, /Run via Lambda/);
});

test("ScanFromSelect exposes restricted scan controls to admin users", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      allowRestrictedScanOptions: true,
      includeLocalV2ScanProfileOption: true,
      localV2RunViaLambdaValue: false,
      value: "eu_de",
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_de"/);
  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="false"/);
  assert.match(html, /EU-DE/);
});
