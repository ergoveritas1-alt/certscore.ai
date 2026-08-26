import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isScanReportPath,
  resolveScanViewHref
} from "./scan-view-navigation";

test("recognizes a scan report path", () => {
  assert.equal(isScanReportPath("/app/scans/0112a54a"), true);
  assert.equal(isScanReportPath("/app/scans/0112a54a/"), true);
  assert.equal(isScanReportPath("/app/scanso/0112a54a"), true);
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

test("scan navigation does not retain a report path across accounts", async () => {
  const appShell = await readFile("apps/web/components/dashboard/app-shell.tsx", "utf8");

  assert.doesNotMatch(appShell, /localStorage/);
  assert.doesNotMatch(appShell, /LAST_SCAN_REPORT_PATH_STORAGE_KEY/);
  assert.match(appShell, /resolveScanViewHref\(scanReportPathActive \? pathname : null\)/);
});
