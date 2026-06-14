#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ScanProfile } from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import { runScan } from "../index.js";

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url) {
    console.error("Usage: pnpm v2:demo --url <url> [--profile tiny] [--out ./artifacts/example]");
    process.exit(1);
  }

  const outDir = args.out ?? path.join(process.cwd(), "artifacts", "v2-demo");
  await mkdir(outDir, { recursive: true });

  const bundle = await runScan({
    url: args.url,
    profile: args.profile ?? "tiny",
    outDir,
  });
  const review = await reviewEvidenceBundle(bundle);
  const reviewPath = path.join(outDir, "ReviewResult.json");
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

  console.log(`Wrote ${path.join(outDir, "CanonicalEvidenceBundle.json")}`);
  console.log(`Wrote ${reviewPath}`);
}

function parseArgs(argv: string[]): {
  url?: string;
  profile?: ScanProfile["profileId"];
  out?: string;
} {
  const parsed: {
    url?: string;
    profile?: ScanProfile["profileId"];
    out?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--url" && value) {
      parsed.url = value;
      index += 1;
    } else if (key === "--profile" && isProfile(value)) {
      parsed.profile = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = value;
      index += 1;
    }
  }

  return parsed;
}

function isProfile(value: string | undefined): value is ScanProfile["profileId"] {
  return value === "tiny" || value === "quick" || value === "policy" || value === "standard" || value === "consent" || value === "consent_flow" || value === "full";
}
