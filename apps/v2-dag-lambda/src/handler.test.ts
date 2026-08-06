import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  artifactPointersFromS3Keys,
  buildLocalV2DagLambdaResultMessage,
  buildVerifiedPolicyEvidencePacket,
  buildLocalV2DagLambdaRuntimeDiagnostics,
  buildScannerRuntimeProvenance,
  buildLocalV2DagLambdaScanTuning,
  handler,
  invokeLocalV2DagLambdaWorkers,
  mergeLocalV2DagLambdaEvidenceLaneBundles,
  mergeLocalV2DagLambdaShardBundles,
  mirrorWorkerArtifactsIntoFinalArtifactRoot,
  parseLocalV2DagLambdaDispatchPayload,
  sendLocalV2DagLambdaResultMessage,
  uploadAuxiliaryArtifactFiles,
  uploadArtifactFiles
} from "./handler";

test("sharded orchestration fans out exactly one consent, runtime, and policy evidence lane", () => {
  assert.deepEqual(LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES, [
    "consent_proof",
    "runtime_evidence",
    "policy_evidence",
  ]);
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

test("dedicated evidence workers preserve the standard profile module budget", async () => {
  let preConsentModuleDeadlineMs: number | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "runtime_evidence",
  }), {
    runArtifactChain: async (_payload, options) => {
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(
    preConsentModuleDeadlineMs,
    LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
  );
  assert.equal(preConsentModuleDeadlineMs, 35_000);
});

test("consent-proof workers reserve a bounded visual recovery window", async () => {
  let preConsentModuleDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineMs: number | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "consent_proof",
  }), {
    runArtifactChain: async (_payload, options) => {
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
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    policySurfaceSeeds: [
      { confidence: 4, hintType: "privacy_policy", source: "prior_scan_hint", url: "https://example.com/legal/privacy#section" },
      { hintType: "unrelated", source: "prior_scan_hint", url: "https://example.com/about" },
      { hintType: "cookie_policy", source: "unknown", url: "https://example.com/cookies" },
      { hintType: "privacy_policy", source: "prior_scan_hint", url: "javascript:alert(1)" }
    ]
  }));

  assert.deepEqual(parsed.policySurfaceSeeds, [{
    confidence: 1,
    hintType: "privacy_policy",
    source: "prior_scan_hint",
    url: "https://example.com/legal/privacy"
  }]);
});

test("handler accepts the approved regional Lambda dispatch targets", () => {
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({ awsRegion: "eu-central-1" })).awsRegion, "eu-central-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "eu-west-1",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results"
  })).awsRegion, "eu-west-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "us-west-2",
    resultQueueUrl: "https://sqs.us-west-2.amazonaws.com/123/certscore-v2-dag-usw-results"
  })).awsRegion, "us-west-2");
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
    /eu-central-1, eu-west-1, or us-west-2/
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
    assert.match(uploads[0]?.body ?? "", /certscore\.v2_lambda_failure_diagnostic\.1/);
    assert.match(uploads[0]?.body ?? "", /cancellationRequestedAt/);
    assert.match(uploads[0]?.body ?? "", /terminalPublicationReserveMs/);
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
  assert.equal(merged.screenshots[0]?.path, path.join(artifactRoot, "screenshot-pre-consent-settled.png"));
  assert.equal(merged.derivedRuntimeSignals.consentBannerLikelyPresent, true);
  assert.equal(merged.derivedRuntimeSignals.preConsentTrackingObserved, true);
  assert.equal(merged.runtimeCoverage?.coverageStatus, "usable");
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
    runtimeEvidence: canonicalBundleFixture("scan-empty-consent", { runtimeCoverage }),
    policyEvidence: canonicalBundleFixture("scan-empty-consent"),
  });

  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "not_testable");
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "representative_pre_consent_screenshot_unavailable",
  ));
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "consent_control_inventory_incomplete",
  ));
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
    targetRelationship: "target_controller" as const,
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
