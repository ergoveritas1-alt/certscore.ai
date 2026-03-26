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

  assert.ok(termsFinding);
  assert.equal((termsFinding as { presentationDecision?: { status?: string } }).presentationDecision?.status, "surface");
  assert.ok(choicesFinding);
  assert.equal((choicesFinding as { presentationDecision?: { status?: string } }).presentationDecision?.status, "surface");
  assert.ok(affiliateFinding);
  assert.equal((affiliateFinding as { presentationDecision?: { status?: string } }).presentationDecision?.status, "audit_only");
});
