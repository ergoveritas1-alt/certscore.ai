import { observedControlAssessment } from "../scans/test-fixtures/observed-control-assessment";
import assert from "node:assert/strict";
import test from "node:test";
import { deriveAfterActionSummary, afterActionInterpretation } from "./after-action-summary";
import { apiV2PostAcceptObservationSchema, apiV2PostRefusalObservationSchema } from "@certscore/api-contracts";
import { deriveApiV2PostAcceptObservation, deriveApiV2PostRefusalObservation } from "./scan-resource";
import { POST_ACCEPT_REPORT_PROJECTION_VERSION, POST_REFUSAL_REPORT_PROJECTION_VERSION } from "@certscore/contracts";

function fixture(action: "accept" | "reject") {
  return {
    contractVersion: action === "accept" ? POST_ACCEPT_REPORT_PROJECTION_VERSION : POST_REFUSAL_REPORT_PROJECTION_VERSION,
    completedAt: "2026-09-11T12:00:00.000Z", packetSha256: "a".repeat(64),
    status: "unconfirmed", registrationStatus: "unconfirmed", resolverMethod: "canonical_consent_control_registry_recipe",
    evidenceDisposition: "indeterminate", indeterminateReason: "consent_registration_unconfirmed",
    contradictionObserved: false, limitations: [], observationCount: 0, observationWindowMs: 1000,
    productionProjectable: false,
    ...(action === "accept" ? { acceptanceExercised: false, postAcceptActivity: [] }
      : { refusalExercised: false, postRefusalActivity: [], preConsentStorageNotCleared: [] }),
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v2", action, observedAtMs: 99,
      accessibleLabel: action === "accept" ? "Accept all" : "Reject all", labelSource: "visible_text",
      actionSemantics: "direct_label", classifierIntent: action, classifierConfidence: 1,
      recipeId: "fixture", selectorHint: "#choice", visible: true, enabled: true, uniquelyActionable: true,
    },
    afterActionCapture: {
      policyVersion: "bounded_after_action_capture.v2", action, activationStatus: "completed",
      actionDispatchedAtMs: 100, captureEndedAtMs: 1100, requestedWindowMs: 1000,
      stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample", storageWrites: [], requestIds: [], requestAncestry: [],
    },
    afterActionRequests: [], afterActionStorage: [],
  };
}

for (const action of ["accept", "reject"] as const) {
  test(`${action}: public summary preserves unconfirmed capture without registration or score promotion`, () => {
    const projection = fixture(action);
    const summary = deriveAfterActionSummary(projection, action);
    assert.ok(summary);
    assert.equal(summary.activationStatus, "completed");
    assert.match(afterActionInterpretation(summary)!, /was clicked/);
    const record = { events: [], runtimeArtifacts: { consentControlAssessment: observedControlAssessment,
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: projection,
    } } as any;
    const result = action === "accept" ? deriveApiV2PostAcceptObservation(record) : deriveApiV2PostRefusalObservation(record);
    assert.ok(result);
    assert.ok("execution" in result);
    assert.equal(result.execution?.status, "succeeded");
    assert.equal(result.execution?.consentConfirmed, false);
    assert.equal(result.status, "unconfirmed");
    assert.equal(result.productionProjectable, false);
    assert.equal(result.observationCount, 0);
    assert.deepEqual(result.afterAction, summary);
    assert.match(result.interpretation, /was clicked/);
    (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
  });
  test(`${action}: malformed, missing-hash, wrong-action and legacy capture fail closed`, () => {
    const projection = fixture(action);
    assert.equal(deriveAfterActionSummary({ ...projection, packetSha256: undefined }, action), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, actionControlProof: undefined }, action), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, afterActionCapture: { ...projection.afterActionCapture, requestIds: ["missing"] } }, action), undefined);
    assert.equal(deriveAfterActionSummary(projection, action === "accept" ? "reject" : "accept"), undefined);
    assert.equal(deriveAfterActionSummary({ ...projection, afterActionCapture: undefined, afterActionRequests: undefined, afterActionStorage: undefined }, action), undefined);
  });
  test(`${action}: partial capture and drops remain explicit`, () => {
    const projection = fixture(action);
    const summary = deriveAfterActionSummary({ ...projection, afterActionCapture: {
      ...projection.afterActionCapture, stopReason: "aborted", captureEndedAtMs: 500, requestsDropped: 2,
    } }, action);
    assert.ok(summary);
    assert.equal(summary.requestsDropped, 2);
    assert.match(afterActionInterpretation(summary)!, /capture was limited/);
    assert.doesNotMatch(afterActionInterpretation(summary)!, /window completed/);
  });
  test(`${action}: API distinguishes completed registered paths from confirmation without completion`, () => {
    const projection = { ...fixture(action), afterActionCapture: undefined, afterActionRequests: undefined,
      afterActionStorage: undefined, status: "confirmed_clean", registrationStatus: "confirmed",
      productionProjectable: true, evidenceDisposition: "confirmed", indeterminateReason: null,
      ...(action === "accept" ? { acceptanceExercised: true, acceptanceRegisteredAtMs: 101 }
        : { refusalExercised: true, refusalRegisteredAtMs: 101 }),
      decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: action === "accept" ? "granted" : "denied",
        basis: "verified_state", observedAtMs: 101, observedStateSha256: "b".repeat(64), timestampBasis: "verified_state_observed" },
      captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
      registeredObservationCompletion: { policyVersion: "registered_action_observation_completion.v1", action,
        startedAtMs: 101, completedAtMs: 1101, requiredWindowMs: 1000, termination: "window_elapsed" },
    };
    for (const complete of [true, false]) {
      const record = { events: [], runtimeArtifacts: { consentControlAssessment: observedControlAssessment,
        [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: {
          ...projection, registeredObservationCompletion: complete ? projection.registeredObservationCompletion : undefined,
        },
      } } as any;
      const result = action === "accept" ? deriveApiV2PostAcceptObservation(record) : deriveApiV2PostRefusalObservation(record);
      assert.ok(result && "execution" in result);
      assert.equal(result.execution?.status, complete ? "succeeded_with_confirmation" : "limited");
      assert.equal(result.execution?.consentConfirmed, true);
      assert.equal(result.productionProjectable, true); // Existing findings contract is independent.
      (action === "accept" ? apiV2PostAcceptObservationSchema : apiV2PostRefusalObservationSchema).parse(result);
    }
  });
}


test("customer action summaries require an observed first-layer control while retaining independent action evidence", () => {
  for (const action of ["accept", "reject"] as const) {
    for (const state of ["unknown", "not_observed"]) {
      const assessment = { ...observedControlAssessment, controls: { ...observedControlAssessment.controls,
        [action]: { ...observedControlAssessment.controls[action], state } } };
      const record = { events: [], runtimeArtifacts: { consentControlAssessment: assessment,
        [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: fixture(action),
      } } as any;
      const derive = action === "accept" ? deriveApiV2PostAcceptObservation : deriveApiV2PostRefusalObservation;
      assert.equal(derive(record), undefined);
      const key = action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection";
      record.runtimeArtifacts[key] = { ...fixture(action), afterActionCapture: undefined,
        afterActionRequests: undefined, afterActionStorage: undefined };
      assert.equal(derive(record), undefined);
      assert.ok(record.runtimeArtifacts[action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"], "internal evidence remains retained");
    }
  }
});
