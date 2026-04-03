import path from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { createComparisonReport, writeComparisonReport } from "./core/report";
import type { ComparisonReport, RuntimeRunResult } from "./core/types";

function parseArgs(argv: string[]) {
  const inputs: string[] = [];
  let outDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--input" && next) {
      inputs.push(next);
      index += 1;
      continue;
    }
    if (current === "--out-dir" && next) {
      outDir = next;
      index += 1;
    }
  }

  if (inputs.length === 0) {
    throw new Error("Usage: pnpm --filter @website-signal-risk-scanner/runtime-harness merge -- --input /path/one/comparison.json --input /path/two/comparison.json --out-dir /path/out");
  }

  return {
    inputs,
    outDir: outDir ? path.resolve(outDir) : path.resolve(process.cwd(), "tmp", "runtime-merged", new Date().toISOString().replace(/[:.]/g, "-"))
  };
}

async function readComparison(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as ComparisonReport;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const loaded = await Promise.all(args.inputs.map((item) => readComparison(path.resolve(item))));
  const targetUrl = loaded[0]?.targetUrl ?? "";
  const modes: RuntimeRunResult[] = loaded.flatMap((item) => item.modes);
  const report = createComparisonReport(targetUrl, modes);
  await mkdir(args.outDir, { recursive: true });
  const written = await writeComparisonReport(args.outDir, report);
  console.info(`Merged comparison json ${written.jsonPath}`);
  console.info(`Merged comparison markdown ${written.markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
