#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "../apps/web/node_modules/react";
import { renderToStaticMarkup } from "../apps/web/node_modules/react-dom/server";
import { CaliforniaPrivacyCoverageChecklistCard } from "../apps/web/components/scans/california-privacy-coverage-checklist-card";
import { GdprEprivacyCoverageChecklistCard } from "../apps/web/components/scans/gdpr-eprivacy-coverage-checklist-card";
import { RegulatoryChecklistAdvancedEvidenceProvider } from "../apps/web/components/scans/regulatory-checklist-advanced-evidence-context";
import { loadV2ScanLabArtifacts } from "../apps/web/server/admin/v2-scan-lab-artifacts";
import type { CaliforniaPrivacyCoverageChecklistItem } from "../apps/web/lib/scans/california-privacy-coverage-checklist";
import type { GdprEprivacyCoverageChecklistItem } from "../apps/web/lib/scans/gdpr-eprivacy-coverage-checklist";

type Args = {
  chainKey: string | null;
  help: boolean;
  outDir: string;
  profile: string;
  timeoutMs: number;
  url: string;
};

type SmokeSummary = {
  checks: Array<{
    actual?: unknown;
    expected?: unknown;
    name: string;
    passed: boolean;
  }>;
  generatedAt: string;
  input: {
    chainKey: string | null;
    outDir: string;
    profile: string;
    timeoutMs: number;
    url: string;
  };
  model?: {
    benchmarkStatus: string;
    candidateSignals: number;
    ccpaRows: number;
    gdprRows: number;
    renderedHtmlBytes: number;
    selectedChain: string;
    timingStatus: string;
    totalDurationMs: number | null;
  };
  status: "failed" | "passed";
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const startedAt = Date.now();
  const result = await withTimeout(
    loadV2ScanLabArtifacts({
      chainKey: args.chainKey,
      profile: args.profile,
      url: args.url,
    }),
    args.timeoutMs,
  );
  const elapsedMs = Date.now() - startedAt;
  const checks = [
    check("artifact_model_ready", result.status === "ready", "ready", result.status),
    check("artifact_model_timeout_budget", elapsedMs <= args.timeoutMs, `<=${args.timeoutMs}`, elapsedMs),
  ];

  const renderedHtml = result.status === "ready" ? renderScanLabHeavyComponents(result.model.regulatoryReviewChecklist) : "";
  const model = result.status === "ready" ? {
    benchmarkStatus: result.model.benchmarkSummary.status,
    candidateSignals: result.model.candidateSignals.length,
    ccpaRows: result.model.regulatoryReviewChecklist.californiaPrivacyItems.length,
    gdprRows: result.model.regulatoryReviewChecklist.gdprEprivacyItems.length,
    renderedHtmlBytes: Buffer.byteLength(renderedHtml, "utf8"),
    selectedChain: result.model.selectedChain.chainKey,
    timingStatus: result.model.timing.status,
    totalDurationMs: result.model.timing.totalDurationMs,
  } : undefined;

  if (model) {
    checks.push(
      check("regulatory_rows_available", model.gdprRows + model.ccpaRows > 0, ">0", model.gdprRows + model.ccpaRows),
      check("benchmark_model_available", model.benchmarkStatus === "observed" || model.benchmarkStatus === "unavailable", "observed|unavailable", model.benchmarkStatus),
      check("heavy_components_rendered", model.renderedHtmlBytes > 0, ">0", model.renderedHtmlBytes),
      check("result_trace_rendered", renderedHtml.includes("Why this result?"), "contains result trace", renderedHtml.includes("Why this result?")),
    );
  }

  const summary: SmokeSummary = {
    checks,
    generatedAt: new Date().toISOString(),
    input: {
      chainKey: args.chainKey,
      outDir: args.outDir,
      profile: args.profile,
      timeoutMs: args.timeoutMs,
      url: args.url,
    },
    model,
    status: checks.every((item) => item.passed) ? "passed" : "failed",
  };

  await mkdir(args.outDir, { recursive: true });
  await writeFile(path.join(args.outDir, "V2ScanLabArtifactRenderSmoke.json"), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(path.join(args.outDir, "V2ScanLabArtifactRenderSmoke.md"), renderMarkdown(summary));
  console.log(JSON.stringify({
    elapsedMs,
    model,
    outDir: args.outDir,
    status: summary.status,
  }, null, 2));

  if (summary.status !== "passed") {
    process.exit(1);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`v2 scan-lab artifact model probe timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function renderScanLabHeavyComponents(checklist: {
  californiaPrivacyItems: unknown[];
  gdprEprivacyItems: unknown[];
}) {
  return renderToStaticMarkup(
    createElement(RegulatoryChecklistAdvancedEvidenceProvider, { value: { expandAllAdvancedEvidence: false } },
      createElement(GdprEprivacyCoverageChecklistCard, {
        defaultOpen: true,
        items: checklist.gdprEprivacyItems as GdprEprivacyCoverageChecklistItem[],
        showDebugConfidenceImprovements: false,
        showSummaryStrip: false,
      }),
      createElement(CaliforniaPrivacyCoverageChecklistCard, {
        defaultOpen: true,
        items: checklist.californiaPrivacyItems as CaliforniaPrivacyCoverageChecklistItem[],
        showDebugConfidenceImprovements: false,
        showSummaryStrip: false,
      }),
    ),
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    chainKey: null,
    help: false,
    outDir: path.join("artifacts", "v2-scan-lab-artifact-render-smoke"),
    profile: "full",
    timeoutMs: Number(process.env.V2_SCAN_LAB_PROBE_TIMEOUT_MS ?? 20_000),
    url: "webmd.com",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--") {
      continue;
    } else if (arg === "--chain" && next) {
      args.chainKey = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      args.outDir = next;
      index += 1;
    } else if (arg === "--profile" && next) {
      args.profile = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      args.timeoutMs = parsePositiveInteger(next, "--timeout-ms");
      index += 1;
    } else if (arg === "--url" && next) {
      args.url = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  return args;
}

function parsePositiveInteger(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function check(name: string, passed: boolean, expected?: unknown, actual?: unknown) {
  return { actual, expected, name, passed };
}

function renderMarkdown(summary: SmokeSummary): string {
  return [
    "# V2 Scan Lab Artifact Render Smoke",
    "",
    "Internal diagnostic only. Does not change production behavior.",
    "",
    `- Status: ${summary.status}`,
    `- URL: ${summary.input.url}`,
    `- Profile: ${summary.input.profile}`,
    `- Chain: ${summary.input.chainKey ?? "latest"}`,
    `- Selected chain: ${summary.model?.selectedChain ?? "n/a"}`,
    `- GDPR rows: ${summary.model?.gdprRows ?? "n/a"}`,
    `- CCPA rows: ${summary.model?.ccpaRows ?? "n/a"}`,
    `- Candidate signals: ${summary.model?.candidateSignals ?? "n/a"}`,
    "",
    "## Checks",
    "",
    ...summary.checks.map((item) =>
      `- ${item.passed ? "PASS" : "FAIL"} ${item.name}: actual=${formatValue(item.actual)} expected=${formatValue(item.expected)}`
    ),
    "",
  ].join("\n");
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return "n/a";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function usage(): string {
  return [
    "Usage: node --env-file=apps/web/.env.local --import tsx ./scripts/smoke-v2-scan-lab-artifact-render.ts [options]",
    "",
    "Loads the internal v2 scan-lab artifact model with a hard timeout.",
    "",
    "Options:",
    "  --chain <key>       Optional chain key. Defaults to latest matching chain.",
    "  --out-dir <dir>     Default: artifacts/v2-scan-lab-artifact-render-smoke",
    "  --profile <profile> Default: full",
    "  --timeout-ms <ms>   Default: V2_SCAN_LAB_PROBE_TIMEOUT_MS or 20000",
    "  --url <url>         Default: webmd.com",
    "  --help",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
