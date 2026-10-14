import assert from "node:assert/strict";
import test from "node:test";
import { accessibilityAuditObservationSchema, isAccessibilityAuditLimited } from "./accessibility-audit.js";
import { accessibilityAuditFixture, accessibilityProjectionFixture } from "./accessibility-audit.fixture.js";

test("completion requires evaluated rules, bound identity and no unresolved review", () => {
  assert.equal(accessibilityAuditObservationSchema.safeParse(accessibilityAuditFixture()).success, true);
  for (const change of [{ documentToken: null }, { rulesEvaluated: [] }, { limitations: ["audit_timeout"] },
    { reviewItems: accessibilityAuditFixture().violations }, { status: "failed" as const }, { sourceLane: "gpc_observation" }]) {
    assert.equal(accessibilityAuditObservationSchema.safeParse({ ...accessibilityAuditFixture(), ...change }).success, false);
  }
});

test("new malformed or incomplete evidence is limited while historical records stay unchanged", () => {
  assert.equal(isAccessibilityAuditLimited(undefined), false);
  assert.equal(isAccessibilityAuditLimited(accessibilityProjectionFixture()), false);
  assert.equal(isAccessibilityAuditLimited(accessibilityProjectionFixture(), "other-scan"), true);
  assert.equal(isAccessibilityAuditLimited({}), true);
  assert.equal(isAccessibilityAuditLimited(accessibilityProjectionFixture({ status: "limited", limitations: ["rules_need_review"] })), true);
  const malformed = accessibilityProjectionFixture(); malformed.observation.violations[0]!.helpUrl = "invalid-url";
  assert.equal(isAccessibilityAuditLimited(malformed), true);
});

test("optional image-link identity is bounded, versioned and preserves historical audits", () => {
  const audit = accessibilityAuditFixture();
  const node = audit.violations[0]!.representativeNodes[0]!;
  node.imageLinkIdentity = { contractVersion: "certscore.accessibility-image-link-identity.v1", nodeId: 2, imageOnlyLinkId: 1 };
  assert.equal(accessibilityAuditObservationSchema.safeParse(audit).success, true);
  for (const invalid of [{ nodeId: 0 }, { nodeId: 1.2 }, { imageOnlyLinkId: -1 }, { contractVersion: "unknown" }, { selector: "private" }]) {
    assert.equal(accessibilityAuditObservationSchema.safeParse({ ...audit, violations: [{ ...audit.violations[0],
      representativeNodes: [{ ...node, imageLinkIdentity: { ...node.imageLinkIdentity, ...invalid } }] }] }).success, false);
  }
  delete node.imageLinkIdentity;
  assert.equal(accessibilityAuditObservationSchema.safeParse(audit).success, true);
});

test("example sampling metadata is independent of audit coverage and bound to retained counts", () => {
  const audit = accessibilityAuditFixture();
  audit.violations[0]!.nodeCount = 500;
  audit.exampleCoverage = { version: "breadth_before_detail.v1", observedNodeCount: 503,
    retainedNodeCount: 4, omittedNodeCount: 499, byteBudgetLimited: true };
  assert.equal(accessibilityAuditObservationSchema.parse(audit).status, "completed");
  for (const change of [{ observedNodeCount: 4 }, { retainedNodeCount: 500 }, { omittedNodeCount: 0 }, { version: "unknown" }]) {
    assert.equal(accessibilityAuditObservationSchema.safeParse({ ...audit, exampleCoverage: { ...audit.exampleCoverage, ...change } }).success, false);
  }
});

test("child-frame churn permits only verified main-document positive findings", () => {
  const audit = accessibilityAuditFixture();
  audit.status = "limited"; audit.limitations = ["child_frames_changed_main_document_retained"];
  audit.reviewItems = []; audit.violations = [audit.violations[0]!];
  audit.violations[0]!.ruleId = "button-name";
  audit.violations[0]!.representativeNodes.forEach(node => { node.mainDocumentBound = true; });
  audit.rulesEvaluated = ["button-name"];
  audit.frameCoverage = { version: "stable_main_document_evidence.v1", resultScope: "positive_findings_only", documentToken: audit.documentToken!,
    engineRunCount: 1, engineRuleCount: 62, changedChildFrameCount: 1, excludedNodeCount: 12 };
  assert.equal(accessibilityAuditObservationSchema.safeParse(audit).success, true);
  for (const patch of [{status:"completed"}, {documentToken:"other"}, {rulesEvaluated:["button-name","html-has-lang"]}, {violations:[]},
    {frameCoverage:{...audit.frameCoverage,engineRunCount:2}}, {violations:[{...audit.violations[0],ruleId:"html-has-lang"}],rulesEvaluated:["html-has-lang"]},
    {violations:[{...audit.violations[0],representativeNodes:audit.violations[0]!.representativeNodes.map(node => ({...node,mainDocumentBound:undefined}))}]}]) {
    assert.equal(accessibilityAuditObservationSchema.safeParse({...audit,...patch}).success, false, JSON.stringify(patch));
  }
});
