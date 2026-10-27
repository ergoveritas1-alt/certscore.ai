import assert from "node:assert/strict";
import test from "node:test";
import { homepageAudienceText, parseHomepageLocation, resolveSampleScanFrom } from "./homepage-location";

test("loc overrides country in both directions and explicit scan selection wins over loc", () => {
  assert.equal(resolveSampleScanFrom({ countryDefault: "california", locationOverride: "EU" }), "eu_ie");
  assert.equal(resolveSampleScanFrom({ countryDefault: "eu_ie", locationOverride: "US" }), "california");
  for (const manualScanFrom of ["california", "eu_ie", "eu_de"] as const) {
    for (const locationOverride of ["US", "EU"] as const) {
      assert.equal(resolveSampleScanFrom({ countryDefault: "eu_ie", locationOverride, manualScanFrom }), manualScanFrom);
    }
  }
  assert.equal(parseHomepageLocation(" eu "), "EU");
  for (const value of [null, undefined, "CA", "US,EU", [], {}, 1]) assert.equal(parseHomepageLocation(value), null);
  assert.equal(resolveSampleScanFrom({ countryDefault: "california", locationOverride: "bad" }), "california");
});

test("audience copy follows visitor location independently of the selected scan region", () => {
  assert.equal(homepageAudienceText("US"), "Built for developers and agencies reviewing websites for CCPA and GDPR/ePrivacy concerns.");
  assert.equal(homepageAudienceText("EU"), "Built for developers and agencies reviewing websites for GDPR/ePrivacy and CCPA concerns.");
});
