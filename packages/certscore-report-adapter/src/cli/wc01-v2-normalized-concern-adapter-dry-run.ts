import {
  generateV2NormalizedConcernAdapterBatch,
  generateV2NormalizedConcernAdapterSingleFromFile,
} from "../wc01-v2-normalized-concern-adapter-output";

type V2NormalizedConcernAdapterArgs = {
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
    const summary = await generateV2NormalizedConcernAdapterBatch({
      inputDir: args.inputDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalInputFilesFound} concern policy simulation files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-normalized-concern-adapter-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-normalized-concern-adapter-summary.md`);
    return;
  }
  if (!args.inputPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateV2NormalizedConcernAdapterSingleFromFile({
    inputPath: args.inputPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): V2NormalizedConcernAdapterArgs {
  const args: V2NormalizedConcernAdapterArgs = {};
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
    "  pnpm v2:wc01-normalized-concern-adapter --input <Wc01V2ConcernPolicySimulationDryRun.json> --out <V2NormalizedConcernCandidateDraft.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-normalized-concern-adapter --input-dir <concern-policy-simulation-output-dir> --out-dir <normalized-concern-candidate-output-dir>",
    "",
    "Dry run only. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
