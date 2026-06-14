#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema, endpointEnrichmentOverlaySchema } from "@certscore/contracts";
import { reviewEvidenceBundle } from "../index.js";

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.bundle || !args.out) {
    console.error("Usage: pnpm v2:review --bundle <CanonicalEvidenceBundle.json> --out <ReviewResult.json> [--endpoint-enrichment-overlay <EndpointEnrichmentOverlay.json>]");
    process.exit(1);
  }

  const raw = await readFile(args.bundle, "utf8");
  const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(raw));
  const endpointEnrichmentOverlay = args.endpointEnrichmentOverlay
    ? endpointEnrichmentOverlaySchema.parse(JSON.parse(await readFile(args.endpointEnrichmentOverlay, "utf8")))
    : undefined;
  const review = await reviewEvidenceBundle(bundle, { endpointEnrichmentOverlay });

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(review, null, 2)}\n`);
  console.log(`Wrote ${args.out}`);
}

function parseArgs(argv: string[]): { bundle?: string; endpointEnrichmentOverlay?: string; out?: string } {
  const parsed: { bundle?: string; endpointEnrichmentOverlay?: string; out?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--bundle" && value) {
      parsed.bundle = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = value;
      index += 1;
    } else if (key === "--endpoint-enrichment-overlay" && value) {
      parsed.endpointEnrichmentOverlay = value;
      index += 1;
    }
  }
  return parsed;
}
