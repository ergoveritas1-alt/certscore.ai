import assert from "node:assert/strict";
import test from "node:test";
import { buildDurableLocalV2DagLambdaDispatchPayload } from "./local-v2-dag-lambda-dispatch";

test("durable publisher reconstructs the typed regional dispatch from the committed scan row", () => {
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({
    scanId: "4f75b34a-9755-468d-b8f9-bec6042e94d7",
    scanConfig: {
      hostname: "example.com",
      normalizedUrl: "https://example.com/",
      execution: {
        v2DagParallel: { profile: "tiny" },
        v2DagLambda: {
          awsRegion: "eu-west-1",
          contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
          functionName: "certscore-v2-dag-local-lambda",
          orchestrationMode: "sharded",
          processor: "local-certscore-v2-dag-parallel-v1",
          resultHandoff: "sqs",
          resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/results",
          scannerRuntime: "certscore-v2-dag-parallel-path",
          targetEnvironment: "production",
          vpcMode: "vpc",
        },
      },
    },
  });

  assert.equal(payload.awsRegion, "eu-west-1");
  assert.equal(payload.scanId, "4f75b34a-9755-468d-b8f9-bec6042e94d7");
  assert.equal(payload.callbackCorrelationId, payload.scanId);
  assert.equal(payload.profile, "tiny");
  assert.equal(payload.orchestrationMode, "sharded");
  assert.equal(payload.productionFindingIntegration, false);
});

test("durable publisher fails closed for malformed committed dispatch intent", () => {
  assert.throws(() => buildDurableLocalV2DagLambdaDispatchPayload({
    scanId: "4f75b34a-9755-468d-b8f9-bec6042e94d7",
    scanConfig: { execution: { v2DagLambda: { awsRegion: "ap-southeast-1" } } },
  }), /unsupported AWS region/);
});
