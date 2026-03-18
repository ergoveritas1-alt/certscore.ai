import test from "node:test";
import assert from "node:assert/strict";
import { deriveValidationFindings } from "./pipeline";

function buildArtifacts(overrides?: {
  policyEnrichments?: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown>;
}) {
  return {
    pages: [{ page_type: "privacy_policy", page_url: "https://www.example.com/privacy", fetch_status: "ok" }],
    policyEnrichments: overrides?.policyEnrichments ?? [
      {
        id: "policy-1",
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy",
        policy_actionable_flags: ["policy_behavior_conflict_candidate"],
        policy_dsar_mechanism: "absent",
        policy_retention_periods: [],
        policy_transfer_mechanisms: [],
        policy_ambiguity_score: 42,
        policy_semantic_confidence: 0.81,
        policy_summary_short: "This policy describes analytics and disclosure posture."
      }
    ],
    policyReviewQueue: overrides?.policyReviewQueue ?? [
      {
        id: "review-1",
        policy_enrichment_id: "policy-1",
        reason: "policy_behavior_conflict_candidate",
        review_status: "pending",
        review_verdict: null,
        reviewer_notes: null,
        reviewed_at: null
      }
    ],
    preconsentViolations: [],
    runtimeArtifacts: null,
    scan: { id: "scan_123" },
    snapshot: overrides?.snapshot ?? {
      california_exposure_likely: true,
      eu_exposure_likely: true,
      wcag_contrast_failures_count: 1
    },
    trackerVendors: []
  };
}

test("deriveValidationFindings emits queue issues plus section review rows", () => {
  const findings = deriveValidationFindings(buildArtifacts());

  assert.equal(findings.length, 8);
  assert.equal(findings[0]?.ruleKey, "scan_report_review.policy_behavior_conflict_candidate");
  assert.equal(findings[0]?.category, "scan_report_review");
  assert.equal(findings[0]?.findingFamily, "policy_review_queue");
  assert.equal(findings[0]?.findingSource, "policy_review_queue");
  assert.equal(findings[0]?.title, "Possible policy-to-behavior conflict");
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_dsar_mechanism"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.missing_dsar_high_exposure"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_transfer_mechanism_noted"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.clarity_risk_42"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.confidence_81"));
  assert.ok(findings.some((finding) => finding.ruleKey === "accessibility_review.contrast_failures"));
});

test("deriveValidationFindings carries policy review evidence into the validation finding", () => {
  const findings = deriveValidationFindings(buildArtifacts());
  const finding = findings.find((item) => item.ruleKey === "scan_report_review.policy_behavior_conflict_candidate");

  assert.equal(finding?.pageUrl, "https://www.example.com/privacy");
  assert.equal(finding?.findingSubject, "disclosure");
  assert.deepEqual(finding?.evidence.policy_actionable_flags, ["policy_behavior_conflict_candidate"]);
  assert.equal(finding?.evidence.policy_review_reason, "policy_behavior_conflict_candidate");
  assert.equal(finding?.evidence.review_status, "pending");
});

test("deriveValidationFindings skips empty review reasons", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "",
          review_status: "pending"
        }
      ]
    })
  );

  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_dsar_mechanism"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "scan_report_review."));
});

test("deriveValidationFindings emits terms section review rows that match report synthesis", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "terms-1",
          page_type: "terms_of_service",
          page_url: "https://www.example.com/terms",
          policy_actionable_flags: ["llm_provider_error", "low_confidence", "session_replay_undisclosed"],
          policy_dsar_mechanism: "absent",
          policy_transfer_mechanisms: [],
          policy_retention_periods: [],
          policy_mentions: [],
          policy_ambiguity_score: 68,
          policy_semantic_confidence: 0.52,
          policy_summary_short: "Terms page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "terms-1",
          reason: "session_replay_without_disclosure_detected",
          review_status: "pending"
        },
        {
          id: "review-2",
          policy_enrichment_id: "terms-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ]
    })
  );

  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.session_replay_detected_without_disclosure"));
  assert.ok(findings.some((finding) => finding.findingFamily === "policy_section_review"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.session_replay_may_be_undisclosed"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.rule_only_row_present"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.policy_extraction_provider_error"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.low_extraction_confidence"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.clarity_risk_68"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.confidence_52"));
});

test("deriveValidationFindings does not emit provider or extraction-confidence review rows for privacy pages", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["llm_provider_error", "low_confidence", "session_replay_undisclosed"],
          policy_dsar_mechanism: "absent",
          policy_transfer_mechanisms: [],
          policy_retention_periods: [],
          policy_ambiguity_score: 68,
          policy_semantic_confidence: 0.66,
          policy_summary_short: "Privacy page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "session_replay_without_disclosure_detected",
          review_status: "pending"
        }
      ]
    })
  );

  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_dsar_mechanism"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.session_replay_detected_without_disclosure"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.confidence_66"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.session_replay_may_be_undisclosed"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.policy_extraction_provider_error"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.low_extraction_confidence"));
});
