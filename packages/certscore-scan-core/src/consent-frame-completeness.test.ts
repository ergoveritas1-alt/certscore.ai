import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentUiObservation } from "@certscore/contracts";
import {
  classifyInaccessibleConsentFrame,
  mergeConsentUiObservations,
} from "./scanners/pre-consent-runtime-scanner";

function observation(): ConsentUiObservation {
  return {
    observationId: "observation",
    observedAtMs: 100,
    sourceScanner: "test",
    scenario: "test",
    consentStateAtTime: "pre_consent",
    documentUrl: "https://example.com/",
    captureStatus: "no_evidence",
    likelyPresent: false,
    basis: [],
    visibleChoiceLabels: [],
    defaultTogglePurposeLabels: [],
    precheckedOptionalPurposeCount: 0,
    precheckedOptionalPurposeLabels: [],
    acceptControlObserved: false,
    rejectControlObserved: false,
    managePreferencesControlObserved: false,
    controls: [],
    inventoryOutcome: "complete_empty",
    evidenceRefs: [],
    confidence: 1,
  };
}

test("detached child frames do not invalidate a completed consent inventory", () => {
  assert.deepEqual(
    classifyInaccessibleConsentFrame({ detached: true, url: "about:blank" }),
    { blocksConsentCompleteness: false, reasonCode: "detached_frame" },
  );
});

test("canonical embedded media frames stay separate from consent completeness", () => {
  assert.deepEqual(
    classifyInaccessibleConsentFrame({
      detached: false,
      url: "https://www.youtube.com/embed/abc123",
    }),
    { blocksConsentCompleteness: false, reasonCode: "canonical_embedded_media" },
  );
});

test("known CMP and unknown inaccessible frames remain fail-closed", () => {
  assert.deepEqual(
    classifyInaccessibleConsentFrame({
      detached: false,
      url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
    }),
    { blocksConsentCompleteness: true, reasonCode: "known_cmp_frame" },
  );
  assert.deepEqual(
    classifyInaccessibleConsentFrame({
      detached: false,
      url: "https://unclassified.example/frame",
    }),
    { blocksConsentCompleteness: true, reasonCode: "unknown_frame" },
  );
});

test("merged retained observation preserves bounded inaccessible-frame diagnostics", () => {
  const current = observation();
  const candidate = observation();
  candidate.inventoryDiagnostics = {
    candidateContainerCount: 0,
    candidateControlCount: 0,
    retainedControlCount: 0,
    inspectedFrameCount: 2,
    inaccessibleFrameCount: 1,
    blockingInaccessibleFrameCount: 0,
    nonBlockingInaccessibleFrameCount: 1,
    nonBlockingInaccessibleFrameReasonCodes: ["detached_frame"],
    inventorySources: [],
    candidateLabels: [],
    rejectionReasons: [],
    timingMarkers: [],
  };

  const merged = mergeConsentUiObservations(current, candidate, "test:merge");

  assert.equal(merged.inventoryOutcome, "complete_empty");
  assert.equal(merged.inventoryDiagnostics?.blockingInaccessibleFrameCount, 0);
  assert.equal(merged.inventoryDiagnostics?.nonBlockingInaccessibleFrameCount, 1);
  assert.deepEqual(
    merged.inventoryDiagnostics?.nonBlockingInaccessibleFrameReasonCodes,
    ["detached_frame"],
  );
});
