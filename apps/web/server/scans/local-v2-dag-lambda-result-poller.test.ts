import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  ingestLocalV2DagLambdaResultMessage,
  parseLocalV2DagLambdaResultMessage
} from "./local-v2-dag-lambda-dispatch";
import { mirrorLocalV2DagLambdaArtifacts, pollLocalV2DagLambdaResultQueue } from "./local-v2-dag-lambda-result-poller";
import { LOCAL_V2_DAG_SCAN_PROCESSOR } from "./local-v2-dag-scan-config";

function buildResultMessage(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    artifactOnly: true,
    artifactPointers: {
      manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json"
    },
    completedAt: "2026-06-15T18:00:00.000Z",
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: "scan-local-1",
    status: "completed",
    targetEnvironment: "local",
    ...overrides
  });
}

test("SQS poller validates and deletes completed and failed local v2 DAG messages after handling", async () => {
  const handled: string[] = [];
  const deleted: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        assert.equal(command.input.QueueUrl, "https://sqs.eu-central-1.amazonaws.com/123/local-results");
        assert.equal(command.input.MaxNumberOfMessages, 10);
        return {
          $metadata: {},
          Messages: [
            {
              Body: buildResultMessage(),
              MessageId: "message-1",
              ReceiptHandle: "receipt-1"
            },
            {
              Body: buildResultMessage({
                error: { message: "scan failed" },
                scanId: "scan-local-2",
                status: "failed"
              }),
              MessageId: "message-2",
              ReceiptHandle: "receipt-2"
            }
          ]
        };
      }

      deleted.push(String(command.input.ReceiptHandle));
      return { $metadata: {} };
    }
  };

  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/local-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    handleMessage: async (rawMessage, options) => {
      const ingestion = ingestLocalV2DagLambdaResultMessage(rawMessage, options);
      handled.push(ingestion.parsedMessage.scanId);
      return ingestion;
    },
    sqsClient
  });

  assert.deepEqual(result, {
    deleted: 2,
    failed: 0,
    handled: 2,
    received: 2
  });
  assert.deepEqual(handled, ["scan-local-1", "scan-local-2"]);
  assert.deepEqual(deleted, ["receipt-1", "receipt-2"]);
});

test("SQS poller deletes manual smoke results that do not belong to a local scan", async () => {
  const deleted: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        return {
          $metadata: {},
          Messages: [
            {
              Body: buildResultMessage({ scanId: "postdeploy-cnn-eu-ie-proxy-123" }),
              MessageId: "message-smoke",
              ReceiptHandle: "receipt-smoke"
            }
          ]
        };
      }

      deleted.push(String(command.input.ReceiptHandle));
      return { $metadata: {} };
    }
  };

  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/local-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    handleMessage: async () => {
      throw new Error("Cannot record local v2 DAG Lambda result for unknown scan postdeploy-cnn-eu-ie-proxy-123.");
    },
    sqsClient
  });

  assert.deepEqual(result, {
    deleted: 1,
    failed: 0,
    handled: 0,
    received: 1
  });
  assert.deepEqual(deleted, ["receipt-smoke"]);
});

test("SQS poller drains configured regional result queues", async () => {
  const receivedQueueUrls: string[] = [];
  const deletedQueueUrls: string[] = [];
  const observedS3Regions: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        receivedQueueUrls.push(String(command.input.QueueUrl));
        return {
          $metadata: {},
          Messages: [
            {
              Body: buildResultMessage({ scanId: `scan-${receivedQueueUrls.length}` }),
              MessageId: `message-${receivedQueueUrls.length}`,
              ReceiptHandle: `receipt-${receivedQueueUrls.length}`
            }
          ]
        };
      }

      deletedQueueUrls.push(String(command.input.QueueUrl));
      return { $metadata: {} };
    }
  };

  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/de-results",
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/usw-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    handleMessage: async (rawMessage, options) => {
      const regionProvider = (options?.s3Client as { config?: { region?: () => Promise<string> } } | undefined)?.config?.region;
      if (regionProvider) {
        observedS3Regions.push(await regionProvider());
      }
      return ingestLocalV2DagLambdaResultMessage(rawMessage, options);
    },
    sqsClient,
    waitTimeSeconds: 0
  });

  assert.deepEqual(result, {
    deleted: 3,
    failed: 0,
    handled: 3,
    received: 3
  });
  assert.deepEqual(receivedQueueUrls, [
    "https://sqs.eu-central-1.amazonaws.com/123/de-results",
    "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
    "https://sqs.us-west-2.amazonaws.com/123/usw-results"
  ]);
  assert.deepEqual(deletedQueueUrls, receivedQueueUrls);
  assert.deepEqual(observedS3Regions, ["eu-central-1", "eu-west-1", "us-west-2"]);
});

test("SQS poller targets an explicit EU-IR queue instead of unrelated configured queues", async () => {
  const receivedQueueUrls: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        receivedQueueUrls.push(String(command.input.QueueUrl));
        return {
          $metadata: {},
          Messages: []
        };
      }

      return { $metadata: {} };
    }
  };

  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/de-results",
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/usw-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    queueUrl: "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
    sqsClient,
    waitTimeSeconds: 20
  });

  assert.deepEqual(result, {
    deleted: 0,
    failed: 0,
    handled: 0,
    received: 0
  });
  assert.deepEqual(receivedQueueUrls, ["https://sqs.eu-west-1.amazonaws.com/123/ie-results"]);
});

test("SQS poller drains broad regional queues in parallel", async () => {
  const receivedQueueUrls: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        const queueUrl = String(command.input.QueueUrl);
        receivedQueueUrls.push(queueUrl);
        if (queueUrl.includes("/de-results")) {
          await new Promise((resolve) => setTimeout(resolve, 60));
        }
        return {
          $metadata: {},
          Messages: []
        };
      }

      return { $metadata: {} };
    }
  };

  const startedAt = performance.now();
  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/de-results",
      CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
      CERTSCORE_V2_DAG_LAMBDA_US_WEST_RESULT_QUEUE_URL: "https://sqs.us-west-2.amazonaws.com/123/usw-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    sqsClient,
    waitTimeSeconds: 0
  });
  const elapsedMs = performance.now() - startedAt;

  assert.deepEqual(result, {
    deleted: 0,
    failed: 0,
    handled: 0,
    received: 0
  });
  assert.deepEqual(receivedQueueUrls.sort(), [
    "https://sqs.eu-central-1.amazonaws.com/123/de-results",
    "https://sqs.eu-west-1.amazonaws.com/123/ie-results",
    "https://sqs.us-west-2.amazonaws.com/123/usw-results"
  ]);
  assert.ok(elapsedMs < 100, `expected parallel polling to avoid serial queue delay; elapsed=${elapsedMs}`);
});

test("SQS poller rejects wrong environment/processor/contract and does not delete", async () => {
  const deleted: string[] = [];
  const sqsClient = {
    async send(command: ReceiveMessageCommand | DeleteMessageCommand) {
      if (command instanceof ReceiveMessageCommand) {
        return {
          $metadata: {},
          Messages: [
            {
              Body: buildResultMessage({ targetEnvironment: "production" }),
              MessageId: "message-env",
              ReceiptHandle: "receipt-env"
            },
            {
              Body: buildResultMessage({ processor: "queued-full-scan-v1" }),
              MessageId: "message-processor",
              ReceiptHandle: "receipt-processor"
            },
            {
              Body: buildResultMessage({ contractVersion: "wrong-contract" }),
              MessageId: "message-contract",
              ReceiptHandle: "receipt-contract"
            }
          ]
        };
      }

      deleted.push(String(command.input.ReceiptHandle));
      return { $metadata: {} };
    }
  };

  const result = await pollLocalV2DagLambdaResultQueue({
    env: {
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.eu-central-1.amazonaws.com/123/local-results",
      CERTSCORE_V2_DAG_LAMBDA_TARGET_ENV: "local"
    },
    handleMessage: async (rawMessage, options) => ingestLocalV2DagLambdaResultMessage(rawMessage, options),
    sqsClient,
    waitTimeSeconds: 0
  });

  assert.deepEqual(result, {
    deleted: 0,
    failed: 3,
    handled: 0,
    received: 3
  });
  assert.deepEqual(deleted, []);
});

test("SQS poller requires an explicit local/prod queue URL", async () => {
  await assert.rejects(
    pollLocalV2DagLambdaResultQueue({
      env: {},
      sqsClient: {
        async send() {
          throw new Error("should not poll without queue URL");
        }
      }
    }),
    /RESULT_QUEUE_URL/
  );
});

test("artifact mirror downloads durable Lambda artifacts into the local v2 DAG scan directory", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-mirror-test-"));
  const auxiliaryBody = Buffer.from(JSON.stringify({ plannerInputs: { baselineLikelyBannerPresent: true } }));
  const screenshotBody = Buffer.from("not-a-real-png-for-mirror-test");
  const objects = new Map([
    ["v2/scan-local-1/LocalV2DagLambdaManifest.json", Buffer.from(JSON.stringify({
      auxiliaryArtifacts: [
        {
          fileName: "consent_scenario_plan.json",
          sha256: createHash("sha256").update(auxiliaryBody).digest("hex"),
          sizeBytes: auxiliaryBody.byteLength,
          uri: "s3://certscore-dev-artifacts/v2/scan-local-1/auxiliary/consent_scenario_plan.json"
        },
        {
          fileName: "screenshot-pre-consent.png",
          sha256: createHash("sha256").update(screenshotBody).digest("hex"),
          sizeBytes: screenshotBody.byteLength,
          uri: "s3://certscore-dev-artifacts/v2/scan-local-1/auxiliary/screenshot-pre-consent.png"
        }
      ],
      manifest: true
    }))],
    ["v2/scan-local-1/CanonicalEvidenceBundle.json", Buffer.from(JSON.stringify({
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      modulesRun: [],
      networkEvents: []
    }))],
    ["v2/scan-local-1/ReviewResult.json", Buffer.from(JSON.stringify({ review: true }))],
    ["v2/scan-local-1/V2ReportProjectionDraft.json", Buffer.from(JSON.stringify({ rows: [] }))],
    ["v2/scan-local-1/auxiliary/consent_scenario_plan.json", auxiliaryBody],
    ["v2/scan-local-1/auxiliary/screenshot-pre-consent.png", screenshotBody]
  ]);
  const metadata = Object.fromEntries(
    [
      ["manifestUri", "v2/scan-local-1/LocalV2DagLambdaManifest.json"],
      ["scanArtifactUri", "v2/scan-local-1/CanonicalEvidenceBundle.json"],
      ["reviewArtifactUri", "v2/scan-local-1/ReviewResult.json"],
      ["reportAdapterArtifactUri", "v2/scan-local-1/V2ReportProjectionDraft.json"]
    ].map(([field, key]) => {
      const body = objects.get(key as string) as Buffer;
      return [field, {
        sha256: createHash("sha256").update(body).digest("hex"),
        sizeBytes: body.byteLength
      }];
    })
  );
  const parsedMessage = parseLocalV2DagLambdaResultMessage(JSON.stringify({
    artifactMetadata: metadata,
    artifactOnly: true,
    artifactPointers: {
      manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/LocalV2DagLambdaManifest.json",
      reportAdapterArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/V2ReportProjectionDraft.json",
      reviewArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/ReviewResult.json",
      scanArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/CanonicalEvidenceBundle.json"
    },
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

  const mirror = await mirrorLocalV2DagLambdaArtifacts({
    parsedMessage,
    s3Client: {
      async send(command: GetObjectCommand) {
        assert.equal(command.input.Bucket, "certscore-dev-artifacts");
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
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-local-1/CanonicalEvidenceBundle.json"), "utf8"),
    JSON.stringify({
      schemaVersion: "certscore.v2.canonical-evidence-bundle.v1",
      modulesRun: [],
      networkEvents: []
    })
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-local-1/consent_scenario_plan.json"), "utf8"),
    JSON.stringify({ plannerInputs: { baselineLikelyBannerPresent: true } })
  );
  assert.equal(
    await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-local-1/screenshot-pre-consent.png"), "utf8"),
    "not-a-real-png-for-mirror-test"
  );
  const manifest = JSON.parse(await readFile(path.join(workspaceRoot, "artifacts/local-v2-dag-scans/scan-local-1/LambdaArtifactMirrorManifest.json"), "utf8")) as Record<string, unknown>;
  assert.equal(manifest.productionFindingIntegration, false);
  assert.equal(manifest.artifactOnly, true);
  assert.equal(typeof manifest.durationMs, "number");
});
