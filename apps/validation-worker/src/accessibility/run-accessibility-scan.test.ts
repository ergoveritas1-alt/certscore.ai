import assert from "node:assert/strict";
import test from "node:test";
import type { AxeViolationLike } from "@website-signal-risk-scanner/shared";
import { normalizeAxeViolations } from "./normalize-axe-violations";
import { computeAccessibilityScore, deriveBenchmarkLabel } from "@website-signal-risk-scanner/shared";

// Mocked axe fixtures
test("normalizeAxeViolations handles clean page (no violations)", () => {
  const findings = normalizeAxeViolations([], "https://example.com/");
  assert.equal(findings.length, 0);
  const score = computeAccessibilityScore(findings);
  assert.equal(score.score, 96);
});

test("normalizeAxeViolations handles one missing alt violation", () => {
  const violations: AxeViolationLike[] = [
    {
      id: "image-alt",
      impact: "serious",
      tags: ["cat.text-alternatives", "wcag2a", "wcag111", "section508", "section508.22.a", "ACT"],
      nodes: [{ target: ["img"] }],
      help: "Images must have alternate text",
      description: "Ensures <img> elements have alternate text or a role of none or presentation",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/image-alt"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.id, "missing_image_alt_text");
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.confidence, "strong");
  assert.equal(findings[0]?.affectedNodeCount, 1);
  assert.equal(findings[0]?.wcag.includes("WCAG2A"), true);
  assert.ok(findings[0]?.evidenceSummary.includes("image"));
});

test("normalizeAxeViolations handles many contrast failures", () => {
  const nodes = Array.from({ length: 25 }, (_, i) => ({ target: [`.text-${i}`] }));
  const violations: AxeViolationLike[] = [
    {
      id: "color-contrast",
      impact: "serious",
      tags: ["cat.color", "wcag2aa", "wcag141"],
      nodes,
      help: "Elements must have sufficient color contrast",
      description: "Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.id, "low_color_contrast");
  assert.equal(findings[0]?.affectedNodeCount, 25);
  assert.equal(findings[0]?.severity, "high");
});

test("normalizeAxeViolations handles critical ARIA issue", () => {
  const violations: AxeViolationLike[] = [
    {
      id: "aria-required-children",
      impact: "critical",
      tags: ["cat.aria", "wcag2a", "wcag131"],
      nodes: [{ target: ["[role='listbox']"] }],
      help: "Certain ARIA roles must contain particular children",
      description: "Ensures elements with an ARIA role that require child roles contain them",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/aria-required-children"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.id, "invalid_aria_structure");
  assert.equal(findings[0]?.severity, "critical");
  assert.equal(findings[0]?.confidence, "strong");
});

test("normalizeAxeViolations handles mixed serious/moderate/minor violations", () => {
  const violations: AxeViolationLike[] = [
    {
      id: "image-alt",
      impact: "serious",
      tags: ["wcag2a"],
      nodes: [{ target: ["img"] }],
      help: "Images must have alternate text"
    },
    {
      id: "color-contrast",
      impact: "moderate",
      tags: ["wcag2aa"],
      nodes: [{ target: [".text"] }],
      help: "Elements must have sufficient color contrast"
    },
    {
      id: "tabindex",
      impact: "minor",
      tags: ["wcag2a"],
      nodes: [{ target: ["div"] }],
      help: "Elements should not have tabindex greater than zero"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings.length, 3);

  const serious = findings.find((f) => f.axeRuleId === "image-alt");
  const moderate = findings.find((f) => f.axeRuleId === "color-contrast");
  const minor = findings.find((f) => f.axeRuleId === "tabindex");

  assert.equal(serious?.severity, "high");
  assert.equal(moderate?.severity, "medium");
  assert.equal(minor?.severity, "low");

  const score = computeAccessibilityScore(findings);
  assert.ok(score.score < 100);
});

test("benchmark labels are derived correctly", () => {
  assert.equal(deriveBenchmarkLabel(0, false), "better_than_typical");
  assert.equal(deriveBenchmarkLabel(5, false), "typical_or_better");
  assert.equal(deriveBenchmarkLabel(30, false), "typical");
  assert.equal(deriveBenchmarkLabel(75, false), "worse_than_typical");
  assert.equal(deriveBenchmarkLabel(75, true), "severe_outlier");
  assert.equal(deriveBenchmarkLabel(150, false), "severe_outlier");
});

test("normalized findings do not contain raw selectors or HTML", () => {
  const violations: AxeViolationLike[] = [
    {
      id: "image-alt",
      impact: "serious",
      tags: ["wcag2a"],
      nodes: [{ target: ["img"], html: "<img src='photo.jpg'>" }],
      help: "Images must have alternate text"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings.length, 1);
  // The normalized finding should not expose raw HTML
  assert.ok(!findings[0]?.evidenceSummary.includes("<img"));
  assert.ok(!findings[0]?.evidenceSummary.includes("src="));
});

test("unknown axe impact maps to medium severity", () => {
  const violations: AxeViolationLike[] = [
    {
      id: "custom-rule",
      impact: "unknown",
      tags: [],
      nodes: [{ target: ["div"] }],
      help: "Custom rule"
    }
  ];

  const findings = normalizeAxeViolations(violations, "https://example.com/");
  assert.equal(findings[0]?.severity, "medium");
  assert.equal(findings[0]?.confidence, "review");
});
