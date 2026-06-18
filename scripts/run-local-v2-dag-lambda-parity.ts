import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  handler
} from "../apps/v2-dag-lambda/src/handler";

type Args = {
  artifactDir: string;
  debugOverrides: Record<string, unknown> | null;
  functionName: string;
  outPath: string;
  profile: "full" | "standard" | "tiny";
  scanId: string;
  targetUrl: string;
  variantLabel: string | null;
};

type S3Object = {
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
};

class LocalDiskS3Client {
  private readonly objects = new Map<string, S3Object>();

  constructor(private readonly rootDir: string) {}

  async send(command: PutObjectCommand | GetObjectCommand) {
    if (isPutObjectCommand(command)) {
      const bucket = requireCommandString(command.input.Bucket, "Bucket");
      const key = requireCommandString(command.input.Key, "Key");
      const body = await bodyToBuffer(command.input.Body);
      const objectKey = objectMapKey(bucket, key);
      this.objects.set(objectKey, {
        body,
        contentType: command.input.ContentType,
        metadata: command.input.Metadata
      });
      const filePath = this.filePathFor(bucket, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      await writeFile(`${filePath}.metadata.json`, `${JSON.stringify({
        bucket,
        contentType: command.input.ContentType ?? null,
        key,
        metadata: command.input.Metadata ?? {},
        sha256: createHash("sha256").update(body).digest("hex"),
        sizeBytes: body.byteLength
      }, null, 2)}\n`, "utf8");
      return { $metadata: {} };
    }

    const bucket = requireCommandString(command.input.Bucket, "Bucket");
    const key = requireCommandString(command.input.Key, "Key");
    const object = this.objects.get(objectMapKey(bucket, key)) ?? await this.readObject(bucket, key);
    if (!object) {
      throw new Error(`Local Lambda-parity S3 object not found: s3://${bucket}/${key}`);
    }
    return {
      $metadata: {},
      Body: object.body,
      ContentType: object.contentType,
      Metadata: object.metadata
    };
  }

  private filePathFor(bucket: string, key: string) {
    const safeKey = key.split("/").map((part) => {
      if (!part || part === "." || part === "..") {
        throw new Error(`Unsupported local Lambda-parity S3 key segment: ${key}`);
      }
      return part;
    });
    return path.join(this.rootDir, bucket, ...safeKey);
  }

  private async readObject(bucket: string, key: string): Promise<S3Object | null> {
    try {
      const body = await readFile(this.filePathFor(bucket, key));
      const object = { body };
      this.objects.set(objectMapKey(bucket, key), object);
      return object;
    } catch {
      return null;
    }
  }
}

class LocalCaptureSqsClient {
  readonly messages: string[] = [];

  async send(command: SendMessageCommand) {
    this.messages.push(String(command.input.MessageBody ?? ""));
    return { $metadata: {} };
  }
}

class LocalRecursiveLambdaClient {
  constructor(
    private readonly input: {
      s3Client: LocalDiskS3Client;
      sqsClient: LocalCaptureSqsClient;
      workspaceRoot: string;
    }
  ) {}

  async send(command: InvokeCommand) {
    const payload = command.input.Payload
      ? JSON.parse(Buffer.from(command.input.Payload).toString("utf8")) as unknown
      : {};
    const result = await handler(payload, {
      lambdaClient: this,
      s3Client: this.input.s3Client,
      s3GetClient: this.input.s3Client,
      sqsClient: this.input.sqsClient,
      workspaceRoot: this.input.workspaceRoot
    });
    const resultRecord = asRecord(result);
    return {
      $metadata: {},
      Payload: Buffer.from(JSON.stringify(result)),
      ...(resultRecord.status === "failed" ? { FunctionError: "Unhandled" } : {}),
      StatusCode: 200
    };
  }
}

function isPutObjectCommand(command: PutObjectCommand | GetObjectCommand): command is PutObjectCommand {
  return command.constructor.name === "PutObjectCommand" || Object.hasOwn(command.input, "Body");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const artifactBaseDir = path.resolve(workspaceRoot, args.artifactDir);
  const fakeS3Root = path.join(artifactBaseDir, "_fake-s3");
  const s3Client = new LocalDiskS3Client(fakeS3Root);
  const sqsClient = new LocalCaptureSqsClient();
  const lambdaClient = new LocalRecursiveLambdaClient({ s3Client, sqsClient, workspaceRoot });
  const target = new URL(args.targetUrl);
  const startedAt = Date.now();

  const previousEnv = captureEnv([
    "AWS_LAMBDA_FUNCTION_MEMORY_SIZE",
    "AWS_LAMBDA_FUNCTION_NAME",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS",
    "CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS",
    "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY",
    "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE"
  ]);

  try {
    process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "3008";
    process.env.AWS_LAMBDA_FUNCTION_NAME = args.functionName;
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-v2-dag-local-parity-artifacts";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR = artifactBaseDir;
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local-parity";
    process.env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS ??= "true";
    process.env.CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE = "none";
    process.env.CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE = "webmd";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE = "sharded";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE = "always";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS = "5000";
    process.env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY = "1";
    process.env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE = "cmp_safe";

    const payload = {
      artifactOnly: true,
      awsRegion: "eu-central-1",
      callbackCorrelationId: args.scanId,
      contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
      functionName: args.functionName,
      hostname: target.hostname,
      localCallbackUrl: null,
      orchestrationMode: "sharded",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      profile: args.profile,
      ...(args.debugOverrides ? { debugOverrides: args.debugOverrides } : {}),
      resultHandoff: "sqs",
      resultQueueUrl: "local://certscore-v2-dag-local-parity-results",
      scanId: args.scanId,
      scannerRuntime: "certscore-v2-dag-parallel-path",
      strongEvidenceMode: "webmd",
      targetEnvironment: "local",
      targetUrl: args.targetUrl,
      vpcMode: "none"
    };

    console.log(JSON.stringify({
      event: "local_lambda_parity_started",
      scanId: args.scanId,
      targetUrl: args.targetUrl,
      artifactDir: path.join(artifactBaseDir, args.scanId),
      variantLabel: args.variantLabel
    }));

    const result = await handler(payload, {
      lambdaClient,
      s3Client,
      s3GetClient: s3Client,
      sqsClient,
      workspaceRoot
    });

    const artifactRoot = path.join(artifactBaseDir, args.scanId);
    const summary = await buildSummary({
      artifactRoot,
      elapsedMs: Date.now() - startedAt,
      fakeS3Root,
      result,
      scanId: args.scanId,
      sqsMessages: sqsClient.messages,
      targetUrl: args.targetUrl,
      variantLabel: args.variantLabel
    });

    await mkdir(path.dirname(path.resolve(workspaceRoot, args.outPath)), { recursive: true });
    await writeFile(path.resolve(workspaceRoot, args.outPath), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    await writeFile(path.join(artifactRoot, "LocalV2DagLambdaParityRun.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    console.log(JSON.stringify({
      artifactRoot,
      elapsedMs: summary.elapsedMs,
      event: "local_lambda_parity_completed",
      outPath: path.resolve(workspaceRoot, args.outPath),
      scanId: args.scanId,
      status: summary.resultStatus
    }));
  } finally {
    restoreEnv(previousEnv);
  }
}

async function buildSummary(input: {
  artifactRoot: string;
  elapsedMs: number;
  fakeS3Root: string;
  result: unknown;
  scanId: string;
  sqsMessages: string[];
  targetUrl: string;
  variantLabel: string | null;
}) {
  const bundle = await readOptionalJson(path.join(input.artifactRoot, "CanonicalEvidenceBundle.json"));
  const manifest = await readOptionalJson(path.join(input.artifactRoot, "LocalV2DagLambdaManifest.json"));
  const shardSummary = await readOptionalJson(path.join(input.artifactRoot, "LocalV2DagLambdaShardSummary.json"));
  const scenarioQualityFiles = await readScenarioQualityFiles(input.artifactRoot);
  const resultRecord = asRecord(input.result);
  const bundleRecord = asRecord(bundle);
  return {
    artifactRoot: input.artifactRoot,
    elapsedMs: input.elapsedMs,
    fakeS3Root: input.fakeS3Root,
    generatedAt: new Date().toISOString(),
    resultStatus: typeof resultRecord.status === "string" ? resultRecord.status : "unknown",
    scanId: input.scanId,
    sqsMessages: input.sqsMessages.map((message) => safeJsonParse(message) ?? message),
    targetUrl: input.targetUrl,
    variantLabel: input.variantLabel,
    counts: {
      consentActionAttempts: arrayLength(bundleRecord.consentActionAttempts),
      consentActionCandidates: arrayLength(bundleRecord.consentActionCandidates),
      consentFlowComparisons: arrayLength(bundleRecord.consentFlowComparisons),
      evidenceExcerpts: arrayLength(bundleRecord.evidenceExcerpts),
      networkEvents: arrayLength(bundleRecord.networkEvents),
      networkResponseEvents: arrayLength(bundleRecord.networkResponseEvents),
      screenshots: arrayLength(bundleRecord.screenshots)
    },
    manifest: {
      auxiliaryArtifactCount: arrayLength(asRecord(manifest).auxiliaryArtifacts),
      hasCoordinatorPlanSummary: Boolean(asRecord(manifest).coordinatorPlanSummary),
      phaseTimings: asRecord(manifest).phaseTimings ?? []
    },
    moduleRuns: Array.isArray(bundleRecord.modulesRun)
      ? bundleRecord.modulesRun.map((moduleRun) => {
        const record = asRecord(moduleRun);
        return {
          errors: Array.isArray(record.errors) ? record.errors.filter((error): error is string => typeof error === "string") : [],
          moduleName: typeof record.moduleName === "string" ? record.moduleName : "unknown",
          status: typeof record.status === "string" ? record.status : "unknown"
        };
      })
      : [],
    scenarioQuality: scenarioQualityFiles,
    shardSummary: summarizeShardSummary(shardSummary)
  };
}

async function readScenarioQualityFiles(artifactRoot: string) {
  const entries = await readdir(artifactRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.includes("ScenarioEvidenceQuality-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(files.map(async (fileName) => {
    const artifact = asRecord(await readOptionalJson(path.join(artifactRoot, fileName)));
    const counts = asRecord(artifact.counts);
    const action = asRecord(artifact.action);
    const plannerRecipe = asRecord(artifact.plannerRecipe);
    return {
      action: {
        attempted: action.attempted ?? null,
        outcome: action.actionOutcome ?? null
      },
      counts: {
        actionCandidatesFound: counts.actionCandidatesFound ?? null,
        activeRequestsAtClose: counts.activeRequestsAtClose ?? null,
        cookiesAfterAction: counts.cookiesAfterAction ?? null,
        cookiesBeforeAction: counts.cookiesBeforeAction ?? null,
        evidenceExcerpts: counts.evidenceExcerpts ?? null,
        failedRequests: counts.failedRequests ?? null,
        finalWindowRequestRatePerSecond: counts.finalWindowRequestRatePerSecond ?? null,
        postActionRequests: counts.postActionRequests ?? null,
        requests: counts.requests ?? null,
        responses: counts.responses ?? null,
        storageAfterAction: counts.storageAfterAction ?? null,
        storageBeforeAction: counts.storageBeforeAction ?? null
      },
      fileName,
      limitationReason: artifact.limitationReason ?? null,
      passStatus: artifact.passStatus ?? null,
      plannerRecipe: {
        status: plannerRecipe.status ?? null,
        candidatesProvided: plannerRecipe.candidatesProvided ?? null,
        candidatesMatched: plannerRecipe.candidatesMatched ?? null
      },
      scenario: artifact.scenario ?? null
    };
  }));
}

function summarizeShardSummary(value: unknown) {
  const record = asRecord(value);
  const coordinatorSummary = asRecord(record.coordinatorPlanSummary);
  return {
    coordinatorPlannedScenarios: coordinatorSummary.plannedScenarios ?? [],
    coordinatorSkippedScenarios: coordinatorSummary.skippedScenarios ?? [],
    workerResults: Array.isArray(record.workerResults)
      ? record.workerResults.map((worker) => {
        const workerRecord = asRecord(worker);
        return {
          phaseTimings: workerRecord.phaseTimings ?? [],
          scanId: workerRecord.scanId ?? null,
          status: workerRecord.status ?? null,
          workerLane: workerRecord.workerLane ?? null
        };
      })
      : []
  };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    artifactDir: "artifacts/local-v2-dag-lambda-parity",
    debugOverrides: {
      actionFinalSettleMs: 8000,
      actionSearchDeadlineMs: 12000,
      consentFlowDeadlineMs: 60000,
      oneTrustHiddenActionMode: "diagnostic",
      preActionObservationMs: 5000,
      scenarioConcurrency: 1,
      scenarioResourceMode: "cmp_safe",
      strongEvidenceMode: "webmd"
    },
    functionName: "certscore-v2-dag-local-lambda",
    outPath: "artifacts/local-v2-dag-lambda-parity/latest.json",
    profile: "full",
    scanId: `local-lambda-parity-${randomUUID()}`,
    targetUrl: "https://www.webmd.com/",
    variantLabel: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--artifact-dir") {
      args.artifactDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--debug-overrides") {
      args.debugOverrides = parseJsonObjectArg(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--function-name") {
      args.functionName = requiredValue(argv, ++index, arg);
    } else if (arg === "--no-debug-overrides") {
      args.debugOverrides = null;
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--profile") {
      args.profile = normalizeProfile(requiredValue(argv, ++index, arg));
    } else if (arg === "--scan-id") {
      args.scanId = requiredValue(argv, ++index, arg);
    } else if (arg === "--target-url") {
      args.targetUrl = normalizeTargetUrl(requiredValue(argv, ++index, arg));
    } else if (arg === "--variant") {
      args.variantLabel = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:local-dag-lambda-parity -- [options]",
    "",
    "Runs the local/dev v2 DAG Lambda handler in sharded mode without AWS by using local filesystem-backed Lambda, S3, and SQS doubles.",
    "This is an artifact-only/internal-only debug harness; it does not persist production findings.",
    "",
    "Options:",
    "  --target-url <url>       Site to scan. Default: https://www.webmd.com/",
    "  --profile <profile>      full, standard, or tiny. Default: full",
    "  --scan-id <id>           Stable scan ID. Default: local-lambda-parity-<uuid>",
    "  --artifact-dir <path>    Artifact base directory. Default: artifacts/local-v2-dag-lambda-parity",
    "  --out <path>             Summary JSON path. Default: artifacts/local-v2-dag-lambda-parity/latest.json",
    "  --debug-overrides <json> Lambda debug overrides. Defaults to WebMD strong-evidence settings.",
    "  --no-debug-overrides     Run with only env tuning.",
    "  --variant <label>        Optional run label.",
    "",
    "Example:",
    "  pnpm v2:local-dag-lambda-parity -- --target-url https://www.webmd.com/ --variant webmd-local-parity"
  ].join("\n"));
}

function normalizeTargetUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, "")}`;
}

function normalizeProfile(value: string): Args["profile"] {
  if (value === "tiny" || value === "standard" || value === "full") {
    return value;
  }
  return "full";
}

function parseJsonObjectArg(value: string, flag: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${flag} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function bodyToBuffer(body: PutObjectCommand["input"]["Body"]) {
  if (body === undefined) {
    return Buffer.alloc(0);
  }
  if (typeof body === "string") {
    return Buffer.from(body);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Unsupported local Lambda-parity S3 PutObject body.");
}

function requireCommandString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Local Lambda-parity AWS command is missing ${field}.`);
  }
  return value;
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function objectMapKey(bucket: string, key: string) {
  return `${bucket}/${key}`;
}

function captureEnv(keys: string[]) {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values: Map<string, string | undefined>) {
  for (const [key, value] of values) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
