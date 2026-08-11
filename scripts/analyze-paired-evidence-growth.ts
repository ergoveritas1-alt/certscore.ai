import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  analyzePairedEvidenceGrowth,
  type PairedEvidenceGrowthInput,
} from "./lib/paired-evidence-growth.js";

type Args = { input: string; output: string | null };

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = JSON.parse(await readFile(path.resolve(args.input), "utf8")) as PairedEvidenceGrowthInput;
  const report = analyzePairedEvidenceGrowth(input);
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) {
    await writeFile(path.resolve(args.output), output, "utf8");
  }
  process.stdout.write(output);
}

function parseArgs(argv: string[]): Args {
  let input = "";
  let output: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input") input = argv[++index] ?? "";
    else if (value === "--output") output = argv[++index] ?? null;
    else if (value === "--help") {
      process.stdout.write([
        "Usage: pnpm v2:paired-evidence-growth --input <cohorts.json> [--output <report.json>]",
        "",
        "Input shape: { baseline: PairedEvidenceRow[], current: PairedEvidenceRow[] }.",
        "The report separates retained/projection completeness from rank-adjusted signal prevalence.",
        "",
      ].join("\n"));
      process.exit(0);
    }
  }
  if (!input) throw new Error("--input is required");
  return { input, output };
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
