import assert from "node:assert/strict";
import test from "node:test";
import { projectAdminNoGo } from "./admin-no-go";

test("canonical snapshot outcomes take precedence", () => {
  assert.deepEqual(projectAdminNoGo({ snapshotOutcome: "homepage_security_challenge" }), {
    isNoGo: true,
    reason: "homepage_security_challenge",
    source: "snapshot"
  });
});

test("retained runtime-only no-go assessments remain visible", () => {
  assert.deepEqual(projectAdminNoGo({
    runtimeAssessment: { decision: "no_go", reasonCodes: ["scan_no_go_corroborated", "navigation_transport_failure"] }
  }), {
    isNoGo: true,
    reason: "navigation_transport_failure",
    source: "runtime_assessment"
  });
  assert.deepEqual(projectAdminNoGo({
    visualAccessReview: { go_no_go: "NO_GO", reason_code: "captcha_or_challenge" }
  }), {
    isNoGo: true,
    reason: "captcha_or_challenge",
    source: "visual_review"
  });
});

test("operational access flags are a bounded final fallback", () => {
  assert.equal(projectAdminNoGo({ accessPostureClass: "early_loss" }).isNoGo, true);
  assert.equal(projectAdminNoGo({ blockedFlag: true }).isNoGo, true);
  assert.equal(projectAdminNoGo({ captchaFlag: true }).isNoGo, true);
  assert.deepEqual(projectAdminNoGo({}), { isNoGo: false, reason: null, source: null });
});
