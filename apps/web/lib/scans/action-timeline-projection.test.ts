import assert from "node:assert/strict";
import test from "node:test";
import { projectRetainedActionTimeline } from "./action-timeline-projection";
import { completedActionProjection } from "./test-fixtures/action-execution-projection";
import { observedControlAssessment } from "./test-fixtures/observed-control-assessment";

for (const action of ["accept", "reject"] as const) {
  test(`${action}: a completed unconfirmed click uses its own capture clock without claiming consent`, () => {
    const projection = completedActionProjection(action);
    const before = structuredClone(projection);
    const result = projectRetainedActionTimeline(projection, observedControlAssessment, action)!;
    assert.equal(result.clockLabel, `Times from the ${action === "accept" ? "Accept" : "Reject"} click`);
    assert.deepEqual(result.events.map(event => [event.atMs, event.label]), [[0, `${action === "accept" ? "Accept" : "Reject"} click`], [1000, "Observation end"]]);
    assert.doesNotMatch(JSON.stringify(result), /confirmed/);
    assert.deepEqual(projection, before);
  });

  test(`${action}: missing controls, failed clicks and malformed timing cannot expose an action timeline`, () => {
    const projection = completedActionProjection(action);
    assert.equal(projectRetainedActionTimeline(projection, undefined, action), null);
    for (const state of ["not_observed", "unknown"]) {
      const assessment = { ...observedControlAssessment, assessmentStatus: "limited", controls: {
        ...observedControlAssessment.controls, [action]: { ...observedControlAssessment.controls[action], state },
      } };
      assert.equal(projectRetainedActionTimeline(projection, assessment, action), null);
    }
    for (const patch of [
      { afterActionCapture: { ...projection.afterActionCapture, captureEndedAtMs: 50 } },
      { execution: {policyVersion:"choice_path_execution.v1",status:"succeeded",clickCompleted:true,observationCompleted:true,consentConfirmed:true} },
    ]) assert.equal(projectRetainedActionTimeline({ ...projection, ...patch }, observedControlAssessment, action), null);
    assert.equal(projectRetainedActionTimeline(projection, observedControlAssessment, action === "accept" ? "reject" : "accept"), null);
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
  const result = projectRetainedActionTimeline(projection, observedControlAssessment, "reject");
  assert.ok(result);
  assert.equal(result.clockLabel, "Times from confirmed Reject");
  assert.deepEqual(result.events.map(event => [event.atMs,event.label]), [[0,"Reject confirmed"],[250,"Non-essential request"],[1400,"Worker complete"]]);
  assert.equal(result.events[1]?.tone, "neutral");
  const issue = projectRetainedActionTimeline(projection, observedControlAssessment, "reject", "concern")!;
  assert.deepEqual(issue.events.map(event => event.tone), ["positive", "concern", "neutral"]);
});


test("ordinary Accept activity stays neutral even if a caller requests concern coloring", () => {
  const projection = { ...completedActionProjection("accept"), afterActionCapture: undefined,
    afterActionRequests: undefined, afterActionStorage: undefined, status: "confirmed_observation",
    registrationStatus: "confirmed", acceptanceExercised: true, acceptanceRegisteredAtMs: 500,
    decisionEvidence: { policyVersion: "semantic_consent_registration.v2", decision: "granted", basis: "verified_state",
      observedStateSha256: "b".repeat(64), observedAtMs: 500, timestampBasis: "verified_state_observed" },
    captureCoverage: { requestsDroppedBeforeAction: 0, requestsDroppedAfterAction: 0 }, observationCount: 1,
    registeredObservationCompletion: { policyVersion: "registered_action_observation_completion.v1", action: "accept",
      startedAtMs: 500, completedAtMs: 1900, requiredWindowMs: 1000, termination: "window_elapsed" },
    postAcceptActivity: [{ activityType: "network_request", category: "analytics", consentState: "post_accept",
      msAfterAccept: 250, nonEssential: true, vendor: "Example", hostname: "analytics.example.test" }],
  };
  const result = projectRetainedActionTimeline(projection, observedControlAssessment, "accept", "concern");
  assert.ok(result);
  assert.deepEqual(result.events.map(event => event.tone), ["positive", "neutral", "neutral"]);
});

for (const action of ["accept", "reject"] as const) {
  test(`${action}: verified partial clicks retain events without inventing completion or consent`, () => {
    const base = completedActionProjection(action);
    const value = {...base, afterActionCapture:{...base.afterActionCapture!,stopReason:"aborted" as const}};
    const result = projectRetainedActionTimeline(value,observedControlAssessment,action)!;
    assert.equal(result.coverage,"limited");
    assert.equal(result.events[0]?.label,`${action === "accept" ? "Accept" : "Reject"} click`);
    assert.equal(result.events.at(-1)?.label,"Capture stopped");
    assert.doesNotMatch(JSON.stringify(result),/confirmed|Observation end/);
    assert.equal(projectRetainedActionTimeline({...base,afterActionCapture:undefined,afterActionRequests:undefined,afterActionStorage:undefined},observedControlAssessment,action),null);
  });
  test(`${action}: retained historical timing enables partial timeline with no invented end`, () => {
    const base=completedActionProjection(action);
    const value={...base,interactionDiagnostics:{resolver:{snapshots:[],truncated:false},navigation:{outcome:"completed",documentCommitted:true,finalUrlAuthorized:true},click:{outcome:"completed",reResolvedBeforeDispatch:false,confirmationCheckedAfterError:false}},afterActionCapture:undefined,afterActionRequests:undefined,afterActionStorage:undefined,
      retainedActionTiming:{policyVersion:"retained_action_timing.v1",action,actionDispatchedAtMs:100,
        firstRequest:{startedAtMs:350,hostname:"example.test"}}};
    const result=projectRetainedActionTimeline(value,observedControlAssessment,action)!;
    assert.equal(result.coverage,"limited");
    assert.deepEqual(result.events.map(row=>[row.atMs,row.label]),[[0,`${action === "accept" ? "Accept" : "Reject"} click`],[250,"Request observed"]]);
    assert.doesNotMatch(JSON.stringify(result),/Observation end|confirmed/);
    assert.equal(projectRetainedActionTimeline({...value,interactionDiagnostics:{click:{outcome:"failed"}}},observedControlAssessment,action),null);
    assert.equal(projectRetainedActionTimeline({...value,retainedActionTiming:{...value.retainedActionTiming,actionDispatchedAtMs:400}},observedControlAssessment,action),null);
  });
}
