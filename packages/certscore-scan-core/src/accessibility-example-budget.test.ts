import assert from "node:assert/strict";
import test from "node:test";
import { retainAccessibilityExampleBreadth } from "./accessibility-audit.js";
import { ACCESSIBILITY_LIMITS, accessibilityAuditObservationSchema } from "@certscore/contracts";
import { accessibilityAuditFixture } from "../../certscore-contracts/src/accessibility-audit.fixture.js";

function prolific() {
  const base = accessibilityAuditFixture();
  const ids = ["image-alt", "link-name", "meta-viewport", "target-size", ...Array.from({ length: 56 }, (_, i) => `rule-${i}`)];
  const rules = ids.map((ruleId, index) => ({ ...base.violations[0]!, ruleId,
    help: "Finding summary", description: "Evidence description", impact: index % 2 ? "serious" as const : "moderate" as const,
    nodeCount: 10_000,
    representativeNodes: Array.from({ length: 5 }, (_, i) => ({
      selectors: ["#" + "s".repeat(390), "." + "t".repeat(390)], htmlSnippet: "<div data-evidence>".repeat(20), failureSummary: "Fix the identified control. ".repeat(25),
    })),
  }));
  return { ...base, rulesEvaluated: ids, violations: rules };
}

test("byte pressure retains every rule and full count before spending on repeated examples", () => {
  const original = prolific();
  assert.ok(Buffer.byteLength(JSON.stringify(original)) > ACCESSIBILITY_LIMITS.evidenceBytes);
  const retained = retainAccessibilityExampleBreadth(original)!;
  assert.ok(retained);
  assert.equal(retained.status, original.status);
  assert.deepEqual(retained.rulesEvaluated, original.rulesEvaluated);
  assert.deepEqual(retained.violations.map(rule => [rule.ruleId, rule.nodeCount]), original.violations.map(rule => [rule.ruleId, rule.nodeCount]));
  assert.ok(retained.violations.every(rule => rule.representativeNodes.length >= 1));
  assert.equal(retained.exampleCoverage.byteBudgetLimited, true);
  assert.ok(Buffer.byteLength(JSON.stringify(retained)) <= ACCESSIBILITY_LIMITS.evidenceBytes);
  assert.ok(accessibilityAuditObservationSchema.safeParse(retained).success);
  for (const id of ["image-alt", "link-name", "meta-viewport", "target-size"]) {
    assert.equal(retained.violations.find(rule => rule.ruleId === id)?.representativeNodes.length, 5, "preserve semantic and deduplication proof");
  }
  assert.ok(original.violations.every(rule => rule.representativeNodes.length === 5), "allocation cannot mutate source evidence");
});

test("ordinary reports retain all existing examples and historical audit schemas remain valid", () => {
  const original = accessibilityAuditFixture();
  const retained = retainAccessibilityExampleBreadth(original)!;
  assert.deepEqual(retained.violations, original.violations);
  assert.equal(retained.exampleCoverage.byteBudgetLimited, false);
  assert.ok(accessibilityAuditObservationSchema.safeParse(original).success);
  assert.ok(accessibilityAuditObservationSchema.safeParse(retained).success);
  retained.exampleCoverage.retainedNodeCount++;
  assert.equal(accessibilityAuditObservationSchema.safeParse(retained).success, false);
});

test("an impossible evidence budget cannot manufacture bare rules without supporting proof", () => {
  assert.equal(retainAccessibilityExampleBreadth(prolific(), 10), null);
});
