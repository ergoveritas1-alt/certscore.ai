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
});
