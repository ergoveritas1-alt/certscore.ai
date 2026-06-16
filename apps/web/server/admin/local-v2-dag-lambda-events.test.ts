import assert from "node:assert/strict";
import test from "node:test";
import { mapAdminLocalV2DagLambdaEvent } from "./local-v2-dag-lambda-events";

test("maps local v2 DAG Lambda scan events for internal admin display", () => {
  const event = mapAdminLocalV2DagLambdaEvent({
    created_at: "2026-06-16T00:44:33.816Z",
    event_type: "v2_lambda_result.failed",
    message: "Local v2 DAG Lambda returned a failed artifact-only result.",
    metadata_json: {
      artifactOnly: true,
      productionFindingIntegration: false,
      resultStatus: "failed",
      targetEnvironment: "local",
      v2ArtifactsRemainInternal: true
    }
  });

  assert.deepEqual(event, {
    createdAt: "2026-06-16T00:44:33.816Z",
    eventType: "v2_lambda_result.failed",
    message: "Local v2 DAG Lambda returned a failed artifact-only result.",
    metadataJson: {
      artifactOnly: true,
      productionFindingIntegration: false,
      resultStatus: "failed",
      targetEnvironment: "local",
      v2ArtifactsRemainInternal: true
    }
  });
});

test("drops malformed local v2 DAG Lambda metadata instead of rendering loose values", () => {
  const event = mapAdminLocalV2DagLambdaEvent({
    created_at: null,
    event_type: "v2_lambda_dispatch.accepted",
    message: null,
    metadata_json: ["not", "a", "bounded", "object"]
  });

  assert.deepEqual(event, {
    createdAt: null,
    eventType: "v2_lambda_dispatch.accepted",
    message: null,
    metadataJson: null
  });
});
