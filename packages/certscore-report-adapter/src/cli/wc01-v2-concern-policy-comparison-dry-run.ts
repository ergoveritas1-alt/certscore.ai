import {
  generateWc01V2ConcernPolicyComparisonBatch,
  generateWc01V2ConcernPolicyComparisonSingleFromFile,
} from "../wc01-v2-concern-policy-comparison-output";

type Wc01ConcernPolicyComparisonArgs = {
  help?: boolean;
  inputDir?: string;
  inputPath?: string;
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
  if (args.inputDir || args.outDir) {
    if (!args.inputDir || !args.outDir || args.inputPath || args.outPath) {
      throw new Error(usage());
    }
    const summary = await generateWc01V2ConcernPolicyComparisonBatch({
      inputDir: args.inputDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalInputFilesFound} normalized concern candidate draft files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-concern-policy-comparison-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-concern-policy-comparison-summary.md`);
    return;
  }
  if (!args.inputPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ConcernPolicyComparisonSingleFromFile({
    inputPath: args.inputPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01ConcernPolicyComparisonArgs {
  const args: Wc01ConcernPolicyComparisonArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.inputPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--input-dir") {
      args.inputDir = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-concern-policy-compare --input <V2NormalizedConcernCandidateDraft.json> --out <Wc01V2ConcernPolicyComparisonDryRun.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-concern-policy-compare --input-dir <normalized-concern-candidate-output-dir> --out-dir <concern-policy-comparison-output-dir>",
    "",
    "Dry run only. Mock policy-shape comparison. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
