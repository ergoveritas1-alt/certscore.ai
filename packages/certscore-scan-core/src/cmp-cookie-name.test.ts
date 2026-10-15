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


test("Iubenda action cookie identity uses the same bounded canonical variants", () => {
  for (const name of ["_iub_cs-s1", "_iub_cs-252372"]) assert.equal(matchesCanonicalCmpCookieName(name, "_iub_cs"), true);
  for (const name of ["_iub_cs-other", "_iub_cs-", "_iub_cs-s1-extra", "_iub_previous_preference_id"]) assert.equal(matchesCanonicalCmpCookieName(name, "_iub_cs"), false);
});
