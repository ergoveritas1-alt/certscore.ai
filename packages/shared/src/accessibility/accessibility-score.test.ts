import assert from "node:assert/strict";
import test from "node:test";
import { computeAccessibilityScore } from "./accessibility-score";
import type { NormalizedAccessibilityFinding } from "../types/accessibility";

function makeFinding(
  overrides: Partial<NormalizedAccessibilityFinding> & { axeImpact: string; affectedNodeCount: number }
): NormalizedAccessibilityFinding {
  const { axeImpact, affectedNodeCount, axeRuleId, ...rest } = overrides;
  return {
    id: "test",
    label: "Test",
    pillar: "accessibility",
    section: "ada_accessibility_risk",
    evidenceCategory: "automated_wcag_violation",
    source: "axe_core",
    confidence: "strong",
    directVsInferred: "direct",
    severity: axeImpact === "critical" ? "critical" : axeImpact === "serious" ? "high" : "medium",
    axeRuleId: axeRuleId ?? "test-rule",
    axeImpact,
    wcag: [],
    affectedNodeCount,
    pageUrl: "https://example.com/",
    representativeSelectors: [".example"],
    helpUrl: "https://example.com/help",
    evidenceSummary: "Test summary",
    remediation: "Test remediation",
    ...rest
  };
}

test("no violations returns score 96", () => {
  const result = computeAccessibilityScore([]);
  assert.equal(result.score, 96);
  assert.equal(result.band, "low_risk");
  assert.ok(result.explanation.some((e) => e.includes("96")));
});

test("critical violation caps score at 79", () => {
  const findings = [makeFinding({ axeImpact: "critical", affectedNodeCount: 1, axeRuleId: "button-name" })];
  const result = computeAccessibilityScore(findings);
  assert.ok(result.score <= 79, `Expected score <= 79, got ${result.score}`);
  assert.equal(result.band, "moderate_risk");
});

test("serious violation reduces score correctly", () => {
  const findings = [makeFinding({ axeImpact: "serious", affectedNodeCount: 1, axeRuleId: "image-alt" })];
  const result = computeAccessibilityScore(findings);
  // 100 - 8 - 0.75 = 91.25 -> rounded 91
  assert.equal(result.score, 91);
  assert.equal(result.band, "low_risk");
});

test("moderate violation reduces score correctly", () => {
  const findings = [makeFinding({ axeImpact: "moderate", affectedNodeCount: 1, axeRuleId: "color-contrast" })];
  const result = computeAccessibilityScore(findings);
  // 100 - 4 - 0.35 = 95.65 -> rounded 96
  assert.equal(result.score, 96);
});

test("minor violation reduces score correctly", () => {
  const findings = [makeFinding({ axeImpact: "minor", affectedNodeCount: 1, axeRuleId: "tabindex" })];
  const result = computeAccessibilityScore(findings);
  // 100 - 1.5 - 0.15 = 98.35 -> rounded 98
  assert.equal(result.score, 98);
});

test("3+ serious families caps score at 72", () => {
  const findings = [
    makeFinding({ axeImpact: "serious", affectedNodeCount: 1, axeRuleId: "image-alt" }),
    makeFinding({ axeImpact: "serious", affectedNodeCount: 1, axeRuleId: "button-name" }),
    makeFinding({ axeImpact: "serious", affectedNodeCount: 1, axeRuleId: "link-name" })
  ];
  const result = computeAccessibilityScore(findings);
  assert.ok(result.score <= 72, `Expected score <= 72, got ${result.score}`);
});

test(">100 affected nodes caps score at 69", () => {
  const findings = [
    makeFinding({ axeImpact: "moderate", affectedNodeCount: 50, axeRuleId: "color-contrast" }),
    makeFinding({ axeImpact: "moderate", affectedNodeCount: 51, axeRuleId: "image-alt" })
  ];
  const result = computeAccessibilityScore(findings);
  assert.ok(result.score <= 69, `Expected score <= 69, got ${result.score}`);
});

test("score floor is 0", () => {
  const findings = Array.from({ length: 20 }, (_, i) =>
    makeFinding({ axeImpact: "critical", affectedNodeCount: 10, axeRuleId: `rule-${i}` })
  );
  const result = computeAccessibilityScore(findings);
  assert.equal(result.score, 0);
  assert.equal(result.band, "severe_risk");
});

test("family cap prevents excessive deduction per rule", () => {
  const findings = [makeFinding({ axeImpact: "critical", affectedNodeCount: 100, axeRuleId: "button-name" })];
  const result = computeAccessibilityScore(findings);
  // Without cap: 12 + 100 = 112. With cap: 25.
  // Score = 100 - 25 = 75, but critical cap -> 75 capped at 79 -> 75
  assert.equal(result.score, 75);
});

test("band boundaries are correct", () => {
  assert.equal(computeAccessibilityScore([makeFinding({ axeImpact: "minor", affectedNodeCount: 1, axeRuleId: "a" })]).band, "low_risk");
  assert.equal(computeAccessibilityScore([makeFinding({ axeImpact: "moderate", affectedNodeCount: 20, axeRuleId: "a" })]).band, "moderate_risk");
  assert.equal(computeAccessibilityScore([makeFinding({ axeImpact: "serious", affectedNodeCount: 20, axeRuleId: "a" })]).band, "moderate_risk");
});
