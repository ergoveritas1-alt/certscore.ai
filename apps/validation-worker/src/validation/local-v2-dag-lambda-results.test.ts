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
  mirrorLocalV2DagLambdaArtifacts
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

test("validation worker Lambda result poller uses a short SQS visibility timeout", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.match(source, /ChangeMessageVisibilityCommand/);
  assert.match(source, /VisibilityTimeout:\s*0/);
  assert.match(source, /VisibilityTimeout:\s*5/);
  assert.doesNotMatch(source, /VisibilityTimeout:\s*30/);
});

test("validation worker records Lambda result event before marking scan completed", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");
  const eventInsertIndex = source.indexOf("insert into scan_events");
  const scanCompletedIndex = source.indexOf("set completed_at = coalesce");
  const earlyTimingSummaryIndex = source.indexOf("stage: \"core_artifacts_mirrored\"", scanCompletedIndex);
  const auxiliaryMirrorIndex = source.indexOf("await mirrorLocalV2DagLambdaAuxiliaryArtifacts", scanCompletedIndex);
  const refreshedTimingSummaryIndex = source.indexOf("stage: \"auxiliary_artifacts_mirrored\"", auxiliaryMirrorIndex);

  assert.ok(eventInsertIndex >= 0, "expected Lambda result event insert");
  assert.ok(scanCompletedIndex >= 0, "expected scan completion update");
  assert.ok(earlyTimingSummaryIndex >= 0, "expected early retained scan timing summary persistence");
  assert.ok(auxiliaryMirrorIndex >= 0, "expected deferred auxiliary artifact mirror");
  assert.ok(refreshedTimingSummaryIndex >= 0, "expected refreshed retained scan timing summary persistence");
  assert.ok(
    eventInsertIndex < scanCompletedIndex,
    "scan completion must happen after v2_lambda_result.received exists so completed-scan backfill can see evidence"
  );
  assert.ok(
    scanCompletedIndex < earlyTimingSummaryIndex && earlyTimingSummaryIndex < auxiliaryMirrorIndex,
    "core timing summary must persist before auxiliary artifact mirroring"
  );
  assert.ok(
    auxiliaryMirrorIndex < refreshedTimingSummaryIndex,
    "scan timing summary must be refreshed after auxiliary timing artifacts are mirrored"
  );
});

test("validation worker mirrors completed Lambda artifacts for production-target results", async () => {
  const source = await readFile("apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts", "utf8");

  assert.doesNotMatch(source, /targetEnvironment\s*!==\s*"local"/);
  assert.match(source, /input\.parsedMessage\.status\s*!==\s*"completed"/);
});
