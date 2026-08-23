import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);

type TaskDescription = {
  containers?: Array<{ exitCode?: number; name?: string; reason?: string }>;
  stoppedReason?: string;
};

type RunProdDbSqlInput = {
  marker: string;
  readOnly?: boolean;
  sql: string;
};

const DEFAULT_CLUSTER = "certscore-validation-cluster";
const DEFAULT_SECURITY_GROUPS = ["sg-0503154fb5532cb04"];
const DEFAULT_SUBNETS = ["subnet-000adac289b27c3ac", "subnet-053d0eaa45152d300"];
const DEFAULT_TASK_DEFINITION = "certscore-prod-psql-oneoff:1";
const DEFAULT_CONTAINER_NAME = "psql";

export async function runProdDbSqlOneoff(input: RunProdDbSqlInput) {
  const marker = input.marker.replace(/[^A-Z0-9_]/g, "_");
  if (!marker) throw new Error("A bounded output marker is required");
  const region = env("CALIBRATION_DB_ECS_REGION", "us-west-1");
  const cluster = env("CALIBRATION_DB_ECS_CLUSTER", DEFAULT_CLUSTER);
  const taskDefinition = env("CALIBRATION_DB_ECS_TASK_DEFINITION", DEFAULT_TASK_DEFINITION);
  const containerName = env("CALIBRATION_DB_ECS_CONTAINER", DEFAULT_CONTAINER_NAME);
  const securityGroups = csvEnv("CALIBRATION_DB_ECS_SECURITY_GROUPS", DEFAULT_SECURITY_GROUPS);
  const subnets = csvEnv("CALIBRATION_DB_ECS_SUBNETS", DEFAULT_SUBNETS);
  const sql = input.readOnly
    ? `begin transaction read only;\n${input.sql.replace(/;?\s*$/, ";")}\ncommit;`
    : input.sql.replace(/;?\s*$/, ";");
  const queryGzipB64 = gzipSync(Buffer.from(sql, "utf8"), { level: 9 }).toString("base64");
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: "ENABLED",
      securityGroups,
      subnets,
    },
  };
  const command = [
    `set -eu; test "\${PGSSLMODE:-}" = require; printf %s "$QUERY_GZIP_B64" | base64 -d | gzip -dc > /tmp/query.sql; echo __${marker}_START__; psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off -P footer=off -t -A "$DATABASE_URL" -f /tmp/query.sql; echo __${marker}_END__`,
  ];
  const overrides = {
    containerOverrides: [{
      command,
      environment: [{ name: "QUERY_GZIP_B64", value: queryGzipB64 }],
      name: containerName,
    }],
  };
  const runPayload = parseJson<{ failures?: unknown[]; tasks?: Array<{ taskArn?: string }> }>(await aws([
    "ecs", "run-task",
    "--region", region,
    "--cluster", cluster,
    "--task-definition", taskDefinition,
    "--launch-type", "FARGATE",
    "--network-configuration", JSON.stringify(networkConfiguration),
    "--overrides", JSON.stringify(overrides),
    "--output", "json",
  ]));
  if (runPayload.failures?.length) {
    throw new Error(`Production DB one-off failed to start: ${JSON.stringify(runPayload.failures)}`);
  }
  const taskArn = runPayload.tasks?.[0]?.taskArn;
  if (!taskArn) throw new Error("Production DB one-off did not return a task ARN");

  await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);
  const taskPayload = parseJson<{ tasks?: TaskDescription[] }>(await aws([
    "ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json",
  ]));
  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const taskDefinitionPayload = parseJson<{
    taskDefinition?: { containerDefinitions?: Array<{
      logConfiguration?: { options?: Record<string, string> };
      name?: string;
    }> };
  }>(await aws([
    "ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json",
  ]));
  const logOptions = taskDefinitionPayload.taskDefinition?.containerDefinitions
    ?.find((candidate) => candidate.name === containerName)?.logConfiguration?.options ?? {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];
  if (!logGroup || !logPrefix) throw new Error("Production DB one-off log configuration is unavailable");
  const taskId = taskArn.split("/").at(-1) ?? taskArn;
  const streamName = `${logPrefix}/${containerName}/${taskId}`;
  const logs = await readLogsWithRetry({ logGroup, marker, region, streamName });
  if ((taskContainer?.exitCode ?? 1) !== 0) {
    throw new Error(`Production DB one-off exited ${taskContainer?.exitCode ?? "unknown"}: ${taskContainer?.reason ?? task?.stoppedReason ?? logs}`);
  }
  return extractMarkedOutput(logs, marker);
}

export function extractMarkedOutput(logs: string, marker: string) {
  const safeMarker = marker.replace(/[^A-Z0-9_]/g, "_");
  const match = new RegExp(`__${safeMarker}_START__\\s*([\\s\\S]*?)\\s*__${safeMarker}_END__`, "m").exec(logs);
  if (!match) throw new Error(`Could not locate ${safeMarker} output in production DB one-off logs`);
  return match[1]?.trim() ?? "";
}

export function hasCompleteMarkedOutput(logs: string, marker: string) {
  const safeMarker = marker.replace(/[^A-Z0-9_]/g, "_");
  return logs.includes(`__${safeMarker}_START__`) && logs.includes(`__${safeMarker}_END__`);
}

export function parseSingleJsonOutput<T>(output: string): T {
  const line = output.split(/\r?\n/).map((value) => value.trim())
    .find((value) => value.startsWith("{") || value.startsWith("["));
  if (!line) throw new Error("Production DB one-off did not return JSON output");
  return JSON.parse(line) as T;
}

async function readLogsWithRetry(input: { logGroup: string; marker: string; region: string; streamName: string }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const logs = await readAllLogEvents(input);
      if (hasCompleteMarkedOutput(logs, input.marker)) return logs;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Production DB one-off logs did not contain the complete ${input.marker} output`);
}

async function readAllLogEvents(input: { logGroup: string; region: string; streamName: string }) {
  const messages: string[] = [];
  let nextToken: string | undefined;
  let previousToken: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const payload = parseJson<{
      events?: Array<{ message?: string }>;
      nextForwardToken?: string;
    }>(await aws([
      "logs", "get-log-events",
      "--region", input.region,
      "--log-group-name", input.logGroup,
      "--log-stream-name", input.streamName,
      "--start-from-head",
      ...(nextToken ? ["--next-token", nextToken] : []),
      "--output", "json",
    ]));
    messages.push(...(payload.events ?? [])
      .map((event) => event.message)
      .filter((message): message is string => Boolean(message)));
    const forwardToken = payload.nextForwardToken;
    if (!forwardToken || forwardToken === previousToken || forwardToken === nextToken) break;
    previousToken = nextToken;
    nextToken = forwardToken;
  }
  return messages.join("\n");
}

async function aws(args: string[]) {
  const { stdout } = await execFileAsync("aws", args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

function env(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function csvEnv(name: string, fallback: string[]) {
  return env(name, fallback.join(",")).split(",").map((value) => value.trim()).filter(Boolean);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}
