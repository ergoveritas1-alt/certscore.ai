import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_CONTAINER_COMMAND = [
  "node",
  "--enable-source-maps",
  "./apps/validation-worker/dist/apps/validation-worker/scripts/prod-ops-db-probe.js"
];

type AwsVpcConfiguration = {
  assignPublicIp?: string;
  securityGroups?: string[];
  subnets?: string[];
};

type EcsService = {
  networkConfiguration?: {
    awsvpcConfiguration?: AwsVpcConfiguration;
  };
  taskDefinition?: string;
};

type ContainerDefinition = {
  logConfiguration?: {
    options?: Record<string, string>;
  };
  name?: string;
};

type TaskDescription = {
  containers?: {
    exitCode?: number;
    name?: string;
    reason?: string;
  }[];
  lastStatus?: string;
  stoppedReason?: string;
  taskArn?: string;
};

function getEnv(name: string, fallback = "") {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function getRequiredEnv(name: string, fallback = "") {
  const value = getEnv(name, fallback);

  if (!value) {
    throw new Error(`Missing required environment variable ${name}.`);
  }

  return value;
}

async function aws(args: string[]) {
  const { stdout } = await execFileAsync("aws", args, {
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function getTaskId(taskArn: string) {
  return taskArn.split("/").at(-1) ?? taskArn;
}

function getContainerCommand() {
  const raw = getEnv("OPS_AWS_DB_PROBE_COMMAND");
  return raw ? raw.split(/\s+/).filter(Boolean) : DEFAULT_CONTAINER_COMMAND;
}

function getProbeEnvironment() {
  return [
    "AWS_REGION",
    "OPS_BASE_URL",
    "OPS_HEARTBEAT_STALE_MINUTES",
    "OPS_REQUIRE_SCANNER_HEARTBEAT",
    "OPS_REQUIRE_VALIDATION_HEARTBEAT",
    "OPS_REPAIR_ORPHANED_QUEUED_SCANS",
    "OPS_SCAN_QUEUE_STALE_MINUTES",
    "OPS_SYNTHETIC_SCAN_DOMAIN",
    "OPS_SYNTHETIC_SCAN_ENABLED",
    "OPS_SYNTHETIC_SCAN_TIMEOUT_MINUTES",
  ]
    .map((name) => {
      const value = process.env[name];
      return value ? { name, value } : null;
    })
    .filter((entry): entry is { name: string; value: string } => Boolean(entry));
}

async function main() {
  const region = getEnv("AWS_REGION", "us-west-1");
  const cluster = getRequiredEnv(
    "OPS_AWS_MONITOR_ECS_CLUSTER",
    getEnv("OPS_RUNNER_ECS_CLUSTER", getEnv("AWS_VALIDATION_ECS_CLUSTER"))
  );
  const service = getRequiredEnv(
    "OPS_AWS_MONITOR_ECS_SERVICE",
    getEnv("OPS_RUNNER_ECS_SERVICE", getEnv("AWS_VALIDATION_ECS_WORKER_SERVICE", "certscore-validation-worker"))
  );

  const servicePayload = parseJson<{ services?: EcsService[] }>(
    await aws(["ecs", "describe-services", "--region", region, "--cluster", cluster, "--services", service, "--output", "json"])
  );
  const describedService = servicePayload.services?.[0];
  const taskDefinition = getEnv("OPS_AWS_MONITOR_TASK_DEFINITION", describedService?.taskDefinition ?? "");
  const awsvpcConfiguration = describedService?.networkConfiguration?.awsvpcConfiguration;

  if (!taskDefinition) {
    throw new Error(`Could not resolve task definition from ECS service ${cluster}/${service}.`);
  }

  if (!awsvpcConfiguration?.subnets?.length || !awsvpcConfiguration.securityGroups?.length) {
    throw new Error(`Could not resolve awsvpc network configuration from ECS service ${cluster}/${service}.`);
  }

  const taskDefinitionPayload = parseJson<{ taskDefinition?: { containerDefinitions?: ContainerDefinition[] } }>(
    await aws(["ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json"])
  );
  const container = taskDefinitionPayload.taskDefinition?.containerDefinitions?.[0];
  const containerName = getEnv("OPS_AWS_MONITOR_CONTAINER_NAME", container?.name ?? "");
  const logOptions = container?.logConfiguration?.options ?? {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];

  if (!containerName) {
    throw new Error(`Could not resolve monitor container name from task definition ${taskDefinition}.`);
  }

  const overrides = {
    containerOverrides: [
      {
        command: getContainerCommand(),
        environment: getProbeEnvironment(),
        name: containerName
      }
    ]
  };
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: awsvpcConfiguration.assignPublicIp ?? "DISABLED",
      securityGroups: awsvpcConfiguration.securityGroups,
      subnets: awsvpcConfiguration.subnets
    }
  };

  const runTaskPayload = parseJson<{ failures?: unknown[]; tasks?: { taskArn?: string }[] }>(
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
    throw new Error(`ECS monitor task failed to start: ${JSON.stringify(runTaskPayload.failures)}`);
  }

  const taskArn = runTaskPayload.tasks?.[0]?.taskArn;

  if (!taskArn) {
    throw new Error("ECS monitor task did not return a task ARN.");
  }

  console.log(`Started AWS-side prod DB probe task: ${taskArn}`);
  await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);

  const taskPayload = parseJson<{ tasks?: TaskDescription[] }>(
    await aws(["ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"])
  );
  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const exitCode = taskContainer?.exitCode ?? 1;

  if (logGroup && logPrefix) {
    const taskId = getTaskId(taskArn);
    const streamName = `${logPrefix}/${containerName}/${taskId}`;
    const logs = await aws([
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
    ]).catch((error) => {
      console.error(`Could not fetch probe logs from ${logGroup}/${streamName}: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    });

    if (logs) {
      const payload = parseJson<{ events?: { message?: string }[] }>(logs);
      const messages = payload.events?.map((event) => event.message).filter(Boolean) ?? [];

      if (messages.length > 0) {
        console.log(messages.join("\n"));
      }
    }
  }

  if (exitCode !== 0) {
    throw new Error(
      `AWS-side prod DB probe failed with exit code ${exitCode}. Task status ${task?.lastStatus ?? "unknown"}; reason ${
        taskContainer?.reason ?? task?.stoppedReason ?? "unknown"
      }.`
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
