import { generateWc01V2ProjectionShapeComparisonSingleFromFile } from "../wc01-v2-projection-shape-comparison-output";

type Wc01V2ProjectionShapeComparisonArgs = {
  help?: boolean;
  concernPolicyShapePath?: string;
  outPath?: string;
  summaryPath?: string | false;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.concernPolicyShapePath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ProjectionShapeComparisonSingleFromFile({
    concernPolicyShapePath: args.concernPolicyShapePath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01V2ProjectionShapeComparisonArgs {
  const args: Wc01V2ProjectionShapeComparisonArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--concern-policy-shape") {
      args.concernPolicyShapePath = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-projection-shape-compare --concern-policy-shape <Wc01V2ConcernPolicyShapeComparison.json> --out <Wc01V2ProjectionShapeComparison.json> [--summary <summary.md> | --no-summary]",
    "",
    "Fixture-only unified-finding/checklist projection shape comparison. Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
