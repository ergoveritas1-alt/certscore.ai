import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { parseLocalV2DagLambdaResultMessage } from "../../web/server/scans/local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  artifactPointersFromS3Keys,
  handler,
  parseLocalV2DagLambdaDispatchPayload,
  uploadArtifactFiles
} from "./handler";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    artifactOnly: true,
    awsRegion: "us-west-1",
    callbackCorrelationId: "scan-local-1",
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: "certscore-v2-dag-local",
    hostname: "example.com",
    localCallbackUrl: null,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results",
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
    /us-west-1/
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
      }
    }),
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        assert.equal(command.input.QueueUrl, "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-local-results");
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
