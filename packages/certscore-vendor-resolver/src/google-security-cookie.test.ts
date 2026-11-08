import assert from "node:assert/strict";
import test from "node:test";
import { readCookieClassification, usesBoundCookieClassificationVersion } from "@certscore/contracts";
import { resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge,
  resolveCanonicalActionStoragePurpose, retainedCookiePurposePolicy } from "./index";
import retained from "./test-fixtures/google-security-cookies-2026-10-30.json";

test("retained exact Google security identities acquire purpose, not site-specific necessity", () => {
  assert.equal(retained.length, 15);
  assert.equal(new Set(retained.map(row => row.site)).size, 15);
  for (const {cookie: c} of retained) {
    assert.equal(c.category, "unknown");
    assert.equal(c.essentiality, "unknown");
    const result = resolveCanonicalCookieClassification(c.cookieName, {cookieDomain: c.domain});
    assert.equal(result.version, "certscore.cookie-purpose.v12");
    assert.equal(result.category, "security");
    assert.equal(result.essentiality, "unknown");
    assert.equal(result.unknownReason, "necessity_not_established");
    assert.deepEqual(result.documentedPurposes, ["security"]);
    // The table lists several products, so no particular service is attributed.
    assert.equal(result.provider, null);
    assert.ok(readCookieClassification(result, c.cookieName, c.domain));
    const action = resolveCanonicalActionStoragePurpose({storageType: "cookie", name: c.cookieName, hostname: c.domain});
    assert.equal(action.nonEssential, false);
    assert.equal(action.purposeAssessment.essentiality, "unknown");
  }
});

test("Google's partner-domain rule requires an exact cookie identity and valid storage scope", () => {
  for (const cookieDomain of [undefined, "", "example", "https://example.test/path", "example.test/path", " example.test", "example..test", "-bad.example", "example.test:443", "example.test.", "a".repeat(64) + ".test"]) {
    const result = resolveCanonicalCookieClassification("__eoi", {cookieDomain});
    assert.equal(result.category, "unknown", cookieDomain);
    assert.equal(result.unknownReason, "missing_context");
  }
  for (const name of ["__EOI", " __eoi", "__eoi ", "__eoi_extra", "eoi", "_tt_enable_cookie"])
    assert.equal(resolveCanonicalCookieClassification(name, {cookieDomain: "example.test"}).category, "unknown", name);
  assert.equal(resolveCanonicalCookieClassification("__eoi", {cookieDomain: ".EXAMPLE.TEST"}).category, "security");
  assert.equal(resolveCanonicalCookieKnowledge("__eoi", {purposePolicyVersion: "certscore.cookie-purpose.v10", setterScriptUrl: "https://example.test/script.js"}).category, "unknown");
  for (const storageType of ["local_storage", "session_storage"] as const) {
    const action = resolveCanonicalActionStoragePurpose({storageType, name: "__eoi", hostname: "example.test"});
    assert.equal(action.nonEssential, false);
    assert.equal(action.purposeAssessment.essentiality, "unknown");
  }
});

test("historical v9 keeps its original unknowns, schema and X provider attribution", () => {
  for (const version of ["certscore.cookie-purpose.v6", "certscore.cookie-purpose.v7", "certscore.cookie-purpose.v8", "certscore.cookie-purpose.v9"] as const) {
    const old = resolveCanonicalCookieClassification("__eoi", {cookieDomain: "example.test"}, version);
    assert.equal(old.category, "unknown");
    assert.equal(old.essentiality, "unknown");
    assert.ok(readCookieClassification(old, "__eoi", "example.test"));
    assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${version}`]), version);
  }
  for (const version of ["certscore.cookie-purpose.v9", "certscore.cookie-purpose.v10"] as const) {
    assert.ok(usesBoundCookieClassificationVersion(version));
    const x = resolveCanonicalCookieClassification("muc_ads", {cookieDomain: "t.co"}, version);
    assert.equal(x.provider?.registryAttribution.resolverVersion, "certscore-cookie-provider-2026-10-30-v7");
    assert.equal(x.essentiality, "non_essential");
    assert.equal(readCookieClassification({...x, unknownReason: undefined}, "muc_ads", "t.co"), null);
  }
});
