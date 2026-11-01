import assert from "node:assert/strict";
import test from "node:test";
import { readCookieClassification } from "@certscore/contracts";
import { resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge,
  resolveCanonicalActionStoragePurpose, resolveCanonicalVendor, retainedCookiePurposePolicy } from "./index";
import retained from "./test-fixtures/funding-choices-analytics-2026-10-30.json";

test("exact retained Funding Choices analytics cookies reuse canonical provider identity", () => {
  assert.equal(retained.length, 11);
  assert.equal(new Set(retained.map(row => row.site)).size, 11);
  const saved = structuredClone(retained);
  for (const {cookie: c} of retained) {
    assert.equal(c.category, "unknown");
    assert.equal(c.setMethod, "browser_snapshot");
    assert.equal(c.setAtMs, null);
    const result = resolveCanonicalCookieClassification(c.cookieName, {cookieDomain: c.domain});
    assert.equal(result.version, "certscore.cookie-purpose.v11");
    assert.equal(result.category, "analytics");
    assert.equal(result.essentiality, "non_essential");
    assert.equal(result.unknownReason, null);
    assert.deepEqual(result.documentedPurposes, ["analytics"]);
    assert.equal(result.provider?.entity, "Google LLC");
    assert.equal(result.provider?.product, "Google Funding Choices CMP");
    assert.equal(result.provider?.registryAttribution.serviceId, "svc_b7dc7f4acb26");
    assert.equal(result.provider?.registryAttribution.resolverVersion, "certscore-cookie-provider-2026-10-30-v8");
    assert.ok(readCookieClassification(result, c.cookieName, c.domain));
    assert.equal(resolveCanonicalActionStoragePurpose({storageType: "cookie", name: c.cookieName, hostname: c.domain}).nonEssential, true);
  }
  assert.deepEqual(retained, saved, "classification must not synthesize write/timing facts");
});

test("analytics recognition cannot generalize to consent configuration, names or other storage", () => {
  const consent = resolveCanonicalCookieClassification("FCCDCF", {cookieDomain: "example.test"});
  assert.equal(consent.category, "consent_management");
  assert.equal(consent.essentiality, "unknown");
  for (const name of ["fcnec", " FCNEC", "FCNEC ", "FCNEC_extra", "FCN", "FCNEC2"])
    assert.equal(resolveCanonicalCookieClassification(name, {cookieDomain: "example.test"}).category, "unknown");
  for (const cookieDomain of [undefined, "", "example", "https://example.test/path", "example.test/path", "example.test:443", " example.test", "example..test", "-bad.example", "example.test."]) {
    const result = resolveCanonicalCookieClassification("FCNEC", {cookieDomain});
    assert.equal(result.category, "unknown", cookieDomain);
    assert.equal(result.provider, null);
    assert.equal(result.unknownReason, "missing_context");
  }
  assert.equal(resolveCanonicalCookieClassification("FCNEC", {cookieDomain: ".EXAMPLE.TEST"}).category, "analytics");
  assert.equal(resolveCanonicalCookieKnowledge("FCNEC", {purposePolicyVersion: "certscore.cookie-purpose.v11", setterScriptUrl: "https://example.test/script.js"}).category, "unknown");
  for (const storageType of ["local_storage", "session_storage"] as const)
    assert.equal(resolveCanonicalActionStoragePurpose({storageType, name: "FCNEC", hostname: "example.test"}).nonEssential, false);
  assert.equal(resolveCanonicalVendor({type: "request", url: "https://example.test/FCNEC", cookieName: "FCNEC"}).status, "unrecognized");
});

test("v6 through v10 retain unknown FCNEC and their original provider versions", () => {
  for (const version of ["certscore.cookie-purpose.v6", "certscore.cookie-purpose.v7", "certscore.cookie-purpose.v8", "certscore.cookie-purpose.v9", "certscore.cookie-purpose.v10"] as const) {
    const old = resolveCanonicalCookieClassification("FCNEC", {cookieDomain: "example.test"}, version);
    assert.equal(old.category, "unknown");
    assert.equal(old.essentiality, "unknown");
    assert.equal(old.provider, null);
    assert.ok(readCookieClassification(old, "FCNEC", "example.test"));
    assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${version}`]), version);
  }
  const security = resolveCanonicalCookieClassification("__eoi", {cookieDomain: "example.test"}, "certscore.cookie-purpose.v10");
  assert.equal(security.category, "security");
  assert.equal(security.unknownReason, "necessity_not_established");
  const oldX = resolveCanonicalCookieClassification("muc_ads", {cookieDomain: "t.co"}, "certscore.cookie-purpose.v10");
  assert.equal(oldX.provider?.registryAttribution.resolverVersion, "certscore-cookie-provider-2026-10-30-v7");
  assert.equal(readCookieClassification({...oldX, unknownReason: undefined}, "muc_ads", "t.co"), null);
});
