import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge, COOKIE_PURPOSE_POLICY, LEGACY_COOKIE_PURPOSE_POLICY } from "@certscore/vendor-resolver";
import { buildRuntimeCookieInventory } from "./runtime-cookie-evidence";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { getGdprEprivacyRowDeduction } from "./regulatory-coverage-score";
import { buildRuntimeInventoryGroupRows } from "./runtime-inventory-projection";

function observation(name: string, domain: string, legacy = false) {
  const version = legacy ? LEGACY_COOKIE_PURPOSE_POLICY : COOKIE_PURPOSE_POLICY;
  const knowledge = resolveCanonicalCookieKnowledge(name, { cookieDomain: domain, purposePolicyVersion: version });
  return { cookieName: name, domain, cookiePath: "/", category: knowledge.category, essentiality: knowledge.essentiality,
    beforeConsent: true, setMethod: "set_cookie_header", setAtMs: 1000, description: knowledge.description,
    essentialityReasonCodes: [`cookie_purpose_policy:${version}`],
    ...(!legacy ? { cookieClassification: resolveCanonicalCookieClassification(name, { cookieDomain: domain }) } : {}) };
}
function project(observations: Record<string, unknown>[]) {
  const hybridRuntimeEvidence = { cookieWriteObservations: observations, storageSummary: { distinctPreConsentCookieCount: new Set(observations.map(row => JSON.stringify([row.cookieName, row.domain, row.cookiePath]))).size } };
  const runtimeArtifacts = { hybridRuntimeEvidence };
  const normalizedConcerns = buildNormalizedConcerns({ runtimeArtifacts, reviewFindingCandidates: [], validationFindings: [] });
  const coverageOutcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts, normalizedConcerns, scanCompleted: true, coverageLimited: false });
  const checklist = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes, scanCompleted: true, coverageLimited: false, projectedFindings: [], unifiedFindings: [] });
  return { inventory: buildRuntimeCookieInventory({ runtimeArtifacts }),
    storage: checklist.find(row => row.id === "pre_consent_cookies_storage")! };
}

test("versioned purpose changes flow through concern policy and checklist into unchanged score weights", () => {
  const names = ["__Secure-YNID", "VISITOR_INFO1_LIVE", "__Secure-ROLLOUT_TOKEN", "_ga", "_ga_example"];
  const rows = (legacy: boolean) => names.map(name => observation(name, name.startsWith("_ga") ? "deepmind.google" : "youtube.com", legacy));
  const old = rows(true), saved = structuredClone(old);
  assert.equal(getGdprEprivacyRowDeduction(project(old).storage), 18);
  assert.equal(getGdprEprivacyRowDeduction(project(rows(false)).storage), 14);
  assert.deepEqual(old, saved);
  assert.equal(getGdprEprivacyRowDeduction(project(old).storage), 18);
  for (const name of ["uid", "llama_dev_csrf", "GCLB", "_dd_s_v2", "gb_anon_id"]) {
    const result = project([observation(name, "example.com")]);
    assert.equal(result.storage.assessmentStatus, "review_signal", name);
    assert.equal(getGdprEprivacyRowDeduction(result.storage), 8, "unknown-only review remains eight points");
  }
});

test("retained provider and cookie purpose win without claiming the website controller", () => {
  const result = project([observation("__cflb", "site.example"), observation("aws-waf-token", "site.example"),
    observation("axeptio_cookies", "site.example"), observation("VISITOR_INFO1_LIVE", "youtube.com")]);
  const groups = buildRuntimeInventoryGroupRows({ cookieRows: result.inventory.rows, trackerRows: [], firstPartyDomain: "site.example" });
  const cookie = (name: string) => groups.find(row => row.cookieNames.includes(name))!;
  assert.equal(cookie("__cflb").purpose, "Infrastructure");
  assert.equal(cookie("aws-waf-token").vendor, "AWS WAF");
  assert.equal(cookie("axeptio_cookies").vendor, "Axeptio");
  assert.equal(cookie("VISITOR_INFO1_LIVE").vendor, "YouTube");
  assert.equal(cookie("VISITOR_INFO1_LIVE").purpose, "Unknown");
  assert.ok(groups.every(row => row.controllerEntity === null));
});

test("malformed, conflicting or unbound v3 proof cannot regain legacy cookie guesses", () => {
  const valid = observation("VISITOR_INFO1_LIVE", "youtube.com");
  for (const row of [
    { ...valid, cookieClassification: undefined },
    { ...valid, domain: "unrelated.example" },
    { ...valid, essentiality: "non_essential", category: "personalization" },
    { ...valid, essentialityReasonCodes: [`cookie_purpose_policy:${COOKIE_PURPOSE_POLICY}`, `cookie_purpose_policy:${LEGACY_COOKIE_PURPOSE_POLICY}`] },
  ]) {
    const result = project([row]);
    assert.equal(result.inventory.rows[0]?.nonEssential, false);
    assert.equal(result.inventory.rows[0]?.category, "unknown");
    assert.equal(result.inventory.rows[0]?.cookieClassification, null);
  }
  const merged = project([valid, observation("VISITOR_INFO1_LIVE", "youtube.com", true)]);
  assert.equal(merged.inventory.rows[0]?.essentiality, "unknown");
});


test("conflicting retained providers cannot win by observation order or change purpose", () => {
  const original = observation("aws-waf-token", "site.example");
  const conflicting = structuredClone(original);
  conflicting.cookieClassification!.provider!.registryAttribution.serviceId = "svc_000000000000";
  for (const rows of [[original, conflicting, original], [conflicting, original]]) {
    const result = project(rows);
    assert.equal(result.inventory.rows[0]?.cookieClassification?.provider, null);
    assert.equal(result.inventory.rows[0]?.essentiality, "essential");
    assert.equal(getGdprEprivacyRowDeduction(result.storage), 0);
  }
});

test("v8 unknown categories reach the canonical inventory while v7 bindings stay historical",()=>{
 for(const [name,domain] of [["UID","scorecardresearch.com"],["MUID","bing.com"],["bcookie","linkedin.com"]]){
  const input=observation(name!,domain!);const result=project([input]);const row=result.inventory.rows[0]!;
  assert.equal(row.cookieClassification?.version,"certscore.cookie-purpose.v8");
  assert.ok(row.essentialityReasonCodes?.includes(`cookie_purpose_unknown:${input.cookieClassification!.unknownReason}`));
  assert.equal(row.nonEssential,false);
 }
 const old=observation("bcookie","linkedin.com");old.cookieClassification=resolveCanonicalCookieClassification("bcookie",{cookieDomain:"linkedin.com"},"certscore.cookie-purpose.v7");old.category=old.cookieClassification.category;old.essentiality=old.cookieClassification.essentiality;old.essentialityReasonCodes=["cookie_purpose_policy:certscore.cookie-purpose.v7"];
 const row=project([old]).inventory.rows[0]!;assert.equal(row.cookieClassification?.version,"certscore.cookie-purpose.v7");assert.equal(row.category,"unknown");assert.ok(!row.essentialityReasonCodes?.some(code=>code.startsWith("cookie_purpose_unknown:")));
 const mixed=project([old,observation("bcookie","linkedin.com")]).inventory.rows[0]!;assert.equal(mixed.cookieClassification,null);assert.equal(mixed.nonEssential,false);
 const older={...old,cookieClassification:resolveCanonicalCookieClassification("bcookie",{cookieDomain:"linkedin.com"},"certscore.cookie-purpose.v6"),essentialityReasonCodes:["cookie_purpose_policy:certscore.cookie-purpose.v6"]};
 const neutral=project([older]).inventory.rows[0]!;assert.equal(neutral.cookieClassification,null);assert.equal(neutral.cookiePurposePolicyVersion,"certscore.cookie-purpose.v7");
 const fresh=observation("_cc_aud","crwdcntrl.net");assert.equal(project([fresh]).inventory.rows[0]?.nonEssential,true);
 // A new marker cannot validate an old classification or vice versa.
 assert.equal(project([{...old,essentialityReasonCodes:["cookie_purpose_policy:certscore.cookie-purpose.v8"]}]).inventory.rows[0]?.cookieClassification,null);
});
