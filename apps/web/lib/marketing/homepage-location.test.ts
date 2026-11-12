import assert from "node:assert/strict";
import test from "node:test";
import { homepageAudienceText, homepageHeroText, parseHomepageLocation, resolveSampleScanFrom } from "./homepage-location";
import { homepageReviewIntro, homepageReviewWorkflows } from "./homepage-review-workflows";

test("review workflows lead with the visitor region while keeping both privacy perspectives and shared tools", () => {
  assert.deepEqual(homepageReviewWorkflows("US").map((item) => item.id), ["us", "eu", "consent", "policy"]);
  assert.deepEqual(homepageReviewWorkflows("EU").map((item) => item.id), ["eu", "us", "consent", "policy"]);
  assert.deepEqual(new Set(homepageReviewWorkflows("US").map((item) => item.href)), new Set(homepageReviewWorkflows("EU").map((item) => item.href)));
  assert.match(homepageReviewIntro("US"), /^Start with CCPA\/California/);
  assert.match(homepageReviewIntro("EU"), /^Start with GDPR\/ePrivacy/);
});

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
  assert.equal(homepageAudienceText("US"), "CCPA and GDPR/ePrivacy review");
  assert.equal(homepageAudienceText("EU"), "GDPR/ePrivacy and CCPA review");
});

test("both homepage heroes share the concise product explanation", () => {
  for (const location of ["US", "EU"] as const) {
    assert.equal(homepageHeroText(location), "See what your websites collect—and what happens before and after consent.");
  }
});
