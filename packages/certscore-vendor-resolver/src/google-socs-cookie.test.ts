import assert from "node:assert/strict";
import test from "node:test";
import { readCookieClassification } from "@certscore/contracts";
import { COOKIE_PURPOSE_POLICY, resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge, resolveCanonicalActionStoragePurpose, retainedCookiePurposePolicy } from "./index";

test("SOCS recognizes exact Google storage identity without asserting necessity or a particular CMP", () => {
  for (const cookieDomain of ["google.com", ".google.com", "WWW.GOOGLE.COM"]) {
    const result = resolveCanonicalCookieClassification("SOCS", {cookieDomain});
    assert.equal(result.version, "certscore.cookie-purpose.v12");
    assert.equal(result.category, "consent_management");
    assert.equal(result.essentiality, "unknown");
    assert.equal(result.unknownReason, "necessity_not_established");
    assert.deepEqual(result.documentedPurposes, ["consent_management"]);
    assert.equal(result.provider, null, "No specific CMP product is established");
    assert.ok(readCookieClassification(result, "SOCS", cookieDomain));
    assert.equal(resolveCanonicalActionStoragePurpose({storageType:"cookie",name:"SOCS",hostname:cookieDomain}).nonEssential, false);
  }
  assert.match(resolveCanonicalCookieKnowledge("SOCS", {cookieDomain:"google.com",purposePolicyVersion:COOKIE_PURPOSE_POLICY}).description, /Consent-preference storage/);
});

test("SOCS cannot borrow page/initiator identity or match lookalike names/domains", () => {
  for (const cookieDomain of [undefined,"evilgoogle.com","google.com.evil.test","google.invalid","youtube.com","https://google.com/","google.com:443","..google.com","-bad.google.com"," google.com","google.com."]) {
    assert.equal(resolveCanonicalCookieClassification("SOCS",{cookieDomain}).category,"unknown",String(cookieDomain));
  }
  for (const name of ["socs"," SOCS","SOCS ","SOCS_extra"]) assert.equal(resolveCanonicalCookieClassification(name,{cookieDomain:"google.com"}).category,"unknown");
  assert.equal(resolveCanonicalCookieKnowledge("SOCS",{hostname:"google.com",setterScriptUrl:"https://google.com/script.js",initiatorChain:["https://google.com"],purposePolicyVersion:COOKIE_PURPOSE_POLICY}).category,"unknown");
});

test("v11 and earlier remain unchanged while v12 round-trips its marker", () => {
  for (const version of ["certscore.cookie-purpose.v6","certscore.cookie-purpose.v7","certscore.cookie-purpose.v8","certscore.cookie-purpose.v9","certscore.cookie-purpose.v10","certscore.cookie-purpose.v11"] as const) {
    const old = resolveCanonicalCookieClassification("SOCS",{cookieDomain:"google.com"},version);
    assert.equal(old.category,"unknown");
    assert.ok(readCookieClassification(old,"SOCS","google.com"));
  }
  const fcnec = resolveCanonicalCookieClassification("FCNEC",{cookieDomain:"example.test"},"certscore.cookie-purpose.v11");
  assert.equal(fcnec.category,"analytics");
  assert.equal(fcnec.provider?.registryAttribution.resolverVersion,"certscore-cookie-provider-2026-10-30-v8");
  assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`]),COOKIE_PURPOSE_POLICY);
});
