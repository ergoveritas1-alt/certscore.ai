#!/usr/bin/env node
import path from "node:path";
import type { ScanProfile } from "@certscore/contracts";
import { readCalibrationUrls, runCalibration } from "../calibration.js";

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.urlsPath && args.urls.length === 0) {
    console.error("Usage: pnpm v2:calibrate --profile tiny --urls ./docs/certscore-v2/calibration-urls.txt --out ./artifacts/v2-calibration");
    process.exit(1);
  }

  try {
    const fileUrls = args.urlsPath ? await readCalibrationUrls(args.urlsPath) : [];
    const outDir = args.out ?? path.join(process.cwd(), "artifacts", "v2-calibration");
    const summary = await runCalibration({
      profile: args.profile ?? "tiny",
      urls: [...fileUrls, ...args.urls],
      outDir,
    });
    console.log(`Wrote ${path.join(outDir, "calibration-summary.json")}`);
    console.log(`Wrote ${path.join(outDir, "calibration-summary.md")}`);
    console.log(`Completed ${summary.successCount}/${summary.urlCount}; failed ${summary.failureCount}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function parseArgs(argv: string[]): {
  profile?: ScanProfile["profileId"];
  urlsPath?: string;
  urls: string[];
  out?: string;
} {
  const parsed: {
    profile?: ScanProfile["profileId"];
    urlsPath?: string;
    urls: string[];
    out?: string;
  } = {
    urls: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--profile" && isProfile(value)) {
      parsed.profile = value;
      index += 1;
    } else if (key === "--urls" && value) {
      parsed.urlsPath = value;
      index += 1;
    } else if (key === "--url" && value) {
      parsed.urls.push(value);
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
