import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNanoDocCandidateUrls,
  dedupeNanoDocumentSources,
  deriveValidationFindings,
  determineValidationCollectAction,
  looksLikeIntermediaryOrBlockPage,
  prioritizePendingNanoDocumentSources
} from "./pipeline";

function buildArtifacts(overrides?: {
  documentSources?: Array<Record<string, unknown>>;
  pageEvidence?: Array<Record<string, unknown>>;
  policyEnrichments?: Array<Record<string, unknown>>;
  policySemanticInputs?: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  preferDocumentSources?: boolean;
  runtimeArtifacts?: Record<string, unknown> | null;
  signalHits?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown>;
}) {
  return {
    documentSources: overrides?.documentSources ?? [],
    pageEvidence: overrides?.pageEvidence ?? [],
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
    policySemanticInputs: overrides?.policySemanticInputs,
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
    preferDocumentSources: overrides?.preferDocumentSources ?? false,
    runtimeArtifacts: overrides?.runtimeArtifacts ?? null,
    scan: { id: "scan_123" },
    signalHits: overrides?.signalHits ?? [],
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

test("looksLikeIntermediaryOrBlockPage rejects obvious login and checkout interstitial pages", () => {
  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://vercel.com/login?next=%2Fprivacy-policy",
      text: "Log in to continue to Vercel.",
      title: "Login - Vercel"
    }),
    true
  );

  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://www.patagonia.com/privacy-policy",
      text: "Hang Tight! Routing to checkout...",
      title: "Hang Tight! Routing to checkout..."
    }),
    true
  );

  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://stripe.com/privacy",
      text: "This Privacy Policy describes how we handle personal data.",
      title: "Privacy Policy"
    }),
    false
  );
});

test("dedupeNanoDocumentSources keeps one row per canonical url and document type", () => {
  const rows = dedupeNanoDocumentSources([
    {
      canonical_url: "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
      document_type: "privacy_policy",
      source_url: "https://target.com/privacy"
    },
    {
      canonical_url: "https://www.target.com/c/target-privacy-policy/-/N-4sr7p",
      document_type: "privacy_policy",
      source_url: "https://target.com/privacy-policy"
    },
    {
      canonical_url: "https://www.target.com/c/terms-conditions/-/N-4sr7l",
      document_type: "terms_of_service",
      source_url: "https://target.com/terms"
    }
  ]);

  assert.equal(rows.length, 2);
  assert.ok(
    rows.some(
      (row) =>
        row.canonical_url === "https://www.target.com/c/target-privacy-policy/-/N-4sr7p" &&
        row.document_type === "privacy_policy"
    )
  );
  assert.ok(
    rows.some(
      (row) =>
        row.canonical_url === "https://www.target.com/c/terms-conditions/-/N-4sr7l" &&
        row.document_type === "terms_of_service"
    )
  );
});

test("dedupeNanoDocumentSources prefers ready rows over rejected duplicates", () => {
  const rows = dedupeNanoDocumentSources([
    {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      extraction_status: "failed",
      source_status: "rejected",
      source_url: "https://example.com/privacy"
    },
    {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      extraction_status: "pending",
      source_status: "ready",
      source_url: "https://example.com/privacy-policy"
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source_status, "ready");
  assert.equal(rows[0]?.extraction_status, "pending");
});

test("buildNanoDocCandidateUrls prioritizes discovered and canonical seed legal urls first", () => {
  const candidates = buildNanoDocCandidateUrls({
    domainHostname: "example.com",
    pages: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-center"
      }
    ]
  });

  assert.deepEqual(candidates[0], {
    documentType: "privacy_policy",
    priorityTier: "priority",
    url: "https://www.example.com/privacy-center"
  });
  assert.equal(candidates.findIndex((candidate) => candidate.url === "https://example.com/privacy"), 1);
  assert.equal(candidates.findIndex((candidate) => candidate.url === "https://example.com/privacy-policy"), 2);
  assert.equal(
    candidates.find((candidate) => candidate.url === "https://example.com/terms")?.priorityTier,
    "priority"
  );

  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.url === "https://example.com/legal/privacy-policy" &&
        candidate.priorityTier === "secondary"
    )
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.url === "https://example.com/cookie-policy" &&
        candidate.priorityTier === "priority"
    )
  );
});

test("prioritizePendingNanoDocumentSources prefers priority privacy docs before secondary terms docs", () => {
  const prioritized = prioritizePendingNanoDocumentSources([
    {
      canonical_url: "https://example.com/terms",
      document_type: "terms_of_service",
      metadata_json: { priority_tier: "secondary" }
    },
    {
      canonical_url: "https://example.com/privacy",
      document_type: "privacy_policy",
      metadata_json: { priority_tier: "priority" }
    },
    {
      canonical_url: "https://example.com/cookies",
      document_type: "cookie_policy",
      metadata_json: { priority_tier: "priority" }
    }
  ]);

  assert.deepEqual(
    prioritized.map((row) => row.canonical_url),
    [
      "https://example.com/privacy",
      "https://example.com/cookies",
      "https://example.com/terms"
    ]
  );
});

test("deriveValidationFindings emits pilot financial review rows from retained signal evidence", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-1",
          matched_text: "A monthly fee of $25 applies to premium managed accounts.",
          metadata: {
            surroundingHeading: "Pricing"
          },
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/pricing"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-1"],
          id: "sig-1",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/pricing",
          payload: {
            matchedTerm: "monthly fee"
          },
          signal_key: "commercial.explicit_fee_disclosure_text_present"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "financial_review.fee_disclosure_present");
  assert.ok(finding);
  assert.equal(finding?.title, "Fee disclosure present");
  assert.equal(finding?.pageUrl, "https://www.example.com/pricing");
  assert.equal(finding?.evidence.pageClassification, "pricing_or_fees");
  assert.equal(finding?.evidence.matchedPhrase, "monthly fee");
  assert.deepEqual(finding?.evidence.policySnippets, ["A monthly fee of $25 applies to premium managed accounts."]);
  assert.deepEqual(finding?.evidence.supportingSignals, ["commercial.explicit_fee_disclosure_text_present"]);
  assert.equal(finding?.evidence.unifiedFindingId, "fee_disclosure_present");
});

test("validation collect hands off queued and running scans to WS01 execution", () => {
  assert.equal(determineValidationCollectAction("queued"), "wait_for_scan");
  assert.equal(determineValidationCollectAction("running"), "wait_for_completion");
  assert.equal(determineValidationCollectAction("processing"), "wait_for_completion");
  assert.equal(determineValidationCollectAction("completed"), "rank");
  assert.equal(determineValidationCollectAction("failed"), "fail");
  assert.equal(determineValidationCollectAction(null), "unexpected");
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

test("deriveValidationFindings prefers document-source policy semantics when available", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_ambiguity_score: 12,
          policy_semantic_confidence: 0.41,
          policy_summary_short: "Thin fallback policy row."
        }
      ],
      policySemanticInputs: [
        {
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["low_confidence"],
          policy_ambiguity_score: 71,
          policy_semantic_confidence: 0.83,
          policy_summary_short: "Document-source semantic row."
        }
      ],
      preferDocumentSources: true
    })
  );

  const reviewFinding = findings.find((item) => item.ruleKey === "scan_report_review.policy_behavior_conflict_candidate");
  assert.equal(reviewFinding?.evidence.policy_ambiguity_score, 71);
  assert.equal(reviewFinding?.evidence.policy_semantic_confidence, 0.83);
  assert.equal(reviewFinding?.evidence.policy_summary_short, "Document-source semantic row.");
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
          policy_actionable_flags: [
            "llm_provider_error",
            "low_confidence",
            "session_replay_undisclosed",
            "session_replay_vendor_artifact_present"
          ],
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
  assert.ok(findings.some((finding) => finding.findingFamily === "section_review"));
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

test("deriveValidationFindings keeps low-confidence privacy DSAR gaps audit-only while allowing replay findings with concrete artifacts", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [
            "llm_provider_error",
            "low_confidence",
            "session_replay_undisclosed",
            "session_replay_vendor_artifact_present"
          ],
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

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_dsar_mechanism"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.session_replay_detected_without_disclosure"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.confidence_66"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.session_replay_may_be_undisclosed"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.policy_extraction_provider_error"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.low_extraction_confidence"));
});

test("deriveValidationFindings suppresses replay disclosure findings without concrete runtime artifacts", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["session_replay_undisclosed"],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: [],
          policy_retention_periods: [],
          policy_ambiguity_score: 22,
          policy_semantic_confidence: 0.81,
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

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.session_replay_detected_without_disclosure"));
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

test("hybrid runtime cookie observations drive cookie disclosure matching before legacy cookie fields", () => {
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
        initial_cookie_names: ["legacy_cookie_should_not_win"],
        hybrid_runtime_evidence: {
          cookieWriteObservations: [{ cookieName: "_ga" }]
        }
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.disclosure_gap"));
});
