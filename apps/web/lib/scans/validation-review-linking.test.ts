import assert from "node:assert/strict";
import test from "node:test";
import {
  buildValidationFindingLookup,
  findValidationFindingForKeys,
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
    "section_review.low_confidence_critical_fields",
    "scan_report_review.low_confidence_critical_fields"
  ]);
});
