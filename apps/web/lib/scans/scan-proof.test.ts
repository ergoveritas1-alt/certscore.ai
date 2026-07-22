import assert from "node:assert/strict";
import test from "node:test";
import { buildScanProof } from "./scan-proof";

test("buildScanProof retains an early screenshot while consent inspection is incomplete", () => {
  const proof = buildScanProof({
    executiveThirdPartyRequestCount: 14,
    finalHost: "amazon.de",
    runtimeMetricsReliable: true,
    runtimeArtifacts: {
      consent_surface_inspection: {
        coverageStatus: "partial",
        inspectionCompleted: false,
        consentSurfaceObserved: false
      },
      final_effective_url: "https://www.amazon.de/",
      runtime_coverage_status: "usable",
      visual_evidence_artifacts: [{ capture_method: "viewport_first", status: "available" }]
    }
  });

  assert.equal(proof.consentInspection, "incomplete");
  assert.equal(proof.screenshot.status, "retained");
  assert.equal(proof.screenshot.captureMethod, "viewport_first");
  assert.equal(proof.scriptActivity, "observed");
  assert.equal(proof.networkActivity.count, 14);
});

test("buildScanProof does not turn unavailable storage/runtime evidence into observed proof", () => {
  const proof = buildScanProof({
    executiveThirdPartyRequestCount: 0,
    finalHost: "example.test",
    runtimeMetricsReliable: false,
    runtimeArtifacts: {
      visual_capture_status: "unavailable",
      runtime_coverage_status: "limited"
    }
  });

  assert.equal(proof.screenshot.status, "unavailable");
  assert.equal(proof.networkActivity.status, "not_verified");
  assert.equal(proof.scriptActivity, "not_verified");
  assert.equal(proof.runtimeCoverage, "not_verified");
});
