import assert from "node:assert/strict";
import test from "node:test";
import { isSuccessfulChoicePath } from "./choice-path-execution.js";
import type { ChoicePathExecution, PostAcceptObservation } from "./types.js";

test("counts registered and unconfirmed successful paths independently of afterAction", () => {
  const paths: Array<Pick<PostAcceptObservation, "execution" | "afterAction">> = [
    { execution: { policyVersion: "choice_path_execution.v1", status: "succeeded_with_confirmation", clickCompleted: true, observationCompleted: true, consentConfirmed: true } },
    { execution: { policyVersion: "choice_path_execution.v1", status: "succeeded", clickCompleted: true, observationCompleted: true, consentConfirmed: false },
      afterAction: { policyVersion: "bounded_after_action_capture.v2", action: "accept", activationStatus: "completed", stopReason: "window_elapsed", requestsDropped: 0, requestCount: 300, storageWriteCount: 0, storageSnapshotRetained: true } },
    { execution: { policyVersion: "choice_path_execution.v1", status: "limited", clickCompleted: true, observationCompleted: false, consentConfirmed: false } },
    {},
  ];
  assert.equal(paths.filter(p => isSuccessfulChoicePath(p.execution)).length, 2);
  assert.equal(paths.filter(p => p.execution?.clickCompleted).length, 3);
  assert.equal(paths.filter(p => !p.execution).length, 1);
  for (const status of ["not_attempted", "unsupported"] as const) {
    assert.equal(isSuccessfulChoicePath({ policyVersion: "choice_path_execution.v1", status, clickCompleted: false, observationCompleted: false, consentConfirmed: false } satisfies ChoicePathExecution), false);
  }
  assert.equal(isSuccessfulChoicePath(null), false);
});
