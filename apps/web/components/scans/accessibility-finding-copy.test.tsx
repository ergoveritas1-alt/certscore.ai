import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { accessibilityAuditFixture, accessibilityProjectionFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { projectAccessibilityAuditSummary } from "../../lib/scans/accessibility-audit-evidence";
import { accessibilityFindingCopy } from "./accessibility-finding-copy";
import { AccessibilityEvidence } from "./accessibility-evidence";

test("review guidance stays conditional, including hidden-focus and contrast checks", () => {
  const base = accessibilityAuditFixture().violations[0]!;
  for (const ruleId of ["aria-hidden-focus", "color-contrast", "button-name", "label", "unknown-rule"]) {
    const rule = { ...base, ruleId };
    const before = structuredClone(rule);
    assert.match(accessibilityFindingCopy(rule, true).correction, /\bIf\b/);
    assert.deepEqual(rule, before);
  }
  assert.match(accessibilityFindingCopy({ ...base, ruleId: "aria-hidden-focus" }, true).correction, /Check whether keyboard focus enters hidden content/);
});

test("unrecognized rule keeps its description and suppresses an exact title repeat", () => {
  const rule = { ...accessibilityAuditFixture().violations[0]!, ruleId: "future-rule", help: "New check", description: "A unique engine explanation." };
  assert.equal(accessibilityFindingCopy(rule, false).description, rule.description);
  assert.match(accessibilityFindingCopy(rule, false).correction, /examples and linked guidance/);
  assert.equal(accessibilityFindingCopy({ ...rule, description: "New check." }, false).description, undefined);
});

test("image guidance preserves decorative-image alternative and labels get a concrete repair", () => {
  const rule = accessibilityAuditFixture().violations[0]!;
  const image = accessibilityFindingCopy({ ...rule, ruleId: "image-alt" }, false);
  assert.match(image.correction, /empty alt attribute for purely decorative/);
  assert.match(accessibilityFindingCopy({ ...rule, ruleId: "label" }, false).correction, /Associate a descriptive label/);
  assert.notEqual(image.description, image.correction);
});

test("editorial rendering preserves original rule payloads and separate review status", () => {
  const observation = accessibilityAuditFixture();
  observation.reviewItems = [{ ...observation.violations[0]!, ruleId: "aria-hidden-focus", help: "ARIA hidden element must not be focusable or contain focusable elements", description: "Ensure aria-hidden elements are not focusable nor contain focusable elements" }];
  observation.rulesEvaluated.push("aria-hidden-focus");
  const before = structuredClone(observation);
  const audit = projectAccessibilityAuditSummary(accessibilityProjectionFixture(observation))!;
  const html = renderToStaticMarkup(<AccessibilityEvidence audit={audit} observation={observation} />);
  const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const payloads = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map(match => decode(match[1]!)).filter(value => value.startsWith('{')).map(value => JSON.parse(value).accessibilityRule);
  assert.deepEqual(payloads, [...observation.violations, ...observation.reviewItems]);
  assert.deepEqual(observation, before);
  assert.match(html, /Issues found/);
  assert.match(html, /Checks needing manual review/);
  assert.match(html, />Review</);
  assert.match(html, /Hidden content and keyboard focus/);
  assert.match(html, /Check whether keyboard focus enters hidden content/);
  assert.match(html, /Keyboard focus should not enter content hidden from assistive technology/);
});

test("zero detected accessibility issues still names checks requiring review", () => {
  const audit = projectAccessibilityAuditSummary(accessibilityProjectionFixture(accessibilityAuditFixture()))!;
  const html = renderToStaticMarkup(<AccessibilityEvidence audit={{ ...audit, failedRuleCount: 0, affectedNodeCount: 0, reviewRuleCount: 2 }} />);
  assert.match(html, /0 issues · 2 to review/);
  assert.match(html, />Review</);
});
