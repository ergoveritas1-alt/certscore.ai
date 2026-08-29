import { GetObjectCommand } from "@aws-sdk/client-s3";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { VERIFIED_PRE_CONSENT_RUNTIME_PREVIEW_PACKET_VERSION } from "@certscore/contracts";
import {
  getLambdaResultTargetEnvironment,
  getManualSmokeResultScanId,
  isCanonicalResultFinalizationEligible,
  isRecoverableLateResultFailure,
  isRuntimePreviewReadyMessage,
  mirrorLocalV2DagLambdaArtifacts,
  parseLambdaResultMessage,
  productionArtifactChainRejectReason,
  verifyPreConsentRuntimePreviewPacket,
  verifyProductionArtifactChain,
  type LambdaRuntimePreviewMessage,
} from "./local-v2-dag-lambda-results";

test("validation worker verifies the preliminary runtime packet checksum, identity, contract, and source hash", () => {
  const scanId = "00000000-0000-4000-8000-000000000123";
  const unsignedPacket = {
    artifactOnly: true as const,
    contractVersion: VERIFIED_PRE_CONSENT_RUNTIME_PREVIEW_PACKET_VERSION,
    normalizedUrl: "https://example.com/",
    preview: {
      type: "certscore_pre_consent_preview" as const,
      resultStage: "preliminary" as const,
      final: false as const,
      sourceLane: "runtime_evidence" as const,
      generatedAt: "2026-08-28T18:00:03.000Z",
      runtimeCoverage: { status: "usable" as const, limitationKeys: [] },
      summary: { cookieCount: 1, trackerCount: 1, thirdPartyRequestCount: 1, vendorCount: 1 },
      cookies: [{
        name: "_ga",
        domain: "example.com",
        party: "first_party" as const,
        purpose: "analytics" as const,
        essentiality: "non_essential" as const,
        observedAtMs: 1_200,
      }],
      trackers: [{
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics" as const,
        confidence: 0.96,
        domains: ["www.google-analytics.com"],
      }],
      truncated: { cookies: false, trackers: false },
      mustContinuePolling: true as const,
      observationOnlyDisclaimer: "Preliminary passive observations only; continue polling for the canonical result.",
    },
    productionFindingIntegration: false as const,
    scanId,
  };
  const sourceHash = createHash("sha256").update(JSON.stringify(unsignedPacket)).digest("hex");
  const packet = { ...unsignedPacket, sourceHash };
  const body = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, "utf8");
  const message: LambdaRuntimePreviewMessage = {
    artifactMetadata: {
      sha256: createHash("sha256").update(body).digest("hex"),
      sizeBytes: body.byteLength,
    },
    artifactOnly: true,
    artifactPointer: "s3://certscore-production-artifacts/v2/scan/VerifiedPreConsentRuntimePreviewPacket.json",
    contractVersion: "certscore.v2.lambda-runtime-preview-ready.v1",
    generatedAt: packet.preview.generatedAt,
    messageKind: "runtime_preview_ready",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    scanId,
    sourceHash,
    targetEnvironment: "production",
  };

  assert.equal(isRuntimePreviewReadyMessage(JSON.stringify(message)), true);
  assert.deepEqual(verifyPreConsentRuntimePreviewPacket({ body, message }), packet);

  const invalidPacket = { ...packet, sourceHash: "0".repeat(64) };
  const invalidBody = Buffer.from(JSON.stringify(invalidPacket), "utf8");
  assert.throws(
    () => verifyPreConsentRuntimePreviewPacket({
      body: invalidBody,
      message: {
        ...message,
        artifactMetadata: {
          sha256: createHash("sha256").update(invalidBody).digest("hex"),
          sizeBytes: invalidBody.byteLength,
        },
        sourceHash: invalidPacket.sourceHash,
      },
    }),
    /source hash did not verify/,
  );
});

test("canonical result finalization accepts only verified production completions", () => {
  assert.equal(isCanonicalResultFinalizationEligible({
    artifactVerified: true,
    status: "completed",
    targetEnvironment: "local",
  }), false);
  assert.equal(isCanonicalResultFinalizationEligible({
    artifactVerified: false,
    status: "completed",
    targetEnvironment: "production",
  }), false);
  assert.equal(isCanonicalResultFinalizationEligible({
    artifactVerified: true,
    status: "failed",
    targetEnvironment: "production",
  }), false);
  assert.equal(isCanonicalResultFinalizationEligible({
    artifactVerified: true,
    status: "completed",
    targetEnvironment: "production",
  }), true);
});

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

test("terminal result parsing retains only a canonical parent dispatch checksum", () => {
  const message = {
    artifactOnly: true,
    completedAt: "2026-08-26T20:00:05.000Z",
    contractVersion: "certscore.v2.lambda-dag-result.v1",
    parentDispatchSha256: "a".repeat(64),
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    scanId: "scan-local-1",
    status: "completed",
    targetEnvironment: "local",
  };

  assert.equal(
    parseLambdaResultMessage(JSON.stringify(message), "local").parentDispatchSha256,
    message.parentDispatchSha256,
  );
  assert.throws(
    () => parseLambdaResultMessage(JSON.stringify({
      ...message,
      parentDispatchSha256: "not-a-canonical-sha",
    }), "local"),
    /parent dispatch checksum is invalid/,
  );
});

test("validation worker retains bounded four-lane timing telemetry for later cohort queries", async () => {
  const lanes = [
    ["consent_proof", 4_000, -1_000],
    ["runtime_evidence", 5_000, 0],
    ["policy_evidence", 3_000, -2_000],
    ["reject_observation", 6_200, 1_200],
  ].map(([lane, elapsedMs, deltaMs]) => ({
    coordinatorElapsedMs: elapsedMs,
    evidenceJoined: true,
    invocationStartedAt: "2026-08-26T20:00:00.000Z",
    lane,
    outcome: "completed",
    terminalOutcomeDeltaFromPassiveBarrierMs: deltaMs,
    terminalOutcomeObservedAt: new Date(Date.parse("2026-08-26T20:00:05.000Z") + Number(deltaMs)).toISOString(),
    workerReportedCompletedAt: new Date(Date.parse("2026-08-26T20:00:00.000Z") + Number(elapsedMs) - 50).toISOString(),
    workerReportedHandlerDurationMs: Number(elapsedMs) - 50,
  }));
  const parsed = parseLambdaResultMessage(JSON.stringify({
    artifactOnly: true,
    completedAt: "2026-08-26T20:00:06.250Z",
    contractVersion: "certscore.v2.lambda-dag-result.v1",
    laneTimingSummary: {
      contractVersion: "certscore.v2.lambda-lane-timing.v1",
      coordinatorStartedAt: "2026-08-26T20:00:00.000Z",
      generatedAt: "2026-08-26T20:00:06.250Z",
      lanes,
      maxRejectTailWaitMs: 6_000,
      passiveLaneBarrierCompletedAt: "2026-08-26T20:00:05.000Z",
      rejectCompletedBeforeOrAtPassiveBarrier: false,
      rejectLaneAddedWaitMs: 1_200,
      rejectLaneJoin: "joined",
      rejectTailDeltaMs: 1_200,
    },
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    scanId: "scan-lane-timing-1",
    status: "completed",
    targetEnvironment: "local",
  }), "local");

  assert.equal(parsed.laneTimingSummary?.lanes.length, 4);
  assert.equal(parsed.laneTimingSummary?.rejectTailDeltaMs, 1_200);
  assert.equal(parsed.laneTimingSummary?.rejectLaneAddedWaitMs, 1_200);
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  assert.match(source, /lambdaLaneTimingSummary:\s*parsedMessage\.laneTimingSummary/);
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
  assert.match(source, /if \(received === 0\) \{\s*await sleep\(options\.pollMs\)/);
  assert.match(source, /validation\.v2_lambda_result\.handoff/);
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
  assert.match(source, /request\.next_attempt_at <= now\(\)/);
  assert.match(source, /order by request\.next_attempt_at asc/);
  assert.match(source, /where request\.scan_id is null/);
  assert.match(source, /MATERIALIZATION_MISSING_REQUEST_DISCOVERY_INTERVAL_MS\s*=\s*300_000/);
  assert.match(source, /includeMissingRequests/);
  assert.match(source, /input\.parsed\.targetEnvironment !== "production"/);
  assert.equal(
    (source.match(/result\.metadata_json->>'targetEnvironment' = 'production'/g) ?? []).length,
    2,
    "both durable finalization recovery paths must exclude local diagnostic results",
  );
  assert.doesNotMatch(source, /order by result\.scan_id, result\.created_at desc\s+limit 25/);
});

test("unified completion durably queues and immediately dispatches canonical report publication", async () => {
  const [indexSource, pipelineSource, repositorySource, resultSource] = await Promise.all([
    readFile("apps/validation-worker/src/index.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/pipeline.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/repository.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8"),
  ]);

  const completionInsert = repositorySource.indexOf("with completed_event as");
  const durableRequestInsert = repositorySource.indexOf(
    "insert into public.scan_score_materialization_requests",
    completionInsert,
  );
  assert.ok(completionInsert >= 0, "expected a canonical unified-completion event insert");
  assert.ok(
    durableRequestInsert > completionInsert,
    "the completion event and publication request must share one atomic statement",
  );
  assert.match(repositorySource, /repeat\('0', 64\)/);
  assert.match(repositorySource, /where scan\.status = 'completed'/);
  assert.match(repositorySource, /where public\.scan_score_materialization_requests\.status = 'pending'/);
  assert.match(pipelineSource, /appendUnifiedFindingsCompletionAndQueueReportMaterialization/);
  assert.match(pipelineSource, /requireDurableCompletionEvent:\s*true/);
  assert.match(pipelineSource, /immediate report materialization dispatch failed/);
  assert.match(resultSource, /scoreMaterializationInFlight/);
  assert.match(resultSource, /REPORT_FINALIZATION_DURABLE_RECOVERY_SWEEP_MS\s*=\s*2_000/);
  assert.match(resultSource, /MATERIALIZATION_MISSING_REQUEST_DISCOVERY_INTERVAL_MS\s*=\s*300_000/);
  assert.match(indexSource, /startPersistedCompletedResultFinalizationRecovery/);
});

test("validation worker exposes no independent post-refusal message or regeneration path", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.doesNotMatch(source, /post_refusal_evidence_ready/);
  assert.doesNotMatch(source, /processPostRefusalEvidenceReadyMessage/);
  assert.doesNotMatch(source, /reconcilePostRefusalEvidenceWithCanonicalBase/);
  assert.doesNotMatch(source, /v2_post_refusal_evidence\.(?:received|verified|reconciled)/);
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
  assert.match(dockerfile, /COPY packages\/certscore-scan-core \.\/packages\/certscore-scan-core/);
  assert.match(dockerfile, /pnpm --filter @certscore\/scan-core build/);
  assert.match(
    dockerfile,
    /COPY --from=build \/app\/packages\/certscore-scan-core\/dist \.\/node_modules\/@certscore\/scan-core\/dist/,
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
  assert.match(source, /token_sha256 = repeat\('0', 64\)/);
  assert.match(source, /last_attempt_at is null/);
  assert.match(source, /last_attempt_at = now\(\)/);
  assert.match(source, /next_attempt_at = now\(\)/);
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

test("verified early policy evidence durably schedules canonical reprojection without a display fallback", async () => {
  const [migration, pipelineSource, repositorySource, resultSource] = await Promise.all([
    readFile("packages/db/migrations/0189_policy_projection_reprojection.sql", "utf8"),
    readFile("apps/validation-worker/src/validation/pipeline.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/repository.ts", "utf8"),
    readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8"),
  ]);

  const verifiedEventIndex = resultSource.indexOf("POLICY_EVIDENCE_VERIFIED_EVENT_TYPE");
  const staticReviewIndex = resultSource.indexOf("await runStaticPolicyReviewPacket", verifiedEventIndex);
  const receivedEventIndex = resultSource.indexOf("POLICY_EVIDENCE_RECEIVED_EVENT_TYPE", staticReviewIndex);
  assert.ok(verifiedEventIndex >= 0, "expected durable verified-evidence telemetry");
  assert.ok(staticReviewIndex > verifiedEventIndex, "semantic review must follow retained-evidence verification");
  assert.ok(receivedEventIndex > staticReviewIndex, "the canonical join wake-up must follow review completion");
  assert.match(resultSource, /v2_policy_review\.started/);
  assert.match(resultSource, /processingDurationMs/);
  assert.match(resultSource, /reviewDurationMs/);

  assert.match(migration, /new\.event_type = 'v2_policy_evidence\.received'/);
  assert.match(migration, /next_recovery_mode := 'policy_projection_reprojection'/);
  assert.match(
    migration,
    /recovery_mode is distinct from 'policy_projection_reprojection'[\s\S]*new\.metadata_json->>'recoveryMode' = 'policy_projection_reprojection'/,
  );
  assert.match(
    migration,
    /public\.nano_signal_work_items\.recovery_mode = 'policy_projection_reprojection'[\s\S]*excluded\.recovery_mode is distinct from 'policy_projection_reprojection'/,
  );
  assert.match(pipelineSource, /shouldReprojectAfterPolicyProjection/);
  assert.match(pipelineSource, /input\.recoveryMode === "policy_projection_reprojection"/);
  assert.match(
    pipelineSource,
    /nanoSignalEnrichmentFailed[\s\S]*buildNanoSignalTerminalFailureMetadata\([\s\S]*recoveryMode: input\.recoveryMode \?\? null/,
  );
  assert.doesNotMatch(
    pipelineSource,
    /nanoSignalEnrichmentFailed[\s\S]{0,500}\.catch\(\(\) => undefined\)/,
  );
  assert.doesNotMatch(
    pipelineSource,
    /nanoSignalEnrichmentCompleted[\s\S]{0,1500}\.catch\(\(\) => undefined\)/,
  );
  assert.match(repositorySource, /when \$5::text = 'policy_projection_reprojection' then 'pending'/);
  assert.match(repositorySource, /or \$5::text = 'policy_projection_reprojection'/);
  assert.match(
    repositorySource,
    /nano_signal_work_items\.recovery_mode = 'policy_projection_reprojection'[\s\S]*excluded\.recovery_mode is distinct from 'policy_projection_reprojection'/,
  );
  assert.doesNotMatch(migration, /insert into (?:public\.)?(?:unified_findings|scan_report)/i);
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
  assert.match(source, /simulated_lambda_dispatch_interrupted_before_terminal_result/);
  assert.match(source, /simulatedLocalLambda}' = 'true'/);
  assert.match(source, /started\.event_type = 'v2_lambda_dispatch\.started'/);
  assert.match(source, /for update of s skip locked/);
  assert.match(source, /startLocalV2DagLambdaOrphanReconciler/);
  assert.match(source, /v2_lambda_result\.received/);
  assert.match(source, /v2_lambda_result\.failed/);
});

test("validation worker starts orphan reconciliation independently of SQS result polling", async () => {
  const source = await readFile("apps/validation-worker/src/index.ts", "utf8");
  const resultPollerIndex = source.indexOf("startLocalV2DagLambdaResultPoller({");
  const orphanReconcilerIndex = source.indexOf("startLocalV2DagLambdaOrphanReconciler();");

  assert.ok(resultPollerIndex >= 0);
  assert.ok(orphanReconcilerIndex > resultPollerIndex);
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
