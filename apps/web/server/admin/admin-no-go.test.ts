import assert from "node:assert/strict";
import test from "node:test";
import { projectAdminNoGo } from "./admin-no-go";

test("canonical snapshot outcomes take precedence", () => {
  assert.deepEqual(projectAdminNoGo({ snapshotOutcome: "homepage_security_challenge" }), {
    isNoGo: true,
    limitationKind: "scanner_access_limitation",
    reason: "homepage_security_challenge",
    source: "snapshot"
  });
});

test("retained runtime-only no-go assessments remain visible", () => {
  assert.deepEqual(projectAdminNoGo({
    runtimeAssessment: { decision: "no_go", reasonCodes: ["scan_no_go_corroborated", "navigation_transport_failure"] }
  }), {
    isNoGo: true,
    limitationKind: "scanner_capture_limitation",
    reason: "navigation_transport_failure",
    source: "runtime_assessment"
  });
  assert.deepEqual(projectAdminNoGo({
    visualAccessReview: { go_no_go: "NO_GO", reason_code: "captcha_or_challenge" }
  }), {
    isNoGo: true,
    limitationKind: "scanner_access_limitation",
    reason: "captcha_or_challenge",
    source: "visual_review"
  });
});

test("snapshot-backed assessments remain visible when runtime artifacts are absent", () => {
  assert.deepEqual(projectAdminNoGo({
    snapshotVisualAccessReview: { go_no_go: "NO_GO", reason_code: "captcha_or_challenge" }
  }), {
    isNoGo: true,
    limitationKind: "scanner_access_limitation",
    reason: "captcha_or_challenge",
    source: "visual_review"
  });
  assert.equal(projectAdminNoGo({
    snapshotRuntimeAssessment: { decision: "no_go", reason_codes: ["navigation_transport_failure"] }
  }).isNoGo, true);
});

test("operational access flags are a bounded final fallback", () => {
  assert.equal(projectAdminNoGo({ accessPostureClass: "early_loss" }).isNoGo, true);
  assert.equal(projectAdminNoGo({ blockedFlag: true }).isNoGo, true);
  assert.equal(projectAdminNoGo({ captchaFlag: true }).isNoGo, true);
  assert.deepEqual(projectAdminNoGo({}), { isNoGo: false, limitationKind: null, reason: null, source: null });
});
