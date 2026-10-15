import assert from "node:assert/strict";
import test from "node:test";
import { COOKIE_PURPOSE_POLICY, AXEPTIO_COOKIE_PURPOSE_POLICY, retainedCookiePurposePolicy, resolveCanonicalCookieKnowledge } from "./cookie-knowledge-base";

test("documented service cookies require the new capture policy and exact names", () => {
  for (const name of ["cookieyes-consent", "aws-waf-token", "axeptio_cookies"]) {
    assert.equal(resolveCanonicalCookieKnowledge(name).essentiality, "unknown");
    assert.equal(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY }).essentiality, "essential");
  }
  for (const name of ["cookieyes-consent-extra", "aws-waf-token-ads", "gb_anon_id", "llama_dev_csrf", "datagrail_consent_id"]) {
    assert.equal(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY }).essentiality, "unknown", name);
  }
  assert.equal(resolveCanonicalCookieKnowledge("_ga", { purposePolicyVersion: COOKIE_PURPOSE_POLICY }).essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("GCLB", { purposePolicyVersion: COOKIE_PURPOSE_POLICY }).category, "infrastructure");
  assert.equal(resolveCanonicalCookieKnowledge("GCLB", { purposePolicyVersion: COOKIE_PURPOSE_POLICY }).essentiality, "unknown");
  assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${AXEPTIO_COOKIE_PURPOSE_POLICY}`]), AXEPTIO_COOKIE_PURPOSE_POLICY);
  assert.equal(retainedCookiePurposePolicy(["cookie_purpose_policy:unreviewed.v3"]), undefined);
  assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`, `cookie_purpose_policy:${AXEPTIO_COOKIE_PURPOSE_POLICY}`]), undefined);
  assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`, "cookie_purpose_policy:unreviewed.v3"]), undefined);
});

test("generic OpenAI cookie names are scoped to the exact documented cookie domain", () => {
  for (const name of ["country", "locale", "oai-did"]) {
    assert.equal(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY, cookieDomain: ".openai.com" }).essentiality, "essential");
    for (const cookieDomain of [undefined, "example.com", "ads.openai.com", "openai.com.example.test"]) {
      assert.equal(resolveCanonicalCookieKnowledge(name, { purposePolicyVersion: COOKIE_PURPOSE_POLICY, cookieDomain,
        hostname: "openai.com", setterScriptUrl: "https://openai.com/script.js", initiatorChain: ["https://openai.com/"] }).essentiality, "unknown");
    }
    assert.equal(resolveCanonicalCookieKnowledge(name, { cookieDomain: "openai.com" }).essentiality, "unknown");
  }
});
