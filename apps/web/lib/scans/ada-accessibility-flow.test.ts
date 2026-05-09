import assert from "node:assert/strict";
import test from "node:test";

import { buildRegulatoryLensesFromUnifiedPackets } from "../../components/scans/executive-summary-card";
import { normalizePersistedAccessibilityRuleExamples, type PersistedAccessibilityRuleExampleRow } from "./accessibility-evidence";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import type { ScanValidationFinding } from "./validation-review-linking";

function makeValidationFinding(evidence: Record<string, unknown>): ScanValidationFinding {
  return {
    agreementScore: null,
    category: null,
    description: "Scanner-derived accessibility risk indicators were elevated and warrant manual accessibility review.",
    evidence,
    findingFamily: null,
    findingScope: null,
    findingSource: null,
    findingSubject: null,
    id: "val-ada-flow",
    model: null,
    modelConfidence: null,
    pageUrl: "https://example.com/",
    promptVersion: null,
    rationale: null,
    ruleKey: "scan_snapshot.accessibility.accessibility_risk_score",
    severity: "medium",
    subtype: null,
    systemConfidenceBand: null,
    systemConfidenceExplanation: null,
    systemConfidenceScore: null,
    title: "Accessibility risk score",
    verdict: null
  };
}

test("ADA accessibility flow promotes persisted WS axe examples into the DOJ ADA executive lens", () => {
  const persistedRows = [
    {
      description: "Buttons must have discernible text",
      help: "Buttons must have discernible text",
      help_url: "https://dequeuniversity.com/rules/axe/4.10/button-name",
      impact: "critical",
      node_count: 1,
      page_url: "https://example.com/",
      representative_selectors: ["button"],
      rule_code: "button-name",
      rule_group: "wcag2a",
      severity: "high"
    },
    {
      description: "Images must have alternate text",
      help: "Images must have alternate text",
      help_url: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      impact: "serious",
      node_count: 1,
      page_url: "https://example.com/products",
      representative_selectors: ["img"],
      rule_code: "image-alt",
      rule_group: "wcag2a",
      severity: "high"
    }
  ] satisfies PersistedAccessibilityRuleExampleRow[];
  const accessibilityRuleExamples = normalizePersistedAccessibilityRuleExamples(persistedRows);
  const validationFinding = makeValidationFinding({
    accessibilityRuleExamples,
    pageUrl: "https://example.com/",
    pageUrls: ["https://example.com/", "https://example.com/products"],
    supportingSignals: [
      "button-name on https://example.com/ (button)",
      "image-alt on https://example.com/products (img)"
    ],
    value: 88
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "semantic_labeling_accessibility_issue");
  assert.equal(packet?.presentationDecision.status, "surface");
  assert.equal(packet?.evidence?.flags?.includes("representative_accessibility_examples_retained"), true);
  assert.equal(packet?.evidence?.counts?.representativeAxeExampleCount, 2);
  assert.equal(packet?.evidence?.counts?.representativeAxePageCount, 2);
  assert.equal(packet?.evidence?.counts?.representativeAxeRuleCount, 2);
  assert.deepEqual(packet?.evidence?.entities?.maxAxeImpact, ["critical"]);

  const lenses = buildRegulatoryLensesFromUnifiedPackets([packet], {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 0
  });
  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens.minimal, undefined);
  assert.notEqual(adaLens.ratingLabel, "Audit-only");
  assert.ok(
    adaLens.findings.some((finding) =>
      /Representative axe examples: 2 rules across 2 pages; max impact: critical\./.test(finding.label)
    )
  );
});

test("ADA accessibility flow leaves score-only evidence audit-only with explicit telemetry", () => {
  const validationFinding = makeValidationFinding({
    pageUrl: "https://example.com/",
    value: 88
  });

  const [packet] = buildUnifiedFindingDisplayPackets({
    reviewFindingCandidates: [],
    validationFindings: [validationFinding],
    validationFindingLookup: new Map([[validationFinding.ruleKey, validationFinding]])
  });

  assert.equal(packet?.unifiedFindingId, "accessibility_risk_score");
  assert.equal(packet?.presentationDecision.status, "suppress");
  assert.equal(packet?.evidence?.flags?.includes("accessibility_score_only_audit_context"), false);
  assert.equal(packet?.concernContext?.negativeEvidenceFlags.includes("missing_representative_accessibility_examples"), true);

  const lenses = buildRegulatoryLensesFromUnifiedPackets(packet ? [packet] : [], {
    beforeConsentCookieCount: 0,
    thirdPartyRequestCount: 0
  });
  const adaLens = lenses.find((lens) => lens.acronym === "DOJ / ADA accessibility");

  assert.ok(adaLens);
  assert.equal(adaLens.minimal, true);
  assert.equal(adaLens.ratingLabel, "Audit-only");
  assert.equal(adaLens.score, null);
});
