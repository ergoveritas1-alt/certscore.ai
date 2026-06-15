import assert from "node:assert/strict";
import test from "node:test";
import { DeleteMessageCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  ingestLocalV2DagLambdaResultMessage
} from "./local-v2-dag-lambda-dispatch";
import { pollLocalV2DagLambdaResultQueue } from "./local-v2-dag-lambda-result-poller";
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
        assert.equal(command.input.QueueUrl, "https://sqs.us-west-1.amazonaws.com/123/local-results");
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
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/local-results",
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
      CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL: "https://sqs.us-west-1.amazonaws.com/123/local-results",
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
