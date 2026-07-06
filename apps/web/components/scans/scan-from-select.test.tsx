import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

test("ScanFromSelect defaults Lambda and fresh re-scan options on", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeFreshRescanOption: true,
      includeLocalV2ScanProfileOption: true,
      includeScanFromOptions: false,
      variant: "icon"
    })
  );

  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
  assert.match(html, /<input[^>]*name="forceNewScan"[^>]*value="true"/);
});

test("ScanFromSelect defaults to EU-IR and keeps Local-extension last", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeLocalExtension: true,
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_ie"/);
  assert.equal(SCAN_FROM_OPTIONS.map((option) => option.value).join(","), "eu_de,eu_ie,california,local_extension");
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

test("ScanFromSelect renders California with a flag marker instead of raw text", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      value: "california",
      variant: "field"
    })
  );

  assert.match(html, /data-scan-from-flag="california"/);
  assert.doesNotMatch(html, />california</);
});
