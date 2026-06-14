import { readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import {
  canonicalEvidenceBundleSchema,
  reviewResultSchema,
  type CanonicalEvidenceBundle,
  type ReviewResult,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import { projectReviewResultToV2ReportDraft } from "../index";

type ProjectArgs = {
  bundlePath?: string;
  reviewPath?: string;
  outPath?: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.bundlePath && !args.reviewPath) {
    throw new Error("Usage: pnpm v2:project --bundle <CanonicalEvidenceBundle.json> [--review <ReviewResult.json>] --out <V2ReportProjectionDraft.json>");
  }
  if (!args.outPath) {
    throw new Error("Missing required --out path.");
  }

  const bundle = args.bundlePath ? await readBundle(args.bundlePath) : undefined;
  const review = args.reviewPath
    ? await readReview(args.reviewPath)
    : await reviewEvidenceBundle(requiredBundle(bundle));
  const projection = projectReviewResultToV2ReportDraft({ review, bundle });

  await mkdir(dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
  console.log(`Wrote ${args.outPath}`);
}

function parseArgs(argv: string[]): ProjectArgs {
  const args: ProjectArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bundle") {
      args.bundlePath = requiredValue(argv, ++index, arg);
    } else if (arg === "--review") {
      args.reviewPath = requiredValue(argv, ++index, arg);
    } else if (arg === "--out") {
      args.outPath = requiredValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
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

async function readBundle(path: string): Promise<CanonicalEvidenceBundle> {
  return canonicalEvidenceBundleSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readReview(path: string): Promise<ReviewResult> {
  return reviewResultSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

function requiredBundle(bundle?: CanonicalEvidenceBundle) {
  if (!bundle) {
    throw new Error("--bundle is required when --review is not provided.");
  }
  return bundle;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
