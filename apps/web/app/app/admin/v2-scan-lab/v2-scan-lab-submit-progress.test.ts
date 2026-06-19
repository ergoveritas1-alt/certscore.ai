import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDisplayedScanProgress,
  describeScanProgressPhase,
  estimateScanProgressForOptions,
  shouldResetV2ScanLabPendingOverlay,
} from "./v2-scan-lab-submit-progress";

test("v2 scan lab progress moves visibly during the first few seconds", () => {
  assert.equal(calculateDisplayedScanProgress({
    active: false,
    elapsedMs: 3_000,
    estimatedDurationMs: 26_000,
  }), 0);

  const progressAtThreeSeconds = calculateDisplayedScanProgress({
    active: true,
    elapsedMs: 3_000,
    estimatedDurationMs: 26_000,
  });

  assert.ok(progressAtThreeSeconds >= 14);
  assert.ok(progressAtThreeSeconds <= 18);
});

test("v2 scan lab progress slows near completion until redirect finishes", () => {
  const progressAtEstimate = calculateDisplayedScanProgress({
    active: true,
    elapsedMs: 26_000,
    estimatedDurationMs: 26_000,
  });
  assert.ok(progressAtEstimate >= 84);
  assert.ok(progressAtEstimate <= 90);
  const overdueProgress = calculateDisplayedScanProgress({
    active: true,
    elapsedMs: 80_000,
    estimatedDurationMs: 26_000,
  });
  assert.ok(overdueProgress >= 94);
  assert.ok(overdueProgress <= 96);
});

test("v2 scan progress estimates remain core-profile based when consent DAG is requested", () => {
  const estimate = estimateScanProgressForOptions({
    consentDag: true,
    profileValue: "full",
  });

  assert.equal(estimate.modeLabel, "full scan");
  assert.equal(estimate.estimatedDurationMs, 32_000);

  const progressAtLateCoreEstimate = calculateDisplayedScanProgress({
    active: true,
    elapsedMs: 26_000,
    estimatedDurationMs: estimate.estimatedDurationMs,
  });
  assert.ok(progressAtLateCoreEstimate >= 78);
  assert.ok(progressAtLateCoreEstimate <= 86);

  const progressAtEstimate = calculateDisplayedScanProgress({
    active: true,
    elapsedMs: estimate.estimatedDurationMs,
    estimatedDurationMs: estimate.estimatedDurationMs,
  });
  assert.ok(progressAtEstimate >= 84);
  assert.ok(progressAtEstimate <= 90);
});

test("v2 scan lab progress describes the visible scan phase", () => {
  assert.equal(describeScanProgressPhase({
    elapsedMs: 1_000,
    estimatedDurationMs: 26_000,
  }), "starting browser");
  assert.equal(describeScanProgressPhase({
    elapsedMs: 8_000,
    estimatedDurationMs: 26_000,
  }), "capturing page evidence");
  assert.equal(describeScanProgressPhase({
    elapsedMs: 16_000,
    estimatedDurationMs: 26_000,
  }), "checking policies");
  assert.equal(describeScanProgressPhase({
    elapsedMs: 22_000,
    estimatedDurationMs: 26_000,
  }), "reviewing signals");
  assert.equal(describeScanProgressPhase({
    elapsedMs: 34_000,
    estimatedDurationMs: 26_000,
  }), "finalizing artifacts");
});

test("v2 scan lab pending overlay resets when completed artifacts load", () => {
  assert.equal(shouldResetV2ScanLabPendingOverlay({
    artifactStatus: "empty",
    scanStatus: "",
    selectedChainKey: "",
  }), false);

  assert.equal(shouldResetV2ScanLabPendingOverlay({
    artifactStatus: "ready",
    scanStatus: "complete",
    selectedChainKey: "lab-kbdlab-io-full-20260615T183447:kbdlab.io",
  }), true);
});
