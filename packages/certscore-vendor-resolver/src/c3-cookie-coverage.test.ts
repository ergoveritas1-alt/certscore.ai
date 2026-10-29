import assert from "node:assert/strict";
import test from "node:test";
import {readCookieClassification} from "@certscore/contracts";
import {resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge, resolveCanonicalActionStoragePurpose,
  resolveCanonicalVendor, COOKIE_PURPOSE_POLICY, retainedCookiePurposePolicy, getCanonicalVendorRegistryManifest} from "./index";

const analytics = [
  ["fundraiseup_stat", "Fundraise Up", "ent_28ecebb5b690"],
  ["nmstat", "Siteimprove", "ent_510b9958a217"],
  ["SC_ANALYTICS_GLOBAL_COOKIE", "Sitecore", "ent_cfab93b3f370"],
] as const;

test("C3 exact first-party analytics cookies retain purpose, canonical identity and typed provenance", () => {
  assert.equal(getCanonicalVendorRegistryManifest().cookieProviderResolverVersion, "certscore-cookie-provider-2026-10-27-v6");
  for (const [name, vendor, entityId] of analytics) {
    const row = resolveCanonicalCookieClassification(name, {cookieDomain:".example.test"});
    assert.equal(row.version, "certscore.cookie-purpose.v8");
    assert.equal(row.category, "analytics");
    assert.equal(row.essentiality, "non_essential");
    assert.equal(row.provider?.vendor, vendor);
    assert.equal(row.provider?.registryAttribution.entityId, entityId);
    assert.equal(row.provider?.registryAttribution.resolverVersion, "certscore-cookie-provider-2026-10-27-v6");
    assert.deepEqual(readCookieClassification(JSON.parse(JSON.stringify(row)), name, "example.test"), row);
    assert.equal(readCookieClassification(row, name, "other.test"), null);
    const fresh = resolveCanonicalActionStoragePurpose({storageType:"cookie",name,hostname:"example.test"});
    assert.equal(fresh.nonEssential, true);
    assert.equal(fresh.purpose, "analytics");
    assert.equal(fresh.vendor, vendor);
  }
  assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`]), COOKIE_PURPOSE_POLICY);
});

test("C3 keeps fraud prevention and consent-state cookies separate from analytics", () => {
  for (const [name, category, vendor] of [["fundraiseup_cid","security","Fundraise Up"], ["szcib","consent_management","Siteimprove"],
    ["SC_TRACKING_CONSENT","consent_management","Sitecore"]] as const) {
    const row = resolveCanonicalCookieClassification(name);
    assert.equal(row.category, category);
    assert.equal(row.essentiality, "essential");
    assert.equal(row.provider?.vendor, vendor);
    assert.equal(resolveCanonicalActionStoragePurpose({storageType:"cookie",name,hostname:"example.test"}).nonEssential, false);
  }
});

test("lookalikes, unsupported vendor cookies and non-cookie storage do not inherit C3 analytics", () => {
  for (const [name] of analytics) for (const variant of [`prefix_${name}`,`${name}_suffix`, ` ${name}`, `${name} `,name.toUpperCase()===name?name.toLowerCase():name.toUpperCase()]) {
    const row = resolveCanonicalCookieClassification(variant);
    assert.equal(row.essentiality, "unknown", variant);
    assert.equal(row.provider, null, variant);
  }
  for (const name of ["fundraiseup_func", "fundraiseup_mark", "fundraiseup_unknown", "sz-feedback-should-hide", "SC_UNKNOWN_COOKIE"]) {
    assert.equal(resolveCanonicalCookieClassification(name).essentiality, "unknown", name);
  }
  for (const [name] of analytics) for (const storageType of ["local_storage","session_storage"] as const)
    assert.equal(resolveCanonicalActionStoragePurpose({storageType,name,hostname:"example.test"}).nonEssential, false);
  assert.equal(resolveCanonicalVendor({type:"request",url:"https://cdn.fundraiseup.com/arbitrary"}).status,"unrecognized");
});

test("v6 and earlier keep C3 unknown and retain readable classification records", () => {
  for (const [name] of analytics) {
    for (const version of ["certscore.cookie-purpose.v2","certscore.cookie-purpose.v3","certscore.cookie-purpose.v4","certscore.cookie-purpose.v5","certscore.cookie-purpose.v6"] as const)
      assert.equal(resolveCanonicalCookieKnowledge(name,{purposePolicyVersion:version}).essentiality,"unknown",`${name} ${version}`);
    const historical=resolveCanonicalCookieClassification(name,{},"certscore.cookie-purpose.v6");
    assert.equal(historical.category,"unknown");assert.equal(historical.provider,null);
    assert.deepEqual(readCookieClassification(historical,name,null),historical);
  }
  assert.equal(resolveCanonicalCookieClassification("_clck",{},"certscore.cookie-purpose.v6").essentiality,"non_essential");
  assert.equal(retainedCookiePurposePolicy(["cookie_purpose_policy:certscore.cookie-purpose.v6"]),"certscore.cookie-purpose.v6");
});
