import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { SharedScanConfig } from "@website-signal-risk-scanner/shared";
import {
  buildLocalV2DagLambdaDispatchPayload,
  type LocalV2DagLambdaDispatchResult
} from "./local-v2-dag-lambda-dispatch";
import { handleLocalV2DagLambdaResultMessage } from "./local-v2-dag-lambda-result-poller";

const execFileAsync = promisify(execFile);

type LocalLambdaParitySummary = {
  fakeS3Root?: string;
  sqsMessages?: unknown[];
};

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
  const args = [
    "--env-file=apps/web/.env.local",
    "--import",
    "tsx",
    "scripts/run-local-v2-dag-lambda-parity.ts",
    "--",
    "--target-url",
    payload.targetUrl,
    "--aws-region",
    payload.awsRegion,
    "--profile",
    payload.profile,
    "--scan-id",
    payload.scanId,
    "--artifact-dir",
    artifactDir,
    "--out",
    outPath,
    "--variant",
    "wc01-local-simulated-lambda"
  ];

  if (payload.debugOverrides && Object.keys(payload.debugOverrides).length > 0) {
    args.push("--debug-overrides", JSON.stringify(payload.debugOverrides));
  }

  await execFileAsync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      CERTSCORE_V2_DAG_LAMBDA_SIMULATED: "true",
      PLAYWRIGHT_BROWSERS_PATH: "",
      TSX_TSCONFIG_PATH: "tsconfig.base.json"
    },
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
  for (const message of messages) {
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
