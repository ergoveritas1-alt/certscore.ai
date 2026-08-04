import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentUiObservation } from "@certscore/contracts";
import type { Page } from "playwright";
import {
  canMarkSettledConsentInventoryCompleted,
  detectConsentUi,
  reconcileConsentUiRecapture,
  reconcilePostSettleConsentUiObservation,
  shouldRunImmediateStructuredConsentRecovery,
  shouldCaptureSettledPreConsentScreenshot,
  shouldRecaptureConsentUiAfterTimeout,
} from "./scanners/pre-consent-runtime-scanner.js";

function observation(overrides: Partial<ConsentUiObservation> = {}): ConsentUiObservation {
  return {
    observationId: "consent_ui_pre_consent",
    observedAtMs: 1_000,
    likelyPresent: false,
    basis: [],
    textExcerpt: "",
    layerInspected: "unknown",
    visibleChoiceLabels: [],
    defaultToggleStatesObserved: null,
    nonEssentialDefaultsOff: null,
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    evidenceRefs: [],
    confidence: 0.5,
    ...overrides,
  };
}

test("completed negative recapture replaces an incomplete consent observation", () => {
  const result = reconcileConsentUiRecapture({
    current: observation({
      basis: ["bounded_capture_timeout_or_failure"],
      confidence: 0.4,
    }),
    candidate: observation({
      basis: ["insufficient_banner_keywords"],
      confidence: 0.5,
      observedAtMs: 2_500,
    }),
    strongerBasis: "recapture:controls",
    completedWithoutControlsBasis: "recapture:completed_without_controls",
  });

  assert.equal(result.completedNegativeRetained, true);
  assert.equal(result.strongerEvidenceRetained, false);
  assert.equal(result.observation.observedAtMs, 2_500);
  assert.equal(result.observation.basis.includes("bounded_capture_timeout_or_failure"), false);
  assert.equal(result.observation.basis.includes("recapture:completed_without_controls"), true);
});

test("a second incomplete recapture cannot erase the original capture limitation", () => {
  const current = observation({ basis: ["bounded_capture_timeout_or_failure"] });
  const result = reconcileConsentUiRecapture({
    current,
    candidate: observation({ basis: ["bounded_capture_timeout_or_failure"] }),
    strongerBasis: "recapture:controls",
    completedWithoutControlsBasis: "recapture:completed_without_controls",
  });

  assert.equal(result.completedNegativeRetained, false);
  assert.equal(result.observation, current);
  assert.equal(result.observation.basis.includes("bounded_capture_timeout_or_failure"), true);
});

test("a failed inventory probe cannot replace an earlier incomplete capture as a completed negative", () => {
  const current = observation({ basis: ["bounded_capture_timeout_or_failure"] });
  const result = reconcileConsentUiRecapture({
    current,
    candidate: observation({ basis: ["inventory:probe_failed"] }),
    strongerBasis: "recapture:controls",
    completedWithoutControlsBasis: "recapture:completed_without_controls",
  });

  assert.equal(result.completedNegativeRetained, false);
  assert.equal(result.observation, current);
});

test("completed post-settle DOM inventory is retained before later page evidence can time out", () => {
  const result = reconcilePostSettleConsentUiObservation({
    current: observation({
      captureStatus: "no_evidence",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        timedOutChannels: [],
        failedChannels: [],
      },
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      observedAtMs: 1_000,
    }),
    candidate: observation({
      captureStatus: "no_evidence",
      captureDiagnostics: {
        completedChannels: ["dom_inventory"],
        timedOutChannels: [],
        failedChannels: [],
      },
      documentUrl: "https://example.test/",
      layerInspected: "first_layer",
      observedAtMs: 2_500,
    }),
  });

  assert.equal(result.observedAtMs, 2_500);
  assert.equal(result.captureStatus, "no_evidence");
  assert.equal(result.basis.includes("settled_control_inventory_completed"), true);
  assert.equal(result.basis.includes("recapture:post_settle_dom_inventory"), true);
});

test("incomplete post-settle inventory cannot promote an early empty inventory to absence", () => {
  const current = observation({
    captureStatus: "no_evidence",
    captureDiagnostics: {
      completedChannels: ["dom_inventory"],
      timedOutChannels: [],
      failedChannels: [],
    },
    documentUrl: "https://example.test/",
    layerInspected: "first_layer",
  });
  const result = reconcilePostSettleConsentUiObservation({
    current,
    candidate: observation({
      captureStatus: "incomplete",
      captureDiagnostics: {
        completedChannels: [],
        timedOutChannels: ["dom_inventory"],
        failedChannels: [],
      },
      basis: ["inventory:rapid_dom_timed_out"],
      layerInspected: "unknown",
    }),
  });

  assert.equal(result.basis.includes("settled_control_inventory_completed"), false);
  assert.equal(result.basis.includes("recapture:post_settle_inventory_incomplete"), true);
});

test("rapid DOM timeout triggers immediate structured recovery", () => {
  assert.equal(shouldRunImmediateStructuredConsentRecovery(observation({
    captureStatus: "incomplete",
    captureDiagnostics: {
      completedChannels: [],
      timedOutChannels: ["dom_inventory"],
      failedChannels: [],
    },
    basis: ["inventory:rapid_dom_timed_out"],
  })), true);
});

test("a completed accessibility inventory closes a timed-out rapid DOM channel", () => {
  assert.equal(shouldRunImmediateStructuredConsentRecovery(observation({
    captureStatus: "no_evidence",
    captureDiagnostics: {
      completedChannels: ["accessibility_tree"],
      timedOutChannels: ["dom_inventory"],
      failedChannels: [],
    },
    basis: ["inventory:rapid_dom_timed_out", "inventory:accessibility_tree"],
  })), false);
});

test("an early completed channel cannot mask an incomplete post-settle inventory", () => {
  assert.equal(canMarkSettledConsentInventoryCompleted(observation({
    captureStatus: "no_evidence",
    captureDiagnostics: {
      completedChannels: ["accessibility_tree"],
      timedOutChannels: ["dom_inventory"],
      failedChannels: [],
    },
    basis: [
      "inventory:accessibility_tree",
      "recapture:post_settle_inventory_incomplete",
    ],
  })), false);
});

test("a newly retained options control strengthens an existing accept and reject inventory", () => {
  const current = observation({
    likelyPresent: true,
    layerInspected: "first_layer",
    visibleChoiceLabels: ["Accept All", "Reject All"],
    acceptControlObserved: true,
    rejectControlObserved: true,
    controls: [
      { label: "Accept All", actionType: "accept_all", visible: true, classifierReasonCodes: [] },
      { label: "Reject All", actionType: "reject_all", visible: true, classifierReasonCodes: [] },
    ],
  });
  const candidate = observation({
    likelyPresent: false,
    layerInspected: "unknown",
    visibleChoiceLabels: ["More Choices"],
    managePreferencesControlObserved: true,
    controls: [
      { label: "More Choices", actionType: "manage_preferences", visible: true, classifierReasonCodes: [] },
    ],
  });

  const result = reconcileConsentUiRecapture({
    current,
    candidate,
    strongerBasis: "recapture:options",
    completedWithoutControlsBasis: "recapture:completed_without_controls",
  });

  assert.equal(result.strongerEvidenceRetained, true);
  assert.equal(result.observation.acceptControlObserved, true);
  assert.equal(result.observation.rejectControlObserved, true);
  assert.equal(result.observation.managePreferencesControlObserved, true);
  assert.equal(result.observation.likelyPresent, true);
  assert.equal(result.observation.layerInspected, "first_layer");
  assert.deepEqual(
    result.observation.controls.map((control) => control.actionType).sort(),
    ["accept_all", "manage_preferences", "reject_all"],
  );
});

function rapidInventorySnapshot(withControls: boolean) {
  return {
    controls: withControls
      ? [
          { cmpScoped: true, label: "Accept", role: "button", selectorHint: "#accept", tagName: "button", visible: true },
          { cmpScoped: true, label: "Decline", role: "button", selectorHint: "#decline", tagName: "button", visible: true },
          { cmpScoped: true, label: "Customise", role: "link", selectorHint: "#customise", tagName: "a", visible: true },
        ]
      : [],
    contextText: withControls
      ? "We use cookies and advertising technologies. Accept, Decline, or Customise your preferences."
      : "",
    hasPotentialToggle: false,
  };
}

test("rapid DOM inventory retains complete first-layer controls before accessibility is attempted", async () => {
  let evaluateCallCount = 0;
  let accessibilityAttempted = false;
  const page = {
    evaluate: async (_pageFunction: unknown, argument?: unknown) => {
      evaluateCallCount += 1;
      return argument === undefined ? true : rapidInventorySnapshot(true);
    },
    context: () => {
      accessibilityAttempted = true;
      throw new Error("accessibility should not be attempted after complete rapid evidence");
    },
    url: () => "https://example.test/",
  } as unknown as Page;

  const result = await detectConsentUi(page, Date.now(), 0, {
    rapidInventoryTimeoutMs: 100,
    waitForCompleteChoiceControls: true,
  });

  assert.equal(accessibilityAttempted, false);
  assert.equal(evaluateCallCount, 2);
  assert.equal(result.acceptControlObserved, true);
  assert.equal(result.rejectControlObserved, true);
  assert.equal(result.managePreferencesControlObserved, true);
  assert.deepEqual(result.captureDiagnostics?.completedChannels, ["dom_inventory"]);
  assert.deepEqual(result.captureDiagnostics?.timedOutChannels, []);
  assert.equal(
    result.inventoryDiagnostics?.timingMarkers.includes("rapid_inventory_initial_completed"),
    true,
  );
});

test("rapid initial snapshot returns a completed empty DOM inventory without slower semantic channels", async () => {
  let evaluateCallCount = 0;
  let accessibilityAttempted = false;
  const page = {
    evaluate: async (_pageFunction: unknown, argument?: unknown) => {
      evaluateCallCount += 1;
      if (argument !== undefined) return rapidInventorySnapshot(false);
      return true;
    },
    context: () => {
      accessibilityAttempted = true;
      throw new Error("accessibility should remain a later recovery channel");
    },
    url: () => "https://example.test/",
  } as unknown as Page;

  const result = await detectConsentUi(page, Date.now(), 3_500, {
    rapidInventoryTimeoutMs: 100,
    returnAfterRapidSnapshot: true,
    waitForCompleteChoiceControls: true,
  });

  assert.equal(accessibilityAttempted, false);
  assert.equal(result.captureStatus, "no_evidence");
  assert.deepEqual(result.captureDiagnostics?.completedChannels, ["dom_inventory"]);
  assert.equal(
    result.inventoryDiagnostics?.timingMarkers.includes("rapid_snapshot"),
    true,
  );
  assert.equal(evaluateCallCount, 2);
});

test("rapid initial snapshot returns a timed-out DOM inventory as incomplete without waiting for accessibility", async () => {
  let evaluateCallCount = 0;
  let accessibilityAttempted = false;
  const page = {
    evaluate: async (_pageFunction: unknown, argument?: unknown) => {
      evaluateCallCount += 1;
      if (argument === undefined) return true;
      return await new Promise<never>(() => undefined);
    },
    context: () => {
      accessibilityAttempted = true;
      throw new Error("accessibility should remain a later recovery channel");
    },
    url: () => "https://example.test/",
  } as unknown as Page;

  const result = await detectConsentUi(page, Date.now(), 3_500, {
    rapidInventoryTimeoutMs: 100,
    returnAfterRapidSnapshot: true,
    waitForCompleteChoiceControls: true,
  });

  assert.equal(evaluateCallCount, 2);
  assert.equal(accessibilityAttempted, false);
  assert.equal(result.captureStatus, "incomplete");
  assert.deepEqual(result.captureDiagnostics?.timedOutChannels, ["dom_inventory"]);
  assert.equal(
    result.inventoryDiagnostics?.timingMarkers.includes("rapid_inventory_initial_timed_out"),
    true,
  );
});

test("post-accessibility rapid retry preserves typed controls and records the independent accessibility timeout", async () => {
  let evaluateCallCount = 0;
  let rapidSnapshotCount = 0;
  let accessibilityAttemptCount = 0;
  const page = {
    evaluate: async (_pageFunction: unknown, argument?: unknown) => {
      evaluateCallCount += 1;
      if (argument === undefined) return true;
      rapidSnapshotCount += 1;
      return rapidInventorySnapshot(rapidSnapshotCount >= 2);
    },
    context: () => ({
      newCDPSession: async () => {
        accessibilityAttemptCount += 1;
        return {
          send: async () => await new Promise<never>(() => undefined),
          detach: async () => undefined,
        };
      },
    }),
    url: () => "https://example.test/",
  } as unknown as Page;

  const result = await detectConsentUi(page, Date.now(), 0, {
    accessibilityTimeoutMs: 5,
    rapidInventoryTimeoutMs: 100,
    waitForCompleteChoiceControls: true,
  });

  assert.equal(accessibilityAttemptCount, 1);
  assert.equal(evaluateCallCount, 4);
  assert.equal(result.acceptControlObserved, true);
  assert.equal(result.rejectControlObserved, true);
  assert.equal(result.managePreferencesControlObserved, true);
  assert.deepEqual(result.captureDiagnostics?.completedChannels, ["dom_inventory"]);
  assert.deepEqual(result.captureDiagnostics?.timedOutChannels, ["accessibility_tree"]);
  assert.equal(
    result.inventoryDiagnostics?.timingMarkers.includes("accessibility_tree_inventory_timed_out"),
    true,
  );
  assert.equal(
    result.inventoryDiagnostics?.timingMarkers.includes("rapid_inventory_post_accessibility_completed"),
    true,
  );
});

test("fast mode retries a timed-out text-backed surface without inferring controls from text", () => {
  assert.equal(shouldRecaptureConsentUiAfterTimeout(observation({
    captureStatus: "incomplete",
    captureDiagnostics: {
      completedChannels: [],
      timedOutChannels: ["dom_inventory"],
      failedChannels: [],
    },
    likelyPresent: true,
    basis: ["inventory:rapid_dom_timed_out", "keyword:cookie", "keyword:preferences"],
    textExcerpt: "We use cookies. Select Accept, Decline, or Customise to manage your preferences.".repeat(2),
  }), {
    evidenceHint: true,
    fastWait: true,
  }), true);
});

test("settled screenshot replaces an early loading frame once substantive content appears", () => {
  assert.equal(shouldCaptureSettledPreConsentScreenshot({
    settledBodyText: "American Express ".repeat(50),
  }), true);
});

test("settled screenshot replaces a sparse early shell after material page growth", () => {
  assert.equal(shouldCaptureSettledPreConsentScreenshot({
    settledBodyText: "Full rendered account, card, banking, travel, rewards, and privacy content. ".repeat(12),
  }), true);
});

test("substantive pages retain a settled screenshot even when early DOM text looked representative", () => {
  const representative = "Already rendered navigation, content, disclosures, and footer. ".repeat(14);
  assert.equal(shouldCaptureSettledPreConsentScreenshot({
    settledBodyText: `${representative}One additional sentence.`,
  }), true);
});

test("settled screenshot is skipped for an insubstantial response shell", () => {
  assert.equal(shouldCaptureSettledPreConsentScreenshot({
    settledBodyText: "Temporary response shell",
  }), false);
});
