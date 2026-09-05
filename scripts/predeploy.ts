import { spawn } from "node:child_process";

type Check = {
  key: string;
  label: string;
  command: string[];
};

type Target = {
  key: string;
  label: string;
  matches: (file: string) => boolean;
  checks: Check[];
};

type Args = {
  allTargets: boolean;
  baseRef: string | null;
  mode: "fast" | "full";
};

const RUNTIME_GRAPH_RELEASE_CHECK: Check = {
  key: "runtime-graph-release",
  label: "runtime graph persistence, access, API and rollout contracts",
  command: [
    "pnpm", "exec", "tsx", "--tsconfig", "apps/web/tsconfig.json", "--test",
    "apps/web/server/scans/runtime-evidence-graph-access.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-dispatch.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-projection.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-read.test.ts",
    "apps/web/server/scans/runtime-evidence-graph-storage.test.ts",
    "apps/web/lib/api-v2/scan-resource.test.ts",
    "apps/web/server/pulse/retrieval-quota.test.ts",
    "scripts/runtime-graph-rollout.test.ts",
    "scripts/lib/scanner-image-provenance.test.ts",
    "apps/v2-dag-lambda/src/dev-scripts.test.ts",
    "apps/validation-worker/src/validation/local-v2-dag-lambda-dispatch.test.ts",
  ],
};

const RUNTIME_GRAPH_CAPTURE_CHECK: Check = {
  key: "runtime-graph-capture",
  label: "runtime graph browser, correlation, retention and deadline regressions",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-concurrency=1",
    "packages/certscore-contracts/src/runtime-evidence-graph.test.ts",
    "packages/certscore-scan-core/src/runtime-evidence-graph.test.ts",
    "packages/certscore-scan-core/src/runtime-evidence-graph-browser.test.ts",
    "packages/certscore-scan-core/src/canonical-bundle-retention.test.ts",
    "packages/certscore-scan-core/src/browser-recovery-cleanup.test.ts",
    "packages/certscore-scan-core/src/consent-geometry-proof-budget.test.ts",
    "packages/certscore-scan-core/src/gpc-response-assessment.test.ts",
    "packages/certscore-scan-core/src/transport-security-scanner.test.ts"],
};
const REPRESENTATIVE_PROOF_CHECK: Check = {
  key: "consent-representative-proof",
  label: "same-session representative viewport proof regression",
  command: ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "--test", "--test-name-pattern=^consent-proof lane (binds a completed generic negative|retains same-document Playwright proof)", "packages/certscore-scan-core/src/integration-fixtures.test.ts"],
};

const ROOT_FULL_CHECKS: Check[] = [
  RUNTIME_GRAPH_RELEASE_CHECK,
  RUNTIME_GRAPH_CAPTURE_CHECK,
  REPRESENTATIVE_PROOF_CHECK,
  {
    key: "deploy-topology",
    label: "deployment topology check",
    command: ["pnpm", "ops:check:deploy"]
  },
  {
    key: "workspace-typecheck",
    label: "workspace typecheck",
    command: ["pnpm", "turbo", "run", "typecheck"]
  },
  {
    key: "workspace-build",
    label: "workspace build",
    command: ["pnpm", "turbo", "run", "build"]
  },
  {
    key: "validation-scan-pipeline",
    label: "validation scan pipeline",
    command: ["pnpm", "test:scan-pipeline"]
  },
  {
    key: "lambda-typecheck",
    label: "v2 DAG Lambda typecheck",
    command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "typecheck"]
  },
  {
    key: "scan-core-typecheck",
    label: "v2 scan-core typecheck",
    command: ["pnpm", "--filter", "@certscore/scan-core", "typecheck"]
  },
  {
    key: "scan-core-consent-quality",
    label: "v2 late-consent quality fixtures",
    command: ["pnpm", "--filter", "@certscore/scan-core", "test:integration-fixtures:consent"]
  },
  {
    key: "scan-core-policy-full",
    label: "v2 policy scanner full suite",
    command: ["pnpm", "--filter", "@certscore/scan-core", "test:policy:full"]
  },
  {
    key: "lambda-tests",
    label: "v2 DAG Lambda tests",
    command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "test"]
  },
  {
    key: "canonical-projection-parity",
    label: "canonical projection parity",
    command: ["pnpm", "test:canonical-projection-parity"]
  },
  {
    key: "post-refusal-release",
    label: "post-refusal release contracts",
    command: ["pnpm", "test:post-refusal-release"]
  }
];

const TARGETS: Target[] = [
  {
    key: "runtime-graph-operations",
    label: "runtime graph rollout controls",
    matches: file => file === "scripts/runtime-graph-rollout.ts" || file === "scripts/runtime-graph-rollout.test.ts" || file.startsWith("scripts/lib/scanner-image-provenance") || file === "scripts/repair-scanner-image-provenance.ts" || file === "scripts/deploy-fast.ts" || file === "scripts/check-regional-scanner-parity.ts",
    checks: [RUNTIME_GRAPH_RELEASE_CHECK],
  },
  {
    key: "web",
    label: "public web",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file === ".dockerignore" ||
      file === ".github/workflows/web-aws-ecs-deploy.yml" ||
      file === "scripts/assert-forward-web-deploy.ts" ||
      file.startsWith("apps/web/") ||
      file.startsWith("packages/certscore-contracts/") ||
      file.startsWith("packages/certscore-vendor-resolver/") ||
      file.startsWith("packages/db/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("packages/ui/") ||
      file.startsWith("packages/validation-shared/"),
    checks: [
      RUNTIME_GRAPH_RELEASE_CHECK,
      {
        key: "web-typecheck",
        label: "public web typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/web", "typecheck"]
      },
      {
        key: "web-scan-source-contracts",
        label: "scan-source and forward-deploy contracts",
        command: [
          "node", "--import", "tsx", "--test",
          "apps/web/components/marketing/domain-scan-form.test.ts",
          "apps/web/components/scans/scan-from-select.test.tsx",
          "apps/web/server/scans/recent-scan-reuse.test.ts",
          "apps/web/server/scans/restricted-scan-options.test.ts",
          "scripts/assert-forward-web-deploy.test.ts"
        ]
      },
      {
        key: "canonical-projection-parity",
        label: "canonical projection parity",
        command: ["pnpm", "test:canonical-projection-parity"]
      },
      {
        key: "post-refusal-release",
        label: "post-refusal release contracts",
        command: ["pnpm", "test:post-refusal-release"]
      }
    ]
  },
  {
    key: "validation-worker",
    label: "validation worker",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file === ".dockerignore" ||
      file === ".github/workflows/validation-aws-deploy.yml" ||
      file.startsWith("apps/validation-worker/") ||
      file.startsWith("apps/web/lib/scans/") ||
      file.startsWith("apps/web/server/") ||
      file.startsWith("infra/aws/validation/") ||
      file.startsWith("packages/db/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("packages/validation-shared/") ||
      file.startsWith("packages/web-bot-auth/"),
    checks: [
      RUNTIME_GRAPH_RELEASE_CHECK,
      {
        key: "validation-worker-typecheck",
        label: "validation worker typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "typecheck"]
      },
      {
        key: "validation-scan-pipeline",
        label: "validation scan pipeline",
        command: ["pnpm", "test:scan-pipeline"]
      }
    ]
  },
  {
    key: "v2-dag-lambda",
    label: "v2 DAG Lambda",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file.startsWith("apps/v2-dag-lambda/") ||
      file.startsWith("infra/aws/v2-dag-lambda/") ||
      file.startsWith("packages/certscore-contracts/") ||
      file.startsWith("packages/certscore-scan-core/") ||
      file.startsWith("packages/certscore-vendor-resolver/") ||
      file.startsWith("packages/shared/") ||
      file.startsWith("scripts/local-v2-dag-lambda/") ||
      file === ".github/workflows/v2-regulatory-gold-corpus.yml",
    checks: [
      RUNTIME_GRAPH_CAPTURE_CHECK,
      REPRESENTATIVE_PROOF_CHECK,
      {
        key: "scan-core-typecheck",
        label: "v2 scan-core typecheck",
        command: ["pnpm", "--filter", "@certscore/scan-core", "typecheck"]
      },
      {
        key: "scan-core-consent-quality",
        label: "v2 late-consent quality fixtures",
        command: ["pnpm", "--filter", "@certscore/scan-core", "test:integration-fixtures:consent"]
      },
      {
        key: "scan-core-policy-full",
        label: "v2 policy scanner full suite",
        command: ["pnpm", "--filter", "@certscore/scan-core", "test:policy:full"]
      },
      {
        key: "lambda-typecheck",
        label: "v2 DAG Lambda typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "typecheck"]
      },
      {
        key: "lambda-tests",
        label: "v2 DAG Lambda tests",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/v2-dag-lambda", "test"]
      },
      {
        key: "post-refusal-release",
        label: "post-refusal release contracts",
        command: ["pnpm", "test:post-refusal-release"]
      }
    ]
  },
  {
    key: "db",
    label: "database package and migrations",
    matches: (file) =>
      isGlobalBuildInput(file) ||
      file.startsWith("packages/db/") ||
      file === "scripts/apply-db-migrations.ts" ||
      file === "scripts/apply-db-migrations.mjs" ||
      file === ".github/workflows/prod-db-migrate.yml",
    checks: [
      {
        key: "db-typecheck",
        label: "database package typecheck",
        command: ["pnpm", "--filter", "@website-signal-risk-scanner/db", "typecheck"]
      }
    ]
  }
];

function isGlobalBuildInput(file: string) {
  return [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "scripts/predeploy.ts",
    "tsconfig.base.json",
    "turbo.json"
  ].includes(file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === "full") {
    await runChecks(ROOT_FULL_CHECKS);
    return;
  }

  const changedFiles = await collectChangedFiles(args.baseRef);
  if (changedFiles.length === 0) {
    console.log("No changed files detected; fast predeploy has nothing to run.");
    return;
  }

  console.log("Fast predeploy changed files:");
  for (const file of changedFiles) {
    console.log(`  - ${file}`);
  }

  const selectedTargets = args.allTargets
    ? TARGETS
    : TARGETS.filter((target) => changedFiles.some(target.matches));
  if (selectedTargets.length === 0) {
    console.log("No deploy-targeted changes detected; fast predeploy has nothing to run.");
    return;
  }

  console.log("");
  console.log(`${args.allTargets ? "Fast deploy-all" : "Fast predeploy"} targets: ${selectedTargets.map((target) => target.label).join(", ")}`);

  const checks = dedupeChecks(selectedTargets.flatMap((target) => target.checks));
  await runChecks(checks);
}

function parseArgs(argv: string[]): Args {
  let baseRef: string | null = process.env.PREDEPLOY_BASE_REF ?? "origin/main";
  let mode: Args["mode"] = "fast";
  let allTargets = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--full") {
      mode = "full";
      continue;
    }
    if (arg === "--fast") {
      mode = "fast";
      continue;
    }
    if (arg === "--all") {
      allTargets = true;
      continue;
    }
    if (arg === "--base") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--base requires a git ref");
      }
      baseRef = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--base=")) {
      baseRef = arg.slice("--base=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { allTargets, baseRef, mode };
}

async function collectChangedFiles(baseRef: string | null) {
  const files = new Set<string>();

  if (baseRef && await gitRefExists(baseRef)) {
    const mergeBase = await git(["merge-base", baseRef, "HEAD"]);
    addLines(files, await git(["diff", "--name-only", `${mergeBase.trim()}..HEAD`]));
  }

  addLines(files, await git(["diff", "--name-only"]));
  addLines(files, await git(["diff", "--name-only", "--cached"]));
  addLines(files, await git(["ls-files", "--others", "--exclude-standard"]));

  return [...files].filter(Boolean).sort();
}

async function gitRefExists(ref: string) {
  const result = await run(["git", "cat-file", "-e", `${ref}^{commit}`], { quiet: true, reject: false });
  return result.exitCode === 0;
}

async function git(args: string[]) {
  const result = await run(["git", ...args], { quiet: true });
  return result.stdout;
}

function addLines(target: Set<string>, text: string) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) {
      target.add(trimmed);
    }
  }
}

function dedupeChecks(checks: Check[]) {
  const seen = new Set<string>();
  const deduped: Check[] = [];
  for (const check of checks) {
    if (seen.has(check.key)) {
      continue;
    }
    seen.add(check.key);
    deduped.push(check);
  }
  return deduped;
}

async function runChecks(checks: Check[]) {
  for (const check of checks) {
    console.log("");
    console.log(`> ${check.label}`);
    console.log(`$ ${check.command.join(" ")}`);
    await run(check.command, { quiet: false });
  }
}

function run(command: string[], options: { quiet?: boolean; reject?: boolean } = {}) {
  const [bin, ...args] = command;
  if (!bin) {
    throw new Error("Missing command");
  }

  return new Promise<{ exitCode: number; stdout: string }>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(bin, args, {
      stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit"
    });

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
    }

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

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
