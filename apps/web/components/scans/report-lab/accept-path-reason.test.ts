import assert from "node:assert/strict";
import test from "node:test";
import { acceptPathIncompleteReason, acceptAfterClickSummary } from "./accept-path-reason";

test("unverified Accept explains bounded after-click facts without claiming registration", () => {
  const capture = { policyVersion: "bounded_after_action_capture.v1", action: "accept", activationStatus: "completed",
    actionDispatchedAtMs: 9000, captureEndedAtMs: 12000, requestedWindowMs: 3000, stopReason: "window_elapsed",
    requestsDropped: 0, storageSnapshotRetained: true, storageWriteCoverage: "bounded_main_document_sample",
    storageWrites: [{ storageType: "cookie", name: "bst_dsgvo_cookie", observedAtMs: 9100, nonEssential: false }],
    requestIds: ["r1", "r2"] };
  const copy = acceptPathIncompleteReason({ afterActionCapture: capture });
  assert.match(copy, /During 3s.*2 requests.*1 main-document storage write/);
  assert.match(copy, /bst_dsgvo_cookie/);
  assert.doesNotMatch(copy, /could not be verified|not proof|granted consent/);
  assert.match(copy, /tracking classifications are shown in the findings/);
  assert.equal(acceptAfterClickSummary({}), "");
  assert.equal(acceptAfterClickSummary({ afterActionCapture: { ...capture, activationStatus: "uncertain" } }), "");
  assert.match(acceptAfterClickSummary({ afterActionCapture: { ...capture, requestsDropped: 2 } }), /counts are partial/);
  assert.match(acceptAfterClickSummary({ afterActionCapture: { ...capture, captureEndedAtMs: 11000, stopReason: "aborted" } }), /stopped early/);
});

test("Accept failure copy distinguishes search failure, click, ambiguity and legacy uncertainty", () => {
  assert.equal(acceptPathIncompleteReason({ resolver: { reason: "deterministic_accept_control_not_found" }, resolverDurationMs: 14_310 }),
    "No actionable Accept control was found within 14.31 seconds. No click was attempted.");
  assert.match(acceptPathIncompleteReason({ resolver: { reason: "multiple_deterministic_accept_controls_found" } }), /ambiguous/);
  assert.match(acceptPathIncompleteReason({ interactionDiagnostics: { click: { outcome: "completed" } }, registrationStatus: "unconfirmed" }), /^The Accept control was clicked\./);
  assert.match(acceptPathIncompleteReason({ registrationStatus: "not_attempted" }), /does not include the specific discovery reason/);
  assert.doesNotMatch(acceptPathIncompleteReason({}), /No click was attempted|control was found/);
  assert.match(acceptPathIncompleteReason({ limitationCode: "accept_path_worker_failed" }), /worker failed/);
  assert.match(acceptPathIncompleteReason({ interactionDiagnostics: { click: { outcome: "failed_before_dispatch" } } }), /could not be dispatched/);
  assert.match(acceptPathIncompleteReason({ interactionDiagnostics: { click: { outcome: "failed_after_dispatch" } } }), /click completion was not recorded/);
});


test("malformed capture metadata cannot invent a completed Accept interaction", () => {
  assert.doesNotMatch(acceptPathIncompleteReason({ afterActionCapture: { activationStatus: "completed" } }), /was clicked/);
});
