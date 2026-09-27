import { consentControlAssessmentSchema } from "@certscore/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { consentControlReportLabels, projectConsentControlReport } from "./consent-control-report";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";

function limited() {
  const a = consentControlAssessmentSchema.parse(observedControlAssessment);
  a.assessmentStatus = "limited";
  a.coverage.status = "limited";
  a.controls.reject.state = "unknown";
  a.coverage.reasonCodes = ["unresolved_visible_consent_decision"];
  return a;
}

test("usable retained surface projects binary results without upgrading the assessment", () => {
  const assessment = limited();
  const before = structuredClone(assessment);
  const report = projectConsentControlReport(assessment, "scan-1");
  assert.ok(report);
  assert.deepEqual(consentControlReportLabels(report), { accept: "Observed", reject: "Not observed", options: "Observed" });
  assert.equal(report.sourceHash, assessment.provenance.sourceHash);
  assert.equal(report.assessmentVersion, "2.1");
  assert.deepEqual(assessment, before);
  assert.equal(isAfterActionReportEligible(assessment, "accept"), true);
  assert.equal(isAfterActionReportEligible(assessment, "reject"), false);
});

test("no-go, blocked, error and unbound visits cannot create negative control labels", () => {
  for (const reason of ["consent_session_access_limited", "captcha_or_challenge", "blank_or_unusable_page", "scan_no_go_corroborated", "access_denied_or_forbidden_page", "navigation_transport_failure"]) {
    const a = limited();
    a.coverage.reasonCodes = [reason];
    assert.equal(projectConsentControlReport(a), null, reason);
    assert.equal(isAfterActionReportEligible(a, "accept"), false);
  }
  for (const identity of ["unknown", "mismatched"] as const) {
    const a = limited(); a.document.identityStatus = identity;
    assert.equal(projectConsentControlReport(a), null);
  }
  const a = limited(); a.scan.noGo = true;
  assert.equal(projectConsentControlReport(a), null);
  assert.equal(projectConsentControlReport(limited(), "different-scan"), null);
  assert.equal(projectConsentControlReport(undefined), null);
  assert.equal(projectConsentControlReport({ controls: { accept: { state: "observed" } } }), null);
});

test("missing surface with incomplete capture is unavailable, not three negative controls", () => {
  const a = limited(); a.surface.status = "unknown";
  assert.equal(projectConsentControlReport(a), null);
  assert.deepEqual(consentControlReportLabels(null), { accept: "", reject: "", options: "" });
});

test("a complete structured negative assessment needs no screenshot or model probability", () => {
  const a = consentControlAssessmentSchema.parse(observedControlAssessment);
  a.surface.status = "not_observed";
  for (const c of Object.values(a.controls)) c.state = "not_observed";
  assert.deepEqual(consentControlReportLabels(projectConsentControlReport(a)), {
    accept: "Not observed", reject: "Not observed", options: "Not observed",
  });
});
