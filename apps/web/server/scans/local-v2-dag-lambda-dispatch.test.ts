import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildQueuedFullScanConfig } from "./full-scan-config";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  LocalV2DagLambdaDispatchError,
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
      scenarioResourceMode: "cmp_safe"
    },
    functionName: "certscore-v2-dag-dev",
    hostname: "example.com",
    localCallbackUrl: null,
    orchestrationMode: "single",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scanId: "scan-local-1",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none"
  });
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

test("dispatch timeout is typed as uncertain and does not retry an ambiguous async invocation", async () => {
  let sendCount = 0;
  let caught: unknown;
  try {
    await dispatchLocalV2DagLambdaScan({
      dispatchTimeoutMs: 250,
      lambdaClient: {
        send(_command, options) {
          sendCount += 1;
          return new Promise((_resolve, reject) => {
            options?.abortSignal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            }, { once: true });
          });
        }
      },
      scanConfig: buildLambdaScanConfig(),
      scanId: "scan-local-timeout"
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof LocalV2DagLambdaDispatchError);
  assert.equal(caught.dispatchState, "uncertain");
  assert.match(caught.message, /not confirmed within 250ms/);
  assert.equal(sendCount, 1);
  assert.ok(caught.timings.dispatchTotalMs >= 240);
});

test("uncertain dispatch acceptance is persisted as a terminal failed scan state", async () => {
  const [repository, authenticatedCreate, anonymousCreate] = await Promise.all([
    readFile("apps/web/server/scans/repository.ts", "utf8"),
    readFile("apps/web/server/scans/create-full-scan.ts", "utf8"),
    readFile("apps/web/server/scans/create-anonymous-full-scan.ts", "utf8"),
  ]);

  assert.match(repository, /dispatchState: "accepted" \| "failed" \| "uncertain"/);
  assert.match(repository, /\$3 in \('failed', 'uncertain'\)/);
  for (const source of [authenticatedCreate, anonymousCreate]) {
    assert.match(source, /error instanceof LocalV2DagLambdaDispatchError \? error\.dispatchState : "failed"/);
    assert.match(source, /updateLocalV2DagLambdaDispatchState\(\{ dispatchState, errorMessage/);
  }
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
      artifactMetadata: {
        failureDiagnosticUri: {
          sha256: "a".repeat(64),
          sizeBytes: 512
        }
      },
      artifactPointers: {
        failureDiagnosticUri: "s3://certscore-dev-artifacts/v2/scan-local-1/failure/FailureDiagnostic.json",
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
  assert.equal(parsed.artifactPointers?.failureDiagnosticUri, "s3://certscore-dev-artifacts/v2/scan-local-1/failure/FailureDiagnostic.json");
  assert.deepEqual(parsed.artifactMetadata?.failureDiagnosticUri, { sha256: "a".repeat(64), sizeBytes: 512 });
  assert.equal(parsed.scannerGitSha, "abc123scanner");
  assert.equal(parsed.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(parsed.scannerRuntimeVersion, "v2-dag-runtime.1");
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
