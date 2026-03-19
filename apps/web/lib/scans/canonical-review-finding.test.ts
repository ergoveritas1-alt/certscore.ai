import assert from "node:assert/strict";
import test from "node:test";
import { buildCanonicalReviewFindingPresentation } from "./canonical-review-finding";
import type { ScanValidationFinding } from "./validation-review-linking";

function makeLinkedFinding(input: Partial<ScanValidationFinding> & Pick<ScanValidationFinding, "id" | "ruleKey" | "title">): ScanValidationFinding {
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

test("uses rich pre-consent tracking presentation when linked validation evidence is present", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "1",
        ruleKey: "privacy.trackers_before_consent_detected",
        title: "Trackers observed before consent",
        evidence: {
          preconsent_tracker_vendors: ["Meta Pixel"]
        }
      }),
      observedValue: "Meta Pixel",
      severity: "high",
      title: "Trackers observed before consent"
    },
    []
  );

  assert.equal(presentation.findingName, "Trackers observed before consent");
  assert.match(presentation.whyThisMatters, /before a visitor can provide or deny consent/i);
  assert.match(presentation.suggestedFix, /Consent Mode v2|consent/i);
  assert.equal(presentation.suggestedBestPractice?.label, "ICO");
  assert.ok(Number(presentation.confidenceScore) >= 0.6);
});

test("uses low-confidence extraction copy when sibling runtime findings add context", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      linkedValidationFinding: makeLinkedFinding({
        id: "2",
        ruleKey: "scan_report_review.low_confidence_critical_fields",
        title: "Low-confidence policy extraction",
        evidence: {
          pageUrl: "https://jili58d.com/privacy",
          policy_ambiguity_score: 90,
          policy_snippet_count: 0,
          policy_structurally_weak: true
        }
      }),
      observedValue: "medium severity",
      severity: "medium",
      title: "Low-confidence policy extraction"
    },
    [
      {
        linkedValidationFinding: makeLinkedFinding({
          id: "3",
          ruleKey: "policy_runtime.missing_technical_disclosure",
          title: "Missing technical disclosure"
        }),
        observedValue: "Privacy Policy",
        severity: "high",
        title: "Missing technical disclosure"
      }
    ]
  );

  assert.match(presentation.whyThisMatters, /could not extract critical disclosure fields/i);
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.ok(Number(presentation.confidenceScore) >= 0.95);
});

test("uses low-confidence extraction copy for policy extraction title without linked validation finding", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      evidence: ["https://jili58d.com/privacy"],
      observedValue: "Privacy Policy",
      severity: "medium",
      title: "Low-confidence policy extraction"
    },
    []
  );

  assert.match(presentation.whyThisMatters, /could not extract critical disclosure fields/i);
  assert.match(presentation.suggestedFix, /manual technical review/i);
  assert.equal(presentation.suggestedBestPractice?.label, "W3C");
  assert.equal(presentation.confidenceScore, "0.55");
});

test("falls back to generic presentation for unmatched findings without linked validation data", () => {
  const presentation = buildCanonicalReviewFindingPresentation(
    {
      evidence: ["https://example.com/privacy"],
      observedValue: "medium severity",
      severity: "medium",
      title: "Unexpected disclosure concern"
    },
    []
  );

  assert.equal(presentation.findingName, "Unexpected disclosure concern");
  assert.match(presentation.whyThisMatters, /merit reviewer attention/i);
  assert.match(presentation.suggestedFix, /confirm whether the signal needs follow-up/i);
  assert.equal(presentation.confidenceScore, "0.55");
});
