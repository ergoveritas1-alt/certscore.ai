import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WC01_MIGRATION = "0107_scan_runtime_egress_metadata.sql";
const WS01_MIGRATION = "0087_scan_runtime_egress_metadata.sql";
const REQUIRED_COLUMNS = [
  "scanner_task_arn",
  "scanner_task_definition_arn",
  "scanner_task_revision",
  "scanner_slot",
  "scanner_region",
  "egress_id",
  "egress_provider",
  "observed_outbound_ip"
] as const;

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

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
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

function buildMigrationPayload() {
  const wc01Sql = readFileSync(path.resolve("packages/db/migrations", WC01_MIGRATION), "utf8");
  const ws01Sql = readFileSync(path.resolve("../WS01/packages/db/migrations", WS01_MIGRATION), "utf8");
  return {
    migrations: [
      {
        checksum: sha256(wc01Sql),
        name: WC01_MIGRATION,
        sql: wc01Sql
      },
      {
        checksum: sha256(ws01Sql),
        name: WS01_MIGRATION,
        sql: ws01Sql
      }
    ],
    requiredColumns: REQUIRED_COLUMNS
  };
}

function buildNodeScript() {
  return String.raw`
const { Client } = require("pg");

function getSslConfig(mode) {
  switch (mode) {
    case "disable":
      return false;
    case "prefer":
      return undefined;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined;
  }
}

async function ensureMigrationsTable(client) {
  await client.query(
    "create table if not exists public.schema_migrations (" +
      "name text primary key, " +
      "checksum text not null, " +
      "applied_at timestamptz not null default now()" +
      ")"
  );
}

async function applyMigration(client, migration) {
  const existing = await client.query(
    "select checksum from public.schema_migrations where name = $1",
    [migration.name]
  );
  const existingChecksum = existing.rows[0]?.checksum ?? null;
  if (existingChecksum === migration.checksum) {
    console.log("SKIP " + migration.name);
    return;
  }
  if (existingChecksum && existingChecksum !== migration.checksum) {
    throw new Error("Migration checksum mismatch for " + migration.name + ".");
  }

  await client.query("begin");
  try {
    await client.query(migration.sql);
    await client.query(
      "insert into public.schema_migrations (name, checksum) " +
        "values ($1, $2) " +
        "on conflict (name) do update " +
        "set checksum = excluded.checksum, applied_at = now()",
      [migration.name, migration.checksum]
    );
    await client.query("commit");
    console.log("APPLY " + migration.name + " " + migration.checksum);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const encoded = process.env.PHASE1A_SCAN_METADATA_MIGRATION_BASE64;
  if (!encoded) {
    throw new Error("Missing PHASE1A_SCAN_METADATA_MIGRATION_BASE64.");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL.");
  }
  const client = new Client({
    connectionString,
    ssl: getSslConfig(process.env.DATABASE_SSL_MODE)
  });

  await client.connect();
  try {
    await ensureMigrationsTable(client);
    for (const migration of payload.migrations) {
      await applyMigration(client, migration);
    }
    const columnResult = await client.query(
      "select column_name " +
        "from information_schema.columns " +
        "where table_schema = 'public' " +
        "and table_name = 'scans' " +
        "and column_name = any($1::text[])",
      [payload.requiredColumns]
    );
    const found = new Set(columnResult.rows.map((row) => row.column_name));
    const missing = payload.requiredColumns.filter((column) => !found.has(column));
    if (missing.length > 0) {
      throw new Error("Missing columns after migration: " + missing.join(", "));
    }
    console.log("__PHASE1A_MIGRATION_JSON_START__");
    console.log(JSON.stringify({ columnsVerified: payload.requiredColumns, status: "ok" }, null, 2));
    console.log("__PHASE1A_MIGRATION_JSON_END__");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
}

async function main() {
  const region = getEnv("AWS_REGION", "us-west-1");
  const cluster = getRequiredEnv(
    "OPS_PROD_DB_AUDIT_ECS_CLUSTER",
    getEnv("OPS_RUNNER_ECS_CLUSTER", getEnv("AWS_VALIDATION_ECS_CLUSTER", getEnv("AWS_SCANNER_ECS_CLUSTER")))
  );
  const service = getRequiredEnv(
    "OPS_PROD_DB_AUDIT_ECS_SERVICE",
    getEnv("OPS_RUNNER_ECS_SERVICE", getEnv("AWS_VALIDATION_ECS_WORKER_SERVICE", "certscore-validation-worker"))
  );

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
    throw new Error(`Could not resolve migration container name from task definition ${taskDefinition}.`);
  }

  const payload = buildMigrationPayload();
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  if (encodedPayload.length > 100_000) {
    throw new Error("Migration payload is too large for ECS environment overrides.");
  }

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
      JSON.stringify({
        awsvpcConfiguration: {
          assignPublicIp: awsvpcConfiguration.assignPublicIp ?? "DISABLED",
          securityGroups: awsvpcConfiguration.securityGroups,
          subnets: awsvpcConfiguration.subnets
        }
      }),
      "--overrides",
      JSON.stringify({
        containerOverrides: [
          {
            command: [
              "pnpm",
              "--filter",
              "@website-signal-risk-scanner/db",
              "exec",
              "node",
              "-e",
              buildNodeScript()
            ],
            environment: [{ name: "PHASE1A_SCAN_METADATA_MIGRATION_BASE64", value: encodedPayload }],
            name: containerName
          }
        ]
      }),
      "--output",
      "json"
    ])
  );
  if (runTaskPayload.failures?.length) {
    throw new Error(`ECS migration task failed to start: ${JSON.stringify(runTaskPayload.failures)}`);
  }
  const taskArn = runTaskPayload.tasks?.[0]?.taskArn;
  if (!taskArn) {
    throw new Error("ECS migration task did not return a task ARN.");
  }

  console.log(`Started AWS-side Phase 1A migration task: ${taskArn}`);
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
      console.error(`Could not fetch migration logs from ${logGroup}/${streamName}: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    });
    if (logs) {
      const logPayload = parseJson<{ events?: { message?: string }[] }>(logs);
      messages = logPayload.events?.map((event) => event.message).filter((message): message is string => Boolean(message)) ?? [];
    }
  }

  const outputPath = getEnv("PHASE1A_MIGRATION_OUTPUT_FILE");
  if (outputPath) {
    writeFileSync(path.resolve(outputPath), `${messages.join("\n")}\n`);
  }
  for (const message of messages) {
    console.log(message);
  }

  if (exitCode !== 0) {
    throw new Error(`Phase 1A migration task failed with exit code ${exitCode}: ${taskContainer?.reason ?? "unknown"}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
