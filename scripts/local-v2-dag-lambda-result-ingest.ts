import { readFile } from "node:fs/promises";
import { stdin } from "node:process";
import { ingestLocalV2DagLambdaResultMessage } from "../apps/web/server/scans/local-v2-dag-lambda-dispatch";
import { pollLocalV2DagLambdaResultQueue } from "../apps/web/server/scans/local-v2-dag-lambda-result-poller";
import type { LocalV2DagLambdaTargetEnvironment } from "../apps/web/server/scans/local-v2-dag-scan-config";

function getArgValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadRawMessage() {
  const message = getArgValue("--message");
  if (message) {
    return message;
  }

  const filePath = getArgValue("--file");
  if (filePath) {
    return readFile(filePath, "utf8");
  }

  return readStdin();
}

function parseTargetEnvironment(): LocalV2DagLambdaTargetEnvironment {
  return getArgValue("--target-environment") === "production" ? "production" : "local";
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function parsePositiveIntegerArg(name: string, fallback: number) {
  const value = Number(getArgValue(name));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

async function main() {
  if (hasFlag("--poll")) {
    const result = await pollLocalV2DagLambdaResultQueue({
      expectedTargetEnvironment: parseTargetEnvironment(),
      maxMessages: parsePositiveIntegerArg("--max-messages", 10),
      waitTimeSeconds: parsePositiveIntegerArg("--wait-seconds", 10)
    });

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const rawMessage = (await loadRawMessage()).trim();
  if (!rawMessage) {
    throw new Error("Provide a Lambda result message with --message, --file, or stdin.");
  }

  const ingestion = ingestLocalV2DagLambdaResultMessage(rawMessage, {
    expectedTargetEnvironment: parseTargetEnvironment()
  });

  console.log(JSON.stringify({
    artifactPromotion: ingestion.artifactPromotion,
    productionFindingIntegration: ingestion.productionFindingIntegration,
    scanId: ingestion.parsedMessage.scanId,
    status: ingestion.status,
    targetEnvironment: ingestion.parsedMessage.targetEnvironment
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
