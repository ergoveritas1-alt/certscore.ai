import {
  generateWc01V2ShadowBatch,
  generateWc01V2ShadowSingleFromFile,
} from "../wc01-shadow-output";

type Wc01ShadowArgs = {
  outDir?: string;
  projectionPath?: string;
  projectionDir?: string;
  outPath?: string;
  summaryPath?: string | false;
  help?: boolean;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.projectionDir || args.outDir) {
    if (!args.projectionDir || !args.outDir || args.projectionPath || args.outPath) {
      throw new Error(usage());
    }
    const summary = await generateWc01V2ShadowBatch({
      projectionDir: args.projectionDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalProjectionFilesFound} projection files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-shadow-batch-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-shadow-batch-summary.md`);
    return;
  }
  if (!args.projectionPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ShadowSingleFromFile({
    projectionPath: args.projectionPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);

  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01ShadowArgs {
  const args: Wc01ShadowArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--projection") {
      args.projectionPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--projection-dir") {
      args.projectionDir = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-shadow --projection <V2ReportProjectionDraft.json> --out <Wc01V2ShadowProjection.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-shadow --projection-dir <v2-shadow-projection-dir> --out-dir <wc01-shadow-output-dir>",
    "",
    "Internal shadow diagnostic only. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
