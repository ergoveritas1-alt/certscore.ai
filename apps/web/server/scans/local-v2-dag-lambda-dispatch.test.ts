import assert from "node:assert/strict";
import test from "node:test";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  buildLocalV2DagLambdaDispatchPayload,
  dispatchLocalV2DagLambdaScan,
  ingestLocalV2DagLambdaResultMessage,
  parseLocalV2DagLambdaResultMessage,
  summarizeLocalV2DagLambdaDispatchForEvent
} from "./local-v2-dag-lambda-dispatch";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";

function buildLambdaScanConfig(options: {
  localV2DagLambdaDebugOverrides?: Parameters<typeof buildQueuedFullScanConfig>[0]["localV2DagLambdaDebugOverrides"];
} = {}) {
  return buildQueuedFullScanConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-dev",
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagLambdaDebugOverrides: options.localV2DagLambdaDebugOverrides,
    localV2DagRunViaLambda: true,
    localV2DagScanProfile: "tiny",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });
}

test("builds a local-only v2 DAG Lambda dispatch payload for EU-IR SQS handoff", () => {
  const payload = buildLocalV2DagLambdaDispatchPayload({
    localCallbackUrl: null,
    scanConfig: buildLambdaScanConfig(),
    scanId: "scan-local-1"
  });

  assert.deepEqual(payload, {
    artifactOnly: true,
    awsRegion: "eu-west-1",
    callbackCorrelationId: "scan-local-1",
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    debugOverrides: {
      scenarioConcurrency: 1,
      scenarioResourceMode: "normal"
    },
    functionName: "certscore-v2-dag-dev",
    hostname: "example.com",
    localCallbackUrl: null,
    orchestrationMode: "single",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    regionalRealIpEgress: {
      egressId: "eu-ie-ec2-proxy-t4g-micro",
      provider: "aws-ec2-proxy-eip",
      requestedGeo: {
        countryCode: "IE",
        provider: "aws-ec2-proxy-eip",
        regionCode: "eu-west-1"
      },
      required: true,
      scanFrom: "eu_ie"
    },
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
    requestedGeo: {
      countryCode: "IE",
      provider: "aws-ec2-proxy-eip",
      regionCode: "eu-west-1"
    },
    scanId: "scan-local-1",
    scanFrom: "eu_ie",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none"
  });
});

test("builds a California v2 DAG Lambda dispatch payload for us-west-2 SQS handoff", () => {
  const scanConfig = buildQueuedFullScanConfig({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_ENABLED: "true",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_FUNCTION_NAME: "certscore-v2-dag-ca",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/certscore-v2-dag-ca-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    localV2DagRunViaLambda: true,
    localV2DagScanProfile: "tiny",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    scanFrom: "california",
    source: "manual-dashboard"
  });
  const payload = buildLocalV2DagLambdaDispatchPayload({
    localCallbackUrl: null,
    scanConfig,
    scanId: "scan-local-ca"
  });

  assert.equal(payload.awsRegion, "us-west-2");
  assert.equal(payload.functionName, "certscore-v2-dag-ca");
  assert.equal(payload.scanFrom, "california");
  assert.equal(payload.regionalRealIpEgress?.egressId, "us-ca-ec2-proxy-t4g-micro");
  assert.equal(payload.resultQueueUrl, "https://sqs.us-west-2.amazonaws.com/123/certscore-v2-dag-ca-results");
});

test("builds local Lambda dispatch payload with bounded debug overrides", () => {
  const payload = buildLocalV2DagLambdaDispatchPayload({
    localCallbackUrl: null,
    scanConfig: buildLambdaScanConfig({
      localV2DagLambdaDebugOverrides: {
        actionSearchDeadlineMs: 12_000,
        preActionObservationMs: 5_000,
        scenarioResourceMode: "cmp_safe",
        strongEvidenceMode: "webmd"
      }
    }),
    scanId: "scan-local-1"
  });

  assert.deepEqual(payload.debugOverrides, {
    actionSearchDeadlineMs: 12_000,
    preActionObservationMs: 5_000,
    scenarioConcurrency: 1,
    scenarioResourceMode: "cmp_safe",
    strongEvidenceMode: "webmd"
  });
  assert.equal(payload.productionFindingIntegration, false);
});

test("summarizes Lambda dispatch intent without exposing function or queue names", () => {
  assert.deepEqual(summarizeLocalV2DagLambdaDispatchForEvent(buildLambdaScanConfig()), {
    awsRegion: "eu-west-1",
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    dispatchRequested: true,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    resultHandoff: "sqs",
    simulatedLocalLambda: false,
    targetEnvironment: "local",
    vpcMode: "none"
  });
});

test("dispatch invokes Lambda asynchronously with the typed artifact-only payload", async () => {
  const sentCommands: unknown[] = [];
  const result = await dispatchLocalV2DagLambdaScan({
    lambdaClient: {
      async send(command) {
        sentCommands.push(command);
        return {
          $metadata: { requestId: "lambda-request-1" },
          StatusCode: 202
        };
      }
    },
    scanConfig: buildLambdaScanConfig(),
    scanId: "scan-local-1"
  });

  assert.equal(result.dispatched, true);
  assert.equal(result.invocationRequestId, "lambda-request-1");
  assert.equal(result.invocationStatusCode, 202);
  assert.equal(sentCommands.length, 1);
  const command = sentCommands[0] as { input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array } };
  assert.equal(command.input.FunctionName, "certscore-v2-dag-dev");
  assert.equal(command.input.InvocationType, "Event");
  const payload = JSON.parse(Buffer.from(command.input.Payload ?? new Uint8Array()).toString("utf8")) as Record<string, unknown>;
  assert.equal(payload.scanId, "scan-local-1");
  assert.equal(result.payload.productionFindingIntegration, false);
  assert.equal(payload.productionFindingIntegration, false);
  assert.equal(payload.artifactOnly, true);
  assert.equal(payload.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
});

test("dispatch fails closed when Lambda does not accept the async invocation", async () => {
  await assert.rejects(
    dispatchLocalV2DagLambdaScan({
      lambdaClient: {
        async send() {
          return {
            $metadata: { requestId: "lambda-request-2" },
            StatusCode: 500
          };
        }
      },
      scanConfig: buildLambdaScanConfig(),
      scanId: "scan-local-1"
    }),
    /not accepted/
  );
});

test("dispatch payload fails closed when v2 DAG Lambda intent is absent", () => {
  const config = buildQueuedFullScanConfig({
    env: {
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NODE_ENV: "development"
    },
    hostname: "example.com",
    maxPages: 3,
    normalizedUrl: "https://example.com/",
    profile: "homepage",
    source: "manual-dashboard"
  });

  assert.throws(
    () =>
      buildLocalV2DagLambdaDispatchPayload({
        scanConfig: config,
        scanId: "scan-local-1"
      }),
    /without execution\.v2DagLambda/
  );
});

test("parses SQS-style v2 DAG Lambda result messages as internal artifacts only", () => {
  const parsed = parseLocalV2DagLambdaResultMessage({
    Body: JSON.stringify({
      artifactOnly: true,
      artifactPointers: {
        manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json",
        reviewArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/review.json"
      },
      completedAt: "2026-06-15T18:00:00.000Z",
      contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
      handlerTiming: {
        artifactChainCompletedAt: "2026-06-15T18:00:00.000Z",
        artifactChainDurationMs: 5100.4,
        artifactChainStartedAt: "2026-06-15T17:59:54.900Z",
        completedAt: "2026-06-15T18:00:00.000Z",
        firstPhaseLabel: "egress_preflight",
        firstPhaseStartedAt: "2026-06-15T17:59:55.000Z",
        handlerDurationMs: 6000.2,
        handlerStartedAt: "2026-06-15T17:59:54.000Z",
        scanPhaseCompletedAt: "2026-06-15T17:59:59.500Z",
        scanPhaseDurationMs: 4200.4,
        scanPhaseLabel: "scan",
        scanPhaseStartedAt: "2026-06-15T17:59:55.300Z"
      },
      egressId: "eu-de-ec2-proxy-t4g-micro",
      egressProvider: "aws-ec2-proxy-eip",
      observedOutboundIp: "3.79.106.160",
      phaseTimings: [{
        completedAt: "2026-06-15T18:00:00.000Z",
        durationMs: 42.4,
        label: "core_artifact_upload",
        startedAt: "2026-06-15T17:59:59.958Z",
        status: "completed"
      }],
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      scanId: "scan-local-1",
      scannerRegion: "eu-central-1",
      scannerGitSha: "abc123scanner",
      scannerImageTag: "scanner-image:abc123scanner",
      scannerRuntimeVersion: "v2-dag-runtime.1",
      status: "completed",
      targetEnvironment: "local"
    })
  }, {
    expectedTargetEnvironment: "local"
  });

  assert.equal(parsed.scanId, "scan-local-1");
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.artifactPointers?.manifestUri, "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json");
  assert.equal(parsed.scannerGitSha, "abc123scanner");
  assert.equal(parsed.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(parsed.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.equal(parsed.scannerRegion, "eu-central-1");
  assert.equal(parsed.egressId, "eu-de-ec2-proxy-t4g-micro");
  assert.equal(parsed.egressProvider, "aws-ec2-proxy-eip");
  assert.equal(parsed.observedOutboundIp, "3.79.106.160");
  assert.deepEqual(parsed.phaseTimings, [{
    completedAt: "2026-06-15T18:00:00.000Z",
    durationMs: 42,
    label: "core_artifact_upload",
    startedAt: "2026-06-15T17:59:59.958Z",
    status: "completed"
  }]);
  assert.deepEqual(parsed.handlerTiming, {
    artifactChainCompletedAt: "2026-06-15T18:00:00.000Z",
    artifactChainDurationMs: 5100,
    artifactChainStartedAt: "2026-06-15T17:59:54.900Z",
    completedAt: "2026-06-15T18:00:00.000Z",
    firstPhaseLabel: "egress_preflight",
    firstPhaseStartedAt: "2026-06-15T17:59:55.000Z",
    handlerDurationMs: 6000,
    handlerStartedAt: "2026-06-15T17:59:54.000Z",
    scanPhaseCompletedAt: "2026-06-15T17:59:59.500Z",
    scanPhaseDurationMs: 4200,
    scanPhaseLabel: "scan",
    scanPhaseStartedAt: "2026-06-15T17:59:55.300Z"
  });
});

test("rejects result messages from the wrong environment or processor", () => {
  const baseMessage = {
    artifactOnly: true,
    completedAt: "2026-06-15T18:00:00.000Z",
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: "scan-local-1",
    status: "completed",
    targetEnvironment: "production"
  };

  assert.throws(
    () => parseLocalV2DagLambdaResultMessage(baseMessage, { expectedTargetEnvironment: "local" }),
    /target environment does not match/
  );
  assert.throws(
    () =>
      parseLocalV2DagLambdaResultMessage({
        ...baseMessage,
        processor: "queued-full-scan-v1",
        targetEnvironment: "local"
      }),
    /unexpected processor/
  );
  assert.throws(
    () =>
      parseLocalV2DagLambdaResultMessage({
        ...baseMessage,
        artifactPointers: {
          manifestUri: "file:///tmp/certscore/manifest.json"
        },
        targetEnvironment: "local"
      }),
    /durable s3/
  );
});

test("local Lambda result ingestion never promotes artifacts into production findings", () => {
  const ingestion = ingestLocalV2DagLambdaResultMessage(JSON.stringify({
    artifactOnly: true,
    completedAt: "2026-06-15T18:00:00.000Z",
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: "scan-local-1",
    status: "completed",
    targetEnvironment: "local"
  }), {
    expectedTargetEnvironment: "local"
  });

  assert.equal(ingestion.status, "parsed_only");
  assert.equal(ingestion.artifactPromotion, false);
  assert.equal(ingestion.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(ingestion, "findings"), false);
  assert.equal(Object.hasOwn(ingestion, "signals"), false);
});
