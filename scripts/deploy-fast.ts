import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type DeployMode = "all" | "db" | "scanners" | "validation" | "web";
type LaneStatus = "failed" | "skipped" | "succeeded";

type Args = {
  baseRef: string;
  dryRun: boolean;
  mode: DeployMode;
  noPredeploy: boolean;
  noPush: boolean;
  plan: boolean;
  pushScannerRuntimeBase: boolean;
  ref: string | null;
  forceDb: boolean;
  forceValidation: boolean;
  forceValidationRuntimeBase: boolean;
  forceWeb: boolean;
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
const WEB_WORKFLOW = "web-aws-ecs-deploy.yml";
const VALIDATION_WORKFLOW = "validation-aws-deploy.yml";
const DB_WORKFLOW = "prod-db-migrate.yml";

async function main() {
  const startedAt = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const sourceRef = args.ref ?? await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const sha = await git(["rev-parse", sourceRef]);
  const workflowRef = await resolveWorkflowDispatchRef(sourceRef, sha);
  const shortSha = sha.slice(0, 8);
  const changed = await classifyChanges(args.baseRef);

  console.log(`Fast deploy mode: ${args.mode}`);
  console.log(`Deploy SHA: ${sha}`);
  console.log(`Base ref: ${args.baseRef}`);
  console.log(`Changed files: ${changed.changedFiles.length}`);
  printTargets(changed);
  printPlan(args, changed, sha);

  if (args.plan || args.dryRun) {
    console.log("");
    console.log(args.dryRun ? "Dry run complete; no deploy actions were started." : "Plan complete; no deploy actions were started.");
    return;
  }

  if (!args.ref) {
    await requireCleanWorktree();
  }

  if (!args.noPredeploy && ["all", "web", "validation", "scanners", "db"].includes(args.mode)) {
    await timedLane("preflight", async () => {
      const predeployArgs = args.mode === "all" ? ["preflight:all"] : ["preflight:fast"];
      await run(["pnpm", ...predeployArgs]);
    });
  }

  if (!args.noPush && !args.ref) {
    await timedLane("git push", async () => {
      const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
      if (branch === "HEAD") {
        throw new Error("Refusing to deploy detached HEAD without --ref.");
      }
      await run(["git", "push", "origin", `${branch}:${branch}`]);
    });
  }

  const lanes: Array<Promise<LaneResult>> = [];
  if (args.mode === "all") {
    lanes.push(deployWeb({ ref: sha, workflowRef, force: true }));
    lanes.push(deployScanners({ ref: sha, pushRuntimeBase: args.pushScannerRuntimeBase }));
    lanes.push(deployValidation({
      ref: sha,
      workflowRef,
      skip: !args.forceValidation && !changed.validation,
      pushRuntimeBase: args.forceValidationRuntimeBase || changed.validationRuntimeBase
    }));
    lanes.push(Promise.resolve(skippedLane(
      "production DB migrations",
      "the web workflow applies migrations from the target image before ECS promotion"
    )));
  } else if (args.mode === "web") {
    lanes.push(deployWeb({ ref: sha, workflowRef, force: args.forceWeb || true }));
  } else if (args.mode === "validation") {
    lanes.push(deployValidation({
      ref: sha,
      workflowRef,
      skip: false,
      pushRuntimeBase: args.forceValidationRuntimeBase || changed.validationRuntimeBase
    }));
  } else if (args.mode === "db") {
    lanes.push(deployDb({ ref: sha, workflowRef, skip: false }));
  } else {
    lanes.push(deployScanners({ ref: sha, pushRuntimeBase: args.pushScannerRuntimeBase }));
  }

  const results = await Promise.all(lanes);

  if (args.mode === "all" || args.mode === "web") {
    results.push(await timedLane("verify live web", async () => {
      await run(["pnpm", "ops:check:live"], {
        env: { EXPECTED_LIVE_GIT_SHA: sha }
      });
      await run(["pnpm", "ops:check:deploy"], {
        env: {
          EXPECTED_LIVE_GIT_SHA: sha,
          SKIP_LIVE_DEPLOY_CHECK: "0"
        }
      });
    }));
  }

  if (args.mode === "all" || args.mode === "scanners") {
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
    noPush: false,
    plan: false,
    pushScannerRuntimeBase: false,
    ref: null
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--") {
      continue;
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

  return args;
}

function isDeployMode(value: string): value is DeployMode {
  return ["all", "db", "scanners", "validation", "web"].includes(value);
}

function requireValue(args: string[], index: number, label: string) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${label} requires a value`);
  }
  return value;
}

async function classifyChanges(baseRef: string): Promise<ChangedTargets> {
  const files = new Set<string>();
  if (await gitRefExists(baseRef)) {
    const mergeBase = await git(["merge-base", baseRef, "HEAD"]);
    addLines(files, await git(["diff", "--name-only", `${mergeBase.trim()}..HEAD`]));
  }
  addLines(files, await git(["diff", "--name-only"]));
  addLines(files, await git(["diff", "--name-only", "--cached"]));
  addLines(files, await git(["ls-files", "--others", "--exclude-standard"]));

  const changedFiles = [...files].sort();
  return {
    changedFiles,
    db: changedFiles.some(isDbDeployInput),
    lambdaRuntimeBase: changedFiles.some(isLambdaRuntimeBaseInput),
    scanners: changedFiles.some(isScannerDeployInput),
    validation: changedFiles.some(isValidationDeployInput),
    validationRuntimeBase: changedFiles.some(isValidationRuntimeBaseInput),
    web: changedFiles.some(isWebDeployInput)
  };
}

function isGlobalBuildInput(file: string) {
  return [
    ".dockerignore",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "turbo.json"
  ].includes(file);
}

function isWebDeployInput(file: string) {
  return isGlobalBuildInput(file) ||
    file === ".github/workflows/web-aws-ecs-deploy.yml" ||
    file === "scripts/assert-forward-web-deploy.ts" ||
    file.startsWith("apps/web/") ||
    file.startsWith("packages/certscore-contracts/") ||
    file.startsWith("packages/certscore-vendor-resolver/") ||
    file.startsWith("packages/db/") ||
    file.startsWith("packages/shared/") ||
    file.startsWith("packages/ui/") ||
    file.startsWith("packages/validation-shared/") ||
    file === "scripts/apply-db-migrations.mjs" ||
    file === "scripts/insert-integration-api-key.mjs";
}

function isValidationDeployInput(file: string) {
  return isGlobalBuildInput(file) ||
    file === ".github/workflows/validation-aws-deploy.yml" ||
    file.startsWith("apps/validation-worker/") ||
    file.startsWith("apps/web/lib/scans/") ||
    file.startsWith("apps/web/server/scans/") ||
    file.startsWith("infra/aws/validation/") ||
    file.startsWith("packages/db/") ||
    file.startsWith("packages/shared/") ||
    file.startsWith("packages/validation-shared/") ||
    file.startsWith("packages/web-bot-auth/");
}

function isDbDeployInput(file: string) {
  return file.startsWith("packages/db/migrations/") ||
    file === "scripts/apply-db-migrations.mjs" ||
    file === ".github/workflows/prod-db-migrate.yml";
}

function isScannerDeployInput(file: string) {
  return isGlobalBuildInput(file) ||
    file.startsWith("apps/v2-dag-lambda/") ||
    file.startsWith("infra/aws/v2-dag-lambda/") ||
    file.startsWith("packages/certscore-contracts/") ||
    file.startsWith("packages/certscore-report-adapter/") ||
    file.startsWith("packages/certscore-review-engine/") ||
    file.startsWith("packages/certscore-scan-core/") ||
    file.startsWith("packages/certscore-vendor-resolver/") ||
    file.startsWith("packages/db/") ||
    file.startsWith("packages/shared/") ||
    file.startsWith("packages/validation-shared/") ||
    file.startsWith("packages/web-bot-auth/") ||
    file.startsWith("scripts/local-v2-dag-lambda/");
}

function isLambdaRuntimeBaseInput(file: string) {
  return file === "apps/v2-dag-lambda/Dockerfile" ||
    file === "apps/v2-dag-lambda/package.json" ||
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file === "pnpm-workspace.yaml";
}

function isValidationRuntimeBaseInput(file: string) {
  return file === "apps/validation-worker/Dockerfile" ||
    file === "apps/validation-worker/package.json" ||
    file === ".npmrc" ||
    file === "package.json" ||
    file === "pnpm-lock.yaml" ||
    file === "pnpm-workspace.yaml";
}

async function deployWeb(input: { force: boolean; ref: string; workflowRef: string }): Promise<LaneResult> {
  return timedLane("web ECS deploy", async () => {
    await run([
      "node", "--import", "tsx",
      "scripts/assert-forward-web-deploy.ts",
      "--target", input.ref
    ]);
    const runId = await ensureWorkflowRun(WEB_WORKFLOW, input.workflowRef, input.ref);
    const workflowRun = await waitForRun(runId);
    return { workflow: WEB_WORKFLOW, url: workflowRun.url };
  });
}

async function deployValidation(input: { pushRuntimeBase: boolean; ref: string; skip: boolean; workflowRef: string }): Promise<LaneResult> {
  if (input.skip) {
    return skippedLane("validation deploy", "no validation deploy inputs changed");
  }
  return timedLane("validation AWS deploy", async () => {
    const runId = await ensureWorkflowRun(VALIDATION_WORKFLOW, input.workflowRef, input.ref, [
      "-f", "use_runtime_base=true",
      "-f", `push_runtime_base=${input.pushRuntimeBase ? "true" : "false"}`,
      "-f", "runtime_base_tag=validation-worker-runtime-base"
    ], input.pushRuntimeBase);
    const workflowRun = await waitForRun(runId);
    return {
      runtimeBase: input.pushRuntimeBase ? "rebuilt" : "reused",
      workflow: VALIDATION_WORKFLOW,
      url: workflowRun.url
    };
  });
}

async function deployDb(input: { ref: string; skip: boolean; workflowRef: string }): Promise<LaneResult> {
  if (input.skip) {
    return skippedLane("production DB migrations", "no migration inputs changed");
  }
  return timedLane("production DB migrations", async () => {
    const runId = await ensureWorkflowRun(DB_WORKFLOW, input.workflowRef, input.ref, [], true);
    const workflowRun = await waitForRun(runId);
    return { workflow: DB_WORKFLOW, url: workflowRun.url };
  });
}

async function deployScanners(input: { pushRuntimeBase: boolean; ref: string }): Promise<LaneResult> {
  return timedLane("Lambda scanner deploys", async () => {
    await applyScannerMemoryConfiguration();

    const runtimeBaseAvailability = await Promise.all(SCANNER_REGIONS.map(async (region) => {
      const result = await run([
        "aws", "ecr", "describe-images",
        "--region", region,
        "--repository-name", "certscore-v2-dag-local-lambda",
        "--image-ids", "imageTag=runtime-base"
      ], { quiet: true, reject: false });
      return { available: result.exitCode === 0, region };
    }));
    const useRuntimeBase = input.pushRuntimeBase || runtimeBaseAvailability.every((result) => result.available);
    if (!useRuntimeBase) {
      const missingRegions = runtimeBaseAvailability
        .filter((result) => !result.available)
        .map((result) => result.region)
        .join(", ");
      console.log(`Runtime base is unavailable in ${missingRegions}; using the cached full-image build path without publishing a runtime base.`);
    }

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
      await Promise.all(SCANNER_REGIONS.map((region) => run([
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
          CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE: useRuntimeBase ? "true" : "false",
          CERTSCORE_V2_DAG_LAMBDA_SKIP_BUILD_CACHE_PUSH: "true",
          DOCKER_CONFIG: dockerConfigByRegion[SCANNER_BUILD_REGION]
        }
      });

      const results = await Promise.all(SCANNER_REGIONS.map(async (region) => {
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
        await run([
          "aws", "lambda", "update-function-code",
          "--region", region,
          "--function-name", SCANNER_FUNCTION_NAME,
          "--image-uri", digestImageUri
        ], { quiet: true });
        await run([
          "aws", "lambda", "wait", "function-updated-v2",
          "--region", region,
          "--function-name", SCANNER_FUNCTION_NAME
        ], { quiet: true });
        return {
          durationMs: Date.now() - regionStart,
          imageUri: digestImageUri,
          region,
          runtimeBase: input.pushRuntimeBase ? "rebuilt" : useRuntimeBase ? "reused" : "not-used"
        };
      }));

      const details: Record<string, string> = {
        runtimeBase: input.pushRuntimeBase ? "rebuilt" : useRuntimeBase ? "reused" : "not-used"
      };
      for (const result of results) {
        details[result.region] = `${formatDuration(result.durationMs)} ${result.imageUri}`;
      }
      await run([
        "node",
        "--import",
        "tsx",
        "scripts/check-regional-scanner-parity.ts",
      ]);
      details.regionParity = "passed";
      return details;
    } finally {
      await rm(dockerConfigRoot, { force: true, recursive: true });
    }
  });
}

async function applyScannerMemoryConfiguration() {
  console.log(`Applying ${SCANNER_MEMORY_SIZE} MB scanner memory configuration before image promotion.`);
  const results = await Promise.all(SCANNER_REGIONS.map(async (region) => {
    const current = await run([
      "aws", "lambda", "get-function-configuration",
      "--region", region,
      "--function-name", SCANNER_FUNCTION_NAME,
      "--query", "MemorySize",
      "--output", "text"
    ], { quiet: true });
    const currentMemorySize = Number.parseInt(current.stdout.trim(), 10);
    if (currentMemorySize !== SCANNER_MEMORY_SIZE) {
      await run([
        "aws", "lambda", "update-function-configuration",
        "--region", region,
        "--function-name", SCANNER_FUNCTION_NAME,
        "--memory-size", String(SCANNER_MEMORY_SIZE)
      ], { quiet: true });
      await run([
        "aws", "lambda", "wait", "function-updated-v2",
        "--region", region,
        "--function-name", SCANNER_FUNCTION_NAME
      ], { quiet: true });
    }
    const verified = await run([
      "aws", "lambda", "get-function-configuration",
      "--region", region,
      "--function-name", SCANNER_FUNCTION_NAME,
      "--query", "{MemorySize:MemorySize,LastUpdateStatus:LastUpdateStatus,State:State}",
      "--output", "json"
    ], { quiet: true });
    const payload = JSON.parse(verified.stdout) as {
      LastUpdateStatus?: string;
      MemorySize?: number;
      State?: string;
    };
    if (
      payload.MemorySize !== SCANNER_MEMORY_SIZE ||
      payload.LastUpdateStatus !== "Successful" ||
      payload.State !== "Active"
    ) {
      throw new Error(`${region} scanner memory configuration did not converge: ${verified.stdout.trim()}`);
    }
    return { changed: currentMemorySize !== SCANNER_MEMORY_SIZE, region };
  }));
  for (const result of results) {
    console.log(`${result.region}: ${SCANNER_MEMORY_SIZE} MB (${result.changed ? "updated" : "already configured"})`);
  }
}

async function verifyScanners(expectedSha: string) {
  const reports = await Promise.all(SCANNER_REGIONS.map(async (region) => {
    await run([
      "aws", "lambda", "wait", "function-updated-v2",
      "--region", region,
      "--function-name", SCANNER_FUNCTION_NAME
    ], { quiet: true });
    const result = await run([
      "aws", "lambda", "get-function",
      "--region", region,
      "--function-name", SCANNER_FUNCTION_NAME,
      "--query", "{ImageUri:Code.ImageUri,LastUpdateStatus:Configuration.LastUpdateStatus,State:Configuration.State,Updated:Configuration.LastModified,MemorySize:Configuration.MemorySize}",
      "--output", "json"
    ], { quiet: true });
    const payload = JSON.parse(result.stdout) as {
      ImageUri?: string;
      LastUpdateStatus?: string;
      MemorySize?: number;
      State?: string;
    };
    const expectedDigestResult = await run([
      "aws", "ecr", "describe-images",
      "--region", region,
      "--repository-name", "certscore-v2-dag-local-lambda",
      "--image-ids", `imageTag=${expectedSha}`,
      "--query", "imageDetails[0].imageDigest",
      "--output", "text"
    ], { quiet: true });
    const expectedDigest = expectedDigestResult.stdout.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest)) {
      throw new Error(`Could not resolve the expected scanner image digest in ${region}.`);
    }
    if (!payload.ImageUri?.endsWith(`@${expectedDigest}`)) {
      throw new Error(`${region} Lambda image ${payload.ImageUri ?? "unknown"} does not match ${expectedSha}`);
    }
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
  forceDispatch = false
) {
  if (!forceDispatch) {
    const existing = await latestWorkflowRunId(workflow, targetSha);
    if (existing) {
      console.log(`Using existing ${workflow} run ${existing} for ${targetSha.slice(0, 8)}`);
      return existing;
    }
  }

  const before = await latestWorkflowRunId(workflow, targetSha);
  await run(["gh", "workflow", "run", workflow, "--ref", workflowRef, ...extraArgs]);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const latest = await latestWorkflowRunId(workflow, targetSha);
    if (latest && latest !== before) {
      return latest;
    }
  }
  throw new Error(`Timed out waiting for ${workflow} run to appear for ${targetSha}`);
}

async function latestWorkflowRunId(workflow: string, ref: string) {
  const result = await run([
    "gh", "run", "list",
    "--workflow", workflow,
    "--commit", ref,
    "--limit", "1",
    "--json", "databaseId"
  ], { quiet: true, reject: false });
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return null;
  }
  const runs = JSON.parse(result.stdout) as Array<{ databaseId?: number }>;
  return runs[0]?.databaseId ? String(runs[0].databaseId) : null;
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
    throw new Error("Refusing to deploy with uncommitted changes. Commit/stash first, or pass --ref to deploy an already-pushed SHA.");
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
    lanes.push("web ECS deploy");
  }
  if (args.mode === "all" || args.mode === "scanners") {
    lanes.push(`Lambda scanner deploys (${SCANNER_REGIONS.join(", ")}; apply/verify ${SCANNER_MEMORY_SIZE} MB before image promotion; runtime base ${args.pushScannerRuntimeBase ? "rebuild/push" : "reuse when available, cached full-image fallback otherwise"})`);
  }
  if (args.mode === "all" || args.mode === "validation") {
    const skip = args.mode === "all" && !args.forceValidation && !changed.validation;
    lanes.push(skip
      ? "validation AWS deploy skipped (no validation deploy inputs changed)"
      : `validation AWS deploy (runtime base ${args.forceValidationRuntimeBase || changed.validationRuntimeBase ? "rebuild/push" : "reuse"})`);
  }
  if (args.mode === "all" || args.mode === "db") {
    lanes.push(args.mode === "all"
      ? "production DB migrations run from the target web image before ECS promotion"
      : "production DB migrations");
  }

  console.log("");
  console.log("Deploy plan:");
  console.log(`  ref: ${sha}`);
  console.log(`  preflight: ${args.noPredeploy ? "skip" : args.mode === "all" ? "pnpm preflight:all" : "pnpm preflight:fast"}`);
  console.log(`  git push: ${args.noPush || args.ref ? "skip" : "push current branch to origin"}`);
  for (const lane of lanes) {
    console.log(`  - ${lane}`);
  }
  if (changed.lambdaRuntimeBase && !args.pushScannerRuntimeBase && (args.mode === "all" || args.mode === "scanners")) {
    console.log("  note: Lambda runtime-base inputs changed, but scanner deploys will reuse an existing base when available or use the cached full-image path.");
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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
