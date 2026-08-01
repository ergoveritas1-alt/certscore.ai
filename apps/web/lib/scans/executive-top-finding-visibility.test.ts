import assert from "node:assert/strict";
import test from "node:test";
import { filterVisibleExecutiveTopFindings } from "./executive-top-finding-visibility";

test("shared executive visibility removes footprint context without hiding substantive findings", () => {
  const visible = filterVisibleExecutiveTopFindings([
    { id: "multi_vendor_tracking_detected" },
    { id: "large_third_party_footprint" },
    { id: "preconsent_tracking_confirmed" }
  ]);

  assert.deepEqual(visible, [{ id: "preconsent_tracking_confirmed" }]);
});
