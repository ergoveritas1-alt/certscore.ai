import { ACCESSIBILITY_AUDIT_VERSION, ACCESSIBILITY_WCAG_TAGS, type AccessibilityAuditObservation, type AccessibilityAuditProjection } from "./accessibility-audit.js";

export function accessibilityAuditFixture(overrides: Partial<AccessibilityAuditObservation> = {}): AccessibilityAuditObservation {
  const ids = ["image-alt", "label", "button-name", "color-contrast"];
  return {
    contractVersion: ACCESSIBILITY_AUDIT_VERSION, required: true, scanId: "00000000-0000-4000-8000-000000000123",
    sourceLane: "runtime_evidence", scope: "starting_page_rendered_content", documentUrl: "https://example.com/",
    documentToken: "loader-runtime", engine: "axe-core", engineVersion: "4.11.3", configuredTags: [...ACCESSIBILITY_WCAG_TAGS],
    status: "completed", startedAt: "2026-10-09T12:00:05.000Z", completedAt: "2026-10-09T12:00:06.000Z", durationMs: 1000,
    rulesEvaluated: ids, reviewItems: [], limitations: [],
    violations: ids.map(ruleId => ({ ruleId, impact: "serious", tags: ["wcag2a"],
      help: `Fix ${ruleId}`, description: `Observed ${ruleId}`, helpUrl: `https://dequeuniversity.com/rules/axe/4.11/${ruleId}`,
      nodeCount: 1, representativeNodes: [{ selectors: [`#${ruleId}`], htmlSnippet: "<input id>", failureSummary: `Fix ${ruleId}`,
        ...(ruleId === "color-contrast" ? { colorContrast: { foregroundColor: "#aaaaaa", backgroundColor: "#ffffff", contrastRatio: 2.3, requiredContrastRatio: 4.5, fontSize: "16px", fontWeight: "normal" } } : {}),
      }],
    })), ...overrides,
  };
}

export function accessibilityProjectionFixture(overrides: Partial<AccessibilityAuditObservation> = {}): AccessibilityAuditProjection {
  return { contractVersion: "certscore.accessibility-audit-projection.v1", verificationStatus: "verified", sourceHash: "a".repeat(64),
    evidenceRef: "CanonicalEvidenceBundle.json#accessibilityAudit", observation: accessibilityAuditFixture(overrides) };
}
