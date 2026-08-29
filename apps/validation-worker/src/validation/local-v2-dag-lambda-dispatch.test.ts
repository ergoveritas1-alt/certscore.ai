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

test("durable publisher forwards the owned-canary Reject observation contract", () => {
  const scanId = "4f75b34a-9755-468d-b8f9-bec6042e94d7";
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({
    scanId,
    scanConfig: {
      hostname: "ergoveritas.com",
      normalizedUrl: "https://ergoveritas.com/test3.html",
      execution: {
        v2DagLambda: {
          awsRegion: "eu-west-1",
          contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
          functionName: "certscore-v2-dag-local-lambda",
          orchestrationMode: "sharded",
          postRefusalRejectWorkerEnabled: true,
          postRefusalRejectWorkerRolloutMode: "all_eligible",
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

  assert.equal(payload.postRefusalObservation?.enabled, true);
  assert.equal(payload.postRefusalObservation?.rolloutMode, "all_eligible");
  assert.equal(payload.postRefusalObservation?.dispatchDelayMs, 500);
  assert.equal(payload.postRefusalObservation?.interactionAuthorization.kind, "owned_canary");
});

test("durable publisher forwards exact-target authorization for eligible public scans", () => {
  const scanId = "4f75b34a-9755-468d-b8f9-bec6042e94d7";
  const targetUrl = "https://example.com/privacy-review";
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({
    scanId,
    scanConfig: {
      hostname: "example.com",
      normalizedUrl: targetUrl,
      execution: {
        v2DagLambda: {
          awsRegion: "eu-west-1",
          contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
          functionName: "certscore-v2-dag-local-lambda",
          orchestrationMode: "sharded",
          postRefusalRejectWorkerEnabled: true,
          postRefusalRejectWorkerRolloutMode: "all_eligible",
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

  assert.deepEqual(payload.postRefusalObservation?.interactionAuthorization, {
    authorizationId: "sharded_scan_exact_target.v1",
    kind: "scan_target",
    normalizedUrl: targetUrl,
    scanId,
  });
});
