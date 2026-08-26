import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCompletedScanRows } from "./normalize-completed-scan-rows";

test("tracker inventory scan rows normalize database Date values to ISO strings", () => {
  const rows = normalizeCompletedScanRows([
    { completed_at: new Date("2026-08-25T03:06:07.000Z"), id: "scan-date" },
    { completed_at: "2026-08-24T22:05:04.000Z", id: "scan-string" }
  ]);

  assert.deepEqual(rows, [
    { completed_at: "2026-08-25T03:06:07.000Z", id: "scan-date" },
    { completed_at: "2026-08-24T22:05:04.000Z", id: "scan-string" }
  ]);
});
