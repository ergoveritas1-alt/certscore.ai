import assert from "node:assert/strict";
import test from "node:test";
import { SCORING_RULES, SCORING_FAMILIES, scoringRuleDescription } from "./scoring-policy";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
const gap = (id: string, retainedEvidence = {}) => ({ id, assessmentStatus: "gap_observed" as const, evidenceState: "observed" as const, status: "Gap observed", criticalEvidence: { retainedEvidence } });
test("approved registry has exactly the reviewed rows and caps", () => {
  assert.equal(SCORING_RULES.length, 17);
  assert.equal(new Set(SCORING_RULES.map(rule => rule.id)).size, 17);
  assert.deepEqual(Object.fromEntries(Object.entries(SCORING_FAMILIES).map(([id, family]) => [id, family.cap])), {
    pre_consent_storage: 40, pre_consent_tracking: 40, consent_controls: 22, post_refusal_enforcement: 15,
    sensitive_runtime: 25, tracking_technology: 25, embedded_third_party: 20, policy_transparency: 12, transport_security: 20, gpc: 15,
  });
  assert.equal(SCORING_RULES.filter(rule => rule.siteWide).length, 8);
  for (const rule of SCORING_RULES.filter(rule => rule.identity)) {
    assert.match(scoringRuleDescription(rule), /First .* · second: 4 · each additional:/);
  }
});
test("removed deductions remain neutral even for confirmed gaps", () => {
  const result = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [
    "accessibility_consent_controls", "consent_choice_quality", "preference_withdrawal_control", "cross_border_endpoint_review",
  ].map(id => gap(id)) });
  assert.equal(result.score, 100);
});
test("combined deductions stop at zero", () => {
  const result = deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [
    gap("pre_consent_cookies_storage", { preConsentStorageAssessment: { classifiedNonEssentialCount: 100 } }),
    gap("pre_consent_third_party_tracking", { preconsentThirdPartyTrackingVendors: Array.from({ length: 100 }, (_, i) => `Vendor ${i}`) }),
    gap("post_reject_tracking_reduction"), gap("reject_all_path_availability"), gap("privacy_notice_availability"),
  ] });
  assert.equal(result.score, 0);
});
