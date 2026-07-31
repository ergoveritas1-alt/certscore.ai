import assert from "node:assert/strict";
import test from "node:test";
import {
  CONSENT_CONTROL_CANARY_EXPECTATIONS,
  CONSENT_CONTROL_CANARY_VARIANTS,
  isConsentControlCanaryVariant,
} from "./content";

test("consent-control calibration canaries define a representative owned matrix", () => {
    assert.deepEqual(CONSENT_CONTROL_CANARY_VARIANTS, [
      "basic",
      "delayed",
      "shadow-dom",
      "localized-de",
      "partial",
    ]);
    assert.equal(CONSENT_CONTROL_CANARY_VARIANTS.every((variant) => Boolean(CONSENT_CONTROL_CANARY_EXPECTATIONS[variant])), true);
    assert.equal(CONSENT_CONTROL_CANARY_EXPECTATIONS.delayed.renderMode, "delayed");
    assert.equal(CONSENT_CONTROL_CANARY_EXPECTATIONS["shadow-dom"].renderMode, "shadow_dom");
    assert.equal(CONSENT_CONTROL_CANARY_EXPECTATIONS["localized-de"].locale, "de");
    assert.equal(CONSENT_CONTROL_CANARY_EXPECTATIONS.partial.reject, false);
});

test("consent-control calibration canaries reject arbitrary public paths", () => {
    assert.equal(isConsentControlCanaryVariant("basic"), true);
    assert.equal(isConsentControlCanaryVariant("amazon-de"), false);
});
