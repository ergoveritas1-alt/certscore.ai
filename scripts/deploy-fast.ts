import { spawn } from "node:child_process";
import { deployConsumersBeforeProducer, deployConsumersWithPreparedProducer } from "./lib/deployment-consumer-barrier";
import { assertScannerConfigurationScope, configureScannerSettingsUnlessPreserved, scannerOperationalSnapshot,
  assertScannerOperationalSettingsPreserved, type ScannerOperationalSnapshot } from "./lib/scanner-configuration-scope";
import { checkReleasePrerequisites } from "./lib/release-prerequisites";
import { assertScannerArtifact, assertScannerArtifactMetadata, settleScannerOperations, runScannerPromotions, type ScannerArtifact } from "./lib/scanner-artifact";
import { readStagedEcsReceipt } from "./lib/staged-ecs-image.mjs";
import { assertStagedCoupledRelease, stagedPromotionTiming, type StagedCoupledRelease } from "./lib/staged-coupled-release";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { awsScannerImageControl, synchronizeScannerImage } from "./lib/scanner-image-provenance";
import { installedEcsRevision } from "./lib/deployed-image.mjs";
import { deploymentInputDecision } from "./lib/deployment-inputs.mjs";
import { runtimeBaseInputsChanged } from "./lib/runtime-base-inputs.mjs";
import { scannerRuntimeBaseMode } from "./lib/scanner-runtime-base";
import { requireExpectedWebRevision, resolveDeploymentWorkflowRun, type DeploymentWorkflowRun } from "./lib/deployment-workflow-runs";

type DeployMode = "all" | "db" | "scanners" | "validation" | "web";
type LaneStatus = "failed" | "skipped" | "succeeded";

type Args = {
  baseRef: string;
  dryRun: boolean;
  mode: DeployMode;
  noPredeploy: boolean;
  preflightReceiptDir: string | null;
  noPush: boolean;
  plan: boolean;
  pushScannerRuntimeBase: boolean;
  preserveScannerConfiguration: boolean;
  preserveScannerOperationalSettings: boolean;
  ref: string | null;
  forceDb: boolean;
  forceValidation: boolean;
  forceValidationRuntimeBase: boolean;
  forceWeb: boolean;
  stagedRelease: { action: "stage" | "promote"; file: string } | null;
};

type ChangedTargets = {
  changedFiles: string[];
  db: boolean;
  lambdaRuntimeBase: boolean;
  scanners: boolean;
  validation: boolean;
  validationRuntimeBase: boolean;
  web: boolean;
};

type LaneResult = {
  details?: Record<string, string>;
  durationMs: number;
  label: string;
  status: LaneStatus;
};

type RunJson = {
  conclusion: string | null;
  databaseId: number;
  headSha: string;
  name: string;
  status: string;
  url: string;
};

const SCANNER_REGIONS = ["eu-central-1", "eu-west-1", "us-west-1"] as const;
const SCANNER_BUILD_REGION = "eu-central-1" as const;
const SCANNER_MEMORY_SIZE = 3008;
const SCANNER_FUNCTION_NAME = "certscore-v2-dag-local-lambda";
const SCANNER_WEB_BOT_AUTH_SECRET_ID = "consentcheck/web-bot-auth-private-key-pem";
const SCANNER_IDENTITY_ENVIRONMENT = {
  CERTSCORE_POST_ACCEPT_WORKER_ENABLED: "1",
  CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED: "1",
  CERTSCORE_AR_BOUND_CONTROL_DISPATCH_ENABLED: "1",
  CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED: "1",
  CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT:
    "Mozilla/5.0 (compatible; ConsentCheckBot/1.0; +https://consentcheck.site/bot)",
  SCANNER_CRAWLER_NAME: "ConsentCheckBot",
  SCANNER_CRAWLER_PUBLIC_URL: "https://consentcheck.site/bot",
  WEB_BOT_AUTH_ENABLED: "1",
  WEB_BOT_AUTH_EXPIRES_SECONDS: "60",
  WEB_BOT_AUTH_INCLUDE_NONCE: "1",
  WEB_BOT_AUTH_SIGNATURE_AGENT_URL:
    "https://consentcheck.site/.well-known/http-message-signatures-directory",
} as const;
// Enable only after every scanner image supports the bounded policy.
const SCANNER_COVERAGE_ENVIRONMENT = {
  CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED: "1",
  CERTSCORE_CMP_PREFERENCE_COVERAGE_BUDGET_POLICY: "coverage_25_gb_seconds.v1",
  CERTSCORE_ACCESSIBILITY_MENU_INSPECTION_ENABLED: "1",
} as const;
const RELEASE_REPOSITORY = "ergoveritas1-alt/certscore.ai";
const WEB_WORKFLOW = "web-aws-ecs-deploy.yml";
const VALIDATION_WORKFLOW = "validation-aws-deploy.yml";
const DB_WORKFLOW = "prod-db-migrate.yml";

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const timing = args.stagedRelease?.action === "promote" && !args.plan && !args.dryRun ? stagedPromotionTiming() : undefined;
  try {
    await executeDeployment(args, startedAt, timing);
  } finally {
    if (timing) console.log(JSON.stringify(timing.summary()));
  }
}

async function executeDeployment(args: Args, startedAt: number, timing?: ReturnType<typeof stagedPromotionTiming>) {
  assertScannerConfigurationScope(args);
  const sourceRef = args.ref ?? await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const sha = await git(["rev-parse", sourceRef]);
  const workflowRef = args.stagedRelease ? "main" : await resolveWorkflowDispatchRef(sourceRef, sha);
  const shortSha = sha.slice(0, 8);
  const changed = await classifyChanges(args.baseRef);

  console.log(`Fast deploy mode: ${args.mode}`);
  console.log(`Deploy SHA: ${sha}`);
  console.log(`Base ref: ${args.baseRef}`);
  console.log(`Changed files: ${changed.changedFiles.length}`);
  printTargets(changed);
  printPlan(args, changed, sha);

  if (args.stagedRelease) console.log(`Staged release operation: ${args.stagedRelease.action} ${args.stagedRelease.file}`);
  if (args.plan || args.dryRun) {
    console.log("");
    console.log(args.dryRun ? "Dry run complete; no deploy actions were started." : "Plan complete; no deploy actions were started.");
    return;
  }

  // Build context and checked-out source must match even for an explicit remote ref.
  await requireCleanWorktree();
  if (await git(["rev-parse", "HEAD"]) !== sha) throw new Error("Deploy ref must match the isolated checkout HEAD.");
  if (args.noPredeploy && !args.preflightReceiptDir) throw new Error("--no-predeploy requires --preflight-receipts from the exact clean source gate.");
  await checkReleasePrerequisites({ deployment: true, scanner: args.mode === "all" || args.mode === "scanners",
    prebuilt: args.stagedRelease?.action === "promote" });
  await confirmSkippedRuntimeInputs(changed, args);
  const runPreflight = () => timedLane("preflight", async () => {
    const target = { web: "web", validation: "validation-worker", scanners: "v2-dag-lambda", db: "db", all: "all" }[args.mode];
    const predeployArgs = args.mode === "all" ? ["--fast", "--all"] : ["--fast", "--target", target];
    await run(["node", "scripts/release-node.mjs", "scripts/predeploy.ts", ...predeployArgs, "--base", args.baseRef,
      ...(args.noPredeploy ? ["--require-receipts", "--reuse-receipts", args.preflightReceiptDir!] : [])]);
  });
  const preflight = await (timing ? timing.measure("preflight-receipts", runPreflight) : runPreflight());
  if (preflight.status === "failed") throw new Error("Deployment aborted because preflight failed.");

  if (args.stagedRelease) {
    const results = await runStagedCoupledRelease(args, changed, sha, args.stagedRelease, timing ?? stagedPromotionTiming());
    printSummary(results, Date.now() - startedAt, shortSha);
    if (results.some(result => result.status === "failed")) process.exitCode = 1;
    return;
  }

  let workflowRegistrationGraceMs = 0;
  if (!args.noPush && !args.ref) {
    await timedLane("git push", async () => {
      const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
      if (branch === "HEAD") {
        throw new Error("Refusing to deploy detached HEAD without --ref.");
      }
      const previousMainSha = branch === "main" ? await git(["rev-parse", "origin/main"]) : null;
      await run(["git", "push", "origin", `${branch}:${branch}`]);
      if (previousMainSha && previousMainSha !== sha) workflowRegistrationGraceMs = 20_000;
    });
  }

  const lanes: Array<Promise<LaneResult>> = [];
  if (args.mode === "all") {
    let artifact: PreparedScanner | undefined;
    const coupled = await deployConsumersWithPreparedProducer({
      prepareProducer: () => timedLane("Lambda scanner artifact preparation", async () => {
        if (!changed.scanners && !args.pushScannerRuntimeBase) return;
        artifact = await prepareScannerArtifact({ ref: sha, pushRuntimeBase: args.pushScannerRuntimeBase,
          preserveOperationalSettings: args.preserveScannerOperationalSettings });
        return { runtimeBase: artifact.runtimeBase };
      }),
      consumers: [
        () => deployWeb({ ref: sha, workflowRef, registrationGraceMs: workflowRegistrationGraceMs, force: args.forceWeb || changed.web }),
        () => deployValidation({ ref: sha, workflowRef, registrationGraceMs: workflowRegistrationGraceMs,
          skip: !args.forceValidation && !changed.validation,
          pushRuntimeBase: args.forceValidationRuntimeBase || changed.validationRuntimeBase }),
      ],
      producer: () => artifact ? promoteScannerArtifact(artifact, { ref: sha, preserveOperationalSettings: args.preserveScannerOperationalSettings })
        : Promise.resolve(skippedLane("Lambda scanner deploys", "scanner runtime inputs are proven unchanged")),
      skippedProducer: () => skippedLane("Lambda scanner deploys", "a consumer deployment failed; preserve the existing producer contract"),
    });
    lanes.push(...coupled.map(result => Promise.resolve(result)));
    lanes.push(Promise.resolve(skippedLane(
      "production DB migrations",
      "the web workflow applies migrations from the target image before ECS promotion"
    )));
  } else if (args.mode === "web") {
    lanes.push(deployWeb({ ref: sha, workflowRef, registrationGraceMs: workflowRegistrationGraceMs, force: args.forceWeb || changed.web }));
  } else if (args.mode === "validation") {
    lanes.push(deployValidation({
      ref: sha,
      workflowRef,
      registrationGraceMs: workflowRegistrationGraceMs,
      skip: !args.forceValidation && !changed.validation,
      pushRuntimeBase: args.forceValidationRuntimeBase || changed.validationRuntimeBase
    }));
  } else if (args.mode === "db") {
    lanes.push(deployDb({ ref: sha, workflowRef, skip: false }));
  } else {
    lanes.push(changed.scanners || args.pushScannerRuntimeBase
      ? deployScanners({ ref: sha, pushRuntimeBase: args.pushScannerRuntimeBase, preserveOperationalSettings: args.preserveScannerOperationalSettings })
      : Promise.resolve(skippedLane("Lambda scanner deploys", "scanner runtime inputs are proven unchanged")));
  }

  const results = await Promise.all(lanes);

  if ((args.mode === "all" || args.mode === "web") && (changed.web || args.forceWeb)) {
    results.push(await verifyLiveWeb(sha));
  }

  if ((args.mode === "all" || args.mode === "scanners") && (changed.scanners || args.pushScannerRuntimeBase)) {
    results.push(await timedLane("verify Lambda scanners", async () => {
      await verifyScanners(sha);
    }));
  }

  printSummary(results, Date.now() - startedAt, shortSha);
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    process.exit(1);
  }
}

function parseArgs(argv: string[]): Args {
  const [modeArg = "all", ...rest] = argv;
  if (!isDeployMode(modeArg)) {
    throw new Error(`Unknown deploy mode: ${modeArg}`);
  }

  const args: Args = {
    baseRef: process.env.DEPLOY_BASE_REF ?? "origin/main",
    dryRun: false,
    forceDb: false,
    forceValidation: false,
    forceValidationRuntimeBase: false,
    forceWeb: false,
    mode: modeArg,
    noPredeploy: false,
    preflightReceiptDir: null,
    noPush: false,
    plan: false,
    pushScannerRuntimeBase: false,
    preserveScannerConfiguration: false,
    preserveScannerOperationalSettings: false,
    ref: null,
    stagedRelease: null
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;
    if (arg === "--") {
      continue;
    }
    if (arg === "--stage-release" || arg === "--promote-release") {
      if (args.stagedRelease) throw new Error("Select one staged release operation.");
      args.stagedRelease = { action: arg === "--stage-release" ? "stage" : "promote", file: requireValue(rest, index, arg) };
      index++;
      continue;
    }
    if (arg === "--preflight-receipts") {
      args.preflightReceiptDir = requireValue(rest, index, "--preflight-receipts"); index++; continue;
    }
    if (arg === "--base") {
      args.baseRef = requireValue(rest, index, "--base");
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      args.baseRef = arg.slice("--base=".length);
      continue;
    }
    if (arg === "--ref") {
      args.ref = requireValue(rest, index, "--ref");
      index += 1;
      continue;
    }
    if (arg.startsWith("--ref=")) {
      args.ref = arg.slice("--ref=".length);
      continue;
    }
    if (arg === "--force-db") {
      args.forceDb = true;
      continue;
    }
    if (arg === "--force-validation") {
      args.forceValidation = true;
      continue;
    }
    if (arg === "--force-validation-runtime-base") {
      args.forceValidation = true;
      args.forceValidationRuntimeBase = true;
      continue;
    }
    if (arg === "--push-runtime-base") {
      args.pushScannerRuntimeBase = true;
      continue;
    }
    if (arg === "--force-web") {
      args.forceWeb = true;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--preserve-scanner-configuration") {
      args.preserveScannerConfiguration = true;
      continue;
    }
    if (arg === "--preserve-scanner-operational-settings") {
      args.preserveScannerOperationalSettings = true;
      continue;
    }
    if (arg === "--plan") {
      args.plan = true;
      continue;
    }
    if (arg === "--no-predeploy" || arg === "--no-preflight") {
      args.noPredeploy = true;
      continue;
    }
    if (arg === "--no-push") {
      args.noPush = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (args.stagedRelease && (args.mode !== "all" || !args.noPush || !args.noPredeploy || !args.preflightReceiptDir ||
      !args.ref || !/^[a-f0-9]{40}$/.test(args.ref) || !/^[a-f0-9]{40}$/.test(args.baseRef) || args.ref === args.baseRef ||
      args.pushScannerRuntimeBase || args.forceDb || args.forceValidation || args.forceWeb || !args.preserveScannerOperationalSettings)) {
    throw new Error("Staged releases require deploy:all, full target and live-base SHAs, --no-push, exact preflight receipts, and --preserve-scanner-operational-settings.");
  }
  return args;
}

function isDeployMode(value: string): value is DeployMode {
  return ["all", "db", "scanners", "validation", "web"].includes(value);
}

function requireValue(args: string[], index: number, label: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${label} requires a value`);
  }
  return value;
}

async function classifyChanges(baseRef: string): Promise<ChangedTargets> {
  const files = new Set<string>();
  if (!await gitRefExists(baseRef)) throw new Error(`Deployment base is unavailable: ${baseRef}`);
  if (await gitRefExists(baseRef)) {
    const mergeBase = await git(["merge-base", baseRef, "HEAD"]);
    addLines(files, await git(["diff", "--name-only", `${mergeBase.trim()}..HEAD`]));
  }
  addLines(files, await git(["diff", "--name-only"]));
  addLines(files, await git(["diff", "--name-only", "--cached"]));
  addLines(files, await git(["ls-files", "--others", "--exclude-standard"]));

  const changedFiles = [...files].sort();
  const readBase = (file: string) => git(["show", `${baseRef}:${file}`]);
  const readWorking = (file: string) => readFile(file, "utf8");
  const select = async (service: string) => (await deploymentInputDecision(service, changedFiles, readBase, readWorking)).deploy;
  return {
    changedFiles,
    db: changedFiles.some(isDbDeployInput),
    lambdaRuntimeBase: await runtimeBaseInputsChanged("scanners", changedFiles, readBase, readWorking),
    scanners: await select("scanners"),
    validation: await select("validation"),
    validationRuntimeBase: await runtimeBaseInputsChanged("validation", changedFiles, readBase, readWorking),
    web: await select("web")
  };
}

/** A diff against the web release is not proof that another service is current.
 * Before skipping, bind unchanged source to that service's installed revision. */
async function confirmSkippedRuntimeInputs(changed: ChangedTargets, args: Args) {
  const equivalent = async (service: string, base: string) => {
    if (!/^[a-f0-9]{40}$/.test(base) || !await gitRefExists(base)) return false;
    const files = (await git(["diff", "--name-only", "--no-renames", base, "HEAD"])).split("\n").filter(Boolean);
    return !(await deploymentInputDecision(service, files,
      (file: string) => git(["show", `${base}:${file}`]), (file: string) => readFile(file, "utf8"))).deploy;
  };
  const readAws = async (command: string[]) => JSON.parse((await run(["aws", ...command, "--output", "json"], { quiet: true })).stdout);
  if ((args.mode === "all" || args.mode === "web")) {
    try {
      const topology = JSON.parse(await readFile("config/deployment-topology.json", "utf8"));
      const response = await fetch(new URL("/api/version", process.env.LIVE_BASE_URL ?? topology.primaryHost), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      const live = await response.json();
      changed.web = !response.ok || live.runtimeTarget !== "ecs-fargate" || !await equivalent("web", live.gitSha);
    } catch { changed.web = true; }
  }
  if ((args.mode === "all" || args.mode === "validation")) {
    try {
      const variable = async (name: string) => (await run(["gh", "variable", "get", name], { quiet: true })).stdout.trim();
      const cluster = await variable("AWS_VALIDATION_ECS_CLUSTER"), service = await variable("AWS_VALIDATION_ECS_WORKER_SERVICE");
      const region = (await run(["gh", "variable", "get", "AWS_REGION"], { quiet: true, reject: false })).stdout.trim() || "us-west-1";
      const state = await readAws(["ecs", "describe-services", "--region", region, "--cluster", cluster, "--services", service]);
      const definition = await readAws(["ecs", "describe-task-definition", "--region", region, "--task-definition", state.services?.[0]?.taskDefinition ?? "unverified"]);
      const repository = await variable("AWS_VALIDATION_WORKER_ECR_REPOSITORY");
      const container = (await run(["gh", "variable", "get", "AWS_VALIDATION_ECS_WORKER_CONTAINER"], { quiet: true, reject: false })).stdout.trim() || "validation-worker";
      const revision = await installedEcsRevision(state, definition, { repository, region, container,
        resolveDigest: async (sha: string) => (await readAws(["ecr", "describe-images", "--region", region,
          "--repository-name", repository, "--image-ids", `imageTag=${sha}`])).imageDetails?.[0]?.imageDigest });
      changed.validation = !await equivalent("validation", revision);
      if (args.stagedRelease && changed.validation) {
        if (!await gitRefExists(revision)) throw new Error("Installed validation source is unavailable.");
        const files = (await git(["diff", "--name-only", "--no-renames", revision, "HEAD"])).split("\n").filter(Boolean);
        changed.validationRuntimeBase ||= await runtimeBaseInputsChanged("validation", files,
          (file: string) => git(["show", `${revision}:${file}`]), (file: string) => readFile(file, "utf8"));
      }
    } catch {
      changed.validation = true;
      if (args.stagedRelease) changed.validationRuntimeBase = true;
    }
  }
  if ((args.mode === "all" || args.mode === "scanners")) {
    try {
      const base = await git(["rev-parse", args.baseRef]);
      if (!await equivalent("scanners", base)) throw Error("Scanner source differs");
      for (const region of SCANNER_REGIONS) {
        const image = await readAws(["ecr", "describe-images", "--region", region, "--repository-name", "certscore-v2-dag-local-lambda", "--image-ids", `imageTag=${base}`]);
        const digest = image.imageDetails?.[0]?.imageDigest;
        if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) throw Error("Unknown scanner artifact");
        for (const name of [SCANNER_FUNCTION_NAME, `${SCANNER_FUNCTION_NAME}-inventory`]) {
          const installed = await readAws(["lambda", "get-function", "--region", region, "--function-name", name, "--query", "{image:Code.ResolvedImageUri,state:Configuration.State,update:Configuration.LastUpdateStatus}"]);
          if (installed.state !== "Active" || installed.update !== "Successful" || installed.image !== `199536052647.dkr.ecr.${region}.amazonaws.com/certscore-v2-dag-local-lambda@${digest}`) throw Error("Scanner artifact differs");
        }
      }
    } catch { changed.scanners = true; }
  }
  console.log("Installed-runtime selection verified; unknown service revisions conservatively require deployment.");
  printTargets(changed);
}

function isDbDeployInput(file: string) {
  return file.startsWith("packages/db/migrations/") ||
    file === "scripts/apply-db-migrations.mjs" ||
    file === ".github/workflows/prod-db-migrate.yml";
}

async function readLiveWebVersion(useConfiguredHost = false) {
  const topology = JSON.parse(await readFile("config/deployment-topology.json", "utf8")) as { primaryHost: string };
  const host = (useConfiguredHost ? undefined : process.env.LIVE_BASE_URL) ?? topology.primaryHost;
  const response = await fetch(new URL("/api/version", host), {
    cache: "no-store", signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Live web revision request failed with HTTP ${response.status}`);
  return response.json();
}

function verifyLiveWeb(sha: string, useConfiguredHost = false) {
  return timedLane("verify live web", async () => {
    requireExpectedWebRevision(await readLiveWebVersion(useConfiguredHost), sha);
    await run(["pnpm", "ops:check:live"], { env: { EXPECTED_LIVE_GIT_SHA: sha } });
    await run(["pnpm", "ops:check:deploy"], { env: {
      EXPECTED_LIVE_GIT_SHA: sha, SKIP_LIVE_DEPLOY_CHECK: "0"
    } });
  });
}

function readStagedImage(kind: "web" | "validation", sha: string, runId: string) {
  return readStagedEcsReceipt({ kind, sha, runId, repository: RELEASE_REPOSITORY });
}

async function runStagedCoupledRelease(args: Args, changed: ChangedTargets, sha: string, operation: NonNullable<Args["stagedRelease"]>, timing: ReturnType<typeof stagedPromotionTiming>) {
  const origin = await git(["remote", "get-url", "origin"]);
  if (origin.replace(/\.git$/, "") !== `https://github.com/${RELEASE_REPOSITORY}`) throw new Error("Staged release requires the canonical GitHub origin.");
  const [main, enabled] = await Promise.all([
    git(["ls-remote", "--exit-code", "origin", "refs/heads/main"]),
    run(["gh", "variable", "get", "AWS_STAGED_COUPLED_RELEASES", "--repo", RELEASE_REPOSITORY], { quiet: true })
  ]);
  if (enabled.stdout.trim() !== "true") throw new Error("Staged releases are not enabled for the web workflow.");
  if (main !== `${sha}\trefs/heads/main`) throw new Error("The staged release must match the current remote main SHA.");
  const live = await readLiveWebVersion(true);
  // A retry can finish scanner promotion after the intended web revision is already live.
  const expectedLive = operation.action === "promote" && live?.gitSha === sha ? sha : args.baseRef;
  requireExpectedWebRevision(live, expectedLive);
  if (changed.lambdaRuntimeBase || changed.validationRuntimeBase) throw new Error("Staged promotion requires existing runtime bases.");

  const scannerInput = { ref: sha, preserveOperationalSettings: true } as const;
  if (operation.action === "stage") {
    if (!changed.web || !changed.scanners) throw new Error("Staging requires affected web and scanner runtimes.");
    if (existsSync(operation.file)) throw new Error("Choose a new staged release receipt path.");
    let web: { runId: string; image: string } | undefined;
    let scanner: PreparedScanner | undefined;
    let validation: StagedCoupledRelease["validation"];
    const results = await Promise.all([
      timedLane("Stage verified web image", async () => {
        const runId = await ensureWorkflowRun(WEB_WORKFLOW, "main", sha, ["-f", "stage_only=true", "-f", `staged_base_sha=${args.baseRef}`],
          true, 0, `Stage public web ${sha}`);
        const workflow = await waitForRun(runId);
        const { binding: image } = await readStagedImage("web", sha, runId);
        web = { runId, image };
        return { url: workflow.url, image };
      }),
      ...(changed.validation ? [timedLane("Stage verified validation image", async () => {
        const runId = await ensureWorkflowRun(VALIDATION_WORKFLOW, "main", sha,
          ["-f", "stage_only=true", "-f", `expected_sha=${sha}`], true, 0, `Stage validation ${sha}`);
        const workflow = await waitForRun(runId);
        const { binding: image } = await readStagedImage("validation", sha, runId);
        validation = { runId, image };
        return { url: workflow.url, image };
      })] : []),
      timedLane("Stage regional scanner image", async () => {
        scanner = await prepareScannerArtifact({ ...scannerInput, pushRuntimeBase: false });
        return { runtimeBase: scanner.runtimeBase };
      }),
    ]);
    if (results.some(result => result.status === "failed")) return results;
    if (!web || !scanner?.preservedSettings || (changed.validation && !validation)) throw new Error("Staging did not produce every required verified artifact.");
    const { preservedSettings, ...artifact } = scanner;
    const staged: StagedCoupledRelease = { version: 1, sha, baseSha: args.baseRef, stagedAt: new Date().toISOString(),
      webRunId: web.runId, webImage: web.image, validation, scanner: artifact, scannerSettings: Object.fromEntries(preservedSettings) };
    assertStagedCoupledRelease(staged, sha, args.baseRef);
    await writeFile(operation.file, JSON.stringify(staged, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Staged release receipt: ${operation.file}`);
    return results;
  }

  const info = await lstat(operation.file);
  if (!info.isFile() || info.size > 16_384) throw new Error("Invalid staged release receipt file.");
  const receipt = JSON.parse(await readFile(operation.file, "utf8")) as StagedCoupledRelease;
  assertStagedCoupledRelease(receipt, sha, args.baseRef);
  const validation = receipt.validation;
  if (changed.validation && !validation) throw new Error("Validation is affected and has no staged image. Prepare a new coupled release.");
  // Verify the approved regional tags still resolve to the recorded immutable bytes.
  await timing.measure("staged-artifact-readback", () => settleScannerOperations([
    readStagedImage("web", sha, receipt.webRunId).then(({ binding }) => {
      if (binding !== receipt.webImage) throw new Error("Staged web digest or run attempt changed.");
    }),
    ...(validation ? [readStagedImage("validation", sha, validation.runId).then(({ binding }) => {
      if (binding !== validation.image) throw new Error("Staged validation digest or run attempt changed.");
    })] : []),
    ...SCANNER_REGIONS.map(async region => {
      const result = await run(["aws", "ecr", "describe-images", "--region", region,
        "--repository-name", "certscore-v2-dag-local-lambda", "--image-ids", `imageTag=${sha}`,
        "--query", "imageDetails[0].imageDigest", "--output", "text"], { quiet: true });
      if (receipt.scanner.images[region]?.split("@")[1] !== result.stdout.trim()) throw new Error(`Staged scanner image changed in ${region}.`);
    }),
  ]));
  const artifact: PreparedScanner = { ...receipt.scanner, preservedSettings: new Map(Object.entries(receipt.scannerSettings)) };
  const results = await deployConsumersBeforeProducer({
    consumers: [
      async () => {
        const web = await timing.measure("web-migration-and-ecs", () => deployWeb({ force: true, ref: sha, workflowRef: "main", stage: { runId: receipt.webRunId, image: receipt.webImage, baseSha: receipt.baseSha } }));
        if (web.status !== "succeeded") return web;
        const verification = await timing.measure("live-web-revision", () => verifyLiveWeb(sha, true));
        return verification.status === "succeeded" ? web : verification;
      },
      () => timing.measure("validation-ecs", () => deployValidation({ ref: sha, workflowRef: "main", skip: !changed.validation, pushRuntimeBase: false, stage: validation })),
    ],
    producer: () => timing.measure("scanner-promotion", () => promoteScannerArtifact(artifact, { ...scannerInput, parallelFunctions: true })),
    skippedProducer: () => skippedLane("Lambda scanner deploys", "a consumer deployment failed; preserve the existing producer contract"),
  });
  if (results.at(-1)?.status === "succeeded") {
    results.push(await timing.measure("scanner-final-readback", () => timedLane("verify Lambda scanners", async () => {
      await verifyScanners(sha, { afterStagedPromotion: true });
    })));
  }
  return results;
}

async function deployWeb(input: { force: boolean; ref: string; workflowRef: string; registrationGraceMs?: number; stage?: { runId: string; image: string; baseSha: string } }): Promise<LaneResult> {
  if (!input.force) return skippedLane("web ECS deploy", "web runtime inputs are proven unchanged");
  return timedLane("web ECS deploy", async () => {
    await run([
      "node", "--import", "tsx",
      "scripts/assert-forward-web-deploy.ts",
      "--target", input.ref
    ]);
    const { stage } = input;
    const runId = await ensureWorkflowRun(WEB_WORKFLOW, input.workflowRef, input.ref,
      stage ? ["-f", `staged_run_id=${stage.runId}`, "-f", `staged_image=${stage.image}`, "-f", `staged_base_sha=${stage.baseSha}`] : [], false, input.registrationGraceMs,
      stage ? `Promote public web ${input.ref} from ${stage.runId} ${stage.image}` : undefined);
    const workflowRun = await waitForRun(runId);
    return { workflow: WEB_WORKFLOW, url: workflowRun.url };
  });
}

async function deployValidation(input: { pushRuntimeBase: boolean; ref: string; skip: boolean; workflowRef: string; registrationGraceMs?: number; stage?: StagedCoupledRelease["validation"] }): Promise<LaneResult> {
  if (input.skip) {
    return skippedLane("validation deploy", "no validation deploy inputs changed");
  }
  return timedLane("validation AWS deploy", async () => {
    const { stage } = input;
    const runId = await ensureWorkflowRun(VALIDATION_WORKFLOW, input.workflowRef, input.ref, [
      "-f", "use_runtime_base=true",
      "-f", `push_runtime_base=${input.pushRuntimeBase ? "true" : "false"}`,
      "-f", "runtime_base_tag=validation-worker-runtime-base",
      ...(stage ? ["-f", `expected_sha=${input.ref}`, "-f", `staged_run_id=${stage.runId}`, "-f", `staged_image=${stage.image}`] : []),
    ], input.pushRuntimeBase, input.registrationGraceMs,
    stage ? `Promote validation ${input.ref} from ${stage.runId} ${stage.image}` : undefined);
    const workflowRun = await waitForRun(runId);
    return {
      runtimeBase: input.pushRuntimeBase ? "rebuilt" : "reused",
      workflow: VALIDATION_WORKFLOW,
      url: workflowRun.url
    };
  });
}

async function deployDb(input: { ref: string; skip: boolean; workflowRef: string; registrationGraceMs?: number }): Promise<LaneResult> {
  if (input.skip) {
    return skippedLane("production DB migrations", "no migration inputs changed");
  }
  return timedLane("production DB migrations", async () => {
    const runId = await ensureWorkflowRun(DB_WORKFLOW, input.workflowRef, input.ref, [], true);
    const workflowRun = await waitForRun(runId);
    return { workflow: DB_WORKFLOW, url: workflowRun.url };
  });
}

type PreparedScanner = ScannerArtifact & { preservedSettings: Map<string, ScannerOperationalSnapshot> | null };

/** Builds/replicates ECR artifacts only. No Lambda code, environment or settings writer is reachable here. */
async function prepareScannerArtifact(input: { pushRuntimeBase: boolean; ref: string; preserveOperationalSettings: boolean }): Promise<PreparedScanner> {
    const baselineSettings = await readScannerOperationalSettings();
    const preservedSettings = input.preserveOperationalSettings ? baselineSettings : null;
    const runtimeBase = await scannerRuntimeBaseMode({
      buildRegion: SCANNER_BUILD_REGION,
      rebuild: input.pushRuntimeBase,
      available: async (region) => {
        const result = await run([
          "aws", "ecr", "describe-images",
          "--region", region,
          "--repository-name", "certscore-v2-dag-local-lambda",
          "--image-ids", "imageTag=runtime-base"
        ], { quiet: true, reject: false });
        return result.exitCode === 0;
      }
    });
    const dockerConfigRoot = path.join(tmpdir(), `certscore-lambda-deploy-${process.pid}-${input.ref.slice(0, 8)}`);
    const dockerConfigByRegion = Object.fromEntries(SCANNER_REGIONS.map((region) => [
      region,
      path.join(dockerConfigRoot, region)
    ])) as Record<(typeof SCANNER_REGIONS)[number], string>;
    await Promise.all(Object.values(dockerConfigByRegion).map(async (directory) => {
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, "config.json"),
        `${JSON.stringify({ auths: {} }, null, 2)}\n`,
        "utf8",
      );
    }));

    try {
      // Each region gets an isolated temporary Docker credential store. This
      // avoids macOS Keychain/helper contention without sharing auth state.
      await settleScannerOperations(SCANNER_REGIONS.map((region) => run([
        "bash",
        "scripts/local-v2-dag-lambda/build-push-dev-image.sh"
      ], {
        env: {
          AWS_REGION: region,
          CERTSCORE_V2_DAG_LAMBDA_ECR_AUTH_ONLY: "true",
          DOCKER_CONFIG: dockerConfigByRegion[region]
        }
      })));

      const sourceImageUri = `199536052647.dkr.ecr.${SCANNER_BUILD_REGION}.amazonaws.com/certscore-v2-dag-local-lambda:${input.ref}`;
      const sourceRuntimeBaseUri = `199536052647.dkr.ecr.${SCANNER_BUILD_REGION}.amazonaws.com/certscore-v2-dag-local-lambda:runtime-base`;
      await run([
        "bash",
        "scripts/local-v2-dag-lambda/build-push-dev-image.sh"
      ], {
        env: {
          AWS_REGION: SCANNER_BUILD_REGION,
          BUILD_GIT_SHA: input.ref,
          BUILD_IMAGE_TAG: input.ref,
          CERTSCORE_V2_DAG_LAMBDA_IMAGE_TAG: input.ref,
          CERTSCORE_V2_DAG_LAMBDA_PUSH_RUNTIME_BASE: input.pushRuntimeBase ? "true" : "false",
          CERTSCORE_V2_DAG_LAMBDA_SKIP_ECR_LOGIN: "true",
          CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE: "true",
          CERTSCORE_V2_DAG_LAMBDA_SKIP_BUILD_CACHE_PUSH: "true",
          DOCKER_CONFIG: dockerConfigByRegion[SCANNER_BUILD_REGION]
        }
      });

      const results = await settleScannerOperations(SCANNER_REGIONS.map(async (region) => {
        const regionStart = Date.now();
        const imageUri = `199536052647.dkr.ecr.${region}.amazonaws.com/certscore-v2-dag-local-lambda:${input.ref}`;
        if (region !== SCANNER_BUILD_REGION) {
          await run([
            "bash",
            "scripts/local-v2-dag-lambda/replicate-dev-image.sh",
            sourceImageUri,
            ...(input.pushRuntimeBase ? [sourceRuntimeBaseUri] : [])
          ], {
            env: {
              AWS_REGION: region,
              DOCKER_CONFIG: dockerConfigByRegion[region]
            }
          });
        }
        const digestResult = await run([
          "aws", "ecr", "describe-images",
          "--region", region,
          "--repository-name", "certscore-v2-dag-local-lambda",
          "--image-ids", `imageTag=${input.ref}`,
          "--query", "imageDetails[0].imageDigest",
          "--output", "text"
        ], { quiet: true });
        const imageDigest = digestResult.stdout.trim();
        if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) {
          throw new Error(`Could not resolve an immutable scanner image digest in ${region}.`);
        }
        const digestImageUri = `${imageUri.split(":")[0]}@${imageDigest}`;

        return {
          durationMs: Date.now() - regionStart,
          imageUri: digestImageUri,
          region,
          runtimeBase
        };
      }));

      const artifact: PreparedScanner = { sha: input.ref, runtimeBase, preservedSettings,
        images: Object.fromEntries(results.map(result => [result.region, result.imageUri])) };
      assertScannerArtifact(artifact, input.ref);
      // Verify embedded release metadata, rather than trusting a mutable ECR SHA tag.
      const metadata = await run(["docker", "buildx", "imagetools", "inspect", artifact.images[SCANNER_BUILD_REGION]!,
        "--format", "{{json .Image.Config.Env}}"], { quiet: true, env: { DOCKER_CONFIG: dockerConfigByRegion[SCANNER_BUILD_REGION] } });
      const environment: unknown = JSON.parse(metadata.stdout);
      assertScannerArtifactMetadata(environment, input.ref);
      return artifact;
    } finally {
      await rm(dockerConfigRoot, { force: true, recursive: true });
    }
}

/** Every runtime mutation is confined to this function, after consumer success. */
async function promoteScannerArtifact(artifact: PreparedScanner, input: { ref: string; preserveOperationalSettings: boolean; parallelFunctions?: boolean }): Promise<LaneResult> {
  return timedLane("Lambda scanner deploys", async () => {
    assertScannerArtifact(artifact, input.ref);
    await requireCleanWorktree();
    if (await git(["rev-parse", "HEAD"]) !== input.ref) throw new Error("Scanner checkout SHA changed during consumer deployment.");
    // Recheck interrupted/concurrent operations in all six workers before any write.
    const current = await readScannerOperationalSettings();
    if (artifact.preservedSettings) for (const [key, before] of artifact.preservedSettings) {
      assertScannerOperationalSettingsPreserved(before, current.get(key)!);
    }
    await configureScannerSettingsUnlessPreserved(input.preserveOperationalSettings, async () => {
      await applyScannerRuntimeConfiguration();
    });
    await runScannerPromotions(async (region, inventory) => {
      const started = performance.now();
      try {
        await synchronizeScannerImage(awsScannerImageControl(region, inventory), artifact.images[region]!, true,
          timing => console.log(JSON.stringify({ scannerRegion: region, inventory, ...timing })));
      } finally {
        if (input.parallelFunctions) console.log(`Scanner ${region} ${inventory ? "inventory" : "primary"} handoff: ${Math.round(performance.now() - started)}ms`);
      }
    }, input.parallelFunctions === true);
    await configureScannerSettingsUnlessPreserved(input.preserveOperationalSettings, async () => {
      await applyScannerRuntimeConfiguration(true);
    });
    if (artifact.preservedSettings) {
      const after = await readScannerOperationalSettings();
      for (const [key, before] of artifact.preservedSettings) assertScannerOperationalSettingsPreserved(before, after.get(key)!);
    }
    const parityStarted = performance.now();
    await run(["node", "scripts/release-node.mjs", "scripts/check-regional-scanner-parity.ts"]);
    const authStarted = performance.now();
    console.log(`Scanner regional parity: ${Math.round(authStarted - parityStarted)}ms`);
    await run(["node", "scripts/release-node.mjs", "scripts/check-regional-web-bot-auth.ts"], { env: { AWS_MAX_ATTEMPTS: "1" } });
    console.log(`Scanner regional web-bot auth: ${Math.round(performance.now() - authStarted)}ms`);
    return { runtimeBase: artifact.runtimeBase, regionParity: "passed", webBotAuth: "verified in all scanner regions", ...artifact.images };
  });
}

async function deployScanners(input: { pushRuntimeBase: boolean; ref: string; preserveOperationalSettings: boolean }): Promise<LaneResult> {
  let artifact: PreparedScanner | undefined;
  const preparation = await timedLane("Lambda scanner artifact preparation", async () => {
    artifact = await prepareScannerArtifact(input); return { runtimeBase: artifact.runtimeBase };
  });
  if (preparation.status !== "succeeded") return preparation;
  return promoteScannerArtifact(artifact!, input);
}

async function readScannerOperationalSettings() {
  const entries = await Promise.all(SCANNER_REGIONS.flatMap(region =>
    [SCANNER_FUNCTION_NAME, `${SCANNER_FUNCTION_NAME}-inventory`].map(async functionName => {
      const current = await run(["aws", "lambda", "get-function-configuration", "--region", region,
        "--function-name", functionName,
        "--query", "{MemorySize:MemorySize,Timeout:Timeout,Variables:Environment.Variables,RevisionId:RevisionId,EnvironmentError:Environment.Error,State:State,LastUpdateStatus:LastUpdateStatus}",
        "--output", "json"], { quiet: true });
      let payload: unknown;
      try { payload = JSON.parse(current.stdout); }
      catch { throw new Error("Scanner operational settings readback is invalid JSON; sensitive details omitted."); }
      const snapshot = scannerOperationalSnapshot(payload, {
        memoryMb: SCANNER_MEMORY_SIZE, inventory: functionName.endsWith("-inventory"),
      });
      return [`${region}/${functionName}`, snapshot] as const;
    })));
  return new Map<string, ScannerOperationalSnapshot>(entries);
}

async function readScannerWebBotAuthPrivateKey() {
  const result = await run([
    "aws", "secretsmanager", "get-secret-value",
    "--region", "us-west-1",
    "--secret-id", SCANNER_WEB_BOT_AUTH_SECRET_ID,
    "--query", "SecretString",
    "--output", "text",
  ], { quiet: true });
  const privateKeyPem = result.stdout.trim();
  if (!privateKeyPem.includes("BEGIN PRIVATE KEY") || !privateKeyPem.includes("END PRIVATE KEY")) {
    throw new Error("ConsentCheck Web Bot Auth secret is not a PKCS#8 private key.");
  }
  return privateKeyPem;
}

async function applyScannerRuntimeConfiguration(enableCoverage = false) {
  console.log(`Applying ${SCANNER_MEMORY_SIZE} MB memory and verified ConsentCheck identity before image promotion.`);
  const privateKeyPem = await readScannerWebBotAuthPrivateKey();
  const requiredEnvironment = { ...SCANNER_IDENTITY_ENVIRONMENT, ...(enableCoverage ? SCANNER_COVERAGE_ENVIRONMENT : {}) };
  const results = await Promise.all(SCANNER_REGIONS.flatMap(region => [SCANNER_FUNCTION_NAME, `${SCANNER_FUNCTION_NAME}-inventory`].map(async (functionName) => {
    const current = await run([
      "aws", "lambda", "get-function-configuration",
      "--region", region,
      "--function-name", functionName,
      "--query", "{MemorySize:MemorySize,Variables:Environment.Variables,RevisionId:RevisionId,EnvironmentError:Environment.Error}",
      "--output", "json"
    ], { quiet: true });
    const currentPayload = JSON.parse(current.stdout) as {
      MemorySize?: number;
      Variables?: Record<string, string>;
      RevisionId?: string;
      EnvironmentError?: unknown;
    };
    if (!currentPayload.RevisionId || currentPayload.EnvironmentError || !currentPayload.Variables) throw new Error(`${region} scanner environment is unavailable; refusing a replacement.`);
    const currentVariables = currentPayload.Variables ?? {};
    const nextVariables = {
      ...currentVariables,
      ...requiredEnvironment,
      WEB_BOT_AUTH_PRIVATE_KEY_PEM: privateKeyPem,
    };
    const identityChanged = Object.entries({
      ...requiredEnvironment,
      WEB_BOT_AUTH_PRIVATE_KEY_PEM: privateKeyPem,
    }).some(([key, value]) => currentVariables[key] !== value);
    const memoryChanged = currentPayload.MemorySize !== SCANNER_MEMORY_SIZE;
    const environmentDocument = JSON.stringify({ Variables: nextVariables });
    if (Buffer.byteLength(environmentDocument, "utf8") > 4_096) {
      throw new Error(`${region} scanner environment would exceed Lambda's 4 KiB limit.`);
    }
    if (identityChanged || memoryChanged) {
      const environmentPath = path.join(
        tmpdir(),
        `certscore-scanner-identity-${process.pid}-${region}-${functionName}.json`,
      );
      await writeFile(environmentPath, `${environmentDocument}\n`, { encoding: "utf8", mode: 0o600 });
      try {
        await run([
          "aws", "lambda", "update-function-configuration",
          "--region", region,
          "--function-name", functionName,
          "--memory-size", String(SCANNER_MEMORY_SIZE),
          "--revision-id", currentPayload.RevisionId,
          "--environment", `file://${environmentPath}`,
        ], { quiet: true });
      } finally {
        await rm(environmentPath, { force: true });
      }
      await run([
        "aws", "lambda", "wait", "function-updated-v2",
        "--region", region,
        "--function-name", functionName
      ], { quiet: true });
    }
    const verified = await run([
      "aws", "lambda", "get-function-configuration",
      "--region", region,
      "--function-name", functionName,
      "--query", "{MemorySize:MemorySize,LastUpdateStatus:LastUpdateStatus,State:State,Variables:Environment.Variables}",
      "--output", "json"
    ], { quiet: true });
    const payload = JSON.parse(verified.stdout) as {
      LastUpdateStatus?: string;
      MemorySize?: number;
      State?: string;
      Variables?: Record<string, string>;
    };
    const verifiedVariables = payload.Variables ?? {};
    const identityConverged = Object.entries(requiredEnvironment)
      .every(([key, value]) => verifiedVariables[key] === value) &&
      verifiedVariables.WEB_BOT_AUTH_PRIVATE_KEY_PEM === privateKeyPem;
    if (
      payload.MemorySize !== SCANNER_MEMORY_SIZE ||
      payload.LastUpdateStatus !== "Successful" ||
      payload.State !== "Active" ||
      !identityConverged
    ) {
      throw new Error(`${region} scanner runtime configuration did not converge.`);
    }
    return { changed: identityChanged || memoryChanged, region, functionName };
  })));
  for (const result of results) {
    console.log(`${result.region} ${result.functionName}: ${SCANNER_MEMORY_SIZE} MB and verified identity (${result.changed ? "updated" : "already configured"})`);
  }
}

async function verifyScanners(expectedSha: string, { afterStagedPromotion = false } = {}) {
  const reports = await Promise.all(SCANNER_REGIONS.map(async (region) => {
    const [result, expectedDigestResult] = await Promise.all([
      (async () => {
        // Staged promotion has already waited for each update. A new in-flight
        // mutation fails the fresh health read below rather than being waited out.
        if (!afterStagedPromotion) await run([
          "aws", "lambda", "wait", "function-updated-v2",
          "--region", region,
          "--function-name", SCANNER_FUNCTION_NAME
        ], { quiet: true });
        return run([
          "aws", "lambda", "get-function",
          "--region", region,
          "--function-name", SCANNER_FUNCTION_NAME,
          "--query", "{ImageUri:Code.ResolvedImageUri,RecordedImageDigest:Configuration.Environment.Variables.SCANNER_IMAGE_DIGEST,LastUpdateStatus:Configuration.LastUpdateStatus,State:Configuration.State,Updated:Configuration.LastModified,MemorySize:Configuration.MemorySize}",
          "--output", "json"
        ], { quiet: true });
      })(),
      run([
        "aws", "ecr", "describe-images",
        "--region", region,
        "--repository-name", "certscore-v2-dag-local-lambda",
        "--image-ids", `imageTag=${expectedSha}`,
        "--query", "imageDetails[0].imageDigest",
        "--output", "text"
      ], { quiet: true }),
    ]);
    const payload = JSON.parse(result.stdout) as {
      ImageUri?: string;
      RecordedImageDigest?: string;
      LastUpdateStatus?: string;
      MemorySize?: number;
      State?: string;
    };
    const expectedDigest = expectedDigestResult.stdout.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new Error(`Could not resolve the expected scanner image digest in ${region}.`);
    }
    if (!payload.ImageUri?.endsWith(`@${expectedDigest}`)) {
      throw new Error(`${region} Lambda image ${payload.ImageUri ?? "unknown"} does not match ${expectedSha}`);
    }
    if (payload.RecordedImageDigest !== expectedDigest) throw new Error(`${region} Lambda retained image provenance does not match the deployed image.`);
    if (payload.MemorySize !== SCANNER_MEMORY_SIZE) {
      throw new Error(`${region} Lambda memory ${payload.MemorySize ?? "unknown"} does not match ${SCANNER_MEMORY_SIZE} MB`);
    }
    if (payload.LastUpdateStatus !== "Successful" || payload.State !== "Active") {
      throw new Error(`${region} Lambda is not healthy: ${JSON.stringify(payload)}`);
    }
    return { region, ...payload };
  }));

  for (const report of reports) {
    console.log(`${report.region}: ${report.State} / ${report.LastUpdateStatus} / ${report.ImageUri}`);
  }
}

async function ensureWorkflowRun(
  workflow: string,
  workflowRef: string,
  targetSha: string,
  extraArgs: string[] = [],
  forceDispatch = false,
  registrationGraceMs = 0,
  exactTitle?: string,
) {
  const runId = await resolveDeploymentWorkflowRun({
    targetSha, forceDispatch, registrationGraceMs, sleep,
    list: async () => {
      const result = await run([
        "gh", "run", "list", "--workflow", workflow, "--commit", targetSha,
        "--limit", "10", "--json", "databaseId,headSha,status,conclusion,event,displayTitle"
      ], { quiet: true });
      const runs = JSON.parse(result.stdout) as Array<DeploymentWorkflowRun & { displayTitle: string }>;
      if (exactTitle) return runs.filter(run => run.event === "workflow_dispatch" && run.displayTitle === exactTitle);
      const kind = workflow === WEB_WORKFLOW ? "public web" : workflow === VALIDATION_WORKFLOW ? "validation" : null;
      return kind ? runs.filter(run =>
        !(run.event === "workflow_dispatch" && run.displayTitle.startsWith(`Stage ${kind} `)) &&
        !(run.event === "push" && run.displayTitle.startsWith(`Verify ${kind} `))) : runs;
    },
    dispatch: async () => { await run(["gh", "workflow", "run", workflow, "--ref", workflowRef, ...extraArgs]); }
  });
  console.log(`Watching ${workflow} run ${runId} for ${targetSha.slice(0, 8)}`);
  return runId;
}

async function waitForRun(runId: string): Promise<RunJson> {
  while (true) {
    const result = await run([
      "gh", "run", "view", runId,
      "--json", "databaseId,name,status,conclusion,headSha,url"
    ], { quiet: true });
    const payload = JSON.parse(result.stdout) as RunJson;
    if (payload.status === "completed") {
      if (payload.conclusion !== "success") {
        throw new Error(`${payload.name} failed: ${payload.url}`);
      }
      return payload;
    }
    await sleep(5000);
  }
}

async function timedLane(label: string, task: () => Promise<Record<string, string> | void>): Promise<LaneResult> {
  const startedAt = Date.now();
  console.log("");
  console.log(`▶ ${label}`);
  try {
    const details = await task();
    const durationMs = Date.now() - startedAt;
    console.log(`✓ ${label} completed in ${formatDuration(durationMs)}`);
    const result: LaneResult = { durationMs, label, status: "succeeded" };
    if (details) {
      result.details = details;
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`✗ ${label} failed in ${formatDuration(durationMs)}`);
    console.error(error instanceof Error ? error.message : String(error));
    return { durationMs, label, status: "failed" };
  }
}

function skippedLane(label: string, reason: string): LaneResult {
  console.log(`↷ ${label} skipped: ${reason}`);
  return { details: { reason }, durationMs: 0, label, status: "skipped" };
}

async function requireCleanWorktree() {
  const result = await run(["git", "status", "--porcelain"], { quiet: true });
  if (result.stdout.trim().length > 0) {
    throw new Error("Refusing to deploy with uncommitted changes. Use an isolated committed checkout matching the requested ref.");
  }
}

function printTargets(changed: ChangedTargets) {
  console.log("Change targets:");
  console.log(`  web: ${changed.web}`);
  console.log(`  validation: ${changed.validation}`);
  console.log(`  db migrations: ${changed.db}`);
  console.log(`  scanners: ${changed.scanners}`);
  console.log(`  Lambda runtime base inputs changed: ${changed.lambdaRuntimeBase}`);
  console.log(`  validation runtime base inputs changed: ${changed.validationRuntimeBase}`);
}

function printPlan(args: Args, changed: ChangedTargets, sha: string) {
  const lanes: string[] = [];
  if (args.mode === "all" || args.mode === "web") {
    lanes.push(args.forceWeb || changed.web ? "web ECS deploy" : "web ECS deploy skipped (runtime unchanged; installed revision proof required)");
  }
  if (args.mode === "all" || args.mode === "validation") {
    const skip = !args.forceValidation && !changed.validation;
    lanes.push(skip
      ? "validation AWS deploy skipped (no validation deploy inputs changed)"
      : `validation AWS deploy (runtime base ${args.forceValidationRuntimeBase || changed.validationRuntimeBase ? "rebuild/push" : "reuse"})`);
  }
  if (args.mode === "all" || args.mode === "scanners") {
    const settingsPlan = args.preserveScannerOperationalSettings
      ? `verify existing ${SCANNER_MEMORY_SIZE} MB, flags and timeouts; update image provenance only`
      : `apply/verify ${SCANNER_MEMORY_SIZE} MB before image promotion`;
    lanes.push(`Lambda scanner deploys (${SCANNER_REGIONS.join(", ")}; ${settingsPlan}; runtime base ${args.pushScannerRuntimeBase ? "rebuild/push" : "reuse verified build-region base; stop if missing"})`);
  }
  if (args.mode === "all" || args.mode === "db") {
    lanes.push(args.mode === "all"
      ? "production DB migrations run from the target web image before ECS promotion"
      : "production DB migrations");
  }

  console.log("");
  console.log("Deploy plan:");
  console.log(`  ref: ${sha}`);
  console.log(`  preflight: ${args.noPredeploy ? "validate exact-source receipts" : args.mode === "all" ? "pnpm preflight:all" : "pnpm preflight:fast"}`);
  console.log(`  git push: ${args.noPush || args.ref ? "skip" : "push current branch to origin"}`);
  if (args.preserveScannerConfiguration && (args.mode === "all" || args.mode === "scanners")) {
    console.log("  blocked: scanner promotion requires configuration/provenance writes; this plan authorizes no remote action");
  }
  if (args.preserveScannerOperationalSettings && (args.mode === "all" || args.mode === "scanners")) {
    console.log("  scanner operational settings: preserve existing flags, memory and timeouts; image provenance environment writes remain required");
  }
  if (args.stagedRelease) {
    console.log(args.stagedRelease.action === "stage"
      ? "  staged path: verify and build web, scanner, and affected validation artifacts; no ECS, database or Lambda updates"
      : "  staged path: verify both immutable artifacts; promote web and affected validation before all six Lambda handoffs");
  } else if (args.mode === "all") {
    console.log("  order: prepare scanner artifacts alongside consumers; all Lambda writes wait for both affected consumers");
  }
  for (const lane of lanes) {
    console.log(`  - ${lane}`);
  }
  if (changed.lambdaRuntimeBase && !args.pushScannerRuntimeBase && (args.mode === "all" || args.mode === "scanners")) {
    console.log("  note: Lambda runtime-base inputs changed; routine deployment requires a verified build-region base and never rebuilds Chromium implicitly.");
    console.log("        Pass --push-runtime-base to rebuild and push the scanner runtime base explicitly.");
  }
}

function printSummary(results: LaneResult[], totalMs: number, shortSha: string) {
  console.log("");
  console.log(`Fast deploy summary for ${shortSha}`);
  console.log(`Total wall time: ${formatDuration(totalMs)}`);
  for (const result of results) {
    console.log(`- ${result.label}: ${result.status} (${formatDuration(result.durationMs)})`);
    if (result.details) {
      for (const [key, value] of Object.entries(result.details)) {
        console.log(`  ${key}: ${value}`);
      }
    }
  }
}

function addLines(target: Set<string>, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      target.add(trimmed);
    }
  }
}

async function git(args: string[]) {
  const result = await run(["git", ...args], { quiet: true });
  return result.stdout.trim();
}

async function resolveWorkflowDispatchRef(sourceRef: string, targetSha: string) {
  const normalizedRef = sourceRef.replace(/^refs\/heads\//, "").replace(/^origin\//, "");
  if (!/^[0-9a-f]{40}$/i.test(normalizedRef)) {
    return normalizedRef;
  }

  const remoteRefs = await git([
    "for-each-ref",
    "--format=%(refname:short)",
    "--points-at",
    targetSha,
    "refs/remotes/origin"
  ]);
  const remoteBranch = remoteRefs
    .split("\n")
    .map((ref) => ref.trim())
    .filter((ref) => ref && ref !== "origin/HEAD")
    .map((ref) => ref.replace(/^origin\//, ""))[0];
  if (!remoteBranch) {
    throw new Error(`Cannot dispatch a GitHub workflow for ${targetSha}: no pushed branch points at that commit.`);
  }
  return remoteBranch;
}

async function gitRefExists(ref: string) {
  const result = await run(["git", "cat-file", "-e", `${ref}^{commit}`], { quiet: true, reject: false });
  return result.exitCode === 0;
}

function run(command: string[], options: { env?: Record<string, string>; quiet?: boolean; reject?: boolean } = {}) {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Missing command");
  }
  if (!existsSync(process.cwd())) {
    throw new Error(`Working directory does not exist: ${process.cwd()}`);
  }

  return new Promise<{ exitCode: number; stdout: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(bin, args, {
      env: { ...process.env, ...options.env },
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const code = exitCode ?? 1;
      if (code !== 0 && options.reject !== false) {
        reject(new Error(`${command.join(" ")} failed with exit code ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolve({ exitCode: code, stdout });
    });
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(0)}s`;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
