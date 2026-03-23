import assert from "node:assert/strict";
import test from "node:test";
import {
  getLocalizedKeywords,
  getLocalizedPathGuesses,
  getSupportedKeyPageTypes
} from "./key-page-locale-config";

test("getSupportedKeyPageTypes includes finance-relevant about, pricing, and product surfaces", () => {
  assert.deepEqual(getSupportedKeyPageTypes(), [
    "privacy_policy",
    "terms_of_service",
    "cookie_policy",
    "accessibility_statement",
    "contact",
    "about",
    "pricing",
    "product"
  ]);
});

test("localized keyword and path guesses cover pricing and product pages", () => {
  assert.ok(getLocalizedKeywords("pricing", ["en"]).includes("pricing"));
  assert.ok(getLocalizedKeywords("product", ["fr"]).includes("plateforme"));

  assert.ok(
    getLocalizedPathGuesses({
      homepageUrl: "https://example.com/",
      localeHints: ["en"],
      pageType: "pricing"
    }).includes("https://example.com/pricing")
  );

  assert.ok(
    getLocalizedPathGuesses({
      homepageUrl: "https://example.com/fr/",
      localeHints: ["fr"],
      pageType: "product"
    }).includes("https://example.com/fr/produits")
  );
});
