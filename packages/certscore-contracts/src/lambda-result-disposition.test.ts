import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyV2DagLambdaResultDisposition,
  isPersistedScanId,
} from "./lambda-result-disposition";

test("classifies explicitly typed persisted and synthetic Lambda results", () => {
  assert.deepEqual(
    classifyV2DagLambdaResultDisposition({
      resultPurpose: "persisted_scan",
      scanId: "49037835-190b-4e67-9fe2-426d51d55069",
    }),
    {
      kind: "persisted_scan",
      reason: "typed_purpose",
      scanId: "49037835-190b-4e67-9fe2-426d51d55069",
    },
  );
  assert.deepEqual(
    classifyV2DagLambdaResultDisposition({
      resultPurpose: "synthetic_verification",
      scanId: "regional-vpc-parity-eu-west-1-example-com-123",
    }),
    {
      kind: "synthetic_verification",
      reason: "typed_purpose",
      scanId: "regional-vpc-parity-eu-west-1-example-com-123",
    },
  );
});

test("recognizes bounded legacy verification identifiers without treating them as scans", () => {
  for (const scanId of [
    "manual-example-123",
    "postdeploy-example-123",
    "aro-gate-example-123",
    "local-lambda-parity-example-123",
    "regional-vpc-parity-eu-west-1-example-com-123",
    "regional-parity-example-com-123",
    "regional-parity-retry-example-com-123",
    "sprnt-diag-us-west-2-123",
  ]) {
    assert.deepEqual(classifyV2DagLambdaResultDisposition({ scanId }), {
      kind: "synthetic_verification",
      reason: "legacy_prefix",
      scanId,
    });
  }
});

test("fails closed for malformed, mistyped, or non-UUID persisted results", () => {
  assert.equal(isPersistedScanId("49037835-190b-4e67-9fe2-426d51d55069"), true);
  assert.equal(isPersistedScanId("regional-vpc-parity-example"), false);
  assert.deepEqual(classifyV2DagLambdaResultDisposition("{"), {
    kind: "invalid",
    reason: "invalid_json",
    scanId: null,
  });
  assert.deepEqual(classifyV2DagLambdaResultDisposition({}), {
    kind: "invalid",
    reason: "missing_scan_id",
    scanId: null,
  });
  assert.deepEqual(
    classifyV2DagLambdaResultDisposition({
      resultPurpose: "persisted_scan",
      scanId: "not-a-uuid",
    }),
    {
      kind: "invalid",
      reason: "persisted_scan_id_not_uuid",
      scanId: "not-a-uuid",
    },
  );
  assert.deepEqual(
    classifyV2DagLambdaResultDisposition({
      resultPurpose: "other",
      scanId: "49037835-190b-4e67-9fe2-426d51d55069",
    }),
    {
      kind: "invalid",
      reason: "invalid_result_purpose",
      scanId: "49037835-190b-4e67-9fe2-426d51d55069",
    },
  );
  assert.deepEqual(classifyV2DagLambdaResultDisposition({ scanId: "unknown-diagnostic-123" }), {
    kind: "invalid",
    reason: "untyped_scan_id_not_uuid",
    scanId: "unknown-diagnostic-123",
  });
});
