import assert from "node:assert/strict";
import test from "node:test";
import { classifyConsentPreferenceCategoryLabel } from "./consent-preference-category-classifier";

test("classifies German necessary and optional consent categories canonically", () => {
  assert.equal(classifyConsentPreferenceCategoryLabel("Essenziell"), "necessary");
  assert.equal(classifyConsentPreferenceCategoryLabel("Technisch notwendig"), "necessary");
  assert.equal(classifyConsentPreferenceCategoryLabel("Statistik"), "optional");
  assert.equal(classifyConsentPreferenceCategoryLabel("Externe Medien"), "optional");
});

test("does not infer an unknown preference category", () => {
  assert.equal(classifyConsentPreferenceCategoryLabel("Mehr erfahren"), "unknown");
});
