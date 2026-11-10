import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import {createHash} from "node:crypto";
import {existsSync,readFileSync,writeFileSync} from "node:fs";

const execFileAsync = promisify(execFile);

type TaskDescription = {
  taskArn?: string;
  lastStatus?: string;
  clusterArn?: string;
  taskDefinitionArn?: string;
  containers?: Array<{ exitCode?: number; name?: string; reason?: string }>;
  stoppedReason?: string;
};

type RunProdDbSqlInput = {
  marker: string;
  readOnly?: boolean;
  /** One-time large exports can pace stdout to avoid CloudWatch buffer loss. */
  logChunkThrottle?: boolean;
  sql: string;
  receiptDir: string;
  recoverStarted?: boolean;
};

const DEFAULT_CLUSTER = "certscore-validation-cluster";
const DEFAULT_SECURITY_GROUPS = ["sg-0503154fb5532cb04"];
const DEFAULT_SUBNETS = ["subnet-000adac289b27c3ac", "subnet-053d0eaa45152d300"];
const DEFAULT_TASK_DEFINITION = "certscore-prod-psql-oneoff:1";
const DEFAULT_CONTAINER_NAME = "psql";
const ECS_OVERRIDE_MAX_BYTES = 8192;
const MAC_MINI_DELTA_MARKER = "MACMINI_DELTA_IDS";

function compactDeltaCommand(marker: string, logChunkThrottle?: boolean) {
  // Compact launch syntax only. Retain the TLS gate, input/output files,
  // psql error handling, and the checksum path and markers used by recovery.
  const throttle = logChunkThrottle ? ' if (NR % 64 == 0) system("sleep 0.5");' : '';
  return [
    'set -eu',
    'cd /tmp',
    'test "$PGSSLMODE" = require',
    'echo "$QUERY_B64"|base64 -d|gzip -dc>q',
    `m=__${marker}`,
    'echo ${m}_START__',
    'psql -XwAtvON_ERROR_STOP=1 "$DATABASE_URL" -fq>a',
    'o=/tmp/audit-output.gz',
    'gzip -c a>$o',
    'sha256sum $o',
    `base64 <$o|tr -d '\\n'|fold -w8192|awk '{printf "__CHUNK_%08d__%s\\n",NR,$0;${throttle}}'`,
    'echo ${m}_END__',
  ].join(';');
}

export function prepareSqlOverride(input: Pick<RunProdDbSqlInput, 'marker'|'readOnly'|'sql'|'logChunkThrottle'>) {
  const marker = input.marker.replace(/[^A-Z0-9_]/g, "_");
  if (!marker) throw new Error("A bounded output marker is required");
  const containerName = env("CALIBRATION_DB_ECS_CONTAINER", DEFAULT_CONTAINER_NAME);
  const sql = input.readOnly
    ? `begin transaction read only;\n${input.sql.replace(/;?\s*$/, ";")}\ncommit;`
    : input.sql.replace(/;?\s*$/, ";");
  const sqlBytes = Buffer.from(sql, "utf8");
  const defaultGzip = gzipSync(sqlBytes, { level: 9 });
  // A smaller deflate buffer separates the high-entropy pending UUIDs from
  // repetitive SQL more effectively. Keep the smaller standard gzip stream.
  const compactGzip = gzipSync(sqlBytes, { level: 9, memLevel: 5 });
  const queryGzipB64 = (compactGzip.length < defaultGzip.length ? compactGzip : defaultGzip).toString("base64");
  const command = marker === MAC_MINI_DELTA_MARKER && input.readOnly ? [compactDeltaCommand(marker, input.logChunkThrottle)] : [
    `set -eu; test "\${PGSSLMODE:-}" = require; printf %s "$QUERY_B64" | base64 -d | gzip -dc > /tmp/query.sql; echo __${marker}_START__; psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off -P footer=off -t -A "$DATABASE_URL" -f /tmp/query.sql > /tmp/audit-output.txt; gzip -c /tmp/audit-output.txt > /tmp/audit-output.gz; sha256sum /tmp/audit-output.gz; base64 /tmp/audit-output.gz | tr -d '\\n' | fold -w 8192 | awk '{printf "__CHUNK_%08d__%s\\n", NR, $0;${input.logChunkThrottle ? ' if (NR % 64 == 0) system("sleep 0.5");' : ''}}'; echo __${marker}_END__`,
  ];
  const overrides = JSON.stringify({
    containerOverrides: [{
      command,
      environment: [{ name: "QUERY_B64", value: queryGzipB64 }],
      name: containerName,
    }],
  });
  return {marker,containerName,overrides,bytes:Buffer.byteLength(overrides)};
}

export function auditSqlOverrideFits(input: Pick<RunProdDbSqlInput, 'marker'|'readOnly'|'sql'|'logChunkThrottle'>) {
  const {bytes}=prepareSqlOverride(input);
  return {bytes,limitBytes:ECS_OVERRIDE_MAX_BYTES,fits:bytes<=ECS_OVERRIDE_MAX_BYTES};
}

export async function runProdDbSqlOneoff(input: RunProdDbSqlInput) {
  const {marker,containerName,overrides,bytes}=prepareSqlOverride(input);
  const dailyDelta = marker === MAC_MINI_DELTA_MARKER && input.readOnly === true;
  if(input.recoverStarted && !dailyDelta)throw Error('Only the read-only daily delta supports started-task recovery');
  if(!input.recoverStarted && bytes>ECS_OVERRIDE_MAX_BYTES)throw Error(`ECS SQL launch override exceeds ${ECS_OVERRIDE_MAX_BYTES} bytes (${bytes}); no task started`);
  const region = env("CALIBRATION_DB_ECS_REGION", "us-west-1");
  const cluster = env("CALIBRATION_DB_ECS_CLUSTER", DEFAULT_CLUSTER);
  const taskDefinition = env("CALIBRATION_DB_ECS_TASK_DEFINITION", DEFAULT_TASK_DEFINITION);
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: "ENABLED",
      securityGroups: csvEnv("CALIBRATION_DB_ECS_SECURITY_GROUPS", DEFAULT_SECURITY_GROUPS),
      subnets: csvEnv("CALIBRATION_DB_ECS_SUBNETS", DEFAULT_SUBNETS),
    },
  };
  type StartedTask = { taskArn?: string; clusterArn?: string; taskDefinitionArn?: string };
  const startedFile = `${input.receiptDir}/started-${marker}.json`;
  const taskFile = `${input.receiptDir}/task-${marker}.json`;
  const withoutOverrides = (key:string,value:unknown) => key === 'overrides' ? undefined : value;
  if (!input.recoverStarted && existsSync(startedFile)) throw Error('A task receipt already exists; recover its output');
  const runPayload = parseJson<{ failures?: unknown[]; tasks?: StartedTask[] }>(input.recoverStarted ? readFileSync(startedFile,'utf8') : await aws([
    "ecs", "run-task",
    "--region", region,
    "--cluster", cluster,
    "--task-definition", taskDefinition,
    "--launch-type", "FARGATE",
    "--network-configuration", JSON.stringify(networkConfiguration),
    "--overrides", overrides,
    "--output", "json",
  ], dailyDelta ? { singleAttempt: true } : undefined));
  if (runPayload.failures?.length) {
    throw new Error(`Production DB one-off failed to start: ${JSON.stringify(runPayload.failures)}`);
  }
  if (!input.recoverStarted) writeFileSync(startedFile,JSON.stringify(runPayload,withoutOverrides,2)+"\n",{flag:"wx"});
  const started = runPayload.tasks?.[0];
  const taskArn = started?.taskArn;
  if (!taskArn) throw new Error("Production DB one-off did not return a task ARN");
  if (dailyDelta && (runPayload.tasks?.length !== 1 || !started.clusterArn || !started.taskDefinitionArn ||
      !taskArn.startsWith(`arn:aws:ecs:${region}:`) ||
      (cluster.startsWith('arn:') ? started.clusterArn !== cluster : !started.clusterArn.endsWith('/'+cluster)) ||
      !matchesTaskDefinition(started.taskDefinitionArn,taskDefinition))) {
    throw Error('Started task does not match the configured daily query topology');
  }
  const describeTask = ["ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"];
  let taskPayload: { tasks?: TaskDescription[] };
  if (dailyDelta) {
    taskPayload = await readStoppedDeltaTask(describeTask, taskArn);
    if (taskPayload.tasks?.[0]?.clusterArn !== started.clusterArn ||
        taskPayload.tasks?.[0]?.taskDefinitionArn !== started.taskDefinitionArn) {
      throw Error('Stopped task does not match its original launch receipt');
    }
  } else {
    await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);
    taskPayload = parseJson(await aws(describeTask));
  }
  const terminalReceipt = JSON.stringify(taskPayload,withoutOverrides,2)+"\n";
  if (!existsSync(taskFile)) writeFileSync(taskFile,terminalReceipt,{flag:"wx"});
  else if (!input.recoverStarted) throw Error('Unexpected terminal task receipt already exists');
  else {
    const prior = parseJson<{ tasks?: TaskDescription[] }>(readFileSync(taskFile,'utf8'));
    if (prior.tasks?.length !== 1 || prior.tasks[0]?.taskArn !== taskArn || prior.tasks[0]?.lastStatus !== 'STOPPED') {
      throw Error('Existing terminal receipt does not match the stopped daily task');
    }
  }
  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const taskDefinitionPayload = parseJson<{
    taskDefinition?: { containerDefinitions?: Array<{
      logConfiguration?: { options?: Record<string, string> };
      name?: string;
    }> };
  }>(await aws([
    "ecs", "describe-task-definition", "--region", region, "--task-definition", dailyDelta ? started.taskDefinitionArn! : taskDefinition, "--output", "json",
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
  const marked=extractMarkedOutput(logs,marker);const expected=/([a-f0-9]{64})\s+\/tmp\/audit-output.gz/.exec(marked)?.[1];
  const rawParts=[...marked.matchAll(/__CHUNK_(\d+)__([A-Za-z0-9+/=]+)/g)].map(m=>({n:Number(m[1]),s:m[2]!})).sort((a,b)=>a.n-b.n);
  const indexed=new Map<number,string>();for(const p of rawParts){if(indexed.has(p.n)&&indexed.get(p.n)!==p.s)throw Error('Conflicting duplicate transport chunk');indexed.set(p.n,p.s);}const parts=[...indexed].map(([n,s])=>({n,s})).sort((a,b)=>a.n-b.n);
  if(!parts.length)throw Error('No compressed chunks; check shell transport output');
  if(parts.some((p,i)=>p.n!==i+1))throw Error('Noncontiguous compressed export chunks');
  const compressed=Buffer.from(parts.map(p=>p.s).join(''),'base64');
  if(createHash('sha256').update(compressed).digest('hex')!==expected)throw Error('Compressed export SHA-256 mismatch');
  return gunzipSync(compressed).toString('utf8');
}

function matchesTaskDefinition(arn: string, configured: string) {
  const actual = configured.startsWith('arn:') ? arn : arn.slice(arn.lastIndexOf('/')+1);
  return actual === configured || actual.slice(0,actual.lastIndexOf(':')) === configured;
}

async function readStoppedDeltaTask(args: string[], taskArn: string) {
  const deadline = Date.now() + 180_000;
  do {
    let stdout: string | undefined;
    try {
      stdout = await aws(args,{singleAttempt:true});
    } catch (error) {
      const message = String((error as { stderr?: string }).stderr ?? '');
      if (!/connection was closed|could not connect to the endpoint|read timeout|connect timeout|Throttl|ServiceUnavailable|ServerException/i.test(message)) throw error;
    }
    if (stdout) {
      const payload = parseJson<{ tasks?: TaskDescription[]; failures?: Array<{ arn?:string; reason?:string }> }>(stdout);
      const task = payload.tasks?.[0];
      if (payload.tasks?.length === 1 && task?.taskArn === taskArn && !payload.failures?.length) {
        if (task.lastStatus === 'STOPPED') return payload;
      } else if (payload.tasks?.length || !payload.failures?.length ||
        !payload.failures.every(failure => failure.arn === taskArn && failure.reason === 'MISSING')) {
        throw Error('Unexpected response for the started daily query task');
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for the existing daily query task; recover its output from the started receipt');
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
      if (hasCompleteMarkedOutput(logs, input.marker)) { const nums=[...new Set([...logs.matchAll(/__CHUNK_(\d+)__/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b); if(nums.length&&nums.every((n,i)=>n===i+1))return logs; }
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
      nextToken?: string;
    }>(await aws([
      "logs", "filter-log-events",
      "--region", input.region,
      "--log-group-name", input.logGroup,
      "--log-stream-names", input.streamName,
      "--no-paginate", "--limit", "100",
      ...(nextToken ? ["--next-token", nextToken] : []),
      "--output", "json",
    ]));
    messages.push(...(payload.events ?? [])
      .map((event) => event.message)
      .filter((message): message is string => Boolean(message)));
    const forwardToken = payload.nextToken;
    if (!forwardToken || forwardToken === previousToken || forwardToken === nextToken) break;
    previousToken = nextToken;
    nextToken = forwardToken;
  }
  return messages.join("\n");
}

async function aws(args: string[], options?: { singleAttempt: boolean }) {
  const { stdout } = await execFileAsync("aws", options ? [...args,'--cli-connect-timeout','8','--cli-read-timeout','20'] : args, {
    maxBuffer: 64 * 1024 * 1024,
    ...(options?.singleAttempt ? { env: { ...process.env, AWS_MAX_ATTEMPTS:'1' } } : {}),
  });
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
