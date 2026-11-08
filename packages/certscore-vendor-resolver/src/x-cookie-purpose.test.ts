import assert from "node:assert/strict";
import test from "node:test";
import { readCookieClassification } from "@certscore/contracts";
import { resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge,
  resolveCanonicalActionStoragePurpose, retainedCookiePurposePolicy } from "./index";
import retained from "./test-fixtures/x-cookies-2026-10-30.json";

test("exact retained X cookies classify purpose without changing original write evidence", () => {
  assert.equal(retained.length, 12);
  for (const row of retained) {
    const c = row.cookie;
    assert.equal(c.essentiality, "unknown");
    assert.equal(c.setMethod, "set_cookie_header");
    const result = resolveCanonicalCookieClassification(c.cookieName, { cookieDomain: c.domain });
    assert.equal(result.version, "certscore.cookie-purpose.v12");
    assert.equal(result.category, c.cookieName === "muc_ads" ? "advertising" : "personalization");
    assert.equal(result.essentiality, "non_essential");
    assert.equal(result.provider?.entity, "X Corp.");
    assert.equal(result.provider?.registryAttribution.resolverVersion, "certscore-cookie-provider-2026-10-30-v8");
    assert.ok(readCookieClassification(result, c.cookieName, c.domain));
  }
});

test("X rules require the exact name and the cookie's own documented domain", () => {
  for (const [name, domain] of [["muc_ads", "t.co"], ["personalization_id", "twitter.com"], ["personalization_id", ".x.com"]] as const) {
    assert.equal(resolveCanonicalCookieClassification(name!, { cookieDomain: domain }).essentiality, "non_essential");
    for (const cookieDomain of [undefined, "example.test", `${domain}.evil.test`, `https://${domain}/path`, name === "muc_ads" ? "twitter.com" : "t.co"]) {
      const result = resolveCanonicalCookieClassification(name!, { cookieDomain });
      assert.equal(result.essentiality, "unknown");
      assert.equal(result.provider, null);
    }
    for (const wrong of [name!.toUpperCase(), ` ${name}`, `${name} `, `${name}_extra`])
      assert.equal(resolveCanonicalCookieClassification(wrong, { cookieDomain: domain }).essentiality, "unknown");
    assert.equal(resolveCanonicalCookieKnowledge(name!, { purposePolicyVersion: "certscore.cookie-purpose.v9",
      setterScriptUrl: `https://${domain}/script.js` }).essentiality, "unknown");
    for (const storageType of ["local_storage", "session_storage"] as const)
      assert.equal(resolveCanonicalActionStoragePurpose({ storageType, name: name!, hostname: domain }).nonEssential, false);
  }
});

test("v8 classifications keep original X unknowns and v8 unknown-reason/schema behavior", () => {
  for (const row of retained) {
    const c = row.cookie;
    const old = resolveCanonicalCookieClassification(c.cookieName, { cookieDomain: c.domain }, "certscore.cookie-purpose.v8");
    assert.equal(old.category, "unknown");
    assert.equal(old.unknownReason, "no_registry_match");
    assert.ok(readCookieClassification(old, c.cookieName, c.domain));
  }
  for (const version of ["certscore.cookie-purpose.v8", "certscore.cookie-purpose.v9"]) {
    assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${version}`]), version);
  }
  for (const name of ["MUID", "MR", "SM", "ANONCHK", "SRM_B"])
    assert.equal(resolveCanonicalCookieClassification(name, { cookieDomain: "c.bing.com" }).essentiality, "unknown");
});
