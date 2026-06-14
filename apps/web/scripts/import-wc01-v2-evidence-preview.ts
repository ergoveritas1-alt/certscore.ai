import { importWc01V2EvidencePreviewArtifacts } from "../server/admin/v2-evidence-preview-import";

type ImportArgs = {
  help?: boolean;
  path?: string;
  cohort?: string;
  createdBy?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.path) {
    throw new Error(usage());
  }

  const result = await importWc01V2EvidencePreviewArtifacts({
    path: args.path,
    cohort: args.cohort,
    createdBy: args.createdBy ?? "internal_import",
  });

  console.log(`Persisted ${result.persistedRuns} evidence preview runs and ${result.persistedItems} queue items.`);
}

function parseArgs(argv: string[]): ImportArgs {
  const args: ImportArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--path") {
      args.path = requiredValue(argv, ++index, arg);
    } else if (arg === "--cohort") {
      args.cohort = requiredValue(argv, ++index, arg);
    } else if (arg === "--created-by") {
      args.createdBy = requiredValue(argv, ++index, arg);
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
    "  pnpm --filter @website-signal-risk-scanner/web import:wc01-v2-evidence-preview --path <file-or-dir> [--cohort <label>] [--created-by <id>]",
    "",
    "Persists WC01 v2 evidence preview artifacts into internal reviewer tables only.",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
