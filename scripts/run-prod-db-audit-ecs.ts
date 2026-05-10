import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_CONTAINER_COMMAND = [
  "pnpm",
  "--filter",
  "@website-signal-risk-scanner/validation-worker",
  "ops:prod-db-audit"
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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      continue;
    }
    if (inlineValue !== undefined) {
      args.set(rawKey, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(rawKey, next);
      index += 1;
    } else {
      args.set(rawKey, "true");
    }
  }
  return args;
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

function getTaskId(taskArn: string) {
  return taskArn.split("/").at(-1) ?? taskArn;
}

function getContainerCommand() {
  const raw = getEnv("OPS_PROD_DB_AUDIT_COMMAND");
  return raw ? raw.split(/\s+/).filter(Boolean) : DEFAULT_CONTAINER_COMMAND;
}

function readInputJson(args: Map<string, string>) {
  const inline = args.get("input-json") ?? getEnv("OPS_PROD_DB_AUDIT_INPUT_JSON");
  const inputPath = args.get("input") ?? getEnv("OPS_PROD_DB_AUDIT_INPUT_FILE");
  if (inline && inputPath) {
    throw new Error("Pass only one of --input or --input-json.");
  }
  if (inline) {
    JSON.parse(inline);
    return inline;
  }
  if (inputPath) {
    const absolutePath = path.resolve(inputPath);
    const value = readFileSync(absolutePath, "utf8");
    JSON.parse(value);
    return value;
  }
  throw new Error("Missing audit input. Pass --input <file> or --input-json '<json>'.");
}

function getAuditName(args: Map<string, string>) {
  const value = args.get("audit") ?? getEnv("OPS_PROD_DB_AUDIT_NAME");
  if (!value) {
    throw new Error("Missing audit name. Pass --audit <name>.");
  }
  return value;
}

function getAuditEnvironment(args: Map<string, string>) {
  const inputJson = readInputJson(args);
  const encodedInput = Buffer.from(inputJson, "utf8").toString("base64");
  if (encodedInput.length > 100_000) {
    throw new Error("Audit input is too large for ECS environment overrides. Reduce the scan set or use a smaller scoped input.");
  }
  return [
    { name: "OPS_PROD_DB_AUDIT_INPUT_BASE64", value: encodedInput },
    { name: "OPS_PROD_DB_AUDIT_NAME", value: getAuditName(args) },
    { name: "OPS_PROD_DB_AUDIT_RUN_ID", value: args.get("run-id") ?? getEnv("OPS_PROD_DB_AUDIT_RUN_ID", `prod-db-audit-${Date.now()}`) }
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const region = getEnv("AWS_REGION", "us-west-1");
  const cluster = getRequiredEnv("OPS_PROD_DB_AUDIT_ECS_CLUSTER", getEnv("AWS_VALIDATION_ECS_CLUSTER", getEnv("AWS_SCANNER_ECS_CLUSTER")));
  const service = getRequiredEnv("OPS_PROD_DB_AUDIT_ECS_SERVICE", getEnv("AWS_VALIDATION_ECS_WORKER_SERVICE", "certscore-validation-worker"));

  const servicePayload = parseJson<{ services?: EcsService[] }>(
    await aws(["ecs", "describe-services", "--region", region, "--cluster", cluster, "--services", service, "--output", "json"])
  );
  const describedService = servicePayload.services?.[0];
  const taskDefinition = getEnv("OPS_PROD_DB_AUDIT_TASK_DEFINITION", describedService?.taskDefinition ?? "");
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
  const containerName = getEnv("OPS_PROD_DB_AUDIT_CONTAINER_NAME", container?.name ?? "");
  const logOptions = container?.logConfiguration?.options ?? {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];
  if (!containerName) {
    throw new Error(`Could not resolve audit container name from task definition ${taskDefinition}.`);
  }

  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: awsvpcConfiguration.assignPublicIp ?? "DISABLED",
      securityGroups: awsvpcConfiguration.securityGroups,
      subnets: awsvpcConfiguration.subnets
    }
  };
  const overrides = {
    containerOverrides: [
      {
        command: getContainerCommand(),
        environment: getAuditEnvironment(args),
        name: containerName
      }
    ]
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
    throw new Error(`ECS prod DB audit task failed to start: ${JSON.stringify(runTaskPayload.failures)}`);
  }
  const taskArn = runTaskPayload.tasks?.[0]?.taskArn;
  if (!taskArn) {
    throw new Error("ECS prod DB audit task did not return a task ARN.");
  }

  console.log(`Started AWS-side prod DB audit task: ${taskArn}`);
  await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);

  const taskPayload = parseJson<{ tasks?: TaskDescription[] }>(
    await aws(["ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"])
  );
  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const exitCode = taskContainer?.exitCode ?? 1;
  let messages: string[] = [];
  if (logGroup && logPrefix) {
    const streamName = `${logPrefix}/${containerName}/${getTaskId(taskArn)}`;
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
      console.error(`Could not fetch audit logs from ${logGroup}/${streamName}: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    });
    if (logs) {
      const payload = parseJson<{ events?: { message?: string }[] }>(logs);
      messages = payload.events?.map((event) => event.message).filter((message): message is string => Boolean(message)) ?? [];
    }
  }

  const outputPath = args.get("output") ?? getEnv("OPS_PROD_DB_AUDIT_OUTPUT_FILE");
  const joined = messages.join("\n");
  if (outputPath) {
    writeFileSync(path.resolve(outputPath), joined);
  }
  if (joined) {
    console.log(joined);
  }

  if (exitCode !== 0) {
    throw new Error(
      `AWS-side prod DB audit failed with exit code ${exitCode}. Task status ${task?.lastStatus ?? "unknown"}; reason ${
        taskContainer?.reason ?? task?.stoppedReason ?? "unknown"
      }.`
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
