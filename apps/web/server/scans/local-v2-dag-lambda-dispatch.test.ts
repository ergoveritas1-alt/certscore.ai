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
  const canonicalSource = {
    sourceCompletedAt: "1970-01-01T00:00:00.000Z",
    sourceScanId: "canonical-legal-surface-hints-v1",
  };
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
    policySurfaceSeeds: [
      { confidence: 0.62, hintType: "privacy_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/privacy" },
      { confidence: 0.68, hintType: "privacy_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/privacy-policy" },
      { confidence: 0.66, hintType: "privacy_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/privacy-notice" },
      { confidence: 0.58, hintType: "privacy_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/legal/privacy" },
      { confidence: 0.62, hintType: "cookie_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/cookies" },
      { confidence: 0.66, hintType: "cookie_policy", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/cookie-policy" },
      { confidence: 0.54, hintType: "privacy_choice", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/privacy/choices" },
      { confidence: 0.54, hintType: "privacy_choice", source: "canonical_legal_surface_hint", ...canonicalSource, url: "https://example.com/privacy-rights" }
    ],
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultPurpose: "persisted_scan",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scanId: "scan-local-1",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none"
  });
});

test("carries bounded prior policy URLs into Lambda as acceleration hints", () => {
  const sourceCompletedAt = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
  const config = buildLambdaScanConfig();
  config.execution = {
    ...config.execution,
    crawlSeedHints: [
      {
        confidence: 0.91,
        hintType: "privacy_policy",
        source: "prior_scan_hint",
        sourceCompletedAt,
        sourceScanId: "prior-1",
        url: "https://legal.example.net/company/privacy"
      },
      {
        hintType: "unrelated_page",
        source: "prior_scan_hint",
        sourceCompletedAt,
        sourceScanId: "prior-1",
        url: "https://example.com/about"
      }
    ]
  };

  const payload = buildLocalV2DagLambdaDispatchPayload({
    localCallbackUrl: null,
    scanConfig: config,
    scanId: "scan-policy-seed"
  });

  assert.deepEqual(payload.policySurfaceSeeds, [{
    confidence: 0.91,
    hintType: "privacy_policy",
    source: "prior_scan_hint",
    sourceCompletedAt,
    sourceScanId: "prior-1",
    url: "https://legal.example.net/company/privacy"
  }]);
});

test("drops stale prior policy URLs before Lambda dispatch", () => {
  const config = buildLambdaScanConfig();
  config.execution = {
    ...config.execution,
    crawlSeedHints: [{
      confidence: 0.95,
      hintType: "privacy_policy",
      source: "prior_scan_hint",
      sourceCompletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000).toISOString(),
      sourceScanId: "stale-prior",
      url: "https://legal.example.net/stale/privacy",
    }],
  };

  const payload = buildLocalV2DagLambdaDispatchPayload({
    localCallbackUrl: null,
    scanConfig: config,
    scanId: "scan-stale-policy-seed",
  });

  assert.equal(payload.policySurfaceSeeds, undefined);
});

test("adds the default-off reject worker to eligible sharded scans with target-scoped authorization", () => {
  for (let number = 1; number <= 4; number += 1) {
    const canaryConfig = buildLambdaScanConfig();
    canaryConfig.hostname = "ergoveritas.com";
    canaryConfig.normalizedUrl = `https://ergoveritas.com/test${number}.html`;
    canaryConfig.execution = {
      ...canaryConfig.execution,
      v2DagLambda: {
        ...(canaryConfig.execution?.v2DagLambda as Record<string, unknown>),
        orchestrationMode: "sharded",
        postRefusalRejectWorkerEnabled: true,
      },
    };
    const canaryPayload = buildLocalV2DagLambdaDispatchPayload({
      scanConfig: canaryConfig,
      scanId: `scan-canary-reject-${number}`,
    });
    assert.equal(canaryPayload.postRefusalObservation?.dispatchDelayMs, 500);
    assert.equal(canaryPayload.postRefusalObservation?.actionSearchTimeoutMs, 14_000);
    assert.equal(canaryPayload.postRefusalObservation?.interactionAuthorization.kind, "owned_canary");
    assert.equal(canaryPayload.postRefusalObservation?.resolver.kind, "canonical_cmp_registry");
  }

  const ordinaryConfig = buildLambdaScanConfig();
  ordinaryConfig.execution = {
    ...ordinaryConfig.execution,
    v2DagLambda: {
      ...(ordinaryConfig.execution?.v2DagLambda as Record<string, unknown>),
      orchestrationMode: "sharded",
      postRefusalRejectWorkerEnabled: true,
      postRefusalRejectWorkerRolloutMode: "all_eligible",
    },
  };
  const ordinaryPayload = buildLocalV2DagLambdaDispatchPayload({
    scanConfig: ordinaryConfig,
    scanId: "scan-ordinary",
  });
  assert.equal(ordinaryPayload.postRefusalObservation?.interactionAuthorization.kind, "scan_target_resolution");
  assert.equal(
    ordinaryPayload.postRefusalObservation?.interactionAuthorization.kind === "scan_target_resolution"
      ? ordinaryPayload.postRefusalObservation.interactionAuthorization.requestedUrl
      : undefined,
    ordinaryPayload.targetUrl,
  );
  assert.equal(
    ordinaryPayload.postRefusalObservation?.interactionAuthorization.kind === "scan_target_resolution"
      ? ordinaryPayload.postRefusalObservation.interactionAuthorization.scanId
      : undefined,
    ordinaryPayload.scanId,
  );

  const canaryOnlyOrdinaryConfig = buildLambdaScanConfig();
  canaryOnlyOrdinaryConfig.execution = {
    ...canaryOnlyOrdinaryConfig.execution,
    v2DagLambda: {
      ...(canaryOnlyOrdinaryConfig.execution?.v2DagLambda as Record<string, unknown>),
      orchestrationMode: "sharded",
      postRefusalRejectWorkerEnabled: true,
      postRefusalRejectWorkerRolloutMode: "owned_canary",
    },
  };
  assert.equal(buildLocalV2DagLambdaDispatchPayload({
    scanConfig: canaryOnlyOrdinaryConfig,
    scanId: "scan-ordinary-canary-only",
  }).postRefusalObservation, undefined);
});

test("dispatches both owned canary lanes for exact www ErgoVeritas testar URLs", () => {
  for (const pathname of ["/testar1.html", "/testar2.html"]) {
    const canaryConfig = buildLambdaScanConfig();
    canaryConfig.hostname = "www.ergoveritas.com";
    canaryConfig.normalizedUrl = `https://www.ergoveritas.com${pathname}`;
    canaryConfig.execution = {
      ...canaryConfig.execution,
      v2DagLambda: {
        ...(canaryConfig.execution?.v2DagLambda as Record<string, unknown>),
        orchestrationMode: "sharded",
        postAcceptWorkerEnabled: true,
        postAcceptWorkerRolloutMode: "owned_canary",
        postRefusalRejectWorkerEnabled: true,
        postRefusalRejectWorkerRolloutMode: "owned_canary",
      },
    };

    const payload = buildLocalV2DagLambdaDispatchPayload({
      scanConfig: canaryConfig,
      scanId: `scan-www-${pathname}`,
    });
    assert.equal(payload.postAcceptObservation?.interactionAuthorization.kind, "owned_canary");
    assert.equal(payload.postRefusalObservation?.interactionAuthorization.kind, "owned_canary");
  }
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

test("production dispatch uses the durable scan-row outbox and FIFO scan-id deduplication", async () => {
  const [runner, publisher] = await Promise.all([
    readFile("apps/web/server/scans/local-v2-dag-dispatch-runner.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-dispatch.ts", "utf8"),
  ]);

  assert.match(runner, /if \(!context\.simulatedLocalLambda\)/);
  assert.match(runner, /transport: "sqs_fifo"/);
  assert.match(publisher, /dispatchState}' = 'pending_dispatch'/);
  assert.match(publisher, /for update skip locked/);
  assert.match(publisher, /MessageDeduplicationId: dispatch\.scan_id/);
  assert.match(publisher, /MessageGroupId: dispatch\.scan_id/);
  assert.match(publisher, /'dispatchState', 'publish_retry'/);
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
        },
        postAcceptPacketUri: {
          sha256: "d".repeat(64),
          sizeBytes: 768
        },
        postRefusalPacketUri: {
          sha256: "e".repeat(64),
          sizeBytes: 896
        }
      },
      artifactPointers: {
        failureDiagnosticUri: "s3://certscore-dev-artifacts/v2/scan-local-1/failure/FailureDiagnostic.json",
        manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json",
        postAcceptPacketUri: "s3://certscore-dev-artifacts/v2/scan-local-1/PostAcceptEvidencePacket.json",
        postRefusalPacketUri: "s3://certscore-dev-artifacts/v2/scan-local-1/PostRefusalEvidencePacket.json",
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
      parentDispatchSha256: "c".repeat(64),
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      scanId: "scan-local-1",
      scannerGitSha: "abc123scanner",
      scannerImageTag: "scanner-image:abc123scanner",
      scannerRuntimeVersion: "v2-dag-runtime.1",
      scannerRuntimeProvenance: {
        awsRegion: "eu-west-1",
        dispatchVpcMode: "vpc",
        egressId: "aws-nat:eu-west-1:eipalloc-123",
        egressProvider: "aws-nat-gateway",
        functionVersion: "$LATEST",
        imageDigest: `sha256:${"a".repeat(64)}`,
        publicIpHash: `sha256:${"b".repeat(64)}`,
        runtimeVpcMode: "vpc"
      },
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
  assert.equal(parsed.parentDispatchSha256, "c".repeat(64));
  assert.equal(parsed.artifactPointers?.manifestUri, "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json");
  assert.equal(parsed.artifactPointers?.failureDiagnosticUri, "s3://certscore-dev-artifacts/v2/scan-local-1/failure/FailureDiagnostic.json");
  assert.equal(parsed.artifactPointers?.postAcceptPacketUri, "s3://certscore-dev-artifacts/v2/scan-local-1/PostAcceptEvidencePacket.json");
  assert.equal(parsed.artifactPointers?.postRefusalPacketUri, "s3://certscore-dev-artifacts/v2/scan-local-1/PostRefusalEvidencePacket.json");
  assert.deepEqual(parsed.artifactMetadata?.failureDiagnosticUri, { sha256: "a".repeat(64), sizeBytes: 512 });
  assert.deepEqual(parsed.artifactMetadata?.postAcceptPacketUri, { sha256: "d".repeat(64), sizeBytes: 768 });
  assert.deepEqual(parsed.artifactMetadata?.postRefusalPacketUri, { sha256: "e".repeat(64), sizeBytes: 896 });
  assert.equal(parsed.scannerGitSha, "abc123scanner");
  assert.equal(parsed.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(parsed.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.deepEqual(parsed.scannerRuntimeProvenance, {
    awsRegion: "eu-west-1",
    dispatchVpcMode: "vpc",
    egressId: "aws-nat:eu-west-1:eipalloc-123",
    egressProvider: "aws-nat-gateway",
    functionVersion: "$LATEST",
    imageDigest: `sha256:${"a".repeat(64)}`,
    publicIpHash: `sha256:${"b".repeat(64)}`,
    runtimeVpcMode: "vpc"
  });
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
