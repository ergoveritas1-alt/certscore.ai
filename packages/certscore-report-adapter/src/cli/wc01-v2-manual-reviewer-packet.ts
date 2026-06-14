import {
  generateWc01V2ManualReviewerPacketBatch,
  generateWc01V2ManualReviewerPacketSingleFromFile,
} from "../wc01-v2-manual-reviewer-packet-output";

type Wc01ManualReviewerPacketArgs = {
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
    const summary = await generateWc01V2ManualReviewerPacketBatch({
      inputDir: args.inputDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalInputFilesFound} concern policy comparison files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-reviewer-packet-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-reviewer-packet-summary.md`);
    return;
  }
  if (!args.inputPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ManualReviewerPacketSingleFromFile({
    inputPath: args.inputPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01ManualReviewerPacketArgs {
  const args: Wc01ManualReviewerPacketArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--comparison") {
      args.inputPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--comparison-dir") {
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
    "  pnpm v2:wc01-reviewer-packet --comparison <Wc01V2ConcernPolicyComparisonDryRun.json> --out <Wc01V2ManualReviewerPacket.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-reviewer-packet --comparison-dir <concern-policy-comparison-output-dir> --out-dir <manual-reviewer-packet-output-dir>",
    "",
    "Internal artifact-only reviewer packets. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
