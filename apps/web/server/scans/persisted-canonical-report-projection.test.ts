import assert from "node:assert/strict";
import test from "node:test";
import { getPersistedCanonicalReportProjection } from "./persisted-canonical-report-projection";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";

test("canonical report read omits unobserved Reject results without mutating persisted diagnostics", () => {
  for (const state of ["observed", "not_observed", "unknown"]) {
    const row = { id: "post_reject_tracking_reduction", criticalEvidence: { retainedEvidence: {} } };
    const record = { scan: { id: "scan-1" }, runtimeArtifacts: { consentControlAssessment: {
      ...observedControlAssessment, controls: { ...observedControlAssessment.controls,
        reject: { ...observedControlAssessment.controls.reject, state } },
    } }, canonicalReportProjection: { artifactVersion: "persisted-canonical-report-projection-v2",
      checklistRows: [row], derivedContext: {}, globalUnifiedFindings: [], legacyScoreAssessmentInput: { scanId: "scan-1" },
      normalizedConcerns: [], ownerUnifiedFindings: [], topFindingIds: [],
    } } as any;
    const projected = getPersistedCanonicalReportProjection(record);
    assert.ok(projected);
    assert.equal(projected.checklistRows.length, state === "observed" ? 1 : 0);
    assert.equal(record.canonicalReportProjection.checklistRows.length, 1);
  }
});

test("canonical report reads describe retained Accept and Reject overlap without changing stored evidence", () => {
  const id = "accept_reject_outcomes_indistinguishable";
  const oldLabel = "Accept and Reject produced indistinguishable retained activity";
  const finding = { unifiedFindingId: id, title: oldLabel,
    summary: "Some sanitized request identities appeared after both confirmed choices.",
    presentation: { findingName: oldLabel } };
  const record = { scan: { id: "scan-1" }, canonicalReportProjection: {
    artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [], derivedContext: {},
    legacyScoreAssessmentInput: { scanId: "scan-1" }, normalizedConcerns: [],
    globalUnifiedFindings: [finding], ownerUnifiedFindings: [finding], topFindingIds: [id],
  } } as any;
  const projection = getPersistedCanonicalReportProjection(record);
  const label = "Shared observed activity after Accept and Reject";
  assert.equal(projection?.ownerUnifiedFindings[0]?.title, label);
  assert.equal(projection?.globalUnifiedFindings[0]?.presentation.findingName, label);
  assert.equal(projection?.globalUnifiedFindings[0]?.summary, finding.summary);
  assert.deepEqual(projection?.topFindingIds, [id]);
  assert.equal(finding.title, oldLabel);
  assert.equal(finding.presentation.findingName, oldLabel);
});
