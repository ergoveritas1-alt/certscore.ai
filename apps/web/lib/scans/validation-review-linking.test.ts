import assert from "node:assert/strict";
import test from "node:test";
import {
  buildValidationFindingLookup,
  findValidationFindingForKeys,
  getValidationMatchKeysForReviewReason,
  getValidationMatchKeysForTitle,
  type ScanValidationFinding
} from "./validation-review-linking";

function makeFinding(input: Partial<ScanValidationFinding> & Pick<ScanValidationFinding, "id" | "ruleKey" | "title">): ScanValidationFinding {
  return {
    agreementScore: null,
    category: null,
    description: null,
    evidence: null,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    model: null,
    modelConfidence: null,
    pageUrl: null,
    promptVersion: null,
    rationale: null,
    severity: null,
    subtype: null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    verdict: null,
    ...input
  };
}

test("buildValidationFindingLookup keeps the highest-confidence finding for a rule key", () => {
  const lookup = buildValidationFindingLookup([
    makeFinding({ id: "a", ruleKey: "privacy.trackers_before_consent_detected", title: "First", systemConfidenceScore: 0.42 }),
    makeFinding({ id: "b", ruleKey: "privacy.trackers_before_consent_detected", title: "Second", systemConfidenceScore: 0.88 })
  ]);

  assert.equal(lookup.get("privacy.trackers_before_consent_detected")?.id, "b");
});

test("findValidationFindingForKeys returns the first matched rule key", () => {
  const finding = makeFinding({
    id: "c",
    ruleKey: "privacy.session_replay_without_disclosure_detected",
    title: "Session replay without disclosure"
  });
  const lookup = buildValidationFindingLookup([finding]);

  assert.equal(
    findValidationFindingForKeys(lookup, ["privacy.trackers_before_consent_detected", "privacy.session_replay_without_disclosure_detected"])?.id,
    "c"
  );
});

test("getValidationMatchKeysForTitle maps low-confidence extraction title variants", () => {
  assert.deepEqual(getValidationMatchKeysForTitle("Low-confidence policy extraction"), [
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Low-confidence extraction Privacy Policy"), [
    "policy_review.low_confidence_critical_fields.privacy_policy",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ]);
});

test("getValidationMatchKeysForReviewReason maps scan review reasons directly to validation rule keys", () => {
  assert.deepEqual(getValidationMatchKeysForReviewReason("low_confidence_critical_fields"), [
    "policy_review.low_confidence_critical_fields.cookie_policy",
    "policy_review.low_confidence_critical_fields.privacy_policy",
    "policy_review.low_confidence_critical_fields.terms_of_service",
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ]);
});

test("getValidationMatchKeysForTitle maps current scan-signal and snapshot finding titles", () => {
  assert.deepEqual(getValidationMatchKeysForTitle("Functional misalignment"), [
    "scan_signal.privacy.policy_runtime_functional_misalignment_detected"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Critical user-rights fulfillment friction"), [
    "scan_signal.privacy.user_rights_friction_score"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Disclosure likely obstructed"), [
    "scan_signal.disclosure.policy_runtime_disclosure_likely_obstructed"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Accessibility risk score"), [
    "scan_snapshot.accessibility.accessibility_risk_score"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Possible pre-consent tracking signals on first load"), [
    "privacy.trackers_before_consent_detected"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Reject path may not fully suppress non-essential activity"), [
    "privacy.trackers_persist_after_reject_detected"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Reject path appears less direct than accept path"), [
    "privacy.reject_control_missing_detected"
  ]);
  assert.deepEqual(getValidationMatchKeysForTitle("Browser-level privacy signal effect not evident"), [
    "privacy.gpc_signal_not_honored"
  ]);
});
