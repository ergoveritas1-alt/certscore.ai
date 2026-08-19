import assert from "node:assert/strict";
import test from "node:test";
import type { Page } from "playwright";
import {
  acquireCdpSessionBeforeDeadline,
  consentGateAuditBucket,
  consentGateCheckpointSchedule,
  consentGateProbeBudget,
  consentGateStablePartialDisposition,
  hasConsentGateReachedHardCap,
  isStableConsentProofPacket,
  shouldConfirmSparsePageCandidate,
  shouldExitStablePartialConsentGate,
  shouldExtendConsentGateToHardCap,
} from "./scanners/pre-consent-runtime-scanner.js";

test("CDP acquisition is included in the caller's absolute screenshot deadline", async () => {
  const page = {
    context: () => ({
      newCDPSession: async () => await new Promise<never>(() => undefined),
    }),
  } as unknown as Page;
  const startedAtMs = Date.now();

  await assert.rejects(
    acquireCdpSessionBeforeDeadline(page, startedAtMs + 20),
    /CDP session acquisition timed out/,
  );
  assert.ok(
    Date.now() - startedAtMs < 250,
    "a stalled CDP session must not outlive the bounded screenshot transaction",
  );
});

test("adaptive consent gates enforce the 24-second navigation-relative hard cap", () => {
  assert.equal(hasConsentGateReachedHardCap(-1), false);
  assert.equal(hasConsentGateReachedHardCap(23_999), false);
  assert.equal(hasConsentGateReachedHardCap(24_000), true);
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

test("late extension remains limited to meaningful consent-surface progress", () => {
  assert.equal(shouldExtendConsentGateToHardCap(undefined), false);
  assert.equal(shouldExtendConsentGateToHardCap("canonical_cmp_script_appeared"), false);
  assert.equal(shouldExtendConsentGateToHardCap("canonical_cmp_frame_appeared"), true);
  assert.equal(shouldExtendConsentGateToHardCap("classified_control_inventory_increased"), true);
  assert.equal(shouldExtendConsentGateToHardCap("text_backed_consent_surface_retained"), true);
});

test("the calibrated partial exit requires two seconds of unchanged typed controls", () => {
  assert.equal(shouldExitStablePartialConsentGate({
    controlCount: 1,
    progressObserved: false,
    proofStable: true,
    stableForMs: 2_000,
  }), true);
  assert.equal(shouldExitStablePartialConsentGate({
    controlCount: 1,
    progressObserved: true,
    proofStable: true,
    stableForMs: 2_000,
  }), false, "new control evidence must keep the adaptive window open");
  assert.equal(shouldExitStablePartialConsentGate({
    controlCount: 1,
    progressObserved: false,
    proofStable: true,
    stableForMs: 1_999,
  }), false, "a single checkpoint without the calibrated stability interval is insufficient");
  assert.equal(shouldExitStablePartialConsentGate({
    controlCount: 1,
    progressObserved: false,
    proofStable: false,
    stableForMs: 2_000,
  }), false, "an incomplete proof packet must not use the calibrated shortcut");
});

test("probability-gate audit sampling is deterministic and bounded to twenty buckets", () => {
  const key = "https://example.test/|1787112201253";
  const bucket = consentGateAuditBucket(key);
  assert.equal(consentGateAuditBucket(key), bucket);
  assert.ok(bucket >= 0 && bucket < 20);
});

test("adaptive consent checkpoints start at four seconds and advance every two seconds", () => {
  assert.deepEqual(consentGateCheckpointSchedule(3_000), [
    4_000, 6_000, 8_000, 10_000, 12_000, 14_000,
    16_000, 18_000, 20_000, 22_000, 24_000,
  ]);
});

test("four- and six-second partial packets stay shadow-only before the calibrated live floor", () => {
  assert.equal(consentGateStablePartialDisposition(4_000, false), "early_shadow");
  assert.equal(consentGateStablePartialDisposition(6_000, false), "early_shadow");
  assert.equal(consentGateStablePartialDisposition(8_000, false), "exit");
  assert.equal(consentGateStablePartialDisposition(8_000, true), "audit_holdout");
  assert.equal(consentGateStablePartialDisposition(18_000, true), "exit");
});

test("late adaptive-gate entry runs one catch-up snapshot and skips older checkpoints", () => {
  assert.deepEqual(consentGateCheckpointSchedule(9_000), [
    8_000, 10_000, 12_000, 14_000, 16_000, 18_000, 20_000, 22_000, 24_000,
  ]);
  assert.deepEqual(consentGateCheckpointSchedule(17_000), [
    16_000, 18_000, 20_000, 22_000, 24_000,
  ]);
  assert.deepEqual(consentGateCheckpointSchedule(25_000), [24_000]);
});

test("expired adaptive gates take one rapid typed snapshot instead of starting an unbounded semantic probe", () => {
  assert.deepEqual(consentGateProbeBudget(0), {
    accessibilityTimeoutMs: 100,
    rapidInventoryTimeoutMs: 100,
    returnAfterRapidSnapshot: true,
    waitForControlTimeoutMs: 0,
  });
});

test("adaptive gate probe channels fit within the remaining navigation-relative window", () => {
  const budget = consentGateProbeBudget(3_000);
  assert.equal(budget.returnAfterRapidSnapshot, false);
  assert.ok(budget.accessibilityTimeoutMs <= 750);
  assert.ok(budget.rapidInventoryTimeoutMs <= 300);
  assert.ok(
    budget.accessibilityTimeoutMs + budget.rapidInventoryTimeoutMs + budget.waitForControlTimeoutMs <= 2_950,
    "gate probes must retain a finishing reserve inside the caller's navigation-relative window",
  );
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
