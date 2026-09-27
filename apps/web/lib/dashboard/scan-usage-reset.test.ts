import assert from "node:assert/strict";
import test from "node:test";
import { formatScanUsageResetDate } from "./scan-usage-reset";

test("scan allowance resets after the inclusive monthly period end", () => {
  assert.equal(formatScanUsageResetDate("2026-09-30"), "October 1, 2026");
  assert.equal(formatScanUsageResetDate("2026-12-31"), "January 1, 2027");
  assert.equal(formatScanUsageResetDate("2028-02-29", "short"), "Mar 1, 2028");
});
