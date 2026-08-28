import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import {
  LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION,
  buildLocalV2DagLambdaDispatchPayload,
  type LocalV2DagLambdaDispatchPayload,
  type LocalV2DagLambdaDispatchResult
} from "./local-v2-dag-lambda-dispatch";
import { handleLocalV2DagLambdaResultMessage } from "./local-v2-dag-lambda-result-poller";

const execFileAsync = promisify(execFile);
// Keep the local simulator inside the same bounded execution envelope as the
// deployed coordinator, while leaving enough time to persist a terminal
// result before the 930s orphan-reconciliation deadline.
export const LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS = 915_000;

type LocalLambdaParitySummary = {
  fakeS3Root?: string;
  sqsMessages?: unknown[];
};

function simulatedMessageRecord(message: unknown) {
  if (typeof message === "string") {
    try {
      const parsed = JSON.parse(message) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return message && typeof message === "object" && !Array.isArray(message)
    ? message as Record<string, unknown>
    : null;
}

export function selectSimulatedLambdaTerminalResultMessages(messages: unknown[]) {
  const terminalResults = messages.filter((message) => (
    simulatedMessageRecord(message)?.contractVersion === LOCAL_V2_DAG_LAMBDA_RESULT_CONTRACT_VERSION
  ));
  if (terminalResults.length !== 1) {
    throw new Error(
      `Simulated v2 DAG Lambda must emit exactly one terminal result message; received ${terminalResults.length}.`
    );
  }
  return terminalResults;
}

class LocalDiskS3ReadClient {
  constructor(private readonly fakeS3Root: string) {}

  async send(command: { input?: { Bucket?: unknown; Key?: unknown } }): Promise<any> {
    const bucket = requireString(command.input?.Bucket, "Bucket");
    const key = requireString(command.input?.Key, "Key");
    return {
      $metadata: {},
      Body: await readFile(path.join(this.fakeS3Root, bucket, ...key.split("/")))
    };
  }
}

type LocalParityArgsPayload = Pick<
  LocalV2DagLambdaDispatchPayload,
  "awsRegion" | "debugOverrides" | "postRefusalObservation" | "profile" | "scanId" | "targetUrl"
>;

export function buildLocalV2DagSimulatedLambdaArgs(input: {
  artifactDir: string;
  outPath: string;
  payload: LocalParityArgsPayload;
}) {
  const args = [
    "--env-file=apps/web/.env.local",
    "--import",
    "tsx",
    "scripts/run-local-v2-dag-lambda-parity.ts",
    "--",
    "--target-url",
    input.payload.targetUrl,
    "--aws-region",
    input.payload.awsRegion,
    "--profile",
    input.payload.profile,
    "--scan-id",
    input.payload.scanId,
    "--artifact-dir",
    input.artifactDir,
    "--out",
    input.outPath,
    "--variant",
    "wc01-local-simulated-lambda"
  ];

  if (input.payload.debugOverrides && Object.keys(input.payload.debugOverrides).length > 0) {
    args.push("--debug-overrides", JSON.stringify(input.payload.debugOverrides));
  }
  if (input.payload.postRefusalObservation?.enabled === true) {
    args.push("--post-refusal-config", JSON.stringify(input.payload.postRefusalObservation));
  }
  return args;
}

export async function dispatchLocalV2DagSimulatedLambdaScan(input: {
  localCallbackUrl?: string | null;
  scanConfig: SharedScanConfig | Record<string, unknown>;
  scanId: string;
}): Promise<LocalV2DagLambdaDispatchResult> {
  const dispatchStartedAtMs = Date.now();
  const payload = buildLocalV2DagLambdaDispatchPayload(input);
  const root = workspaceRoot();
  const artifactDir = "artifacts/local-v2-dag-lambda-simulated";
  const outPath = `${artifactDir}/${payload.scanId}/summary.json`;
  const args = buildLocalV2DagSimulatedLambdaArgs({ artifactDir, outPath, payload });

  await execFileAsync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
      PLAYWRIGHT_BROWSERS_PATH: "",
      TSX_TSCONFIG_PATH: "tsconfig.base.json"
    },
    killSignal: "SIGTERM",
    timeout: LOCAL_V2_DAG_SIMULATED_EXECUTION_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  });

  const summary = JSON.parse(await readFile(path.join(root, outPath), "utf8")) as LocalLambdaParitySummary;
  const messages = summary.sqsMessages ?? [];
  if (messages.length === 0) {
    throw new Error("Simulated v2 DAG Lambda completed without emitting a result message.");
  }
  if (!summary.fakeS3Root) {
    throw new Error("Simulated v2 DAG Lambda summary did not include a fake S3 root.");
  }

  const s3Client = new LocalDiskS3ReadClient(summary.fakeS3Root);
  for (const message of selectSimulatedLambdaTerminalResultMessages(messages)) {
    await handleLocalV2DagLambdaResultMessage(message, {
      expectedTargetEnvironment: payload.targetEnvironment,
      s3Client: s3Client as never,
      workspaceRoot: root
    });
  }

  return {
    dispatched: true,
    invocationRequestId: `local-simulated:${payload.scanId}`,
    invocationStatusCode: 200,
    invocationType: "Event",
    payload,
    timings: {
      clientReadyMs: 0,
      credentialResolutionMs: 0,
      dispatchTotalMs: Date.now() - dispatchStartedAtMs,
      requestSigningAndSendMs: 0,
      sdkImportMs: 0
    }
  };
}

function workspaceRoot() {
  const cwd = process.cwd();
  return cwd.endsWith(`${path.sep}apps${path.sep}web`) ? path.resolve(cwd, "../..") : cwd;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Simulated v2 DAG Lambda local S3 read missing ${field}.`);
  }
  return value;
}
