import assert from "node:assert/strict";
import test from "node:test";
import { afterClickCoverage, afterClickSummary } from "./after-action-summary";
import { afterClickSummary as alternateSummary } from "../scanso2/after-action-summary";

for (const action of ["accept", "reject"] as const) {
  test(`${action} summaries retain counts without exposing storage identifiers`, () => {
    const projection = { afterActionCapture: {
      policyVersion: "bounded_after_action_capture.v1", action, activationStatus: "completed",
      actionDispatchedAtMs: 100, captureEndedAtMs: 8120, requestedWindowMs: 8000,
      stopReason: "window_elapsed", requestsDropped: 0, storageSnapshotRetained: true,
      storageWriteCoverage: "bounded_main_document_sample",
      storageWrites: ["logger.87d898e4-70ea-4045-8145-5625be29b91b.ack", "customer_identifier"].map(name => ({
        name, storageType: "local_storage", observedAtMs: 200, nonEssential: false,
      })), requestIds: ["one", "two", "three"],
    } };
    const summary = afterClickSummary(projection, action);
    assert.match(summary, /8.02s.*3 requests were retained and 2 main-document storage writes were observed\./);
    assert.doesNotMatch(summary, /logger|87d898e4|customer_identifier/);
    assert.equal(alternateSummary(projection, action), summary);
    assert.equal(afterClickCoverage(projection, action), "complete");
    assert.equal(afterClickSummary(projection, action === "accept" ? "reject" : "accept"), "");
  });
}
