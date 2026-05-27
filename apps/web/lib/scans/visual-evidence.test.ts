import assert from "node:assert/strict";
import test from "node:test";
import {
  getVisualEvidenceArtifacts,
  normalizeVisualEvidenceArtifact
} from "./visual-evidence";

test("normalizeVisualEvidenceArtifact accepts snake_case scanner metadata", () => {
  const artifact = normalizeVisualEvidenceArtifact({
    byte_size: 300_000,
    captured_at: "2026-05-27T00:00:00.000Z",
    capture_step: "initial_load",
    consent_state: "pre_interaction",
    device_scale_factor: 1,
    final_url: "https://example.com/",
    height: 1200,
    id: "initial_load:abc",
    interaction_state: "none",
    key: "scans/scan-1/visual/initial-load-001.webp",
    mime_type: "image/webp",
    status: "available",
    viewport: { height: 1200, width: 1600 },
    width: 1600
  });

  assert.equal(artifact?.status, "available");
  assert.equal(artifact?.byteSize, 300_000);
  assert.equal(artifact?.captureStep, "initial_load");
  assert.equal(artifact?.viewport.width, 1600);
});

test("getVisualEvidenceArtifacts filters unusable entries", () => {
  const artifacts = getVisualEvidenceArtifacts({
    visual_evidence_artifacts: [
      {
        id: "initial_load:abc",
        key: "scans/scan-1/visual/initial-load-001.webp",
        status: "available"
      },
      null,
      {
        status: "available"
      }
    ]
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]?.id, "initial_load:abc");
});

test("getVisualEvidenceArtifacts supports camelCase fallback", () => {
  const artifacts = getVisualEvidenceArtifacts({
    visualEvidenceArtifacts: [
      {
        id: "initial_load:def",
        key: null,
        status: "upload_failed"
      }
    ]
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0]?.status, "upload_failed");
});

