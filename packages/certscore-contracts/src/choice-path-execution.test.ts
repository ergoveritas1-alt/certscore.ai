import assert from "node:assert/strict";
import test from "node:test";
import { assessChoicePathExecution, choicePathExecutionLabel, retainRegisteredObservationCompletion } from "./choice-path-execution";
import { postAcceptReportProjectionSchema } from "./post-accept-observation";
import { postRefusalReportProjectionSchema } from "./post-refusal-observation";

function fixture(action: "accept" | "reject") {
  const schema = action === "accept" ? postAcceptReportProjectionSchema : postRefusalReportProjectionSchema;
  return schema.parse({
    contractVersion: action === "accept" ? "certscore.post_accept_report_projection.v1" : "certscore.post_refusal_report_projection.v1",
    completedAt: "2026-09-14T00:00:02.000Z", status: "unconfirmed", registrationStatus: "unconfirmed",
    productionProjectable: false, evidenceDisposition: "indeterminate", indeterminateReason: "unconfirmed",
    contradictionObserved: false, observationCount: 0, observationWindowMs: 1000, limitations: [],
    packetSha256: "a".repeat(64), resolverMethod: "cmp_registry_recipe",
    ...(action === "accept" ? { acceptanceExercised: false, postAcceptActivity: [] }
      : { refusalExercised: false, postRefusalActivity: [], preConsentStorageNotCleared: [] }),
    actionControlProof: { contractVersion: "certscore.consent_action_control_proof.v2", action,
      observedAtMs: 50, accessibleLabel: action === "accept" ? "Accept all" : "Reject all",
      labelSource: "visible_text", actionSemantics: "direct_label", classifierIntent: action,
      classifierConfidence: 1, recipeId: "fixture", selectorHint: "#choice", visible: true, enabled: true, uniquelyActionable: true },
    afterActionCapture: { policyVersion: "bounded_after_action_capture.v2", action, activationStatus: "completed",
      actionDispatchedAtMs: 100, captureEndedAtMs: 1100, requestedWindowMs: 1000, stopReason: "window_elapsed",
      requestsDropped: 0, storageSnapshotRetained: true, storageWriteCoverage: "bounded_main_document_sample",
      storageWrites: [], requestIds: [], requestAncestry: [] }, afterActionRequests: [], afterActionStorage: [],
  });
}

for (const action of ["accept", "reject"] as const) {
  const schema = action === "accept" ? postAcceptReportProjectionSchema : postRefusalReportProjectionSchema;
  test(`${action}: terminal proof survives persistence without changing registration or finding eligibility`, () => {
    const original = fixture(action);
    const value = { ...original,
      actionControlProof: { ...original.actionControlProof!, authorizedTargetSha256: "c".repeat(64) },
      terminalDecisionEvidence: { policyVersion: "bounded_terminal_consent_decision.v1", action,
        authorizedTargetSha256: "c".repeat(64), readStartedAtMs: 900, readCompletedAtMs: 950,
        evidence: { policyVersion: "semantic_consent_registration.v2", decision: action === "accept" ? "granted" : "denied",
          basis: "verified_state", observedAtMs: 925, observedStateSha256: "d".repeat(64), timestampBasis: "verified_state_observed" } },
    };
    const projection = schema.parse(value);
    const execution = assessChoicePathExecution(projection, action);
    assert.equal(execution.status, "succeeded_with_confirmation");
    const retained = schema.parse(JSON.parse(JSON.stringify({ ...projection, execution })));
    assert.deepEqual(retained.terminalDecisionEvidence, projection.terminalDecisionEvidence);
    assert.equal(retained.registrationStatus, "unconfirmed");
    assert.equal(retained.status, "unconfirmed");
    assert.equal(retained.productionProjectable, false);
    assert.equal(retained.observationCount, 0);
    assert.equal(retained.decisionEvidence, original.decisionEvidence);
    for (const bad of [
      { authorizedTargetSha256: "e".repeat(64) }, { readStartedAtMs: 99 }, { readCompletedAtMs: 1101 },
      { readCompletedAtMs: 899 },
      { evidence: { ...value.terminalDecisionEvidence.evidence, decision: action === "accept" ? "denied" : "granted" } },
      { evidence: { ...value.terminalDecisionEvidence.evidence, observedAtMs: 99 } },
      { evidence: { ...value.terminalDecisionEvidence.evidence, observedStateSha256: undefined } },
    ]) assert.equal(schema.safeParse({ ...value, terminalDecisionEvidence: { ...value.terminalDecisionEvidence, ...bad } }).success, false);
    for (const bad of [{ requestsDropped: 1 }, { storageSnapshotRetained: false }, { stopReason: "aborted" }]) {
      assert.equal(schema.safeParse({ ...value, afterActionCapture: { ...value.afterActionCapture, ...bad } }).success, false);
    }
    assert.equal(assessChoicePathExecution({ ...projection, packetSha256: undefined }, action).consentConfirmed, false);
  });
  test(`${action}: completed capture succeeds without changing consent registration or eligibility`, () => {
    const projection = fixture(action);
    const execution = assessChoicePathExecution(projection, action);
    assert.deepEqual(execution, { policyVersion: "choice_path_execution.v1", status: "succeeded",
      clickCompleted: true, observationCompleted: true, consentConfirmed: false });
    assert.equal(choicePathExecutionLabel(execution), "Consent unconfirmed");
    const persisted = schema.parse(JSON.parse(JSON.stringify({ ...projection, execution })));
    assert.equal(persisted.registrationStatus, "unconfirmed");
    assert.equal(persisted.productionProjectable, false);
    assert.equal(persisted.observationCount, 0);
    assert.deepEqual(persisted.execution, execution);
    assert.equal(projection.execution, undefined); // Compatibility assessment does not mutate history.
  });

  test(`${action}: confirmation is additional and cannot excuse incomplete capture`, () => {
    const projection = schema.parse({ ...fixture(action), registrationStatus: "confirmed", status: "confirmed_clean",
      productionProjectable: true, evidenceDisposition: "confirmed", indeterminateReason: null,
      decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: action === "accept" ? "granted" : "denied",
        basis: "verified_state", observedAtMs: 101, observedStateSha256: "b".repeat(64), timestampBasis: "verified_state_observed" },
      captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 },
      ...(action === "accept" ? { acceptanceExercised: true, acceptanceRegisteredAtMs: 101 }
        : { refusalExercised: true, refusalRegisteredAtMs: 101 }) });
    assert.equal(assessChoicePathExecution(projection, action).status, "succeeded_with_confirmation");
    const partial = schema.parse({ ...projection, afterActionCapture: { ...projection.afterActionCapture,
      stopReason: "aborted", captureEndedAtMs: 500 } });
    assert.deepEqual(assessChoicePathExecution(partial, action), { policyVersion: "choice_path_execution.v1", status: "limited",
      clickCompleted: true, observationCompleted: false, consentConfirmed: true });
    const confirmedProtocol = schema.parse({ ...projection, afterActionCapture: undefined, afterActionRequests: undefined,
      afterActionStorage: undefined, status: "confirmed_observation", observationCount: 1,
      registeredObservationCompletion: retainRegisteredObservationCompletion({ action, registeredAtMs: 101,
        productionProjectable: true, cancelled: false, requestsDropped: 0, observationWindowMs: 1000,
        observedDurationMs: 50, readyAtMs: 151, exitReason: "non_essential_request_observed", observationCount: 1 }),
      limitations: ["observation_early_exit:non_essential_request_observed"] });
    assert.equal(assessChoicePathExecution(confirmedProtocol, action).status, "succeeded_with_confirmation");
    const legacy = schema.parse({ ...confirmedProtocol, registeredObservationCompletion: undefined });
    assert.equal(assessChoicePathExecution(legacy, action).status, "limited");
    assert.equal(assessChoicePathExecution(schema.parse({ ...projection, decisionEvidence: undefined,
      captureCoverage: undefined }), action).status, "succeeded");
    assert.equal(schema.safeParse({ ...confirmedProtocol, registeredObservationCompletion: {
      ...confirmedProtocol.registeredObservationCompletion, startedAtMs: 102,
    } }).success, false);
  });

  test(`${action}: missing evidence, uncertain clicks, truncation and source tampering never succeed`, () => {
    const projection = fixture(action);
    for (const change of [
      { packetSha256: undefined },
      { afterActionCapture: { ...projection.afterActionCapture, activationStatus: "uncertain", stopReason: "click_uncertain" } },
      { afterActionCapture: { ...projection.afterActionCapture, stopReason: "target_changed" } },
      { afterActionCapture: { ...projection.afterActionCapture, requestsDropped: 1 } },
      { afterActionCapture: { ...projection.afterActionCapture, storageSnapshotRetained: false } },
      { afterActionCapture: undefined, afterActionRequests: undefined, afterActionStorage: undefined },
    ]) {
      const changed = schema.parse({ ...projection, ...change });
      assert.equal(assessChoicePathExecution(changed, action).status, "limited");
    }
    const execution = assessChoicePathExecution(projection, action);
    assert.equal(schema.safeParse({ ...projection, packetSha256: undefined, execution }).success, false);
    assert.equal(schema.safeParse({ ...projection, execution: { ...execution, status: "succeeded_with_confirmation", consentConfirmed: true } }).success, false);
    assert.equal(schema.safeParse({ ...projection, afterActionCapture: { ...projection.afterActionCapture, requestIds: ["missing"] } }).success, false);
  });
}

test("registered completion requires retained elapsed-window or eligible early-exit evidence", () => {
  const base = { action: "accept" as const, registeredAtMs: 100, productionProjectable: true, cancelled: false,
    requestsDropped: 0, observationWindowMs: 1000, observedDurationMs: 1000, readyAtMs: 1100,
    exitReason: "window_elapsed", observationCount: 0 };
  assert.equal(retainRegisteredObservationCompletion(base)?.termination, "window_elapsed");
  for (const change of [{ observedDurationMs: 999 }, { readyAtMs: 1099 }, { cancelled: true },
    { requestsDropped: 1 }, { exitReason: undefined }, { exitReason: "non_essential_request_observed" },
    { productionProjectable: false }, { registeredAtMs: undefined }]) {
    assert.equal(retainRegisteredObservationCompletion({ ...base, ...change }), undefined);
  }
});
