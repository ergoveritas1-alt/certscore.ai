import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/tranco-calibration/session-30m");

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const outputDir = path.resolve(getArgValue("--out-dir") ?? DEFAULT_OUTPUT_DIR);
  const heartbeat = readJson<Record<string, unknown> | null>(path.join(outputDir, "heartbeat.json"), null);
  const aggregate = readJson<Record<string, unknown> | null>(path.join(outputDir, "aggregate-summary.json"), null);
  const state = readJson<Record<string, unknown> | null>(path.join(outputDir, "session-state.json"), null);

  console.log(
    JSON.stringify(
      {
        aggregate,
        heartbeat,
        outputDir,
        state
      },
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
