import {
  generateWc01V2ConcernInputBatch,
  generateWc01V2ConcernInputSingleFromFile,
} from "../wc01-v2-concern-policy-input-output";

type Wc01ConcernInputDryRunArgs = {
  allowlistDir?: string;
  allowlistPath?: string;
  help?: boolean;
  outDir?: string;
  outPath?: string;
  summaryPath?: string | false;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.allowlistDir || args.outDir) {
    if (!args.allowlistDir || !args.outDir || args.allowlistPath || args.outPath) {
      throw new Error(usage());
    }
    const summary = await generateWc01V2ConcernInputBatch({
      allowlistDir: args.allowlistDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalAllowlistFilesFound} allowlist dry-run files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-concern-input-dry-run-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-concern-input-dry-run-summary.md`);
    return;
  }
  if (!args.allowlistPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ConcernInputSingleFromFile({
    allowlistPath: args.allowlistPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01ConcernInputDryRunArgs {
  const args: Wc01ConcernInputDryRunArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allowlist") {
      args.allowlistPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--allowlist-dir") {
      args.allowlistDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out-dir") {
      args.outDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--summary") {
      args.summaryPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--no-summary") {
      args.summaryPath = false;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }
  return args;
}

function requiredValue(argv: string[], index: number, flag: string) {
  const value = argv[index];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function usage() {
  return [
    "Usage:",
    "  pnpm v2:wc01-concern-input-dry-run --allowlist <Wc01V2AllowlistDryRun.json> --out <Wc01V2ConcernPolicyInputDraft.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-concern-input-dry-run --allowlist-dir <allowlist-dry-run-output-dir> --out-dir <concern-input-dry-run-output-dir>",
    "",
    "Dry run only. Not production concern policy input. Not persisted normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
