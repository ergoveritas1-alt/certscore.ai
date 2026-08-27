import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_LAMBDA_AWS_REGIONS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS,
  type LocalV2DagLambdaAwsRegion,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG,
  handler
} from "../apps/v2-dag-lambda/src/handler";

type PostRefusalWorkerMode = "normal" | "failure" | "timeout";

type Args = {
  artifactDir: string;
  awsRegion: LocalV2DagLambdaAwsRegion;
  debugOverrides: Record<string, unknown> | null;
  functionName: string;
  outPath: string;
  profile: "full" | "standard" | "tiny";
  postRefusalEnabled: boolean;
  postRefusalWorkerMode: PostRefusalWorkerMode;
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
      postRefusalWorkerMode: PostRefusalWorkerMode;
      s3Client: LocalDiskS3Client;
      sqsClient: LocalCaptureSqsClient;
      workspaceRoot: string;
    }
  ) {}

  async send(command: InvokeCommand, options?: { abortSignal?: AbortSignal }) {
    const payload = command.input.Payload
      ? JSON.parse(Buffer.from(command.input.Payload).toString("utf8")) as unknown
      : {};
    const payloadRecord = asRecord(payload);
    if (payloadRecord.workerLane === "reject_observation") {
      if (this.input.postRefusalWorkerMode === "failure") {
        return {
          $metadata: {},
          FunctionError: "Unhandled",
          Payload: Buffer.from(JSON.stringify({ errorMessage: "simulated reject worker failure" })),
          StatusCode: 200,
        };
      }
      if (this.input.postRefusalWorkerMode === "timeout") {
        return await rejectWhenAborted(options?.abortSignal);
      }
    }
    const result = await handler(payload, {
      lambdaClient: this,
      s3Client: this.input.s3Client,
      s3GetClient: this.input.s3Client,
      sqsClient: this.input.sqsClient,
      workspaceRoot: this.input.workspaceRoot
    });
    const resultRecord = asRecord(result);
    if (resultRecord.status === "failed") {
      console.error("[local-lambda-worker] failed", JSON.stringify({
        error: resultRecord.error,
        scanId: resultRecord.scanId,
        workerLane: resultRecord.workerLane,
      }));
    }
    return {
      $metadata: {},
      Payload: Buffer.from(JSON.stringify(result)),
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
  const lambdaClient = new LocalRecursiveLambdaClient({
    postRefusalWorkerMode: args.postRefusalWorkerMode,
    s3Client,
    sqsClient,
    workspaceRoot,
  });
  const target = new URL(args.targetUrl);
  const startedAt = Date.now();

  const previousEnv = captureEnv([
    "AWS_LAMBDA_FUNCTION_MEMORY_SIZE",
    "AWS_LAMBDA_FUNCTION_NAME",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR",
    "CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID",
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT",
    "CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL",
    "CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX",
    "CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE",
    "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS",
    "CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS",
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD",
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME",
    POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG,
    "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY",
    "CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE",
    "SCAN_EGRESS_LABEL",
    "SCAN_PROXY_ENABLED",
    "SCAN_PROXY_SERVER"
  ]);

  try {
    applyRegionalLambdaParityEnv(args.awsRegion);
    if (target.hostname === "127.0.0.1" || target.hostname === "localhost" || target.hostname === "::1") {
      // The parity fixture must exercise local Chromium directly even when the
      // developer env file also contains production-region proxy settings.
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER;
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME;
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD;
      delete process.env.SCAN_PROXY_SERVER;
      process.env.SCAN_PROXY_ENABLED = "false";
    }
    process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE = "3008";
    process.env.AWS_LAMBDA_FUNCTION_NAME = args.functionName;
    const localArtifactBucketBase = process.env.S3_BUCKET?.trim() || "scan-artifacts";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET =
      `${localArtifactBucketBase}-${args.awsRegion}`;
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR = artifactBaseDir;
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local-parity";
    // Lambda's single-process Chromium mode is required for the Linux runtime,
    // but it is unstable when the three simulated evidence lanes launch in
    // parallel on macOS. Preserve the production default while keeping local
    // parity evidence capture reliable.
    process.env.CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS ??=
      process.platform === "darwin" ? "false" : "true";
    process.env.CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE = "none";
    process.env.CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE = "webmd";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE = "sharded";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE = "always";
    process.env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS = String(LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS);
    process.env.CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS = String(LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS);
    process.env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY = "1";
    process.env.CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE = "cmp_safe";
    if (args.postRefusalEnabled) {
      process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
    } else {
      delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
    }

    const payload = {
      artifactOnly: true,
      awsRegion: args.awsRegion,
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
      ...(args.postRefusalEnabled
        ? {
            postRefusalObservation: {
              actionSearchTimeoutMs: 1_500,
              cmpCanonicalName: "OneTrust",
              confirmation: {
                kind: "tcf_purposes_denied",
                purposeIds: [1, 2, 3, 4, 7, 9, 10],
              },
              confirmationTimeoutMs: 1_500,
              dispatchDelayMs: 500,
              enabled: true,
              interactionAuthorization: {
                authorizationId: "loopback_local_lab",
                kind: "loopback",
              },
              observationWindowMs: 8_000,
            },
          }
        : {}),
      resultHandoff: "sqs",
      resultPurpose: "synthetic_verification",
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
      variantLabel: args.variantLabel,
      postRefusalWorkerMode: args.postRefusalWorkerMode,
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
  postRefusalWorkerMode: PostRefusalWorkerMode;
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
    postRefusalWorkerMode: input.postRefusalWorkerMode,
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
    postRefusal: summarizePostRefusal(bundleRecord),
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
    laneTimingSummary: record.laneTimingSummary ?? null,
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
    awsRegion: "eu-central-1",
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
    postRefusalEnabled: false,
    postRefusalWorkerMode: "normal",
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
    } else if (arg === "--aws-region") {
      args.awsRegion = normalizeAwsRegion(requiredValue(argv, ++index, arg));
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
    } else if (arg === "--post-refusal") {
      args.postRefusalEnabled = true;
    } else if (arg === "--post-refusal-worker-mode") {
      args.postRefusalEnabled = true;
      args.postRefusalWorkerMode = normalizePostRefusalWorkerMode(requiredValue(argv, ++index, arg));
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
    "  --aws-region <region>    eu-central-1, eu-west-1, or us-west-1. Default: eu-central-1",
    "  --profile <profile>      full, standard, or tiny. Default: full",
    "  --post-refusal           Enable the local four-lane Reject Path barrier.",
    "  --post-refusal-worker-mode <mode> normal, failure, or timeout. Implies --post-refusal.",
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

function normalizeAwsRegion(value: string): LocalV2DagLambdaAwsRegion {
  if (LOCAL_V2_DAG_LAMBDA_AWS_REGIONS.includes(value as LocalV2DagLambdaAwsRegion)) {
    return value as LocalV2DagLambdaAwsRegion;
  }
  throw new Error(`Unsupported local Lambda parity AWS region: ${value}`);
}

function normalizeProfile(value: string): Args["profile"] {
  if (value === "tiny" || value === "standard" || value === "full") {
    return value;
  }
  return "full";
}

function normalizePostRefusalWorkerMode(value: string): PostRefusalWorkerMode {
  if (value === "normal" || value === "failure" || value === "timeout") return value;
  throw new Error(`Unsupported post-refusal worker mode: ${value}`);
}

async function rejectWhenAborted(signal?: AbortSignal): Promise<never> {
  if (!signal) return await new Promise<never>(() => undefined);
  if (signal.aborted) throw signal.reason ?? new Error("Simulated reject worker aborted.");
  return await new Promise<never>((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      reject(signal.reason ?? new Error("Simulated reject worker aborted."));
    }, { once: true });
  });
}

function summarizePostRefusal(bundleRecord: Record<string, unknown>) {
  const laneOutcome = asRecord(bundleRecord.postRefusalLaneOutcome);
  const packet = asRecord(bundleRecord.postRefusalEvidence);
  const registration = asRecord(packet.refusalRegistration);
  const observations = Array.isArray(packet.observations) ? packet.observations : [];
  return {
    laneOutcome: Object.keys(laneOutcome).length > 0 ? laneOutcome : null,
    observationCount: observations.length,
    observationTypes: observations.map((observation) => asRecord(observation).observationType ?? null),
    productionProjectable: packet.productionProjectable ?? null,
    refusalExercised: registration.refusalExercised ?? null,
    registrationStatus: registration.status ?? null,
  };
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

function applyRegionalLambdaParityEnv(region: LocalV2DagLambdaAwsRegion) {
  const prefix = lambdaLocationEnvPrefix(region);
  process.env.CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX = prefix;
  setIfMissing(
    "CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  );

  const defaults = regionalChromiumDefaults(region);
  for (const [key, value] of Object.entries(defaults)) {
    setIfMissing(key, value);
  }

  copyRegionAlias(prefix, "PROXY_SERVER", "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER");
  copyRegionAlias(prefix, "PROXY_USERNAME", "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME");
  copyRegionAlias(prefix, "PROXY_PASSWORD", "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD");
  copyRegionAlias(prefix, "EGRESS_LABEL", "CERTSCORE_V2_DAG_LAMBDA_EGRESS_LABEL");
  copyRegionAlias(prefix, "EGRESS_LABEL", "SCAN_EGRESS_LABEL");
  copyRegionAlias(prefix, "SCAN_PROXY_SERVER", "SCAN_PROXY_SERVER");
}

function lambdaLocationEnvPrefix(region: LocalV2DagLambdaAwsRegion) {
  if (region === "eu-west-1") {
    return "EU_IE";
  }
  if (region === "us-west-1") {
    return "US_WEST";
  }
  return "EU_DE";
}

function regionalChromiumDefaults(region: LocalV2DagLambdaAwsRegion): Record<string, string> {
  if (region === "eu-west-1") {
    return {
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-IE,en;q=0.9",
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-IE",
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Dublin"
    };
  }
  if (region === "us-west-1") {
    return {
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-US,en;q=0.9",
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-US",
      CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "America/Los_Angeles"
    };
  }
  return {
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "de-DE,de;q=0.9,en;q=0.8",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "de-DE",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Berlin"
  };
}

function copyRegionAlias(prefix: string, sourceSuffix: string, targetKey: string) {
  const sourceValue = process.env[`CERTSCORE_V2_DAG_LAMBDA_${prefix}_${sourceSuffix}`]?.trim();
  if (sourceValue) {
    setIfMissing(targetKey, sourceValue);
  }
}

function setIfMissing(key: string, value: string) {
  if (!process.env[key]?.trim()) {
    process.env[key] = value;
  }
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

void main().then(
  () => {
    // This executable is the local simulated-Lambda boundary. All evidence,
    // manifests, and the captured terminal message have been synchronously
    // awaited before main resolves, so lingering Playwright/SDK handles must
    // not delay WC01 result ingestion after the simulated handler completed.
    process.exit(0);
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);
