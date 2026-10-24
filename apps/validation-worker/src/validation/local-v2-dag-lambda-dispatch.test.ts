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
  assert.deepEqual(payload.gpcObservation, {
    contractVersion: "certscore.gpc-observation-dispatch.v1",
    enabled: true,
    pairWithLane: "runtime_evidence",
    protocol: "passive_baseline_with_sec_gpc",
  });
});

test("durable publisher selects six workers for every region despite optional opt-out intent", () => {
  for (const [scanFrom, awsRegion] of [
    ["eu_ie", "eu-west-1"], ["eu_de", "eu-central-1"], ["california", "us-west-1"],
  ] as const) {
    const scanId = `4f75b34a-9755-468d-b8f9-${awsRegion.replace(/[^a-z0-9]/g, "").padEnd(12, "0").slice(0, 12)}`;
    const scanConfig = {
      hostname: "example.com",
      normalizedUrl: "https://example.com/privacy",
      scanFrom,
      execution: { v2DagLambda: {
        awsRegion,
        contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
        functionName: "certscore-v2-dag-local-lambda",
        orchestrationMode: "sharded",
        saleSharingOptOutEnabled: true,
        saleSharingOptOutRolloutMode: "all_eligible",
        processor: "local-certscore-v2-dag-parallel-v1",
        resultHandoff: "sqs",
        resultQueueUrl: `https://sqs.${awsRegion}.amazonaws.com/123/results`,
        scannerRuntime: "certscore-v2-dag-parallel-path",
        targetEnvironment: "production",
        vpcMode: "vpc",
      } },
    };
    const build = (patch: Record<string, unknown> = {}) =>
      buildDurableLocalV2DagLambdaDispatchPayload({ scanId, scanConfig: {
        ...scanConfig,
        ...patch,
        execution: { v2DagLambda: { ...scanConfig.execution.v2DagLambda,
          ...((patch.execution as { v2DagLambda?: Record<string, unknown> } | undefined)?.v2DagLambda ?? {}) } },
      } });
    assert.equal(build().saleSharingOptOut, undefined);
    assert.equal(build().privacyCaptureProfile, "presence_only_six_workers.v1");
    assert.equal(build({ execution: { v2DagLambda: { saleSharingOptOutEnabled: false } } }).saleSharingOptOut, undefined);
    assert.equal(build({ execution: { v2DagLambda: { saleSharingOptOutRolloutMode: "off" } } }).saleSharingOptOut, undefined);
    assert.equal(build({ execution: { v2DagLambda: { orchestrationMode: "single" } } }).saleSharingOptOut, undefined);
    assert.equal(build({ normalizedUrl: "http://example.com/privacy" }).saleSharingOptOut, undefined);
    assert.equal(build({ hostname: "other.example" }).saleSharingOptOut, undefined);
  }
});

test("durable publisher fails closed for malformed committed dispatch intent", () => {
  assert.throws(() => buildDurableLocalV2DagLambdaDispatchPayload({
    scanId: "4f75b34a-9755-468d-b8f9-bec6042e94d7",
    scanConfig: { execution: { v2DagLambda: { awsRegion: "ap-southeast-1" } } },
  }), /unsupported AWS region/);
});

test("durable publisher forwards the owned-canary Reject observation contract", () => {
  for (let number = 1; number <= 4; number += 1) {
    const scanId = `4f75b34a-9755-468d-b8f9-bec6042e94d${number}`;
    const payload = buildDurableLocalV2DagLambdaDispatchPayload({
      scanId,
      scanConfig: {
        hostname: "ergoveritas.com",
        normalizedUrl: `https://ergoveritas.com/test${number}.html`,
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
    assert.equal(payload.postRefusalObservation?.actionSearchTimeoutMs, 14_000);
    assert.equal(payload.postRefusalObservation?.interactionAuthorization.kind, "owned_canary");
  }
});

test("durable publisher forwards the independently enabled owned-canary Accept contract", () => {
  const scanId = "4f75b34a-9755-468d-b8f9-bec6042e94a0";
  const payload = buildDurableLocalV2DagLambdaDispatchPayload({
    scanId,
    scanConfig: {
      hostname: "ergoveritas.com",
      normalizedUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-accept/accept-honored.html",
      execution: {
        v2DagLambda: {
          awsRegion: "eu-west-1",
          contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
          functionName: "certscore-v2-dag-local-lambda",
          orchestrationMode: "sharded",
          postAcceptWorkerEnabled: true,
          postAcceptWorkerRolloutMode: "owned_canary",
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

  assert.equal(payload.postAcceptObservation?.enabled, true);
  assert.equal(payload.postAcceptObservation?.rolloutMode, "owned_canary");
  assert.equal(payload.postAcceptObservation?.dispatchDelayMs, 1_000);
  assert.equal(payload.postAcceptObservation?.resolver.kind, "canonical_cmp_registry");
  assert.equal(payload.postAcceptObservation?.interactionAuthorization.kind, "owned_canary");
  assert.equal(payload.postRefusalObservation, undefined);
});

test("durable publisher forwards bounded resolved exact-target authorization for eligible public scans", () => {
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
    authorizationId: "sharded_scan_resolved_exact_target.v2",
    kind: "scan_target_resolution",
    maxRedirects: 8,
    requestedUrl: targetUrl,
    resolutionTimeoutMs: 5_000,
    scanId,
  });
});
