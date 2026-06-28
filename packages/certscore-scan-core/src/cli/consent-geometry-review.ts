#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runConsentGeometryNanoVisualReview } from "../consent-geometry-visual-review.js";

type ParsedArgs = {
  artifacts?: string;
  envFile?: string;
  model?: string;
  sites: string[];
  force?: boolean;
};

void main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  },
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.envFile) {
    await loadEnvFile(args.envFile);
  }
  if (!args.artifacts) {
    console.error("Usage: pnpm --filter @certscore/scan-core consent-geometry-review --artifacts artifacts/consent-control-geometry/<cohort> [--env-file apps/web/.env.local] [--force] [--site example.com]");
    process.exit(1);
  }

  const artifactsRoot = path.resolve(args.artifacts);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = args.model?.trim() ||
    process.env.CERTSCORE_CONSENT_GEOMETRY_REVIEW_MODEL?.trim() ||
    process.env.CERTSCORE_V2_NANO_VISUAL_REVIEW_MODEL?.trim() ||
    process.env.VALIDATION_NANO_MODEL?.trim() ||
    undefined;

  const summary = await runConsentGeometryNanoVisualReview({
    artifactsRoot,
    apiKey,
    model,
    siteFilter: args.sites.length ? args.sites : undefined,
    force: args.force,
  });

  console.log(`Wrote ${path.join(artifactsRoot, "nano-visual-review-summary.json")}`);
  console.log("| Site | Review | Nano A/R/O | Agreement A/R/O | Labels | Notes |");
  console.log("|---|---|---:|---:|---|---|");
  for (const row of summary.rows) {
    console.log([
      `| ${row.site}`,
      row.reviewStatus,
      `${yn(row.visualFirstLayerAccept)}/${yn(row.visualFirstLayerReject)}/${yn(row.visualFirstLayerOptions)}`,
      `${row.scannerAgreement.accept}/${row.scannerAgreement.reject}/${row.scannerAgreement.options}`,
      row.visibleLabels.join(", ").replace(/\|/g, "/") || "-",
      [...row.notes, ...row.limitations].join("; ").replace(/\|/g, "/") || "-",
      "|",
    ].join(" | "));
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { sites: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--artifacts" && value) {
      parsed.artifacts = value;
      index += 1;
    } else if (key === "--env-file" && value) {
      parsed.envFile = value;
      index += 1;
    } else if (key === "--model" && value) {
      parsed.model = value;
      index += 1;
    } else if (key === "--site" && value) {
      parsed.sites.push(value);
      index += 1;
    } else if (key === "--force") {
      parsed.force = true;
    }
  }
  return parsed;
}

async function loadEnvFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (!key || process.env[key]) {
      continue;
    }
    process.env[key] = rawValue?.replace(/^['"]|['"]$/g, "") ?? "";
  }
}

function yn(value: boolean | "uncertain"): "yes" | "no" | "uncertain" {
  if (value === "uncertain") {
    return "uncertain";
  }
  return value ? "yes" : "no";
}
