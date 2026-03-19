import test from "node:test";
import assert from "node:assert/strict";
import { deriveValidationFindings } from "./pipeline";

function buildArtifacts(overrides?: {
  policyEnrichments?: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  runtimeArtifacts?: Record<string, unknown> | null;
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
    runtimeArtifacts: overrides?.runtimeArtifacts ?? null,
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
          policy_coverage_ratio: 0.33,
          policy_field_coverage: {
            effective_date: { confidence: 0.52, found: true, snippetHash: "hash-1" },
            governing_law: { confidence: 0.48, found: true, snippetHash: "hash-2" }
          },
          policy_notice_contact_present: false,
          policy_snippet_count: 2,
          policy_structurally_weak: true,
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
  assert.ok(findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"));
});

test("terms low confidence plus friction score synthesizes functional misalignment with coverage evidence", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "terms-1",
          page_type: "terms_of_service",
          page_url: "https://www.example.com/terms",
          policy_actionable_flags: ["low_confidence"],
          policy_coverage_ratio: 0.33,
          policy_field_coverage: {
            effective_date: { confidence: 0.52, found: true, snippetHash: "hash-1" },
            governing_law: { confidence: 0.41, found: true, snippetHash: "hash-2" },
            arbitration: { confidence: null, found: false, snippetHash: null }
          },
          policy_notice_contact_present: false,
          policy_semantic_confidence: 0.52,
          policy_snippet_count: 2,
          policy_structurally_weak: true,
          policy_summary_short: "Terms page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "terms-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      snapshot: {
        user_rights_friction_score: 100
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "policy_runtime.functional_misalignment");
  assert.ok(finding);
  assert.equal(finding?.evidence.policy_coverage_ratio, 0.33);
  assert.equal(finding?.evidence.policy_structurally_weak, true);
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

test("low confidence policy extraction alone does not synthesize stronger runtime findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: ["scc"],
          policy_retention_periods: ["30 days"],
          policy_mentions: ["privacy_rights"],
          policy_ambiguity_score: 12,
          policy_semantic_confidence: 0.78,
          policy_summary_short: "Privacy page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      snapshot: {
        california_exposure_likely: false,
        eu_exposure_likely: false
      }
    })
  );

  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.functional_misalignment"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.missing_technical_disclosure"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"));
});

test("low confidence extraction plus friction score 100 synthesizes functional misalignment", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: ["scc"],
          policy_retention_periods: ["30 days"],
          policy_mentions: ["privacy_rights"],
          policy_ambiguity_score: 42,
          policy_semantic_confidence: 0.78,
          policy_summary_short: "Privacy page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      snapshot: {
        user_rights_friction_score: 100
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "policy_runtime.functional_misalignment");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.findingFamily, "policy_runtime_review");
  assert.equal(finding?.evidence.user_rights_friction_score, 100);
});

test("low confidence extraction plus retargeting pixel synthesizes missing technical disclosure", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: ["scc"],
          policy_retention_periods: ["30 days"],
          policy_mentions: ["privacy_rights"],
          policy_ambiguity_score: 42,
          policy_semantic_confidence: 0.78,
          policy_summary_short: "Privacy page."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      snapshot: {
        retargeting_pixel_detected: true
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "policy_runtime.missing_technical_disclosure");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.evidence.retargeting_pixel_detected, true);
});

test("low confidence extraction with multiple triggers synthesizes distinct runtime findings without duplicates", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["llm_provider_error"],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: ["scc"],
          policy_retention_periods: ["30 days"],
          policy_mentions: [],
          policy_ambiguity_score: 42,
          policy_semantic_confidence: 0.52,
          policy_summary_short: ""
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "policy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        },
        {
          id: "review-2",
          policy_enrichment_id: "policy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      snapshot: {
        retargeting_pixel_detected: true,
        user_rights_friction_score: 100
      }
    })
  );

  assert.equal(findings.filter((item) => item.ruleKey === "policy_runtime.functional_misalignment").length, 1);
  assert.equal(findings.filter((item) => item.ruleKey === "policy_runtime.missing_technical_disclosure").length, 1);
  assert.equal(findings.filter((item) => item.ruleKey === "policy_runtime.disclosure_likely_obstructed").length, 1);
});

test("cookie runtime exact match does not trigger a disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.9,
          policy_cookie_disclosures: [
            {
              confidence: 0.95,
              cookie_name: "_ga",
              provider: "Google Analytics",
              purpose: "Analytics",
              duration: "2 years",
              snippet_hash: "hash-1"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_ga"]
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "cookie_runtime.disclosure_gap"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "cookie_runtime.cookie_policy_obstructed"));
});

test("undisclosed runtime cookie triggers cookie disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.92,
          policy_cookie_disclosures: [
            {
              confidence: 0.93,
              cookie_name: "_fbp",
              provider: "Meta",
              purpose: "Advertising",
              duration: "90 days",
              snippet_hash: "hash-1"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_ga"]
      } as Record<string, unknown>
    })
  );

  const finding = findings.find((item) => item.ruleKey === "cookie_runtime.disclosure_gap");
  assert.ok(finding);
  assert.equal(finding?.findingFamily, "cookie_runtime_review");
  assert.deepEqual(finding?.evidence.unmatched_cookie_names, ["_ga"]);
  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.cookie_policy_obstructed"));
});

test("weak cookie policy structure triggers cookie policy obstructed instead of a disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: ["low_confidence"],
          policy_semantic_confidence: 0.42,
          policy_cookie_disclosures: []
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_ga"]
      } as Record<string, unknown>
    })
  );

  const finding = findings.find((item) => item.ruleKey === "cookie_runtime.cookie_policy_obstructed");
  assert.ok(finding);
  assert.equal(finding?.severity, "medium");
  assert.equal(finding?.findingFamily, "cookie_runtime_review");
  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.disclosure_gap"));
});

test("duplicate runtime cookies and prefix overlaps do not create duplicate cookie disclosure findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.9,
          policy_cookie_disclosures: [
            {
              confidence: 0.95,
              cookie_name: "_ga",
              provider: "Google Analytics",
              purpose: "Analytics",
              duration: "2 years",
              snippet_hash: "hash-1"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_ga", "_ga_123", "_ga", "_custom_tracker"]
      } as Record<string, unknown>
    })
  );

  assert.equal(findings.filter((item) => item.ruleKey === "cookie_runtime.disclosure_gap").length, 1);
  const finding = findings.find((item) => item.ruleKey === "cookie_runtime.disclosure_gap");
  assert.deepEqual(finding?.evidence.unmatched_cookie_names, ["_custom_tracker"]);
});
