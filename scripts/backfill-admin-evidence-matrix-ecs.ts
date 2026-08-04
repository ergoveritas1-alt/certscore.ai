import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MATRIX_VERSION = "admin_evidence_matrix.v2";

type EcsService = {
  networkConfiguration?: {
    awsvpcConfiguration?: {
      assignPublicIp?: string;
      securityGroups?: string[];
      subnets?: string[];
    };
  };
  taskDefinition?: string;
};

type ContainerDefinition = {
  logConfiguration?: { options?: Record<string, string> };
  name?: string;
};

type TaskDescription = {
  containers?: Array<{ exitCode?: number; name?: string; reason?: string }>;
  lastStatus?: string;
  stoppedReason?: string;
};

function parseArgs(values: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value?.startsWith("--")) continue;
    const [rawKey, inlineValue] = value.slice(2).split("=", 2);
    if (!rawKey) continue;
    if (inlineValue !== undefined) {
      args.set(rawKey, inlineValue);
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args.set(rawKey, next);
      index += 1;
    } else {
      args.set(rawKey, "true");
    }
  }
  return args;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : fallback;
}

function requiredTimestamp(args: Map<string, string>, name: "since" | "until") {
  const value = args.get(name)?.trim();
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Pass --${name} with an explicit ISO-8601 timestamp.`);
  }
  return new Date(value).toISOString();
}

async function aws(args: string[]) {
  const result = await execFileAsync("aws", args, { maxBuffer: 20 * 1024 * 1024 });
  return result.stdout;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function taskId(taskArn: string) {
  return taskArn.split("/").at(-1) ?? taskArn;
}

async function waitForTaskStopped(input: { cluster: string; region: string; taskArn: string }) {
  const deadlineAt = Date.now() + 30 * 60_000;
  while (Date.now() < deadlineAt) {
    const described = parseJson<{ tasks?: TaskDescription[] }>(await aws([
      "ecs", "describe-tasks", "--region", input.region, "--cluster", input.cluster,
      "--tasks", input.taskArn, "--output", "json"
    ]));
    if (described.tasks?.[0]?.lastStatus === "STOPPED") return;
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`Admin matrix backfill task did not stop within 30 minutes: ${input.taskArn}`);
}

function remoteProgram() {
  return String.raw`
const { Client } = require("pg");

const apply = process.env.ADMIN_MATRIX_BACKFILL_APPLY === "true";
const since = process.env.ADMIN_MATRIX_BACKFILL_SINCE;
const until = process.env.ADMIN_MATRIX_BACKFILL_UNTIL;
const limit = Number.parseInt(process.env.ADMIN_MATRIX_BACKFILL_LIMIT || "100", 10);
const concurrency = Number.parseInt(process.env.ADMIN_MATRIX_BACKFILL_CONCURRENCY || "2", 10);
const expectedVersion = process.env.ADMIN_MATRIX_BACKFILL_VERSION;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL_MODE === "disable" ? false : { rejectUnauthorized: false }
});

async function loadCanonicalMaterializer() {
  const fs = require("node:fs");
  const routePath = "/app/apps/web/.next/server/app/api/scan-status/[scanId]/route.js";
  const routeSource = fs.readFileSync(routePath, "utf8");
  const dynamicImport = routeSource.match(
    /materializeAdminScanSummary:[^}]+}\s*=\s*await Promise\.all\(\[([^\]]+)]\)\.then\((\w+)\.bind\(\2,(\d+)\)\)/
  );
  if (!dynamicImport) {
    throw new Error("Canonical Admin summary materializer import was not discoverable in the production bundle.");
  }
  const chunkIds = [...dynamicImport[1].matchAll(/\.e\((\d+)\)/g)].map((match) => Number(match[1]));
  const moduleId = Number(dynamicImport[3]);
  if (chunkIds.length === 0 || !Number.isInteger(moduleId)) {
    throw new Error("Canonical Admin summary materializer bundle metadata was invalid.");
  }
  require(routePath);
  const webpackRuntime = require("/app/apps/web/.next/server/webpack-runtime.js");
  await Promise.all(chunkIds.map((chunkId) => webpackRuntime.e(chunkId)));
  const materializerModule = await webpackRuntime(moduleId);
  if (typeof materializerModule.materializeAdminScanSummary !== "function") {
    throw new Error("Canonical Admin summary materializer was not available in the production image.");
  }
  return materializerModule.materializeAdminScanSummary;
}

async function main() {
  await client.connect();
  const candidates = await client.query(
    "select s.id, s.organization_id, d.hostname, s.created_at " +
    "from public.scans s " +
    "join public.domains d on d.id = s.domain_id " +
    "left join public.scan_snapshots ss on ss.scan_id = s.id " +
    "where s.status = 'completed' " +
    "and s.created_at >= $1::timestamptz and s.created_at < $2::timestamptz " +
    "and (ss.admin_evidence_matrix is null or ss.admin_evidence_matrix ->> 'version' is distinct from $3) " +
    "order by s.created_at asc limit $4",
    [since, until, expectedVersion, limit]
  );
  console.log(JSON.stringify({
    apply,
    candidateCount: candidates.rowCount,
    candidates: candidates.rows.map((row) => ({ createdAt: row.created_at, domain: row.hostname, scanId: row.id })),
    concurrency,
    event: "admin_evidence_matrix.backfill_selected",
    limit,
    since,
    until
  }));
  if (!apply || candidates.rows.length === 0) return;

  const materializeAdminScanSummary = await loadCanonicalMaterializer();

  let nextIndex = 0;
  const outcomes = [];
  async function worker() {
    while (nextIndex < candidates.rows.length) {
      const row = candidates.rows[nextIndex++];
      try {
        const summary = await materializeAdminScanSummary(row.id, row.organization_id);
        const verified = await client.query(
          "select admin_evidence_matrix ->> 'version' as version from public.scan_snapshots where scan_id = $1::uuid",
          [row.id]
        );
        const version = verified.rows[0]?.version || null;
        if (!summary?.adminEvidenceMatrix || version !== expectedVersion) {
          throw new Error("Admin evidence matrix verification failed after canonical materialization.");
        }
        outcomes.push({ domain: row.hostname, scanId: row.id, status: "projected", version });
      } catch (error) {
        outcomes.push({
          domain: row.hostname,
          error: error instanceof Error ? error.message : String(error),
          scanId: row.id,
          status: "failed"
        });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.rows.length) }, () => worker()));
  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  console.log(JSON.stringify({
    event: "admin_evidence_matrix.backfill_completed",
    failed: failed.length,
    outcomes,
    projected: outcomes.length - failed.length,
    selected: candidates.rows.length
  }));
  const audit = await client.query(
    "select s.id, d.hostname, ss.admin_evidence_matrix " +
    "from public.scans s " +
    "join public.domains d on d.id = s.domain_id " +
    "join public.scan_snapshots ss on ss.scan_id = s.id " +
    "where s.id = any($1::uuid[]) order by s.created_at asc",
    [candidates.rows.map((row) => row.id)]
  );
  console.log(JSON.stringify({
    event: "admin_evidence_matrix.backfill_audit",
    rows: audit.rows.map((row) => {
      const matrix = row.admin_evidence_matrix || {};
      const results = matrix.transparency?.results || {};
      return {
        domain: row.hostname,
        policyEvidence: matrix.policyEvidence || null,
        privacyNotice: matrix.privacyConsent?.privacyNotice?.status || null,
        scanId: row.id,
        transparency: Object.fromEntries(
          Object.entries(results).map(([code, result]) => [code, result?.status || null])
        ),
        version: matrix.version || null
      };
    }),
    selected: candidates.rows.length
  }));
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(JSON.stringify({
      error: error instanceof Error ? error.stack || error.message : String(error),
      event: "admin_evidence_matrix.backfill_fatal"
    }));
    process.exitCode = 1;
  })
  .finally(() => client.end().catch(() => undefined));
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.get("apply") === "true";
  const since = requiredTimestamp(args, "since");
  const until = requiredTimestamp(args, "until");
  if (Date.parse(until) <= Date.parse(since)) {
    throw new Error("--until must be later than --since.");
  }
  const limit = boundedInteger(args.get("limit"), 100, 1, 500);
  const concurrency = boundedInteger(args.get("concurrency"), 2, 1, 4);
  const region = process.env.AWS_REGION?.trim() || "us-west-1";
  const cluster = process.env.ADMIN_MATRIX_BACKFILL_ECS_CLUSTER?.trim() || "certscore-web-cluster";
  const service = process.env.ADMIN_MATRIX_BACKFILL_ECS_SERVICE?.trim() || "certscore-web-certscore";

  const servicePayload = parseJson<{ services?: EcsService[] }>(await aws([
    "ecs", "describe-services", "--region", region, "--cluster", cluster, "--services", service, "--output", "json"
  ]));
  const describedService = servicePayload.services?.[0];
  const taskDefinition = describedService?.taskDefinition;
  const network = describedService?.networkConfiguration?.awsvpcConfiguration;
  if (!taskDefinition || !network?.subnets?.length || !network.securityGroups?.length) {
    throw new Error(`Could not resolve the production ECS task or network for ${cluster}/${service}.`);
  }
  const taskDefinitionPayload = parseJson<{ taskDefinition?: { containerDefinitions?: ContainerDefinition[] } }>(await aws([
    "ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json"
  ]));
  const container = taskDefinitionPayload.taskDefinition?.containerDefinitions?.find((entry) => entry.name === "certscore-web") ??
    taskDefinitionPayload.taskDefinition?.containerDefinitions?.[0];
  if (!container?.name) throw new Error("Could not resolve the CertScore web container.");

  const overrides = {
    containerOverrides: [{
      command: ["node", "-e", remoteProgram()],
      environment: [
        { name: "ADMIN_MATRIX_BACKFILL_APPLY", value: apply ? "true" : "false" },
        { name: "ADMIN_MATRIX_BACKFILL_CONCURRENCY", value: String(concurrency) },
        { name: "ADMIN_MATRIX_BACKFILL_LIMIT", value: String(limit) },
        { name: "ADMIN_MATRIX_BACKFILL_SINCE", value: since },
        { name: "ADMIN_MATRIX_BACKFILL_UNTIL", value: until },
        { name: "ADMIN_MATRIX_BACKFILL_VERSION", value: MATRIX_VERSION },
        { name: "PGCONNECT_TIMEOUT", value: "15" },
        { name: "PGOPTIONS", value: "-c lock_timeout=10000 -c statement_timeout=120000" }
      ],
      name: container.name
    }]
  };
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: network.assignPublicIp ?? "DISABLED",
      securityGroups: network.securityGroups,
      subnets: network.subnets
    }
  };
  const runTask = parseJson<{ failures?: unknown[]; tasks?: Array<{ taskArn?: string }> }>(await aws([
    "ecs", "run-task", "--region", region, "--cluster", cluster, "--task-definition", taskDefinition,
    "--launch-type", "FARGATE", "--network-configuration", JSON.stringify(networkConfiguration),
    "--overrides", JSON.stringify(overrides), "--output", "json"
  ]));
  if (runTask.failures?.length || !runTask.tasks?.[0]?.taskArn) {
    throw new Error(`Admin matrix backfill task failed to start: ${JSON.stringify(runTask.failures ?? [])}`);
  }
  const taskArn = runTask.tasks[0].taskArn;
  console.log(`Started ${apply ? "apply" : "dry-run"} task ${taskArn}`);
  await waitForTaskStopped({ cluster, region, taskArn });
  const described = parseJson<{ tasks?: TaskDescription[] }>(await aws([
    "ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"
  ]));
  const task = described.tasks?.[0];
  const taskContainer = task?.containers?.find((entry) => entry.name === container.name) ?? task?.containers?.[0];
  const logOptions = container.logConfiguration?.options ?? {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];
  if (logGroup && logPrefix) {
    const stream = `${logPrefix}/${container.name}/${taskId(taskArn)}`;
    const logPayload = parseJson<{ events?: Array<{ message?: string }> }>(await aws([
      "logs", "get-log-events", "--region", region, "--log-group-name", logGroup,
      "--log-stream-name", stream, "--start-from-head", "--output", "json"
    ]));
    for (const event of logPayload.events ?? []) {
      if (event.message) console.log(event.message);
    }
  }
  if (taskContainer?.exitCode !== 0) {
    throw new Error(`Admin matrix backfill task exited ${taskContainer?.exitCode ?? "without a code"}: ${taskContainer?.reason ?? task?.stoppedReason ?? "unknown"}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
