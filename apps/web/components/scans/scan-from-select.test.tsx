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
  assert.doesNotMatch(html, /name="gpcObservation"/);
});

test("ScanFromSelect omits redundant always-on GPC controls and status", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      allowRestrictedScanOptions: true,
      includeLocalV2ScanProfileOption: true,
      includeScanFromOptions: false,
      variant: "icon"
    })
  );
  const source = readFileSync(join(process.cwd(), "apps/web/components/scans/scan-from-select.tsx"), "utf8");

  assert.doesNotMatch(html, /name="gpcObservation"/);
  assert.doesNotMatch(html, /GPC comparison/);
  assert.doesNotMatch(source, /Included automatically · isolated Lambda lane/);
  assert.doesNotMatch(source, /onGpcObservationChange/);
});

test("ScanFromSelect renders scan-from choices before option toggles", () => {
  const source = readFileSync(join(process.cwd(), "apps/web/components/scans/scan-from-select.tsx"), "utf8");

  assert.equal(source.indexOf(">Scan from<") < source.indexOf(">Options<"), true);
  assert.equal(source.indexOf("menuOptions.map") < source.indexOf(">Fresh re-scan<"), true);
});

test("ScanFromSelect defaults to EU-IR and keeps the Chrome browser option last", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      allowRestrictedScanOptions: true,
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

test("ScanFromSelect keeps the scan-from field button free of a trailing caret", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeScanFromOptions: true,
      variant: "field"
    })
  );

  assert.match(html, /EU-IR/);
  assert.doesNotMatch(html, /m5\.5 7\.5 4\.5 4\.5 4\.5-4\.5/);
});

test("California scan marker renders as a flag graphic instead of literal sentinel text", () => {
  const html = renderToStaticMarkup(createElement(ScanFromMarker, { flag: "california", selected: false }));

  assert.match(html, /<svg/);
  assert.match(html, /h-4 w-5/);
  assert.doesNotMatch(html, />california</);
});

test("ScanFromSelect exposes every public region while hiding internal controls from non-admin users", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      includeLocalV2ScanProfileOption: true,
      includeLocalExtension: true,
      localV2RunViaLambdaValue: false,
      value: "local_extension",
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="eu_ie"/);
  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
  assert.match(html, /EU-IR/);
  assert.doesNotMatch(html, /Chrome browser/);
  assert.doesNotMatch(html, /Run via Lambda/);
});

test("ScanFromSelect exposes restricted scan controls to admin users", () => {
  const html = renderToStaticMarkup(
    createElement(ScanFromSelect, {
      allowRestrictedScanOptions: true,
      includeLocalExtension: true,
      includeLocalV2ScanProfileOption: true,
      localV2RunViaLambdaValue: false,
      value: "local_extension",
      variant: "field"
    })
  );

  assert.match(html, /<input[^>]*name="scanFrom"[^>]*value="local_extension"/);
  assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="false"/);
  assert.match(html, /Chrome browser/);
});

test("ScanFromSelect hides the Lambda-off control in production while submitting Lambda on", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const priorNodeEnv = mutableEnv.NODE_ENV;
  mutableEnv.NODE_ENV = "production";
  try {
    const html = renderToStaticMarkup(
      createElement(ScanFromSelect, {
        allowRestrictedScanOptions: true,
        includeLocalV2ScanProfileOption: true,
        localV2RunViaLambdaValue: true,
        variant: "field"
      })
    );

    assert.match(html, /<input[^>]*name="localV2RunViaLambda"[^>]*value="true"/);
    assert.doesNotMatch(html, /Run via Lambda/);
  } finally {
    if (priorNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV;
    } else {
      mutableEnv.NODE_ENV = priorNodeEnv;
    }
  }
});
