import assert from "node:assert/strict";
import test from "node:test";
import { assessRuntimeVisitSnapshot, getUsableRuntimeVisitSnapshot, type RuntimeVisitRejectionReason } from "./usable-runtime-visit";
import { gpcRuntimeFixture } from "./test-fixtures/gpc-runtime";
import { brandedSoft404 } from "./test-fixtures/runtime-error-pages";
import type { CanonicalEvidenceBundle } from "./index";

function fixture() {
  const bundle = gpcRuntimeFixture({ enabled: false });
  bundle.domSnapshots = [{ artifactId: "runtime-dom", path: "/retained/runtime.txt", url: bundle.url,
    pagePhase: "network_idle", consentStateAtTime: "pre_consent",
    capturedAtMs: 100, documentIdentity: { source: "cdp_loader_id", token: "runtime-loader" }, textExcerpt: "公開資料と辞典" }];
  return bundle;
}

test("runtime rejection reasons preserve evidence eligibility and do not mutate original observations", () => {
  const cases: Array<[RuntimeVisitRejectionReason, (bundle: CanonicalEvidenceBundle) => void]> = [
    ["runtime_no_go", bundle => { bundle.scanNoGoAssessment = { decision: "no_go" } as CanonicalEvidenceBundle["scanNoGoAssessment"]; }],
    ["runtime_coverage_unavailable", bundle => { bundle.runtimeCoverage!.silentEmpty = true; }],
    ["runtime_lane_unavailable", bundle => { bundle.scanLaneRuns[0]!.accessOutcome = "access_denied"; }],
    ["runtime_navigation_unverified", bundle => { bundle.scanLaneRuns[0]!.executionOutcome = "degraded"; }],
    ["runtime_snapshot_unavailable", bundle => { bundle.domSnapshots = []; }],
    ["runtime_document_unverified", bundle => { bundle.domSnapshots[0]!.documentIdentity = undefined; }],
    ["runtime_content_unavailable", bundle => { bundle.domSnapshots[0]!.textExcerpt = ""; }],
    ["runtime_document_conflict", bundle => { bundle.domSnapshots.push({ ...bundle.domSnapshots[0]!, url: "https://other.test/" }); }],
    ["runtime_error_page", bundle => { bundle.domSnapshots[0]!.textExcerpt = brandedSoft404; }],
    ["runtime_error_page", bundle => { bundle.domSnapshots[0]!.textExcerpt = "You will be automatically re-directed to our consumer site momentarily, or you may navigate to Example Company content at our new location by following this link: https://destination.example/"; }],
  ];
  const good = fixture();
  assert.equal(assessRuntimeVisitSnapshot(good, good.domSnapshots).status, "usable");
  assert.equal(getUsableRuntimeVisitSnapshot(good, good.domSnapshots), good.domSnapshots[0]);
  for (const [reasonCode, mutate] of cases) {
    const bundle = fixture(); mutate(bundle); const before = JSON.stringify(bundle);
    assert.deepEqual(assessRuntimeVisitSnapshot(bundle, bundle.domSnapshots), { status: "unavailable", reasonCode });
    assert.equal(getUsableRuntimeVisitSnapshot(bundle, bundle.domSnapshots), undefined);
    assert.equal(JSON.stringify(bundle), before);
  }
  assert.deepEqual(assessRuntimeVisitSnapshot(good, good.domSnapshots, "https://user:secret@example.test/"),
    { status: "unavailable", reasonCode: "invalid_final_url" });
});

test("a non-text runtime document qualifies only with existing positive visual proof on its loader", () => {
  const bundle = fixture();
  bundle.completedAt = new Date(Date.parse(bundle.startedAt) + 1_000).toISOString();
  const snapshot = bundle.domSnapshots[0]!;
  snapshot.textExcerpt = "";
  snapshot.runtimeDocumentCapture = { version: "runtime_document_capture.v1", response: {
    origin: new URL(snapshot.url).origin, requestUrlSha256: "a".repeat(64),
    documentToken: "runtime-loader", status: 200, route: "committed",
  } };
  bundle.scanNoGoAssessment = {
    status: "available", version: "scan-no-go-assessment-v1",
    decision: "continue_with_diagnostics", scanNoGoConfidence: 0.72,
    reasonCodes: [], corroboratorCodes: [], contradictorCodes: [], evidenceRefs: [],
    supportingSignals: {
      visuallySubstantiveScreenshotObserved: true, visualNoGo: false, visualHardNoGoPageState: false,
    },
  };
  bundle.screenshots = [{
    ...snapshot, artifactId: "visual", capturedAtMs: 101, retentionStatus: "available",
    captureMethod: "primary_full_page",
  }] as CanonicalEvidenceBundle["screenshots"];
  assert.equal(getUsableRuntimeVisitSnapshot(bundle, bundle.domSnapshots), snapshot);
  bundle.screenshots[0]!.documentIdentity = { source: "cdp_loader_id", token: "other-lane" };
  assert.equal(getUsableRuntimeVisitSnapshot(bundle, bundle.domSnapshots), undefined);
});
