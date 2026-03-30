import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_QUEUE_PATH = path.resolve(process.cwd(), "tmp/tranco-calibration/calibration_queue.csv");

type QueueRow = {
  batch_hint: string;
  domain: string;
  evaluation_status: string;
};

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

function parseCsv(input: string) {
  const lines = input.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  const [headerLine, ...dataLines] = lines;
  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(",");

  return dataLines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",");
      return headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = values[index] ?? "";
        return acc;
      }, {});
    });
}

async function main() {
  const queuePath = path.resolve(getArgValue("--queue") ?? DEFAULT_QUEUE_PATH);
  const batch = getArgValue("--batch");
  const limit = Number(getArgValue("--limit") ?? "0");
  const summarizeOnly = hasFlag("--summarize-only");
  const queueOnly = hasFlag("--queue-only");

  if (!batch) {
    throw new Error("Provide --batch <number>.");
  }

  const raw = fs.readFileSync(queuePath, "utf8");
  const rows = parseCsv(raw) as QueueRow[];
  const selected = rows
    .filter((row) => row.batch_hint === batch && row.evaluation_status === "queued_for_scan")
    .slice(0, limit > 0 ? limit : undefined);

  if (selected.length === 0) {
    throw new Error(`No queued domains found for batch ${batch}.`);
  }

  const domains = selected.map((row) => row.domain);
  const scanScriptPath = path.resolve(process.cwd(), "scripts/scan-batch-eval.ts");
  const args = [
    "--env-file=.env.local",
    "--enable-source-maps",
    "--import",
    "tsx",
    scanScriptPath,
    "--domains",
    domains.join(" ")
  ];

  if (summarizeOnly) {
    args.push("--summarize-only");
  } else if (queueOnly) {
    args.push("--queue-only");
  }

  const result = spawnSync("node", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
