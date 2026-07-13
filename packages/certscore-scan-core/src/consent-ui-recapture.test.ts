import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentUiObservation } from "@certscore/contracts";
import { reconcileConsentUiRecapture } from "./scanners/pre-consent-runtime-scanner.js";

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
