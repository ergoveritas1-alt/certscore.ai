import {
  generateWc01V2AllowlistDryRunBatch,
  generateWc01V2AllowlistDryRunSingleFromFile,
} from "../wc01-v2-allowlist-output";

type Wc01AllowlistDryRunArgs = {
  help?: boolean;
  outDir?: string;
  outPath?: string;
  shadowDir?: string;
  shadowPath?: string;
  summaryPath?: string | false;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.shadowDir || args.outDir) {
    if (!args.shadowDir || !args.outDir || args.shadowPath || args.outPath) {
      throw new Error(usage());
    }
    const summary = await generateWc01V2AllowlistDryRunBatch({
      shadowDir: args.shadowDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalShadowFilesFound} shadow files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-allowlist-dry-run-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-allowlist-dry-run-summary.md`);
    return;
  }
  if (!args.shadowPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2AllowlistDryRunSingleFromFile({
    shadowPath: args.shadowPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01AllowlistDryRunArgs {
  const args: Wc01AllowlistDryRunArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--shadow") {
      args.shadowPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--shadow-dir") {
      args.shadowDir = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-allowlist-dry-run --shadow <Wc01V2ShadowProjection.json> --out <Wc01V2AllowlistDryRun.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-allowlist-dry-run --shadow-dir <wc01-shadow-output-dir> --out-dir <allowlist-dry-run-output-dir>",
    "",
    "Dry run only. Not production normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
