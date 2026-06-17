import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { CanonicalEvidenceBundle, ConsentActionAttempt, ConsentFlowObservation, ScreenshotArtifact } from "@certscore/contracts";
import { parseLocalV2DagLambdaResultMessage } from "../../web/server/scans/local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  artifactPointersFromS3Keys,
  buildLocalV2DagLambdaRuntimeDiagnostics,
  buildLocalV2DagLambdaScanTuning,
  handler,
  mergeLocalV2DagLambdaShardBundles,
  mirrorWorkerArtifactsIntoFinalArtifactRoot,
  parseLocalV2DagLambdaDispatchPayload,
  uploadAuxiliaryArtifactFiles,
  uploadArtifactFiles
} from "./handler";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    artifactOnly: true,
    awsRegion: "eu-central-1",
    callbackCorrelationId: "scan-local-1",
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: "certscore-v2-dag-local",
    hostname: "example.com",
    localCallbackUrl: null,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scanId: "scan-local-1",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none",
    ...overrides
  };
}

test("handler validates local v2 DAG Lambda dispatch contract", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload());

  assert.equal(parsed.scanId, "scan-local-1");
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
});

test("handler exposes bounded Lambda runtime diagnostics for quality A/B runs", () => {
  const diagnostics = buildLocalV2DagLambdaRuntimeDiagnostics({
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "4096",
    AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false"
  });

  assert.equal(diagnostics.awsLambdaRuntime, true);
  assert.equal(diagnostics.chromiumSingleProcessEnabled, false);
  assert.equal(diagnostics.memorySizeMb, 4096);
  assert.equal(diagnostics.chromiumLaunchArgs.includes("--single-process"), false);
  assert.equal(Object.hasOwn(diagnostics, "OPENAI_API_KEY"), false);
});

test("handler exposes bounded Lambda scan tuning for quality and speed A/B runs", () => {
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE: "auto",
      CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "3"
    }),
    {
      actionFinalSettleMs: 1500,
      consentFlowScreenshotMode: "auto",
      evidenceDiagnosticMode: "off",
      preConsentScreenshotMode: "always",
      preConsentScreenshotTimeoutMs: 1500,
      scenarioConcurrency: 3,
      scenarioResourceMode: "lean"
    }
  );
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "10",
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "99"
    }),
    {
      actionFinalSettleMs: 350,
      consentFlowScreenshotMode: "none",
      evidenceDiagnosticMode: "off",
      preConsentScreenshotMode: "always",
      preConsentScreenshotTimeoutMs: 500,
      scenarioConcurrency: 4,
      scenarioResourceMode: "lean"
    }
  );
  assert.equal(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "normal"
    }).scenarioResourceMode,
    "normal"
  );
  assert.equal(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "cmp_safe"
    }).scenarioResourceMode,
    "cmp_safe"
  );
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE: "webmd",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE: "selective"
    }),
    {
      actionFinalSettleMs: 350,
      consentFlowScreenshotMode: "none",
      evidenceDiagnosticMode: "webmd",
      preConsentScreenshotMode: "selective",
      preConsentScreenshotTimeoutMs: 5000,
      scenarioConcurrency: 2,
      scenarioResourceMode: "lean"
    }
  );
});

test("handler parses bounded per-dispatch Lambda debug overrides", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    debugOverrides: {
      actionFinalSettleMs: 25_000,
      actionSearchDeadlineMs: 12_000,
      consentFlowDeadlineMs: 120_000,
      preActionObservationMs: 5_000,
      privacyControlUrls: [
        "https://example.com/privacy",
        "javascript:alert(1)",
        "https://example.com/privacy",
        "https://example.com/choices",
        "https://example.com/extra",
      ],
      scenarioConcurrency: 9,
      scenarioResourceMode: "cmp_safe",
      strongEvidenceMode: "webmd"
    }
  }));

  assert.deepEqual(parsed.debugOverrides, {
    actionFinalSettleMs: 10_000,
    actionSearchDeadlineMs: 12_000,
    consentFlowDeadlineMs: 90_000,
    preActionObservationMs: 5_000,
    privacyControlUrls: [
      "https://example.com/privacy",
      "https://example.com/choices",
    ],
    scenarioConcurrency: 4,
    scenarioResourceMode: "cmp_safe",
    strongEvidenceMode: "webmd"
  });
  assert.equal(parsed.strongEvidenceMode, "webmd");
});

test("handler rejects wrong contract, processor, region, VPC, or production-integration flags", () => {
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ contractVersion: "wrong" })),
    /contract version/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ processor: "queued-full-scan-v1" })),
    /unexpected processor/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ awsRegion: "us-east-1" })),
    /eu-central-1/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ vpcMode: "private" })),
    /outside a VPC/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ productionFindingIntegration: true })),
    /artifact-only/
  );
});

test("handler emits a validated completed SQS result without production findings", async () => {
  const sentBodies: string[] = [];
  const result = await handler(validPayload(), {
    now: () => new Date("2026-06-15T18:00:00.000Z"),
    runArtifactChain: async () => ({
      artifactMetadata: {
        manifestUri: {
          sha256: "a".repeat(64),
          sizeBytes: 10
        }
      },
      artifactPointers: {
        manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json",
        reportAdapterArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/V2ReportProjectionDraft.json",
        reviewArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/ReviewResult.json",
        scanArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/CanonicalEvidenceBundle.json"
      },
      phaseTimings: [{ durationMs: 123, label: "scan", status: "completed" }]
    }),
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        assert.equal(command.input.QueueUrl, "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results");
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.productionFindingIntegration, false);
  assert.equal(Object.hasOwn(result, "findings"), false);
  assert.equal(Object.hasOwn(result, "checklistRows"), false);
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.equal(sentBodies.length, 1);

  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.artifactPointers?.manifestUri, "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json");
  assert.equal(parsed.artifactMetadata?.manifestUri?.sizeBytes, 10);
  assert.deepEqual(parsed.phaseTimings, [{ durationMs: 123, label: "scan", status: "completed" }]);
});

test("handler worker mode fails closed while post-consent flow scanning is deferred", async () => {
  let sentMessages = 0;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    scanId: "scan-local-1_accept_gpc",
    workerLane: "accept_gpc"
  }), {
    runArtifactChain: async () => {
      throw new Error("worker artifact chain should not run");
    },
    sqsClient: {
      async send() {
        sentMessages += 1;
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.workerLane, "accept_gpc");
  assert.match(result.error?.message ?? "", /deferred from the production scanner/);
  assert.equal(sentMessages, 0);
});

test("sharded bundle merge synthesizes cross-worker accept versus reject comparison", () => {
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1"),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_accept_gpc", {
        consentActionAttempts: [actionAttempt("accept_all_flow", "accept_all", false)],
        consentFlowObservations: [consentObservation("accept_all_flow")]
      }),
      canonicalBundleFixture("scan-local-1_reject_manage", {
        consentActionAttempts: [actionAttempt("reject_all_flow", "reject_all", false)],
        consentFlowObservations: [consentObservation("reject_all_flow")]
      })
    ]
  });

  const comparison = merged.consentFlowComparisons.find((candidate) =>
    candidate.comparedScenarios === "after_reject_vs_after_accept"
  );
  assert.ok(comparison);
  assert.equal(comparison.comparisonId, "consent_comparison_after_reject_vs_after_accept");
  assert.equal(comparison.comparableMeasurement?.comparable, false);
  assert.match(comparison.comparableMeasurement?.reason ?? "", /reject_all_not_confidently_executed/);
  assert.match(comparison.comparableMeasurement?.reason ?? "", /accept_all_not_confidently_executed/);
});

test("sharded bundle merge retains exactly one diagnostic screenshot", () => {
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1", {
      screenshots: [screenshotArtifact("screenshot_pre_consent", "scan-local-1/screenshot-pre-consent.png")]
    }),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_accept_gpc", {
        screenshots: [screenshotArtifact("screenshot_accept_all_flow_after_action", "scan-local-1_accept_gpc/screenshot-after.png")]
      }),
      canonicalBundleFixture("scan-local-1_reject_manage", {
        screenshots: [screenshotArtifact("screenshot_reject_all_flow_after_action", "scan-local-1_reject_manage/screenshot-after.png")]
      })
    ]
  });

  assert.equal(merged.screenshots.length, 1);
  assert.equal(merged.screenshots[0]?.artifactId, "screenshot_pre_consent");
});

test("artifact uploader returns durable metadata for all v2 JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    projectionPath: path.join(tmp, "V2ReportProjectionDraft.json"),
    reviewPath: path.join(tmp, "ReviewResult.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.entries(files).map(([name, filePath]) => writeFile(filePath, JSON.stringify({ name }), "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-1",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    projectionFileName: "V2ReportProjectionDraft.json",
    reviewFileName: "ReviewResult.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const puts: Array<{ bucket: string | undefined; key: string | undefined }> = [];

  const metadata = await uploadArtifactFiles({
    ...files,
    pointers,
    s3Client: {
      async send(command: PutObjectCommand) {
        puts.push({
          bucket: command.input.Bucket,
          key: command.input.Key
        });
        return { $metadata: {} };
      }
    }
  });

  assert.equal(puts.length, 4);
  assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
  assert.ok(puts.some((put) => put.key?.endsWith("/CanonicalEvidenceBundle.json")));
  assert.equal(typeof metadata.scanArtifactUri?.sha256, "string");
  assert.ok((metadata.scanArtifactUri?.sizeBytes ?? 0) > 0);
});

test("auxiliary uploader returns durable metadata for bounded internal JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-aux-test-"));
  await writeFile(path.join(tmp, "CanonicalEvidenceBundle.json"), JSON.stringify({ core: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_plan.json"), JSON.stringify({ plan: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_execution.json"), JSON.stringify({ execution: true }), "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent.png"), "not-json", "utf8");
  const puts: Array<{ bucket: string | undefined; key: string | undefined }> = [];
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const previousPrefix = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-v2-local-artifacts";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local";
  try {
    const artifacts = await uploadAuxiliaryArtifactFiles({
      artifactRoot: tmp,
      payload: validPayload(),
      s3Client: {
        async send(command: PutObjectCommand) {
          puts.push({
            bucket: command.input.Bucket,
            key: command.input.Key
          });
          return { $metadata: {} };
        }
      }
    });

    assert.equal(artifacts.length, 3);
    assert.deepEqual(artifacts.map((artifact) => artifact.fileName), [
      "consent_scenario_execution.json",
      "consent_scenario_plan.json",
      "screenshot-pre-consent.png"
    ]);
    assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
    assert.ok(puts.every((put) => put.key?.includes("/auxiliary/")));
    assert.ok(artifacts.every((artifact) => artifact.uri.startsWith("s3://certscore-v2-local-artifacts/")));
  } finally {
    if (previousBucket === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
    if (previousPrefix === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = previousPrefix;
    }
  }
});

test("coordinator mirrors worker auxiliary diagnostics into final artifact root", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-worker-aux-test-"));
  const diagnosticsBody = Buffer.from(JSON.stringify({ artifactVersion: "test.diagnostics.v1" }));
  const diagnosticsSha256 = createHash("sha256").update(diagnosticsBody).digest("hex");
  const manifestBody = Buffer.from(JSON.stringify({
    auxiliaryArtifacts: [{
      fileName: "consent-runtime-diagnostics-accept_all_flow.json",
      sha256: diagnosticsSha256,
      sizeBytes: diagnosticsBody.byteLength,
      uri: "s3://certscore-v2-local-artifacts/v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json"
    }]
  }));
  const bodies = new Map<string, Buffer>([
    ["v2/worker/LocalV2DagLambdaManifest.json", manifestBody],
    ["v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json", diagnosticsBody]
  ]);
  const mirrored = await mirrorWorkerArtifactsIntoFinalArtifactRoot({
    artifactRoot: tmp,
    workerResults: [{
      artifactPointers: {
        manifestUri: "s3://certscore-v2-local-artifacts/v2/worker/LocalV2DagLambdaManifest.json",
        scanArtifactUri: "s3://certscore-v2-local-artifacts/v2/worker/CanonicalEvidenceBundle.json"
      },
      scanId: "scan-local-1_accept_gpc",
      status: "completed",
      workerLane: "accept_gpc"
    }],
    s3GetClient: {
      async send(command: GetObjectCommand) {
        const key = String(command.input.Key);
        const body = bodies.get(key);
        if (!body) {
          throw new Error(`unexpected key ${key}`);
        }
        return { Body: body, $metadata: {} };
      }
    }
  });

  assert.equal(mirrored, undefined);
  assert.deepEqual(JSON.parse(await readFile(path.join(tmp, "worker-accept_gpc-LocalV2DagLambdaManifest.json"), "utf8")), {
    auxiliaryArtifacts: [{
      fileName: "consent-runtime-diagnostics-accept_all_flow.json",
      sha256: diagnosticsSha256,
      sizeBytes: diagnosticsBody.byteLength,
      uri: "s3://certscore-v2-local-artifacts/v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json"
    }]
  });
  assert.deepEqual(
    JSON.parse(await readFile(path.join(tmp, "worker-accept_gpc-consent-runtime-diagnostics-accept_all_flow.json"), "utf8")),
    { artifactVersion: "test.diagnostics.v1" }
  );
});

test("handler emits a bounded failed result when the artifact chain fails", async () => {
  const sentBodies: string[] = [];
  const result = await handler(validPayload(), {
    now: () => new Date("2026-06-15T18:00:00.000Z"),
    runArtifactChain: async () => {
      throw new Error(`scan failed ${"x".repeat(1000)}`);
    },
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "v2_dag_lambda_failed");
  assert.ok((result.error?.message.length ?? 0) <= 500);
  assert.equal(sentBodies.length, 1);

  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "failed");
  assert.equal(parsed.error?.code, "v2_dag_lambda_failed");
  assert.equal(parsed.productionFindingIntegration, false);
});

test("handler does not emit SQS for invalid dispatch payloads", async () => {
  let sendCount = 0;
  await assert.rejects(
    handler(validPayload({ contractVersion: "wrong" }), {
      sqsClient: {
        async send() {
          sendCount += 1;
          return { $metadata: {} };
        }
      }
    }),
    /contract version/
  );
  assert.equal(sendCount, 0);
});

function canonicalBundleFixture(
  scanId: string,
  overrides: Partial<CanonicalEvidenceBundle> = {}
): CanonicalEvidenceBundle {
  return {
    artifactRefs: [],
    cmpRuntimeObservations: [],
    completedAt: "2026-06-15T18:00:01.000Z",
    consentActionAttempts: [],
    consentActionCandidates: [],
    consentFlowComparisons: [],
    consentFlowObservations: [],
    consentInteractionEvents: [],
    consentUiObservations: [],
    cookieEvents: [],
    cookieSnapshots: [],
    derivedRuntimeSignals: {
      preConsentTrackingObserved: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      thirdPartyVendorsObserved: false
    },
    domSnapshots: [],
    iframeEvents: [],
    modulesRun: [],
    networkEvents: [],
    networkResponseEvents: [],
    normalizedUrl: "https://example.com/",
    normalizedVendorObservations: [],
    observedJourneys: [],
    policySurfaceObservations: [],
    runtimeTimeline: [],
    scanId,
    scanProfile: {
      enabledModules: [],
      internalBudgetMs: 1_000,
      label: "tiny",
      profileId: "tiny",
      targetDurationMs: 1_000
    },
    scannerVersion: "test",
    schemaVersion: "certscore.v2.canonical_evidence_bundle.v1",
    screenshots: [],
    scriptEvents: [],
    startedAt: "2026-06-15T18:00:00.000Z",
    storageSnapshots: [],
    url: "https://example.com/",
    ...overrides
  };
}

function actionAttempt(
  scenario: ConsentActionAttempt["scenario"],
  actionType: ConsentActionAttempt["actionType"],
  succeeded: boolean,
): ConsentActionAttempt {
  return {
    actionType,
    attempted: true,
    attemptId: `attempt_${scenario}_${actionType}`,
    evidenceRefs: [],
    failureReason: succeeded ? undefined : "candidate_not_observed",
    scenario,
    succeeded,
    timestampMs: 10,
  };
}

function screenshotArtifact(artifactId: string, filePath: string): ScreenshotArtifact {
  return {
    artifactId,
    capturedAtMs: 10,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    path: filePath,
    url: "https://example.com/"
  };
}

function consentObservation(scenario: ConsentFlowObservation["scenario"]): ConsentFlowObservation {
  return {
    actionAttempts: [],
    actionCandidates: [],
    artifactRefs: [],
    bannerLikelyPresent: true,
    confidence: 0.7,
    consentStateAtTime: "pre_consent",
    directVsInferred: "direct",
    evidenceRefs: [],
    observationId: `consent_flow_${scenario}`,
    scenario,
    sourceScanner: "consent_flow_runtime",
  };
}
