import { SQSClient, SendMessageCommand, type SendMessageCommandOutput } from "@aws-sdk/client-sqs";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { projectReviewResultToV2ReportDraft } from "@certscore/report-adapter";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import { runScan } from "@certscore/scan-core";

export const LOCAL_V2_DAG_LAMBDA_AWS_REGION = "us-west-1";
export const LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION = "certscore.v2.lambda-dag-dispatch.v1";
export const LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION = "certscore.v2.lambda-dag-result.v1";
export const LOCAL_V2_DAG_SCAN_PROCESSOR = "local-certscore-v2-dag-parallel-v1";
export const LOCAL_V2_DAG_SCANNER_RUNTIME = "certscore-v2-dag-parallel-path";

export type LocalV2DagLambdaDispatchPayload = {
  artifactOnly: true;
  awsRegion: typeof LOCAL_V2_DAG_LAMBDA_AWS_REGION;
  callbackCorrelationId: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION;
  functionName: string;
  hostname: string;
  localCallbackUrl: string | null;
  productionFindingIntegration: false;
  profile: "full" | "tiny";
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  resultHandoff: "sqs";
  resultQueueUrl: string;
  scanId: string;
  scannerRuntime: typeof LOCAL_V2_DAG_SCANNER_RUNTIME;
  targetEnvironment: "local" | "production";
  targetUrl: string;
  vpcMode: "none";
};

export type LocalV2DagLambdaResultMessage = {
  artifactOnly: true;
  artifactPointers?: {
    manifestUri?: string;
    reportAdapterArtifactUri?: string;
    reviewArtifactUri?: string;
    scanArtifactUri?: string;
  };
  completedAt: string;
  contractVersion: typeof LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION;
  error?: {
    code?: string;
    message: string;
  };
  processor: typeof LOCAL_V2_DAG_SCAN_PROCESSOR;
  productionFindingIntegration: false;
  scanId: string;
  status: "completed" | "failed";
  targetEnvironment: "local" | "production";
};

type LocalV2DagLambdaArtifactPointers = NonNullable<LocalV2DagLambdaResultMessage["artifactPointers"]>;

type SqsSendClient = {
  send(command: SendMessageCommand): Promise<SendMessageCommandOutput>;
};

type HandlerOptions = {
  now?: () => Date;
  runArtifactChain?: (payload: LocalV2DagLambdaDispatchPayload, options: { artifactRoot: string }) => Promise<LocalV2DagLambdaResultMessage["artifactPointers"]>;
  sqsClient?: SqsSendClient;
  workspaceRoot?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireString(record: Record<string, unknown>, field: string) {
  const value = compactString(record[field]);
  if (!value) {
    throw new Error(`Local v2 DAG Lambda dispatch is missing ${field}.`);
  }
  return value;
}

export function parseLocalV2DagLambdaDispatchPayload(event: unknown): LocalV2DagLambdaDispatchPayload {
  const record = asRecord(typeof event === "string" ? JSON.parse(event) : event);
  const payload: LocalV2DagLambdaDispatchPayload = {
    artifactOnly: true,
    awsRegion: LOCAL_V2_DAG_LAMBDA_AWS_REGION,
    callbackCorrelationId: requireString(record, "callbackCorrelationId"),
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: requireString(record, "functionName"),
    hostname: requireString(record, "hostname"),
    localCallbackUrl: compactString(record.localCallbackUrl),
    productionFindingIntegration: false,
    profile: record.profile === "tiny" ? "tiny" : "full",
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    resultHandoff: "sqs",
    resultQueueUrl: requireString(record, "resultQueueUrl"),
    scanId: requireString(record, "scanId"),
    scannerRuntime: LOCAL_V2_DAG_SCANNER_RUNTIME,
    targetEnvironment: record.targetEnvironment === "production" ? "production" : "local",
    targetUrl: requireString(record, "targetUrl"),
    vpcMode: "none"
  };

  if (record.contractVersion !== LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION) {
    throw new Error("Unsupported local v2 DAG Lambda dispatch contract version.");
  }
  if (record.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    throw new Error("Local v2 DAG Lambda dispatch came from an unexpected processor.");
  }
  if (record.scannerRuntime !== LOCAL_V2_DAG_SCANNER_RUNTIME) {
    throw new Error("Local v2 DAG Lambda dispatch must use the v2 DAG parallel-path scanner runtime.");
  }
  if (record.resultHandoff !== "sqs") {
    throw new Error("Local v2 DAG Lambda dispatch must hand results back through SQS.");
  }
  if (record.awsRegion !== LOCAL_V2_DAG_LAMBDA_AWS_REGION) {
    throw new Error("Local v2 DAG Lambda dispatch must target us-west-1.");
  }
  if (record.vpcMode !== "none") {
    throw new Error("Local v2 DAG Lambda dispatch must run outside a VPC.");
  }
  if (record.artifactOnly !== true || record.productionFindingIntegration !== false) {
    throw new Error("Local v2 DAG Lambda dispatch must remain artifact-only and non-production.");
  }

  return payload;
}

export function buildLocalV2DagLambdaArtifactRoot(input: {
  artifactBaseDir?: string;
  scanId: string;
  workspaceRoot: string;
}) {
  const baseDir = input.artifactBaseDir ?? process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR ?? "/tmp/certscore-v2-dag-lambda";
  return path.resolve(input.workspaceRoot, baseDir, input.scanId);
}

export async function runLocalV2DagLambdaArtifactChain(
  payload: LocalV2DagLambdaDispatchPayload,
  options: { artifactRoot: string; workspaceRoot?: string }
): Promise<LocalV2DagLambdaArtifactPointers> {
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const artifactRoot = path.resolve(workspaceRoot, options.artifactRoot);
  await mkdir(artifactRoot, { recursive: true });

  const bundle = await runScan({
    consentFlowDeadlineMs: 30_000,
    outDir: artifactRoot,
    policyPlanningDeadlineMs: 1_500,
    profile: payload.profile,
    scenarioConcurrency: 2,
    scenarioPlanningMode: "planned_parallel",
    scenarioResourceMode: "lean",
    url: payload.targetUrl
  });

  const review = await reviewEvidenceBundle(bundle);
  const reviewPath = path.join(artifactRoot, "ReviewResult.json");
  await writeJson(reviewPath, review);

  const projection = projectReviewResultToV2ReportDraft({ bundle, review });
  const projectionPath = path.join(artifactRoot, "V2ReportProjectionDraft.json");
  await writeJson(projectionPath, projection);

  const scanArtifactPath = path.join(artifactRoot, "CanonicalEvidenceBundle.json");
  const pointers = artifactPointersFromPaths({
    artifactRoot,
    manifestPath: path.join(artifactRoot, "LocalV2DagLambdaManifest.json"),
    projectionPath,
    reviewPath,
    scanArtifactPath,
    workspaceRoot
  });
  await writeManifest({
    artifactRoot,
    bundle,
    payload,
    pointers
  });
  return pointers;
}

function writeJson(filePath: string, value: unknown) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function artifactPointersFromPaths(input: {
  artifactRoot: string;
  manifestPath: string;
  projectionPath: string;
  reviewPath: string;
  scanArtifactPath: string;
  workspaceRoot?: string;
}): LocalV2DagLambdaArtifactPointers {
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  return {
    manifestUri: fileUri(input.manifestPath, workspaceRoot),
    reportAdapterArtifactUri: fileUri(input.projectionPath, workspaceRoot),
    reviewArtifactUri: fileUri(input.reviewPath, workspaceRoot),
    scanArtifactUri: fileUri(input.scanArtifactPath, workspaceRoot)
  };
}

async function writeManifest(input: {
  artifactRoot: string;
  bundle: CanonicalEvidenceBundle;
  payload: LocalV2DagLambdaDispatchPayload;
  pointers: LocalV2DagLambdaArtifactPointers;
}) {
  const manifestPath = path.join(input.artifactRoot, "LocalV2DagLambdaManifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    artifactOnly: true,
    contractVersion: "certscore.v2.lambda-dag-artifact-manifest.v1",
    generatedAt: new Date().toISOString(),
    modulesRun: input.bundle.modulesRun.map((moduleRun) => ({
      moduleName: moduleRun.moduleName,
      status: moduleRun.status
    })),
    pointers: input.pointers,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.payload.scanId,
    targetEnvironment: input.payload.targetEnvironment,
    targetUrl: input.payload.targetUrl
  }, null, 2)}\n`, "utf8");
}

function fileUri(filePath: string, workspaceRoot: string) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(workspaceRoot, filePath);
  return `file://${resolved}`;
}

export function buildLocalV2DagLambdaResultMessage(input: {
  artifactPointers?: LocalV2DagLambdaResultMessage["artifactPointers"];
  completedAt: Date;
  error?: { code?: string; message: string };
  payload: LocalV2DagLambdaDispatchPayload;
  status: "completed" | "failed";
}): LocalV2DagLambdaResultMessage {
  return {
    artifactOnly: true,
    ...(input.artifactPointers ? { artifactPointers: input.artifactPointers } : {}),
    completedAt: input.completedAt.toISOString(),
    contractVersion: LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
    ...(input.error ? { error: sanitizeError(input.error) } : {}),
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    scanId: input.payload.scanId,
    status: input.status,
    targetEnvironment: input.payload.targetEnvironment
  };
}

function sanitizeError(error: { code?: string; message: string }) {
  return {
    ...(error.code ? { code: error.code.slice(0, 80) } : {}),
    message: error.message.replace(/\s+/g, " ").slice(0, 500)
  };
}

export async function sendLocalV2DagLambdaResultMessage(input: {
  message: LocalV2DagLambdaResultMessage;
  queueUrl: string;
  sqsClient?: SqsSendClient;
}) {
  const sqsClient = input.sqsClient ?? new SQSClient({ region: LOCAL_V2_DAG_LAMBDA_AWS_REGION });
  await sqsClient.send(new SendMessageCommand({
    MessageBody: JSON.stringify(input.message),
    QueueUrl: input.queueUrl
  }));
}

export async function handler(event: unknown, options: HandlerOptions = {}) {
  let payload: LocalV2DagLambdaDispatchPayload | null = null;
  const now = options.now ?? (() => new Date());

  try {
    payload = parseLocalV2DagLambdaDispatchPayload(event);
    const workspaceRoot = options.workspaceRoot ?? process.cwd();
    const artifactRoot = buildLocalV2DagLambdaArtifactRoot({
      scanId: payload.scanId,
      workspaceRoot
    });
    const runArtifactChain = options.runArtifactChain ?? ((dispatchPayload, runOptions) =>
      runLocalV2DagLambdaArtifactChain(dispatchPayload, { ...runOptions, workspaceRoot }));
    const artifactPointers = await runArtifactChain(payload, { artifactRoot });
    const result = buildLocalV2DagLambdaResultMessage({
      artifactPointers,
      completedAt: now(),
      payload,
      status: "completed"
    });
    await sendLocalV2DagLambdaResultMessage({
      message: result,
      queueUrl: payload.resultQueueUrl,
      sqsClient: options.sqsClient
    });
    return result;
  } catch (error) {
    if (!payload) {
      throw error;
    }
    const result = buildLocalV2DagLambdaResultMessage({
      completedAt: now(),
      error: {
        code: "v2_dag_lambda_failed",
        message: error instanceof Error ? error.message : String(error)
      },
      payload,
      status: "failed"
    });
    await sendLocalV2DagLambdaResultMessage({
      message: result,
      queueUrl: payload.resultQueueUrl,
      sqsClient: options.sqsClient
    });
    return result;
  }
}

export async function readLocalManifest(pathOrUri: string) {
  const filePath = pathOrUri.startsWith("file://") ? new URL(pathOrUri) : pathOrUri;
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}
