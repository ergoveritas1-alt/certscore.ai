import assert from "node:assert/strict";
import test from "node:test";
import { isAfterActionReportEligible } from "./after-action-report-eligibility";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";
import { readChoicePathExecution } from "./choice-path-execution";
import { getReportableGdprEprivacyCoverageItems } from "./gdpr-eprivacy-reportable-rows";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: completed action evidence cannot override the canonical control state`, () => {
    const projection = completedActionProjection(action);
    const before = structuredClone(projection);
    for (const state of ["not_observed", "unknown"]) {
      const assessment = { ...observedControlAssessment, assessmentStatus: "limited", controls: {
        ...observedControlAssessment.controls, [action]: { ...observedControlAssessment.controls[action], state },
      } };
      assert.equal(isAfterActionReportEligible(assessment, action), false);
      assert.equal(assessment.controls[action].state, state);
    }
    assert.deepEqual(projection, before);
    assert.equal(projection.productionProjectable, false);
    assert.equal(isAfterActionReportEligible(undefined, action), false);
    assert.equal(isAfterActionReportEligible(observedControlAssessment, action), true);
  });
}

test("canonical checklist hides an After Reject row when Reject was not observed", () => {
  const projection = completedActionProjection("reject");
  const row = { id: "post_reject_tracking_reduction", criticalEvidence: { retainedEvidence: {
    reportControlObserved: false, reportPresentation: "omit_no_actionable_reject_control",
    execution: readChoicePathExecution(projection, "reject"),
  } } } as unknown as GdprEprivacyCoverageChecklistItem;
  assert.deepEqual(getReportableGdprEprivacyCoverageItems([row]), []);
  assert.equal(row.criticalEvidence.retainedEvidence.reportControlObserved, false);
  const missing = { ...row, criticalEvidence: { retainedEvidence: { reportControlObserved: false } } } as unknown as GdprEprivacyCoverageChecklistItem;
  assert.deepEqual(getReportableGdprEprivacyCoverageItems([missing]), []);
  const limited = { ...observedControlAssessment, assessmentStatus: "limited", controls: {
    ...observedControlAssessment.controls,
    reject: { ...observedControlAssessment.controls.reject, state: "unknown" },
  } };
  assert.deepEqual(getReportableGdprEprivacyCoverageItems([row], { consentControlAssessment: limited }), []);
  assert.equal(readChoicePathExecution(projection, "reject")?.clickCompleted, true);
  assert.deepEqual(getReportableGdprEprivacyCoverageItems([row], { consentControlAssessment: observedControlAssessment }).map(item => item.id), ["post_reject_tracking_reduction"]);
});
