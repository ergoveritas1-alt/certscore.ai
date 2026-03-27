import assert from "node:assert/strict";
import test from "node:test";

async function loadBuildScanReportUnifiedFindings() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      buildScanReportUnifiedFindings?: unknown;
    }
  ).buildScanReportUnifiedFindings
    ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
    : (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      ).default ??
      (
        sharedScanDetailViewImport as unknown as {
          default?: Record<string, unknown>;
          "module.exports"?: Record<string, unknown>;
        }
      )["module.exports"] ??
      (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    buildScanReportUnifiedFindings: (scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>;
  }).buildScanReportUnifiedFindings;
}

async function loadExecutiveSummaryScanCondition() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveSummaryScanCondition?: unknown; deriveUnverifiedHomepageReview?: unknown })
      .deriveExecutiveSummaryScanCondition
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveExecutiveSummaryScanCondition: (snapshot: Record<string, unknown>) => string | null;
  }).deriveExecutiveSummaryScanCondition;
}

async function loadFindingEvidenceQualitySummary() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveFindingEvidenceQualitySummary?: unknown })
      .deriveFindingEvidenceQualitySummary
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveFindingEvidenceQualitySummary: (
      findings: Array<{
        presentationDecision: {
          status: string;
          verificationState: string;
        };
      }>
    ) => {
      auditOnlyCount: number;
      blockedCount: number;
      discoveredCount: number;
      runtimeCount: number;
      triageCount: number;
      verifiedCount: number;
    };
  }).deriveFindingEvidenceQualitySummary;
}

async function loadUnverifiedHomepageReview() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveUnverifiedHomepageReview?: unknown })
      .deriveUnverifiedHomepageReview
      ? (sharedScanDetailViewImport as unknown as Record<string, unknown>)
      : (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        ).default ??
        (
          sharedScanDetailViewImport as unknown as {
            default?: Record<string, unknown>;
            "module.exports"?: Record<string, unknown>;
          }
        )["module.exports"] ??
        (sharedScanDetailViewImport as unknown as Record<string, unknown>);

  return (sharedScanDetailViewModule as unknown as {
    deriveUnverifiedHomepageReview: (
      snapshot: Record<string, unknown>,
      scanEvents?: Array<{ eventType: string; message: string; metadataJson: unknown }>,
      policyEnrichments?: Array<Record<string, unknown>>
    ) =>
      | {
          coverageLabel: string;
          guidance: string[];
          message: string;
          outcomeTitle: string;
          recommendationTitle: string;
          reason: string;
          title: string;
          verifiedPolicyInsights: Array<{
            flags: string[];
            pageLabel: string;
            pageUrl: string | null;
            summary: string | null;
            topics: string[];
          }>;
          verifiedSurfaces: string[];
          whatThisMeans: string[];
        }
      | null;
  }).deriveUnverifiedHomepageReview;
}

test("buildScanReportUnifiedFindings keeps privacy-rights path when an earlier policy row has an empty rights array", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [
      {
        id: "terms-row",
        page_type: "terms_of_service",
        page_url: "https://example.com/terms",
        policy_rights_signals: [],
        policy_evidence_snippets: {}
      },
      {
        id: "privacy-row",
        page_type: "privacy_policy",
        page_url: "https://example.com/privacy",
        policy_summary_short: "Example privacy policy",
        policy_evidence_snippets: {
          policy_rights_signals: ["access", "delete", "authorized_agent"],
          "rights_signal:access": "Use our Privacy Rights Center to request access.",
          "rights_signal:delete": "Use our Privacy Rights Center to request deletion."
        }
      }
    ],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: null,
    scan: {
      completedAt: "",
      createdAt: "",
      domainHostname: "example.com",
      domainId: "domain-1",
      id: "scan-1",
      startedAt: "",
      status: "completed"
    },
    signals: [],
    snapshot: {
      domain: "example.com"
    },
    trackerVendors: [],
    validationFindings: []
  });

  const rightsFinding = findings.find((finding) => finding.unifiedFindingId === "privacy_rights_path_present");

  assert.ok(rightsFinding);
  assert.equal((rightsFinding as { presentationDecision?: { status?: string } }).presentationDecision?.status, "surface");
});

test("buildScanReportUnifiedFindings promotes snapshot-backed positive surfaces and keeps thin affiliate evidence audit-only", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [],
    policyReviewQueue: [],
    preconsentViolations: [],
    runtimeArtifacts: {
      key_page_discovery_summary: {
        pageSummaries: [
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/affiliates"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "affiliate_disclosure",
            stopReason: "covered"
          },
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/terms"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "terms_of_service",
            stopReason: "covered"
          },
          {
            attemptCount: 1,
            attemptedUrls: ["https://www.cnn.com/privacy"],
            bestDiscoverySource: "rendered_link",
            guessedOnly: false,
            pageType: "privacy_policy",
            stopReason: "covered"
          }
        ]
      }
    },
    scan: {
      completedAt: "",
      createdAt: "",
      domainHostname: "cnn.com",
      domainId: "domain-1",
      id: "scan-1",
      startedAt: "",
      status: "completed"
    },
    signals: [
      {
        category: "commerce",
        key: "commerce.affiliate_disclosure_present",
        label: "Affiliate disclosure present",
        primaryCategory: "consumer_protection_commercial_practices",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "privacy",
        key: "privacy.do_not_sell_link_present",
        label: "Do-not-sell link present",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "disclosure",
        key: "disclosure.terms_of_service_extraction_limited",
        label: "Terms page linked but automated extraction was limited",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: "https://www.cnn.com/terms",
        valueType: "text"
      },
      {
        category: "disclosure",
        key: "disclosure.terms_of_service_present",
        label: "Terms page fetched",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      }
    ],
    snapshot: {
      affiliate_disclosure_present: true,
      contact_page_present: true,
      do_not_sell_link_present: true,
      domain: "cnn.com",
      privacy_policy_present: true,
      terms_of_service_present: true
    },
    trackerVendors: [],
    validationFindings: []
  });

  const termsFinding = findings.find((finding) => finding.unifiedFindingId === "terms_of_service_present");
  const choicesFinding = findings.find((finding) => finding.unifiedFindingId === "targeted_advertising_choices_present");
  const affiliateFinding = findings.find((finding) => finding.unifiedFindingId === "affiliate_disclosure_present");

  assert.equal(termsFinding, undefined);
  assert.equal(choicesFinding, undefined);
  assert.ok(affiliateFinding);
  assert.equal((affiliateFinding as { presentationDecision?: { status?: string } }).presentationDecision?.status, "audit_only");
});

test("deriveFindingEvidenceQualitySummary counts verification states and audit-only findings", async () => {
  const deriveFindingEvidenceQualitySummary = await loadFindingEvidenceQualitySummary();

  const summary = deriveFindingEvidenceQualitySummary([
    { presentationDecision: { status: "surface", verificationState: "verified" } },
    { presentationDecision: { status: "audit_only", verificationState: "discovered" } },
    { presentationDecision: { status: "audit_only", verificationState: "blocked" } },
    { presentationDecision: { status: "surface", verificationState: "runtime" } },
    { presentationDecision: { status: "audit_only", verificationState: "triage" } }
  ]);

  assert.deepEqual(summary, {
    auditOnlyCount: 3,
    blockedCount: 1,
    discoveredCount: 1,
    runtimeCount: 1,
    triageCount: 1,
    verifiedCount: 1
  });
});

test("deriveExecutiveSummaryScanCondition flags blocked homepage scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    homepage_fetch_status: "forbidden",
    pages_scanned: 0
  });

  assert.match(summary ?? "", /homepage fetch was blocked/i);
  assert.match(summary ?? "", /Reason:/i);
});

test("deriveExecutiveSummaryScanCondition flags unreachable homepage scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    homepage_fetch_status: "error",
    pages_scanned: 0
  });

  assert.match(summary ?? "", /could not be reached reliably over the network/i);
  assert.match(summary ?? "", /Reason:/i);
});

test("deriveExecutiveSummaryScanCondition flags auth-wall scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    auth_wall_detected: true,
    pages_scanned: 0
  });

  assert.match(summary ?? "", /authentication wall/i);
});

test("deriveUnverifiedHomepageReview returns a one-off blocked-homepage explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "blocked",
    homepage_fetch_http_status: 403,
    pages_scanned: 0
  });

  assert.equal(review?.title, "Reachability blocked");
  assert.equal(review?.coverageLabel, "No public verification available");
  assert.equal(review?.outcomeTitle, "Reachability blocked");
  assert.equal(review?.reason, "Reason: homepage request was blocked with HTTP 403.");
  assert.equal(review?.recommendationTitle, "Protected-Site Workflow Recommended");
  assert.deepEqual(review?.verifiedSurfaces ?? [], []);
  assert.ok(review?.guidance.some((item) => /protected-domain result/i.test(item)));
  assert.match(review?.message ?? "", /anti-automation or access-control behavior/i);
});

test("deriveUnverifiedHomepageReview returns a robots-disallowed explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "blocked",
    pages_scanned: 0,
    robots_allowed: false
  });

  assert.equal(review?.title, "Reachability blocked");
  assert.match(review?.reason ?? "", /robots/i);
  assert.match(review?.message ?? "", /blocked for this scan path by crawler policy/i);
});

test("deriveUnverifiedHomepageReview carries verified privacy and terms surfaces on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0,
    privacy_policy_present: true,
    terms_of_service_present: true
  });

  assert.deepEqual(review?.verifiedSurfaces ?? [], ["Privacy policy", "Terms of service"]);
  assert.equal(review?.coverageLabel, "Partial public verification available");
  assert.match(review?.message ?? "", /Verified public surfaces detected: Privacy policy, Terms of service\./i);
});

test("deriveUnverifiedHomepageReview carries verified cookie policy and contact surfaces on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    contact_page_present: true,
    cookie_policy_present: true,
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0
  });

  assert.deepEqual(review?.verifiedSurfaces ?? [], ["Cookie policy", "Contact page"]);
  assert.equal(review?.coverageLabel, "Partial public verification available");
  assert.match(review?.message ?? "", /Verified public surfaces detected: Cookie policy, Contact page\./i);
});

test("deriveUnverifiedHomepageReview carries verified policy insights on blocked runs", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_http_status: 403,
      homepage_fetch_status: "forbidden",
      pages_scanned: 0,
      privacy_policy_present: true
    },
    [],
    [
      {
        page_type: "privacy_policy",
        page_url: "https://www.coinbase.com/legal/privacy",
        policy_summary_short: "Coinbase explains how it uses personal data and advertising-related disclosures.",
        policy_mentions: [{ topic: "data_retention" }, { topic: "cross_border_transfer" }],
        policy_actionable_flags: ["blocked_homepage_direct_policy_page", "vague_policy_language"]
      }
    ]
  );

  assert.equal(review?.verifiedPolicyInsights.length, 1);
  assert.equal(review?.verifiedPolicyInsights[0]?.pageLabel, "Privacy policy");
  assert.deepEqual(review?.verifiedPolicyInsights[0]?.topics, ["Data Retention", "Cross Border Transfer"]);
  assert.deepEqual(review?.verifiedPolicyInsights[0]?.flags, ["Vague Policy Language"]);
});

test("deriveUnverifiedHomepageReview returns an explicit rate-limited explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 429,
    homepage_fetch_status: "ok",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Reachability blocked");
  assert.equal(
    review?.reason,
    "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface."
  );
});

test("deriveUnverifiedHomepageReview returns a generic zero-pages explanation when no stronger blocker is retained", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    pages_scanned: 0
  });

  assert.equal(review?.title, "Verification incomplete");
  assert.equal(review?.reason, "Reason: the scanner did not capture any verified public pages during the live pass.");
});

test("deriveUnverifiedHomepageReview returns an explicit unreachable-homepage reason", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "error",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Transport failure");
  assert.match(review?.reason ?? "", /connection, DNS, TLS, or other transport failure/i);
});

test("deriveUnverifiedHomepageReview classifies not-found homepages as inactive or unstable", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_http_status: 404,
    homepage_fetch_status: "not_found",
    pages_scanned: 0
  });

  assert.equal(review?.title, "Domain inactive or unstable");
  assert.equal(review?.outcomeTitle, "Domain inactive or unstable");
  assert.equal(review?.reason, "Reason: homepage returned HTTP 404 Not Found.");
});

test("deriveUnverifiedHomepageReview prefers logged DNS failure reason when available", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_status: "error",
      pages_scanned: 0
    },
    [
      {
        eventType: "runtime.browser_pass_diagnostic",
        message: "Browser pass navigation error.",
        metadataJson: {
          error: "page.goto: net::ERR_NAME_NOT_RESOLVED at https://example.com/"
        }
      }
    ]
  );

  assert.equal(review?.title, "Transport failure");
  assert.equal(review?.reason, "Reason: homepage could not be reached because the domain failed DNS resolution.");
});

test("deriveUnverifiedHomepageReview recommends protected-site workflow for cloudflare challenge evidence", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview(
    {
      homepage_fetch_status: "forbidden",
      homepage_fetch_http_status: 403,
      pages_scanned: 0,
      robots_allowed: true
    },
    [
      {
        eventType: "access.limitations_detected",
        message: "Access limitations detected.",
        metadataJson: {
          botChallengeDetected: true,
          challengeHeaders: {
            server: "cloudflare",
            cfMitigated: "challenge"
          }
        }
      }
    ]
  );

  assert.equal(review?.recommendationTitle, "Protected-Site Workflow Recommended");
  assert.ok(review?.guidance.some((item) => /allowlisting or a supported review path/i.test(item)));
});

test("deriveUnverifiedHomepageReview returns null when the homepage was actually scanned", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "ok",
    pages_scanned: 1
  });

  assert.equal(review, null);
});
