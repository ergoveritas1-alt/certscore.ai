import assert from "node:assert/strict";
import test from "node:test";
import { postRefusalStorageItemSchema, postRefusalStorageWriteSchema, postAcceptStorageWriteSchema, readCookieClassification } from "@certscore/contracts";
import { COOKIE_PURPOSE_POLICY, LEGACY_COOKIE_PURPOSE_POLICY, resolveCanonicalCookieKnowledge,
  resolveCanonicalCookieClassification, resolveCanonicalVendor } from "./index";
import { resolveCanonicalActionStoragePurpose } from "./action-storage-purpose";

test("mixed uses are retained without turning possible use into an observed purpose", () => {
  for (const name of ["VISITOR_INFO1_LIVE", "__Secure-YNID", "__Secure-YEC"]) {
    const row = resolveCanonicalCookieClassification(name, { cookieDomain: ".youtube.com" });
    assert.equal(row.category, "unknown"); assert.equal(row.essentiality, "unknown");
    assert.ok(row.documentedPurposes.includes("analytics")); assert.equal(row.provider?.vendor, "YouTube");
    assert.equal(row.provider?.entity, "Google LLC");
    assert.equal(resolveCanonicalCookieClassification(name, { cookieDomain: "youtube.com.example.test" }).provider, null);
  }
  const ancestorOnly = resolveCanonicalCookieKnowledge("VISITOR_INFO1_LIVE", { cookieDomain: "site.example",
    setterScriptUrl: "https://youtube.com/player.js", initiatorChain: ["https://youtube.com/"], purposePolicyVersion: COOKIE_PURPOSE_POLICY });
  assert.equal(ancestorOnly.category, "unknown");
  assert.equal(ancestorOnly.vendor, null);
  assert.equal(resolveCanonicalCookieClassification("__Secure-ROLLOUT_TOKEN", { cookieDomain: "youtube.com" }).essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieClassification("YSC", { cookieDomain: "youtube.com" }).essentiality, "essential");
  for (const name of ["MUID", "ANONCHK", "MR", "SM"]) {
    assert.equal(resolveCanonicalCookieClassification(name, { cookieDomain: "clarity.ms" }).essentiality, "unknown");
    assert.equal(resolveCanonicalCookieClassification(name, { cookieDomain: "example.com" }).provider, null);
  }
});

test("ambiguous identities and unsupported patterns cannot regain legacy classifications", () => {
  for (const name of ["uid", "ubid-arbitrary", "sailthru_consent", "akaas_unknown", "_pk_hm.1", "utag_main_custom", "llama_dev_csrf", "gb_anon_id"]) {
    const row = resolveCanonicalCookieClassification(name, { cookieDomain: "example.com" });
    assert.equal(row.category, "unknown", name); assert.equal(row.essentiality, "unknown", name);
    assert.equal(row.provider, null, name);
  }
  for (const name of ["_dd_s", "_dd_s_v2"]) assert.equal(resolveCanonicalCookieClassification(name).essentiality, "unknown");
  assert.equal(resolveCanonicalCookieClassification("__cflb").category, "infrastructure");
  assert.equal(resolveCanonicalCookieClassification("lidc", { cookieDomain: "linkedin.com" }).category, "infrastructure");
});

test("provider identities are scoped and version gated independently of purposes", () => {
  for (const [name, provider] of [["aws-waf-token", "AWS WAF"], ["axeptio_cookies", "Axeptio"]]) {
    const row = resolveCanonicalCookieClassification(name!, { cookieDomain: "site.example" });
    assert.equal(row.provider?.vendor, provider); assert.ok(row.provider?.registryAttribution.serviceId);
    assert.equal(resolveCanonicalVendor({ type: "cookie", cookieName: name, hostname: "site.example" }).status, "unrecognized");
  }
  const unknown = resolveCanonicalCookieClassification("VISITOR_PRIVACY_METADATA", { cookieDomain: "youtube.com" });
  assert.equal(unknown.provider?.vendor, "YouTube"); assert.equal(unknown.category, "unknown");
});

test("old versions and action observations retain explicit, distinct interpretation versions", () => {
  const legacy = resolveCanonicalCookieKnowledge("__Secure-YNID", { purposePolicyVersion: LEGACY_COOKIE_PURPOSE_POLICY, cookieDomain: "youtube.com" });
  assert.equal(legacy.category, "personalization"); assert.equal(legacy.essentiality, "non_essential");
  assert.equal(resolveCanonicalCookieKnowledge("_dd_s").essentiality, "essential");
  assert.equal(resolveCanonicalCookieKnowledge("uid").essentiality, "non_essential");
  const action = resolveCanonicalActionStoragePurpose({ storageType: "cookie", name: "__Secure-YNID", hostname: "youtube.com" });
  assert.equal(action.purpose, "unknown"); assert.equal(action.nonEssential, false);
  assert.equal(action.purposeAssessment.version, "action_storage_purpose.v2");
  const row = resolveCanonicalCookieClassification("_ga", { cookieDomain: "site.example" });
  assert.equal(row.version, COOKIE_PURPOSE_POLICY);
  assert.equal(readCookieClassification(row, "_ga", "other.example"), null);
  assert.equal(readCookieClassification({ ...row, essentiality: "guessed" }, "_ga", "site.example"), null);
  assert.equal(readCookieClassification({ ...row, undocumentedField: true }, "_ga", "site.example"), null);
});


test("action storage proof is bound to cookie identity and cannot promote mismatched writes", () => {
  const purpose = resolveCanonicalActionStoragePurpose({ storageType: "cookie", name: "_ga", hostname: "site.example" });
  const item = { storageType: "cookie", name: "_ga", hostname: "site.example", valueHash: "a".repeat(64), ...purpose };
  assert.equal(postRefusalStorageItemSchema.safeParse(item).success, true);
  for (const patch of [{ name: "session" }, { hostname: "other.example" }, { purpose: "security" }, { nonEssential: false }, { storageType: "local_storage" }]) {
    assert.equal(postRefusalStorageItemSchema.safeParse({ ...item, ...patch }).success, false);
  }
  const write = { ...item, observedAtMs: 1000, msOffsetFromRefusal: 100, msOffsetFromAccept: 100 };
  for (const schema of [postRefusalStorageWriteSchema, postAcceptStorageWriteSchema]) {
    assert.equal(schema.safeParse(write).success, true);
    assert.equal(schema.safeParse({ ...write, name: "unrelated" }).success, false);
  }
  assert.equal(resolveCanonicalCookieClassification("a".repeat(4096)).category, "unknown");
  const posthog = resolveCanonicalCookieClassification("ph_phc_Ab123_posthog", { cookieDomain: "site.example" });
  assert.equal(posthog.category, "analytics");
  assert.equal(posthog.provider?.vendor, "PostHog");
  assert.equal(resolveCanonicalCookieClassification("ph_arbitrary_posthog").category, "unknown");
  assert.deepEqual(resolveCanonicalCookieKnowledge("3pi", { cookieDomain: "id5-sync.com", purposePolicyVersion: COOKIE_PURPOSE_POLICY }).dataTypes, ["partner-match state"]);
});
