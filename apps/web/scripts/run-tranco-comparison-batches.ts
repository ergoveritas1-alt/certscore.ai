import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ComparisonBucket =
  | "aligned"
  | "same_site_alias"
  | "off_origin_landing"
  | "browser_error_surface"
  | "thin_or_blocked_scan"
  | "true_detection_gap";

type ComparisonRow = {
  domain: string;
  mismatchBucket: ComparisonBucket;
  notes?: string[];
};

type BatchComparisonPayload = {
  aggregate: Record<ComparisonBucket, number>;
  comparedAt: string;
  comparisons: ComparisonRow[];
  domains: string[];
  environments: {
    localBaseUrl: string;
    prodBaseUrl: string;
  };
  outputPath?: string;
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration");

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function readDomainsFromFile(filePath: string) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function summarizeAggregate(rows: ComparisonRow[]) {
  return rows.reduce<Record<ComparisonBucket, number>>(
    (acc, row) => {
      acc[row.mismatchBucket] += 1;
      return acc;
    },
    {
      aligned: 0,
      browser_error_surface: 0,
      off_origin_landing: 0,
      same_site_alias: 0,
      thin_or_blocked_scan: 0,
      true_detection_gap: 0
    }
  );
}

function runBatch(input: {
  batchIndex: number;
  domains: string[];
  localUrl: string | null;
  orgId: string | null;
  outputPath: string;
  prodUrl: string | null;
  reuseLocal: boolean;
  timeoutMs: string | null;
}) {
  const compareScriptPath = path.resolve(process.cwd(), "scripts/compare-prod-local-tranco-calibration.ts");
  const args = [
    "--env-file=.env.local",
    "--enable-source-maps",
    "--import",
    "tsx",
    compareScriptPath,
    "--domains",
    input.domains.join(" "),
    "--out",
    input.outputPath
  ];

  if (input.orgId) {
    args.push("--org", input.orgId);
  }

  if (input.localUrl) {
    args.push("--local-url", input.localUrl);
  }

  if (input.prodUrl) {
    args.push("--prod-url", input.prodUrl);
  }

  if (input.timeoutMs) {
    args.push("--timeout-ms", input.timeoutMs);
  }

  if (input.reuseLocal) {
    args.push("--reuse-local");
  }

  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        `Batch ${input.batchIndex} compare failed with status ${result.status ?? 1}.`
    );
  }

  return JSON.parse(result.stdout) as BatchComparisonPayload;
}

async function main() {
  const domainsFile = getArgValue("--domains-file");
  if (!domainsFile) {
    throw new Error("Provide --domains-file with one domain per line.");
  }

  const batchSize = Number(getArgValue("--batch-size") ?? DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error(`Invalid --batch-size: ${batchSize}`);
  }

  const domains = readDomainsFromFile(path.resolve(domainsFile));
  if (domains.length === 0) {
    throw new Error("No domains were loaded from --domains-file.");
  }

  const localUrl = getArgValue("--local-url");
  const prodUrl = getArgValue("--prod-url");
  const orgId = getArgValue("--org");
  const timeoutMs = getArgValue("--timeout-ms");
  const reuseLocal = hasFlag("--reuse-local");
  const outputDir =
    path.resolve(getArgValue("--out-dir") ?? path.join(DEFAULT_OUTPUT_DIR, `comparison-batches-${new Date().toISOString().replaceAll(":", "-")}`));

  fs.mkdirSync(outputDir, { recursive: true });

  const batches = chunk(domains, batchSize);
  const batchResults: Array<{
    batch: number;
    domains: string[];
    outputPath: string;
    payload: BatchComparisonPayload;
  }> = [];

  for (const [index, batchDomains] of batches.entries()) {
    const batchNumber = index + 1;
    const batchOutputPath = path.join(outputDir, `batch-${String(batchNumber).padStart(2, "0")}.json`);
    const payload = runBatch({
      batchIndex: batchNumber,
      domains: batchDomains,
      localUrl,
      orgId,
      outputPath: batchOutputPath,
      prodUrl,
      reuseLocal,
      timeoutMs
    });

    batchResults.push({
      batch: batchNumber,
      domains: batchDomains,
      outputPath: batchOutputPath,
      payload
    });
  }

  const allComparisons = batchResults.flatMap((entry) => entry.payload.comparisons);
  const aggregate = summarizeAggregate(allComparisons);
  const mismatchRows = allComparisons.filter((row) => row.mismatchBucket !== "aligned");

  const summary = {
    aggregate,
    batchSize,
    batches: batchResults.map((entry) => ({
      aggregate: entry.payload.aggregate,
      batch: entry.batch,
      comparedAt: entry.payload.comparedAt,
      domains: entry.domains,
      outputPath: entry.outputPath
    })),
    comparedAt: new Date().toISOString(),
    domains,
    mismatchExamples: mismatchRows.slice(0, 25),
    outputDir
  };

  writeJsonFile(path.join(outputDir, "aggregate.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
