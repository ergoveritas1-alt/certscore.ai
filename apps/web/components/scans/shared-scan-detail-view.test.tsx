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

async function loadFilterContradictoryPositiveSurfaceFindings() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      filterContradictoryPositiveSurfaceFindings?: unknown;
    }
  ).filterContradictoryPositiveSurfaceFindings
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
    filterContradictoryPositiveSurfaceFindings: (findings: Array<Record<string, unknown>>) => Array<Record<string, unknown>>;
  }).filterContradictoryPositiveSurfaceFindings;
}

async function loadHasIncompleteScanCoverage() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule = (
    sharedScanDetailViewImport as unknown as {
      default?: Record<string, unknown>;
      "module.exports"?: Record<string, unknown>;
      hasIncompleteScanCoverage?: unknown;
    }
  ).hasIncompleteScanCoverage
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
    hasIncompleteScanCoverage: (scanRecord: Record<string, unknown>) => boolean;
  }).hasIncompleteScanCoverage;
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

async function loadExecutiveSummaryBadgeCounts() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveSummaryBadgeCounts?: unknown })
      .deriveExecutiveSummaryBadgeCounts
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
    deriveExecutiveSummaryBadgeCounts: (
      findings: Array<{
        details?: { family?: string };
        presentationDecision: { status: string };
        surfacingDecision?: { decisionState?: string; reportLane?: string };
        unifiedFindingId: string;
      }>
    ) => {
      contradictionCount: number;
      preconsentConflictCount: number;
    };
  }).deriveExecutiveSummaryBadgeCounts;
}

async function loadExecutiveSummaryThemeHelpers() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (
      sharedScanDetailViewImport as unknown as {
        deriveAgencyAdvisoryThemes?: unknown;
        deriveExecutiveSummaryThemeNarrative?: unknown;
      }
    ).deriveAgencyAdvisoryThemes
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

  return sharedScanDetailViewModule as unknown as {
    deriveAgencyAdvisoryThemes: (findings: Array<{ details?: { family?: string } }>) => string[];
    deriveExecutiveSummaryThemeNarrative: (themes: string[]) => string;
  };
}

async function loadExecutiveDisplayedScore() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveDisplayedScore?: unknown })
      .deriveExecutiveDisplayedScore
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
    deriveExecutiveDisplayedScore: (input: {
      findings: Array<{ id: string; severity?: string }>;
      previewMode?: "full" | "homepage";
      snapshot: Record<string, unknown> | null;
      storedScore: number | null;
    }) => number | null;
  }).deriveExecutiveDisplayedScore;
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

async function loadFindingEvidenceDiagnosticRows() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveFindingEvidenceDiagnosticRows?: unknown })
      .deriveFindingEvidenceDiagnosticRows
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
    deriveFindingEvidenceDiagnosticRows: (
      findings: Array<{
        concernContext?: { negativeEvidenceFlags?: string[] };
        evidence?: { fetchQuality?: string | null };
        presentation: { findingName: string };
        presentationDecision: {
          status: string;
          verificationLabel: string;
        };
        surfacingDecision: {
          decisionState: string;
          reportLane: string;
        };
      }>
    ) => Array<{
      decisionState: string;
      fetchQuality: string | null;
      findingName: string;
      negativeEvidenceFlags: string[];
      reportLane: string;
      status: string;
      verificationLabel: string;
    }>;
  }).deriveFindingEvidenceDiagnosticRows;
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

async function loadExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { deriveExecutiveAccessLimitationNotice?: unknown })
      .deriveExecutiveAccessLimitationNotice
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
    deriveExecutiveAccessLimitationNotice: (
      snapshot: Record<string, unknown>,
      scanEvents?: Array<{ eventType: string; message: string; metadataJson: unknown }>,
      policyEnrichments?: Array<Record<string, unknown>>
    ) =>
      | {
          summary: string;
          finding: { label: string; shortSummary: string };
          review: { coverageLabel: string; outcomeTitle: string; reason: string; title: string };
        }
      | null;
  }).deriveExecutiveAccessLimitationNotice;
}

async function loadSelectExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { selectExecutiveAccessLimitationNotice?: unknown })
      .selectExecutiveAccessLimitationNotice
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
    selectExecutiveAccessLimitationNotice: (input: {
      allExecutiveFindings: unknown[];
      notice: unknown;
      topExecutiveFindings: unknown[];
    }) => unknown;
  }).selectExecutiveAccessLimitationNotice;
}

async function loadPreviewExecutiveAccessLimitationNotice() {
  const sharedScanDetailViewImport = await import("./shared-scan-detail-view");
  const sharedScanDetailViewModule =
    (sharedScanDetailViewImport as unknown as { buildPreviewExecutiveAccessLimitationNotice?: unknown })
      .buildPreviewExecutiveAccessLimitationNotice
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
    buildPreviewExecutiveAccessLimitationNotice: (input: {
      resultState: {
        code?: string;
        coverageLevel?: string;
        message: string;
        title: string;
      };
      review: Record<string, unknown> | null;
    }) => {
      finding: { shortSummary: string };
      review: { coverageLabel: string; verifiedSurfaces: string[] };
      summary: string;
    };
  }).buildPreviewExecutiveAccessLimitationNotice;
}

test("buildScanReportUnifiedFindings suppresses standalone privacy-rights paths when they do not support a stronger finding", async () => {
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

  assert.equal(rightsFinding, undefined);
});

test("buildScanReportUnifiedFindings suppresses standalone positive surfaces and thin affiliate evidence", async () => {
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
  assert.equal(affiliateFinding, undefined);
});

test("buildScanReportUnifiedFindings suppresses contradictory missing-surface review findings when matching positive signals exist", async () => {
  const buildScanReportUnifiedFindings = await loadBuildScanReportUnifiedFindings();

  const findings = buildScanReportUnifiedFindings({
    accessibilityRuleCounts: [],
    accessibilityRuleExamples: [],
    policyEnrichment: [],
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
    signals: [
      {
        category: "privacy",
        key: "privacy.privacy_contact_channel_missing",
        label: "Privacy contact path missing",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "privacy",
        key: "privacy.privacy_contact_path_present",
        label: "Privacy contact path present",
        primaryCategory: "policies_rights_disclosures",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "accessibility",
        key: "accessibility.accessibility_support_path_missing",
        label: "Accessibility support path missing",
        primaryCategory: "access_barriers_task_completion",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      },
      {
        category: "accessibility",
        key: "accessibility.accessibility_contact_method_present",
        label: "Accessibility support path present",
        primaryCategory: "accessibility_commitments_conformance_support",
        primaryCategoryDescription: "",
        primaryCategoryLabel: "",
        subcategory: null,
        value: true,
        valueType: "boolean"
      }
    ],
    snapshot: {
      accessibility_contact_method_present: true,
      domain: "example.com",
      privacy_contact_channel_type: "email"
    },
    trackerVendors: [],
    validationFindings: []
  });

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
});

test("filterContradictoryPositiveSurfaceFindings removes contradictory missing-surface packets from analyst detail", async () => {
  const filterContradictoryPositiveSurfaceFindings = await loadFilterContradictoryPositiveSurfaceFindings();

  const findings = filterContradictoryPositiveSurfaceFindings([
    {
      unifiedFindingId: "privacy_contact_channel_missing"
    },
    {
      unifiedFindingId: "privacy_contact_path_present"
    },
    {
      unifiedFindingId: "accessibility_support_path_missing"
    },
    {
      unifiedFindingId: "accessibility_support_path_present"
    },
    {
      unifiedFindingId: "forced_consent_wall"
    }
  ]);

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "forced_consent_wall"), true);
});

test("filterContradictoryPositiveSurfaceFindings removes contradictory title-matched packets when positive topics are present", async () => {
  const filterContradictoryPositiveSurfaceFindings = await loadFilterContradictoryPositiveSurfaceFindings();

  const findings = filterContradictoryPositiveSurfaceFindings([
    {
      title: "Privacy contact path missing",
      unifiedFindingId: "privacy_contact_channel_missing_variant"
    },
    {
      title: "Privacy contact path present",
      unifiedFindingId: "privacy_contact_path_present"
    },
    {
      title: "Accessibility support path missing",
      unifiedFindingId: "accessibility_support_path_missing_variant"
    },
    {
      title: "Accessibility support path present",
      unifiedFindingId: "accessibility_support_path_present"
    },
    {
      title: "Forced consent wall",
      unifiedFindingId: "forced_consent_wall"
    }
  ]);

  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_channel_missing_variant"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_missing_variant"), false);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "privacy_contact_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "accessibility_support_path_present"), true);
  assert.equal(findings.some((finding) => finding.unifiedFindingId === "forced_consent_wall"), true);
});

test("deriveExecutiveSummaryBadgeCounts only counts surfaced contradiction and pre-consent findings", async () => {
  const deriveExecutiveSummaryBadgeCounts = await loadExecutiveSummaryBadgeCounts();

  const counts = deriveExecutiveSummaryBadgeCounts([
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "audit_only" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "policy_behavior_conflict"
    },
    {
      details: { family: "consent_tracking" },
      presentationDecision: { status: "audit_only" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "preconsent_tracking"
    },
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "confirmed", reportLane: "main" },
      unifiedFindingId: "policy_behavior_conflict"
    },
    {
      details: { family: "contradiction" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "review", reportLane: "confidence_and_coverage" },
      unifiedFindingId: "privacy_policy_missing_surface"
    },
    {
      details: { family: "consent_tracking" },
      presentationDecision: { status: "surface" },
      surfacingDecision: { decisionState: "confirmed", reportLane: "main" },
      unifiedFindingId: "preconsent_tracking"
    }
  ]);

  assert.deepEqual(counts, {
    contradictionCount: 1,
    preconsentConflictCount: 1
  });
});

test("executive summary themes recognize financial-promotion findings", async () => {
  const { deriveAgencyAdvisoryThemes, deriveExecutiveSummaryThemeNarrative } = await loadExecutiveSummaryThemeHelpers();

  const themes = deriveAgencyAdvisoryThemes([
    { details: { family: "financial_promotion" } },
    { details: { family: "sensitive_data" } }
  ]);

  assert.deepEqual(themes, ["financial promotions and disclosure risk", "sensitive-data handling"]);
  assert.equal(
    deriveExecutiveSummaryThemeNarrative(themes),
    "The strongest patterns in this scan involve financial promotions and disclosure risk and sensitive-data handling."
  );
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

test("deriveFindingEvidenceDiagnosticRows keeps fetch quality and downgrade flags", async () => {
  const deriveFindingEvidenceDiagnosticRows = await loadFindingEvidenceDiagnosticRows();

  const rows = deriveFindingEvidenceDiagnosticRows([
    {
      concernContext: {
        negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed", "positive_surface_content_unverified"]
      },
      evidence: {
        fetchQuality: "blocked_interstitial"
      },
      presentation: {
        findingName: "Contact or feedback path present"
      },
      presentationDecision: {
        status: "audit_only",
        verificationLabel: "Blocked or interstitial"
      },
      surfacingDecision: {
        decisionState: "support_only",
        reportLane: "confidence_and_coverage"
      }
    }
  ]);

  assert.deepEqual(rows, [
    {
      decisionState: "support_only",
      fetchQuality: "blocked_interstitial",
      findingName: "Contact or feedback path present",
      negativeEvidenceFlags: ["blocked_or_interstitial_evidence_observed", "positive_surface_content_unverified"],
      reportLane: "confidence_and_coverage",
      status: "audit_only",
      verificationLabel: "Blocked or interstitial"
    }
  ]);
});

test("deriveExecutiveSummaryScanCondition flags blocked homepage scans", async () => {
  const deriveExecutiveSummaryScanCondition = await loadExecutiveSummaryScanCondition();

  const summary = deriveExecutiveSummaryScanCondition({
    homepage_fetch_status: "forbidden",
    pages_scanned: 0
  });

  assert.match(summary ?? "", /site limited automated access/i);
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

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(review?.coverageLabel, "No public verification available");
  assert.equal(review?.outcomeTitle, "Access limited by site protections");
  assert.equal(review?.reason, "Reason: homepage request was blocked with HTTP 403.");
  assert.equal(review?.recommendationTitle, "Protected-Site Workflow Recommended");
  assert.deepEqual(review?.verifiedSurfaces ?? [], []);
  assert.ok(review?.guidance.some((item) => /protected-domain result/i.test(item)));
  assert.match(review?.message ?? "", /site limited automated access from the scan environment/i);
});

test("deriveUnverifiedHomepageReview returns a robots-disallowed explanation", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    homepage_fetch_status: "blocked",
    pages_scanned: 0,
    robots_allowed: false
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.match(review?.reason ?? "", /robots/i);
  assert.match(review?.message ?? "", /public crawler access was restricted/i);
});

test("deriveExecutiveAccessLimitationNotice suppresses normal findings on blocked scans with no verified public surfaces", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice(
    {
      blocked_flag: false,
      coverage_level: "limited_partial",
      homepage_fetch_http_status: 200,
      homepage_fetch_status: "ok",
      pages_scanned: 1,
      verified_public_surfaces_count: 0
    },
    [
      {
        eventType: "runtime.build_phase_diagnostic",
        message: "Build phase hybrid_auto_decision ok.",
        metadataJson: {
          phase: "hybrid_auto_decision",
          reason: "http_block_status",
          reasonDetail: "Local main document returned 403.",
          finalDocumentStatus: 403
        }
      }
    ]
  );

  assert.equal(notice?.finding.label, "Public site access was limited");
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
  assert.equal(notice?.review.coverageLabel, "No public verification available");
  assert.match(notice?.finding.shortSummary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("deriveExecutiveAccessLimitationNotice stays off when blocked scans still verified public policy surfaces", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    blocked_flag: true,
    homepage_fetch_http_status: 403,
    homepage_fetch_status: "forbidden",
    pages_scanned: 0,
    privacy_policy_present: true,
    verified_public_surfaces_count: 1
  });

  assert.equal(notice, null);
});

test("deriveExecutiveAccessLimitationNotice suppresses healthy-looking summaries for unreachable homepages", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    certscore_overall: 81,
    coverage_level: "limited_none",
    homepage_fetch_status: "error",
    pages_scanned: 0,
    scan_outcome: "transport_failure",
    total_signals: 0,
    verified_public_surfaces_count: 0
  });

  assert.equal(notice?.review.title, "Transport failure");
  assert.equal(notice?.review.coverageLabel, "No public verification available");
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
  assert.match(notice?.finding.shortSummary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("deriveExecutiveAccessLimitationNotice suppresses healthy-looking summaries for not-found homepages", async () => {
  const deriveExecutiveAccessLimitationNotice = await loadExecutiveAccessLimitationNotice();

  const notice = deriveExecutiveAccessLimitationNotice({
    certscore_overall: 81,
    homepage_fetch_http_status: 404,
    homepage_fetch_status: "not_found",
    pages_scanned: 0,
    scan_outcome: "domain_inactive_or_unstable",
    total_signals: 0,
    verified_public_surfaces_count: 0
  });

  assert.equal(notice?.review.title, "Domain inactive or unstable");
  assert.equal(notice?.review.outcomeTitle, "Domain inactive or unstable");
  assert.match(notice?.review.reason ?? "", /HTTP 404 Not Found/i);
  assert.match(notice?.summary ?? "", /No reliable privacy or consent findings were retained/i);
});

test("hasIncompleteScanCoverage suppresses partial flag when retained coverage is substantial", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 3,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 3,
        partial_scan: true,
        report_finding_count: 16,
        total_signals: 37,
        verified_public_surfaces_count: 2
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage accepts verified public surfaces as retained coverage", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 1,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 1,
        partial_scan: true,
        report_finding_count: 16,
        total_signals: 37,
        verified_public_surfaces_count: 3
      }
    }),
    false
  );
});

test("hasIncompleteScanCoverage keeps warning for thin or hard-limited coverage", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 1,
        status: "completed"
      },
      snapshot: {
        blocked_flag: true,
        coverage_level: "limited_partial",
        pages_scanned: 1,
        partial_scan: true,
        report_finding_count: 0,
        total_signals: 4,
        verified_public_surfaces_count: 0
      }
    }),
    true
  );
});

test("hasIncompleteScanCoverage keeps warning for partial scans with few retained findings", async () => {
  const hasIncompleteScanCoverage = await loadHasIncompleteScanCoverage();

  assert.equal(
    hasIncompleteScanCoverage({
      events: [],
      scan: {
        pagesRequested: 3,
        pagesScanned: 3,
        status: "completed"
      },
      snapshot: {
        coverage_level: "limited_partial",
        incomplete_pages: true,
        pages_scanned: 3,
        partial_scan: true,
        report_finding_count: 0,
        total_signals: 81,
        verified_public_surfaces_count: 2
      }
    }),
    true
  );
});

test("selectExecutiveAccessLimitationNotice does not replace retained unified findings", async () => {
  const selectExecutiveAccessLimitationNotice = await loadSelectExecutiveAccessLimitationNotice();
  const notice = {
    finding: { label: "Public site access was limited" },
    review: { coverageLabel: "No public verification available" },
    summary: "No reliable findings were retained."
  };

  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [{ id: "guaranteed_outcome_claim_detected" }],
      notice,
      topExecutiveFindings: [{ id: "guaranteed_outcome_claim_detected" }]
    }),
    null
  );
  assert.equal(
    selectExecutiveAccessLimitationNotice({
      allExecutiveFindings: [],
      notice,
      topExecutiveFindings: []
    }),
    notice
  );
});

test("buildPreviewExecutiveAccessLimitationNotice preserves limited homepage preview withholding", async () => {
  const buildPreviewExecutiveAccessLimitationNotice = await loadPreviewExecutiveAccessLimitationNotice();

  const notice = buildPreviewExecutiveAccessLimitationNotice({
    resultState: {
      code: "unknown_access_limitation",
      coverageLevel: "limited_partial",
      message:
        "This run could not fully verify public pages because the site limited automated access from the scan environment. This does not by itself mean expected disclosures are absent.",
      title: "Access limited by site protections"
    },
    review: {
      coverageLabel: "Partial public verification available",
      guidance: ["Retry from a normal browsing session."],
      message: "Verified public surfaces detected: Privacy policy, Terms of service.",
      outcomeTitle: "Access limited during live browser verification",
      recommendationTitle: "Protected-Site Workflow Recommended",
      reason: "Reason: no specific reachability blocker was retained for this run.",
      title: "Access limited by site protections",
      verifiedPolicyInsights: [],
      verifiedSurfaces: ["Privacy policy", "Terms of service"],
      whatThisMeans: ["This run does not support trustworthy privacy conclusions."]
    }
  });

  assert.match(notice.summary, /Preview scores were withheld/i);
  assert.equal(notice.review.coverageLabel, "Partial public verification available");
  assert.deepEqual(notice.review.verifiedSurfaces, ["Privacy policy", "Terms of service"]);
  assert.match(notice.finding.shortSummary, /site limited automated access/i);
});

test("deriveExecutiveDisplayedScore clamps homepage preview overall score to the weaker consent subscore when runtime findings are consent-driven", async () => {
  const deriveExecutiveDisplayedScore = await loadExecutiveDisplayedScore();

  const score = deriveExecutiveDisplayedScore({
    findings: [
      { id: "pre_consent_tracking_detected" },
      { id: "asymmetric_consent_ui" },
      { id: "reject_option_missing_or_hidden" }
    ],
    previewMode: "homepage",
    snapshot: {
      consent_score: 53,
      privacy_score: 73
    },
    storedScore: 75
  });

  assert.equal(score, 53);
});

test("deriveExecutiveDisplayedScore withholds contradictory zeroed homepage preview scores when evidence was retained", async () => {
  const deriveExecutiveDisplayedScore = await loadExecutiveDisplayedScore();

  const score = deriveExecutiveDisplayedScore({
    findings: [{ id: "pre_consent_tracking_detected" }],
    previewMode: "homepage",
    snapshot: {
      consent_score: 0,
      homepage_fetch_http_status: 200,
      homepage_fetch_status: "ok",
      pages_scanned: 0,
      privacy_policy_present: true,
      privacy_score: 0,
      terms_of_service_present: true,
      total_signals: 9,
      tracking_before_consent_detected: true
    },
    storedScore: 0
  });

  assert.equal(score, null);
});

test("deriveExecutiveDisplayedScore applies financial penalty for full scans with severe financial findings", async () => {
  const deriveExecutiveDisplayedScore = await loadExecutiveDisplayedScore();

  const score = deriveExecutiveDisplayedScore({
    findings: [
      { id: "guaranteed_outcome_claim_detected", severity: "critical" },
      { id: "leveraged_or_high_risk_product_promotion", severity: "high" }
    ],
    previewMode: "full",
    snapshot: null,
    storedScore: 76
  });

  // Financial score: 84 - 24 - 20 - 6 = 34
  // Penalty: max(0, (60 - 34) * 0.5) = 13
  // Adjusted: max(34, 76 - 13) = 63
  assert.equal(score, 63);
});

test("deriveExecutiveDisplayedScore caps homepage preview by financial score and consent subscore", async () => {
  const deriveExecutiveDisplayedScore = await loadExecutiveDisplayedScore();

  const score = deriveExecutiveDisplayedScore({
    findings: [
      { id: "guaranteed_outcome_claim_detected", severity: "critical" },
      { id: "pre_consent_tracking_detected", severity: "high" }
    ],
    previewMode: "homepage",
    snapshot: {
      consent_score: 53,
      privacy_score: 73
    },
    storedScore: 76
  });

  // Financial score: 84 - 24 - 6 = 54
  // Penalty: max(0, (60 - 54) * 0.5) = 3
  // Financial adjusted: max(54, 76 - 3) = 73
  // Then consent cap: min(73, 53) = 53
  assert.equal(score, 53);
});

test("deriveExecutiveDisplayedScore returns storedScore unchanged when no financial findings exist", async () => {
  const deriveExecutiveDisplayedScore = await loadExecutiveDisplayedScore();

  const score = deriveExecutiveDisplayedScore({
    findings: [{ id: "pre_consent_tracking_detected", severity: "high" }],
    previewMode: "full",
    snapshot: null,
    storedScore: 76
  });

  assert.equal(score, 76);
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

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(
    review?.reason,
    "Reason: homepage request was rate-limited with HTTP 429 before the scanner could verify a usable page surface."
  );
});

test("deriveUnverifiedHomepageReview skips blocked-access framing for evidence-rich zero-page previews with successful homepage fetches", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    cookie_policy_present: true,
    homepage_fetch_http_status: 200,
    homepage_fetch_status: "ok",
    pages_scanned: 0,
    preconsent_tracking_detected: true,
    privacy_policy_present: true,
    terms_of_service_present: true,
    total_signals: 9,
    tracking_before_consent_detected: true
  });

  assert.equal(review, null);
});

test("deriveUnverifiedHomepageReview returns a generic zero-pages explanation when no stronger blocker is retained", async () => {
  const deriveUnverifiedHomepageReview = await loadUnverifiedHomepageReview();

  const review = deriveUnverifiedHomepageReview({
    pages_scanned: 0
  });

  assert.equal(review?.title, "Access limited by site protections");
  assert.equal(review?.reason, "Reason: no specific reachability blocker was retained for this run.");
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
    normalized_body_hash: "homepage-content",
    pages_scanned: 1
  });

  assert.equal(review, null);
});
