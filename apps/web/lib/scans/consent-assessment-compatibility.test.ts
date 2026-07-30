import assert from "node:assert/strict";
import test from "node:test";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import {
  assessmentSurfaceCompatibilityState,
  canonicalConsentSurfaceCompatibilityFromSnapshot,
  withCanonicalConsentSnapshotCompatibility
} from "./consent-assessment-compatibility";

const URL = "https://site-under-test.example/";

function assessment(input: {
  coverage: "complete" | "none";
  surface: "not_observed" | "unknown";
}) {
  return deriveConsentControlAssessment({
    scan: {
      scanId: `scan-${input.surface}`,
      requestedUrl: URL,
      finalUrl: URL,
      scanStatus: "completed"
    },
    document: {
      canonicalDocumentId: URL,
      observedDocumentIds: [URL],
      identityStatus: "matched"
    },
    observations: [],
    geometry: {
      assessmentStatus: input.coverage === "complete" ? "complete" : "incomplete",
      documentId: URL,
      completedChannels: input.coverage === "complete" ? ["dom_inventory", "geometry"] : [],
      incompleteChannels: input.coverage === "complete" ? [] : ["dom_inventory", "geometry"],
      candidates: []
    },
    surface: {
      status: input.surface,
      firstObservedAtMs: null,
      lastObservedAtMs: null,
      evidenceRefs: []
    },
    coverage: {
      status: input.coverage,
      requiredChannels: ["dom_inventory", "geometry"],
      completedChannels: input.coverage === "complete" ? ["dom_inventory", "geometry"] : [],
      incompleteChannels: input.coverage === "complete" ? [] : ["dom_inventory", "geometry"]
    },
    source: {
      bundleVersion: "fixture",
      geometryVersion: "consent_control_geometry.v1",
      computedAt: "2026-07-30T00:00:00.000Z"
    }
  });
}

test("canonical consent compatibility preserves unknown instead of legacy false", () => {
  const limited = assessment({ coverage: "none", surface: "unknown" });
  const snapshot = withCanonicalConsentSnapshotCompatibility({
    consent_control_assessment: limited,
    cookie_banner_present: false
  });

  assert.equal(limited.assessmentStatus, "limited");
  assert.equal(assessmentSurfaceCompatibilityState(limited), null);
  assert.equal(canonicalConsentSurfaceCompatibilityFromSnapshot(snapshot), null);
  assert.equal(snapshot.cookie_banner_present, null);
});

test("canonical consent compatibility emits false only for complete retained absence", () => {
  const completeAbsence = assessment({ coverage: "complete", surface: "not_observed" });

  assert.equal(completeAbsence.assessmentStatus, "complete");
  assert.equal(assessmentSurfaceCompatibilityState(completeAbsence), false);
  assert.equal(
    canonicalConsentSurfaceCompatibilityFromSnapshot({
      consent_control_assessment: completeAbsence,
      cookie_banner_present: true
    }),
    false
  );
});
