import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import type { CanonicalEvidenceBundle, ConsentActionAttempt, ConsentFlowObservation, ScreenshotArtifact } from "@certscore/contracts";
import { parseLocalV2DagLambdaResultMessage } from "../../web/server/scans/local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES,
  LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
  LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  artifactPointersFromS3Keys,
  assessEgressProbeObservation,
  buildLocalV2DagLambdaLaneRun,
  buildLocalV2DagLambdaResultMessage,
  buildVerifiedPolicyEvidencePacket,
  buildLocalV2DagLambdaRuntimeDiagnostics,
  buildScannerRuntimeProvenance,
  buildLocalV2DagLambdaScanTuning,
  egressIpMatchesExpected,
  egressRegionMatchesExpected,
  fetchEgressProbeThroughProxy,
  handler,
  invokeLocalV2DagLambdaWorkers,
  mergeLocalV2DagLambdaEvidenceLaneBundles,
  mergeLocalV2DagLambdaShardBundles,
  mirrorWorkerArtifactsIntoFinalArtifactRoot,
  parseLocalV2DagLambdaDispatchPayload,
  sendLocalV2DagLambdaResultMessage,
  serializeCanonicalEvidenceBundle,
  unwrapLocalV2DagLambdaDispatchEvent,
  uploadAuxiliaryArtifactFiles,
  uploadArtifactFiles,
  writeEgressPreflightArtifact,
} from "./handler";

test("canonical evidence bundle transport is compact without changing evidence", () => {
  const bundle = {
    cookieEvents: [{ cookieName: "session", evidenceRefs: ["cookie-1"] }],
    policySurfaceObservations: [{ status: "fetched", textExcerpt: "Retained evidence." }],
  };
  const serialized = serializeCanonicalEvidenceBundle(bundle);
  assert.equal(serialized, JSON.stringify(bundle));
  assert.deepEqual(JSON.parse(serialized), bundle);
  assert.equal(serialized.includes("\n"), false);
});

test("sharded orchestration fans out exactly one consent, runtime, and policy evidence lane", () => {
  assert.deepEqual(LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES, [
    "consent_proof",
    "runtime_evidence",
    "policy_evidence",
  ]);
});

test("lane instrumentation retains the first top-level response and distinguishes physical invocations", () => {
  const bundle = canonicalBundleFixture("scan-lanes", {
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-15T18:00:00.010Z",
      completedAt: "2026-06-15T18:00:01.000Z",
      durationMs: 990,
      recoveryDiagnostics: {
        attempted: false,
        attemptCount: 0,
        modes: [],
        durationMs: 0,
        attempts: [{
          url: "https://example.com/?token=secret",
          mode: "initial_navigation",
          outcome: "success",
          httpStatus: 200,
          durationMs: 40,
        }],
      },
      evidenceRefs: [],
      errors: [],
    }],
    networkEvents: [{
      eventId: "net-1",
      eventType: "network_request",
      requestId: "request-1",
      timestampMs: 20,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://example.com/?token=secret",
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      resourceType: "document",
      requestUrl: "https://example.com/?token=secret",
      isMainFrame: true,
      queryParamNames: ["token"],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
      hasIdentifierLikeParameters: false,
      hasAdvertisingClickIdParameters: false,
      hasTagContainerParameters: false,
      redirectChainRequestIds: [],
      cookieHeaderPresent: false,
      cookieNamesSent: [],
      authorizationHeaderPresent: false,
      collectionEndpointObserved: false,
    }] as CanonicalEvidenceBundle["networkEvents"],
    networkResponseEvents: [{
      eventId: "response-1",
      eventType: "network_response",
      requestId: "request-1",
      timestampMs: 35,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://example.com/?token=secret",
      responseUrl: "https://example.com/?token=secret",
      status: 200,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      setCookieHeaders: [],
      setCookieMetadata: [],
      cookieNamesSet: [],
      cacheHeaders: {},
      accessControlHeaders: {},
    }] as CanonicalEvidenceBundle["networkResponseEvents"],
  });

  const consent = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-consent",
    region: "eu-west-1",
    workerLane: "consent_proof",
  });
  const runtime = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-runtime",
    region: "eu-west-1",
    workerLane: "runtime_evidence",
  });

  assert.equal(consent?.firstHttpStatus, 200);
  assert.equal(consent?.firstResponseOffsetMs, 35);
  assert.equal(consent?.navigationCount, 1);
  assert.deepEqual(consent?.navigationAttempts, [{
    sequence: 1,
    mode: "initial_navigation",
    outcome: "success",
    httpStatus: 200,
    durationMs: 40,
    effectiveUrl: "https://example.com/",
  }]);
  assert.equal(consent?.accessOutcome, "representative_page");
  assert.equal(consent?.firstEffectiveUrl?.includes("secret"), false);
  assert.notEqual(consent?.physicalInvocationId, runtime?.physicalInvocationId);
});

test("technical browser success remains a bot-challenge access outcome", () => {
  const bundle = canonicalBundleFixture("scan-challenge", {
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-15T18:00:00.000Z",
      completedAt: "2026-06-15T18:00:00.500Z",
      durationMs: 500,
      evidenceRefs: [],
      errors: [],
    }],
    scanNoGoAssessment: {
      status: "available",
      version: "scan-no-go-assessment-v1",
      decision: "no_go",
      scanNoGoConfidence: 0.98,
      reasonCodes: ["captcha_or_challenge", "scan_no_go_corroborated"],
      corroboratorCodes: ["network_security_challenge_request_observed"],
      contradictorCodes: [],
      supportingSignals: { challengeSignalsDetected: true },
    } as CanonicalEvidenceBundle["scanNoGoAssessment"],
  });

  const lane = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-challenge",
    region: "us-west-1",
    workerLane: "runtime_evidence",
  });

  assert.equal(lane?.executionOutcome, "success");
  assert.equal(lane?.challengeDetected, true);
  assert.equal(lane?.accessOutcome, "bot_challenge");
});

test("evidence workers start concurrently and retain the parent scan identity", async () => {
  const seenPayloads: Array<Record<string, unknown>> = [];
  let activeInvocations = 0;
  let maximumConcurrentInvocations = 0;
  const parentPayload = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded" }));

  const results = await invokeLocalV2DagLambdaWorkers({
    parentPayload,
    parentScanId: parentPayload.scanId,
    workerLanes: LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES,
    lambdaClient: {
      async send(command) {
        const workerPayload = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8")) as Record<string, unknown>;
        seenPayloads.push(workerPayload);
        activeInvocations += 1;
        maximumConcurrentInvocations = Math.max(maximumConcurrentInvocations, activeInvocations);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeInvocations -= 1;
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactPointers: {
              scanArtifactUri: `s3://test-bucket/v2/${String(workerPayload.workerLane)}/CanonicalEvidenceBundle.json`,
            },
            scanId: workerPayload.scanId,
            status: "completed",
            workerLane: workerPayload.workerLane,
          })),
        };
      },
    },
  });

  assert.equal(maximumConcurrentInvocations, 3);
  assert.deepEqual(seenPayloads.map((payload) => payload.workerLane), LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES);
  assert.equal(seenPayloads.every((payload) => payload.scanId === parentPayload.scanId), true);
  assert.equal(results.every((result) => result.scanId === parentPayload.scanId), true);
});

test("the default artifact chain preserves at least the full terminal publication reserve", () => {
  assert.equal(LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS, 30_000);
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS <
      LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS,
  );
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS <=
      LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS -
        LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS,
  );
});

test("sharded coordinator safety deadline stays below the 75-second Lambda cutoff", () => {
  assert.equal(LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS, 65_000);
  assert.ok(LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS < 75_000);
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS >= 5_000,
  );
});

test("dedicated evidence workers preserve the standard profile module budget", async () => {
  let allowRuntimeEvidenceFinalizationAfterAbort: boolean | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let physicalInvocationId: string | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "runtime_evidence",
  }), {
    awsRequestId: "aws-request-runtime-worker",
    runArtifactChain: async (_payload, options) => {
      allowRuntimeEvidenceFinalizationAfterAbort = options.allowRuntimeEvidenceFinalizationAfterAbort;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      physicalInvocationId = options.physicalInvocationId;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(allowRuntimeEvidenceFinalizationAfterAbort, true);
  assert.equal(
    preConsentModuleDeadlineMs,
    LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
  );
  assert.equal(preConsentModuleDeadlineMs, 35_000);
  assert.equal(physicalInvocationId, "aws-request-runtime-worker");
});

test("consent-proof workers reserve a bounded visual recovery window", async () => {
  let allowRuntimeEvidenceFinalizationAfterAbort: boolean | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineMs: number | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "consent_proof",
  }), {
    runArtifactChain: async (_payload, options) => {
      allowRuntimeEvidenceFinalizationAfterAbort = options.allowRuntimeEvidenceFinalizationAfterAbort;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      preConsentVisualFallbackDeadlineMs = options.preConsentVisualFallbackDeadlineMs;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(allowRuntimeEvidenceFinalizationAfterAbort, false);
  assert.equal(preConsentModuleDeadlineMs, 35_000);
  assert.equal(
    preConsentModuleDeadlineMs,
    LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS -
      4_000 -
      6_000,
  );
  assert.equal(preConsentVisualFallbackDeadlineMs, 6_000);
});

test("early policy handoff packet is typed, hash-bound, and non-projectable", () => {
  const packet = buildVerifiedPolicyEvidencePacket({
    payload: parseLocalV2DagLambdaDispatchPayload(validPayload()),
    result: {
      artifactRefs: [],
      moduleRun: {
        moduleName: "policySurfaceScanner",
        status: "completed",
        startedAt: "2026-07-31T20:00:00.000Z",
        completedAt: "2026-07-31T20:00:03.000Z",
        durationMs: 3_000,
        timingBreakdown: Array.from({ length: 45 }, (_, index) => ({
          label: `policy timing ${index + 1}`,
          durationMs: index + 1,
        })),
      },
      policySurfaceObservations: [{
        observationId: "privacy-policy-1",
        surfaceType: "privacy_policy",
        url: "https://example.com/privacy",
        normalizedUrl: "https://example.com/privacy",
        status: "fetched",
        documentFetchState: "fetched",
        documentEvaluationState: "usable",
        documentRole: "policy_document",
        documentFormat: "html",
        targetRelationship: "target_controller",
        contentCoverage: {
          status: "complete",
          sourceTextChars: 72,
          extractedSectionCount: 1,
          retainedSectionCount: 1,
          retainedStrongSectionCount: 1,
          retainedTableRowCount: 0,
          limitationKeys: [],
        },
        observedTopics: ["processing_purposes"],
        policyCookieDisclosures: [],
        mentionedRights: [],
        textExcerpt: "We process personal information to provide the services you request.",
        confidence: 0.98,
        artifactRefs: [],
      }],
    },
  });
  const { sourceHash, ...unsigned } = packet;

  assert.equal(packet.artifactOnly, true);
  assert.equal(packet.productionFindingIntegration, false);
  assert.equal(packet.policySurfaceInspection.privacyPolicyObserved, true);
  assert.equal(packet.moduleRun.timingBreakdown?.length, 40);
  assert.equal(packet.moduleRun.timingBreakdown?.[39]?.label, "timing entries truncated");
  assert.equal(
    sourceHash,
    createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"),
  );
});

test("terminal result retains the verified early-policy pointer as an ordering fallback", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload());
  const policyEvidence = {
    artifactMetadata: { sha256: "a".repeat(64), sizeBytes: 123 },
    artifactOnly: true as const,
    artifactPointer: "s3://certscore-dev-artifacts/v2/scan-local-1/VerifiedPolicyEvidencePacket.json",
    contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1" as const,
    generatedAt: "2026-07-31T20:00:03.000Z",
    messageKind: "policy_evidence_ready" as const,
    policyContentHash: "b".repeat(64),
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false as const,
    scanId: payload.scanId,
    sourceHash: "c".repeat(64),
    targetEnvironment: payload.targetEnvironment,
  };
  const result = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date("2026-07-31T20:00:05.000Z"),
    payload,
    policyEvidence,
    status: "completed",
  });

  assert.deepEqual(result.policyEvidence, policyEvidence);
  assert.equal(result.policyEvidence?.productionFindingIntegration, false);
});

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
    resultPurpose: "synthetic_verification",
    resultQueueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scanId: "scan-local-1",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none",
    ...overrides
  };
}

test("regional FIFO SQS dispatch envelopes contain exactly one typed payload", () => {
  const event = {
    Records: [{
      body: JSON.stringify(validPayload()),
      eventSource: "aws:sqs",
    }],
  };
  const unwrapped = unwrapLocalV2DagLambdaDispatchEvent(event);
  assert.equal(unwrapped.transport, "sqs_fifo");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(unwrapped.payload).scanId, "scan-local-1");
  assert.throws(
    () => unwrapLocalV2DagLambdaDispatchEvent({ Records: [event.Records[0], event.Records[0]] }),
    /exactly one FIFO SQS record/,
  );
});

test("SQS redelivery replays retained completion without rerunning scanner work", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const previousPrefix = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local";
  let artifactRuns = 0;
  const sent: SendMessageCommand[] = [];
  try {
    const result = await handler({
      Records: [{ body: JSON.stringify(validPayload()), eventSource: "aws:sqs" }],
    }, {
      runArtifactChain: async () => {
        artifactRuns += 1;
        throw new Error("scanner work must not rerun");
      },
      s3GetClient: {
        async send(command: GetObjectCommand) {
          const key = command.input.Key ?? "";
          const body = key.endsWith("LocalV2DagLambdaManifest.json")
            ? JSON.stringify({ generatedAt: "2026-08-20T20:00:00.000Z", phaseTimings: [] })
            : JSON.stringify({ artifactVersion: "fixture" });
          return { Body: Buffer.from(body) };
        },
      },
      sqsClient: {
        async send(command: SendMessageCommand) {
          sent.push(command);
          return { MessageId: "replayed-result" };
        },
      },
    });
    assert.equal(artifactRuns, 0);
    assert.equal(sent.length, 1);
    assert.equal(result.status, "completed");
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    if (previousPrefix === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = previousPrefix;
  }
});

test("handler validates local v2 DAG Lambda dispatch contract", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload());

  assert.equal(parsed.scanId, "scan-local-1");
  assert.equal(parsed.awsRegion, "eu-central-1");
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(parsed.resultPurpose, "synthetic_verification");
});

test("handler preserves the typed persisted-scan result purpose for UUID-backed product scans", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    callbackCorrelationId: "49037835-190b-4e67-9fe2-426d51d55069",
    resultPurpose: "persisted_scan",
    scanId: "49037835-190b-4e67-9fe2-426d51d55069",
  }));

  assert.equal(parsed.resultPurpose, "persisted_scan");
  assert.equal(parsed.scanId, "49037835-190b-4e67-9fe2-426d51d55069");
});

test("handler bounds and validates policy surface seeds", () => {
  const source = {
    sourceCompletedAt: "2026-08-18T00:00:00.000Z",
    sourceScanId: "prior-scan-1",
  };
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    policySurfaceSeeds: [
      { confidence: 4, hintType: "privacy_policy", source: "prior_scan_hint", ...source, url: "https://example.com/legal/privacy#section" },
      { hintType: "unrelated", source: "prior_scan_hint", ...source, url: "https://example.com/about" },
      { hintType: "cookie_policy", source: "unknown", ...source, url: "https://example.com/cookies" },
      { hintType: "privacy_policy", source: "prior_scan_hint", ...source, url: "javascript:alert(1)" }
    ]
  }));

  assert.deepEqual(parsed.policySurfaceSeeds, [{
    confidence: 1,
    hintType: "privacy_policy",
    source: "prior_scan_hint",
    sourceCompletedAt: source.sourceCompletedAt,
    sourceScanId: source.sourceScanId,
    url: "https://example.com/legal/privacy"
  }]);
});

test("lightweight egress probe enforces one hard total deadline", async () => {
  const proxy = createHttpServer();
  let tunnelSocket: { destroy(): void } | undefined;
  let connectTarget: string | undefined;
  const priorConnectHost = process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_CONNECT_HOST;
  process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_CONNECT_HOST = "owned-origin.example";
  proxy.on("connect", (request, socket) => {
    connectTarget = request.url;
    tunnelSocket = socket;
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address === "object");
  const startedAt = Date.now();
  try {
    await assert.rejects(
      fetchEgressProbeThroughProxy(`http://127.0.0.1:${address.port}`, 100),
      /exceeded 100ms total deadline/,
    );
    assert.ok(Date.now() - startedAt < 1_000);
    assert.equal(connectTarget, "owned-origin.example:443");
  } finally {
    if (priorConnectHost === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_CONNECT_HOST;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_EGRESS_REFLECTOR_CONNECT_HOST = priorConnectHost;
    }
    tunnelSocket?.destroy();
    await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
  }
});

test("browser-fallback handoff preserves the failed lightweight egress attempt", async () => {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-egress-attempts-"));
  const priorProxy = process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER;
  process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = "ftp://127.0.0.1:9";
  try {
    assert.equal(await writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: false }), false);
    assert.equal(await writeEgressPreflightArtifact(artifactRoot, {
      allowBrowserFallback: false,
      skipLightweightProbe: true,
    }), false);
    const artifact = JSON.parse(await readFile(path.join(artifactRoot, "EgressPreflight.json"), "utf8")) as {
      attempts?: Array<{ error?: string; mode?: string; probeStatus?: string }>;
    };
    assert.deepEqual(artifact.attempts?.map((attempt) => attempt.mode), ["lightweight_proxy"]);
    assert.equal(artifact.attempts?.[0]?.probeStatus, "failed");
    assert.match(artifact.attempts?.[0]?.error ?? "", /Unsupported lightweight egress proxy protocol/);
  } finally {
    if (priorProxy === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = priorProxy;
    }
    await rm(artifactRoot, { force: true, recursive: true });
  }
});

test("handler accepts the approved regional Lambda dispatch targets", () => {
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({ awsRegion: "eu-central-1" })).awsRegion, "eu-central-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "eu-west-1",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results"
  })).awsRegion, "eu-west-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "us-west-1",
    resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-usw-results"
  })).awsRegion, "us-west-1");
});

test("handler exposes bounded Lambda runtime diagnostics for quality A/B runs", () => {
  const diagnostics = buildLocalV2DagLambdaRuntimeDiagnostics({
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "4096",
    AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-IE,en;q=0.9",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-IE",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Dublin",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD: "secret",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER: "http://proxy.example:8080",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME: "scanner"
  });

  assert.equal(diagnostics.awsLambdaRuntime, true);
  assert.deepEqual(diagnostics.chromiumContextOptions, {
    acceptLanguage: "en-IE,en;q=0.9",
    locale: "en-IE",
    timezoneId: "Europe/Dublin",
    userAgent: null,
    userAgentConfigured: false,
    viewport: { width: 1366, height: 900 }
  });
  assert.equal(diagnostics.chromiumProxyAuthConfigured, true);
  assert.equal(diagnostics.chromiumProxyConfigured, true);
  assert.equal(diagnostics.chromiumSingleProcessEnabled, false);
  assert.equal(diagnostics.memorySizeMb, 4096);
  assert.equal(diagnostics.chromiumLaunchArgs.includes("--single-process"), false);
  assert.equal(Object.hasOwn(diagnostics, "OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(diagnostics).includes("secret"), false);
  assert.equal(JSON.stringify(diagnostics).includes("proxy.example"), false);
});

test("regional egress guard fails closed when the proxy public region is wrong", () => {
  assert.equal(egressRegionMatchesExpected("California", "California"), true);
  assert.equal(egressRegionMatchesExpected("california", "California"), true);
  assert.equal(egressRegionMatchesExpected("Oregon", "California"), false);
  assert.equal(egressRegionMatchesExpected(undefined, "California"), false);
  assert.equal(egressRegionMatchesExpected(undefined, undefined), true);
});

test("regional egress guard binds Chrome egress to the configured proxy public IP hash", () => {
  const proxyIpHash = "sha256:" + createHash("sha256").update("34.218.187.36").digest("hex");
  assert.equal(egressIpMatchesExpected("34.218.187.36", proxyIpHash), true);
  assert.equal(egressIpMatchesExpected("35.164.175.41", proxyIpHash), false);
  assert.equal(egressIpMatchesExpected("34.218.187.36", undefined), true);
});

test("owned egress reflector verifies region through the configured exact IP binding", () => {
  const expectedHash = `sha256:${createHash("sha256").update("203.0.113.42").digest("hex")}`;
  const assessment = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 200,
    observed: { ip: "203.0.113.42" },
    provider: "certscore.ai",
  });
  assert.equal(assessment.probeStatus, "available");
  assert.equal(assessment.regionMatches, true);
  assert.equal(assessment.regionVerificationSource, "configured_exact_ip_binding");
});

test("egress preflight fails closed on provider throttling or an unexpected public IP", () => {
  const expectedHash = `sha256:${createHash("sha256").update("203.0.113.42").digest("hex")}`;
  const throttled = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 429,
    observed: null,
    provider: "ipinfo.io",
  });
  assert.equal(throttled.probeStatus, "failed");
  assert.match(throttled.error ?? "", /HTTP 429/);

  const wrongIp = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 200,
    observed: { ip: "198.51.100.10" },
    provider: "certscore.ai",
  });
  assert.equal(wrongIp.probeStatus, "failed");
  assert.match(wrongIp.error ?? "", /did not match/);
});

test("handler exposes bounded Lambda scan tuning for quality and speed A/B runs", () => {
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE: "auto",
      CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS: "9000",
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "3"
    }),
    {
      actionFinalSettleMs: 1500,
      consentFlowScreenshotMode: "auto",
      evidenceDiagnosticMode: "off",
      preConsentScreenshotMode: "always",
      preConsentScreenshotTimeoutMs: 1500,
      preConsentVisualFallbackDeadlineMs: 9000,
      scenarioConcurrency: 3,
      scenarioResourceMode: "cmp_safe"
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
      preConsentVisualFallbackDeadlineMs: 15000,
      scenarioConcurrency: 4,
      scenarioResourceMode: "cmp_safe"
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
      preConsentScreenshotTimeoutMs: 15000,
      preConsentVisualFallbackDeadlineMs: 15000,
      scenarioConcurrency: 1,
      scenarioResourceMode: "cmp_safe"
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

test("handler keeps Lambda scan modules browser-isolated for runtime stability", async () => {
  const handlerSource = await readFile(new URL("./handler.ts", import.meta.url), "utf8");

  assert.match(handlerSource, /browserReuseMode:\s*"per_module"/);
  assert.doesNotMatch(handlerSource, /browserReuseMode:\s*"single"/);
});

test("handler bundle imports without browser-only PDF globals", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tempDir = await mkdtemp(path.join(repoRoot, "apps/v2-dag-lambda/tmp/bundle-import-"));
  const outfile = path.join(tempDir, "handler.cjs");
  await build({
    bundle: true,
    entryPoints: [path.join(repoRoot, "apps/v2-dag-lambda/src/handler.ts")],
    external: ["playwright", "pdf-parse"],
    format: "cjs",
    minify: true,
    outfile,
    platform: "node",
    target: "node22",
    tsconfig: path.join(repoRoot, "tsconfig.base.json")
  });

  const requireFromTest = createRequire(import.meta.url);
  const bundledHandler = requireFromTest(outfile) as { handler?: unknown };
  assert.equal(typeof bundledHandler.handler, "function");
  const bundledSource = await readFile(outfile, "utf8");
  assert.match(bundledSource, /import\(["']pdf-parse["']\)/);
  assert.doesNotMatch(bundledSource, /Cannot polyfill `DOMMatrix`/);
});

test("handler rejects wrong contract, processor, unsupported region, network mode, or production-integration flags", () => {
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
    /eu-central-1, eu-west-1, or us-west-1/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ vpcMode: "private" })),
    /supported network mode/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ productionFindingIntegration: true })),
    /artifact-only/
  );
});

test("handler accepts truthful VPC dispatch and emits bounded scanner runtime provenance", () => {
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({ vpcMode: "vpc" })).vpcMode, "vpc");
  assert.deepEqual(buildScannerRuntimeProvenance(
    { awsRegion: "eu-west-1", vpcMode: "vpc" },
    {
      AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID: "aws-nat:eu-west-1:eipalloc-123",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER: "aws-nat-gateway",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH: `sha256:${"b".repeat(64)}`,
      CERTSCORE_V2_DAG_LAMBDA_VPC_MODE: "vpc",
      SCANNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
    },
  ), {
    awsRegion: "eu-west-1",
    dispatchVpcMode: "vpc",
    egressId: "aws-nat:eu-west-1:eipalloc-123",
    egressProvider: "aws-nat-gateway",
    functionVersion: "$LATEST",
    imageDigest: `sha256:${"a".repeat(64)}`,
    publicIpHash: `sha256:${"b".repeat(64)}`,
    runtimeVpcMode: "vpc",
  });
});

test("handler emits a validated completed SQS result without production findings", async () => {
  const sentBodies: string[] = [];
  const previousBuildGitSha = process.env.BUILD_GIT_SHA;
  const previousBuildImageTag = process.env.BUILD_IMAGE_TAG;
  const previousScannerRuntimeVersion = process.env.SCANNER_RUNTIME_VERSION;
  process.env.BUILD_GIT_SHA = "abc123scanner";
  process.env.BUILD_IMAGE_TAG = "scanner-image:abc123scanner";
  process.env.SCANNER_RUNTIME_VERSION = "v2-dag-runtime.1";
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
  if (previousBuildGitSha === undefined) {
    delete process.env.BUILD_GIT_SHA;
  } else {
    process.env.BUILD_GIT_SHA = previousBuildGitSha;
  }
  if (previousBuildImageTag === undefined) {
    delete process.env.BUILD_IMAGE_TAG;
  } else {
    process.env.BUILD_IMAGE_TAG = previousBuildImageTag;
  }
  if (previousScannerRuntimeVersion === undefined) {
    delete process.env.SCANNER_RUNTIME_VERSION;
  } else {
    process.env.SCANNER_RUNTIME_VERSION = previousScannerRuntimeVersion;
  }

  assert.equal(result.status, "completed");
  assert.equal(result.productionFindingIntegration, false);
  assert.equal(result.scannerGitSha, "abc123scanner");
  assert.equal(result.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(result.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.deepEqual(result.scannerRuntimeProvenance, {
    awsRegion: "eu-central-1",
    dispatchVpcMode: "none",
    runtimeVpcMode: "unknown"
  });
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
  assert.equal(parsed.scannerGitSha, "abc123scanner");
  assert.equal(parsed.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(parsed.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.deepEqual(parsed.phaseTimings, [{ durationMs: 123, label: "scan", status: "completed" }]);
  assert.deepEqual(parsed.handlerTiming, {
    artifactChainCompletedAt: "2026-06-15T18:00:00.000Z",
    artifactChainDurationMs: 0,
    artifactChainStartedAt: "2026-06-15T18:00:00.000Z",
    completedAt: "2026-06-15T18:00:00.000Z",
    handlerDurationMs: 0,
    handlerStartedAt: "2026-06-15T18:00:00.000Z",
    scanPhaseDurationMs: 123,
    scanPhaseLabel: "scan"
  });
});

test("handler publishes a terminal failure before the Lambda hard timeout", async () => {
  const sentBodies: string[] = [];
  let scannerSignal: AbortSignal | undefined;
  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 20,
    handlerSafetyTimeoutMs: 30,
    scannerWorkTimeoutMs: 10,
    runArtifactChain: async (_payload, options) => {
      scannerSignal = options.signal;
      return await new Promise(() => undefined);
    },
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "v2_dag_lambda_safety_timeout");
  assert.match(result.error?.message ?? "", /internal safety deadline/);
  assert.equal(sentBodies.length, 1);
  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "failed");
  assert.equal(parsed.error?.code, "v2_dag_lambda_safety_timeout");
  assert.equal(scannerSignal?.aborted, true);
});

test("handler gives the policy lane an absolute deadline before scanner shutdown", async () => {
  const startedAtMs = Date.now();
  let policySurfaceDeadlineAtMs: number | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineAtMs: number | undefined;

  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 45_000,
    handlerSafetyTimeoutMs: 60_000,
    scannerWorkTimeoutMs: 40_000,
    runArtifactChain: async (_payload, options) => {
      policySurfaceDeadlineAtMs = options.policySurfaceDeadlineAtMs;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      preConsentVisualFallbackDeadlineMs = options.preConsentVisualFallbackDeadlineMs;
      preConsentVisualFallbackDeadlineAtMs = options.preConsentVisualFallbackDeadlineAtMs;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
    sqsClient: {
      async send() {
        return { $metadata: {} };
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.ok(policySurfaceDeadlineAtMs);
  const expectedOffsetMs = 40_000 - LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS;
  assert.ok(policySurfaceDeadlineAtMs >= startedAtMs + expectedOffsetMs);
  assert.ok(policySurfaceDeadlineAtMs <= Date.now() + expectedOffsetMs);
  assert.equal(preConsentModuleDeadlineMs, 30_000);
  assert.equal(preConsentVisualFallbackDeadlineMs, 6_000);
  const expectedVisualFallbackOffsetMs = 40_000 -
    LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS - 4_000;
  assert.ok(preConsentVisualFallbackDeadlineAtMs);
  assert.ok(preConsentVisualFallbackDeadlineAtMs >= startedAtMs + expectedVisualFallbackOffsetMs);
  assert.ok(preConsentVisualFallbackDeadlineAtMs <= Date.now() + expectedVisualFallbackOffsetMs);
});

test("a late partial scan can use artifact handoff reserve after scanner cancellation", async () => {
  let scannerSignal: AbortSignal | undefined;
  let artifactSignal: AbortSignal | undefined;
  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 1_000,
    handlerSafetyTimeoutMs: 20_000,
    resultPublishTimeoutMs: 100,
    scannerWorkTimeoutMs: 10,
    runArtifactChain: async (_payload, options) => {
      scannerSignal = options.signal;
      artifactSignal = options.artifactSignal;
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(options.signal?.aborted, true);
      options.onScanCoreComplete?.();
      if (options.artifactSignal?.aborted) {
        throw options.artifactSignal.reason;
      }
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [{ durationMs: 25, label: "artifact_handoff", status: "completed" }],
      };
    },
    sqsClient: {
      async send() {
        return { $metadata: {} };
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(scannerSignal?.aborted, true);
  assert.equal(artifactSignal?.aborted, false);
});

test("handler uploads a bounded artifact-only failure diagnostic on scanner timeout", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send() {
          return { $metadata: {} };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.artifactPointers?.failureDiagnosticUri ?? "", /FailureDiagnostic\.json$/);
    assert.equal(uploads.length, 1);
    assert.ok(uploads[0]?.body.length && uploads[0].body.length < 20_000);
    assert.match(uploads[0]?.body ?? "", /certscore\.v2_lambda_failure_diagnostic\.2/);
    assert.match(uploads[0]?.body ?? "", /cancellationRequestedAt/);
    assert.match(uploads[0]?.body ?? "", /terminalPublicationReserveMs/);
    assert.doesNotMatch(uploads[0]?.body ?? "", /cookieValue|documentText|requestBody|nanoReasoning/i);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("handler retains bounded egress diagnostics for an immediate preflight failure", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload(), {
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      runArtifactChain: async (_payload, options) => {
        await mkdir(options.artifactRoot, { recursive: true });
        await writeFile(path.join(options.artifactRoot, "EgressPreflight.json"), JSON.stringify({
          artifactVersion: "certscore.v2.lambda-egress-preflight.v1",
          attempts: [{
            durationMs: 42,
            error: "Egress probe provider ipinfo.io returned HTTP 429.",
            mode: "lightweight_proxy",
            observed: { ip: "203.0.113.42" },
            probeStatus: "failed",
            provider: "ipinfo.io",
            regionVerificationSource: "provider_observation",
          }],
          error: "Egress probe provider ipinfo.io returned HTTP 429.",
          expectedEgressPublicIpHash: "sha256:expected",
          expectedEgressRegion: "California",
          probeStatus: "failed",
          provider: "ipinfo.io",
          proxyModeEnabled: true,
          regionVerificationSource: "provider_observation",
        }));
        throw new Error("Required regional scanner egress preflight did not verify configured proxy and expected public region.");
      },
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send() {
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(uploads.length, 1);
    const diagnostic = JSON.parse(uploads[0]!.body);
    assert.equal(diagnostic.artifactVersion, "certscore.v2_lambda_failure_diagnostic.2");
    assert.equal(diagnostic.egressPreflight.probeStatus, "failed");
    assert.equal(diagnostic.egressPreflight.attempts[0].provider, "ipinfo.io");
    assert.match(diagnostic.egressPreflight.attempts[0].observedPublicIpHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(diagnostic).includes("203.0.113.42"), false);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("runtime worker retains a bounded failure diagnostic when no canonical partial bundle can be finalized", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload({
      orchestrationMode: "worker",
      workerLane: "runtime_evidence",
    }), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.workerLane, "runtime_evidence");
    assert.equal(result.error?.code, "v2_dag_lambda_safety_timeout");
    assert.match(result.artifactPointers?.failureDiagnosticUri ?? "", /lanes\/runtime_evidence\/failure\/FailureDiagnostic\.json$/);
    assert.equal(uploads.length, 1);
    assert.match(uploads[0]?.body ?? "", /certscore\.v2_lambda_failure_diagnostic\.2/);
    assert.doesNotMatch(uploads[0]?.body ?? "", /cookieValue|documentText|requestBody|nanoReasoning/i);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("failure diagnostic upload errors do not suppress terminal publication", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  let publicationCount = 0;
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send() {
          throw new Error("simulated diagnostic upload failure");
        },
      },
      sqsClient: {
        async send() {
          publicationCount += 1;
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifactPointers?.failureDiagnosticUri, undefined);
    assert.equal(publicationCount, 1);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("a stalled failure diagnostic upload cannot consume the terminal publication window", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  let publicationCount = 0;
  const startedAtMs = Date.now();
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send() {
          return await new Promise(() => undefined);
        },
      },
      sqsClient: {
        async send() {
          publicationCount += 1;
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifactPointers?.failureDiagnosticUri, undefined);
    assert.equal(publicationCount, 1);
    assert.ok(Date.now() - startedAtMs < 2_500);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("terminal SQS publication is bounded and aborts the SDK call", async () => {
  let observedSignal: AbortSignal | undefined;
  const startedAt = Date.now();

  await assert.rejects(
    sendLocalV2DagLambdaResultMessage({
      message: {
        artifactOnly: true,
        completedAt: "2026-06-15T18:00:00.000Z",
        contractVersion: "certscore.v2.lambda-dag-result.v1",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        productionFindingIntegration: false,
        resultPurpose: "synthetic_verification",
        scanId: "scan-local-1",
        status: "failed",
        targetEnvironment: "local"
      },
      queueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
      sqsClient: {
        async send(_command, options) {
          observedSignal = options?.abortSignal;
          return await new Promise(() => undefined);
        }
      },
      timeoutMs: 10
    }),
    /internal safety deadline/
  );

  assert.equal(observedSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 500);
});

test("terminal SQS publication retries a stalled send within its total deadline", async () => {
  let sends = 0;
  await sendLocalV2DagLambdaResultMessage({
    attemptTimeoutMs: 15,
    maxAttempts: 2,
    message: {
      artifactOnly: true,
      completedAt: "2026-06-15T18:00:00.000Z",
      contractVersion: "certscore.v2.lambda-dag-result.v1",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      resultPurpose: "synthetic_verification",
      scanId: "scan-local-retry",
      status: "completed",
      targetEnvironment: "local"
    },
    queueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
    sqsClient: {
      async send() {
        sends += 1;
        if (sends === 1) return await new Promise(() => undefined);
        return { $metadata: {} };
      }
    },
    timeoutMs: 80
  });

  assert.equal(sends, 2);
});

test("handler evidence worker returns verified artifact pointers without publishing a terminal result", async () => {
  let sentMessages = 0;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    workerLane: "consent_proof"
  }), {
    runArtifactChain: async () => ({
      artifactMetadata: {
        scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
      },
      artifactPointers: {
        scanArtifactUri: "s3://certscore-v2-local-artifacts/v2/scan-local-1/lanes/consent_proof/CanonicalEvidenceBundle.json",
      },
      phaseTimings: [],
    }),
    sqsClient: {
      async send() {
        sentMessages += 1;
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.workerLane, "consent_proof");
  assert.equal(result.artifactPointers?.scanArtifactUri?.includes("consent_proof"), true);
  assert.equal(sentMessages, 0);
});

test("policy evidence worker completes the verified early handoff without publishing a terminal result", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  const sentMessages: string[] = [];
  let uploadedObjects = 0;
  try {
    const result = await handler(validPayload({
      orchestrationMode: "worker",
      workerLane: "policy_evidence",
    }), {
      runArtifactChain: async (_payload, runOptions) => {
        runOptions.onPolicySurfaceComplete?.({
          artifactRefs: [],
          moduleRun: {
            moduleName: "policySurfaceScanner",
            status: "completed",
            startedAt: "2026-08-04T20:00:00.000Z",
            completedAt: "2026-08-04T20:00:01.000Z",
            durationMs: 1_000,
            evidenceRefs: [],
            errors: [],
          },
          policySurfaceObservations: [],
        });
        return {
          artifactMetadata: {
            scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
          },
          artifactPointers: {
            scanArtifactUri: "s3://certscore-test-artifacts/v2/scan-local-1/lanes/policy_evidence/CanonicalEvidenceBundle.json",
          },
          phaseTimings: [],
        };
      },
      s3Client: {
        async send() {
          uploadedObjects += 1;
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send(command: SendMessageCommand) {
          sentMessages.push(String(command.input.MessageBody));
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.workerLane, "policy_evidence");
    assert.equal(uploadedObjects, 1);
    assert.equal(sentMessages.length, 1);
    const message = JSON.parse(sentMessages[0] ?? "{}") as Record<string, unknown>;
    assert.equal(message.messageKind, "policy_evidence_ready");
    assert.equal(String(message.artifactPointer).includes("/lanes/policy_evidence/"), true);
  } finally {
    if (previousBucket === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
  }
});

test("sharded bundle merge preserves existing consent comparisons without synthesizing new ones", () => {
  const existingComparison = {
    comparisonId: "consent_comparison_existing",
    comparedScenarios: "after_reject_vs_after_accept",
    comparableMeasurement: {
      comparable: false,
      reason: "worker_comparison_retained",
      preActionWindow: {
        completedAtMs: 1,
        consentStateAtEnd: "post_reject",
        cookieEventCount: 0,
        networkEventCount: 0,
        scenario: "reject_all_flow",
        startedAtMs: 0
      },
      postActionWindow: {
        completedAtMs: 1,
        consentStateAtEnd: "post_accept",
        cookieEventCount: 0,
        networkEventCount: 0,
        scenario: "accept_all_flow",
        startedAtMs: 0
      }
    },
    confidence: 0.25,
    sourceModulesPresent: ["consentFlowRuntimeScanner"],
    sourceModulesRequired: ["consentFlowRuntimeScanner"]
  } as const;
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1"),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_accept_gpc", {
        consentActionAttempts: [actionAttempt("accept_all_flow", "accept_all", false)],
        consentFlowObservations: [consentObservation("accept_all_flow")],
        consentFlowComparisons: [existingComparison]
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
  assert.equal(comparison.comparisonId, "consent_comparison_existing");
  assert.equal(comparison.comparableMeasurement?.comparable, false);
  assert.equal(comparison.comparableMeasurement?.reason, "worker_comparison_retained");
});

test("three-lane merge keeps consent visuals, runtime coverage, and policy evidence in their canonical domains", () => {
  const artifactRoot = "/tmp/certscore-three-lane-test";
  const runtimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 0,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const policyObservation = {
    observationId: "policy_surface_privacy",
    surfaceType: "privacy_policy" as const,
    url: "https://example.com/privacy",
    normalizedUrl: "https://example.com/privacy",
    status: "observed" as const,
    documentFetchState: "not_attempted" as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot,
    scanId: "scan-local-1",
    consentProof: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("consent-lane-form"),
      automatedAccessObservation: {
        status: "available",
        version: "automated-access-observation-v1",
        productionProjectable: false,
        webBotAuth: {
          enabled: true,
          signingOutcome: "applied",
          signedHttpsRequestCount: 3,
          signedNavigationRequestCount: 1,
        },
        targetInfrastructure: {
          cloudflareObserved: false,
          providerCandidates: ["akamai"],
          signalCodes: ["main_document_provider:akamai"],
        },
      },
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent")],
      screenshots: [screenshotArtifact(
        "screenshot_pre_consent_settled",
        "/tmp/worker-consent/screenshot-pre-consent-settled.png",
      )],
      derivedRuntimeSignals: {
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false,
        consentBannerLikelyPresent: true,
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("runtime-lane-form"),
      automatedAccessObservation: {
        status: "available",
        version: "automated-access-observation-v1",
        productionProjectable: false,
        webBotAuth: {
          enabled: true,
          signingOutcome: "applied",
          signedHttpsRequestCount: 24,
          signedNavigationRequestCount: 2,
        },
        targetInfrastructure: {
          cloudflareObserved: true,
          providerCandidates: ["cloudflare"],
          signalCodes: ["cloudflare_cf_ray_header", "main_document_provider:cloudflare"],
        },
      },
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime")],
      artifactRefs: [{
        artifactId: "runtime_debug",
        artifactType: "json",
        path: "/tmp/worker-runtime/runtime-evidence.json",
        redactionStatus: "not_needed",
        relatedEventIds: [],
        sensitivity: "safe",
      }],
      networkEvents: [{
        eventId: "network_onetrust_stub",
        eventType: "network_request",
        timestampMs: 10,
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        pagePhase: "initial_navigation",
        evidenceRefs: [],
        confidence: 0.95,
        directVsInferred: "direct",
        requestId: "request_onetrust_stub",
        method: "GET",
        requestUrl: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
        path: "/scripttemplates/otSDKStub.js",
      }] as CanonicalEvidenceBundle["networkEvents"],
      runtimeCoverage,
      derivedRuntimeSignals: {
        preConsentTrackingObserved: true,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: true,
      },
    }),
    policyEvidence: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("policy-lane-form"),
      scanLaneRuns: [laneRunFixture("policy_evidence", "invoke-policy")],
      artifactRefs: [{
        artifactId: "policy_surface_text_privacy",
        artifactType: "other",
        path: "/tmp/worker-policy/policy_surface_text_privacy.txt",
        redactionStatus: "not_needed",
        relatedEventIds: [],
        sensitivity: "safe",
      }],
      policySurfaceObservations: [policyObservation],
    }),
  });

  assert.equal(merged.scanProfile.label, "Three-lane consent, runtime, and policy scan");
  assert.deepEqual(
    merged.scanLaneRuns.map((lane) => [lane.laneId, lane.physicalInvocationId]),
    [
      ["consent_proof", "invoke-consent"],
      ["runtime_evidence", "invoke-runtime"],
      ["policy_evidence", "invoke-policy"],
    ],
  );
  assert.equal(merged.screenshots[0]?.path, path.join(artifactRoot, "screenshot-pre-consent-settled.png"));
  assert.equal(merged.derivedRuntimeSignals.consentBannerLikelyPresent, true);
  assert.equal(merged.derivedRuntimeSignals.preConsentTrackingObserved, true);
  assert.equal(merged.runtimeCoverage?.coverageStatus, "usable");
  assert.equal(merged.collectionSurfaceInventory?.forms[0]?.title, "runtime-lane-form");
  assert.deepEqual(merged.automatedAccessObservation, {
    status: "available",
    version: "automated-access-observation-v1",
    productionProjectable: false,
    webBotAuth: {
      enabled: true,
      signingOutcome: "applied",
      signedHttpsRequestCount: 24,
      signedNavigationRequestCount: 2,
    },
    targetInfrastructure: {
      cloudflareObserved: true,
      providerCandidates: ["cloudflare"],
      signalCodes: ["cloudflare_cf_ray_header", "main_document_provider:cloudflare"],
    },
  });
  assert.equal(merged.networkEvents[0]?.path, "/scripttemplates/otSDKStub.js");
  assert.equal(merged.policySurfaceObservations[0]?.observationId, "policy_surface_privacy");
  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "usable");
  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.deepEqual(
    merged.scanEvidenceLaneAssessment?.limitationKeys.filter((key) => key.startsWith("consent_")),
    ["consent_control_inventory_incomplete"],
  );
  assert.equal(
    merged.artifactRefs.find((reference) => reference.artifactId === "runtime_debug")?.path,
    path.join(artifactRoot, "worker-runtime_evidence-runtime-evidence.json"),
  );
  assert.equal(
    merged.artifactRefs.find((reference) => reference.artifactId === "policy_surface_text_privacy")?.path,
    path.join(artifactRoot, "policy_surface_text_privacy.txt"),
  );
});

test("three-lane merge marks an empty consent-proof lane not testable", () => {
  const runtimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 1,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-empty-consent",
    scanId: "scan-empty-consent",
    consentProof: canonicalBundleFixture("scan-empty-consent", {
      visualCapture: {
        status: "unavailable",
        failureReason: "unknown",
        artifactRefs: [],
        notes: ["Consent lane reached its deadline."],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-empty-consent", {
      consentUiObservations: [{
        observationId: "runtime-lane-must-not-fill-consent-proof",
        observedAtMs: 1_000,
        likelyPresent: true,
        basis: ["runtime_lane_only"],
        textExcerpt: "Aceitar todos Rejeitar todos Preferências",
        layerInspected: "first_layer",
        visibleChoiceLabels: ["Aceitar todos", "Rejeitar todos", "Preferências"],
        acceptControlObserved: true,
        rejectControlObserved: true,
        managePreferencesControlObserved: true,
        controls: [],
        evidenceRefs: [],
        confidence: 0.95,
      }],
      runtimeCoverage,
    }),
    policyEvidence: canonicalBundleFixture("scan-empty-consent"),
  });

  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "not_testable");
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "representative_pre_consent_screenshot_unavailable",
  ));
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "consent_control_inventory_incomplete",
  ));
  assert.deepEqual(
    merged.consentUiObservations,
    [],
    "runtime-lane consent-like observations must not fill an empty consent-proof lane",
  );
});

test("three-lane merge treats unretained moderated imagery as unavailable consent proof", () => {
  const withheldScreenshot: ScreenshotArtifact = {
    ...screenshotArtifact(
      "screenshot_pre_consent_settled",
      "/tmp/worker-consent/screenshot-pre-consent-settled.png",
    ),
    displayStatus: "withheld",
    displayWithheldReason: "safety_check_unavailable",
    retentionStatus: "withheld",
    safetyFailureCode: "finalization_deadline_exceeded",
    withheldReason: "safety_check_unavailable",
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-withheld-consent",
    scanId: "scan-withheld-consent",
    consentProof: canonicalBundleFixture("scan-withheld-consent", {
      homepageScreenshot: {
        status: "withheld",
        reason: "safety_check_unavailable",
        failureCode: "finalization_deadline_exceeded",
      },
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent-withheld")],
      screenshots: [withheldScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-withheld-consent", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-success")],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 1,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0,
        },
        silentEmpty: false,
      },
    }),
    policyEvidence: canonicalBundleFixture("scan-withheld-consent"),
  });

  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.equal(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "representative_pre_consent_screenshot_unavailable",
  ), true);
  assert.deepEqual(merged.homepageScreenshot, {
    status: "withheld",
    reason: "safety_check_unavailable",
    failureCode: "finalization_deadline_exceeded",
  });
});

test("three-lane merge keeps lane-local access failures limited when the independent required lane reached a representative page", () => {
  const usableRuntimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 4,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const unavailableRuntimeCoverage = {
    ...usableRuntimeCoverage,
    coverageStatus: "limited_none" as const,
    limitationKeys: ["navigation_transport_failure"],
  };
  const runtimeNoGo = terminalLaneNoGo("navigation_transport_failure");
  const runtimeVisualNoGo = terminalLaneVisualNoGo("navigation_transport_failure", "capture_failed");
  const consentScreenshot = screenshotArtifact(
    "screenshot_pre_consent_settled",
    "/tmp/worker-consent/screenshot-pre-consent-settled.png",
  );
  const runtimeFailed = {
    ...laneRunFixture("runtime_evidence", "invoke-runtime-failed"),
    firstHttpStatus: null,
    executionOutcome: "failed" as const,
    accessOutcome: "navigation_failed" as const,
  };

  const runtimeLimited = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-runtime-disagreement",
    scanId: "scan-runtime-disagreement",
    consentProof: canonicalBundleFixture("scan-runtime-disagreement", {
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent-success")],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-runtime-disagreement", {
      scanLaneRuns: [runtimeFailed],
      runtimeCoverage: unavailableRuntimeCoverage,
      scanNoGoAssessment: runtimeNoGo,
      scan_no_go_assessment: runtimeNoGo,
      visualAccessReview: runtimeVisualNoGo,
      visual_access_review: runtimeVisualNoGo,
    }),
    policyEvidence: canonicalBundleFixture("scan-runtime-disagreement"),
  });

  assert.equal(runtimeLimited.scanNoGoAssessment?.decision, "continue_with_diagnostics");
  assert.ok(runtimeLimited.scanNoGoAssessment?.contradictorCodes.includes(
    "independent_consent_proof_representative_page",
  ));
  assert.equal(runtimeLimited.visualAccessReview?.go_no_go, "NO_GO");
  assert.equal(runtimeLimited.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
  assert.equal(runtimeLimited.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "unusable");
  assert.ok(runtimeLimited.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "evidence_lane_access_disagreement",
  ));

  const consentNoGo = terminalLaneNoGo("blank_or_unusable_page");
  const consentVisualNoGo = terminalLaneVisualNoGo("blank_or_unusable_page", "blank_or_unusable");
  const consentBlocked = {
    ...laneRunFixture("consent_proof", "invoke-consent-blank"),
    accessOutcome: "blank_or_unusable" as const,
  };
  const consentLimited = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-consent-disagreement",
    scanId: "scan-consent-disagreement",
    consentProof: canonicalBundleFixture("scan-consent-disagreement", {
      scanLaneRuns: [consentBlocked],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
      scanNoGoAssessment: consentNoGo,
      scan_no_go_assessment: consentNoGo,
      visualAccessReview: consentVisualNoGo,
      visual_access_review: consentVisualNoGo,
    }),
    runtimeEvidence: canonicalBundleFixture("scan-consent-disagreement", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-success")],
      runtimeCoverage: usableRuntimeCoverage,
    }),
    policyEvidence: canonicalBundleFixture("scan-consent-disagreement"),
  });

  assert.equal(consentLimited.scanNoGoAssessment?.decision, "continue_with_diagnostics");
  assert.ok(consentLimited.scanNoGoAssessment?.contradictorCodes.includes(
    "independent_runtime_evidence_representative_page",
  ));
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "usable");
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.deepEqual(
    consentLimited.consentUiObservations,
    [],
    "runtime success must not synthesize consent controls for the limited consent-proof lane",
  );

  const bothLanesNoGo = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-both-no-go",
    scanId: "scan-both-no-go",
    consentProof: canonicalBundleFixture("scan-both-no-go", {
      scanLaneRuns: [consentBlocked],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
      scanNoGoAssessment: consentNoGo,
      scan_no_go_assessment: consentNoGo,
      visualAccessReview: consentVisualNoGo,
      visual_access_review: consentVisualNoGo,
    }),
    runtimeEvidence: canonicalBundleFixture("scan-both-no-go", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-no-go")],
      runtimeCoverage: usableRuntimeCoverage,
      scanNoGoAssessment: runtimeNoGo,
      scan_no_go_assessment: runtimeNoGo,
      visualAccessReview: runtimeVisualNoGo,
      visual_access_review: runtimeVisualNoGo,
    }),
    policyEvidence: canonicalBundleFixture("scan-both-no-go"),
  });

  assert.equal(bothLanesNoGo.scanNoGoAssessment?.decision, "no_go");
  assert.notEqual(bothLanesNoGo.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
});

test("sharded bundle merge retains exactly one diagnostic screenshot", () => {
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1", {
      screenshots: [
        screenshotArtifact("screenshot_pre_consent", "scan-local-1/screenshot-pre-consent.png"),
        screenshotArtifact("screenshot_pre_consent_settled", "scan-local-1/screenshot-pre-consent-settled.png")
      ]
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
  assert.equal(merged.screenshots[0]?.artifactId, "screenshot_pre_consent_settled");
});

test("sharded bundle merge keeps the fetched policy observation over its earlier link candidate", () => {
  const candidate = {
    observationId: "policy_surface_privacy",
    surfaceType: "privacy_policy" as const,
    url: "https://example.com/privacy",
    normalizedUrl: "https://example.com/privacy",
    status: "observed" as const,
    documentFetchState: "not_attempted" as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const fetched = {
    ...candidate,
    status: "fetched" as const,
    documentFetchState: "fetched" as const,
    documentEvaluationState: "usable" as const,
    documentRole: "policy_document" as const,
    targetRelationship: "target_controller" as const,
    contentCoverage: {
      status: "complete" as const,
      sourceTextChars: 1_200,
      extractedSectionCount: 3,
      retainedSectionCount: 3,
      retainedTableRowCount: 0,
      limitationKeys: [],
    },
    documentTextCoverage: {
      status: "complete" as const,
      sourceTextChars: 1_200,
      retainedTextChars: 1_200,
      limitationKeys: [],
    },
    textExcerpt: "This privacy policy explains how we process and retain personal information.",
    artifactRefs: [{
      artifactId: "policy_surface_text_privacy",
      artifactType: "other" as const,
      path: "policy_surface_text_privacy.txt",
    }],
  };
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1", { policySurfaceObservations: [candidate] }),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_policy", { policySurfaceObservations: [fetched] }),
    ],
  });

  assert.equal(merged.policySurfaceObservations.length, 1);
  assert.equal(merged.policySurfaceObservations[0]?.status, "fetched");
  assert.equal(merged.policySurfaceObservations[0]?.documentEvaluationState, "usable");
  assert.equal(merged.policySurfaceObservations[0]?.artifactRefs.length, 1);
  assert.equal(merged.policySurfaceObservations[0]?.targetRelationship, "target_controller");
  assert.equal(
    merged.policySurfaceObservations[0]?.governingPolicySelection?.state,
    "primary",
  );
});

test("artifact uploader returns durable metadata for all v2 JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.entries(files).map(([name, filePath]) => writeFile(filePath, JSON.stringify({ name }), "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-1",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const puts: Array<{ bucket: string | undefined; key: string | undefined }> = [];

  const metadata = await uploadArtifactFiles({
    ...files,
    payload: validPayload(),
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

  assert.equal(puts.length, 2);
  assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
  assert.ok(puts.some((put) => put.key?.endsWith("/CanonicalEvidenceBundle.json")));
  assert.ok(puts.some((put) => put.key?.endsWith("/LocalV2DagLambdaManifest.json")));
  assert.equal(typeof metadata.scanArtifactUri?.sha256, "string");
  assert.ok((metadata.scanArtifactUri?.sizeBytes ?? 0) > 0);
  assert.equal(metadata.reviewArtifactUri, undefined);
  assert.equal(metadata.reportAdapterArtifactUri, undefined);
});

test("artifact uploader retries a stalled canonical upload", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-upload-retry-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.values(files).map((filePath) => writeFile(filePath, "{}", "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-retry",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  let sends = 0;

  const metadata = await uploadArtifactFiles({
    ...files,
    attemptTimeoutMs: 15,
    fields: ["scanArtifactUri"],
    maxAttempts: 2,
    payload: validPayload(),
    pointers,
    s3Client: {
      async send() {
        sends += 1;
        if (sends === 1) return await new Promise(() => undefined);
        return { $metadata: {} };
      }
    }
  });

  assert.equal(sends, 2);
  assert.ok(metadata.scanArtifactUri);
});

test("artifact uploader can upload scan and manifest JSON independently for overlapped handoff", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-split-upload-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.entries(files).map(([name, filePath]) => writeFile(filePath, JSON.stringify({ name }), "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-split",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const puts: string[] = [];
  const s3Client = {
    async send(command: PutObjectCommand) {
      puts.push(command.input.Key ?? "");
      return { $metadata: {} };
    }
  };

  const scanMetadata = await uploadArtifactFiles({
    ...files,
    fields: ["scanArtifactUri"],
    payload: validPayload(),
    pointers,
    s3Client
  });
  const manifestMetadata = await uploadArtifactFiles({
    ...files,
    fields: ["manifestUri"],
    payload: validPayload(),
    pointers,
    s3Client
  });

  assert.deepEqual(puts.map((key) => path.basename(key)), [
    "CanonicalEvidenceBundle.json",
    "LocalV2DagLambdaManifest.json"
  ]);
  assert.ok(scanMetadata.scanArtifactUri);
  assert.equal(scanMetadata.manifestUri, undefined);
  assert.ok(manifestMetadata.manifestUri);
  assert.equal(manifestMetadata.scanArtifactUri, undefined);
});

test("auxiliary uploader returns durable metadata for bounded internal JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-aux-test-"));
  await writeFile(path.join(tmp, "CanonicalEvidenceBundle.json"), JSON.stringify({ core: true }), "utf8");
  await writeFile(path.join(tmp, "ConsentControlGeometryEvidence.json"), JSON.stringify({ artifactOnly: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_plan.json"), JSON.stringify({ plan: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_execution.json"), JSON.stringify({ execution: true }), "utf8");
  await writeFile(path.join(tmp, "policy_surface_text_fixture.txt"), "bounded retained privacy policy text", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent.png"), "not-json", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent-geometry-proof.png"), "not-json", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent-full-page.jpg"), "not-a-real-jpeg", "utf8");
  const puts: Array<{ bucket: string | undefined; contentType: string | undefined; key: string | undefined }> = [];
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
            contentType: command.input.ContentType,
            key: command.input.Key
          });
          return { $metadata: {} };
        }
      }
    });

    assert.equal(artifacts.length, 7);
    assert.deepEqual(artifacts.map((artifact) => artifact.fileName), [
      "ConsentControlGeometryEvidence.json",
      "consent_scenario_execution.json",
      "consent_scenario_plan.json",
      "policy_surface_text_fixture.txt",
      "screenshot-pre-consent-full-page.jpg",
      "screenshot-pre-consent-geometry-proof.png",
      "screenshot-pre-consent.png"
    ]);
    assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
    assert.ok(puts.every((put) => put.key?.includes("/auxiliary/")));
    assert.equal(
      puts.find((put) => put.key?.endsWith("/screenshot-pre-consent-full-page.jpg"))?.contentType,
      "image/jpeg"
    );
    assert.equal(
      puts.find((put) => put.key?.endsWith("/screenshot-pre-consent-geometry-proof.png"))?.contentType,
      "image/png"
    );
    assert.equal(
      puts.find((put) => put.key?.endsWith("/policy_surface_text_fixture.txt"))?.contentType,
      "text/plain; charset=utf-8"
    );
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
    scanLaneRuns: [],
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

function collectionSurfaceInventoryFixture(title: string): NonNullable<CanonicalEvidenceBundle["collectionSurfaceInventory"]> {
  return {
    contractVersion: "certscore.collection-surface-inventory.v1",
    inventoryId: `inventory-${title}`,
    sourceLane: "runtime_evidence",
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    observedAtMs: 100,
    consentStateAtTime: "pre_consent",
    pageUrl: "https://example.com/",
    coverage: {
      status: "complete",
      documentScope: "main_document",
      interactionMode: "none",
      candidateFormCount: 1,
      retainedFormCount: 1,
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      inspectedFormCandidateCount: 1,
      inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false,
      retentionTruncated: false,
      reasonCodes: [],
    },
    forms: [{
      formRef: "form-0",
      structure: "native_form",
      surfaceType: "contact",
      title,
      pageUrl: "https://example.com/",
      method: "post",
      actionRelationship: "self",
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      fieldsTruncated: false,
      fields: [{
        fieldRef: "field-0",
        elementType: "input",
        inputType: "email",
        semanticCategory: "email",
        label: "Email",
        required: true,
        disabled: false,
        readOnly: false,
        evidenceRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      }],
      evidenceRefs: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function laneRunFixture(
  laneId: CanonicalEvidenceBundle["scanLaneRuns"][number]["laneId"],
  physicalInvocationId: string,
): CanonicalEvidenceBundle["scanLaneRuns"][number] {
  const policyLane = laneId === "policy_evidence";
  return {
    laneId,
    physicalInvocationId,
    region: "eu-west-1",
    phaseName: policyLane ? "policySurfaceScanner" : "preConsentRuntimeScanner",
    startedAt: "2026-06-15T18:00:00.000Z",
    firstResponseAt: "2026-06-15T18:00:00.100Z",
    firstResponseOffsetMs: 100,
    firstHttpStatus: 200,
    firstEffectiveUrl: "https://example.com/",
    navigationCount: 1,
    navigationAttempts: [],
    challengeDetected: false,
    challengeType: null,
    executionOutcome: "success",
    accessOutcome: "representative_page",
    completedAt: "2026-06-15T18:00:01.000Z",
    durationMs: 1_000,
  };
}

function terminalLaneNoGo(
  reasonCode: string,
): NonNullable<CanonicalEvidenceBundle["scanNoGoAssessment"]> {
  return {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    scanNoGoConfidence: 0.92,
    reasonCodes: [reasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: ["lane_local_terminal_evidence"],
    contradictorCodes: [],
    supportingSignals: {
      retainedVisualArtifactAvailable: reasonCode !== "navigation_transport_failure",
    },
    evidenceRefs: ["scan_runtime_artifacts.scan_no_go_assessment"],
  };
}

function terminalLaneVisualNoGo(
  reasonCode: string,
  pageState: NonNullable<CanonicalEvidenceBundle["visualAccessReview"]>["page_state"],
): NonNullable<CanonicalEvidenceBundle["visualAccessReview"]> {
  return {
    artifact_ref: null,
    confidence: 0.92,
    go_no_go: "NO_GO",
    key_visual_evidence: ["Lane-local evidence did not retain a representative public page."],
    page_state: pageState,
    reason_code: reasonCode,
    short_explanation: "Lane-local evidence did not retain a representative public page.",
    status: "missing_visual_artifact",
    version: "visual-access-review-v1",
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
    retentionStatus: "available",
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
