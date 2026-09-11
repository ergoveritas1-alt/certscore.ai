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
    const record = { events: [], runtimeArtifacts: {
      [action === "accept" ? "postAcceptEvidenceProjection" : "postRefusalEvidenceProjection"]: projection,
    } } as any;
    const result = action === "accept" ? deriveApiV2PostAcceptObservation(record) : deriveApiV2PostRefusalObservation(record);
    assert.ok(result);
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
}
