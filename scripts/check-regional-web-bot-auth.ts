import { randomUUID } from "node:crypto";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";

const REGIONS = ["eu-central-1", "eu-west-1", "us-west-1"] as const;
const FUNCTION_NAME = process.env.CERTSCORE_V2_DAG_LAMBDA_FUNCTION_NAME?.trim() ||
  "certscore-v2-dag-local-lambda";
const TARGET_URL = "https://crawltest.com/cdn-cgi/web-bot-auth";

type Region = (typeof REGIONS)[number];

type WorkerResult = {
  artifactPointers?: { scanArtifactUri?: string };
  error?: { code?: string; message?: string };
  scanId?: string;
  status?: string;
  workerLane?: string;
};

type CanonicalBundle = {
  networkEvents?: Array<{
    isMainFrame?: boolean;
    requestId?: string;
    requestUrl?: string;
    resourceType?: string;
  }>;
  networkResponseEvents?: Array<{
    requestId?: string;
    responseUrl?: string;
    status?: number;
  }>;
};

function parseS3Uri(uri: string) {
  const parsed = new URL(uri);
  if (parsed.protocol !== "s3:" || !parsed.hostname || !parsed.pathname.slice(1)) {
    throw new Error(`Invalid scan artifact URI: ${uri}`);
  }
  return {
    bucket: parsed.hostname,
    key: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

function mainDocumentStatus(bundle: CanonicalBundle) {
  const request = bundle.networkEvents?.find((event) => {
    if (!event.isMainFrame || event.resourceType !== "document" || !event.requestUrl) return false;
    try {
      return new URL(event.requestUrl).hostname === "crawltest.com";
    } catch {
      return false;
    }
  });
  if (!request?.requestId) return null;
  return bundle.networkResponseEvents?.find((event) => event.requestId === request.requestId)?.status ?? null;
}

async function runRegion(region: Region) {
  const scanId = `web-bot-auth-canary-${region}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const lambda = new LambdaClient({ region });
  const payload = {
    artifactOnly: true,
    awsRegion: region,
    callbackCorrelationId: scanId,
    contractVersion: "certscore.v2.lambda-dag-dispatch.v1",
    functionName: FUNCTION_NAME,
    hostname: "crawltest.com",
    localCallbackUrl: null,
    orchestrationMode: "worker",
    processor: "local-certscore-v2-dag-parallel-v1",
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultPurpose: "synthetic_verification",
    resultQueueUrl: `https://sqs.${region}.amazonaws.com/000000000000/web-bot-auth-canary-unused`,
    scanId,
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: TARGET_URL,
    vpcMode: "vpc",
    workerLane: "runtime_evidence",
  };
  const response = await lambda.send(new InvokeCommand({
    FunctionName: FUNCTION_NAME,
    InvocationType: "RequestResponse",
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
  if (response.FunctionError) {
    throw new Error(`${region}: Lambda invocation failed with ${response.FunctionError}.`);
  }
  const result = JSON.parse(Buffer.from(response.Payload ?? []).toString("utf8")) as WorkerResult;
  if (result.status !== "completed" || result.workerLane !== "runtime_evidence") {
    throw new Error(`${region}: runtime evidence worker failed (${result.error?.code ?? result.status ?? "unknown"}).`);
  }
  const artifactUri = result.artifactPointers?.scanArtifactUri;
  if (!artifactUri) {
    throw new Error(`${region}: runtime evidence worker returned no canonical bundle.`);
  }
  const { bucket, key } = parseS3Uri(artifactUri);
  const object = await new S3Client({ region }).send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bundle = JSON.parse(await object.Body!.transformToString()) as CanonicalBundle;
  const status = mainDocumentStatus(bundle);
  if (status !== 200) {
    throw new Error(`${region}: Cloudflare Web Bot Auth verifier returned ${status ?? "no retained status"}; expected 200.`);
  }
  return { artifactUri, region, scanId, status };
}

async function main() {
  const results = await Promise.all(REGIONS.map(runRegion));
  for (const result of results) {
    console.log(`${result.region}: verified (HTTP ${result.status})`);
  }
  console.log(`Cloudflare Web Bot Auth passed from ${results.length} production scanner regions.`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
