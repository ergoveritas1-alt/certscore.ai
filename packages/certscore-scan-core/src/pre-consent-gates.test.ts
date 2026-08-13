import assert from "node:assert/strict";
import test from "node:test";
import {
  hasConsentGateReachedHardCap,
  isStableConsentProofPacket,
  shouldConfirmSparsePageCandidate,
  shouldExitConsentGateWithStablePartialPacket,
  shouldExtendConsentGateToHardCap,
} from "./scanners/pre-consent-runtime-scanner.js";

test("adaptive consent gates enforce the 25-second navigation-relative hard cap", () => {
  assert.equal(hasConsentGateReachedHardCap(-1), false);
  assert.equal(hasConsentGateReachedHardCap(24_999), false);
  assert.equal(hasConsentGateReachedHardCap(25_000), true);
  assert.equal(hasConsentGateReachedHardCap(31_050), true);
});

test("consent proof stability requires inventory, geometry, and a representative screenshot", () => {
  const observation = {
    basis: ["inventory:paired_settled_frame_completed"],
    captureDiagnostics: {
      completedChannels: ["dom_inventory", "geometry"],
      failedChannels: [],
      timedOutChannels: []
    },
    captureStatus: "complete",
    controls: [],
    inventoryDiagnostics: { blockingInaccessibleFrameCount: 0 },
    inventoryOutcome: "complete_empty"
  } as never;

  assert.equal(isStableConsentProofPacket({
    geometryArtifactWritten: true,
    observation,
    representativeScreenshotAvailable: true
  }), true);
  assert.equal(isStableConsentProofPacket({
    geometryArtifactWritten: true,
    observation,
    representativeScreenshotAvailable: false
  }), false);
});

test("the 25-second gate opens only for recent consent-surface progress", () => {
  assert.equal(shouldExtendConsentGateToHardCap(undefined), false);
  assert.equal(shouldExtendConsentGateToHardCap("canonical_cmp_script_appeared"), false);
  assert.equal(shouldExtendConsentGateToHardCap("canonical_cmp_frame_appeared"), true);
  assert.equal(shouldExtendConsentGateToHardCap("classified_control_inventory_increased"), true);
  assert.equal(shouldExtendConsentGateToHardCap("text_backed_consent_surface_retained"), true);
});

test("a stable partial packet exits at 10 seconds only when classified controls stopped changing", () => {
  assert.equal(shouldExitConsentGateWithStablePartialPacket({
    stablePartialProofPacket: true,
    hasMeaningfulProgress: false,
    retainedClassifiedControlCount: 1,
  }), true);
  assert.equal(shouldExitConsentGateWithStablePartialPacket({
    stablePartialProofPacket: true,
    hasMeaningfulProgress: true,
    retainedClassifiedControlCount: 1,
  }), false);
  assert.equal(shouldExitConsentGateWithStablePartialPacket({
    stablePartialProofPacket: false,
    hasMeaningfulProgress: false,
    retainedClassifiedControlCount: 1,
  }), false);
  assert.equal(shouldExitConsentGateWithStablePartialPacket({
    stablePartialProofPacket: true,
    hasMeaningfulProgress: false,
    retainedClassifiedControlCount: 0,
  }), false);
});

test("sparse consent-only pages skip no-go confirmation after a complete choice set is retained", () => {
  assert.equal(shouldConfirmSparsePageCandidate({
    bodyText: "Reject all Manage preferences Accept all",
    hasSufficientFirstLayerControls: true,
  }), false);
});

test("sparse pages without sufficient controls retain the bounded no-go confirmation", () => {
  assert.equal(shouldConfirmSparsePageCandidate({
    bodyText: "Accept all Manage preferences",
    hasSufficientFirstLayerControls: false,
  }), true);
});

test("explicit loading states retain no-go confirmation even if controls were observed", () => {
  assert.equal(shouldConfirmSparsePageCandidate({
    bodyText: "Please wait",
    hasSufficientFirstLayerControls: true,
  }), true);
});
