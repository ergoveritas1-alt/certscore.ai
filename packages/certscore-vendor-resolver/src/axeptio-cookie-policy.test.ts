import assert from "node:assert/strict";
import test from "node:test";
import { AXEPTIO_COOKIE_PURPOSE_POLICY, resolveCanonicalCookieKnowledge } from "./cookie-knowledge-base";

test("new versioned captures classify exact Axeptio preference cookies without changing legacy knowledge", () => {
  for (const name of ["axeptio_cookies", "axeptio_all_vendors", "axeptio_authorized_vendors"]) {
    const legacy = resolveCanonicalCookieKnowledge(name);
    assert.equal(legacy.essentiality, "unknown");
    const current = resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: AXEPTIO_COOKIE_PURPOSE_POLICY });
    assert.equal(current.category, "consent_management");
    assert.equal(current.vendor, "Axeptio");
    assert.equal(current.essentiality, "essential");
    current.dataTypes.length = 0;
    assert.ok(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: AXEPTIO_COOKIE_PURPOSE_POLICY }).dataTypes.length);
    assert.deepEqual(resolveCanonicalCookieKnowledge(name), legacy);
  }
  for (const name of ["axeptio_cookies_ads", "axeptio_unknown", "AXEPTIO_COOKIES", "aws-waf-token", "cookieyes-consent"]) {
    assert.equal(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: AXEPTIO_COOKIE_PURPOSE_POLICY }).essentiality, "unknown", name);
  }
  assert.equal(resolveCanonicalCookieKnowledge("_ga", { purposePolicyVersion: AXEPTIO_COOKIE_PURPOSE_POLICY }).essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("__cf_bm", { purposePolicyVersion: AXEPTIO_COOKIE_PURPOSE_POLICY }).essentiality, "essential");
});
