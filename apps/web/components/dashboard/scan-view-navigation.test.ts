import assert from "node:assert/strict";
import test from "node:test";
import {
  isScanReportPath,
  resolveScanViewHref
} from "./scan-view-navigation";

test("recognizes a scan report path", () => {
  assert.equal(isScanReportPath("/app/scans/0112a54a"), true);
  assert.equal(isScanReportPath("/app/scans/0112a54a/"), true);
});

test("rejects non-report and nested scan paths", () => {
  assert.equal(isScanReportPath("/app/signals"), false);
  assert.equal(isScanReportPath("/app/scans"), false);
  assert.equal(isScanReportPath("/app/scans/0112a54a/json"), false);
});

test("links directly to the last valid report and otherwise uses the resolver route", () => {
  assert.equal(
    resolveScanViewHref("/app/scans/0112a54a"),
    "/app/scans/0112a54a"
  );
  assert.equal(resolveScanViewHref("/app/settings"), "/app/signals");
  assert.equal(resolveScanViewHref(null), "/app/signals");
});
