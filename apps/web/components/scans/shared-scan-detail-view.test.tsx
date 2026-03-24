import assert from "node:assert/strict";
import test from "node:test";

test("buildScanReportUnifiedFindings keeps privacy-rights path when an earlier policy row has an empty rights array", async () => {
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

  const { buildScanReportUnifiedFindings } = sharedScanDetailViewModule as unknown as {
    buildScanReportUnifiedFindings: (scanRecord: Record<string, unknown>) => Array<Record<string, unknown>>;
  };

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
