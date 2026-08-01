import assert from "node:assert/strict";
import test from "node:test";
import { projectCanonicalSurfaceSummary } from "./canonical-surface-summary";

const canonicalPersistedFixture = {
  certscore_overall: 72,
  cmp_vendor_name: "Example CMP",
  consent_accept_observed: true,
  consent_evidence_status: "verified",
  consent_options_observed: true,
  consent_reject_observed: true,
  privacy_policy_present: true,
  top_finding_count: 1
};

test("canonical persisted summary wins consistently over stale downstream fallbacks", () => {
  const summary = projectCanonicalSurfaceSummary({
    fallbackScoreAssessment: { scoreValue: 41 },
    noGo: false,
    snapshot: canonicalPersistedFixture
  });

  assert.deepEqual(summary, {
    cmpVendorName: "Example CMP",
    consentAro: { accept: true, reject: true, options: true },
    privacyPolicyPresent: true,
    score: 72,
    topFindingCount: 1
  });
});

test("canonical summary uses a versioned assessment only when persisted score is absent", () => {
  const summary = projectCanonicalSurfaceSummary({
    fallbackScoreAssessment: { scoreValue: 64 },
    noGo: false,
    snapshot: { ...canonicalPersistedFixture, certscore_overall: null }
  });

  assert.equal(summary.score, 64);
  assert.equal(summary.topFindingCount, 1);
});

test("canonical summary fails closed for no-go and withheld scans", () => {
  assert.deepEqual(projectCanonicalSurfaceSummary({
    fallbackScoreAssessment: { scoreValue: 64 },
    noGo: true,
    snapshot: canonicalPersistedFixture
  }), {
    cmpVendorName: null,
    consentAro: null,
    privacyPolicyPresent: null,
    score: null,
    topFindingCount: null
  });

  const withheld = projectCanonicalSurfaceSummary({
    fallbackScoreAssessment: { scoreValue: null },
    noGo: false,
    snapshot: { ...canonicalPersistedFixture, certscore_overall: null }
  });
  assert.equal(withheld.score, null);
  assert.equal(withheld.topFindingCount, null);
});
