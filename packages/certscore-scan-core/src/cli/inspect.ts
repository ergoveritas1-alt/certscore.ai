#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import { formatInspectionReportText, inspectBundle } from "../inspector.js";

type OutputFormat = "text" | "json";

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.bundlePaths.length === 0) {
    console.error("Usage: pnpm v2:inspect --bundle ./artifacts/example/CanonicalEvidenceBundle.json [--bundle ...] [--format text|json]");
    process.exit(1);
  }

  const reports = [];
  for (const bundlePath of args.bundlePaths) {
    const bundleJson = await readFile(path.resolve(bundlePath), "utf8");
    const bundle = canonicalEvidenceBundleSchema.parse(JSON.parse(bundleJson));
    reports.push(await inspectBundle(bundle));
  }

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify({ reports }, null, 2)}\n`);
    return;
  }

  process.stdout.write(reports.map(formatInspectionReportText).join("\n"));
}

function parseArgs(argv: string[]): {
  bundlePaths: string[];
  format: OutputFormat;
} {
  const parsed: {
    bundlePaths: string[];
    format: OutputFormat;
  } = {
    bundlePaths: [],
    format: "text",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--bundle" && value) {
      parsed.bundlePaths.push(value);
      index += 1;
    } else if (key === "--format" && isOutputFormat(value)) {
      parsed.format = value;
      index += 1;
    }
  }

  return parsed;
}

function isOutputFormat(value: string | undefined): value is OutputFormat {
  return value === "text" || value === "json";
}
