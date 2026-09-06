import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { afterActionCaptureSchema, validateAfterActionProjection } from "./after-action-capture";

const capture = {
  policyVersion: "bounded_after_action_capture.v2", action: "reject", activationStatus: "completed",
  actionDispatchedAtMs: 500, captureEndedAtMs: 8500, requestedWindowMs: 8000, stopReason: "window_elapsed",
  requestsDropped: 0, storageSnapshotRetained: true, storageWriteCoverage: "bounded_main_document_sample",
  storageWrites: [], requestIds: ["r1"], requestAncestry: [{ requestId: "r1", rootStartedAtMs: 100 }],
};

test("V2 capture retains pre-click ancestry as evidence rather than relabeling it after-click", () => {
  assert.equal(afterActionCaptureSchema.parse(capture).requestAncestry?.[0]?.rootStartedAtMs, 100);
  assert.equal(afterActionCaptureSchema.safeParse({ ...capture, requestAncestry: undefined }).success, false);
  assert.equal(afterActionCaptureSchema.safeParse({ ...capture, requestAncestry: [] }).success, false);
  assert.equal(afterActionCaptureSchema.safeParse({ ...capture, requestAncestry: [{ requestId: "foreign", rootStartedAtMs: 100 }] }).success, false);
  assert.equal(afterActionCaptureSchema.safeParse({ ...capture,
    requestIds: ["r1", "r2"], requestAncestry: [capture.requestAncestry[0], capture.requestAncestry[0]] }).success, false);
});

test("ancestry is bound to the retained request start in projection", () => {
  const schema = z.object({ capture: afterActionCaptureSchema }).superRefine((value, context) => {
    validateAfterActionProjection(value.capture, context, { action: "reject", proof: { action: "reject", observedAtMs: 450 },
      requests: [{ requestId: "r1", startedAtMs: 600 }], storage: [] });
  });
  assert.equal(schema.safeParse({ capture }).success, true);
  assert.equal(schema.safeParse({ capture: { ...capture, requestAncestry: [{ requestId: "r1", rootStartedAtMs: 601 }] } }).success, false);
});

test("legacy capture remains readable without manufacturing ancestry", () => {
  const parsed = afterActionCaptureSchema.parse({ ...capture, policyVersion: "bounded_after_action_capture.v1", requestAncestry: undefined });
  assert.equal(parsed.requestAncestry, undefined);
});
