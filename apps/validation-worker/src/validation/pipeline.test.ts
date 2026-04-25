import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNanoDocumentContentHash,
  buildNanoDocCandidateUrls,
  dedupeNanoDocumentSources,
  deriveUnifiedFindingsWithWorkflowEvents,
  deriveValidationFindings,
  determineValidationCollectAction,
  getNanoDocumentSourceDedupKeys,
  isolateLikelyLegalDocumentText,
  looksLikeIntermediaryOrBlockPage,
  promoteSectionFinancialReviewFindings,
  prioritizePendingNanoDocumentSources,
  resolveReusableNanoDocumentExtractions,
  selectNanoDocCandidates,
  selectPendingNanoDocumentSourcesForExtraction,
  shouldQueueNanoDocumentSourceForExtraction
} from "./pipeline";

function buildArtifacts(overrides?: {
  documentSources?: Array<Record<string, unknown>>;
  pageEvidence?: Array<Record<string, unknown>>;
  pages?: Array<Record<string, unknown>>;
  policyEnrichments?: Array<Record<string, unknown>>;
  policySemanticInputs?: Array<Record<string, unknown>>;
  policyReviewQueue?: Array<Record<string, unknown>>;
  preconsentViolations?: Array<Record<string, unknown>>;
  preferDocumentSources?: boolean;
  runtimeArtifacts?: Record<string, unknown> | null;
  signalHits?: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown>;
  trackerVendors?: Array<Record<string, unknown>>;
}) {
  return {
    documentSources: overrides?.documentSources ?? [],
    pageEvidence: overrides?.pageEvidence ?? [],
    pages: overrides?.pages ?? [{ page_type: "privacy_policy", page_url: "https://www.example.com/privacy", fetch_status: "ok" }],
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
    preconsentViolations: overrides?.preconsentViolations ?? [],
    preferDocumentSources: overrides?.preferDocumentSources ?? false,
    runtimeArtifacts: overrides?.runtimeArtifacts ?? null,
    scan: { id: "scan_123" },
    signalHits: overrides?.signalHits ?? [],
    snapshot: overrides?.snapshot ?? {
      california_exposure_likely: true,
      eu_exposure_likely: true,
      wcag_contrast_failures_count: 1
    },
    trackerVendors: overrides?.trackerVendors ?? []
  };
}

test("deriveValidationFindings emits queue issues plus section review rows", () => {
  const findings = deriveValidationFindings(buildArtifacts());

  assert.equal(findings.length, 5);
  assert.equal(findings[0]?.ruleKey, "scan_report_review.policy_behavior_conflict_candidate");
  assert.equal(findings[0]?.category, "scan_report_review");
  assert.equal(findings[0]?.findingFamily, "policy_review_queue");
  assert.equal(findings[0]?.findingSource, "policy_review_queue");
  assert.equal(findings[0]?.title, "Possible policy-to-behavior conflict");
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_dsar_mechanism"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.missing_dsar_high_exposure"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_transfer_mechanism_noted"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.clarity_risk_42"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.confidence_81"));
  assert.ok(findings.some((finding) => finding.ruleKey === "accessibility_review.contrast_failures"));
});

test("promoteSectionFinancialReviewFindings upgrades section-level earnings claims into financial review findings", () => {
  const promoted = promoteSectionFinancialReviewFindings([
    {
      category: "scan_report_review",
      description: "Section-level earnings claim without nearby disclosure.",
      evidence: {
        adjacent_disclosure_present: false,
        candidate_block_heading: "Homepage New 1 - thefxculture",
        candidate_block_text: "Join My Free Trading Community And Learn & Profit From My Trading Ideas Daily",
        candidate_signals: ["earnings", "investment_context"],
        claim_present: true,
        claim_text: "Learn & Profit From My Trading Ideas Daily",
        commercial_context: true,
        page_type: "homepage",
        pricing_present: false
      },
      findingFamily: "section_review",
      findingScope: "page",
      findingSource: "section_review",
      findingSubject: "disclosure",
      pageUrl: "https://fxculturetrading.com/",
      rank: 1,
      ruleKey: "section_review.earnings_claim_without_adjacent_disclosure",
      severity: "high",
      subtype: "section_review",
      title: "Earnings claim without adjacent disclosure"
    }
  ]);

  assert.equal(promoted.length, 2);
  const finding = promoted.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.pageUrl, "https://fxculturetrading.com/");
  assert.equal(finding?.evidence.pageClassification, "financial_offer");
  assert.deepEqual(finding?.evidence.policySnippets, [
    "Join My Free Trading Community And Learn & Profit From My Trading Ideas Daily"
  ]);
});

test("deriveUnifiedFindingsWithWorkflowEvents emits completed event metadata on success", async () => {
  const events: Array<Record<string, unknown>> = [];

  const findings = await deriveUnifiedFindingsWithWorkflowEvents({
    appendEvent: async (event) => {
      events.push(event);
    },
    deriveFindings: () => [{ ruleKey: "example.finding" }],
    scanId: "scan_123"
  });

  assert.equal(findings.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "findings.unified_derivation_completed");
  assert.deepEqual(events[0]?.metadataJson, {
    findingCount: 1,
    stage: "unified_findings"
  });
});

test("deriveUnifiedFindingsWithWorkflowEvents emits failed event metadata on error", async () => {
  const events: Array<Record<string, unknown>> = [];

  await assert.rejects(
    () =>
      deriveUnifiedFindingsWithWorkflowEvents({
        appendEvent: async (event) => {
          events.push(event);
        },
        deriveFindings: () => {
          throw new Error("boom");
        },
        scanId: "scan_123"
      }),
    /boom/
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "findings.unified_derivation_failed");
  assert.deepEqual(events[0]?.metadataJson, {
    error: "boom",
    stage: "unified_findings"
  });
});

test("emits a blocked-access finding when the public scan is cut short before any verified surfaces", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pageEvidence: [],
      pages: [{ page_type: "homepage", page_url: "https://www.example.com/", fetch_status: "forbidden" }],
      policyEnrichments: [],
      policyReviewQueue: [],
      snapshot: {
        access_posture_class: "early_loss",
        auth_wall_detected: true,
        blocked_flag: true,
        coverage_level: "limited_none",
        homepage_fetch_status: "forbidden",
        partial_scan: true,
        stop_reason_detail: "Homepage appeared to require account authentication before public content could be verified.",
        stop_reason_http_status: 403,
        stop_reason_label: "Access limited by site protections",
        verified_public_surfaces_count: 0
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "access_review.public_access_blocked");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.pageUrl, "https://www.example.com/");
});

test("does not emit blocked-access finding when preflight verified legal surfaces exist", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          source_status: "ready",
          canonical_url: "https://www.example.com/privacy",
          document_type: "privacy_policy"
        }
      ],
      policyReviewQueue: [],
      snapshot: {
        blocked_flag: true,
        homepage_fetch_status: "forbidden",
        partial_scan: true,
        stop_reason_http_status: 403,
        verified_public_surfaces_count: 1
      }
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "access_review.public_access_blocked"), false);
});

test("emits legal-coverage finding for partial non-blocked scans with no verified legal surfaces", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        cookie_policy_present: false,
        partial_scan: true,
        privacy_policy_present: false,
        terms_of_service_present: false,
        verified_public_surfaces_count: 0
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "access_review.legal_coverage_unverified");
  assert.ok(finding);
  assert.equal(finding?.severity, "medium");
});

test("does not emit legal-coverage finding for blocked or captcha-limited scans", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      snapshot: {
        blocked_flag: false,
        captcha_flag: true,
        cookie_policy_present: false,
        partial_scan: true,
        privacy_policy_present: false,
        terms_of_service_present: false,
        verified_public_surfaces_count: 0
      }
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "access_review.legal_coverage_unverified"), false);
});

test("emits blocked-access finding for captcha-limited partial scans without verified surfaces", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [{ page_type: "homepage", page_url: "https://www.example.com/", fetch_status: "redirected" }],
      policyEnrichments: [],
      policyReviewQueue: [],
      snapshot: {
        access_posture_class: "early_loss",
        blocked_flag: false,
        captcha_flag: true,
        coverage_level: "limited_partial",
        homepage_fetch_status: "redirected",
        partial_scan: true,
        stop_reason_code: "reachability_blocked_captcha",
        stop_reason_detail: "Homepage appeared to present a captcha challenge.",
        stop_reason_http_status: 200,
        stop_reason_label: "Access limited by site protections",
        verified_public_surfaces_count: 0
      }
    })
  );

  const finding = findings.find((item) => item.ruleKey === "access_review.public_access_blocked");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.pageUrl, "https://www.example.com/");
});

test("does not emit blocked-access finding for vendor interstitials when browser evidence shows public access", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [{ page_type: "homepage", page_url: "https://www.example.com/", fetch_status: "forbidden" }],
      policyEnrichments: [],
      policyReviewQueue: [],
      runtimeArtifacts: {
        hybrid_runtime_evidence: {
          consentSummary: {
            managePresent: true
          }
        }
      },
      snapshot: {
        access_posture_class: "early_loss",
        auth_wall_detected: true,
        auth_wall_suspected: false,
        blocked_flag: false,
        block_page_classification: "vendor_interstitial_probable",
        captcha_flag: false,
        challenge_suspected: true,
        cookie_banner_present: true,
        coverage_level: "limited_partial",
        homepage_fetch_status: "forbidden",
        partial_scan: true,
        stop_reason_http_status: 403,
        verified_public_surfaces_count: 0
      }
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "access_review.public_access_blocked"), false);
  assert.equal(findings.some((item) => item.ruleKey === "access_review.legal_coverage_unverified"), true);
});

test("lookout-style bundle surfaces runtime tracking, cookie gap, and retention findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          source_status: "ready",
          canonical_url: "https://lookout.com/legal/privacy-notice",
          document_type: "privacy_policy"
        },
        {
          source_status: "ready",
          canonical_url: "https://lookout.com/legal/cookie-policy",
          document_type: "cookie_policy"
        },
        {
          source_status: "ready",
          canonical_url: "https://lookout.com/legal/enterprise-end-user-agreement",
          document_type: "terms_of_service"
        }
      ],
      pages: [
        {
          page_type: "privacy_policy",
          page_url: "https://lookout.com/legal/privacy-notice",
          fetch_status: "ok"
        },
        {
          page_type: "cookie_policy",
          page_url: "https://lookout.com/legal/cookie-policy",
          fetch_status: "ok"
        },
        {
          page_type: "terms_of_service",
          page_url: "https://lookout.com/legal/enterprise-end-user-agreement",
          fetch_status: "ok"
        }
      ],
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://lookout.com/legal/privacy-notice",
          policy_actionable_flags: ["low_confidence"],
          policy_dsar_mechanism: "present",
          policy_retention_periods: [],
          policy_transfer_mechanisms: ["dpf"],
          policy_mentions: [
            { topic: "gpc_disclosure" },
            { topic: "children" },
            { topic: "targeted_advertising_disclosure" }
          ],
          policy_rights_signals: ["access", "delete"],
          policy_ambiguity_score: 68,
          policy_semantic_confidence: 0.78,
          policy_structurally_weak: true,
          policy_snippet_count: 1,
          policy_summary_short: "Privacy notice explains GPC, children's privacy, DPF transfers, and targeted advertising choices."
        },
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://lookout.com/legal/cookie-policy",
          policy_actionable_flags: ["low_confidence"],
          policy_semantic_confidence: 0.58,
          policy_ambiguity_score: 68,
          policy_mentions: [
            { topic: "targeted_advertising_disclosure" },
            { topic: "third_party_advertising_disclosure" }
          ],
          policy_summary_short:
            "Cookie notice explains cookie settings, third-party cookies, analytics, and marketing categories.",
          policy_cookie_disclosures: []
        },
        {
          id: "terms-1",
          page_type: "terms_of_service",
          page_url: "https://lookout.com/legal/enterprise-end-user-agreement",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.82,
          policy_ambiguity_score: 68,
          policy_summary_short: "Terms document."
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "cookie-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      preconsentViolations: [
        { vendor_name: "Google Analytics", collection_endpoint_type: "request" },
        { vendor_name: "Google Tag Manager", collection_endpoint_type: "request" },
        { vendor_name: "Hushly", collection_endpoint_type: "cookie" },
        { vendor_name: "Lookout Website", collection_endpoint_type: "cname" },
        { vendor_name: "Marketo", collection_endpoint_type: "request" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: ["AWSALBCORS", "_mkto_trk"],
        third_party_request_count: 121,
        hybrid_runtime_evidence: {
          networkSummary: {
            totalRequestCount: 122
          }
        }
      },
      snapshot: {
        cookie_count_total: 2,
        third_party_cookie_count: 1,
        preconsent_tracking_detected: true,
        tracker_count_total: 3,
        tracker_vendor_count: 3
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Analytics"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Marketo"
        }
      ]
    })
  );

  assert.deepEqual(
    findings.map((finding) => finding.ruleKey),
    [
      "runtime_privacy.preconsent_tracking_observed",
      "cookie_runtime.disclosure_gap",
      "section_review.no_retention_periods_noted"
    ]
  );
  assert.equal(findings.find((finding) => finding.ruleKey === "cookie_runtime.disclosure_gap")?.severity, "medium");
});

test("adidas-style blocked bundle only surfaces blocked-access finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [{ page_type: "homepage", page_url: "https://adidas.com/", fetch_status: "forbidden" }],
      policyEnrichments: [],
      policyReviewQueue: [],
      runtimeArtifacts: {
        initial_cookie_count: 0,
        third_party_request_count: 0,
        passive_public_verification_attempted_urls: [
          "https://adidas.com/legal/privacy-notice"
        ]
      },
      snapshot: {
        auth_wall_detected: true,
        blocked_flag: true,
        coverage_level: "limited_none",
        homepage_fetch_status: "forbidden",
        partial_scan: true,
        stop_reason_detail:
          "Homepage appeared to require account authentication before public content could be verified.",
        stop_reason_http_status: 403,
        stop_reason_label: "Access limited by site protections",
        verified_public_surfaces_count: 0
      },
      trackerVendors: [
        {
          before_consent: false,
          first_party_or_third_party: "first_party",
          vendor_name: "adidas Web Platform"
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), ["access_review.public_access_blocked"]);
});

test("alz doc-ready bundle only surfaces retention finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          source_status: "ready",
          extraction_status: "ready",
          canonical_url: "https://www.alz.org/security-and-privacy-policy",
          document_type: "privacy_policy"
        },
        {
          source_status: "ready",
          extraction_status: "ready",
          canonical_url: "https://www.alz.org/about/terms-of-use",
          document_type: "terms_of_service"
        }
      ],
      pages: [
        {
          page_type: "privacy_policy",
          page_url: "https://www.alz.org/security-and-privacy-policy",
          fetch_status: "ok"
        },
        {
          page_type: "terms_of_service",
          page_url: "https://www.alz.org/about/terms-of-use",
          fetch_status: "ok"
        }
      ],
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://www.alz.org/security-and-privacy-policy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_retention_periods: [],
          policy_transfer_mechanisms: [],
          policy_mentions: [
            { topic: "tracking_technologies_disclosure" }
          ],
          policy_rights_signals: ["access_request", "delete_request"],
          policy_ambiguity_score: 55,
          policy_semantic_confidence: 0.8,
          policy_structurally_weak: false,
          policy_snippet_count: 5,
          policy_summary_short: "Privacy policy describes collection, use, sharing, security, and rights choices but does not provide concrete retention periods."
        },
        {
          id: "terms-1",
          page_type: "terms_of_service",
          page_url: "https://www.alz.org/about/terms-of-use",
          policy_actionable_flags: [
            "warranty_disclaimer_present",
            "liability_waiver_present",
            "content_use_restrictions_present"
          ],
          policy_mentions: [],
          policy_ambiguity_score: 78,
          policy_coverage_ratio: 0.25,
          policy_snippet_count: 6,
          policy_structurally_weak: true,
          policy_semantic_confidence: null,
          policy_summary_short: "Terms of Use covers warranty disclaimers, liability waiver language, and copyright restrictions."
        }
      ],
      policyReviewQueue: [],
      preconsentViolations: [],
      runtimeArtifacts: null,
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        cookie_policy_present: false,
        partial_scan: false,
        preconsent_tracking_detected: false,
        privacy_policy_present: true,
        terms_of_service_present: true,
        verified_public_surfaces_count: 2
      }
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), ["section_review.no_retention_periods_noted"]);
});

test("supplemental policy disclosures suppress the primary-policy retention finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          source_status: "ready",
          extraction_status: "ready",
          canonical_url: "https://www.example.com/privacy",
          document_type: "privacy_policy"
        },
        {
          source_status: "ready",
          extraction_status: "ready",
          canonical_url: "https://www.example.com/help/privacy",
          document_type: "privacy_policy"
        }
      ],
      pages: [
        {
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          fetch_status: "ok"
        },
        {
          page_type: "privacy_policy",
          page_url: "https://www.example.com/help/privacy",
          fetch_status: "ok"
        }
      ],
      policyEnrichments: [
        {
          id: "privacy-primary",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_retention_periods: [],
          policy_transfer_mechanisms: [],
          policy_mentions: [{ topic: "tracking_technologies_disclosure" }],
          policy_rights_signals: ["access_request"],
          policy_ambiguity_score: 45,
          policy_semantic_confidence: 0.8,
          policy_structurally_weak: false,
          policy_snippet_count: 4,
          policy_summary_short: "Primary privacy policy describes collection and rights."
        },
        {
          id: "privacy-support",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/help/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_retention_periods: ["2 years after account inactivity"],
          policy_transfer_mechanisms: [],
          policy_mentions: [{ topic: "tracking_technologies_disclosure" }],
          policy_rights_signals: ["access_request"],
          policy_ambiguity_score: 22,
          policy_semantic_confidence: 0.88,
          policy_structurally_weak: false,
          policy_snippet_count: 4,
          policy_summary_short: "Supplemental privacy help page discloses retention windows."
        }
      ],
      policyReviewQueue: [],
      preconsentViolations: [],
      runtimeArtifacts: null,
      snapshot: {
        blocked_flag: false,
        partial_scan: false,
        privacy_policy_present: true,
        verified_public_surfaces_count: 2
      }
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
});

test("hobbylobby-style captcha bundle surfaces blocked access plus runtime tracking", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [{ page_type: "homepage", page_url: "https://www.hobbylobby.com/", fetch_status: "redirected" }],
      policyEnrichments: [],
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Google Tag Manager", collection_endpoint_type: "request" },
        { vendor_name: "Imperva", collection_endpoint_type: "cookie" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: ["incap_ses_189_792568"],
        third_party_request_count: 7,
        hybrid_runtime_evidence: {
          networkSummary: {
            totalRequestCount: 12
          }
        }
      },
      snapshot: {
        blocked_flag: false,
        captcha_flag: true,
        coverage_level: "limited_partial",
        homepage_fetch_status: "redirected",
        partial_scan: true,
        preconsent_tracking_detected: true,
        stop_reason_code: "reachability_blocked_captcha",
        stop_reason_detail: "Homepage appeared to present a captcha challenge.",
        stop_reason_http_status: 200,
        third_party_cookie_count: 6,
        tracker_count_total: 1,
        tracker_vendor_count: 1,
        verified_public_surfaces_count: 0
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Tag Manager"
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    "access_review.public_access_blocked",
    "runtime_privacy.preconsent_tracking_observed"
  ]);
});

test("hobbylobby live shape surfaces blocked access, obstructive consent, and runtime tracking", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Google Tag Manager", collection_endpoint_type: "request" },
        { vendor_name: "Emarsys Scarab Research", collection_endpoint_type: "cookie" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: [
          "AWSALB",
          "AWSALBCORS",
          "JSESSIONID",
          "hl-anon-id",
          "hl-id-token",
          "incap_ses_189_792568"
        ],
        hybrid_runtime_evidence: {
          consentSummary: {
            cmpDetected: true,
            contentObstructed: true,
            cookieWallDetected: null,
            managePresent: true,
            rejectDepthClass: "absent",
            rejectPresent: false,
            rejectRequiresMoreClicks: true,
            surfaceType: "modal"
          },
          consentVisual: {
            rejectHidden: true
          }
        },
        third_party_request_count: 12
      } as Record<string, unknown>,
      snapshot: {
        blocked_flag: false,
        captcha_flag: true,
        coverage_level: "limited_partial",
        homepage_fetch_status: "redirected",
        partial_scan: true,
        preconsent_tracking_detected: true,
        stop_reason_code: "reachability_blocked_captcha",
        stop_reason_detail: "Homepage appeared to present a captcha challenge.",
        stop_reason_http_status: 200,
        third_party_cookie_count: 6,
        tracker_count_total: 1,
        tracker_vendor_count: 1,
        verified_public_surfaces_count: 0
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Tag Manager"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Emarsys Scarab Research"
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    "access_review.public_access_blocked",
    "runtime_privacy.consent_interface_obstructive",
    "runtime_privacy.preconsent_tracking_observed"
  ]);
});

test("deriveValidationFindings does not emit transfer-mechanism finding when one is disclosed", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: [],
          policy_dsar_mechanism: "present",
          policy_retention_periods: [],
          policy_transfer_mechanisms: ["dpf"],
          policy_ambiguity_score: 20,
          policy_semantic_confidence: 0.9,
          policy_summary_short: "Privacy policy discloses DPF transfers and rights."
        }
      ],
      policyReviewQueue: [],
      snapshot: {}
    })
  );

  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.no_transfer_mechanism_noted"), false);
});

test("looksLikeIntermediaryOrBlockPage rejects obvious login and checkout interstitial pages", () => {
  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://example-auth.com/login?next=%2Fprivacy-policy",
      text: "Log in to continue to Example Auth.",
      title: "Login - Example Auth"
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

  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://example-auth.com/legal/privacy-policy",
      text: "Privacy Policy Sign in Contact Sales This Privacy Policy explains how Example Auth collects and uses personal data.",
      title: "Privacy Policy"
    }),
    false
  );
});

test("isolateLikelyLegalDocumentText trims legal page chrome around the main legal content", () => {
  const text = isolateLikelyLegalDocumentText({
    html: `
      <html>
        <head><title>Example Privacy Notice | Example Legal</title></head>
        <body>
          <nav>Homepage Products Pricing Contact</nav>
          <div>Example Privacy Notice | Example Legal</div>
          <main>
            <a href="/legal">Back to Legal Home</a>
            <h1>Example Privacy Notice</h1>
            <p>We honor Global Privacy Control (GPC).</p>
            <p>We transfer personal data under the Data Privacy Framework.</p>
            <p>Contact privacy@example.com.</p>
          </main>
          <footer>Why Example Partners Contact Us</footer>
        </body>
      </html>
    `,
    title: "Example Privacy Notice | Example Legal"
  });

  assert.equal(text.includes("Homepage Products Pricing Contact"), false);
  assert.equal(text.includes("Why Example Partners Contact Us"), false);
  assert.equal(text.includes("We honor Global Privacy Control (GPC)."), true);
  assert.equal(text.includes("Data Privacy Framework"), true);
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

test("buildNanoDocCandidateUrls prefers scanner and discovery evidence over slug guessing", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [
      {
        candidate_score: 0.92,
        candidate_url: "https://www.example.com/legal/privacy-notice",
        discovered_from: "footer_link",
        page_type: "privacy_policy"
      }
    ],
    domainHostname: "example.com",
    pages: [
      {
        page_type: "privacy_policy",
        page_url: "https://www.example.com/privacy-center"
      }
    ]
  });

  assert.equal(candidates[0]?.documentType, "privacy_policy");
  assert.equal(candidates[0]?.priorityTier, "priority");
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.url === "https://www.example.com/privacy-center" &&
        candidate.priorityTier === "priority"
    )
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.url === "https://www.example.com/legal/privacy-notice" &&
        candidate.priorityTier === "priority"
    )
  );
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/privacy"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/privacy-policy"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/terms"), false);
});

test("buildNanoDocCandidateUrls prefers main terms and privacy docs over special-scope variants", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [
      {
        anchor_text: "Affiliate Marketing Terms",
        candidate_score: 0.92,
        candidate_url: "https://www.example.com/legal/affiliate-marketing-terms",
        discovered_from: "homepage_rendered_link"
      },
      {
        anchor_text: "Terms of Service",
        candidate_score: 0.88,
        candidate_url: "https://www.example.com/legal/terms-of-service",
        discovered_from: "homepage_rendered_link"
      },
      {
        anchor_text: "Job Applicant Privacy Notice",
        candidate_score: 0.93,
        candidate_url: "https://www.example.com/legal/job-applicant-privacy-notice",
        discovered_from: "homepage_rendered_link"
      },
      {
        anchor_text: "Privacy Policy",
        candidate_score: 0.87,
        candidate_url: "https://www.example.com/legal/privacy-policy",
        discovered_from: "homepage_rendered_link"
      }
    ],
    domainHostname: "example.com",
    pages: []
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/terms-of-service"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/affiliate-marketing-terms"),
    false
  );
  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/job-applicant-privacy-notice"),
    false
  );
  assert.equal(candidates[0]?.url, "https://www.example.com/legal/privacy-policy");
});

test("buildNanoDocCandidateUrls keeps a special-scope privacy doc only when no main privacy doc exists", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [
      {
        anchor_text: "Job Applicant Privacy Notice",
        candidate_score: 0.93,
        candidate_url: "https://www.example.com/legal/job-applicant-privacy-notice",
        discovered_from: "homepage_rendered_link"
      },
      {
        anchor_text: "Terms of Service",
        candidate_score: 0.88,
        candidate_url: "https://www.example.com/legal/terms-of-service",
        discovered_from: "homepage_rendered_link"
      }
    ],
    domainHostname: "example.com",
    pages: []
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/job-applicant-privacy-notice"),
    true
  );
  assert.equal(candidates.some((candidate) => candidate.documentType === "privacy_policy"), true);
});

test("buildNanoDocCandidateUrls adds supplemental privacy support fallbacks alongside a primary privacy doc", () => {
  const candidates = buildNanoDocCandidateUrls({
    domainHostname: "example.com",
    pages: [
      {
        page_type: "privacy_policy",
        page_url: "https://legal.example.com/agreementservice?agreementType=privacyPolicy&country=US&language=en"
      },
      {
        page_type: "terms_of_service",
        page_url: "https://example.com/terms"
      }
    ]
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://example.com/help/privacy" && candidate.documentType === "privacy_policy"),
    true
  );
  assert.equal(
    candidates.some(
      (candidate) =>
        candidate.url === "https://example.com/guest/settings/privacy" && candidate.documentType === "privacy_policy"
    ),
    true
  );
});

test("buildNanoDocCandidateUrls keeps supplemental recent privacy support docs alongside current privacy evidence", () => {
  const candidates = buildNanoDocCandidateUrls({
    domainHostname: "example.com",
    pages: [
      {
        page_type: "privacy_policy",
        page_url: "https://legal.example.com/agreementservice?agreementType=privacyPolicy&country=US&language=en"
      }
    ],
    recentDomainDocumentCandidates: [
      {
        canonical_url: "https://example.com/help/privacy",
        document_type: "privacy_policy"
      }
    ]
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://example.com/help/privacy" && candidate.documentType === "privacy_policy"),
    true
  );
});

test("buildNanoDocCandidateUrls recognizes agreement-based legal-hub terms docs", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [
      {
        anchor_text: "EN",
        candidate_score: 0.82,
        candidate_url: "https://www.example.com/legal/lookout-mes-service-license-agreement",
        discovered_from: "legal_hub_link"
      },
      {
        anchor_text: "EN",
        candidate_score: 0.85,
        candidate_url: "https://www.example.com/legal/enterprise-end-user-agreement",
        discovered_from: "legal_hub_link"
      },
      {
        anchor_text: "Lookout Privacy Notice",
        candidate_score: 0.88,
        candidate_url: "https://www.example.com/legal/privacy-notice",
        discovered_from: "legal_hub_link"
      },
      {
        anchor_text: "View our Cookie Notice",
        candidate_score: 0.84,
        candidate_url: "https://www.example.com/legal/cookie-policy",
        discovered_from: "legal_hub_link"
      }
    ],
    domainHostname: "example.com",
    pages: []
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/enterprise-end-user-agreement"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/lookout-mes-service-license-agreement"),
    false
  );
});

test("buildNanoDocCandidateUrls falls back to broader legal-hub seed urls when no discovery evidence exists", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [],
    domainHostname: "example.com",
    pages: []
  });

  assert.deepEqual(candidates, [
    {
      documentType: "privacy_policy",
      priorityTier: "secondary",
      url: "https://example.com/privacy"
    },
    {
      documentType: "privacy_policy",
      priorityTier: "secondary",
      url: "https://example.com/legal/privacy-policy"
    },
    {
      documentType: "terms_of_service",
      priorityTier: "secondary",
      url: "https://example.com/terms"
    },
    {
      documentType: "terms_of_service",
      priorityTier: "secondary",
      url: "https://example.com/legal/terms-of-service"
    },
    {
      documentType: "terms_of_service",
      priorityTier: "secondary",
      url: "https://example.com/legal/enterprise-end-user-agreement"
    },
    {
      documentType: "cookie_policy",
      priorityTier: "secondary",
      url: "https://example.com/legal/cookie-policy"
    },
    {
      documentType: "cookie_policy",
      priorityTier: "secondary",
      url: "https://example.com/cookie-policy"
    }
  ]);
});

test("buildNanoDocCandidateUrls reuses recent domain legal docs before discovery fallback", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [],
    domainHostname: "example.com",
    pages: [],
    recentDomainDocumentCandidates: [
      {
        canonical_url: "https://www.example.com/legal/privacy-policy",
        document_type: "privacy_policy"
      },
      {
        canonical_url: "https://www.example.com/legal/cookie-policy",
        document_type: "cookie_policy"
      },
      {
        canonical_url: "https://www.example.com/legal/terms",
        document_type: "terms_of_service"
      }
    ]
  });

  assert.deepEqual(candidates, [
    {
      documentType: "privacy_policy",
      priorityTier: "priority",
      url: "https://www.example.com/legal/privacy-policy"
    },
    {
      documentType: "cookie_policy",
      priorityTier: "priority",
      url: "https://www.example.com/legal/cookie-policy"
    },
    {
      documentType: "terms_of_service",
      priorityTier: "priority",
      url: "https://www.example.com/legal/terms"
    }
  ]);
});

test("buildNanoDocCandidateUrls prefers current scan legal pages over recent domain history", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [],
    domainHostname: "example.com",
    pages: [
      {
        fetch_status: "ok",
        page_type: "privacy_policy",
        page_url: "https://www.example.com/legal/privacy-notice"
      },
      {
        fetch_status: "ok",
        page_type: "cookie_policy",
        page_url: "https://www.example.com/legal/cookie-policy"
      }
    ],
    recentDomainDocumentCandidates: [
      {
        canonical_url: "https://old.example.com/privacy",
        document_type: "privacy_policy"
      },
      {
        canonical_url: "https://old.example.com/cookies",
        document_type: "cookie_policy"
      },
      {
        canonical_url: "https://old.example.com/terms",
        document_type: "terms_of_service"
      }
    ]
  });

  assert.equal(candidates[0]?.url, "https://www.example.com/legal/privacy-notice");
  assert.equal(candidates[1]?.url, "https://www.example.com/legal/cookie-policy");
  assert.equal(candidates.some((candidate) => candidate.url === "https://old.example.com/privacy"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://old.example.com/cookies"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://old.example.com/terms"), true);
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/terms"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/legal/terms-of-service"), false);
});

test("selectNanoDocCandidates prefers current ws01 legal coverage over recent domain history", async () => {
  const candidates = await selectNanoDocCandidates({
    discoveryCandidates: [],
    domainHostname: "example.com",
    pages: [
      {
        fetch_status: "ok",
        page_type: "privacy_policy",
        page_url: "https://www.example.com/legal/privacy-notice"
      },
      {
        fetch_status: "ok",
        page_type: "terms_of_service",
        page_url: "https://www.example.com/legal/terms-of-service"
      }
    ],
    recentDomainDocumentCandidates: [
      {
        canonical_url: "https://old.example.com/privacy",
        document_type: "privacy_policy"
      }
    ]
  });

  assert.equal(candidates.some((candidate) => candidate.url === "https://www.example.com/legal/privacy-notice"), true);
  assert.equal(candidates.some((candidate) => candidate.url === "https://www.example.com/legal/terms-of-service"), true);
  assert.equal(candidates.some((candidate) => candidate.url === "https://old.example.com/privacy"), false);
  assert.equal(candidates.some((candidate) => candidate.url === "https://example.com/terms"), false);
});

test("getNanoDocumentSourceDedupKeys covers both ws01 source and redirected canonical urls", () => {
  const keys = getNanoDocumentSourceDedupKeys({
    canonical_url: "https://www.example.com/legal/enterprise-end-user-agreement",
    document_type: "terms_of_service",
    source: "ws01_preflight",
    source_url: "https://example.com/legal/enterprise-end-user-agreement"
  });

  assert.deepEqual(keys.sort(), [
    "terms_of_service::https://example.com/legal/enterprise-end-user-agreement",
    "terms_of_service::https://www.example.com/legal/enterprise-end-user-agreement"
  ]);
});

test("buildNanoDocCandidateUrls supplements recent domain docs when a document type is missing", () => {
  const candidates = buildNanoDocCandidateUrls({
    discoveryCandidates: [],
    domainHostname: "example.com",
    pages: [],
    recentDomainDocumentCandidates: [
      {
        canonical_url: "https://www.example.com/legal/privacy-policy",
        document_type: "privacy_policy"
      },
      {
        canonical_url: "https://www.example.com/legal/cookie-policy",
        document_type: "cookie_policy"
      }
    ]
  });

  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/privacy-policy"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.url === "https://www.example.com/legal/cookie-policy"),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.url === "https://example.com/legal/enterprise-end-user-agreement"),
    true
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

test("selectPendingNanoDocumentSourcesForExtraction skips optional terms when fallback policy rows already exist", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    policyEnrichments: [
      {
        page_type: "terms_of_service",
        page_url: "https://www.example.com/terms"
      }
    ],
    rows: [
      {
        document_type: "privacy_policy",
        document_text: "Privacy text",
        id: "doc-privacy"
      },
      {
        document_type: "terms_of_service",
        document_text: "Terms text",
        id: "doc-terms"
      }
    ],
    snapshot: {
      session_replay_without_disclosure_detected: true
    },
    runtimeArtifacts: null
  });

  assert.deepEqual(
    rows.map((row) => row.id),
    ["doc-privacy"]
  );
});

test("shouldQueueNanoDocumentSourceForExtraction refreshes ready-but-insufficient terms docs", () => {
  assert.equal(
    shouldQueueNanoDocumentSourceForExtraction({
      document_text: "Terms of Use. We make no representation, warranty or guarantee.",
      document_type: "terms_of_service",
      extraction_status: "insufficient",
      id: "terms-1",
      source_status: "ready"
    }),
    true
  );

  assert.equal(
    shouldQueueNanoDocumentSourceForExtraction({
      document_text: "Privacy policy text.",
      document_type: "privacy_policy",
      extraction_status: "insufficient",
      id: "privacy-1",
      source_status: "ready"
    }),
    false
  );
});

test("shouldQueueNanoDocumentSourceForExtraction refreshes stale ready privacy docs with retention cues", () => {
  assert.equal(
    shouldQueueNanoDocumentSourceForExtraction({
      document_text:
        "How is Your Personal Information Retained? We retain your personal information for as long as reasonably necessary. Biometric information will be deleted within 3 years.",
      document_type: "privacy_policy",
      extracted_fields_json: {
        policy_retention_periods: []
      },
      extraction_status: "ready",
      id: "privacy-1",
      metadata_json: {
        normalization_version: 1
      },
      source_status: "ready"
    }),
    true
  );

  assert.equal(
    shouldQueueNanoDocumentSourceForExtraction({
      document_text:
        "How is Your Personal Information Retained? We retain your personal information for as long as reasonably necessary. Biometric information will be deleted within 3 years.",
      document_type: "privacy_policy",
      extracted_fields_json: {
        policy_retention_periods: []
      },
      extraction_status: "ready",
      id: "privacy-2",
      metadata_json: {
        normalization_version: 2
      },
      source_status: "ready"
    }),
    false
  );
});

test("selectPendingNanoDocumentSourcesForExtraction skips terms without terms-specific runtime need", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [],
    policyEnrichments: [],
    rows: [
      {
        document_type: "privacy_policy",
        document_text: "Privacy text",
        id: "doc-privacy"
      },
      {
        document_type: "terms_of_service",
        document_text: "Terms text",
        id: "doc-terms"
      }
    ],
    snapshot: {},
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["doc-privacy"]);
});

test("selectPendingNanoDocumentSourcesForExtraction keeps ready-but-insufficient terms docs for refresh", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [
      {
        document_text: "Terms of Use. We make no representation, warranty or guarantee.",
        document_type: "terms_of_service",
        extraction_status: "insufficient",
        id: "terms-1",
        source_status: "ready"
      }
    ],
    policyEnrichments: [],
    rows: [
      {
        document_text: "Terms of Use. We make no representation, warranty or guarantee.",
        document_type: "terms_of_service",
        extraction_status: "insufficient",
        id: "terms-1",
        source_status: "ready"
      }
    ],
    snapshot: {},
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["terms-1"]);
});

test("selectPendingNanoDocumentSourcesForExtraction keeps terms when session replay disclosure needs review", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [],
    policyEnrichments: [],
    rows: [
      {
        document_type: "privacy_policy",
        document_text: "Privacy text",
        id: "doc-privacy"
      },
      {
        document_type: "terms_of_service",
        document_text: "Terms text",
        id: "doc-terms"
      }
    ],
    snapshot: {
      session_replay_without_disclosure_detected: true
    },
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["doc-privacy", "doc-terms"]);
});

test("selectPendingNanoDocumentSourcesForExtraction keeps cookie docs when runtime cookie evidence exists", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    policyEnrichments: [
      {
        page_type: "cookie_policy",
        page_url: "https://www.example.com/cookies"
      }
    ],
    rows: [
      {
        document_type: "cookie_policy",
        document_text: "Cookie text",
        id: "doc-cookie"
      }
    ],
    runtimeArtifacts: {
      initial_cookie_names: ["_ga"]
    }
  });

  assert.deepEqual(
    rows.map((row) => row.id),
    ["doc-cookie"]
  );
});

test("selectPendingNanoDocumentSourcesForExtraction keeps only the strongest pending privacy doc on first pass", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [],
    policyEnrichments: [],
    rows: [
      {
        canonical_url: "https://example.com/legal/job-applicant-privacy-notice",
        document_type: "privacy_policy",
        id: "doc-applicant",
        title: "Job Applicant Privacy Notice"
      },
      {
        canonical_url: "https://example.com/legal/privacy-policy",
        document_type: "privacy_policy",
        id: "doc-main",
        title: "Privacy Policy"
      }
    ],
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["doc-main"]);
});

test("selectPendingNanoDocumentSourcesForExtraction keeps supplemental privacy support docs with the primary privacy doc", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [],
    policyEnrichments: [],
    rows: [
      {
        canonical_url: "https://legal.example.com/agreementservice?agreementType=privacyPolicy&country=US&language=en",
        document_type: "privacy_policy",
        id: "doc-primary",
        title: "Privacy Policy"
      },
      {
        canonical_url: "https://example.com/help/privacy",
        document_type: "privacy_policy",
        id: "doc-help",
        title: "Privacy Webform"
      },
      {
        canonical_url: "https://example.com/guest/settings/do-not-share-my-data",
        document_type: "privacy_policy",
        id: "doc-choice",
        title: "Your Privacy Choices"
      }
    ],
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["doc-primary", "doc-help", "doc-choice"]);
});

test("selectPendingNanoDocumentSourcesForExtraction skips pending privacy docs when a strong ready privacy doc already exists", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [
      {
        document_type: "privacy_policy",
        extraction_status: "ready",
        source_status: "ready",
        extracted_fields_json: {
          policy_rights_signals: ["access_request"],
          policy_structurally_weak: false,
          policy_summary_short: "Main privacy policy",
          privacy_contact_channel_type: "email",
          policy_ambiguity_score: 32
        },
        semantic_confidence: 0.82
      }
    ],
    policyEnrichments: [],
    rows: [
      {
        canonical_url: "https://example.com/legal/job-applicant-privacy-notice",
        document_type: "privacy_policy",
        id: "doc-applicant",
        title: "Job Applicant Privacy Notice"
      }
    ],
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), []);
});

test("selectPendingNanoDocumentSourcesForExtraction keeps supplemental privacy support docs even when a strong ready privacy doc exists", () => {
  const rows = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: [
      {
        document_type: "privacy_policy",
        extraction_status: "ready",
        source_status: "ready",
        extracted_fields_json: {
          policy_rights_signals: ["access_request"],
          policy_structurally_weak: false,
          policy_summary_short: "Main privacy policy",
          privacy_contact_channel_type: "email",
          policy_ambiguity_score: 32
        },
        semantic_confidence: 0.82
      }
    ],
    policyEnrichments: [],
    rows: [
      {
        canonical_url: "https://example.com/help/privacy",
        document_type: "privacy_policy",
        id: "doc-help",
        title: "Privacy Webform"
      },
      {
        canonical_url: "https://example.com/guest/settings/do-not-share-my-data",
        document_type: "privacy_policy",
        id: "doc-choice",
        title: "Your Privacy Choices"
      },
      {
        canonical_url: "https://example.com/legal/job-applicant-privacy-notice",
        document_type: "privacy_policy",
        id: "doc-applicant",
        title: "Job Applicant Privacy Notice"
      }
    ],
    runtimeArtifacts: null
  });

  assert.deepEqual(rows.map((row) => row.id), ["doc-help", "doc-choice"]);
});

test("buildNanoDocumentContentHash normalizes whitespace before hashing", () => {
  const left = buildNanoDocumentContentHash("Privacy policy   text\nwith spacing.");
  const right = buildNanoDocumentContentHash("Privacy policy text with spacing.");

  assert.equal(left, right);
});

test("resolveReusableNanoDocumentExtractions matches prior ready rows by canonical url and content hash", () => {
  const contentHash = buildNanoDocumentContentHash("Privacy policy text with spacing.");
  const reusable = resolveReusableNanoDocumentExtractions({
    candidates: [
      {
        canonical_url: "https://example.com/privacy",
        id: "doc-current",
        metadata_json: {
          content_hash: contentHash
        }
      }
    ],
    priorExtractions: [
      {
        canonical_url: "https://example.com/privacy",
        id: "doc-prior",
        metadata_json: {
          content_hash: contentHash
        },
        extracted_fields_json: {
          page_type: "privacy_policy"
        }
      }
    ]
  });

  assert.equal(reusable.get("doc-current")?.id, "doc-prior");
});

test("resolveReusableNanoDocumentExtractions falls back to document type plus content hash when canonical urls differ", () => {
  const contentHash = buildNanoDocumentContentHash("Shared privacy policy text.");
  const reusable = resolveReusableNanoDocumentExtractions({
    candidates: [
      {
        canonical_url: "https://example.com/legal/privacy",
        document_type: "privacy_policy",
        id: "doc-current",
        metadata_json: {
          content_hash: contentHash
        }
      }
    ],
    priorExtractions: [
      {
        canonical_url: "https://example.com/privacy-policy",
        document_type: "privacy_policy",
        id: "doc-prior",
        metadata_json: {
          content_hash: contentHash
        }
      }
    ]
  });

  assert.equal(reusable.get("doc-current")?.id, "doc-prior");
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

test("deriveValidationFindings promotes guaranteed financial claims into restored commercial-claims findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-1",
          matched_text: "Guaranteed returns of 15% a year. Join now to open your account.",
          metadata: {
            surroundingHeading: "Performance"
          },
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/invest"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-1"],
          id: "sig-1",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/invest",
          payload: {},
          signal_key: "financial.guaranteed_return_language_present"
        },
        {
          evidence_refs: ["ev-1"],
          id: "sig-2",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/invest",
          payload: {},
          signal_key: "financial.claim_cta_block_present"
        },
        {
          evidence_refs: ["ev-1"],
          id: "sig-3",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/invest",
          payload: {},
          signal_key: "financial.return_or_yield_percentage_present"
        }
      ]
    })
  );

  const guaranteedFinding = findings.find((item) => item.ruleKey === "financial_review.guaranteed_outcome_claim_detected");

  assert.ok(guaranteedFinding);
  assert.equal(guaranteedFinding?.evidence.unifiedFindingId, "guaranteed_outcome_claim_detected");
  assert.deepEqual(guaranteedFinding?.evidence.supportingSignals, [
    "financial.guaranteed_return_language_present",
    "financial.claim_cta_block_present",
    "financial.return_or_yield_percentage_present"
  ]);
});

test("deriveValidationFindings suppresses faq-style guarantee questions as earnings or guaranteed-outcome claims", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-guarantee-faq",
          matched_text: "Do VIP Indicators guarantee profits?",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        },
        {
          evidence_id: "ev-guarantee-answer",
          matched_text:
            "No trading indicator can guarantee profits. VIP Indicators are designed to support better analysis and decision-making, but trading always involves risk.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        },
        {
          evidence_id: "ev-pricing",
          matched_text: "Simple & Transparent Pricing",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-guarantee-faq", "ev-guarantee-answer"],
          id: "sig-guarantee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com",
          payload: {
            matchedTexts: [
              "Do VIP Indicators guarantee profits?",
              "No trading indicator can guarantee profits. VIP Indicators are designed to support better analysis and decision-making, but trading always involves risk."
            ]
          },
          signal_key: "financial.guaranteed_return_language_present"
        },
        {
          evidence_refs: ["ev-pricing"],
          id: "sig-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com",
          payload: {
            matchedTexts: ["Simple & Transparent Pricing"]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.guaranteed_outcome_claim_detected"), false);
});

test("deriveValidationFindings promotes simulated performance and fee-opacity financial claims", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-1",
          matched_text: "Backtested strategies delivered 50% annual returns. Limited spots left. Subscribe now.",
          metadata: {
            surroundingHeading: "Quant performance"
          },
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/quant"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-1"],
          id: "sig-1",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/quant",
          payload: {},
          signal_key: "financial.hypothetical_or_backtest_language_present"
        },
        {
          evidence_refs: ["ev-1"],
          id: "sig-2",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/quant",
          payload: {},
          signal_key: "commercial.variable_fee_language_present_without_explanation"
        },
        {
          evidence_refs: ["ev-1"],
          id: "sig-3",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/quant",
          payload: {},
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-1"],
          id: "sig-4",
          page_role: "primary",
          page_type: "pricing_page",
          page_url: "https://www.example.com/quant",
          payload: {},
          signal_key: "financial.claim_cta_block_present"
        }
      ]
    })
  );

  assert.ok(findings.some((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure"));
  assert.ok(findings.some((item) => item.ruleKey === "financial_review.financial_urgency_pressure_tactic_detected"));
  assert.ok(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"));
  const simulatedFinding = findings.find((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure");
  assert.equal(simulatedFinding?.evidence.pageClassification, "pricing_or_fees");
});

test("deriveValidationFindings merges page-level financial signals into earnings and pricing risk findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-profit",
          matched_text: "Profit from our forex trading ideas with stronger weekly returns.",
          metadata: {
            matchedPattern: "\\b(?:apy|apr|annual percentage yield|yield|return(?:s)?|roi|profit(?:s)?|alpha|outperform(?:ance)?)\\b"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/"
        },
        {
          evidence_id: "ev-return",
          matched_text: "Return targets are highlighted for active forex members.",
          metadata: {
            matchedPattern: "\\b(?:apy|apr|annual percentage yield|yield|return(?:s)?|roi|profit(?:s)?|alpha|outperform(?:ance)?)\\b"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/"
        },
        {
          evidence_id: "ev-free",
          matched_text: "Free community access is promoted before the premium upgrade.",
          metadata: {
            matchedPattern: "\\b(?:free|zero fees?|no fees?|bonus|promo(?:tional)?|save\\s+\\$?\\d+|\\d{1,3}%\\s+off)\\b"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/"
        },
        {
          evidence_id: "ev-commission",
          matched_text: "Commission and platform fees may apply after signup.",
          metadata: {
            matchedPattern: "\\b(?:fee|fees|commission|spread|pricing|charges|expense ratio|maker[- ]taker)\\b"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-profit", "ev-return"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/",
          payload: {
            matchedTexts: [
              "Profit from our forex trading ideas with stronger weekly returns.",
              "Return targets are highlighted for active forex members."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-free"],
          id: "sig-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/",
          payload: {
            matchedTexts: ["Free community access is promoted before the premium upgrade."]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-commission"],
          id: "sig-fee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fxculturetrading.com/",
          payload: {
            matchedTexts: ["Commission and platform fees may apply after signup."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  const pricingFinding = findings.find((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear");

  assert.ok(earningsFinding);
  assert.ok(pricingFinding);
  assert.equal(earningsFinding?.evidence.pageClassification, "financial_offer");
  assert.equal(pricingFinding?.evidence.pageClassification, "financial_offer");
});

test("deriveValidationFindings prefers substantive financial claim snippets over bare free-price tokens", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-profit",
          matched_text: "Start making profit with our forex system and target 8.9% monthly profit.",
          metadata: {
            surroundingHeading: "Copy Trading Platform"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com"
        },
        {
          evidence_id: "ev-free",
          matched_text: "Free",
          metadata: {
            matchedPattern: "\\b(?:free|zero fees?|no fees?)\\b"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-profit"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com",
          payload: {
            matchedTexts: ["Start making profit with our forex system and target 8.9% monthly profit."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-free"],
          id: "sig-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com",
          payload: {
            matchedTexts: ["Free"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  assert.ok(earningsFinding);
  assert.equal(
    earningsFinding?.evidence.matchedSnippet,
    "Start making profit with our forex system and target 8.9% monthly profit."
  );
  assert.deepEqual(earningsFinding?.evidence.policySnippets, [
    "Start making profit with our forex system and target 8.9% monthly profit.",
    "Free"
  ]);
});

test("deriveValidationFindings prefers the stronger suspicious finance page for duplicated financial claims", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-home-free",
          matched_text: "Free",
          metadata: {
            surroundingHeading: "Home"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://example.com"
        },
        {
          evidence_id: "ev-product-profit",
          matched_text: "Our funded trader package delivered 12% monthly profit for active forex clients.",
          metadata: {
            surroundingHeading: "Performance"
          },
          page_role: "primary",
          page_type: "product_page",
          page_url: "https://example.com/funded-trader"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-home-free"],
          id: "sig-home-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://example.com",
          payload: {
            matchedTexts: ["Free"]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-home-free"],
          id: "sig-home-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://example.com",
          payload: {
            matchedTexts: ["Free"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-product-profit"],
          id: "sig-product-performance",
          page_role: "primary",
          page_type: "product_page",
          page_url: "https://example.com/funded-trader",
          payload: {
            matchedTexts: ["Our funded trader package delivered 12% monthly profit for active forex clients."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-product-profit"],
          id: "sig-product-cta",
          page_role: "primary",
          page_type: "product_page",
          page_url: "https://example.com/funded-trader",
          payload: {
            matchedTexts: ["Apply now"]
          },
          signal_key: "financial.claim_cta_block_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  assert.ok(earningsFinding);
  assert.equal(earningsFinding?.pageUrl, "https://example.com/funded-trader");
  assert.equal(
    earningsFinding?.evidence.matchedSnippet,
    "Our funded trader package delivered 12% monthly profit for active forex clients."
  );
});

test("deriveValidationFindings suppresses token-only financial evidence fragments", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-profit",
          matched_text: "Profit",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://tokens-only.example"
        },
        {
          evidence_id: "ev-free",
          matched_text: "Free",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://tokens-only.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-profit"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://tokens-only.example",
          payload: {
            matchedTexts: ["Profit"]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-free"],
          id: "sig-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://tokens-only.example",
          payload: {
            matchedTexts: ["Free"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey.startsWith("financial_review.")), false);
});

test("deriveValidationFindings requires finding-specific evidence for simulated and superlative financial findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-profit",
          matched_text:
            "If you’re interested in profiting from the multi-trillion pound forex space, then you’ll be buying and selling currencies.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        },
        {
          evidence_id: "ev-paper",
          matched_text: "Paper Trading",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        },
        {
          evidence_id: "ev-outperform",
          matched_text:
            "In this example, we are going to place a sell order. This means that you believe the USD will outperform GBP.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        },
        {
          evidence_id: "ev-fees",
          matched_text: "On top of trading commissions, the spread ensures that online brokers make money.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-profit"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: [
              "If you’re interested in profiting from the multi-trillion pound forex space, then you’ll be buying and selling currencies."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-paper"],
          id: "sig-simulated",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: ["Paper Trading"]
          },
          signal_key: "financial.hypothetical_or_backtest_language_present"
        },
        {
          evidence_refs: ["ev-outperform"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: [
              "In this example, we are going to place a sell order. This means that you believe the USD will outperform GBP."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        },
        {
          evidence_refs: ["ev-fees"],
          id: "sig-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: ["On top of trading commissions, the spread ensures that online brokers make money."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
});

test("deriveValidationFindings suppresses educational best-chance superlatives for finance explainers", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-educational-best",
          matched_text:
            "Such tools allow you to analyze historical pricing trends in an advanced matter. In doing so, you stand the best chance possible of evaluating where the future direction of your chosen asset will go.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        },
        {
          evidence_id: "ev-fees",
          matched_text: "On top of trading commissions, the spread ensures that online brokers make money.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-educational-best"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: [
              "Such tools allow you to analyze historical pricing trends in an advanced matter. In doing so, you stand the best chance possible of evaluating where the future direction of your chosen asset will go."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        },
        {
          evidence_refs: ["ev-fees"],
          id: "sig-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: ["On top of trading commissions, the spread ensures that online brokers make money."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
});

test("deriveValidationFindings suppresses bare most-common educational phrasing for finance explainers", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-most-common",
          matched_text:
            "When it comes to funding your brokerage account, you should be offered a number of different payment methods. We’ve listed the most common deposit and withdrawal methods below.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-most-common"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: [
              "When it comes to funding your brokerage account, you should be offered a number of different payment methods. We’ve listed the most common deposit and withdrawal methods below."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
});

test("deriveValidationFindings suppresses fastest-timeframe payment copy for finance explainers", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-fastest-timeframe",
          matched_text:
            "E-Wallet deposits are not only free of charge, but in most cases, they allow you to withdraw your funds in the fastest timeframe.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-fastest-timeframe"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://learn2.trade",
          payload: {
            matchedTexts: [
              "E-Wallet deposits are not only free of charge, but in most cases, they allow you to withdraw your funds in the fastest timeframe."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
});

test("deriveValidationFindings prefers affirmative earnings copy over loss-mitigation wording for suspicious finance pages", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-loss",
          matched_text:
            "By doing so, you can limit your losses in case that one of the strategy providers or some other your investments will not yield you expected profit.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com"
        },
        {
          evidence_id: "ev-profit",
          matched_text:
            "The forex copy trading is a progressive trend in online trading that enables any beginner to get access to the financial market and start making profit.",
          metadata: {
            surroundingHeading: "Copy Trading Platform"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com"
        },
        {
          evidence_id: "ev-free",
          matched_text: "Free demo account",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-loss", "ev-profit"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com",
          payload: {
            matchedTexts: [
              "By doing so, you can limit your losses in case that one of the strategy providers or some other your investments will not yield you expected profit.",
              "The forex copy trading is a progressive trend in online trading that enables any beginner to get access to the financial market and start making profit."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-free"],
          id: "sig-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com",
          payload: {
            matchedTexts: ["Free demo account"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-loss"],
          id: "sig-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://mydigitrade.com",
          payload: {
            matchedTexts: [
              "By doing so, you can limit your losses in case that one of the strategy providers or some other your investments will not yield you expected profit."
            ]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  const pricingFinding = findings.find((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear");

  assert.equal(
    earningsFinding?.evidence.matchedSnippet,
    "The forex copy trading is a progressive trend in online trading that enables any beginner to get access to the financial market and start making profit."
  );
  assert.equal(pricingFinding?.evidence.matchedSnippet, "Free demo account");
});

test("deriveValidationFindings does not upgrade ordinary profitable-trader copy into guaranteed outcomes", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-earnings",
          matched_text:
            "Join Marco Trading’s community for free and start earning from proven Forex strategies -no prior knowledge needed.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com"
        },
        {
          evidence_id: "ev-negative-guarantee",
          matched_text: "No guaranteed returns after extensive effort",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com"
        },
        {
          evidence_id: "ev-free",
          matched_text: "Join My Free Community Today",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com"
        },
        {
          evidence_id: "ev-fee",
          matched_text: "Note that the 350€ is entirely for trading; neither I nor the broker charges any fees.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-earnings"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com",
          payload: {
            matchedTexts: ["Join Marco Trading’s community for free and start earning from proven Forex strategies -no prior knowledge needed."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-negative-guarantee"],
          id: "sig-guarantee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com",
          payload: {
            matchedTexts: ["No guaranteed returns after extensive effort"]
          },
          signal_key: "financial.guaranteed_return_language_present"
        },
        {
          evidence_refs: ["ev-free"],
          id: "sig-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com",
          payload: {
            matchedTexts: ["Join My Free Community Today"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-fee"],
          id: "sig-fee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://marcosignals.com",
          payload: {
            matchedTexts: ["Note that the 350€ is entirely for trading; neither I nor the broker charges any fees."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.ok(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"));
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.guaranteed_outcome_claim_detected"), false);
});

test("deriveValidationFindings suppresses pricing-unclear findings when pricing is explicitly transparent", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-refund",
          matched_text:
            "If you’re not satisfied with the benefits of VIP Indicators, you can request a full refund within our 30-day money-back guarantee. This gives you time to explore the service risk-free and decide if it’s the right fit for your trading needs.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        },
        {
          evidence_id: "ev-transparent",
          matched_text: "There are no hidden charges - just a secure, simple, and transparent payment process.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        },
        {
          evidence_id: "ev-pricing",
          matched_text: "Simple & Transparent Pricing",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-refund"],
          id: "sig-cancel",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com",
          payload: {
            matchedTexts: [
              "If you’re not satisfied with the benefits of VIP Indicators, you can request a full refund within our 30-day money-back guarantee. This gives you time to explore the service risk-free and decide if it’s the right fit for your trading needs."
            ]
          },
          signal_key: "commercial.cancellation_terms_text_present"
        },
        {
          evidence_refs: ["ev-transparent"],
          id: "sig-fee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com",
          payload: {
            matchedTexts: ["There are no hidden charges - just a secure, simple, and transparent payment process."]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-pricing"],
          id: "sig-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://vip-indicators.com",
          payload: {
            matchedTexts: ["Simple & Transparent Pricing"]
          },
          signal_key: "commercial.pricing_page_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings prefers commercial package claims over educational strategy explainers", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-educational",
          matched_text:
            "Swing trading is a type of trading strategy where traders aim to capitalize on short to medium-term price movements in a stock or other financial asset. The goal is to identify and profit from changing environments in the market.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro"
        },
        {
          evidence_id: "ev-package",
          matched_text: "One Month Package Of Forex Signals $75 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-educational", "ev-package"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: [
              "Swing trading is a type of trading strategy where traders aim to capitalize on short to medium-term price movements in a stock or other financial asset. The goal is to identify and profit from changing environments in the market.",
              "One Month Package Of Forex Signals $75 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-package"],
          id: "sig-fee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: ["One Month Package Of Forex Signals $75 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-package"],
          id: "sig-guarantee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: ["One Month Package Of Forex Signals $75 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"]
          },
          signal_key: "financial.guaranteed_return_language_present"
        }
      ]
    })
  );

  const surfacedFinancialFindings = findings.filter((item) => item.ruleKey.startsWith("financial_review."));

  assert.ok(surfacedFinancialFindings.length > 0);
  assert.equal(
    surfacedFinancialFindings.some(
      (item) =>
        item.evidence.matchedSnippet ===
        "One Month Package Of Forex Signals $75 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"
    ),
    true
  );
  assert.equal(
    surfacedFinancialFindings.some((item) =>
      String(item.evidence.matchedSnippet).includes("Swing trading is a type of trading strategy")
    ),
    false
  );
});

test("deriveValidationFindings prefers package claims over testimonial praise on suspicious finance homepages", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-testimonial",
          matched_text:
            "I’m reaching out to you guys to thank you for helping me bring my account to the initial capital and profit. God bless you! I’m speechless as far as the accuracy of your signals is concerned.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro"
        },
        {
          evidence_id: "ev-package",
          matched_text:
            "One Month Package Of Forex Signals $75 FXBANK VIP ACCESS 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-testimonial", "ev-package"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: [
              "I’m reaching out to you guys to thank you for helping me bring my account to the initial capital and profit. God bless you! I’m speechless as far as the accuracy of your signals is concerned.",
              "One Month Package Of Forex Signals $75 FXBANK VIP ACCESS 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-package"],
          id: "sig-fee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: [
              "One Month Package Of Forex Signals $75 FXBANK VIP ACCESS 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"
            ]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-package"],
          id: "sig-guarantee",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://forexbanksignal.pro",
          payload: {
            matchedTexts: [
              "One Month Package Of Forex Signals $75 FXBANK VIP ACCESS 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed"
            ]
          },
          signal_key: "financial.guaranteed_return_language_present"
        }
      ]
    })
  );

  const surfacedFinancialFindings = findings.filter((item) => item.ruleKey.startsWith("financial_review."));

  assert.ok(surfacedFinancialFindings.length > 0);
  assert.equal(
    surfacedFinancialFindings.some((item) =>
      String(item.evidence.matchedSnippet).includes("One Month Package Of Forex Signals $75 FXBANK VIP ACCESS 4-6 Signals Daily 90-95% Accuracy Weekly +2000 Pips Guaranteed")
    ),
    true
  );
  assert.equal(
    surfacedFinancialFindings.some((item) =>
      String(item.evidence.matchedSnippet).includes("I’m reaching out to you guys to thank you")
    ),
    false
  );
});

test("deriveValidationFindings treats strong returns language as an earnings claim even when superlatives are present", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-returns",
          matched_text:
            "Learn the exact systems top-performing traders use to generate consistent 6-7 figure returns. It's as simple as copy and paste.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-accuracy",
          matched_text:
            "We achieved an average of 82% accuracy in our signals due to our team's detailed analyses.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-returns", "ev-accuracy"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "Learn the exact systems top-performing traders use to generate consistent 6-7 figure returns. It's as simple as copy and paste.",
              "We achieved an average of 82% accuracy in our signals due to our team's detailed analyses."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-returns"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "Learn the exact systems top-performing traders use to generate consistent 6-7 figure returns. It's as simple as copy and paste."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), true);
});

test("deriveValidationFindings prefers structured performance snippets over title-like superlatives", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-title",
          matched_text: "Accurate Forex Signals for Profitable Trading | Best Forex Signals Provider",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-accuracy",
          matched_text: "We achieved an average of 82% accuracy in our signals due to our team's detailed analyses.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-pips",
          matched_text: "4000-5000 pips per month profit from our forex signals package",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-title", "ev-accuracy", "ev-pips"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "Accurate Forex Signals for Profitable Trading | Best Forex Signals Provider",
              "We achieved an average of 82% accuracy in our signals due to our team's detailed analyses.",
              "4000-5000 pips per month"
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-title"],
          id: "sig-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: ["Accurate Forex Signals for Profitable Trading | Best Forex Signals Provider"]
          },
          signal_key: "financial.investment_outperformance_language_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), true);
});

test("deriveValidationFindings preserves earnings findings on mixed suspicious finance pages with simulated-proof snippets", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-returns",
          matched_text:
            "Learn the exact systems top-performing traders use to generate consistent 6–7 figure returns. It's a simple as copy & paste - so even a complete beginner can take advantage.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-accuracy",
          matched_text:
            "When it comes to trading it’s important to catch the right moment. A highly experienced team of forex traders is taking care that every trade sent to clients is a profitable one. We achieved an average of 82% accuracy in our signals due to our team’s detailed analyses.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-pips",
          matched_text: "4000-5000 pips per month",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-backtest",
          matched_text:
            "I have backtested all their signals from the last year and they are the most accurate I’ve seen by far at 75%-90% with a 1:3 Risk to reward ratio.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        },
        {
          evidence_id: "ev-risk",
          matched_text:
            "Only trade with money that you are prepared to lose, you must recognize that for factors outside your control, you may lose all of the money in your trading account.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-returns", "ev-accuracy", "ev-pips"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "Learn the exact systems top-performing traders use to generate consistent 6–7 figure returns. It's a simple as copy & paste - so even a complete beginner can take advantage.",
              "When it comes to trading it’s important to catch the right moment. A highly experienced team of forex traders is taking care that every trade sent to clients is a profitable one. We achieved an average of 82% accuracy in our signals due to our team’s detailed analyses.",
              "4000-5000 pips per month profit from our forex signals package"
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-backtest"],
          id: "sig-backtest",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "I have backtested all their signals from the last year and they are the most accurate I’ve seen by far at 75%-90% with a 1:3 Risk to reward ratio."
            ]
          },
          signal_key: "financial.hypothetical_or_backtest_language_present"
        },
        {
          evidence_refs: ["ev-risk"],
          id: "sig-risk",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: [
              "Only trade with money that you are prepared to lose, you must recognize that for factors outside your control, you may lose all of the money in your trading account."
            ]
          },
          signal_key: "financial.risk_disclosure_text_present"
        },
        {
          evidence_refs: ["ev-pips"],
          id: "sig-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bestforex-signals.com",
          payload: {
            matchedTexts: ["4000-5000 pips per month profit from our forex signals package"]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), true);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure"), true);
});

test("deriveValidationFindings keeps locality-sensitive homepage findings separate when sibling metadata is present", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-home-earnings",
          matched_text: "Earn 50 to 100 pips average profit per day from one forex trading signal.",
          metadata: {
            surroundingHeading: "VIP signals"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          sibling_index: 1,
          token_start: 20,
          token_end: 34
        },
        {
          evidence_id: "ev-home-pricing",
          matched_text: "VIP access only 99 EUR per month.",
          metadata: {
            surroundingHeading: "VIP signals"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          sibling_index: 2,
          token_start: 35,
          token_end: 44
        },
        {
          evidence_id: "ev-home-risk",
          matched_text:
            "Only trade with money that you are prepared to lose, and remember that you may lose all of the funds in your trading account.",
          metadata: {
            surroundingHeading: "Risk warning"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          sibling_index: 8,
          token_start: 160,
          token_end: 184
        },
        {
          evidence_id: "ev-home-simulated",
          matched_text:
            "I backtested these signals over the last year and saw 75%-90% accuracy with a 1:3 risk to reward ratio.",
          metadata: {
            surroundingHeading: "Customer review"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          sibling_index: 9,
          token_start: 185,
          token_end: 205
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-home-earnings"],
          id: "sig-home-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          payload: {
            matchedTexts: ["Earn 50 to 100 pips average profit per day from one forex trading signal."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-home-pricing"],
          id: "sig-home-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          payload: {
            matchedTexts: ["VIP access only 99 EUR per month."]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-home-risk"],
          id: "sig-home-risk",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          payload: {
            matchedTexts: [
              "Only trade with money that you are prepared to lose, and remember that you may lose all of the funds in your trading account."
            ]
          },
          signal_key: "financial.risk_disclosure_text_present"
        },
        {
          evidence_refs: ["ev-home-simulated"],
          id: "sig-home-simulated",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://signals.example",
          payload: {
            matchedTexts: [
              "I backtested these signals over the last year and saw 75%-90% accuracy with a 1:3 risk to reward ratio."
            ]
          },
          signal_key: "financial.hypothetical_or_backtest_language_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  const simulatedFinding = findings.find((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure");

  assert.ok(earningsFinding);
  assert.equal(
    earningsFinding?.evidence.matchedSnippet,
    "Earn 50 to 100 pips average profit per day from one forex trading signal."
  );
  assert.deepEqual(earningsFinding?.evidence.policySnippets, [
    "Earn 50 to 100 pips average profit per day from one forex trading signal.",
    "VIP access only 99 EUR per month."
  ]);
  assert.ok(simulatedFinding);
  assert.equal(
    simulatedFinding?.evidence.matchedSnippet,
    "I backtested these signals over the last year and saw 75%-90% accuracy with a 1:3 risk to reward ratio."
  );
});

test("deriveValidationFindings does not let global risk boilerplate suppress a local earnings claim", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-earnings",
          matched_text: "Earn 12% monthly profit with our forex signal package.",
          metadata: {
            surroundingHeading: "Signal performance"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://boilerplate-risk.example"
        },
        {
          evidence_id: "ev-risk",
          matched_text:
            "Only trade with money you are prepared to lose, and remember that you may lose all the funds in your trading account.",
          metadata: {
            surroundingHeading: "Risk warning"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://boilerplate-risk.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-earnings"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://boilerplate-risk.example",
          payload: {
            matchedTexts: ["Earn 12% monthly profit with our forex signal package."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-risk"],
          id: "sig-risk",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://boilerplate-risk.example",
          payload: {
            matchedTexts: [
              "Only trade with money you are prepared to lose, and remember that you may lose all the funds in your trading account."
            ]
          },
          signal_key: "financial.risk_disclosure_text_present"
        }
      ]
    })
  );

  const earningsFinding = findings.find((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure");
  assert.ok(earningsFinding);
});

test("deriveValidationFindings lets fee-term disclosure suppress pricing opacity without suppressing earnings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-earnings",
          matched_text: "Earn 8% monthly profit with our managed forex account.",
          metadata: {
            surroundingHeading: "Managed account"
          },
          page_role: "primary",
          page_type: "pricing",
          page_url: "https://fee-terms.example/pricing"
        },
        {
          evidence_id: "ev-fee",
          matched_text: "A monthly fee of $25 applies to premium managed accounts.",
          metadata: {
            surroundingHeading: "Managed account"
          },
          page_role: "primary",
          page_type: "pricing",
          page_url: "https://fee-terms.example/pricing"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-earnings"],
          id: "sig-performance",
          page_role: "primary",
          page_type: "pricing",
          page_url: "https://fee-terms.example/pricing",
          payload: {
            matchedTexts: ["Earn 8% monthly profit with our managed forex account."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-fee"],
          id: "sig-fee-disclosure",
          page_role: "primary",
          page_type: "pricing",
          page_url: "https://fee-terms.example/pricing",
          payload: {
            matchedTexts: ["A monthly fee of $25 applies to premium managed accounts."]
          },
          signal_key: "commercial.explicit_fee_disclosure_text_present"
        },
        {
          evidence_refs: ["ev-fee"],
          id: "sig-fee-related",
          page_role: "primary",
          page_type: "pricing",
          page_url: "https://fee-terms.example/pricing",
          payload: {
            matchedTexts: ["A monthly fee of $25 applies to premium managed accounts."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), true);
});

test("deriveValidationFindings suppresses mainstream investment account growth copy without speculative marketing cues", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-mainstream-growth",
          matched_text:
            "Open an investment account and put your money to work with a diversified portfolio built for long-term retirement goals.",
          metadata: {
            surroundingHeading: "Brokerage account"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://invest.example"
        },
        {
          evidence_id: "ev-mainstream-pricing",
          matched_text: "See how our brokerage account compares on pricing and account features.",
          metadata: {
            surroundingHeading: "Brokerage account"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://invest.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-mainstream-growth"],
          id: "sig-mainstream-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://invest.example",
          payload: {
            matchedTexts: [
              "Open an investment account and put your money to work with a diversified portfolio built for long-term retirement goals."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-mainstream-pricing"],
          id: "sig-mainstream-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://invest.example",
          payload: {
            matchedTexts: ["See how our brokerage account compares on pricing and account features."]
          },
          signal_key: "commercial.pricing_page_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings suppresses institutional investment platform copy without speculative trading cues", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-institutional-growth",
          matched_text:
            "Our investment platform helps institutional investors optimize portfolio construction and long-term returns across asset classes.",
          metadata: {
            surroundingHeading: "Asset management platform"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://platform.example"
        },
        {
          evidence_id: "ev-institutional-pricing",
          matched_text: "Compare platform features and account options for your investment process.",
          metadata: {
            surroundingHeading: "Asset management platform"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://platform.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-institutional-growth"],
          id: "sig-institutional-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://platform.example",
          payload: {
            matchedTexts: [
              "Our investment platform helps institutional investors optimize portfolio construction and long-term returns across asset classes."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-institutional-growth"],
          id: "sig-institutional-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://platform.example",
          payload: {
            matchedTexts: [
              "Our investment platform helps institutional investors optimize portfolio construction and long-term returns across asset classes."
            ]
          },
          signal_key: "financial.investment_outperformance_language_present"
        },
        {
          evidence_refs: ["ev-institutional-pricing"],
          id: "sig-institutional-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://platform.example",
          payload: {
            matchedTexts: ["Compare platform features and account options for your investment process."]
          },
          signal_key: "commercial.pricing_page_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
});

test("deriveValidationFindings suppresses APY deposit-account marketing with explicit banking disclosures", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-apy-offer",
          matched_text: "Earn a boosted 4.00% APY for six months on our premium savings account.",
          metadata: {
            surroundingHeading: "Premium savings account"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example"
        },
        {
          evidence_id: "ev-apy-disclosure",
          matched_text:
            "Annual Percentage Yield (APY) may change at any time and fees may reduce earnings. Bank accounts offered by a Member FDIC institution.",
          metadata: {
            surroundingHeading: "Rates and disclosures"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example"
        },
        {
          evidence_id: "ev-apy-award",
          matched_text: "\"Best Savings Account for Investors 2025\" by Buy Side from Wall Street Journal.",
          metadata: {
            surroundingHeading: "Awards"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-apy-offer", "ev-apy-disclosure", "ev-apy-award"],
          id: "sig-apy-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example",
          payload: {
            matchedTexts: [
              "Earn a boosted 4.00% APY for six months on our premium savings account.",
              "Annual Percentage Yield (APY) may change at any time and fees may reduce earnings. Bank accounts offered by a Member FDIC institution.",
              "\"Best Savings Account for Investors 2025\" by Buy Side from Wall Street Journal."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-apy-award"],
          id: "sig-apy-review",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example",
          payload: {
            matchedTexts: ["\"Best Savings Account for Investors 2025\" by Buy Side from Wall Street Journal."]
          },
          signal_key: "financial.testimonial_or_review_block_near_financial_claim_present"
        },
        {
          evidence_refs: ["ev-apy-offer", "ev-apy-disclosure"],
          id: "sig-apy-rate",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example",
          payload: {
            matchedTexts: [
              "Earn a boosted 4.00% APY for six months on our premium savings account.",
              "Annual Percentage Yield (APY) may change at any time and fees may reduce earnings. Bank accounts offered by a Member FDIC institution."
            ]
          },
          signal_key: "financial.return_or_yield_percentage_present"
        },
        {
          evidence_refs: ["ev-apy-award"],
          id: "sig-apy-superlative",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example",
          payload: {
            matchedTexts: ["\"Best Savings Account for Investors 2025\" by Buy Side from Wall Street Journal."]
          },
          signal_key: "financial.investment_outperformance_language_present"
        },
        {
          evidence_refs: ["ev-apy-disclosure"],
          id: "sig-apy-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example",
          payload: {
            matchedTexts: [
              "Annual Percentage Yield (APY) may change at any time and fees may reduce earnings. Bank accounts offered by a Member FDIC institution."
            ]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.unqualified_superlative_claim_detected"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings suppresses ecommerce shipping and return copy from financial claims", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-shop-promo",
          matched_text: "Free shipping on all orders over $99 and 15% off your first order.",
          metadata: {
            surroundingHeading: "Exclusive offers"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://shop.example"
        },
        {
          evidence_id: "ev-shop-returns",
          matched_text: "Returns & Exchanges",
          metadata: {
            surroundingHeading: "Customer service"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://shop.example"
        },
        {
          evidence_id: "ev-shop-terms-returns",
          matched_text: "Returns accepted within 30 days of purchase and a $7.95 return shipping fee applies.",
          metadata: {
            surroundingHeading: "Returns & Exchanges"
          },
          page_role: "primary",
          page_type: "terms_of_service",
          page_url: "https://shop.example/terms"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-shop-returns"],
          id: "sig-shop-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://shop.example",
          payload: {
            matchedTexts: ["Returns & Exchanges"]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-shop-promo", "ev-shop-terms-returns"],
          id: "sig-shop-pricing",
          page_role: "primary",
          page_type: "terms_of_service",
          page_url: "https://shop.example/terms",
          payload: {
            matchedTexts: [
              "Free shipping on all orders over $99 and 15% off your first order.",
              "Returns accepted within 30 days of purchase and a $7.95 return shipping fee applies."
            ]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey.startsWith("financial_review.")), false);
});

test("deriveValidationFindings suppresses tax-advantaged account benefit copy on mainstream investing homepages", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-tax-advantaged",
          matched_text: "Get tax-deductible contributions, no immediate tax on earnings, and tax-free withdrawals for qualified medical expenses.",
          metadata: {
            surroundingHeading: "Health savings account"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://retirement.example"
        },
        {
          evidence_id: "ev-tax-fees",
          matched_text: "No minimums to open and no account fees.",
          metadata: {
            surroundingHeading: "Account benefits"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://retirement.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-tax-advantaged"],
          id: "sig-tax-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://retirement.example",
          payload: {
            matchedTexts: [
              "Get tax-deductible contributions, no immediate tax on earnings, and tax-free withdrawals for qualified medical expenses."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-tax-advantaged", "ev-tax-fees"],
          id: "sig-tax-pricing",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://retirement.example",
          payload: {
            matchedTexts: [
              "Get tax-deductible contributions, no immediate tax on earnings, and tax-free withdrawals for qualified medical expenses.",
              "No minimums to open and no account fees."
            ]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-tax-fees"],
          id: "sig-tax-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://retirement.example",
          payload: {
            matchedTexts: ["No minimums to open and no account fees."]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings suppresses illustrative hypothetical retirement calculator copy with clear qualifiers", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-hypothetical",
          matched_text:
            "Your total Potential hypothetical calculation is for illustrative purposes only and assumes an initial $15,000 investment and an 8% fixed annual rate of return with $5 daily contributions over a 45-year period.",
          metadata: {
            surroundingHeading: "Retirement calculator"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example"
        },
        {
          evidence_id: "ev-hypothetical-risk",
          matched_text: "No guarantee investment return will achieve 8% or any annual returns.",
          metadata: {
            surroundingHeading: "Important disclosures"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example"
        },
        {
          evidence_id: "ev-hypothetical-fee",
          matched_text: "Does not include monthly subscription fees, which would reduce returns over time.",
          metadata: {
            surroundingHeading: "Important disclosures"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-hypothetical", "ev-hypothetical-risk", "ev-hypothetical-fee"],
          id: "sig-hypothetical-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example",
          payload: {
            matchedTexts: [
              "Your total Potential hypothetical calculation is for illustrative purposes only and assumes an initial $15,000 investment and an 8% fixed annual rate of return with $5 daily contributions over a 45-year period.",
              "No guarantee investment return will achieve 8% or any annual returns.",
              "Does not include monthly subscription fees, which would reduce returns over time."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-hypothetical"],
          id: "sig-hypothetical-simulated",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example",
          payload: {
            matchedTexts: [
              "Your total Potential hypothetical calculation is for illustrative purposes only and assumes an initial $15,000 investment and an 8% fixed annual rate of return with $5 daily contributions over a 45-year period."
            ]
          },
          signal_key: "financial.hypothetical_or_backtest_language_present"
        },
        {
          evidence_refs: ["ev-hypothetical-fee"],
          id: "sig-hypothetical-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://calculator.example",
          payload: {
            matchedTexts: ["Does not include monthly subscription fees, which would reduce returns over time."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.simulated_performance_without_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings suppresses advisory disclosure copy that mentions fees and conflicts", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-adv-disclosure",
          matched_text:
            "Please refer to the Form ADV for Principal SimpleInvest and other applicable disclosures and agreements for important information about its services, fees and related conflicts of interest.",
          metadata: {
            surroundingHeading: "Important disclosures"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example"
        },
        {
          evidence_id: "ev-adv-risk",
          matched_text: "Investing in SimpleInvest portfolios does not guarantee profit or protect against loss.",
          metadata: {
            surroundingHeading: "Important disclosures"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example"
        },
        {
          evidence_id: "ev-adv-free",
          matched_text: "Free tools to help with your financial planning needs.",
          metadata: {
            surroundingHeading: "Planning tools"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-adv-risk"],
          id: "sig-adv-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example",
          payload: {
            matchedTexts: ["Investing in SimpleInvest portfolios does not guarantee profit or protect against loss."]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-adv-disclosure"],
          id: "sig-adv-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example",
          payload: {
            matchedTexts: [
              "Please refer to the Form ADV for Principal SimpleInvest and other applicable disclosures and agreements for important information about its services, fees and related conflicts of interest."
            ]
          },
          signal_key: "commercial.fee_related_text_present"
        },
        {
          evidence_refs: ["ev-adv-free"],
          id: "sig-adv-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://advisor.example",
          payload: {
            matchedTexts: ["Free tools to help with your financial planning needs."]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
});

test("deriveValidationFindings suppresses money-market and CD yield copy from mainstream institutions", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-money-market",
          matched_text:
            "If you're looking for better rates of return on deposits than you would get in an ordinary bank account, cash funds may be an option to consider.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://assetmanager.example"
        },
        {
          evidence_id: "ev-cd",
          matched_text: "High Yield CD",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://bank.example"
        },
        {
          evidence_id: "ev-prospectus",
          matched_text: "Carefully consider the Funds' investment objectives, risk factors, charges and expenses before investing.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://assetmanager.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-money-market", "ev-cd"],
          id: "sig-yield",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://assetmanager.example",
          payload: {
            matchedTexts: [
              "If you're looking for better rates of return on deposits than you would get in an ordinary bank account, cash funds may be an option to consider.",
              "High Yield CD"
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-prospectus"],
          id: "sig-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://assetmanager.example",
          payload: {
            matchedTexts: ["Carefully consider the Funds' investment objectives, risk factors, charges and expenses before investing."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
});

test("deriveValidationFindings suppresses consumer credit reward and APR offer disclosures", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-cash-back",
          matched_text:
            "Earn 5% cash back with your credit card at restaurants and home improvement stores, now-June 30, on up to $1,500 in purchases, when you activate.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example"
        },
        {
          evidence_id: "ev-apr-offer",
          matched_text:
            "Receiving a pre-approval offer does not guarantee approval, and any pre-approved offers you receive may have offer terms, including APR rates, that vary from other offers.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example"
        },
        {
          evidence_id: "ev-loan-fees",
          matched_text: "$0 origination fees, a fixed monthly payment and no prepayment penalty. Estimate your payments today.",
          metadata: null,
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-cash-back", "ev-apr-offer"],
          id: "sig-consumer-performance",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example",
          payload: {
            matchedTexts: [
              "Earn 5% cash back with your credit card at restaurants and home improvement stores, now-June 30, on up to $1,500 in purchases, when you activate.",
              "Receiving a pre-approval offer does not guarantee approval, and any pre-approved offers you receive may have offer terms, including APR rates, that vary from other offers."
            ]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-cash-back"],
          id: "sig-consumer-promo",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example",
          payload: {
            matchedTexts: [
              "Earn 5% cash back with your credit card at restaurants and home improvement stores, now-June 30, on up to $1,500 in purchases, when you activate."
            ]
          },
          signal_key: "commercial.promo_price_or_free_claim_present"
        },
        {
          evidence_refs: ["ev-loan-fees"],
          id: "sig-consumer-fees",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://card.example",
          payload: {
            matchedTexts: ["$0 origination fees, a fixed monthly payment and no prepayment penalty. Estimate your payments today."]
          },
          signal_key: "commercial.fee_related_text_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "financial_review.earnings_claim_without_adjacent_disclosure"), false);
  assert.equal(findings.some((item) => item.ruleKey === "financial_review.pricing_or_fee_transparency_unclear"), false);
});

test("deriveValidationFindings suppresses financial-claim negatives on cookie-policy surfaces", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-cookie-profit",
          matched_text: "Profit",
          metadata: {
            matchedPattern: "\\b(?:profit|profits|profitable|earnings|return|returns)\\b"
          },
          page_role: "primary",
          page_type: "cookie_policy",
          page_url: "https://ftmo.com/cookies"
        },
        {
          evidence_id: "ev-cookie-trading",
          matched_text: "trading",
          metadata: {
            matchedPattern: "\\b(?:trading|forex|invest|investment)\\b"
          },
          page_role: "primary",
          page_type: "cookie_policy",
          page_url: "https://ftmo.com/cookies"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-cookie-profit"],
          id: "sig-cookie-performance",
          page_role: "primary",
          page_type: "cookie_policy",
          page_url: "https://ftmo.com/cookies",
          payload: {
            matchedTexts: ["Profit"]
          },
          signal_key: "financial.performance_claim_text_present"
        },
        {
          evidence_refs: ["ev-cookie-trading"],
          id: "sig-cookie-cta",
          page_role: "primary",
          page_type: "cookie_policy",
          page_url: "https://ftmo.com/cookies",
          payload: {
            matchedTexts: ["trading"]
          },
          signal_key: "financial.claim_cta_block_present"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey.startsWith("financial_review.")), false);
});

test("deriveValidationFindings collapses duplicate disclosure-present findings across homepage and legal pages", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      pageEvidence: [
        {
          evidence_id: "ev-home-disclaimer",
          matched_text: "Past performance is not indicative of future results",
          metadata: {
            surroundingHeading: "Performance disclaimer"
          },
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fundedtradermarkets.com"
        },
        {
          evidence_id: "ev-privacy-disclaimer",
          matched_text: "Past performance is not indicative of future results",
          metadata: {
            surroundingHeading: "Risk disclosure"
          },
          page_role: "primary",
          page_type: "privacy_policy",
          page_url: "https://fundedtradermarkets.com/privacy-policy"
        }
      ],
      signalHits: [
        {
          evidence_refs: ["ev-home-disclaimer"],
          id: "sig-home-disclaimer",
          page_role: "primary",
          page_type: "homepage",
          page_url: "https://fundedtradermarkets.com",
          payload: {
            matchedTexts: ["Past performance is not indicative of future results"]
          },
          signal_key: "financial.past_performance_disclaimer_text_present"
        },
        {
          evidence_refs: ["ev-privacy-disclaimer"],
          id: "sig-privacy-disclaimer",
          page_role: "primary",
          page_type: "privacy_policy",
          page_url: "https://fundedtradermarkets.com/privacy-policy",
          payload: {
            matchedTexts: ["Past performance is not indicative of future results"]
          },
          signal_key: "financial.past_performance_disclaimer_text_present"
        }
      ]
    })
  );

  const disclaimerFindings = findings.filter(
    (item) => item.ruleKey === "financial_review.past_performance_disclaimer_present"
  );

  assert.equal(disclaimerFindings.length, 1);
  assert.equal(disclaimerFindings[0]?.pageUrl, "https://fundedtradermarkets.com");
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
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.confidence_66"));
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

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.functional_misalignment"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.missing_technical_disclosure"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"));
});

test("rich semantics suppress extraction-noise findings while preserving substantive negatives", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["low_confidence"],
          policy_dsar_mechanism: "present",
          policy_transfer_mechanisms: [],
          policy_retention_periods: [],
          policy_mentions: [
            { topic: "gpc_disclosure" },
            { topic: "children" },
            { topic: "targeted_advertising_disclosure" }
          ],
          policy_children_reference: "under_16",
          privacy_contact_channel_type: "email",
          policy_ambiguity_score: 68,
          policy_semantic_confidence: 0.58,
          policy_snippet_count: 1,
          policy_structurally_weak: true,
          policy_summary_short: "Privacy policy explains GPC, children's privacy, and targeted advertising choices."
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
      snapshot: {}
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "scan_report_review.low_confidence_critical_fields"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.clarity_risk_68"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.confidence_58"));
  assert.ok(findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_transfer_mechanism_noted"));
});

test("cookie policy with rich disclosure semantics does not emit obstruction-only findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: ["low_confidence"],
          policy_semantic_confidence: 0.58,
          policy_ambiguity_score: 68,
          policy_mentions: [
            { topic: "targeted_advertising_disclosure" },
            { topic: "third_party_advertising_disclosure" }
          ],
          policy_summary_short:
            "Cookie notice explains cookie settings, third-party cookies, and marketing/targeting categories.",
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

  assert.equal(findings.some((finding) => finding.ruleKey === "cookie_runtime.cookie_policy_obstructed"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"), false);
});

test("rich terms semantics suppress rule-only and clarity-noise findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "terms-1",
          page_type: "terms_of_service",
          page_url: "https://www.example.com/terms",
          policy_actionable_flags: [
            "warranty_disclaimer_present",
            "liability_waiver_present",
            "content_use_restrictions_present"
          ],
          policy_mentions: [],
          policy_ambiguity_score: 78,
          policy_coverage_ratio: 0.25,
          policy_snippet_count: 6,
          policy_structurally_weak: true,
          policy_semantic_confidence: null,
          policy_summary_short: "Terms of Use covers warranty disclaimers, liability waiver language, and copyright restrictions."
        }
      ],
      policyReviewQueue: [],
      snapshot: {}
    })
  );

  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.rule_only_row_present"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.clarity_risk_78"), false);
});

test("cnn-style runtime findings suppress low-signal policy noise and collapse duplicate retention findings", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["low_confidence"],
          policy_dsar_mechanism: "unknown",
          policy_retention_periods: [],
          policy_transfer_mechanisms: [],
          policy_ambiguity_score: 82,
          policy_semantic_confidence: 0.42,
          policy_snippet_count: 0,
          policy_structurally_weak: true,
          policy_summary_short: ""
        },
        {
          id: "privacy-2",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy-center",
          policy_actionable_flags: ["low_confidence"],
          policy_dsar_mechanism: "unknown",
          policy_retention_periods: [],
          policy_transfer_mechanisms: [],
          policy_ambiguity_score: 79,
          policy_semantic_confidence: 0.41,
          policy_snippet_count: 0,
          policy_structurally_weak: true,
          policy_summary_short: ""
        },
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: ["low_confidence"],
          policy_semantic_confidence: 0.39,
          policy_ambiguity_score: 76,
          policy_mentions: [],
          policy_summary_short: "",
          policy_cookie_disclosures: []
        }
      ],
      policyReviewQueue: [
        {
          id: "review-1",
          policy_enrichment_id: "privacy-1",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        },
        {
          id: "review-2",
          policy_enrichment_id: "privacy-2",
          reason: "low_confidence_critical_fields",
          review_status: "pending"
        }
      ],
      runtimeArtifacts: {
        hybrid_runtime_evidence: {
          consentSummary: {
            cmpDetected: true,
            contentObstructed: true,
            cookieWallDetected: false,
            managePresent: true,
            rejectPresent: false,
            rejectRequiresMoreClicks: true,
            surfaceType: "modal"
          }
        },
        initial_cookie_names: ["_ga"]
      } as Record<string, unknown>,
      snapshot: {
        preconsent_tracking_detected: true,
        third_party_cookie_count: 2,
        cookie_count_total: 2,
        tracker_count_total: 2,
        tracker_vendor_count: 1
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Analytics"
        }
      ]
    })
  );

  assert.equal(findings.some((finding) => finding.ruleKey === "runtime_privacy.consent_interface_obstructive"), true);
  assert.equal(findings.some((finding) => finding.ruleKey === "runtime_privacy.preconsent_tracking_observed"), true);
  assert.equal(findings.some((finding) => finding.ruleKey === "cookie_runtime.cookie_policy_obstructed"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "policy_runtime.disclosure_likely_obstructed"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "scan_report_review.low_confidence_critical_fields"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.low_confidence_critical_fields"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "section_review.low_extraction_confidence"), false);
  assert.equal(findings.filter((finding) => finding.ruleKey === "section_review.no_retention_periods_noted").length, 1);
});

test("promotes pre-consent runtime evidence into a runtime privacy finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Google Analytics", collection_endpoint_type: "request" },
        { vendor_name: "Marketo", collection_endpoint_type: "request" },
        { vendor_name: "Hushly", collection_endpoint_type: "cookie" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: ["AWSALBCORS", "_mkto_trk"],
        third_party_request_count: 121,
        hybrid_runtime_evidence: {
          networkSummary: {
            totalRequestCount: 122
          }
        }
      },
      snapshot: {
        cookie_count_total: 2,
        third_party_cookie_count: 1,
        preconsent_tracking_detected: true,
        tracker_count_total: 3,
        tracker_vendor_count: 3
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Analytics"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Marketo"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.preconsent_tracking_observed");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.pageUrl, null);
});

test("does not promote a pre-consent runtime finding without third-party evidence", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      snapshot: {
        cookie_count_total: 1,
        preconsent_tracking_detected: true,
        third_party_cookie_count: 0,
        tracker_count_total: 1,
        tracker_vendor_count: 1
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "first_party",
          vendor_name: "Example Site"
        }
      ]
    })
  );

  assert.equal(findings.some((item) => item.ruleKey === "runtime_privacy.preconsent_tracking_observed"), false);
});

test("pre-consent runtime finding attributes observed third-party vendors in surfaced evidence", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Example first-party web platform", collection_endpoint_type: "request" }
      ],
      snapshot: {
        cookie_count_total: 10,
        preconsent_tracking_detected: true,
        third_party_cookie_count: 3,
        tracker_count_total: 4,
        tracker_vendor_count: 4
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Analytics"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Meta Pixel"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.preconsent_tracking_observed");
  assert.ok(finding);
  assert.deepEqual(finding?.evidence.preconsent_violation_vendors, [
    "Google Analytics",
    "Meta Pixel",
    "Example first-party web platform"
  ]);
});

test("pre-consent runtime finding narrows framing when privacy controls are explicitly disclosed", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy-center",
          policy_dsar_mechanism: "present",
          policy_do_not_sell: "present_link",
          policy_mentions: ["gpc_disclosure"],
          policy_retention_periods: ["2 years"],
          privacy_contact_channel_type: "webform",
          policy_summary_short: "Privacy Center explains privacy choices, GPC support, request rights, and retention."
        }
      ],
      policyReviewQueue: [],
      snapshot: {
        cookie_count_total: 10,
        preconsent_tracking_detected: true,
        third_party_cookie_count: 3,
        tracker_count_total: 4,
        tracker_vendor_count: 4
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Analytics"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.preconsent_tracking_observed");
  assert.ok(finding);
  assert.equal(finding?.title, "Tracking observed before privacy choice");
  assert.equal(finding?.evidence.explicit_privacy_controls_disclosed, true);
  assert.deepEqual(finding?.evidence.domain_policy_coverage, {
    hasPrivacyChoiceDisclosure: true,
    hasPrivacyContactDisclosure: true,
    hasRetentionDisclosure: true,
    hasRightsDisclosure: true,
    hasTransferDisclosure: false
  });
});

test("promotes RTB identity-sync runtime footprint as a generic adtech finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      runtimeArtifacts: {
        third_party_request_count: 182,
        third_party_request_domains: [
          "securepubads.g.doubleclick.net",
          "cm.g.doubleclick.net",
          "static.criteo.net",
          "cdn.id5-sync.com",
          "micro.rubiconproject.com",
          "oa.openxcdn.net",
          "vtrk.dv.tech",
          "insight.adsrvr.org",
          "cdn.example.com"
        ],
        hybrid_runtime_evidence: {
          networkSummary: {
            totalRequestCount: 200
          },
          requestObservations: [
            {
              domain: "static.criteo.net",
              thirdParty: true,
              url: "https://static.criteo.net/js/ld/publishertag.js"
            },
            {
              domain: "cdn.id5-sync.com",
              thirdParty: true,
              url: "https://cdn.id5-sync.com/api/1.0/id5-api.js"
            }
          ],
          vendorSummary: {
            normalizedVendors: ["Google Ad Manager", "Criteo", "ID5"],
            rawThirdPartyDomains: ["static.criteo.net", "cdn.id5-sync.com", "micro.rubiconproject.com"]
          }
        }
      },
      snapshot: {
        cookie_count_total: 32,
        preconsent_tracking_detected: true,
        third_party_cookie_count: 31,
        tracker_count_total: 4,
        tracker_vendor_count: 4
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Ad Manager"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Criteo"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.rtb_cookie_sync_observed");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.deepEqual(finding?.evidence.rtb_cookie_sync_domains, [
    "cdn.id5-sync.com",
    "cm.g.doubleclick.net",
    "insight.adsrvr.org",
    "micro.rubiconproject.com",
    "oa.openxcdn.net",
    "securepubads.g.doubleclick.net",
    "static.criteo.net",
    "vtrk.dv.tech"
  ]);
  assert.deepEqual(finding?.evidence.runtimeRequestUrls, [
    "https://static.criteo.net/js/ld/publishertag.js",
    "https://cdn.id5-sync.com/api/1.0/id5-api.js"
  ]);
});

test("promotes CMP-gated tracking conflict when consent UI and policy coverage coexist with pre-consent adtech", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      runtimeArtifacts: {
        consent_actionable_choice_observed: true,
        consent_surface_observed: true,
        third_party_request_count: 182,
        third_party_request_domains: ["securepubads.g.doubleclick.net", "static.criteo.net", "cdn.id5-sync.com"],
        hybrid_runtime_evidence: {
          consentSummary: {
            bannerPresent: true,
            cmpDetected: true,
            managePresent: true
          },
          networkSummary: {
            totalRequestCount: 200
          },
          requestToVendorObservations: [
            {
              hostname: "securepubads.g.doubleclick.net",
              preConsent: true,
              vendor: "Google Ad Manager"
            }
          ],
          requestObservations: [
            {
              domain: "securepubads.g.doubleclick.net",
              thirdParty: true,
              url: "https://securepubads.g.doubleclick.net/tag/js/gpt.js"
            }
          ]
        }
      },
      snapshot: {
        cmp_vendor_name: "OneTrust",
        cookie_banner_present: true,
        cookie_count_total: 32,
        cookie_policy_present: true,
        granular_preferences_present: true,
        preconsent_tracking_detected: true,
        privacy_policy_present: true,
        third_party_cookie_count: 31,
        tracker_count_total: 4,
        tracker_vendor_count: 4
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Ad Manager"
        }
      ]
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.consent_gated_tracking_claim_conflict");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.evidence.cmp_vendor_name, "OneTrust");
  assert.equal(finding?.evidence.consent_actionable_choice_observed, true);
  assert.equal(finding?.evidence.preconsent_tracking_detected, true);
});

test("promotes obstructive consent interface findings when reject path is hidden behind a cookie wall", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyReviewQueue: [],
      runtimeArtifacts: {
        hybrid_runtime_evidence: {
          consentSummary: {
            cmpDetected: true,
            contentObstructed: true,
            cookieWallDetected: true,
            managePresent: true,
            rejectDepthClass: "deeper_layer",
            rejectPresent: false,
            rejectRequiresMoreClicks: true,
            surfaceType: "modal"
          },
          consentVisual: {
            rejectHidden: true
          }
        }
      },
      snapshot: {}
    })
  );

  const finding = findings.find((item) => item.ruleKey === "runtime_privacy.consent_interface_obstructive");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
});

test("fujifilm-style consent-wall bundle surfaces obstructive consent plus legal coverage gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      runtimeArtifacts: {
        third_party_request_count: 29,
        hybrid_runtime_evidence: {
          consentSummary: {
            cmpDetected: true,
            contentObstructed: true,
            cookieWallDetected: true,
            managePresent: true,
            rejectDepthClass: "deeper_layer",
            rejectPresent: false,
            rejectRequiresMoreClicks: true,
            surfaceType: "modal"
          },
          consentVisual: {
            rejectHidden: true
          }
        }
      },
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        homepage_fetch_status: "redirected",
        partial_scan: true,
        preconsent_tracking_detected: true,
        tracker_count_total: 1,
        tracker_vendor_count: 1,
        verified_public_surfaces_count: 0
      },
      trackerVendors: []
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    "runtime_privacy.consent_interface_obstructive",
    "access_review.legal_coverage_unverified"
  ]);
});

test("alz-style bundle surfaces legal coverage gap alongside runtime privacy issues", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Meta", collection_endpoint_type: "request" },
        { vendor_name: "Google Analytics", collection_endpoint_type: "request" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: ["_fbp", "_ga"],
        third_party_request_count: 50,
        hybrid_runtime_evidence: {
          consentSummary: {
            cmpDetected: true,
            contentObstructed: true,
            cookieWallDetected: false,
            managePresent: true,
            rejectDepthClass: "deeper_layer",
            rejectPresent: false,
            rejectRequiresMoreClicks: true,
            surfaceType: "modal"
          },
          consentVisual: {
            rejectHidden: false
          },
          networkSummary: {
            totalRequestCount: 60
          }
        }
      },
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        cookie_policy_present: false,
        cookie_count_total: 60,
        partial_scan: true,
        preconsent_tracking_detected: true,
        privacy_policy_present: false,
        terms_of_service_present: false,
        third_party_cookie_count: 54,
        tracker_count_total: 6,
        tracker_vendor_count: 6,
        verified_public_surfaces_count: 0
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Meta"
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    "access_review.legal_coverage_unverified",
    "runtime_privacy.preconsent_tracking_observed",
    "runtime_privacy.consent_interface_obstructive"
  ]);
});

test("dnb-style timeout bundle surfaces legal coverage gap and pre-consent tracking", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      preconsentViolations: [
        { vendor_name: "Google Tag Manager", collection_endpoint_type: "request" },
        { vendor_name: "LinkedIn", collection_endpoint_type: "request" }
      ],
      runtimeArtifacts: {
        initial_cookie_names: [],
        third_party_request_count: 12,
        hybrid_runtime_evidence: {
          networkSummary: {
            totalRequestCount: 20
          }
        }
      },
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        cookie_policy_present: false,
        cookie_count_total: 0,
        homepage_fetch_status: "timeout",
        partial_scan: true,
        preconsent_tracking_detected: true,
        privacy_policy_present: false,
        terms_of_service_present: false,
        third_party_cookie_count: 0,
        tracker_count_total: 2,
        tracker_vendor_count: 2,
        verified_public_surfaces_count: 0
      },
      trackerVendors: [
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "Google Tag Manager"
        },
        {
          before_consent: true,
          first_party_or_third_party: "third_party",
          vendor_name: "LinkedIn"
        }
      ]
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), [
    "access_review.legal_coverage_unverified",
    "runtime_privacy.preconsent_tracking_observed"
  ]);
});

test("kurier-style error bundle only surfaces legal coverage gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          document_type: "privacy_policy",
          extraction_status: "failed",
          source_status: "rejected"
        },
        {
          document_type: "cookie_policy",
          extraction_status: "failed",
          source_status: "rejected"
        },
        {
          document_type: "terms_of_service",
          extraction_status: "failed",
          source_status: "rejected"
        }
      ],
      pages: [],
      policyEnrichments: [],
      policyReviewQueue: [],
      preconsentViolations: [],
      runtimeArtifacts: {
        initial_cookie_names: []
      } as Record<string, unknown>,
      snapshot: {
        blocked_flag: false,
        captcha_flag: false,
        cookie_policy_present: false,
        cookie_count_total: 0,
        homepage_fetch_status: "error",
        partial_scan: true,
        preconsent_tracking_detected: false,
        privacy_policy_present: false,
        terms_of_service_present: false,
        third_party_cookie_count: 0,
        tracker_count_total: 0,
        tracker_vendor_count: 0,
        verified_public_surfaces_count: 0
      },
      trackerVendors: []
    })
  );

  assert.deepEqual(findings.map((finding) => finding.ruleKey), ["access_review.legal_coverage_unverified"]);
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

test("partial privacy extraction with strong governance cues does not synthesize missing technical disclosure", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_actionable_flags: ["blocked_homepage_direct_policy_page", "llm_budget_exhausted", "low_confidence"],
          policy_dsar_mechanism: "partial",
          policy_retention_periods: ["for as long as necessary"],
          policy_mentions: [{ topic: "privacy_rights" }],
          policy_ambiguity_score: 34,
          policy_semantic_confidence: 0.54,
          policy_summary_short: "Privacy & Security hub explains privacy rights and how to protect your information.",
          policy_evidence_snippets: {
            dsar: "hash-1",
            notice_contact: "hash-2",
            "rights_signal:access": "hash-3"
          }
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

  assert.equal(findings.some((finding) => finding.ruleKey === "policy_runtime.missing_technical_disclosure"), false);
});

test("misrouted marketing page extraction does not synthesize missing technical disclosure", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "policy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/legal/privacy",
          policy_actionable_flags: ["blocked_homepage_direct_policy_page", "missing_dsar", "vague_retention"],
          policy_dsar_mechanism: "absent",
          policy_retention_periods: [],
          policy_mentions: [{ topic: "data_retention" }],
          policy_ambiguity_score: 68,
          policy_semantic_confidence: 0.54,
          policy_summary_short:
            "Example Product | Experience Cloud Home Products Solutions Pricing Request Demo Marketing Automation",
          policy_evidence_snippets: {
            "topic:data_retention": "hash-1",
            policy_rights_signals: []
          }
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

  assert.equal(findings.some((finding) => finding.ruleKey === "policy_runtime.missing_technical_disclosure"), false);
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
  assert.equal(findings.filter((item) => item.ruleKey === "policy_runtime.disclosure_likely_obstructed").length, 0);
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

test("infrastructure load-balancer cookies do not trigger a disclosure gap on their own", () => {
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
        initial_cookie_names: ["AWSALBCORS"]
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "cookie_runtime.disclosure_gap"));
});

test("cookie disclosure gap ignores infrastructure cookies and keeps substantive unmatched cookies", () => {
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
              vendor: "google.com",
              cookies: ["_ga"],
              cookie_type: "measurement_performance"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["AWSALBCORS", "_mkto_trk"],
        hybrid_runtime_evidence: {
          cookieWriteObservations: [
            { cookieName: "AWSALBCORS", thirdParty: true },
            { cookieName: "_mkto_trk", thirdParty: false }
          ]
        }
      } as Record<string, unknown>
    })
  );

  const finding = findings.find((item) => item.ruleKey === "cookie_runtime.disclosure_gap");
  assert.ok(finding);
  assert.equal(finding?.severity, "medium");
  assert.deepEqual(finding?.evidence.unmatched_cookie_names, ["_mkto_trk"]);
  assert.deepEqual(finding?.evidence.ignored_runtime_cookie_names, ["awsalbcors"]);
  assert.equal(finding?.evidence.unmatched_third_party_cookie_count, 0);
});

test("undisclosed third-party runtime cookie keeps high cookie disclosure gap severity", () => {
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
              vendor: "google.com",
              cookies: ["_ga"],
              cookie_type: "measurement_performance"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        hybrid_runtime_evidence: {
          cookieWriteObservations: [{ cookieName: "_fbp", thirdParty: true }]
        }
      } as Record<string, unknown>
    })
  );

  const finding = findings.find((item) => item.ruleKey === "cookie_runtime.disclosure_gap");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.evidence.unmatched_third_party_cookie_count, 1);
});

test("cookie runtime matching understands vendor-and-cookies disclosure rows", () => {
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
              vendor: "example.com",
              cookies: ["_mkto_trk", "_ga"],
              cookie_type: "marketing_targeting"
            }
          ]
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_mkto_trk"]
      } as Record<string, unknown>
    })
  );

  assert.equal(findings.some((finding) => finding.ruleKey === "cookie_runtime.disclosure_gap"), false);
  assert.equal(findings.some((finding) => finding.ruleKey === "cookie_runtime.cookie_policy_obstructed"), false);
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

test("rich category-based cookie semantics without parsed rows do not trigger a disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.88,
          policy_summary_short:
            "Cookie settings explain third-party cookies, targeting cookies, and measurement/performance categories.",
          policy_cookie_disclosures: []
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["session-id", "ubid-main"]
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.disclosure_gap"));
  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.cookie_policy_obstructed"));
});

test("category-based cookie disclosure with settings and consent language suppresses disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://www.example.com/cookies",
          policy_actionable_flags: [],
          policy_semantic_confidence: 0.9,
          policy_summary_short:
            "Cookie Preferences explain required cookies, functional cookies, advertising cookies, and that prior consent is required for non-essential cookies.",
          policy_cookie_disclosures: []
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["_ga", "_fbp"]
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.disclosure_gap"));
});

test("semantic cookie-policy topics without parsed rows suppress disclosure gap", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "cookie-1",
          page_type: "cookie_policy",
          page_url: "https://mailchimp.com/legal/cookies",
          policy_actionable_flags: ["blocked_homepage_direct_policy_page", "vague_retention"],
          policy_semantic_confidence: 0.66,
          policy_mentions: [
            { topic: "cookie_tracking_technologies_disclosure", confidence: 0.82 },
            { topic: "cookie_third_party_advertising_disclosure", confidence: 0.82 },
            { topic: "cookie_data_retention", confidence: 0.82 }
          ],
          policy_summary_short: "Mailchimp's Cookie Statement",
          policy_cookie_disclosures: []
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {
        initial_cookie_names: ["ak_bmsc", "bm_sz", "_mcid"]
      } as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.disclosure_gap"));
  assert.ok(!findings.some((item) => item.ruleKey === "cookie_runtime.cookie_policy_obstructed"));
});

test("primary privacy policy prose retention disclosure suppresses retention finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_retention_periods: [],
          policy_summary_short:
            "How long do we keep your Personal Data? We may retain your Personal Data for a period of time consistent with the original purpose of collection and legal obligations, after which it will be deleted."
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {} as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
});

test("matched ready privacy document source retention cue suppresses retention finding", () => {
  const findings = deriveValidationFindings(
    buildArtifacts({
      documentSources: [
        {
          canonical_url: "https://www.example.com/privacy",
          document_text:
            "How long do we keep your Personal Data? We may retain your Personal Data for a period of time consistent with the original purpose of collection or as long as required to fulfill legal obligations.",
          document_type: "privacy_policy",
          extraction_status: "insufficient",
          source_status: "ready"
        }
      ],
      policyEnrichments: [
        {
          id: "privacy-1",
          page_type: "privacy_policy",
          page_url: "https://www.example.com/privacy",
          policy_retention_periods: [],
          policy_summary_short: "Privacy statement describes collection, use, rights, and sharing."
        }
      ],
      policyReviewQueue: [],
      snapshot: {},
      runtimeArtifacts: {} as Record<string, unknown>
    })
  );

  assert.ok(!findings.some((finding) => finding.ruleKey === "section_review.no_retention_periods_noted"));
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
