import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DEFAULT_REGION = "us-west-1";
const DEFAULT_CLUSTER = "certscore-web-cluster";
const DEFAULT_SERVICE = "certscore-web-certscore";
const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_SMOKE_URL = "https://kbdlab.io";
const DEFAULT_FALLBACK_DOMAIN = "webmd.com";
const REQUIRED_TOOLS = [
  "scan_site",
  "get_scan",
  "get_scan_status",
  "list_findings",
  "explain_finding",
  "get_pre_consent_cookies_trackers",
  "get_latest_domain_scan",
  "get_latest_domain_pre_consent_cookies_trackers"
] as const;

type ToolPayload = Record<string, unknown> & {
  type?: string;
  status?: string;
  scanId?: string;
  jobId?: string | null;
  domain?: string | null;
  scan?: {
    id?: string;
    scanId?: string;
    status?: string;
    domain?: string;
    noGo?: {
      reason?: string;
      title?: string;
      explanation?: string;
      recommendation?: string;
    };
  };
  noGo?: {
    reason?: string;
    title?: string;
    explanation?: string;
    recommendation?: string;
  };
  findings?: Array<{ id?: string }>;
  rows?: unknown[];
  summary?: {
    rowCount?: number;
  };
  pulse?: {
    scanId?: string;
    scan?: {
      scanId?: string;
    };
  };
};

type EcsContext = {
  region: string;
  cluster: string;
  service: string;
  taskDefinition: string;
  networkConfiguration: string;
  containerName: string;
  logGroup: string | null;
  logPrefix: string | null;
};

type SmokeKey = {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
  publicId: string;
  expiresAt: string;
  createdBy: string;
};

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv; allowFailure?: boolean } = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: options.env ?? process.env
  });
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}\n${result.stdout}${result.stderr}`
    );
  }
  return result;
}

function runJson<T>(command: string, args: string[], env?: NodeJS.ProcessEnv): T {
  const result = run(command, args, { env });
  return JSON.parse(result.stdout) as T;
}

function withoutApiKeyEnv() {
  const env = { ...process.env, CERTSCORE_BASE_URL: DEFAULT_BASE_URL };
  delete env.CERTSCORE_API_KEY;
  return env;
}

export function createSmokeKey(createdBy: string, ttlHours = 24): SmokeKey {
  const token = `cs_preview_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const [, kind, secret] = token.split("_");
  const tokenPrefix = `cs_${kind}_${secret?.slice(0, 8)}`;
  return {
    token,
    tokenHash,
    tokenPrefix,
    publicId: `api_key_${randomBytes(12).toString("base64url")}`,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString(),
    createdBy
  };
}

function getEcsContext(): EcsContext {
  const region = process.env.AWS_REGION?.trim() || DEFAULT_REGION;
  const cluster = process.env.ECS_CLUSTER_NAME?.trim() || DEFAULT_CLUSTER;
  const service = process.env.ECS_CERTSCORE_SERVICE_NAME?.trim() || DEFAULT_SERVICE;
  const serviceJson = runJson<{
    services: Array<{
      taskDefinition?: string;
      networkConfiguration?: unknown;
    }>;
  }>("aws", ["ecs", "describe-services", "--region", region, "--cluster", cluster, "--services", service, "--output", "json"]);
  const taskDefinition = serviceJson.services[0]?.taskDefinition;
  const networkConfiguration = serviceJson.services[0]?.networkConfiguration;
  if (!taskDefinition || !networkConfiguration) {
    throw new Error("Could not resolve ECS task definition or network configuration.");
  }

  const taskDefinitionJson = runJson<{
    taskDefinition: {
      containerDefinitions: Array<{
        name?: string;
        logConfiguration?: {
          options?: Record<string, string>;
        };
      }>;
    };
  }>("aws", ["ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json"]);
  const container = taskDefinitionJson.taskDefinition.containerDefinitions[0];
  if (!container?.name) {
    throw new Error("Could not resolve ECS container name.");
  }

  return {
    region,
    cluster,
    service,
    taskDefinition,
    networkConfiguration: JSON.stringify(networkConfiguration),
    containerName: container.name,
    logGroup: container.logConfiguration?.options?.["awslogs-group"] ?? null,
    logPrefix: container.logConfiguration?.options?.["awslogs-stream-prefix"] ?? null
  };
}

function runEcsOneOff(context: EcsContext, command: string[], environment: Array<{ name: string; value: string }>) {
  const overrides = JSON.stringify({
    containerOverrides: [
      {
        name: context.containerName,
        command,
        environment: [
          ...environment,
          { name: "PGCONNECT_TIMEOUT", value: "15" },
          { name: "PGOPTIONS", value: "-c lock_timeout=10000 -c statement_timeout=60000" }
        ]
      }
    ]
  });
  const started = runJson<{ failures: unknown[]; tasks: Array<{ taskArn?: string }> }>("aws", [
    "ecs",
    "run-task",
    "--region",
    context.region,
    "--cluster",
    context.cluster,
    "--task-definition",
    context.taskDefinition,
    "--launch-type",
    "FARGATE",
    "--network-configuration",
    context.networkConfiguration,
    "--overrides",
    overrides,
    "--output",
    "json"
  ]);
  if (started.failures.length > 0 || !started.tasks[0]?.taskArn) {
    throw new Error(`ECS run-task failed: ${JSON.stringify(started.failures)}`);
  }
  const taskArn = started.tasks[0].taskArn;
  run("aws", ["ecs", "wait", "tasks-stopped", "--region", context.region, "--cluster", context.cluster, "--tasks", taskArn]);
  const stopped = runJson<{
    tasks: Array<{
      containers: Array<{ name?: string; exitCode?: number; reason?: string }>;
    }>;
  }>("aws", ["ecs", "describe-tasks", "--region", context.region, "--cluster", context.cluster, "--tasks", taskArn, "--output", "json"]);
  const container = stopped.tasks[0]?.containers.find((candidate) => candidate.name === context.containerName);
  if (container?.exitCode !== 0) {
    throw new Error(`ECS task failed with exit code ${container?.exitCode ?? "unknown"}: ${container?.reason ?? "no reason"}`);
  }
  return taskArn;
}

function insertProductionKey(context: EcsContext, key: SmokeKey) {
  runEcsOneOff(
    context,
    ["node", "./apps/web/scripts/insert-integration-api-key.mjs"],
    [
      { name: "API_KEY_PUBLIC_ID", value: key.publicId },
      { name: "API_KEY_NAME", value: `CertScore MCP production smoke ${new Date().toISOString()}` },
      { name: "API_KEY_TOKEN_PREFIX", value: key.tokenPrefix },
      { name: "API_KEY_TOKEN_HASH", value: key.tokenHash },
      { name: "API_KEY_SCOPES", value: "pulse:read,pulse:scan,mcp" },
      { name: "API_KEY_EXPIRES_AT", value: key.expiresAt },
      { name: "API_KEY_CREATED_BY", value: key.createdBy }
    ]
  );
  console.log(`Inserted temporary production key hash prefix=${key.tokenPrefix} expiresAt=${key.expiresAt}`);
}

function revokeProductionKeys(context: EcsContext, createdBy: string) {
  const cleanupCode = [
    "const pg=require('pg');",
    "const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL_MODE==='disable'?false:{rejectUnauthorized:false}});",
    "client.connect()",
    ".then(()=>client.query(`update integration_api_keys set status = 'revoked', updated_at = timezone('utc', now()) where created_by = $1 and status = 'active' returning token_prefix`,[process.env.SMOKE_CREATED_BY]))",
    ".then((result)=>console.log(JSON.stringify({revoked:result.rowCount,tokenPrefixes:result.rows.map((row)=>row.token_prefix)})))",
    ".finally(()=>client.end())",
    ".catch((error)=>{console.error(error&&error.stack?error.stack:String(error));process.exit(1);});"
  ].join("");
  runEcsOneOff(context, ["node", "-e", cleanupCode], [{ name: "SMOKE_CREATED_BY", value: createdBy }]);
  console.log(`Revoked temporary production smoke keys createdBy=${createdBy}`);
}

function assertDoctorWithoutKey() {
  const result = run("certscore-mcp", ["doctor"], { env: withoutApiKeyEnv() });
  if (!result.stdout.includes("[ok] API health reachable at https://certscore.ai/api/v2/health")) {
    throw new Error("certscore-mcp doctor without a key did not reach production API health.");
  }
  console.log("doctor_without_key=ok");
}

function assertDoctorWithKey(token: string) {
  const result = run("certscore-mcp", ["doctor"], {
    env: { ...process.env, CERTSCORE_API_KEY: token, CERTSCORE_BASE_URL: DEFAULT_BASE_URL }
  });
  if (!result.stdout.includes("[ok] CERTSCORE_API_KEY is present")) {
    throw new Error("certscore-mcp doctor with a key did not detect the token.");
  }
  console.log("doctor_with_key=ok");
}

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>) {
  const first = result.content?.[0];
  if (!first || first.type !== "text") {
    throw new Error("MCP tool returned no text content.");
  }
  return JSON.parse(first.text) as ToolPayload;
}

function scanIdFrom(payload: ToolPayload) {
  return payload.scanId ?? payload.scan?.scanId ?? payload.scan?.id ?? payload.pulse?.scanId ?? payload.pulse?.scan?.scanId ?? null;
}

function summarize(label: string, payload: ToolPayload) {
  console.log(
    `${label}: ${JSON.stringify({
      type: payload.type ?? null,
      status: payload.status ?? payload.scan?.status ?? null,
      scanId: scanIdFrom(payload),
      jobId: payload.jobId ?? null,
      domain: payload.domain ?? payload.scan?.domain ?? null,
      findingCount: Array.isArray(payload.findings) ? payload.findings.length : undefined,
      rowCount: payload.summary?.rowCount ?? (Array.isArray(payload.rows) ? payload.rows.length : undefined),
      firstFindingId: payload.findings?.[0]?.id
    })}`
  );
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const payload = parseToolJson(result);
  if (result.isError) {
    throw new Error(`MCP tool ${name} failed: ${JSON.stringify(payload).slice(0, 2_000)}`);
  }
  return payload;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runInstalledMcpSmoke(token: string) {
  const smokeUrl = process.env.CERTSCORE_MCP_PROD_SMOKE_URL?.trim() || DEFAULT_SMOKE_URL;
  const fallbackDomain = process.env.CERTSCORE_MCP_PROD_SMOKE_FALLBACK_DOMAIN?.trim() || DEFAULT_FALLBACK_DOMAIN;
  const smokeDomain = new URL(smokeUrl).hostname.replace(/^www\./, "");
  const transport = new StdioClientTransport({
    command: "certscore-mcp",
    env: {
      ...process.env,
      CERTSCORE_API_KEY: token,
      CERTSCORE_BASE_URL: DEFAULT_BASE_URL
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "certscore-production-mcp-smoke", version: "0.1.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const toolNames = tools.tools.map((tool) => tool.name).sort();
    console.log(`tools=${toolNames.join(",")}`);
    for (const toolName of REQUIRED_TOOLS) {
      if (!toolNames.includes(toolName)) {
        throw new Error(`Missing required MCP tool: ${toolName}`);
      }
    }

    const noGoScanId = process.env.CERTSCORE_MCP_PROD_NO_GO_SCAN_ID?.trim();
    if (noGoScanId) {
      const noGoScan = await callTool(client, "get_scan", { scanId: noGoScanId });
      const noGo = noGoScan.noGo ?? noGoScan.scan?.noGo;
      assert.equal(noGoScan.status ?? noGoScan.scan?.status, "completed_limited");
      assert.ok(noGo?.reason, "Production no-go scan should retain a stable reason.");
      assert.ok(noGo?.title && noGo.title.length > 5, "Production no-go scan should include a customer-facing title.");
      assert.ok(noGo?.explanation && noGo.explanation.length > 10, "Production no-go scan should include an explanation.");
      assert.ok(noGo?.recommendation && noGo.recommendation.length > 10, "Production no-go scan should include a recommendation.");
      summarize("no_go_get_scan", noGoScan);
      console.log(`no_go_contract=passed reason=${noGo.reason} title=${JSON.stringify(noGo.title)}`);
    }

    const created = await callTool(client, "scan_site", {
      url: smokeUrl,
      detail: "standard",
      freshness: "refresh",
      scanFrom: "eu_ie"
    });
    summarize("scan_site", created);
    const scanId = scanIdFrom(created);
    if (!scanId) {
      throw new Error("scan_site did not return a usable scanId.");
    }

    let terminalStatus: ToolPayload | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const status = await callTool(client, "get_scan_status", { scanId });
      const statusValue = status.status ?? status.scan?.status ?? null;
      if (attempt === 0 || statusValue === "completed" || statusValue === "completed_limited") {
        summarize("get_scan_status", status);
      }
      if (statusValue === "completed" || statusValue === "completed_limited") {
        terminalStatus = status;
        break;
      }
      if (statusValue === "failed" || statusValue === "expired") {
        throw new Error(`Production scan reached ${statusValue}: ${JSON.stringify(status).slice(0, 2_000)}`);
      }
      await sleep(5_000);
    }
    if (!terminalStatus) {
      throw new Error(`Production scan ${scanId} did not complete within 10 minutes.`);
    }
    summarize("get_scan", await callTool(client, "get_scan", { scanId }));
    const findings = await callTool(client, "list_findings", { scanId });
    summarize("list_findings", findings);
    const cookies = await callTool(client, "get_pre_consent_cookies_trackers", { scanId });
    summarize("get_pre_consent_cookies_trackers", cookies);
    summarize("get_latest_domain_scan", await callTool(client, "get_latest_domain_scan", { domain: smokeDomain }));
    summarize(
      "get_latest_domain_pre_consent_cookies_trackers",
      await callTool(client, "get_latest_domain_pre_consent_cookies_trackers", { domain: smokeDomain })
    );

    let findingSource = { scanId, findings, cookies, label: smokeDomain };
    if ((findings.findings?.length ?? 0) === 0 || (cookies.summary?.rowCount ?? cookies.rows?.length ?? 0) === 0) {
      console.log(`primary_sparse=${smokeDomain}; checking fallback latest-domain ${fallbackDomain}`);
      const fallback = await callTool(client, "get_latest_domain_scan", { domain: fallbackDomain });
      summarize("fallback_get_latest_domain_scan", fallback);
      const fallbackScanId = scanIdFrom(fallback);
      if (!fallbackScanId) {
        throw new Error(`Fallback latest-domain scan did not return a scanId for ${fallbackDomain}.`);
      }
      const fallbackFindings = await callTool(client, "list_findings", { scanId: fallbackScanId });
      summarize("fallback_list_findings", fallbackFindings);
      const fallbackCookies = await callTool(client, "get_pre_consent_cookies_trackers", { scanId: fallbackScanId });
      summarize("fallback_get_pre_consent_cookies_trackers", fallbackCookies);
      findingSource = { scanId: fallbackScanId, findings: fallbackFindings, cookies: fallbackCookies, label: fallbackDomain };
    }

    const findingCount = findingSource.findings.findings?.length ?? 0;
    const rowCount = findingSource.cookies.summary?.rowCount ?? findingSource.cookies.rows?.length ?? 0;
    if (findingCount < 1) {
      throw new Error(`Production MCP smoke expected at least one finding from ${findingSource.label}.`);
    }
    if (rowCount < 1) {
      throw new Error(`Production MCP smoke expected at least one pre-consent cookies/trackers row from ${findingSource.label}.`);
    }

    const findingId = findingSource.findings.findings?.[0]?.id;
    if (!findingId) {
      throw new Error("Production MCP smoke could not resolve a findingId for explain_finding.");
    }
    summarize("explain_finding", await callTool(client, "explain_finding", { scanId: findingSource.scanId, findingId }));
    console.log(`production_mcp_smoke=passed source=${findingSource.label} findings=${findingCount} cookieRows=${rowCount}`);
  } finally {
    await client.close();
  }
}

async function main() {
  const version = run("certscore-mcp", ["--version"]).stdout.trim();
  console.log(`certscore_mcp_version=${version}`);
  assertDoctorWithoutKey();

  const context = getEcsContext();
  const createdBy = `codex-prod-mcp-smoke-${Date.now()}`;
  const key = createSmokeKey(createdBy);
  let inserted = false;
  try {
    insertProductionKey(context, key);
    inserted = true;
    assertDoctorWithKey(key.token);
    await runInstalledMcpSmoke(key.token);
  } finally {
    if (inserted) {
      revokeProductionKeys(context, createdBy);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
