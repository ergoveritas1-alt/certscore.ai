import assert from "node:assert/strict";
import test from "node:test";
import { assessRuntimeVisitSnapshot, getUsableRuntimeVisitSnapshot, type RuntimeVisitRejectionReason } from "./usable-runtime-visit";
import { gpcRuntimeFixture } from "./test-fixtures/gpc-runtime";
import { brandedSoft404 } from "./test-fixtures/runtime-error-pages";
import type { CanonicalEvidenceBundle } from "./index";

function fixture() {
  const bundle = gpcRuntimeFixture({ enabled: false });
  bundle.domSnapshots = [{ artifactId: "runtime-dom", path: "/retained/runtime.txt", url: bundle.url,
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
