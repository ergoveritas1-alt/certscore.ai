import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { assertDbBackedQueueMetadataCanary } from "../apps/web/scripts/load-test-safety";

const execFileAsync = promisify(execFile);

type CanaryRow = {
  completed_at: string | null;
  created_at: string | null;
  id: string;
  queue_origin: string | null;
  queue_priority: number | null;
  scan_type: string | null;
  source: string | null;
  started_at: string | null;
  status: string | null;
};

type TaskDescription = {
  containers?: Array<{ exitCode?: number; name?: string; reason?: string }>;
  lastStatus?: string;
  stoppedReason?: string;
  taskArn?: string;
};

const DEFAULT_CLUSTER = "certscore-validation-cluster";
const DEFAULT_SECURITY_GROUPS = ["sg-0503154fb5532cb04"];
const DEFAULT_SUBNETS = ["subnet-000adac289b27c3ac", "subnet-053d0eaa45152d300"];
const DEFAULT_TASK_DEFINITION = "certscore-prod-psql-oneoff:1";
const DEFAULT_CONTAINER_NAME = "psql";

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getEnv(name: string, fallback = "") {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function requireUuid(value: string | null, label: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function getTaskId(taskArn: string) {
  return taskArn.split("/").at(-1) ?? taskArn;
}

async function aws(args: string[]) {
  const { stdout } = await execFileAsync("aws", args, {
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function extractJsonBetweenMarkers(logs: string) {
  const match = /__LOAD_TEST_CANARY_DB_JSON_START__\s*([\s\S]*?)\s*__LOAD_TEST_CANARY_DB_JSON_END__/m.exec(logs);
  if (!match?.[1]) {
    throw new Error("Could not locate sanitized canary JSON in ECS task logs.");
  }
  return JSON.parse(match[1]) as CanaryRow[];
}

function buildSql(scanId: string) {
  return `
select coalesce(json_agg(row_to_json(row_data)), '[]'::json)
from (
  select
    id::text as id,
    status,
    scan_type,
    queue_origin,
    queue_priority,
    scan_config_json->>'source' as source,
    created_at::text as created_at,
    started_at::text as started_at,
    completed_at::text as completed_at
  from scans
  where id = '${scanId}'::uuid
) row_data;
`.trim();
}

async function main() {
  const scanId = requireUuid(getArg("--scan-id"), "--scan-id");
  const runDir = getArg("--run-dir");
  const outputPath = getArg("--output") ?? (runDir ? path.join(runDir, "canary-queue-metadata-db-check.json") : null);
  const logsPath = getArg("--logs-output") ?? (runDir ? path.join(runDir, "canary-queue-metadata-db-logs.json") : null);
  const taskPath = getArg("--task-output") ?? (runDir ? path.join(runDir, "canary-queue-metadata-db-task.json") : null);
  const taskArnPath = getArg("--task-arn-output") ?? (runDir ? path.join(runDir, "canary-queue-metadata-db-task-arn.txt") : null);
  const batchId = getArg("--batch-id") ?? (runDir ? path.basename(runDir) : null);
  const region = getEnv("AWS_REGION", "us-west-1");
  const cluster = getEnv("LOAD_TEST_CANARY_DB_ECS_CLUSTER", DEFAULT_CLUSTER);
  const taskDefinition = getEnv("LOAD_TEST_CANARY_DB_TASK_DEFINITION", DEFAULT_TASK_DEFINITION);
  const containerName = getEnv("LOAD_TEST_CANARY_DB_CONTAINER", DEFAULT_CONTAINER_NAME);
  const securityGroups = getEnv("LOAD_TEST_CANARY_DB_SECURITY_GROUPS", DEFAULT_SECURITY_GROUPS.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const subnets = getEnv("LOAD_TEST_CANARY_DB_SUBNETS", DEFAULT_SUBNETS.join(",")).split(",").map((item) => item.trim()).filter(Boolean);

  if (!outputPath) {
    throw new Error("Pass --output or --run-dir.");
  }

  const sql = buildSql(scanId);
  const queryB64 = Buffer.from(sql, "utf8").toString("base64");
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: "ENABLED",
      securityGroups,
      subnets
    }
  };
  const command = [
    "set -eu; test \"${PGSSLMODE:-}\" = require; printf %s \"$QUERY_B64\" | base64 -d > /tmp/query.sql; echo __LOAD_TEST_CANARY_DB_JSON_START__; psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off -P footer=off -t -A \"$DATABASE_URL\" -f /tmp/query.sql; echo __LOAD_TEST_CANARY_DB_JSON_END__"
  ];
  const overrides = {
    containerOverrides: [
      {
        command,
        environment: [{ name: "QUERY_B64", value: queryB64 }],
        name: containerName
      }
    ]
  };

  const runTaskPayload = parseJson<{ failures?: unknown[]; tasks?: Array<{ taskArn?: string }> }>(
    await aws([
      "ecs",
      "run-task",
      "--region",
      region,
      "--cluster",
      cluster,
      "--task-definition",
      taskDefinition,
      "--launch-type",
      "FARGATE",
      "--network-configuration",
      JSON.stringify(networkConfiguration),
      "--overrides",
      JSON.stringify(overrides),
      "--output",
      "json"
    ])
  );
  if (runTaskPayload.failures?.length) {
    throw new Error(`ECS canary DB task failed to start: ${JSON.stringify(runTaskPayload.failures)}`);
  }
  const taskArn = runTaskPayload.tasks?.[0]?.taskArn;
  if (!taskArn) {
    throw new Error("ECS canary DB task did not return a task ARN.");
  }
  if (taskArnPath) {
    mkdirSync(path.dirname(taskArnPath), { recursive: true });
    writeFileSync(taskArnPath, `${taskArn}\n`);
  }

  await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);
  const taskPayload = parseJson<{ tasks?: TaskDescription[] }>(
    await aws(["ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"])
  );
  if (taskPath) {
    mkdirSync(path.dirname(taskPath), { recursive: true });
    writeFileSync(taskPath, `${JSON.stringify(taskPayload, null, 2)}\n`);
  }

  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const exitCode = taskContainer?.exitCode ?? 1;
  const taskDefinitionPayload = parseJson<{
    taskDefinition?: {
      containerDefinitions?: Array<{
        logConfiguration?: { options?: Record<string, string> };
        name?: string;
      }>;
    };
  }>(await aws(["ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json"]));
  const logOptions =
    taskDefinitionPayload.taskDefinition?.containerDefinitions?.find((container) => container.name === containerName)?.logConfiguration?.options ??
    {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];
  if (!logGroup || !logPrefix) {
    throw new Error("Could not resolve psql one-off task log configuration.");
  }

  const streamName = `${logPrefix}/${containerName}/${getTaskId(taskArn)}`;
  const logsPayload = parseJson<{ events?: Array<{ message?: string }> }>(
    await aws([
      "logs",
      "get-log-events",
      "--region",
      region,
      "--log-group-name",
      logGroup,
      "--log-stream-name",
      streamName,
      "--start-from-head",
      "--output",
      "json"
    ])
  );
  const logMessages = logsPayload.events?.map((event) => event.message).filter((message): message is string => Boolean(message)) ?? [];
  if (logsPath) {
    mkdirSync(path.dirname(logsPath), { recursive: true });
    writeFileSync(logsPath, `${JSON.stringify({ taskArn, logGroup, streamName, messages: logMessages }, null, 2)}\n`);
  }

  const artifactBase = {
    batchId,
    checkedAt: new Date().toISOString(),
    evidence: "ecs-network-psql-oneoff",
    scanIds: [scanId],
    taskArn
  };

  if (exitCode !== 0) {
    const artifact = {
      ...artifactBase,
      error: `ECS psql one-off exited ${exitCode}`,
      result: "BLOCKED"
    };
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    throw new Error(`ECS psql one-off exited ${exitCode}.`);
  }

  let rows: CanaryRow[];
  try {
    rows = extractJsonBetweenMarkers(logMessages.join("\n"));
  } catch (error) {
    const artifact = {
      ...artifactBase,
      error: error instanceof Error ? error.message : String(error),
      result: "BLOCKED"
    };
    writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
    throw error;
  }

  let result: "PASS" | "FAIL" = "PASS";
  let error: string | null = null;
  try {
    assertDbBackedQueueMetadataCanary({
      expectedScanIds: [scanId],
      rows
    });
  } catch (caught) {
    result = "FAIL";
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const artifact = {
    ...artifactBase,
    result,
    rows: rows.map((row) => ({
      completed_at: row.completed_at,
      created_at: row.created_at,
      id: row.id,
      queue_origin: row.queue_origin,
      queue_priority: row.queue_priority,
      scan_type: row.scan_type,
      sourceBatchIdPresent: typeof row.source === "string" && row.source.includes(batchId ?? ""),
      sourceCanonicalShape: typeof row.source === "string" && /^prod-manifest-\d+-\d+-load-test-\d{8}-\d{4};/.test(row.source),
      started_at: row.started_at,
      status: row.status
    })),
    ...(error ? { error } : {})
  };
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  if (result !== "PASS") {
    throw new Error(error ?? "DB-backed canary failed.");
  }

  console.log(JSON.stringify({ result, outputPath, rowCount: rows.length }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
