import assert from "node:assert/strict";
import retainedX from "../../../../packages/certscore-vendor-resolver/src/test-fixtures/x-cookies-2026-10-30.json";
import retainedGoogle from "../../../../packages/certscore-vendor-resolver/src/test-fixtures/google-security-cookies-2026-10-30.json";
import retainedFundingChoices from "../../../../packages/certscore-vendor-resolver/src/test-fixtures/funding-choices-analytics-2026-10-30.json";
import test from "node:test";
import { resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge, COOKIE_PURPOSE_POLICY, LEGACY_COOKIE_PURPOSE_POLICY } from "@certscore/vendor-resolver";
import { buildRuntimeCookieInventory, isFunctionalCookieEvidenceExcludedFromTracking,
  isFunctionalCookieExcludedFromTrackingEvidence } from "./runtime-cookie-evidence";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { getGdprEprivacyRowDeduction } from "./regulatory-coverage-score";
import { buildRuntimeInventoryGroupRows } from "./runtime-inventory-projection";
import { getHybridSignalFallbackEvidence } from "./hybrid-runtime-evidence";

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

test("fresh classification of retained X writes follows the canonical storage pipeline", () => {
  for (const fixture of retainedX) {
    const c = fixture.cookie;
    const fresh = observation(c.cookieName, c.domain);
    const result = project([{ ...fresh, setMethod: c.setMethod, setAtMs: c.setAtMs }]);
    const row = result.inventory.rows[0]!;
    assert.equal(row.category, c.cookieName === "muc_ads" ? "advertising" : "personalization");
    assert.equal(row.nonEssential, true);
    assert.equal(row.cookieClassification?.version, "certscore.cookie-purpose.v11");
    assert.equal(row.setAtMs, c.setAtMs);
    assert.equal(row.setMethod, c.setMethod);
    assert.equal(result.storage.assessmentStatus, "gap_observed");
    const historical = resolveCanonicalCookieClassification(c.cookieName, { cookieDomain: c.domain }, "certscore.cookie-purpose.v8");
    const old = project([{ ...fresh, category: historical.category, essentiality: historical.essentiality,
      cookieClassification: historical, essentialityReasonCodes: ["cookie_purpose_policy:certscore.cookie-purpose.v8"] }]);
    assert.equal(old.inventory.rows[0]?.nonEssential, false);
  }
});

test("retained Google security purpose preserves unknown necessity and canonical checklist outcomes", () => {
  for (const {cookie: c} of retainedGoogle) {
    const fresh = observation(c.cookieName, c.domain);
    const result = project([fresh]);
    const oldClassification = resolveCanonicalCookieClassification(c.cookieName, {cookieDomain: c.domain}, "certscore.cookie-purpose.v9");
    const old = project([{...fresh, category: oldClassification.category, essentiality: oldClassification.essentiality,
      cookieClassification: oldClassification, essentialityReasonCodes: ["cookie_purpose_policy:certscore.cookie-purpose.v9"]}]);
    const row = result.inventory.rows[0]!;
    assert.equal(row.category, "security");
    assert.equal(row.essentiality, "unknown");
    assert.equal(row.nonEssential, false);
    assert.equal(row.cookieClassification?.unknownReason, "necessity_not_established");
    assert.equal(result.storage.assessmentStatus, old.storage.assessmentStatus);
    assert.equal(result.storage.status, old.storage.status);
    assert.equal(getGdprEprivacyRowDeduction(result.storage), getGdprEprivacyRowDeduction(old.storage));
    assert.equal(old.inventory.rows[0]?.cookiePurposePolicyVersion, "certscore.cookie-purpose.v9");
  }
});

test("historical classification cannot bypass the required policy marker", () => {
  const c = resolveCanonicalCookieClassification("__eoi", {cookieDomain: "example.test"}, "certscore.cookie-purpose.v9");
  const row = project([{cookieName: c.cookieName, domain: c.cookieDomain, cookieClassification: c}]).inventory.rows[0]!;
  assert.equal(row.cookieClassification, null);
  assert.equal(row.essentiality, "unknown");
});

test("retained Funding Choices snapshots acquire purpose without acquiring cookie-write evidence", () => {
  for (const {cookie: c} of retainedFundingChoices) {
    const classified = resolveCanonicalCookieClassification(c.cookieName, {cookieDomain: c.domain});
    const row = project([{...c, category: classified.category, essentiality: classified.essentiality, cookieClassification: classified,
      essentialityReasonCodes: [`cookie_purpose_policy:${classified.version}`]}]).inventory.rows[0]!;
    assert.equal(row.category, "analytics");
    assert.equal(row.nonEssential, true);
    assert.equal(row.setMethod, "browser_snapshot");
    assert.equal(row.setAtMs, null);
    assert.equal(row.timingEvidence, c.timingEvidence);
    assert.equal(row.explicitPreconsentEvidence, false);
    const old = resolveCanonicalCookieClassification(c.cookieName, {cookieDomain: c.domain}, "certscore.cookie-purpose.v10");
    const historicalRow = project([{...c, cookieClassification: old,
      essentialityReasonCodes: [`cookie_purpose_policy:${old.version}`]}]).inventory.rows[0]!;
    assert.equal(historicalRow.category, "unknown");
    assert.equal(historicalRow.cookiePurposePolicyVersion, "certscore.cookie-purpose.v10");
  }
});

test("a positively observed Funding Choices analytics write uses existing concern policy and weights", () => {
  // Synthetic positive control: the retained snapshots above do not prove this write.
  const fresh = project([observation("FCNEC", "example.test")]);
  const analytics = project([observation("_ga", "example.test")]);
  assert.equal(fresh.storage.assessmentStatus, "gap_observed");
  assert.equal(getGdprEprivacyRowDeduction(fresh.storage), getGdprEprivacyRowDeduction(analytics.storage));
  assert.equal(project([observation("FCCDCF", "example.test")]).inventory.rows[0]?.nonEssential, false);
});

test("legacy exclusions yield only to bound, same-version canonical purpose proof", () => {
  const row = project([observation("FCNEC", "example.test")]).inventory.rows[0]!;
  assert.equal(isFunctionalCookieEvidenceExcludedFromTracking(row), false);
  assert.equal(isFunctionalCookieExcludedFromTrackingEvidence("FCNEC", "example.test"), true);
  for (const invalid of [
    {...row, cookiePurposePolicyVersion: "certscore.cookie-purpose.v10"},
    {...row, cookiePurposePolicyVersion: undefined},
    {...row, cookieClassification: null},
    {...row, domain: "different.test"},
    {...row, cookieClassification: {...row.cookieClassification!, ruleId: "unreviewed_rule"}},
    {...row, cookieName: "OptanonConsent", cookieClassification: {...row.cookieClassification!, cookieName: "OptanonConsent"}},
  ]) assert.equal(isFunctionalCookieEvidenceExcludedFromTracking(invalid), true);
  for (const name of ["FCCDCF", "OptanonConsent", "cookieyes-consent", "__cf_bm"])
    assert.equal(isFunctionalCookieEvidenceExcludedFromTracking(project([observation(name, "example.test")]).inventory.rows[0]!), true);
});

test("canonical hybrid evidence preserves the new classification through its bounded projection", () => {
  const evidence = getHybridSignalFallbackEvidence({signalKey: "privacy.preconsent_tracking_detected",
    signalLabel: "Pre-consent tracking detected", signalValue: true,
    runtimeArtifacts: {hybrid_runtime_evidence: {cookieWriteObservations: [observation("FCNEC", "example.test")]}}});
  assert.ok(evidence);
  assert.match(JSON.stringify(evidence), /FCNEC/);
  assert.match(JSON.stringify(evidence), /google_funding_choices_analytics\.v1/);
  assert.deepEqual(evidence.preconsent_cookie_excluded_functional_names, []);
});

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
  assert.equal(row.cookieClassification?.version,"certscore.cookie-purpose.v11");
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
