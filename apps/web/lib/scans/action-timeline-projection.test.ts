import assert from "node:assert/strict";
import test from "node:test";
import { projectSuccessfulActionTimeline } from "./action-timeline-projection";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: a completed unconfirmed click uses its own capture clock without claiming consent`, () => {
    const projection = completedActionProjection(action);
    const before = structuredClone(projection);
    const result = projectSuccessfulActionTimeline(projection, observedControlAssessment, action)!;
    assert.equal(result.clockLabel, `Times from the ${action === "accept" ? "Accept" : "Reject"} click`);
    assert.deepEqual(result.events.map(event => [event.atMs, event.label]), [[0, `${action === "accept" ? "Accept" : "Reject"} click`], [1000, "Observation end"]]);
    assert.doesNotMatch(JSON.stringify(result), /confirmed/);
    assert.deepEqual(projection, before);
  });

  test(`${action}: missing controls, incomplete execution and malformed timing cannot expose an action timeline`, () => {
    const projection = completedActionProjection(action);
    assert.equal(projectSuccessfulActionTimeline(projection, undefined, action), null);
    for (const state of ["not_observed", "unknown"]) {
      const assessment = { ...observedControlAssessment, assessmentStatus: "limited", controls: {
        ...observedControlAssessment.controls, [action]: { ...observedControlAssessment.controls[action], state },
      } };
      assert.equal(projectSuccessfulActionTimeline(projection, assessment, action), null);
    }
    for (const patch of [
      { afterActionCapture: { ...projection.afterActionCapture, stopReason: "aborted" } },
      { afterActionCapture: { ...projection.afterActionCapture, captureEndedAtMs: 50 } },
      { execution: {policyVersion:"choice_path_execution.v1",status:"succeeded",clickCompleted:true,observationCompleted:true,consentConfirmed:true} },
    ]) assert.equal(projectSuccessfulActionTimeline({ ...projection, ...patch }, observedControlAssessment, action), null);
    assert.equal(projectSuccessfulActionTimeline(projection, observedControlAssessment, action === "accept" ? "reject" : "accept"), null);
  });
}

test("confirmed Reject uses retained registration and completion offsets, never the configured window as an end timestamp", () => {
  const projection = { ...completedActionProjection("reject"), afterActionCapture: undefined, afterActionRequests: undefined, afterActionStorage: undefined,
    status: "confirmed_observation", registrationStatus: "confirmed", refusalExercised: true, refusalRegisteredAtMs: 500,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "denied", basis: "verified_state", observedStateSha256: "b".repeat(64), observedAtMs: 500, timestampBasis: "verified_state_observed" },
    captureCoverage: { requestsDroppedBeforeAction:0,requestsDroppedAfterAction:0 },
    observationCount: 1,
    registeredObservationCompletion: { policyVersion:"registered_action_observation_completion.v1",action:"reject",startedAtMs:500,completedAtMs:1900,requiredWindowMs:1000,termination:"evidence_satisfied" },
    postRefusalActivity:[{activityType:"network_request",category:"analytics",consentState:"post_reject",msAfterReject:250,nonEssential:true,vendor:"Example",hostname:"analytics.example.test"}],
  };
  const result = projectSuccessfulActionTimeline(projection, observedControlAssessment, "reject");
  assert.ok(result);
  assert.equal(result.clockLabel, "Times from confirmed Reject");
  assert.deepEqual(result.events.map(event => [event.atMs,event.label]), [[0,"Reject confirmed"],[250,"Non-essential request"],[1400,"Observation end"]]);
  assert.equal(result.events[1]?.tone, "neutral");
  const issue = projectSuccessfulActionTimeline(projection, observedControlAssessment, "reject", "concern")!;
  assert.deepEqual(issue.events.map(event => event.tone), ["positive", "concern", "neutral"]);
});
