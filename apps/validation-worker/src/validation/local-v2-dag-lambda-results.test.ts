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
  mirrorLocalV2DagLambdaArtifacts,
  productionArtifactChainRejectReason
} from "./local-v2-dag-lambda-results";

test("validation worker mirrors completed local Lambda artifacts and auxiliary screenshots", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-worker-v2-mirror-"));
  const auxiliaryBody = Buffer.from(JSON.stringify({ policy: "bounded" }));
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
  assert.equal(mirror.mirroredArtifacts.length, 5);
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

test("validation worker Lambda result poller retains leases and bounds result concurrency", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /ChangeMessageVisibilityCommand/);
  assert.match(source, /VisibilityTimeout:\s*0/);
  assert.match(source, /RESULT_VISIBILITY_TIMEOUT_SECONDS\s*=\s*180/);
  assert.match(source, /RESULT_BATCH_CONCURRENCY\s*=\s*3/);
  assert.match(source, /MaxNumberOfMessages:\s*RESULT_BATCH_CONCURRENCY/);
  assert.match(source, /mapWithConcurrency\(messages, RESULT_BATCH_CONCURRENCY/);
  assert.match(source, /async function loopQueue\(queueUrl: string\)/);
  assert.match(source, /for \(const queueUrl of queueUrls\)/);
  assert.doesNotMatch(source, /Promise\.all\(queueUrls\.map/);
});

test("validation worker persists completion scores before acknowledging a Lambda result", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const ensureIndex = source.indexOf("await ensureCompletedScanScoresPersisted");
  const deleteIndex = source.indexOf("new DeleteMessageCommand", ensureIndex);

  assert.ok(ensureIndex >= 0, "expected completion-time score persistence");
  assert.ok(deleteIndex > ensureIndex, "SQS acknowledgement must follow score persistence");
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /scan_score_materialization_requests/);
  assert.match(source, /result\.complete !== true/);
  assert.match(source, /completedScanScoresExist/);
});

test("validation worker continuously reconciles accepted scans without terminal Lambda results", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /ORPHAN_RECONCILIATION_INTERVAL_MS\s*=\s*10_000/);
  assert.match(source, /ORPHAN_RECONCILIATION_AGE_MS\s*=\s*75_000/);
  assert.match(source, /within 75 seconds/);
  assert.match(source, /for update of s skip locked/);
  assert.match(source, /lambda_terminal_result_absent/);
  assert.match(source, /void loopReconciliation\(\)/);
  assert.match(source, /v2_lambda_result\.received/);
  assert.match(source, /v2_lambda_result\.failed/);
});

test("validation worker records Lambda result event before marking scan completed", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const eventInsertIndex = source.indexOf("insert into scan_events");
  const scanCompletedIndex = source.indexOf("set completed_at = coalesce");

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
