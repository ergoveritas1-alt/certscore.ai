import {
  generateWc01V2EvidencePreviewBatch,
  generateWc01V2EvidencePreviewSingleFromFile,
} from "../wc01-v2-evidence-preview-output";

type Args = {
  artifactRoots: string[];
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
  if (args.artifactRoots.length === 0) {
    throw new Error(`At least one --artifact-root is required.\n\n${usage()}`);
  }
  if (args.inputDir || args.outDir) {
    if (!args.inputDir || !args.outDir || args.inputPath || args.outPath) {
      throw new Error(usage());
    }
    const summary = await generateWc01V2EvidencePreviewBatch({
      artifactRoots: args.artifactRoots,
      inputDir: args.inputDir,
      outDir: args.outDir,
    });
    console.log(`Found ${summary.totalInputFilesFound} reviewer packet files.`);
    console.log(`Succeeded ${summary.succeededCount}; failed ${summary.failedCount}.`);
    console.log(`Wrote ${args.outDir}/wc01-v2-evidence-preview-summary.json`);
    console.log(`Wrote ${args.outDir}/wc01-v2-evidence-preview-summary.md`);
    return;
  }

  if (!args.inputPath || !args.outPath) {
    throw new Error(usage());
  }
  const result = await generateWc01V2EvidencePreviewSingleFromFile({
    artifactRoots: args.artifactRoots,
    reviewerPacketPath: args.inputPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = { artifactRoots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--reviewer-packet") {
      args.inputPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--reviewer-packet-dir") {
      args.inputDir = requiredValue(argv, ++index, arg);
    } else if (arg === "--artifact-root") {
      args.artifactRoots.push(requiredValue(argv, ++index, arg));
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
    "  pnpm v2:wc01-evidence-preview --reviewer-packet <Wc01V2ManualReviewerPacket.json> --artifact-root <dir> [--artifact-root <dir> ...] --out <Wc01V2EvidencePreviewPacket.json> [--summary <summary.md> | --no-summary]",
    "  pnpm v2:wc01-evidence-preview --reviewer-packet-dir <manual-reviewer-packet-dir> --artifact-root <dir> [--artifact-root <dir> ...] --out-dir <evidence-preview-output-dir>",
    "",
    "Internal artifact-only evidence preview. Not production concern policy. Not persisted normalized concerns. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
