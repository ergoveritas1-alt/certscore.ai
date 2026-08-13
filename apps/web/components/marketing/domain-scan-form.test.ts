import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecentScanAvailabilityUrl,
  getScanSubmitDestination,
  parseScanSubmitPayload,
  restrictLocalExtensionScanFrom,
  shouldExpectRecentScanReuse,
  shouldUseFullPageScanSubmissionTransition
} from "./domain-scan-form";

test("getScanSubmitDestination prefers public scanUrl for anonymous full scans", () => {
  assert.equal(
    getScanSubmitDestination("full", {
      scanId: "scan_123",
      scanUrl: "/scan/scan_123"
    }),
    "/scan/scan_123"
  );
});

test("getScanSubmitDestination falls back to authenticated scan route when only scanId is returned", () => {
  assert.equal(
    getScanSubmitDestination("full", {
      scanId: "scan_456"
    }),
    "/app/scans/scan_456"
  );
});

test("getScanSubmitDestination uses previewUrl for preview scans", () => {
  assert.equal(
    getScanSubmitDestination("preview", {
      previewUrl: "/scan/preview_123",
      scanId: "preview_123"
    }),
    "/scan/preview_123"
  );
});

test("buildRecentScanAvailabilityUrl targets the full scan reuse availability check", () => {
  assert.equal(
    buildRecentScanAvailabilityUrl({ domain: "https://example.com/path?a=1", scanFrom: "eu_ie" }),
    "/api/full-scan/reuse-availability?domain=https%3A%2F%2Fexample.com%2Fpath%3Fa%3D1&scanFrom=eu_ie"
  );
});

test("known recent reuse opens the report without showing fresh-scan progress", () => {
  assert.equal(shouldExpectRecentScanReuse({ freshRescan: false, hasRecentReusableScan: true, mode: "full" }), true);
  assert.equal(shouldExpectRecentScanReuse({ freshRescan: true, hasRecentReusableScan: true, mode: "full" }), false);
  assert.equal(shouldExpectRecentScanReuse({ freshRescan: false, hasRecentReusableScan: false, mode: "full" }), false);
  assert.equal(shouldExpectRecentScanReuse({ freshRescan: false, hasRecentReusableScan: true, mode: "preview" }), false);
});

test("compact report rescans use the hosted full-page progress transition", () => {
  assert.equal(shouldUseFullPageScanSubmissionTransition({
    compact: true,
    expectsRecentScanReuse: false,
    hasTransitionHost: true,
    mode: "full",
    scanFrom: "eu_ie"
  }), true);
  assert.equal(shouldUseFullPageScanSubmissionTransition({
    compact: true,
    expectsRecentScanReuse: true,
    hasTransitionHost: true,
    mode: "full",
    scanFrom: "eu_ie"
  }), false);
  assert.equal(shouldUseFullPageScanSubmissionTransition({
    compact: true,
    expectsRecentScanReuse: false,
    hasTransitionHost: false,
    mode: "full",
    scanFrom: "eu_ie"
  }), false);
});

test("parseScanSubmitPayload does not surface raw HTML error documents", () => {
  assert.deepEqual(
    parseScanSubmitPayload('<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US">'),
    {
      code: "non_json_response",
      error: "The scan service returned an unexpected response. Please try again."
    }
  );
});

test("Chrome browser scan source is restricted to admins", () => {
  assert.equal(
    restrictLocalExtensionScanFrom({
      allowLocalExtensionScan: true,
      allowRestrictedScanOptions: false,
      scanFrom: "local_extension"
    }),
    "eu_ie"
  );
  assert.equal(
    restrictLocalExtensionScanFrom({
      allowLocalExtensionScan: true,
      allowRestrictedScanOptions: true,
      scanFrom: "local_extension"
    }),
    "local_extension"
  );
});
