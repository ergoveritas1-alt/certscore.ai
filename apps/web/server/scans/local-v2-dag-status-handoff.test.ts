import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getLocalV2DagLambdaTargetEnvironment,
  getLocalV2DagResultQueueUrl
} from "./local-v2-dag-status-handoff-core";

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

test("getLocalV2DagLambdaTargetEnvironment follows the scan Lambda config", () => {
  assert.equal(getLocalV2DagLambdaTargetEnvironment(null), "local");
  assert.equal(
    getLocalV2DagLambdaTargetEnvironment({
      execution: {
        v2DagLambda: {
          targetEnvironment: "production"
        }
      }
    }),
    "production"
  );
});

test("status handoff leases only one handler batch for the full mirror window", async () => {
  const source = await readFile("apps/web/server/scans/local-v2-dag-status-handoff.ts", "utf8");

  assert.match(source, /maxMessages:\s*3/);
  assert.match(source, /visibilityTimeoutSeconds:\s*60/);
});
