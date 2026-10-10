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
