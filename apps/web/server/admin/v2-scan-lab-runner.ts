import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeUrlInput, type V2ScanLabProfile } from "./v2-scan-lab-artifacts";

export type V2ScanLabRunProfile = Extract<V2ScanLabProfile, "tiny" | "standard" | "policy" | "consent" | "full">;

export type V2ScanLabRunPlan = {
  chainKey: string;
  cohort: string;
  consentScenarioDag: boolean;
  domain: string;
  normalizedUrl: string;
  privacyControlUrls: string[];
  profile: V2ScanLabRunProfile;
  scenarioPlanningMode: "legacy_sequential" | "planned_parallel";
  steps: V2ScanLabRunStep[];
  timingPath: string;
};

export type V2ScanLabRunStep = {
  dependsOn?: string[];
  label: string;
  script: string;
  args: string[];
};

export type V2ScanLabRunStepTiming = {
  label: string;
  script: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

type BuildRunPlanInput = {
  captureReplay?: boolean;
  captureReplayAuxiliaryProbes?: "all" | "none" | "form" | "accessibility";
  consentScenarioDag?: boolean;
  now?: Date;
  privacyControlUrls?: string[];
  profile: V2ScanLabRunProfile;
  url: string;
  workspaceRoot?: string;
};

type RunCommand = (step: V2ScanLabRunStep, options: { cwd: string }) => Promise<void>;

type StepDiagnosticStatus = "completed" | "failed" | "started" | "timed_out";

const SUPPORTED_RUN_PROFILES: readonly V2ScanLabRunProfile[] = ["tiny", "standard", "policy", "consent", "full"] as const;
const CONSENT_DAG_ELIGIBLE_PROFILES = new Set<V2ScanLabRunProfile>(["consent", "full"]);

export function isV2ScanLabRunProfile(value: string | null | undefined): value is V2ScanLabRunProfile {
  return SUPPORTED_RUN_PROFILES.includes(value as V2ScanLabRunProfile);
}

export function isV2ScanLabConsentDagEligibleProfile(profile: V2ScanLabRunProfile): boolean {
  return CONSENT_DAG_ELIGIBLE_PROFILES.has(profile);
}

export function getV2ScanLabRunProfiles() {
  return SUPPORTED_RUN_PROFILES;
}

export function buildV2ScanLabRunPlan(input: BuildRunPlanInput): V2ScanLabRunPlan {
  if (!isV2ScanLabRunProfile(input.profile)) {
    throw new Error("Unsupported v2 scan profile.");
  }
  const normalized = normalizeUrlInput(input.url);
  if (!normalized) {
    throw new Error("Enter a valid URL or domain.");
  }

  const workspaceRoot = input.workspaceRoot ?? findWorkspaceRoot(process.cwd());
  const timestamp = formatRunTimestamp(input.now ?? new Date());
  const domainSlug = normalized.domain.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "site";
  const cohort = `lab-${domainSlug}-${input.profile}-${timestamp}`;
  const domainDir = normalized.domain;
  const chainKey = `${cohort}:${domainDir}`;
  const privacyControlUrls = normalizeSeedUrls(input.privacyControlUrls ?? []);
  const consentScenarioDag = Boolean(input.consentScenarioDag && isV2ScanLabConsentDagEligibleProfile(input.profile));
  const scenarioPlanningMode = consentScenarioDag ? "planned_parallel" : "legacy_sequential";

  const calibrationDir = path.join(workspaceRoot, "artifacts", `v2-calibration-${cohort}`, domainDir);
  const consentFlowDeadlineMs = input.captureReplayAuxiliaryProbes && input.captureReplayAuxiliaryProbes !== "none"
    ? "45000"
    : "30000";
  const scenarioConcurrency = input.captureReplay ? "3" : "2";
  const policyPlanningDeadlineMs = "1500";

  return {
    chainKey,
    cohort,
    consentScenarioDag,
    domain: normalized.domain,
    normalizedUrl: normalized.normalizedUrl,
    privacyControlUrls,
    profile: input.profile,
    scenarioPlanningMode,
    timingPath: path.join(calibrationDir, "V2ScanLabTiming.json"),
    steps: [
      {
        label: "scan",
        script: "v2:scan",
        args: [
          "--url",
          normalized.normalizedUrl,
          "--profile",
          input.profile,
          "--out",
          calibrationDir,
          ...privacyControlUrls.flatMap((privacyControlUrl) => ["--privacy-control-url", privacyControlUrl]),
          ...(input.captureReplay ? ["--capture-replay"] : []),
          ...(input.captureReplayAuxiliaryProbes ? ["--capture-replay-aux-probes", input.captureReplayAuxiliaryProbes] : []),
          ...(consentScenarioDag ? [
            "--scenario-planning-mode",
            "planned_parallel",
            "--scenario-concurrency",
            scenarioConcurrency,
            "--policy-planning-deadline-ms",
            policyPlanningDeadlineMs,
            "--scenario-resource-mode",
            "lean",
            "--consent-flow-deadline-ms",
            consentFlowDeadlineMs,
          ] : []),
        ],
      },
    ],
  };
}

export async function runV2ScanLabArtifactChain(
  input: BuildRunPlanInput,
  options: { runCommand?: RunCommand } = {},
) {
  const workspaceRoot = input.workspaceRoot ?? findWorkspaceRoot(process.cwd());
  const plan = buildV2ScanLabRunPlan({ ...input, workspaceRoot });
  const runCommand = options.runCommand ?? runV2ScanLabStep;
  const startedAt = new Date();
  const stepTimings = await runV2ScanLabStepDag(plan.steps, {
    cwd: workspaceRoot,
    runCommand,
  });

  const completedAt = new Date();
  await writeTimingArtifact(plan.timingPath, {
    chainKey: plan.chainKey,
    cohort: plan.cohort,
    completedAt: completedAt.toISOString(),
    consentScenarioDag: plan.consentScenarioDag,
    domain: plan.domain,
    normalizedUrl: plan.normalizedUrl,
    privacyControlUrls: plan.privacyControlUrls,
    profile: plan.profile,
    scenarioPlanningMode: plan.scenarioPlanningMode,
    startedAt: startedAt.toISOString(),
    stepTimings,
    timingVersion: "wc01.v2_scan_lab_timing.1",
    totalDurationMs: completedAt.getTime() - startedAt.getTime(),
  });

  return plan;
}

async function runV2ScanLabStepDag(
  steps: V2ScanLabRunStep[],
  input: {
    cwd: string;
    runCommand: RunCommand;
  },
): Promise<V2ScanLabRunStepTiming[]> {
  const byLabel = new Map<string, V2ScanLabRunStep>();
  for (const step of steps) {
    if (byLabel.has(step.label)) {
      throw new Error(`Duplicate v2 Scan Lab step label: ${step.label}`);
    }
    byLabel.set(step.label, step);
  }
  for (const step of steps) {
    for (const dependency of step.dependsOn ?? []) {
      if (!byLabel.has(dependency)) {
        throw new Error(`v2 Scan Lab step "${step.label}" depends on unknown step "${dependency}".`);
      }
    }
  }

  const completed = new Set<string>();
  const running = new Set<string>();
  const timings = new Map<string, V2ScanLabRunStepTiming>();

  while (completed.size < steps.length) {
    const ready = steps.filter((step) =>
      !completed.has(step.label) &&
      !running.has(step.label) &&
      (step.dependsOn ?? []).every((dependency) => completed.has(dependency))
    );
    if (ready.length === 0) {
      const remaining = steps
        .filter((step) => !completed.has(step.label))
        .map((step) => step.label)
        .join(", ");
      throw new Error(`v2 Scan Lab step dependency cycle or blocked steps: ${remaining}`);
    }

    const levelResults = await Promise.all(ready.map(async (step) => {
      running.add(step.label);
      const stepStartedAtMs = Date.now();
      const stepStartedAt = new Date(stepStartedAtMs);
      try {
        await input.runCommand(step, { cwd: input.cwd });
      } finally {
        running.delete(step.label);
      }
      const stepCompletedAtMs = Date.now();
      return {
        label: step.label,
        script: step.script,
        startedAt: stepStartedAt.toISOString(),
        completedAt: new Date(stepCompletedAtMs).toISOString(),
        durationMs: stepCompletedAtMs - stepStartedAtMs,
      };
    }));

    for (const timing of levelResults) {
      completed.add(timing.label);
      timings.set(timing.label, timing);
    }
  }

  return steps.map((step) => {
    const timing = timings.get(step.label);
    if (!timing) {
      throw new Error(`Missing timing for v2 Scan Lab step "${step.label}".`);
    }
    return timing;
  });
}

async function runV2ScanLabStep(step: V2ScanLabRunStep, options: { cwd: string }) {
  if (step.script === "v2:scan") {
    await runScanCliStep(step, options);
    return;
  }
  if (await runInProcessWc01AdapterStep(step, options.cwd)) {
    return;
  }
  await runPnpmScript(step, options);
}

async function runInProcessWc01AdapterStep(step: V2ScanLabRunStep, workspaceRoot: string) {
  void step;
  void workspaceRoot;
  return false;
}

function parseStepArgs(args: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      parsed[arg.slice(2)] = "true";
      continue;
    }
    parsed[arg.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function normalizeSeedUrls(urls: string[]): string[] {
  return [...new Set(urls.map((url) => {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      if (!parsed.pathname) {
        parsed.pathname = "/";
      }
      return parsed.toString();
    } catch {
      return undefined;
    }
  }).filter((url): url is string => Boolean(url)))];
}

async function writeTimingArtifact(timingPath: string, content: unknown) {
  await mkdir(path.dirname(timingPath), { recursive: true });
  await writeFile(timingPath, `${JSON.stringify(content, null, 2)}\n`);
}

function runPnpmScript(step: V2ScanLabRunStep, options: { cwd: string }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["-w", "run", step.script, ...step.args], {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: string[] = [];

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => output.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const tail = output.join("").split("\n").slice(-20).join("\n");
      reject(new Error(`v2 Scan Lab step "${step.label}" failed with exit code ${code}.\n${tail}`));
    });
  });
}

function runScanCliStep(step: V2ScanLabRunStep, options: { cwd: string }) {
  const args = parseStepArgs(step.args);
  if (!args.url || !args.profile || !args.out) {
    throw new Error(`Invalid arguments for ${step.script}.`);
  }
  if (!isV2ScanLabRunProfile(args.profile)) {
    throw new Error(`Unsupported v2 scan profile for ${step.script}.`);
  }

  const envFilePath = path.join(options.cwd, "apps", "web", ".env.local");
  const scanCli = resolveV2ScanCoreCliCommand(options.cwd);
  const nodeArgs = [
    ...(existsSync(envFilePath) ? [`--env-file=${envFilePath}`] : []),
    ...(scanCli.requiresTsx ? ["--import", "tsx"] : []),
    scanCli.entrypoint,
    ...step.args,
  ];

  return new Promise<void>((resolve, reject) => {
    const startedAtMs = Date.now();
    const output: string[] = [];
    const diagnosticsInput = {
      args,
      cwd: options.cwd,
      startedAtMs,
      step,
    };
    const child = spawn(process.execPath, nodeArgs, {
      cwd: options.cwd,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: normalizeV2ScanPlaywrightBrowsersPath(process.env.PLAYWRIGHT_BROWSERS_PATH),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeoutMs = scanStepTimeoutMs(args["capture-replay"] === "true");
    let settled = false;
    void writeScanStepDiagnostics({
      ...diagnosticsInput,
      output,
      status: "started",
      timeoutMs,
    });
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
        const tail = output.join("").split("\n").slice(-20).join("\n");
        void writeScanStepDiagnostics({
          ...diagnosticsInput,
          output,
          status: "timed_out",
          timeoutMs,
        }).finally(() => {
          reject(new Error(`v2 Scan Lab step "${step.label}" timed out after ${Math.round(timeoutMs / 1000)}s.\n${tail}`));
        });
      }, timeoutMs)
      : undefined;
    timeout?.unref();

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => output.push(String(chunk)));
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      void writeScanStepDiagnostics({
        ...diagnosticsInput,
        error,
        output,
        status: "failed",
        timeoutMs,
      }).finally(() => reject(error));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (code === 0) {
        void writeScanStepDiagnostics({
          ...diagnosticsInput,
          output,
          status: "completed",
          timeoutMs,
        }).finally(() => resolve());
        return;
      }
      const tail = output.join("").split("\n").slice(-20).join("\n");
      const error = new Error(`v2 Scan Lab step "${step.label}" failed with exit code ${code}.\n${tail}`);
      void writeScanStepDiagnostics({
        ...diagnosticsInput,
        error,
        exitCode: code,
        output,
        status: "failed",
        timeoutMs,
      }).finally(() => reject(error));
    });
  });
}

export function normalizeV2ScanPlaywrightBrowsersPath(value: string | undefined, nodeEnv = process.env.NODE_ENV) {
  if (value === "0" && nodeEnv === "production") {
    return "0";
  }
  return value && value !== "0" ? value : "";
}

export function resolveV2ScanCoreCliCommand(cwd: string) {
  const packageRoot = findWorkspacePackageRoot(cwd, "certscore-scan-core");
  const isWorkspaceCheckout = findWorkspaceRoot(cwd) !== cwd || existsSync(path.join(cwd, "pnpm-workspace.yaml"));
  const sourceCandidate = {
    entrypoint: packageRoot ? path.join(packageRoot, "src", "cli", "scan.ts") : "",
    requiresTsx: true,
  };
  const distCandidate = {
    entrypoint: packageRoot ? path.join(packageRoot, "dist", "cli", "scan.js") : "",
    requiresTsx: false,
  };
  const candidates = packageRoot
    ? isWorkspaceCheckout
      ? [sourceCandidate, distCandidate]
      : [
      {
        entrypoint: path.join(packageRoot, "dist", "cli", "scan.js"),
        requiresTsx: false,
      },
      {
        entrypoint: path.join(packageRoot, "src", "cli", "scan.ts"),
        requiresTsx: true,
      },
    ]
    : [];
  const match = candidates.find((candidate) => existsSync(candidate.entrypoint));
  if (!match) {
    const searchedFrom = packageRoot ?? cwd;
    throw new Error(`Unable to locate CertScore.ai v2 scan CLI from ${searchedFrom}. Expected packages/certscore-scan-core/dist/cli/scan.js or src/cli/scan.ts.`);
  }
  return match;
}

function scanStepTimeoutMs(captureReplay: boolean) {
  const explicit = process.env.CERTSCORE_V2_SCAN_STEP_TIMEOUT_MS;
  if (explicit) {
    const parsed = Number(explicit);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
  return captureReplay ? 120_000 : 0;
}

async function writeScanStepDiagnostics(input: {
  args: Record<string, string>;
  cwd: string;
  error?: unknown;
  exitCode?: number | null;
  output: string[];
  startedAtMs: number;
  status: StepDiagnosticStatus;
  step: V2ScanLabRunStep;
  timeoutMs: number;
}) {
  const outDir = input.args.out;
  if (!outDir) {
    return;
  }
  const completedAtMs = Date.now();
  const outputDir = path.resolve(input.cwd, outDir);
  const phaseArtifactPath = path.join(outputDir, "V2ScanCorePhases.json");
  const phaseArtifact = await readJsonIfExists(phaseArtifactPath);
  const files = await listOutputFiles(outputDir, 200);
  const outputLines = input.output.join("").split(/\r?\n/).filter((line) => line.length > 0);
  const diagnosticsPath = path.join(outputDir, "V2ScanLabStepDiagnostics.json");
  await mkdir(outputDir, { recursive: true });
  await writeFile(diagnosticsPath, `${JSON.stringify({
    args: {
      captureReplay: input.args["capture-replay"] === "true",
      captureReplayAuxiliaryProbes: input.args["capture-replay-aux-probes"],
      out: outputDir,
      profile: input.args.profile,
      scenarioPlanningMode: input.args["scenario-planning-mode"],
      scenarioResourceMode: input.args["scenario-resource-mode"],
      url: input.args.url,
    },
    completedAt: new Date(completedAtMs).toISOString(),
    diagnosticVersion: "wc01.v2_scan_lab_step_diagnostics.1",
    durationMs: completedAtMs - input.startedAtMs,
    error: input.error instanceof Error ? input.error.message : input.error ? String(input.error) : undefined,
    exitCode: input.exitCode,
    fileInventory: files,
    lastScanCorePhase: isRecord(phaseArtifact) ? phaseArtifact.lastCheckpoint : undefined,
    outputTail: outputLines.slice(-120),
    phaseArtifactPath: existsSync(phaseArtifactPath) ? phaseArtifactPath : undefined,
    scanCorePhaseArtifact: phaseArtifact,
    scanPhaseLogTail: outputLines.filter((line) => line.includes("[v2-scan-phase]")).slice(-40),
    startedAt: new Date(input.startedAtMs).toISOString(),
    status: input.status,
    step: {
      label: input.step.label,
      script: input.step.script,
    },
    timeoutMs: input.timeoutMs,
  }, null, 2)}\n`);
}

async function readJsonIfExists(filePath: string): Promise<unknown> {
  if (!existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function listOutputFiles(root: string, limit: number) {
  const files: Array<{ path: string; relativePath: string; sizeBytes: number }> = [];
  await walkOutputFiles(root, root, files, limit);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)).slice(0, limit);
}

async function walkOutputFiles(root: string, dir: string, files: Array<{ path: string; relativePath: string; sizeBytes: number }>, limit: number) {
  if (files.length >= limit) {
    return;
  }
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (files.length >= limit) {
      return;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkOutputFiles(root, entryPath, files, limit);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const info = await stat(entryPath).catch(() => undefined);
    if (!info) {
      continue;
    }
    files.push({
      path: entryPath,
      relativePath: path.relative(root, entryPath),
      sizeBytes: info.size,
    });
  }
}

function findWorkspaceRoot(startDir: string) {
  let currentDir = startDir;
  while (true) {
    if (existsSync(path.join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }
    currentDir = parentDir;
  }
}

function findWorkspacePackageRoot(startDir: string, packageDirName: string) {
  let currentDir = startDir;
  while (true) {
    const candidate = path.join(currentDir, "packages", packageDirName);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function formatRunTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");
}
