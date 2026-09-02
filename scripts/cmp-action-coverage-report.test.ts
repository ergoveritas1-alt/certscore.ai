import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCmpActionCoverage } from "./cmp-action-coverage-report.js";

test("coverage analysis alerts on exposed unknown and unsupported CMP actions", () => {
  const result = analyzeCmpActionCoverage([
    { cmp_vendor_name: "OneTrust CMP", domain_count: 20, scan_count: 100 },
    { cmp_vendor_name: "Borlabs Cookie", domain_count: 12, scan_count: 30 },
    { cmp_vendor_name: "Future CMP", domain_count: 5, scan_count: 8 },
    { cmp_vendor_name: "Tiny CMP", domain_count: 1, scan_count: 1 },
  ]);

  assert.equal(result.alerts.some((alert) => alert.rawName === "OneTrust CMP"), false);
  assert.deepEqual(
    result.alerts.filter((alert) => alert.rawName === "Borlabs Cookie").map((alert) => alert.type).sort(),
    ["accept_recipe_missing", "reject_recipe_missing"],
  );
  assert.deepEqual(
    result.alerts.filter((alert) => alert.rawName === "Future CMP").map((alert) => alert.type),
    ["unregistered_cmp"],
  );
  assert.equal(result.alerts.some((alert) => alert.rawName === "Tiny CMP"), false);
});
