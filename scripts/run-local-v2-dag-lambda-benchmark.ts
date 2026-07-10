import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { query } from "../packages/db/src/postgres";
import { pollLocalV2DagLambdaResultQueue } from "../apps/web/server/scans/local-v2-dag-lambda-result-poller";

type Mode = "lambda" | "localhost";

type Args = {
  baseUrl: string;
  domains: string[];
  expectedMemorySizeMb: number | null;
  lambdaConcurrency: number;
  lambdaDebugOverrides: Record<string, unknown> | null;
  mode: "paired" | "lambda-only" | "localhost-only";
  outPath: string;
  profile: "full" | "tiny";
  scanFrom: "eu_de" | "eu_ie";
  submitConcurrency: number;
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
  performance?: Record<string, unknown>;
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
  let writeTail = Promise.resolve();
  const persistResult = (result: RunResult) => {
    results.push(result);
    writeTail = writeTail.then(() => writeBenchmark(args, results));
    return writeTail;
  };
  for (const mode of modesForRun(args.mode)) {
    const submitWithLimit = createConcurrencyLimiter(args.submitConcurrency);
    const resultPump = mode === "lambda" ? startLambdaResultPump(args) : null;
    try {
      await mapWithConcurrency(
        args.domains,
        mode === "lambda" ? args.lambdaConcurrency : 1,
        async (domain) => {
          let result: RunResult;
          const wallStartedAt = Date.now();
          try {
            result = await runOne({
              args,
              domain,
              mode,
              submit: () => submitWithLimit(() => submitScan({ args, domain, mode })),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({ domain, error: message, event: "failed", mode }));
            result = {
              completedAt: null,
              createdAt: null,
              domain,
              elapsedMs: Date.now() - wallStartedAt,
              error: message,
              events: [],
              mode,
              outDir: null,
              scanId: "",
              startedAt: null,
              status: "failed",
              submitMs: 0
            };
          }
          await persistResult(result);
        },
      );
    } finally {
      await resultPump?.stop();
    }
  }
  await writeTail;
  console.log(`Wrote ${args.outPath}`);
}

async function runOne(input: {
  args: Args;
  domain: string;
  mode: Mode;
  submit: () => Promise<Awaited<ReturnType<typeof submitScan>>>;
}): Promise<RunResult> {
  const wallStartedAt = Date.now();
  const submitted = await input.submit();
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
  const performance = await loadArtifactPerformanceSummary(completed.outDir);
  if (input.mode === "lambda" && input.args.expectedMemorySizeMb !== null) {
    const observedMemorySizeMb = numberOrNull(asRecord(performance.runtimeDiagnostics).memorySizeMb);
    if (observedMemorySizeMb !== input.args.expectedMemorySizeMb) {
      throw new Error(
        `Lambda memory configuration mismatch: expected ${input.args.expectedMemorySizeMb} MB, observed ${observedMemorySizeMb ?? "unknown"} MB.`,
      );
    }
  }
  const result = {
    completedAt: completed.row.completed_at,
    createdAt: completed.row.created_at,
    domain: input.domain,
    elapsedMs,
    events,
    mode: input.mode,
    outDir: completed.outDir,
    performance,
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

async function loadArtifactPerformanceSummary(outDir: string): Promise<Record<string, unknown>> {
  const [manifest, bundle, resourceTelemetry] = await Promise.all([
    readJson(path.join(outDir, "LocalV2DagLambdaManifest.json")).catch(() => ({})),
    readJson(path.join(outDir, "CanonicalEvidenceBundle.json")),
    readJson(path.join(outDir, "V2RuntimeResourceTelemetry.json")).catch(() => ({})),
  ]);
  const consentObservations = Array.isArray(bundle.consentUiObservations) ? bundle.consentUiObservations : [];
  const policyObservations = Array.isArray(bundle.policySurfaceObservations) ? bundle.policySurfaceObservations : [];
  const cmpObservations = Array.isArray(bundle.cmpRuntimeObservations) ? bundle.cmpRuntimeObservations : [];
  const screenshots = Array.isArray(bundle.screenshots) ? bundle.screenshots : [];
  return {
    evidenceCounts: {
      cmpObservations: cmpObservations.length,
      consentControls: consentObservations.reduce((sum, observation) =>
        sum + (Array.isArray(asRecord(observation).controls) ? (asRecord(observation).controls as unknown[]).length : 0), 0),
      policyFetched: policyObservations.filter((observation) => asRecord(observation).status === "fetched").length,
      policyObserved: policyObservations.length,
      screenshots: screenshots.length,
    },
    performanceDiagnostics: asRecord(manifest.performanceDiagnostics),
    phaseTimings: Array.isArray(manifest.phaseTimings) ? manifest.phaseTimings : [],
    resourceTelemetry,
    runtimeDiagnostics: asRecord(manifest.runtimeDiagnostics),
  };
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(filePath, "utf8")));
}

function startLambdaResultPump(args: Args) {
  let stopped = false;
  const queueUrl = benchmarkResultQueueUrl(args);
  const task = (async () => {
    while (!stopped) {
      try {
        const result = await pollLocalV2DagLambdaResultQueue({
          expectedTargetEnvironment: "local",
          maxMessages: 3,
          queueUrl: queueUrl ?? undefined,
          visibilityTimeoutSeconds: 60,
          waitTimeSeconds: 1,
        });
        if (result.received === 0) await sleep(250);
      } catch (error) {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "lambda_result_pump_failed",
        }));
        await sleep(1_000);
      }
    }
  })();
  return {
    async stop() {
      stopped = true;
      await task;
    },
  };
}

function benchmarkResultQueueUrl(args: Args): string | null {
  const regional = args.scanFrom === "eu_ie"
    ? process.env.CERTSCORE_V2_DAG_LAMBDA_EU_IE_RESULT_QUEUE_URL
    : process.env.CERTSCORE_V2_DAG_LAMBDA_EU_DE_RESULT_QUEUE_URL;
  const value = regional ?? process.env.CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL;
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
      localV2ScanProfile: input.args.profile,
      scanFrom: input.args.scanFrom,
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
    const row = await loadScanRow(input.scanId);
    if (row) {
      lastStatus = row.status;
      const outDir = localV2DagOutDir(row.scan_config_json);
      if (row.status === "failed") {
        throw new Error(`Scan ${input.scanId} failed: ${row.error_message ?? "unknown error"}`);
      }
      const requiredArtifacts = input.mode === "lambda"
        ? ["CanonicalEvidenceBundle.json", "LocalV2DagLambdaManifest.json", "V2RuntimeResourceTelemetry.json"]
        : ["CanonicalEvidenceBundle.json"];
      if (outDir && (await Promise.all(
        requiredArtifacts.map((fileName) => exists(path.join(outDir, fileName))),
      )).every(Boolean)) {
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
    expectedMemorySizeMb: args.expectedMemorySizeMb,
    generatedAt: new Date().toISOString(),
    lambdaConcurrency: args.lambdaConcurrency,
    lambdaDebugOverrides: args.lambdaDebugOverrides,
    mode: args.mode,
    profile: args.profile,
    results,
    scanFrom: args.scanFrom,
    submitConcurrency: args.submitConcurrency,
    variantLabel: args.variantLabel
  }, null, 2)}\n`, "utf8");
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {
    baseUrl: "http://localhost:3000",
    domains: ["caltech.edu", "gatech.edu", "webmd.com", "nbcnews.com", "ikea.com"],
    expectedMemorySizeMb: null,
    lambdaConcurrency: 10,
    mode: "paired",
    outPath: "artifacts/v2-lambda-local-benchmark.json",
    profile: "full",
    scanFrom: "eu_de",
    submitConcurrency: 5,
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
    } else if (arg === "--expected-memory-mb") {
      args.expectedMemorySizeMb = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--lambda-concurrency") {
      args.lambdaConcurrency = parseBoundedConcurrency(requiredValue(argv, ++index, arg), arg, 20);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--profile") {
      args.profile = requiredValue(argv, ++index, arg) === "tiny" ? "tiny" : "full";
    } else if (arg === "--scan-from") {
      args.scanFrom = parseScanFrom(requiredValue(argv, ++index, arg));
    } else if (arg === "--submit-concurrency") {
      args.submitConcurrency = parseBoundedConcurrency(requiredValue(argv, ++index, arg), arg, 10);
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
    "  --expected-memory-mb <number>  Fail each Lambda row unless its artifact reports this configured memory size.",
    "  --lambda-concurrency <number>   Maximum active Lambda scans. Default: 10; maximum: 20.",
    "  --out <path>           Benchmark JSON output path. Default: artifacts/v2-lambda-local-benchmark.json",
    "  --profile <profile>    full or tiny. Default: full",
    "  --scan-from <region>    eu_de (eu-central-1) or eu_ie (eu-west-1). Default: eu_de",
    "  --submit-concurrency <number>  Maximum simultaneous web submissions. Default: 5; maximum: 10.",
    "  --variant <label>      Optional label such as memory-3008-single-process-false",
    "  --lambda-debug-overrides <json>  Optional local/dev Lambda debug override object",
    "",
    "Example:",
    "  pnpm v2:local-dag-lambda-benchmark -- --mode lambda-only --profile full --lambda-concurrency 10 --submit-concurrency 5 --scan-from eu_de --expected-memory-mb 3008 --variant memory-3008 --out artifacts/memory-3008.json",
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

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseBoundedConcurrency(value: string, flag: string, maximum: number): number {
  const parsed = parsePositiveInteger(value, flag);
  if (parsed > maximum) throw new Error(`${flag} must be at most ${maximum}.`);
  return parsed;
}

function parseScanFrom(value: string): Args["scanFrom"] {
  if (value === "eu_de" || value === "eu_ie") return value;
  throw new Error(`Unsupported --scan-from value: ${value}`);
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

function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(run: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await run();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

async function mapWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  run: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) await run(value);
    }
  });
  await Promise.all(workers);
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

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
