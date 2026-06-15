#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type RepairQueueName =
  | "needs-attention"
  | "planned-only"
  | "consent-dag-rerun"
  | "policy-rerun"
  | "full-profile-rerun"
  | "privacy-opt-out-proof-review"
  | "cmp-heavy-review"
  | "training-eligible"
  | "validation-eligible"
  | "holdout-eligible"
  | "scanner-hardening"
  | "corpus-relabel-review"
  | "replacement-candidate";

type QueueIntent = "repair" | "review" | "split";
type QueuePriority = "p0" | "p1" | "p2" | "p3";
type QueueProfile = "tiny" | "standard" | "policy" | "consent" | "full";

interface Args {
  continueOnError: boolean;
  execute: boolean;
  failOnQueueFailure: boolean;
  help: boolean;
  isolatedSites: boolean;
  limit?: number;
  outDir: string;
  qualityGatePath: string;
  queues?: RepairQueueName[];
  resume: boolean;
  scanStepTimeoutMs?: number;
  siteTimeoutMs?: number;
}

interface QualityGateReport {
  reportVersion?: string;
  generatedAt?: string;
  status?: "pass" | "warn" | "fail";
  summary?: Record<string, number>;
  queues?: Record<string, {
    count?: number;
    path?: string;
  }>;
}

interface CohortSummary {
  input?: {
    consentDag?: boolean;
    outDir?: string;
    profile?: string;
    totalUrls?: number;
    urlsPath?: string;
  };
  results?: Array<{
    durationMs?: number;
    error?: string;
    moduleRuns?: Array<{
      errors?: string[];
      moduleName?: string;
      status?: string;
    }>;
    status?: "completed" | "failed" | "skipped";
    url?: string;
  }>;
  totals?: {
    completed?: number;
    failed?: number;
    skipped?: number;
    totalRuntimeMs?: number;
  };
}

interface QueueConfig {
  consentDag: boolean;
  description: string;
  intent: QueueIntent;
  priority: QueuePriority;
  profile: QueueProfile;
  runByDefault: boolean;
}

interface QueuePlan {
  command: string[];
  config: QueueConfig;
  count: number;
  estimatedUrls: number;
  name: RepairQueueName;
  outDir: string;
  queuePath: string;
  selectedUrls: string[];
  status: "empty" | "planned" | "completed" | "failed" | "skipped";
  summary?: QueueRunSummary;
}

interface QueueRunSummary {
  completed: number;
  failed: number;
  moduleFailures: number;
  p50DurationMs?: number;
  p90DurationMs?: number;
  skipped: number;
  summaryPath?: string;
  totalRuntimeMs: number;
}

interface RepairPassReport {
  reportVersion: "wc01.v2_gold_corpus_repair_pass.1";
  generatedAt: string;
  input: {
    execute: boolean;
    limit?: number;
    outDir: string;
    qualityGatePath: string;
    queues: RepairQueueName[];
    resume: boolean;
    isolatedSites: boolean;
    scanStepTimeoutMs?: number;
    siteTimeoutMs?: number;
  };
  qualityGate: {
    generatedAt?: string;
    status?: string;
    summary: Record<string, number>;
  };
  status: "planned" | "completed" | "failed";
  queues: QueuePlan[];
  totals: {
    completedQueues: number;
    failedQueues: number;
    plannedQueues: number;
    repairUrls: number;
    reviewUrls: number;
    splitUrls: number;
    totalSelectedUrls: number;
  };
}

const DEFAULT_QUALITY_GATE_PATH = path.join(
  "artifacts",
  "gold-corpus",
  "v2-current",
  "quality-gate",
  "GoldCorpusQualityGate.json",
);
const DEFAULT_OUT_DIR = path.join("artifacts", "gold-corpus", "v2-current", "repair-pass");
const DEFAULT_QUEUES: RepairQueueName[] = [
  "needs-attention",
  "planned-only",
  "consent-dag-rerun",
  "policy-rerun",
  "full-profile-rerun",
  "privacy-opt-out-proof-review",
  "cmp-heavy-review",
];

const QUEUE_CONFIGS: Record<RepairQueueName, QueueConfig> = {
  "needs-attention": {
    consentDag: true,
    description: "Hard repair pass for targets already marked needs_attention.",
    intent: "repair",
    priority: "p0",
    profile: "full",
    runByDefault: true,
  },
  "planned-only": {
    consentDag: true,
    description: "First capture for planned-only live targets.",
    intent: "repair",
    priority: "p0",
    profile: "full",
    runByDefault: true,
  },
  "consent-dag-rerun": {
    consentDag: true,
    description: "Focused planned-parallel consent DAG rerun for deadline/action-proof issues.",
    intent: "repair",
    priority: "p1",
    profile: "consent",
    runByDefault: true,
  },
  "policy-rerun": {
    consentDag: false,
    description: "Policy-surface refresh for targets with policy discovery limitations.",
    intent: "repair",
    priority: "p1",
    profile: "policy",
    runByDefault: true,
  },
  "full-profile-rerun": {
    consentDag: true,
    description: "Full-profile refresh for mixed module limitations.",
    intent: "repair",
    priority: "p1",
    profile: "full",
    runByDefault: true,
  },
  "privacy-opt-out-proof-review": {
    consentDag: true,
    description: "Privacy opt-out proof review with policy plus consent DAG context.",
    intent: "review",
    priority: "p2",
    profile: "full",
    runByDefault: true,
  },
  "cmp-heavy-review": {
    consentDag: true,
    description: "CMP-heavy action-proof/deadline review queue.",
    intent: "review",
    priority: "p2",
    profile: "consent",
    runByDefault: true,
  },
  "training-eligible": {
    consentDag: false,
    description: "Current training split candidates. Report-only by default.",
    intent: "split",
    priority: "p3",
    profile: "full",
    runByDefault: false,
  },
  "validation-eligible": {
    consentDag: false,
    description: "Current validation split candidates. Report-only by default.",
    intent: "split",
    priority: "p3",
    profile: "full",
    runByDefault: false,
  },
  "holdout-eligible": {
    consentDag: false,
    description: "Current holdout split candidates. Report-only by default.",
    intent: "split",
    priority: "p3",
    profile: "full",
    runByDefault: false,
  },
  "scanner-hardening": {
    consentDag: true,
    description: "Actionable scanner/runtime hardening targets from the repaired-state quality gate.",
    intent: "repair",
    priority: "p0",
    profile: "full",
    runByDefault: false,
  },
  "corpus-relabel-review": {
    consentDag: true,
    description: "Likely clean/control targets with zero eligible review candidates; review labels before replacement.",
    intent: "review",
    priority: "p2",
    profile: "consent",
    runByDefault: false,
  },
  "replacement-candidate": {
    consentDag: true,
    description: "Unstable or repeatedly failing targets to quarantine or replace before relying on split quality.",
    intent: "review",
    priority: "p1",
    profile: "full",
    runByDefault: false,
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const qualityGate = await readJson<QualityGateReport>(args.qualityGatePath);
  const selectedQueues = args.queues ?? DEFAULT_QUEUES.filter((queue) => QUEUE_CONFIGS[queue].runByDefault);
  const queuePlans = await buildQueuePlans({ args, qualityGate, selectedQueues });

  await mkdir(args.outDir, { recursive: true });
  for (const plan of queuePlans) {
    if (args.execute && plan.status === "planned") {
      plan.status = args.isolatedSites ? await runQueueIsolatedBySite(plan, args) : await runQueue(plan, args);
    } else if (!args.execute && plan.status === "planned") {
      plan.status = "planned";
    }
    plan.summary = await readQueueSummary(plan);
  }

  const report = buildReport(args, qualityGate, queuePlans);
  const jsonPath = path.join(args.outDir, "V2GoldCorpusRepairPass.json");
  const markdownPath = path.join(args.outDir, "V2GoldCorpusRepairPass.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderMarkdown(report), "utf8");

  console.log(JSON.stringify({
    outDir: args.outDir,
    status: report.status,
    totals: report.totals,
    reportPaths: {
      json: jsonPath,
      markdown: markdownPath,
    },
  }, null, 2));

  if (args.failOnQueueFailure && report.status === "failed") {
    process.exitCode = 1;
  }
}

async function buildQueuePlans(input: {
  args: Args;
  qualityGate: QualityGateReport;
  selectedQueues: RepairQueueName[];
}): Promise<QueuePlan[]> {
  const plans: QueuePlan[] = [];
  for (const queueName of input.selectedQueues) {
    const config = QUEUE_CONFIGS[queueName];
    const gateQueue = input.qualityGate.queues?.[queueName];
    const queuePath = gateQueue?.path ?? path.join(path.dirname(input.args.qualityGatePath), "queues", `${queueName}.urls.txt`);
    const urls = await readUrlList(queuePath);
    const selectedUrls = input.args.limit === undefined ? urls : urls.slice(0, input.args.limit);
    const outDir = path.join(input.args.outDir, "runs", queueName);
    const command = buildCohortCommand({
      config,
      limit: input.args.limit,
      outDir,
      queuePath,
      resume: input.args.resume,
      scanStepTimeoutMs: input.args.scanStepTimeoutMs,
    });
    plans.push({
      command,
      config,
      count: gateQueue?.count ?? urls.length,
      estimatedUrls: urls.length,
      name: queueName,
      outDir,
      queuePath,
      selectedUrls,
      status: selectedUrls.length === 0 ? "empty" : "planned",
    });
  }
  return plans;
}

function buildCohortCommand(input: {
  config: QueueConfig;
  limit?: number;
  outDir: string;
  queuePath: string;
  resume: boolean;
  scanStepTimeoutMs?: number;
}): string[] {
  const command = [
    "pnpm",
    "v2:wc01-scan-lab-cohort",
    "--urls",
    input.queuePath,
    "--profile",
    input.config.profile,
    "--out-dir",
    input.outDir,
  ];
  if (input.config.consentDag) {
    command.push("--consent-dag");
  }
  if (input.resume) {
    command.push("--resume");
  }
  if (input.limit !== undefined) {
    command.push("--limit", String(input.limit));
  }
  if (input.scanStepTimeoutMs !== undefined) {
    command.push("--scan-step-timeout-ms", String(input.scanStepTimeoutMs));
  }
  return command;
}

async function runQueue(plan: QueuePlan, args: Args): Promise<QueuePlan["status"]> {
  await mkdir(plan.outDir, { recursive: true });
  console.log(`\n[v2-gold-repair] ${plan.name}: ${plan.selectedUrls.length} URLs, profile=${plan.config.profile}, consentDag=${plan.config.consentDag}`);
  console.log(`[v2-gold-repair] ${shellJoin(plan.command)}`);
  const exitCode = await runCommand(plan.command, args.siteTimeoutMs);
  if (exitCode === 0) {
    return "completed";
  }
  if (!args.continueOnError) {
    throw new Error(`Queue ${plan.name} failed with exit code ${exitCode}`);
  }
  return "failed";
}

async function runQueueIsolatedBySite(plan: QueuePlan, args: Args): Promise<QueuePlan["status"]> {
  await mkdir(plan.outDir, { recursive: true });
  let failed = false;
  for (let index = 0; index < plan.selectedUrls.length; index += 1) {
    const url = plan.selectedUrls[index]!;
    const siteNumber = index + 1;
    const siteSlug = `${String(siteNumber).padStart(3, "0")}-${safeUrlSlug(url)}`;
    const siteOutDir = path.join(plan.outDir, "sites", siteSlug);
    const siteQueueDir = path.join(plan.outDir, "site-queues");
    const siteQueuePath = path.join(siteQueueDir, `${siteSlug}.urls.txt`);
    await mkdir(siteQueueDir, { recursive: true });
    await writeFile(siteQueuePath, `${url}\n`, "utf8");
    const command = buildCohortCommand({
      config: plan.config,
      outDir: siteOutDir,
      queuePath: siteQueuePath,
      resume: args.resume,
      scanStepTimeoutMs: args.scanStepTimeoutMs,
    });
    console.log(`\n[v2-gold-repair] ${plan.name} ${siteNumber}/${plan.selectedUrls.length}: ${url}`);
    console.log(`[v2-gold-repair] ${shellJoin(command)}`);
    const exitCode = await runCommand(command, args.siteTimeoutMs);
    if (exitCode !== 0) {
      failed = true;
      await mkdir(siteOutDir, { recursive: true });
      await writeFile(path.join(siteOutDir, "V2GoldCorpusRepairSiteFailure.json"), `${JSON.stringify({
        command,
        exitCode,
        queue: plan.name,
        timedOut: exitCode === 124,
        url,
      }, null, 2)}\n`, "utf8");
      if (!args.continueOnError) {
        throw new Error(`Queue ${plan.name} site ${url} failed with exit code ${exitCode}`);
      }
    }
  }
  return failed ? "failed" : "completed";
}

function runCommand(command: string[], timeoutMs?: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), {
      env: process.env,
      stdio: "inherit",
    });
    let timedOut = false;
    let settled = false;
    let sigkillTimer: NodeJS.Timeout | undefined;
    const timeout = timeoutMs === undefined ? undefined : setTimeout(() => {
      if (settled) {
        return;
      }
      timedOut = true;
      console.warn(`[v2-gold-repair] command timed out after ${timeoutMs}ms: ${shellJoin(command)}`);
      child.kill("SIGINT");
      sigkillTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGKILL");
        }
      }, 10_000);
    }, timeoutMs);
    child.on("error", () => {
      settled = true;
      resolve(1);
    });
    child.on("close", (code) => {
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (sigkillTimer) {
        clearTimeout(sigkillTimer);
      }
      resolve(timedOut ? 124 : code ?? 1);
    });
  });
}

async function readQueueSummary(plan: QueuePlan): Promise<QueueRunSummary | undefined> {
  const summaryPath = path.join(plan.outDir, "Wc01V2ScanLabCohort.summary.json");
  if (!existsSync(summaryPath)) {
    return readIsolatedQueueSummary(plan);
  }
  const summary = await readJson<CohortSummary>(summaryPath);
  const results = Array.isArray(summary.results) ? summary.results : [];
  const completed = results.filter((result) => result.status === "completed");
  const failed = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");
  const durations = completed
    .map((result) => result.durationMs)
    .filter((duration): duration is number => typeof duration === "number")
    .sort((left, right) => left - right);
  const moduleFailures = completed.reduce((count, result) =>
    count + (result.moduleRuns ?? []).filter((moduleRun) => moduleRun.status !== "completed").length,
  0);
  return {
    completed: summary.totals?.completed ?? completed.length,
    failed: summary.totals?.failed ?? failed.length,
    moduleFailures,
    p50DurationMs: percentile(durations, 0.5),
    p90DurationMs: percentile(durations, 0.9),
    skipped: summary.totals?.skipped ?? skipped.length,
    summaryPath,
    totalRuntimeMs: summary.totals?.totalRuntimeMs ?? results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0),
  };
}

async function readIsolatedQueueSummary(plan: QueuePlan): Promise<QueueRunSummary | undefined> {
  const sitesDir = path.join(plan.outDir, "sites");
  if (!existsSync(sitesDir)) {
    return undefined;
  }
  const entries = await readdir(sitesDir, { withFileTypes: true });
  const summaries: CohortSummary[] = [];
  let commandFailures = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const siteDir = path.join(sitesDir, entry.name);
    const summaryPath = path.join(siteDir, "Wc01V2ScanLabCohort.summary.json");
    if (existsSync(summaryPath)) {
      summaries.push(await readJson<CohortSummary>(summaryPath));
    } else if (existsSync(path.join(siteDir, "V2GoldCorpusRepairSiteFailure.json"))) {
      commandFailures += 1;
    }
  }
  if (summaries.length === 0 && commandFailures === 0) {
    return undefined;
  }
  const results = summaries.flatMap((summary) => Array.isArray(summary.results) ? summary.results : []);
  const completed = results.filter((result) => result.status === "completed");
  const failed = results.filter((result) => result.status === "failed");
  const skipped = results.filter((result) => result.status === "skipped");
  const durations = completed
    .map((result) => result.durationMs)
    .filter((duration): duration is number => typeof duration === "number")
    .sort((left, right) => left - right);
  const moduleFailures = completed.reduce((count, result) =>
    count + (result.moduleRuns ?? []).filter((moduleRun) => moduleRun.status !== "completed").length,
  0);
  return {
    completed: completed.length,
    failed: failed.length + commandFailures,
    moduleFailures,
    p50DurationMs: percentile(durations, 0.5),
    p90DurationMs: percentile(durations, 0.9),
    skipped: skipped.length,
    totalRuntimeMs: results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0),
  };
}

function buildReport(args: Args, qualityGate: QualityGateReport, queues: QueuePlan[]): RepairPassReport {
  const failedQueues = queues.filter((queue) => queue.status === "failed" || (queue.summary?.failed ?? 0) > 0).length;
  const completedQueues = queues.filter((queue) =>
    queue.status === "completed" && (queue.summary?.failed ?? 0) === 0
  ).length;
  const plannedQueues = queues.filter((queue) =>
    queue.status === "planned" && (queue.summary?.failed ?? 0) === 0
  ).length;
  return {
    reportVersion: "wc01.v2_gold_corpus_repair_pass.1",
    generatedAt: new Date().toISOString(),
    input: {
      execute: args.execute,
      limit: args.limit,
      outDir: args.outDir,
      qualityGatePath: args.qualityGatePath,
      queues: queues.map((queue) => queue.name),
      resume: args.resume,
      isolatedSites: args.isolatedSites,
      scanStepTimeoutMs: args.scanStepTimeoutMs,
      siteTimeoutMs: args.siteTimeoutMs,
    },
    qualityGate: {
      generatedAt: qualityGate.generatedAt,
      status: qualityGate.status,
      summary: qualityGate.summary ?? {},
    },
    status: failedQueues > 0 ? "failed" : args.execute ? "completed" : "planned",
    queues,
    totals: {
      completedQueues,
      failedQueues,
      plannedQueues,
      repairUrls: countSelectedUrls(queues, "repair"),
      reviewUrls: countSelectedUrls(queues, "review"),
      splitUrls: countSelectedUrls(queues, "split"),
      totalSelectedUrls: queues.reduce((sum, queue) => sum + queue.selectedUrls.length, 0),
    },
  };
}

function countSelectedUrls(queues: QueuePlan[], intent: QueueIntent): number {
  return queues
    .filter((queue) => queue.config.intent === intent)
    .reduce((sum, queue) => sum + queue.selectedUrls.length, 0);
}

function renderMarkdown(report: RepairPassReport): string {
  const lines = [
    "# V2 Gold Corpus Repair Pass",
    "",
    "Internal diagnostic only. Artifact-only. Does not change production report behavior.",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Mode: ${report.input.execute ? "execute" : "plan"}`,
    `Quality gate: ${report.qualityGate.status ?? "unknown"} (${report.input.qualityGatePath})`,
    "",
    "## Totals",
    "",
    `- Selected URLs: ${report.totals.totalSelectedUrls}`,
    `- Repair URLs: ${report.totals.repairUrls}`,
    `- Review URLs: ${report.totals.reviewUrls}`,
    `- Split/reference URLs: ${report.totals.splitUrls}`,
    `- Completed queues: ${report.totals.completedQueues}`,
    `- Failed queues: ${report.totals.failedQueues}`,
    `- Planned queues: ${report.totals.plannedQueues}`,
    "",
    "## Queues",
    "",
  ];
  for (const queue of report.queues) {
    lines.push(`### ${queue.name}`);
    lines.push("");
    lines.push(`- Priority: ${queue.config.priority}`);
    lines.push(`- Intent: ${queue.config.intent}`);
    lines.push(`- Description: ${queue.config.description}`);
    lines.push(`- URL count: ${queue.selectedUrls.length}/${queue.estimatedUrls}`);
    lines.push(`- Profile: ${queue.config.profile}`);
    lines.push(`- Consent DAG: ${queue.config.consentDag ? "yes" : "no"}`);
    lines.push(`- Status: ${queue.status}`);
    lines.push(`- Queue file: ${queue.queuePath}`);
    lines.push(`- Output dir: ${queue.outDir}`);
    lines.push(`- Command: \`${shellJoin(queue.command)}\``);
    if (queue.summary) {
      lines.push(`- Completed: ${queue.summary.completed}`);
      lines.push(`- Failed: ${queue.summary.failed}`);
      lines.push(`- Skipped: ${queue.summary.skipped}`);
      lines.push(`- Module failures: ${queue.summary.moduleFailures}`);
      if (queue.summary.p50DurationMs !== undefined) {
        lines.push(`- p50 duration: ${formatDuration(queue.summary.p50DurationMs)}`);
      }
      if (queue.summary.p90DurationMs !== undefined) {
        lines.push(`- p90 duration: ${formatDuration(queue.summary.p90DurationMs)}`);
      }
      lines.push(`- Summary: ${queue.summary.summaryPath}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function readUrlList(filePath: string): Promise<string[]> {
  if (!existsSync(filePath)) {
    return [];
  }
  const text = await readFile(filePath, "utf8");
  return [...new Set(text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#")))];
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index];
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  return `${(durationMs / 1000).toFixed(1)} sec`;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    continueOnError: true,
    execute: false,
    failOnQueueFailure: false,
    help: false,
    isolatedSites: false,
    outDir: DEFAULT_OUT_DIR,
    qualityGatePath: DEFAULT_QUALITY_GATE_PATH,
    resume: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--") {
      continue;
    } else if (arg === "--quality-gate") {
      args.qualityGatePath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--queues") {
      args.queues = parseQueues(requiredValue(argv, ++index, arg));
    } else if (arg === "--limit") {
      args.limit = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--isolated-sites") {
      args.isolatedSites = true;
    } else if (arg === "--site-timeout-ms") {
      args.siteTimeoutMs = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--scan-step-timeout-ms") {
      args.scanStepTimeoutMs = parsePositiveInteger(requiredValue(argv, ++index, arg), arg);
    } else if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--plan-only") {
      args.execute = false;
    } else if (arg === "--resume") {
      args.resume = true;
    } else if (arg === "--no-resume") {
      args.resume = false;
    } else if (arg === "--fail-fast") {
      args.continueOnError = false;
    } else if (arg === "--fail-on-queue-failure") {
      args.failOnQueueFailure = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function parseQueues(value: string): RepairQueueName[] {
  const queues = value.split(",").map((queue) => queue.trim()).filter(Boolean);
  const valid = new Set(Object.keys(QUEUE_CONFIGS));
  for (const queue of queues) {
    if (!valid.has(queue)) {
      throw new Error(`Unsupported queue: ${queue}`);
    }
  }
  return queues as RepairQueueName[];
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function shellJoin(command: string[]): string {
  return command.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function safeUrlSlug(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, "").replace(/[^a-z0-9.-]+/gi, "-").slice(0, 80);
  } catch {
    return url.replace(/[^a-z0-9.-]+/gi, "-").slice(0, 80) || "url";
  }
}

function usage(): string {
  return [
    "Usage:",
    "  pnpm v2:gold-corpus-repair-pass -- [options]",
    "",
    "Plans or executes internal v2 gold-corpus repair cohorts from quality-gate queues.",
    "Default mode is plan-only. Artifact-only; non-persistent; no production report changes.",
    "",
    "Options:",
    "  --quality-gate <path>       Default artifacts/gold-corpus/v2-current/quality-gate/GoldCorpusQualityGate.json",
    "  --out-dir <path>            Default artifacts/gold-corpus/v2-current/repair-pass",
    "  --queues <a,b,c>            Default repair/review queues only",
    "  --limit <n>                 Limit each selected queue",
    "  --execute                   Run selected queues through v2:wc01-scan-lab-cohort",
    "  --isolated-sites            Run each URL in its own cohort child process",
    "  --site-timeout-ms <n>        Kill each queue/site child process after n ms",
    "  --scan-step-timeout-ms <n>   Pass a scan-step timeout to v2 Scan Lab cohort",
    "  --plan-only                 Write plan/report only",
    "  --resume | --no-resume      Resume queue cohorts by default",
    "  --fail-fast                 Stop after first queue command failure",
    "  --fail-on-queue-failure     Exit non-zero if any queue fails",
    "  --help",
    "",
    `Supported queues: ${Object.keys(QUEUE_CONFIGS).join(", ")}`,
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
