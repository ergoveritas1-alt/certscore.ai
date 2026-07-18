import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentUiObservation } from "@certscore/contracts";
import {
  reconcileConsentUiRecapture,
  shouldCaptureSettledPreConsentScreenshot,
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
