import assert from "node:assert/strict";
import test from "node:test";
import { scanNoGoAssessmentSchema } from "@certscore/contracts";
import { projectRuntimeVisitCaptureLimitation } from "./runtime-visit-capture-limitation";
import { projectExternalScanNoGo } from "./scan-no-go-reasons";

function fixture() {
  return {
    scanId: "capture-fixture", status: "failed",
    error: { code: "original_runtime_visit_unavailable" },
    terminalLaneEvidence: {
      contractVersion: "certscore.failed-terminal-lane-evidence.v2",
      scanId: "capture-fixture", mode: "internal_only", scoreEffect: "none", productionProjectable: false,
      lanes: [{ lane: "runtime_evidence", status: "verified_retained", source: {
        uri: "s3://retained/v2/capture-fixture/lanes/runtime_evidence/CanonicalEvidenceBundle.json",
        sha256: "a".repeat(64), sizeBytes: 121901,
      } }],
      runtimeVisitEligibility: {
        policyVersion: "runtime_visit_eligibility.v1", reasonCode: "runtime_lane_unavailable",
        snapshotCount: 1, snapshotCountTruncated: false,
        selectedSnapshot: {
          capturedAtMs: 5964, documentUrlSha256: "b".repeat(64), documentTokenSha256: "c".repeat(64),
          cdpLoaderBound: true, hasText: false, hasTitle: true,
        },
      },
    },
  };
}

test("retained empty-text runtime failure becomes an unscored capture no-go, not a site finding", () => {
  for (const capturedAtMs of [5791, 5964]) {
    const input = fixture();
    input.terminalLaneEvidence.runtimeVisitEligibility.selectedSnapshot.capturedAtMs = capturedAtMs;
    const original = JSON.stringify(input);
    const result = projectRuntimeVisitCaptureLimitation(input)!;
    assert.ok(scanNoGoAssessmentSchema.safeParse(result.assessment).success);
    assert.equal(result.assessment.supportingSignals.capturedTextObserved, false);
    assert.equal(result.assessment.supportingSignals.capturedTitleObserved, true);
    assert.equal(result.assessment.supportingSignals.sourceHash, "a".repeat(64));
    const publicResult = projectExternalScanNoGo({ scan_no_go_assessment: result.assessment });
    assert.equal(publicResult?.resultDisposition, "no_go");
    assert.equal(publicResult.noGo.reasonCode, "runtime_capture_unverified");
    assert.equal(publicResult.noGo.limitationKind, "scanner_capture_limitation");
    assert.match(publicResult.noGo.summary, /no site assessment or scores/);
    assert.equal(publicResult.noGo.evidenceExcerpt, "The runtime capture retained a page title but no readable page text.");
    assert.doesNotMatch(JSON.stringify(publicResult), /s3:|sourceHash|runtime_lane_unavailable|documentToken|captcha|authentication_required/i);
    assert.equal(JSON.stringify(input), original);
  }
});

test("generic, historical, mismatched, and unverified failures do not manufacture a no-go", () => {
  const mutations: Array<(value: ReturnType<typeof fixture>) => void> = [
    x => { x.status = "completed"; },
    x => { x.error.code = "v2_dag_lambda_safety_timeout"; },
    x => { x.scanId = "another-scan"; },
    x => { x.terminalLaneEvidence.contractVersion = "certscore.failed-terminal-lane-evidence.v1"; },
    x => { x.terminalLaneEvidence.lanes[0]!.status = "unverifiable"; },
    x => { x.terminalLaneEvidence.lanes[0]!.source.sha256 = "invalid"; },
    x => { x.terminalLaneEvidence.lanes[0]!.source.uri = "s3://retained/v2/other/lanes/runtime_evidence/CanonicalEvidenceBundle.json"; },
    x => { x.terminalLaneEvidence.runtimeVisitEligibility.reasonCode = "made_up"; },
    x => { x.terminalLaneEvidence.lanes = []; },
  ];
  for (const mutate of mutations) {
    const value = fixture(); mutate(value);
    assert.equal(projectRuntimeVisitCaptureLimitation(value), null);
  }
  assert.equal(projectRuntimeVisitCaptureLimitation({ scanId: "capture-fixture", status: "failed", error: fixture().error }), null);
});

test("verified access and target errors retain their canonical distinctions", () => {
  for (const reason of ["authentication_required", "captcha_or_challenge", "not_found_404"] as const) {
    const input = fixture();
    input.terminalLaneEvidence.runtimeVisitEligibility = {
      ...input.terminalLaneEvidence.runtimeVisitEligibility,
      reasonCode: "runtime_no_go",
      ...{ retainedNoGoReason: reason },
    };
    const result = projectRuntimeVisitCaptureLimitation(input);
    const external = projectExternalScanNoGo({ scan_no_go_assessment: result?.assessment });
    assert.equal(external?.noGo.reasonCode, reason);
    assert.equal(external.noGo.limitationKind, reason === "not_found_404" ? "target_site_state" : "scanner_access_limitation");
    assert.equal(external.noGo.evidenceExcerpt, undefined);
  }
});
