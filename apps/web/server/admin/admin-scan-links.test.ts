import assert from "node:assert/strict";
import test from "node:test";
import { getAdminAuthenticatedScanHref } from "./admin-scan-links";

test("getAdminAuthenticatedScanHref always targets the authenticated scan view", () => {
  assert.equal(
    getAdminAuthenticatedScanHref("scan_123"),
    "/app/scans/scan_123"
  );
});

test("getAdminAuthenticatedScanHref supports linked request scan ids", () => {
  assert.equal(
    getAdminAuthenticatedScanHref(" 1b5ff223-b032-45af-8114-07256fb66f73 "),
    "/app/scans/1b5ff223-b032-45af-8114-07256fb66f73"
  );
});

test("getAdminAuthenticatedScanHref returns empty href when no scan is linked", () => {
  assert.equal(getAdminAuthenticatedScanHref(null), "");
  assert.equal(getAdminAuthenticatedScanHref(undefined), "");
  assert.equal(getAdminAuthenticatedScanHref("  "), "");
});
