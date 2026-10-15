import assert from "node:assert/strict";
import test from "node:test";
import {
  COOKIE_PURPOSE_CANDIDATE_VERSION,
  resolveCanonicalCookieKnowledge,
  resolveCanonicalCookiePurposeCandidate,
} from "./cookie-knowledge-base";

test("documented security and CMP candidates classify purpose without asserting essentiality", () => {
  for (const [name, category, vendor] of [
    ["aws-waf-token", "security", "Amazon Web Services"],
    ["cookieyes-consent", "consent_management", "CookieYes"],
    ["axeptio_cookies", "consent_management", "Axeptio"],
    ["axeptio_all_vendors", "consent_management", "Axeptio"],
    ["axeptio_authorized_vendors", "consent_management", "Axeptio"],
  ]) {
    const candidate = resolveCanonicalCookiePurposeCandidate(name, { cookieDomain: "site.example" });
    assert.ok(candidate, name);
    assert.equal(candidate.artifactVersion, COOKIE_PURPOSE_CANDIDATE_VERSION);
    assert.equal(candidate.proposed.category, category);
    assert.equal(candidate.proposed.vendor, vendor);
    assert.equal(candidate.proposed.essentiality, "unknown");
    assert.equal(candidate.mode, "local_review");
    assert.equal(candidate.productionProjectable, false);
    assert.equal(candidate.scoreEffect, "none");
    assert.ok(candidate.sourceRefs.every((url) => new URL(url).protocol === "https:"));
    assert.equal(candidate.current.category, "unknown");
    assert.equal(candidate.current.essentiality, "unknown");
    assert.deepEqual(resolveCanonicalCookieKnowledge(name, { cookieDomain: "site.example" }), candidate.current);
  }
});

test("similar names, generic CSRF names and unverified Meta cookie purposes stay unresolved", () => {
  for (const name of [
    "aws-waf-token-ads", "my-aws-waf-token", "AWS-WAF-TOKEN", "cookieyes-consent-id",
    "axeptio_all_vendors_tracking", "axeptio_unknown", "csrf", "llama_dev_csrf", "country", "locale", "",
  ]) {
    assert.equal(resolveCanonicalCookiePurposeCandidate(name, { cookieDomain: "dev.meta.ai" }), null, name);
  }
  assert.equal(resolveCanonicalCookiePurposeCandidate(null), null);
  assert.equal(resolveCanonicalCookiePurposeCandidate(undefined), null);
});

test("candidate review preserves production knowledge and cannot override known tracking or security", () => {
  for (const name of ["_ga", "_fbp", "__cf_bm", "OptanonConsent"]) {
    const before = resolveCanonicalCookieKnowledge(name);
    assert.equal(resolveCanonicalCookiePurposeCandidate(name), null);
    assert.deepEqual(resolveCanonicalCookieKnowledge(name), before);
  }
  const candidate = resolveCanonicalCookiePurposeCandidate("axeptio_all_vendors")!;
  candidate.sourceRefs.length = 0;
  candidate.proposed.dataTypes.length = 0;
  assert.ok(resolveCanonicalCookiePurposeCandidate("axeptio_all_vendors")!.sourceRefs.length > 0);
  assert.ok(resolveCanonicalCookiePurposeCandidate("axeptio_all_vendors")!.proposed.dataTypes.length > 0);
});

test("Axeptio declared-vendor storage is not described as acceptance", () => {
  const candidate = resolveCanonicalCookiePurposeCandidate("axeptio_all_vendors")!;
  assert.match(candidate.proposed.description, /declared/);
  assert.match(candidate.proposed.description, /not evidence.*accepted/);
  assert.equal(candidate.proposed.essentiality, "unknown");
});
