import { GetObjectCommand } from "@aws-sdk/client-s3";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import {
  getLambdaResultTargetEnvironment,
  getManualSmokeResultScanId,
  isRecoverableLateResultFailure,
  mirrorLocalV2DagLambdaArtifacts,
  parseLambdaResultMessage,
  productionArtifactChainRejectReason,
  verifyProductionArtifactChain,
} from "./local-v2-dag-lambda-results";

test("validation worker mirrors completed local Lambda artifacts and auxiliary screenshots", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-worker-v2-mirror-"));
  const auxiliaryBody = Buffer.from(JSON.stringify({ policy: "bounded" }));
  const policyTextBody = Buffer.from("bounded retained privacy policy text");
  const screenshotBody = Buffer.from("png-body");
  const fullPageScreenshotBody = Buffer.from("jpeg-body");
  const objects = new Map([
    ["v2/scan-1/LocalV2DagLambdaManifest.json", Buffer.from(JSON.stringify({
      auxiliaryArtifacts: [
        {
          fileName: "policy-summary.json",
          sha256: createHash("sha256").update(auxiliaryBody).digest("hex"),
          sizeBytes: auxiliaryBody.byteLength,
          uri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/auxiliary/policy-summary.json"
        },
        {
          fileName: "policy_surface_text_fixture.txt",
          sha256: createHash("sha256").update(policyTextBody).digest("hex"),
          sizeBytes: policyTextBody.byteLength,
          uri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/auxiliary/policy_surface_text_fixture.txt"
        },
        {
          fileName: "screenshot-pre-consent.png",
          sha256: createHash("sha256").update(screenshotBody).digest("hex"),
          sizeBytes: screenshotBody.byteLength,
          uri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/auxiliary/screenshot-pre-consent.png"
        },
        {
          fileName: "screenshot-pre-consent-full-page.jpg",
          sha256: createHash("sha256").update(fullPageScreenshotBody).digest("hex"),
          sizeBytes: fullPageScreenshotBody.byteLength,
          uri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/auxiliary/screenshot-pre-consent-full-page.jpg"
        }
      ]
    }))],
    ["v2/scan-1/CanonicalEvidenceBundle.json", Buffer.from(JSON.stringify({
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      screenshots: []
    }))],
    ["v2/scan-1/auxiliary/policy-summary.json", auxiliaryBody],
    ["v2/scan-1/auxiliary/policy_surface_text_fixture.txt", policyTextBody],
    ["v2/scan-1/auxiliary/screenshot-pre-consent.png", screenshotBody],
    ["v2/scan-1/auxiliary/screenshot-pre-consent-full-page.jpg", fullPageScreenshotBody]
  ]);
  const mirror = await mirrorLocalV2DagLambdaArtifacts({
    parsedMessage: {
      artifactPointers: {
        manifestUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/LocalV2DagLambdaManifest.json",
        scanArtifactUri: "s3://certscore-v2-dag-local-artifacts-eu-west-1-199536052647/v2/scan-1/CanonicalEvidenceBundle.json"
      },
      completedAt: "2026-06-19T16:00:00.000Z",
      scanId: "scan-1",
      status: "completed",
      targetEnvironment: "local"
    },
    s3Client: {
      async send(command: GetObjectCommand) {
        assert.equal(command.input.Bucket, "certscore-v2-dag-local-artifacts-eu-west-1-199536052647");
        const body = objects.get(String(command.input.Key));
        assert.ok(body, `missing fixture object ${String(command.input.Key)}`);
        return {
          $metadata: {},
          Body: Readable.from([body]) as never
        };
      }
    },
    workspaceRoot
  });

  assert.ok(mirror);
  assert.equal(mirror.mirroredArtifacts.length, 6);
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-1/screenshot-pre-consent.png"), "utf8"),
    "png-body"
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-1/screenshot-pre-consent-full-page.jpg"), "utf8"),
    "jpeg-body"
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-1/policy-summary.json"), "utf8"),
    JSON.stringify({ policy: "bounded" })
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-1/policy_surface_text_fixture.txt"), "utf8"),
    "bounded retained privacy policy text"
  );
});

test("validation worker identifies manual Lambda smoke results for queue cleanup", async () => {
  assert.equal(
    getManualSmokeResultScanId(JSON.stringify({ scanId: "manual-cnn-ec2-proxy-ua-15s-final-1781997291" })),
    "manual-cnn-ec2-proxy-ua-15s-final-1781997291"
  );
  assert.equal(
    getManualSmokeResultScanId(JSON.stringify({ scanId: "postdeploy-cnn-eu-ie-proxy-123" })),
    "postdeploy-cnn-eu-ie-proxy-123"
  );
  assert.equal(
    getManualSmokeResultScanId(JSON.stringify({ scanId: "aro-gate-adversarial-zeit-de-1782705130742" })),
    "aro-gate-adversarial-zeit-de-1782705130742"
  );
  assert.equal(
    getManualSmokeResultScanId(JSON.stringify({
      scanId: "regional-vpc-parity-us-west-2-example-com-123"
    })),
    "regional-vpc-parity-us-west-2-example-com-123"
  );
  assert.equal(
    getManualSmokeResultScanId(JSON.stringify({
      resultPurpose: "synthetic_verification",
      scanId: "bounded-verification-id"
    })),
    "bounded-verification-id"
  );
  assert.equal(getManualSmokeResultScanId(JSON.stringify({ scanId: "49037835-190b-4e67-9fe2-426d51d55069" })), null);
});

test("validation worker identifies wrong-target Lambda results for immediate release", async () => {
  assert.equal(getLambdaResultTargetEnvironment(JSON.stringify({ targetEnvironment: "production" })), "production");
  assert.equal(getLambdaResultTargetEnvironment(JSON.stringify({ targetEnvironment: "local" })), "local");
  assert.equal(getLambdaResultTargetEnvironment(JSON.stringify({ targetEnvironment: "staging" })), null);
});

test("production result handoff requires verifiable canonical artifact pointers", () => {
  const valid = {
    artifactMetadata: {
      manifestUri: { sha256: "a".repeat(64), sizeBytes: 100 },
      scanArtifactUri: { sha256: "b".repeat(64), sizeBytes: 200 }
    },
    artifactPointers: {
      manifestUri: "s3://certscore-artifacts/scan/LocalV2DagLambdaManifest.json",
      scanArtifactUri: "s3://certscore-artifacts/scan/CanonicalEvidenceBundle.json"
    }
  };

  assert.equal(productionArtifactChainRejectReason(valid), null);
  assert.match(productionArtifactChainRejectReason({
    ...valid,
    artifactMetadata: {
      ...valid.artifactMetadata,
      scanArtifactUri: { sha256: "bad", sizeBytes: 200 }
    }
  }) ?? "", /SHA-256/);
  assert.match(productionArtifactChainRejectReason({
    ...valid,
    artifactPointers: {
      ...valid.artifactPointers,
      manifestUri: "https://example.test/manifest.json"
    }
  }) ?? "", /s3:\/\//);
});

test("production result handoff verifies retained bytes and scan identity before state recovery", async () => {
  const scanId = "fca91cbb-cb56-4d8b-8056-a94d5472bf86";
  const manifest = Buffer.from(JSON.stringify({
    processor: "local-certscore-v2-dag-parallel-v1",
    scanId,
    targetEnvironment: "production",
  }));
  const bundle = Buffer.from(JSON.stringify({ scanId, schemaVersion: "certscore.v2.alpha.1" }));
  const parsed = parseLambdaResultMessage(JSON.stringify({
    artifactOnly: true,
    artifactMetadata: {
      manifestUri: { sha256: createHash("sha256").update(manifest).digest("hex"), sizeBytes: manifest.byteLength },
      scanArtifactUri: { sha256: createHash("sha256").update(bundle).digest("hex"), sizeBytes: bundle.byteLength },
    },
    artifactPointers: {
      manifestUri: "s3://certscore-artifacts/scan/LocalV2DagLambdaManifest.json",
      scanArtifactUri: "s3://certscore-artifacts/scan/CanonicalEvidenceBundle.json",
    },
    completedAt: "2026-08-05T18:03:42.182Z",
    contractVersion: "certscore.v2.lambda-dag-result.v1",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    scanId,
    status: "completed",
    targetEnvironment: "production",
  }), "production");
  const objects = new Map([
    ["scan/LocalV2DagLambdaManifest.json", manifest],
    ["scan/CanonicalEvidenceBundle.json", bundle],
  ]);
  const verified = await verifyProductionArtifactChain(parsed, {
    async send(command: GetObjectCommand) {
      const body = objects.get(String(command.input.Key));
      assert.ok(body);
      return { $metadata: {}, Body: Readable.from([body]) as never, ContentLength: body.byteLength };
    },
  });

  assert.equal(verified?.manifest.sizeBytes, manifest.byteLength);
  assert.equal(verified?.scanArtifact.sizeBytes, bundle.byteLength);

  await assert.rejects(
    verifyProductionArtifactChain(parsed, {
      async send(command: GetObjectCommand) {
        const body = objects.get(String(command.input.Key));
        assert.ok(body);
        const retained = String(command.input.Key).endsWith("CanonicalEvidenceBundle.json")
          ? Buffer.from(body.toString("utf8").replace(scanId, "00000000-0000-0000-0000-000000000000"))
          : body;
        return { $metadata: {}, Body: Readable.from([retained]) as never, ContentLength: retained.byteLength };
      },
    }),
    /content length|checksum or size/,
  );
});

test("late results recover only typed transient control-plane failures", () => {
  assert.equal(isRecoverableLateResultFailure("ops.scan_marked_failed", {
    reason: "lambda_terminal_result_absent_after_execution_deadline",
  }), true);
  assert.equal(isRecoverableLateResultFailure("v2_lambda_dispatch.failed", {
    dispatchState: "uncertain",
  }), true);
  assert.equal(isRecoverableLateResultFailure("ops.scan_marked_failed", {
    reason: "manual_operator_failure",
  }), false);
  assert.equal(isRecoverableLateResultFailure("v2_lambda_dispatch.failed", {
    dispatchState: "failed",
  }), false);
});

test("validation worker retains bounded scanner runtime provenance from Lambda results", () => {
  const result = parseLambdaResultMessage(JSON.stringify({
    artifactOnly: true,
    artifactMetadata: {
      manifestUri: { sha256: "a".repeat(64), sizeBytes: 100 },
      scanArtifactUri: { sha256: "b".repeat(64), sizeBytes: 200 }
    },
    artifactPointers: {
      manifestUri: "s3://certscore-artifacts/scan/LocalV2DagLambdaManifest.json",
      scanArtifactUri: "s3://certscore-artifacts/scan/CanonicalEvidenceBundle.json"
    },
    completedAt: "2026-07-23T15:48:45.112Z",
    contractVersion: "certscore.v2.lambda-dag-result.v1",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    policyEvidence: {
      artifactMetadata: { sha256: "e".repeat(64), sizeBytes: 321 },
      artifactOnly: true,
      artifactPointer: "s3://certscore-artifacts/scan/VerifiedPolicyEvidencePacket.json",
      contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1",
      generatedAt: "2026-07-23T15:48:40.000Z",
      messageKind: "policy_evidence_ready",
      policyContentHash: "f".repeat(64),
      processor: "local-certscore-v2-dag-parallel-v1",
      productionFindingIntegration: false,
      scanId: "fca91cbb-cb56-4d8b-8056-a94d5472bf86",
      sourceHash: "1".repeat(64),
      targetEnvironment: "production"
    },
    scanId: "fca91cbb-cb56-4d8b-8056-a94d5472bf86",
    scannerRuntimeProvenance: {
      awsRegion: "eu-west-1",
      dispatchVpcMode: "vpc",
      egressId: "aws-nat:eu-west-1:eipalloc-0123456789abcdef0",
      egressProvider: "aws-nat-gateway",
      functionVersion: "$LATEST",
      imageDigest: `sha256:${"c".repeat(64)}`,
      publicIpHash: `sha256:${"d".repeat(64)}`,
      runtimeVpcMode: "vpc"
    },
    status: "completed",
    targetEnvironment: "production"
  }), "production");

  assert.deepEqual(result.scannerRuntimeProvenance, {
    awsRegion: "eu-west-1",
    dispatchVpcMode: "vpc",
    egressId: "aws-nat:eu-west-1:eipalloc-0123456789abcdef0",
    egressProvider: "aws-nat-gateway",
    functionVersion: "$LATEST",
    imageDigest: `sha256:${"c".repeat(64)}`,
    publicIpHash: `sha256:${"d".repeat(64)}`,
    runtimeVpcMode: "vpc"
  });
  assert.deepEqual(result.policyEvidence, {
    artifactMetadata: { sha256: "e".repeat(64), sizeBytes: 321 },
    artifactOnly: true,
    artifactPointer: "s3://certscore-artifacts/scan/VerifiedPolicyEvidencePacket.json",
    contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1",
    generatedAt: "2026-07-23T15:48:40.000Z",
    messageKind: "policy_evidence_ready",
    policyContentHash: "f".repeat(64),
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    scanId: "fca91cbb-cb56-4d8b-8056-a94d5472bf86",
    sourceHash: "1".repeat(64),
    targetEnvironment: "production"
  });
});

test("validation worker persists scanner provenance before score materialization", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /scannerRuntimeProvenance:\s*parsedMessage\.scannerRuntimeProvenance/);
  assert.match(source, /egress_id = coalesce\(\$5, egress_id\)/);
  assert.match(source, /'runtimeProvenance', \$7::jsonb/);
  assert.match(source, /public_ip_hash = coalesce\(\$4, public_ip_hash\)/);
  const scoreIndex = source.indexOf("await ensureCompletedScanScoresPersisted");
  const snapshotIndex = source.indexOf("await persistScannerRuntimeSnapshot", scoreIndex);
  assert.ok(snapshotIndex > scoreIndex, "snapshot provenance must be persisted after score materialization creates the row");
});

test("validation worker Lambda result poller retains leases and bounds result concurrency", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /ChangeMessageVisibilityCommand/);
  assert.match(source, /VisibilityTimeout:\s*0/);
  assert.match(source, /RESULT_VISIBILITY_TIMEOUT_SECONDS\s*=\s*240/);
  assert.match(source, /MATERIALIZATION_FINALIZING_WAIT_MS\s*=\s*150_000/);
  assert.match(source, /MATERIALIZATION_INPUT_POLL_MS\s*=\s*250/);
  assert.match(source, /await waitForCanonicalReportInputs\(input\.scanId, finalizingDeadline\)/);
  assert.match(source, /signals\.merge_completed/);
  assert.match(source, /findings\.unified_derivation_completed/);
  assert.match(source, /failure\?\.code === "materialization_not_ready"/);
  assert.match(source, /await sleep\(MATERIALIZATION_RETRY_MS\)/);
  assert.match(source, /RESULT_BATCH_CONCURRENCY\s*=\s*3/);
  assert.match(source, /RESULT_QUEUE_POLL_CONCURRENCY\s*=\s*2/);
  assert.match(source, /RESULT_FINALIZATION_BACKGROUND_CONCURRENCY\s*=\s*2/);
  assert.match(source, /MaxNumberOfMessages:\s*RESULT_BATCH_CONCURRENCY/);
  assert.match(source, /mapWithConcurrency\(messages, RESULT_BATCH_CONCURRENCY/);
  assert.match(source, /classifyV2DagLambdaResultDisposition\(rawMessage\)/);
  assert.match(source, /acknowledged non-persistable v2 DAG Lambda result/);
  assert.match(source, /rejected invalid v2 DAG Lambda result identity/);
  assert.match(source, /async function loopQueue\(queueUrl: string\)/);
  assert.match(source, /for \(const queueUrl of queueUrls\)/);
  assert.match(source, /pollIndex < RESULT_QUEUE_POLL_CONCURRENCY/);
  assert.match(source, /startCompletedResultFinalization/);
  assert.match(source, /resultFinalizationBackgroundTasks/);
  assert.doesNotMatch(source, /Promise\.all\(queueUrls\.map/);
});

test("validation worker frees result poll capacity after retaining the terminal result", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const resultIndex = source.indexOf("await recordLocalV2DagLambdaResult");
  const durableDeleteIndex = source.indexOf("new DeleteMessageCommand", resultIndex);
  const finalizationStartIndex = source.indexOf("startCompletedResultFinalization", resultIndex);
  const finalizationBodyIndex = source.indexOf("function startCompletedResultFinalization", finalizationStartIndex);
  const policyIndex = source.indexOf("await processEmbeddedPolicyEvidenceBeforeScoreMaterialization", finalizationBodyIndex);
  const scoreIndex = source.indexOf("await ensureCompletedScanScoresPersisted", policyIndex);

  assert.ok(resultIndex >= 0, "expected terminal result retention");
  assert.ok(durableDeleteIndex > resultIndex, "durably retained results must be acknowledged");
  assert.ok(durableDeleteIndex < finalizationStartIndex, "SQS acknowledgement must not wait for report materialization");
  assert.ok(finalizationStartIndex > resultIndex, "slow downstream work must start after terminal retention");
  assert.ok(finalizationBodyIndex > finalizationStartIndex, "expected bounded background finalization");
  assert.ok(policyIndex > finalizationBodyIndex, "policy evidence remains ahead of score materialization");
  assert.ok(scoreIndex > policyIndex, "score materialization remains canonical downstream work");
  assert.match(source, /reconcilePersistedCompletedResultFinalizations/);
  assert.match(source, /artifactVerification,verifiedAt/);
  assert.match(source, /coalesce\(request\.attempt_count, 0\) asc/);
  assert.match(source, /coalesce\(request\.requested_at, result\.result_created_at\) asc/);
  assert.doesNotMatch(source, /order by result\.scan_id, result\.created_at desc\s+limit 25/);
});

test("validation worker owns projection finalization across the result-to-findings race", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const start = source.indexOf("async function startCompletedResultFinalization");
  const wait = source.indexOf("await waitForCanonicalReportInputs(", start);
  const slot = source.indexOf("await withResultFinalizationSlot", wait);
  const materialize = source.indexOf("await ensureCompletedScanScoresPersisted", slot);
  const functionBody = source.slice(start, source.indexOf("async function mapWithConcurrency", start));

  assert.ok(wait > start, "terminal retention must schedule a wait for canonical findings");
  assert.ok(slot > wait, "completed inputs must enter bounded finalization capacity");
  assert.ok(materialize > slot, "worker-owned materialization must follow canonical input readiness");
  assert.doesNotMatch(functionBody, /resultFinalizationBackgroundTasks\.size\s*>=/);
  assert.doesNotMatch(functionBody, /!\(await canonicalReportInputsReady/);
  assert.match(source, /resultFinalizationSlotWaiters/);
});

test("validation worker runtime overlays the current policy evidence contract and terminates malformed packets", async () => {
  const [dockerfile, source] = await Promise.all([
    readFile("apps/validation-worker/Dockerfile", "utf8"),
    readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8"),
  ]);

  assert.match(
    dockerfile,
    /COPY --from=build \/app\/packages\/certscore-contracts\/dist \.\/node_modules\/@certscore\/contracts\/dist/,
  );
  assert.match(dockerfile, /verifiedPolicyEvidencePacketSchema\?\.parse/);
  assert.match(source, /packet_contract_invalid/);
  assert.match(source, /v2_policy_evidence\.rejected/);
  const terminalBranch = source.indexOf("error instanceof TerminalEarlyPolicyEvidenceError");
  const terminalDelete = source.indexOf("new DeleteMessageCommand", terminalBranch);
  const transientLog = source.indexOf("early policy evidence message rejected", terminalBranch);
  assert.ok(terminalBranch >= 0, "expected terminal early-policy failure classification");
  assert.ok(terminalDelete > terminalBranch, "terminal malformed packets must be acknowledged");
  assert.ok(transientLog > terminalDelete, "transient failures must remain retryable");
});

test("validation worker durably retains results before acknowledgement and materializes only ready projections", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const resultIndex = source.indexOf("await recordLocalV2DagLambdaResult");
  const deleteIndex = source.indexOf("new DeleteMessageCommand", resultIndex);
  const readinessIndex = source.indexOf("await canonicalReportInputsReady(input.scanId)");
  const tokenIndex = source.indexOf("const token = randomBytes(32)", readinessIndex);
  const requestIndex = source.indexOf("insert into public.scan_score_materialization_requests", tokenIndex);
  const ensureIndex = source.indexOf("await ensureCompletedScanScoresPersisted");

  assert.ok(deleteIndex > resultIndex, "SQS acknowledgement must follow durable result retention");
  assert.ok(deleteIndex < ensureIndex, "SQS acknowledgement must not be coupled to downstream materialization");
  assert.ok(readinessIndex >= 0, "expected canonical report-input readiness gating");
  assert.ok(tokenIndex > readinessIndex, "materialization authorization must follow canonical input readiness");
  assert.ok(requestIndex > tokenIndex, "materialization requests must not be created before canonical input readiness");
  assert.ok(ensureIndex >= 0, "expected completion-time score persistence");
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /scan_score_materialization_requests/);
  assert.match(source, /result\.complete !== true/);
  assert.match(source, /scoreMaterializationState/);
  assert.match(source, /status = 'completed'/);
  assert.match(source, /for \(const mode of \["publish_report", "finalize"\] as const\)/);
  assert.match(source, /result\.reportReady !== true/);
  assert.doesNotMatch(source, /async function completedScoreMaterializationExists[\s\S]*?scan_score_assessments/);
  assert.match(source, /response\.status === 422 && failure\?\.retryable === false/);
  assert.match(source, /terminal score materialization failure acknowledged/);
  assert.match(source, /existingState === "terminal_failure"/);
  assert.match(source, /claimedState === "terminal_failure"/);
  assert.match(source, /where public\.scan_score_materialization_requests\.status = 'pending'/);
  assert.doesNotMatch(source, /status <> 'completed'/);
});

test("validation worker records terminal completion before consuming embedded policy evidence", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const resultIndex = source.indexOf("await recordLocalV2DagLambdaResult");
  const fallbackIndex = source.indexOf("await processEmbeddedPolicyEvidenceBeforeScoreMaterialization", resultIndex);
  const scoreIndex = source.indexOf("await ensureCompletedScanScoresPersisted", fallbackIndex);

  assert.ok(fallbackIndex >= 0, "expected terminal message policy-evidence fallback");
  assert.ok(fallbackIndex > resultIndex, "terminal retention must not wait for semantic review");
  assert.ok(scoreIndex > fallbackIndex, "static review must be available before canonical score materialization");
  assert.match(source, /policyEvidenceProcessingInFlight/);
  assert.match(source, /policyEvidenceBackgroundTasks/);
  assert.match(source, /POLICY_EVIDENCE_BACKGROUND_CONCURRENCY\s*=\s*2/);
});

test("validation worker synchronizes linked API activity before acknowledging a Lambda result", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const pulseUpdateIndex = source.indexOf("update pulse_requests");
  const resultIndex = source.indexOf("await recordLocalV2DagLambdaResult");
  const deleteIndex = source.indexOf("new DeleteMessageCommand", resultIndex);
  const scoreIndex = source.indexOf("await ensureCompletedScanScoresPersisted");

  assert.ok(pulseUpdateIndex >= 0, "expected linked API activity synchronization");
  assert.ok(scoreIndex > pulseUpdateIndex, "score materialization must observe synchronized terminal activity");
  assert.ok(deleteIndex > resultIndex, "SQS acknowledgement must follow retained result and API activity persistence");
  assert.ok(deleteIndex < scoreIndex, "downstream score work must not retain the SQS lease");
  assert.match(source, /status in \('queued', 'running', 'finalizing'\)/);
  assert.match(source, /elapsed_seconds = greatest/);
});

test("validation worker continuously reconciles accepted scans without terminal Lambda results", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /ORPHAN_RECONCILIATION_INTERVAL_MS\s*=\s*10_000/);
  assert.match(source, /ORPHAN_DELAY_AGE_MS\s*=\s*45_000/);
  assert.match(source, /ORPHAN_TERMINAL_AGE_MS\s*=\s*930_000/);
  assert.match(source, /v2_lambda_result\.delayed/);
  assert.match(source, /lambda_terminal_result_absent_after_execution_deadline/);
  assert.match(source, /for update of s skip locked/);
  assert.match(source, /void loopReconciliation\(\)/);
  assert.match(source, /v2_lambda_result\.received/);
  assert.match(source, /v2_lambda_result\.failed/);
});

test("validation worker records Lambda result event before marking scan completed", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const eventInsertIndex = source.indexOf("insert into scan_events");
  const scanCompletedIndex = source.indexOf("set completed_at = case when $3 = 'completed'");

  assert.ok(eventInsertIndex >= 0, "expected Lambda result event insert");
  assert.ok(scanCompletedIndex >= 0, "expected scan completion update");
  assert.ok(
    eventInsertIndex < scanCompletedIndex,
    "scan completion must happen after v2_lambda_result.received exists so completed-scan backfill can see evidence"
  );
});

test("validation worker uses verified S3 for production results and retains local diagnostic mirrors", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /shouldMirrorArtifacts\s*=\s*parsedMessage\.targetEnvironment\s*===\s*"local"/);
  assert.match(source, /productionReadMode:\s*"verified_s3"/);
  assert.match(source, /production_uses_verified_s3/);
  assert.match(source, /input\.parsedMessage\.status\s*!==\s*"completed"/);
});
