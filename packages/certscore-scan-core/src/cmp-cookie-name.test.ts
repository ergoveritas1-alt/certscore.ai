import assert from "node:assert/strict";
import test from "node:test";
import { matchesCanonicalCmpCookieName } from "./cmp-cookie-name.js";

test("canonical CMP cookie matching accepts registered Consentmanager tenant suffixes", () => {
  assert.equal(matchesCanonicalCmpCookieName("__cmpconsentx23129", "__cmpconsent"), true);
  assert.equal(matchesCanonicalCmpCookieName("__cmpconsents23129", "__cmpconsent"), true);
});

test("canonical CMP cookie matching remains exact without a registered wildcard", () => {
  assert.equal(matchesCanonicalCmpCookieName("OptanonConsentTenant", "OptanonConsent"), false);
  assert.equal(matchesCanonicalCmpCookieName("OptanonConsent", "OptanonConsent"), true);
});

test("canonical CMP cookie matching accepts the registered OneTrust underscore suffix", () => {
  assert.equal(matchesCanonicalCmpCookieName("OptanonConsent_mUOxXq", "OptanonConsent"), true);
  assert.equal(matchesCanonicalCmpCookieName("OptanonAlertBoxClosed_mUOxXq", "OptanonConsent"), false);
});

test("canonical CMP cookie matching rejects unrelated consent-like names", () => {
  assert.equal(matchesCanonicalCmpCookieName("site_cmpconsent", "__cmpconsent"), false);
  assert.equal(matchesCanonicalCmpCookieName("__cmpchoice23129", "__cmpconsent"), false);
});
