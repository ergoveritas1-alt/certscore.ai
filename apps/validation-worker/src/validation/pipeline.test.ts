import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNanoDocumentContentHash,
  buildNanoDocCandidateUrls,
  dedupeNanoDocumentSources,
  deriveValidationFindings,
  determineValidationCollectAction,
  getNanoDocumentSourceDedupKeys,
  isolateLikelyLegalDocumentText,
  looksLikeIntermediaryOrBlockPage,
  prioritizePendingNanoDocumentSources,
  resolveReusableNanoDocumentExtractions,
  selectNanoDocCandidates,
  selectPendingNanoDocumentSourcesForExtraction
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

  assert.equal(
    looksLikeIntermediaryOrBlockPage({
      canonicalUrl: "https://vercel.com/legal/privacy-policy",
      text: "Privacy Policy Sign in Contact Sales This Privacy Policy explains how Vercel collects and uses personal data.",
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
