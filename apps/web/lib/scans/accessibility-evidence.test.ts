import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRepresentativeAccessibilityCoverage,
  getRepresentativeAccessibilityExampleCoverage,
  normalizePersistedAccessibilityRuleExamples,
  type PersistedAccessibilityRuleExampleRow
} from "./accessibility-evidence";

test("normalizes persisted WS axe examples into WC accessibilityRuleExamples contract", () => {
  const persistedRows = [
    {
      description: "Buttons must have discernible text",
      help: "Buttons must have discernible text",
      help_url: "https://dequeuniversity.com/rules/axe/4.10/button-name",
      impact: "serious",
      node_count: 2,
      page_url: "https://example.com/",
      representative_selectors: ["button[aria-label='']"],
      rule_code: "button-name",
      rule_group: "wcag2a",
      severity: "serious"
    },
    {
      description: "Images must have alternate text",
      help: "Images must have alternate text",
      help_url: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      impact: "moderate",
      node_count: 1,
      page_url: "https://example.com/products",
      representative_selectors: ["img.product-photo"],
      rule_code: "image-alt",
      rule_group: "wcag2a",
      severity: "moderate"
    }
  ] satisfies PersistedAccessibilityRuleExampleRow[];

  const examples = normalizePersistedAccessibilityRuleExamples(persistedRows);
  const coverage = getRepresentativeAccessibilityExampleCoverage({ accessibilityRuleExamples: examples });

  assert.deepEqual(examples, [
    {
      description: "Buttons must have discernible text",
      help: "Buttons must have discernible text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name",
      impact: "serious",
      nodeCount: 2,
      pageUrl: "https://example.com/",
      representativeSelectors: ["button[aria-label='']"],
      ruleCode: "button-name",
      ruleGroup: "wcag2a",
      severity: "serious"
    },
    {
      description: "Images must have alternate text",
      help: "Images must have alternate text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt",
      impact: "moderate",
      nodeCount: 1,
      pageUrl: "https://example.com/products",
      representativeSelectors: ["img.product-photo"],
      ruleCode: "image-alt",
      ruleGroup: "wcag2a",
      severity: "moderate"
    }
  ]);
  assert.equal(coverage.representativeExampleCount, 2);
  assert.equal(coverage.distinctPageCount, 2);
  assert.equal(coverage.distinctRuleCount, 2);
  assert.equal(coverage.maxImpact, "serious");
  assert.equal(formatRepresentativeAccessibilityCoverage(coverage), "Representative axe examples: 2 rules across 2 pages; max impact: serious.");
});
