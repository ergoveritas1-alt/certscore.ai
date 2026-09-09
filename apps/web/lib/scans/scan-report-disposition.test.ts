import assert from "node:assert/strict";
import test from "node:test";
import retained from "./test-fixtures/authentication-no-go-20260909.json";
import { projectScanReportNoGo, resolveScanReportScore, withScanReportDisposition } from "./scan-report-disposition";
import { deriveCanonicalOverallScoreForReport } from "../../server/scans/canonical-overall-score";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

const checkedRows = [{
  assessmentStatus: "checked",
  criticalEvidence: { retainedEvidence: { consentSurfaceObserved: true } },
  evidenceState: "observed", id: "consent_surface_observed", status: "Observed",
}] as unknown as GdprEprivacyCoverageChecklistItem[];

test("retained production 401 withholds canonical and stale snapshot scores", () => {
  const input = { runtimeArtifacts: retained.runtimeArtifacts, snapshot: { certscore_overall: 100 } };
  assert.equal(projectScanReportNoGo(input)?.noGo.reasonCode, "authentication_required");
  assert.equal(deriveCanonicalOverallScoreForReport({ scanRecord: input, checklistRows: checkedRows, unifiedFindings: [] }), null);
  assert.equal(resolveScanReportScore(input, 100), null);
  assert.equal(withScanReportDisposition(input).snapshot.certscore_overall, null);
  assert.equal(input.snapshot.certscore_overall, 100, "read eligibility must not mutate retained records");
  assert.equal(withScanReportDisposition(input).runtimeArtifacts, input.runtimeArtifacts);
});

test("explicit continue preserves recovered and partial reports despite lane-local NO_GO or stale snapshot", () => {
  const input = {
    runtimeArtifacts: {
      ...retained.runtimeArtifacts,
      scanNoGoAssessment: { ...retained.runtimeArtifacts.scanNoGoAssessment, decision: "continue_with_diagnostics" },
      scanEvidenceLaneAssessment: { outcome: "partial_with_diagnostics" },
    },
    snapshot: { certscore_overall: 85, scan_no_go_assessment: retained.runtimeArtifacts.scanNoGoAssessment },
  };
  assert.equal(projectScanReportNoGo(input), null);
  assert.equal(resolveScanReportScore(input, 85), 85);
  assert.equal(withScanReportDisposition(input), input);
  assert.equal(deriveCanonicalOverallScoreForReport({ scanRecord: input, checklistRows: checkedRows, unifiedFindings: [] }), 100);
});

test("typed no-go survives missing visuals; snapshot-only typed decisions remain readable", () => {
  for (const input of [
    { runtimeArtifacts: { scan_no_go_assessment: retained.runtimeArtifacts.scanNoGoAssessment } },
    { runtimeArtifacts: null, snapshot: { scan_no_go_assessment: retained.runtimeArtifacts.scanNoGoAssessment } },
  ]) {
    assert.equal(projectScanReportNoGo(input)?.noGo.title, "Sign-in required");
    assert.equal(resolveScanReportScore(input, 100), null);
  }
});

test("HTTP hints, empty inventories and visual-only lane failures do not invent a no-go", () => {
  for (const runtimeArtifacts of [
    { mainDocumentStatus: 401 },
    { runtimeCoverage: { coverageStatus: "limited_none" } },
    { visual_access_review: retained.runtimeArtifacts.visualAccessReview },
    { scan_no_go_assessment: { decision: "unknown" } },
  ]) {
    assert.equal(projectScanReportNoGo({ runtimeArtifacts }), null);
  }
});
