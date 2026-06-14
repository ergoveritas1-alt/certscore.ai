import { generateWc01V2ConcernPolicyShapeComparisonSingleFromFile } from "../wc01-v2-concern-policy-shape-comparison-output";

type Wc01V2ConcernPolicyShapeComparisonArgs = {
  help?: boolean;
  schemaComparisonPath?: string;
  outPath?: string;
  summaryPath?: string | false;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.schemaComparisonPath || !args.outPath) {
    throw new Error(usage());
  }

  const result = await generateWc01V2ConcernPolicyShapeComparisonSingleFromFile({
    schemaComparisonPath: args.schemaComparisonPath,
    outPath: args.outPath,
    summaryPath: args.summaryPath,
  });
  console.log(`Wrote ${args.outPath}`);
  if (result.summaryPath) {
    console.log(`Wrote ${result.summaryPath}`);
  }
}

function parseArgs(argv: string[]): Wc01V2ConcernPolicyShapeComparisonArgs {
  const args: Wc01V2ConcernPolicyShapeComparisonArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--schema-comparison") {
      args.schemaComparisonPath = requiredValue(argv, ++index, arg);
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
    "  pnpm v2:wc01-concern-policy-shape-compare --schema-comparison <Wc01V2NormalizedConcernSchemaComparison.json> --out <Wc01V2ConcernPolicyShapeComparison.json> [--summary <summary.md> | --no-summary]",
    "",
    "Fixture-only concern-policy shape comparison. Artifact-only. Non-persistent. Not implementation approval. Not customer-facing report output.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
