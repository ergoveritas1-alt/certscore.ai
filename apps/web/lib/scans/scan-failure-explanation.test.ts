import assert from "node:assert/strict";
import test from "node:test";
import { projectScanReportNoGo } from "./scan-report-disposition";
import { scanFailureExplanation } from "./scan-failure-explanation";

test("failed report view presents the retained capture no-go without raw diagnostics", () => {
  const record = { scan: { status: "failed" }, runtimeArtifacts: null,
    snapshot: { scan_no_go_assessment: { decision: "no_go", reasonCodes: ["runtime_capture_unverified"],
      supportingSignals: { assessmentPolicy: "runtime_visit_capture_limitation.v1", cdpLoaderBound: true,
        capturedTitleObserved: true, capturedTextObserved: false } } } };
  const result = scanFailureExplanation("internal error payload", projectScanReportNoGo(record));
  assert.equal(result.title, "Starting-page capture incomplete");
  assert.match(result.detail, /content retained during this scan/);
  assert.match(result.detail, /page title but no readable page text/);
  assert.match(result.nextStep, /scan ID for capture review/);
  assert.doesNotMatch(JSON.stringify(result), /internal error|blocked|sign.in|blank|retry/i);
  assert.equal(scanFailureExplanation("unrecognized error").title, "The scan could not finish");
});
