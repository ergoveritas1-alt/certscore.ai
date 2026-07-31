import assert from "node:assert/strict";
import test from "node:test";
import {
  hasConsentGateReachedHardCap,
  shouldConfirmSparsePageCandidate,
} from "./scanners/pre-consent-runtime-scanner.js";

test("adaptive consent gates enforce the 25-second navigation-relative hard cap", () => {
  assert.equal(hasConsentGateReachedHardCap(-1), false);
  assert.equal(hasConsentGateReachedHardCap(24_999), false);
  assert.equal(hasConsentGateReachedHardCap(25_000), true);
  assert.equal(hasConsentGateReachedHardCap(31_050), true);
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
