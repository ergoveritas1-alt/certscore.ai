import assert from "node:assert/strict";
import test from "node:test";
import { getLocalV2DagResultQueueUrl } from "./local-v2-dag-status-handoff-core";

test("getLocalV2DagResultQueueUrl extracts the scan-specific Lambda result queue", () => {
  assert.equal(
    getLocalV2DagResultQueueUrl({
      execution: {
        v2DagLambda: {
          resultQueueUrl: " https://sqs.eu-west-1.amazonaws.com/123/results "
        }
      }
    }),
    "https://sqs.eu-west-1.amazonaws.com/123/results"
  );
});

test("getLocalV2DagResultQueueUrl ignores non-Lambda scan configs", () => {
  assert.equal(getLocalV2DagResultQueueUrl(null), null);
  assert.equal(getLocalV2DagResultQueueUrl({ execution: {} }), null);
  assert.equal(getLocalV2DagResultQueueUrl({ execution: { v2DagLambda: { resultQueueUrl: "" } } }), null);
});
