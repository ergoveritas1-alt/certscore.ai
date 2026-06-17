import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { query } from "../packages/db/src/postgres";
import { pollLocalV2DagLambdaResultQueue } from "../apps/web/server/scans/local-v2-dag-lambda-result-poller";

type Mode = "lambda" | "localhost";

type Args = {
  baseUrl: string;
  domains: string[];
  lambdaDebugOverrides: Record<string, unknown> | null;
  mode: "paired" | "lambda-only" | "localhost-only";
  outPath: string;
  profile: "full" | "tiny";
  variantLabel: string | null;
};

type RunResult = {
  completedAt: string | null;
  createdAt: string | null;
  domain: string;
  elapsedMs: number;
  error?: string;
  events: string[];
  mode: Mode;
  outDir: string | null;
  scanId: string;
  startedAt: string | null;
  status: string;
  submitMs: number;
};

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  const results: RunResult[] = [];
  for (const mode of modesForRun(args.mode)) {
    for (const domain of args.domains) {
      try {
        results.push(await runOne({ args, domain, mode }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ domain, error: message, event: "failed", mode }));
        results.push({
          completedAt: null,
          createdAt: null,
          domain,
          elapsedMs: 0,
          error: message,
          events: [],
          mode,
          outDir: null,
          scanId: "",
          startedAt: null,
          status: "failed",
          submitMs: 0
        });
      }
      await writeBenchmark(args, results);
    }
  }
  console.log(`Wrote ${args.outPath}`);
}

async function runOne(input: { args: Args; domain: string; mode: Mode }): Promise<RunResult> {
  const wallStartedAt = Date.now();
  const submitted = await submitScan(input);
  console.log(JSON.stringify({
    domain: input.domain,
    event: "submitted",
    mode: input.mode,
    scanId: submitted.scanId,
    submitMs: submitted.submitMs
  }));
  const completed = await waitForArtifact({
    mode: input.mode,
    scanId: submitted.scanId
  });
  const elapsedMs = Date.now() - wallStartedAt;
  const events = await loadScanEvents(submitted.scanId);
  const result = {
    completedAt: completed.row.completed_at,
    createdAt: completed.row.created_at,
    domain: input.domain,
    elapsedMs,
    events,
    mode: input.mode,
    outDir: completed.outDir,
    scanId: submitted.scanId,
    startedAt: completed.row.started_at,
    status: completed.row.status,
    submitMs: submitted.submitMs
  };
  console.log(JSON.stringify({
    domain: input.domain,
    elapsedMs,
    event: "completed",
    mode: input.mode,
    outDir: completed.outDir,
    scanId: submitted.scanId
  }));
  return result;
}

async function submitScan(input: { args: Args; domain: string; mode: Mode }) {
  const startedAt = Date.now();
  const response = await fetch(`${input.args.baseUrl.replace(/\/$/, "")}/api/full-scan`, {
    body: JSON.stringify({
      domain: input.domain,
      forceNewScan: true,
      ...(input.mode === "lambda" && input.args.lambdaDebugOverrides
        ? { localV2DagLambdaDebugOverrides: input.args.lambdaDebugOverrides }
        : {}),
      localV2RunViaLambda: input.mode === "lambda",
      localV2ScanProfile: input.args.profile
    }),
    headers: {
      "content-type": "application/json",
      "x-certscore-scan-source": `v2-${input.mode}-${input.args.profile}-benchmark`
    },
    method: "POST"
  });
  const body = (await response.json()) as { scanId?: string };
  if (!response.ok || !body.scanId) {
    throw new Error(`Scan submit failed: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
  return {
    scanId: body.scanId,
    submitMs: Date.now() - startedAt
  };
}

async function waitForArtifact(input: { mode: Mode; scanId: string }) {
  const deadlineAt = Date.now() + 30 * 60_000;
  let lastStatus = "unknown";
  while (Date.now() < deadlineAt) {
    if (input.mode === "lambda") {
      await pollLocalV2DagLambdaResultQueue({
        expectedTargetEnvironment: "local",
        maxMessages: 10,
        waitTimeSeconds: 5
      });
    }
    const row = await loadScanRow(input.scanId);
    if (row) {
      lastStatus = row.status;
      const outDir = localV2DagOutDir(row.scan_config_json);
      if (row.status === "failed") {
        throw new Error(`Scan ${input.scanId} failed: ${row.error_message ?? "unknown error"}`);
      }
      if (outDir && await exists(path.join(outDir, "CanonicalEvidenceBundle.json"))) {
        return { outDir, row };
      }
    }
    await sleep(input.mode === "lambda" ? 1_000 : 5_000);
  }
  throw new Error(`Timed out waiting for ${input.scanId}; last status was ${lastStatus}.`);
}

async function loadScanRow(scanId: string) {
  const result = await query(
    `select id, status, created_at, started_at, completed_at, error_message, scan_config_json
       from scans
      where id = $1`,
    [scanId],
    { readOnly: true }
  );
  return result.rows[0] as undefined | {
    completed_at: string | null;
    created_at: string | null;
    error_message: string | null;
    scan_config_json: Record<string, unknown> | null;
    started_at: string | null;
    status: string;
  };
}

async function loadScanEvents(scanId: string) {
  const result = await query(
    `select event_type
       from scan_events
      where scan_id = $1
      order by created_at asc`,
    [scanId],
    { readOnly: true }
  );
  return result.rows.map((row) => String(row.event_type));
}

function localV2DagOutDir(config: Record<string, unknown> | null | undefined) {
  const execution = asRecord(config?.execution);
  const localV2Dag = asRecord(execution.localV2Dag);
  const outDir = typeof localV2Dag.outDir === "string" ? localV2Dag.outDir : null;
  if (!outDir) {
    return null;
  }
  return path.isAbsolute(outDir) ? outDir : path.resolve(process.cwd(), outDir);
}

async function writeBenchmark(args: Args, results: RunResult[]) {
  await mkdir(path.dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify({
    baseUrl: args.baseUrl,
    generatedAt: new Date().toISOString(),
    lambdaDebugOverrides: args.lambdaDebugOverrides,
    mode: args.mode,
    profile: args.profile,
    results,
    variantLabel: args.variantLabel
  }, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    baseUrl: "http://localhost:3000",
    domains: ["caltech.edu", "gatech.edu", "webmd.com", "nbcnews.com", "ikea.com"],
    mode: "paired",
    outPath: "artifacts/v2-lambda-local-benchmark.json",
    profile: "full",
    lambdaDebugOverrides: null,
    variantLabel: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--base-url") {
      args.baseUrl = requiredValue(argv, ++index, arg);
    } else if (arg === "--domains") {
      args.domains = requiredValue(argv, ++index, arg).split(",").map((domain) => domain.trim()).filter(Boolean);
    } else if (arg === "--mode") {
      args.mode = parseMode(requiredValue(argv, ++index, arg));
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--profile") {
      args.profile = requiredValue(argv, ++index, arg) === "tiny" ? "tiny" : "full";
    } else if (arg === "--variant") {
      args.variantLabel = requiredValue(argv, ++index, arg);
    } else if (arg === "--lambda-debug-overrides") {
      args.lambdaDebugOverrides = parseJsonObjectArg(requiredValue(argv, ++index, arg), arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args as Args;
}

function printUsage() {
  console.log([
    "Usage: pnpm v2:local-dag-lambda-benchmark -- [options]",
    "",
    "Runs internal, artifact-only local v2 DAG benchmark scans against localhost and/or the local/dev Lambda path.",
    "",
    "Options:",
    "  --base-url <url>       Local WC01 web URL. Default: http://localhost:3000",
    "  --domains <csv>        Comma-separated domains. Default: caltech.edu,gatech.edu,webmd.com,nbcnews.com,ikea.com",
    "  --mode <mode>          paired, lambda-only, or localhost-only. Default: paired",
    "  --out <path>           Benchmark JSON output path. Default: artifacts/v2-lambda-local-benchmark.json",
    "  --profile <profile>    full or tiny. Default: full",
    "  --variant <label>      Optional label such as memory-3008-single-process-false",
    "  --lambda-debug-overrides <json>  Optional local/dev Lambda debug override object",
    "",
    "Example:",
    "  pnpm v2:local-dag-lambda-benchmark -- --mode paired --profile full --variant memory-3008-single-process-false --out artifacts/v2-lambda-local-full-benchmark.json",
    "  pnpm v2:local-dag-lambda-benchmark -- --mode lambda-only --domains webmd.com --lambda-debug-overrides '{\"scenarioResourceMode\":\"cmp_safe\",\"preActionObservationMs\":5000}' --out artifacts/webmd-cmp-safe.json"
  ].join("\n"));
}

function parseJsonObjectArg(value: string, flag: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${flag} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseMode(value: string): Args["mode"] {
  if (value === "paired" || value === "lambda-only" || value === "localhost-only") {
    return value;
  }
  throw new Error(`Unsupported benchmark mode: ${value}`);
}

function modesForRun(mode: Args["mode"]): Mode[] {
  if (mode === "lambda-only") {
    return ["lambda"];
  }
  if (mode === "localhost-only") {
    return ["localhost"];
  }
  return ["lambda", "localhost"];
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
