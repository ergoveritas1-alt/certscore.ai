import { generateWc01V2ProductionReadinessGateDraftSingleFromFile } from "../wc01-v2-production-readiness-gate-draft-output";

type Wc01V2ProductionReadinessGateDraftArgs = {
  help?: boolean;
  inputPath?: string;
  outPath?: string;
  summaryPath?: string | false;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.inputPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ProductionReadinessGateDraftSingleFromFile({
    inputPath: args.inputPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01V2ProductionReadinessGateDraftArgs {
  const args: Wc01V2ProductionReadinessGateDraftArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.inputPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-production-readiness-gate --input <Wc01V2ProductionReadinessGateInput.json> --out <Wc01V2ProductionReadinessGateDraft.json> [--summary <summary.md> | --no-summary]",
    "",
    "Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
