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
