import assert from "node:assert/strict";
import test from "node:test";
import { homepageAudienceText, homepageHeroText, parseHomepageLocation, resolveSampleScanFrom } from "./homepage-location";

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

test("California privacy signal copy is specific to the US homepage variant", () => {
  assert.match(homepageHeroText("US"), /Test California privacy signals, including Global Privacy Control \(GPC\) and opt-out mechanisms\./);
  assert.equal(homepageHeroText("EU"), "Scan public pages for cookies, trackers, session-replay signals, privacy policy signals, and consent behavior. Review what appears before consent and after eligible Accept or Reject clicks, with retained evidence and clear coverage limits.");
});
