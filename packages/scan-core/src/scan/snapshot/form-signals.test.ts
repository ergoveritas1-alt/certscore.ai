import assert from "node:assert/strict";
import test from "node:test";
import { deriveFormSignals } from "./extractors";
import type { StaticPageResult } from "./types";

function makePage(overrides: Partial<StaticPageResult>): StaticPageResult {
  return {
    finalUrl: "https://example.com/",
    headers: {},
    fetchStatus: "ok",
    forms: [],
    html: "<html></html>",
    language: null,
    links: [],
    pageType: "other",
    pageUrl: "https://example.com/",
    redirected: false,
    scripts: [],
    statusCode: 200,
    textContent: "",
    title: null,
    ...overrides
  };
}

test("deriveFormSignals ignores policy-style sensitive text when no forms collect it", () => {
  const formSignals = deriveFormSignals([
    makePage({
      pageType: "privacy_policy",
      textContent:
        "We may process health, medical, biometric, and social security information in limited cases described in this policy.",
      forms: []
    }),
    makePage({
      pageType: "homepage",
      textContent: "Read our privacy commitments and measurement practices."
    })
  ]);

  assert.equal(formSignals.sensitiveDataFormHintsPresent, false);
  assert.equal(formSignals.formCollectsHealthInformation, false);
  assert.equal(formSignals.formCollectsSsn, false);
  assert.equal(formSignals.highSensitivityDataCollectionDetected, false);
});
