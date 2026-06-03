import assert from "node:assert/strict";
import test from "node:test";

import { getScanSubmitDestination } from "./domain-scan-form";

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
