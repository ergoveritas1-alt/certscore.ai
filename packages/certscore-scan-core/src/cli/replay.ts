#!/usr/bin/env node
import {
  formatConsentFlowReplayValidationMarkdown,
  formatReplayEvidenceReportMarkdown,
  replayConsentFlowEvidenceCorpus,
  validateConsentFlowReplayCorpus,
  type ConsentFlowReplayMode,
} from "../consent-flow-replay-runner.js";

type OutputFormat = "text" | "json";

void main();

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.corpusDir && args.manifestPaths.length === 0) {
    console.error("Usage: pnpm v2:replay --corpus ./artifacts/replay-corpus [--mode validate|evidence] [--manifest ./replay_baseline_pre_consent.manifest.json] [--out ./artifacts/replay-validation] [--format text|json]");
    process.exit(1);
  }

  if (args.mode === "evidence") {
    const result = await replayConsentFlowEvidenceCorpus({
      corpusDir: args.corpusDir,
      manifestPaths: args.manifestPaths,
      outDir: args.outDir,
      timeoutMs: args.timeoutMs,
    });
    if (args.format === "json") {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatReplayEvidenceReportMarkdown(result));
    return;
  }

  const result = await validateConsentFlowReplayCorpus({
    corpusDir: args.corpusDir,
    manifestPaths: args.manifestPaths,
    outDir: args.outDir,
    timeoutMs: args.timeoutMs,
  });

  if (args.format === "json") {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatConsentFlowReplayValidationMarkdown(result));
}

function parseArgs(argv: string[]): {
  corpusDir?: string;
  format: OutputFormat;
  manifestPaths: string[];
  mode: ConsentFlowReplayMode;
  outDir?: string;
  timeoutMs?: number;
} {
  const parsed: {
    corpusDir?: string;
    format: OutputFormat;
    manifestPaths: string[];
    mode: ConsentFlowReplayMode;
    outDir?: string;
    timeoutMs?: number;
  } = {
    format: "text",
    manifestPaths: [],
    mode: "validate",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--corpus" && value) {
      parsed.corpusDir = value;
      index += 1;
    } else if (key === "--mode" && isMode(value)) {
      parsed.mode = value;
      index += 1;
    } else if (key === "--manifest" && value) {
      parsed.manifestPaths.push(value);
      index += 1;
    } else if (key === "--out" && value) {
      parsed.outDir = value;
      index += 1;
    } else if (key === "--format" && isOutputFormat(value)) {
      parsed.format = value;
      index += 1;
    } else if (key === "--timeout-ms" && value) {
      const timeoutMs = Number(value);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        parsed.timeoutMs = timeoutMs;
      }
      index += 1;
    }
  }

  return parsed;
}

function isOutputFormat(value: string | undefined): value is OutputFormat {
  return value === "text" || value === "json";
}

function isMode(value: string | undefined): value is ConsentFlowReplayMode {
  return value === "validate" || value === "evidence";
}
