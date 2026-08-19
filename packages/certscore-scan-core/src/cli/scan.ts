#!/usr/bin/env node
import path from "node:path";
import type { WriteStream } from "node:tty";
import type { ScanProfile } from "@certscore/contracts";
import { runScan } from "../index.js";
import { assertPublicTestContactAllowed } from "../public-test-contact-holds.js";

void main().then(
  async () => {
    await flushOutput(process.stdout);
    await flushOutput(process.stderr);
    process.exit(0);
  },
  async (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    await flushOutput(process.stderr);
    process.exit(1);
  },
);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url) {
    console.error("Usage: pnpm v2:scan --url <url> [--profile tiny] [--out ./artifacts/example] [--capture-replay] [--capture-replay-trace] [--capture-replay-aux-probes all|none|form|accessibility] [--privacy-control-url <url>...] [--scenario-planning-mode legacy_sequential|planned_parallel] [--policy-output-grace-ms 1000] [--pre-consent-screenshot-timeout-ms 15000] [--scenario-resource-mode normal|lean] [--consent-flow-screenshot-mode auto|none] [--consent-gate-audit-holdout]");
    process.exit(1);
  }

  const outDir = args.out ?? path.join(process.cwd(), "artifacts", "v2-scan");
  assertPublicTestContactAllowed(args.url, "v2 diagnostic scan");
  const bundle = await runScan({
    url: args.url,
    profile: args.profile ?? "tiny",
    outDir,
    captureReplay: args.captureReplay,
    captureReplayAuxiliaryProbes: args.captureReplayAuxiliaryProbes,
    captureReplayTrace: args.captureReplayTrace,
    privacyControlUrls: args.privacyControlUrls,
    scenarioPlanningMode: args.scenarioPlanningMode,
    scenarioConcurrency: args.scenarioConcurrency,
    policyPlanningDeadlineMs: args.policyPlanningDeadlineMs,
    policyOutputGraceMs: args.policyOutputGraceMs,
    preConsentScreenshotTimeoutMs: args.preConsentScreenshotTimeoutMs,
    consentFlowDeadlineMs: args.consentFlowDeadlineMs,
    scenarioResourceMode: args.scenarioResourceMode,
    consentFlowScreenshotMode: args.consentFlowScreenshotMode,
    consentGateAuditHoldout: args.consentGateAuditHoldout,
  });

  console.log(`Wrote ${path.join(outDir, "CanonicalEvidenceBundle.json")}`);
  console.log(`Scan ID: ${bundle.scanId}`);
}

function flushOutput(stream: NodeJS.WriteStream | WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write("", () => resolve());
  });
}

function parseArgs(argv: string[]): {
  url?: string;
  profile?: ScanProfile["profileId"];
  out?: string;
  captureReplay?: boolean;
  captureReplayAuxiliaryProbes?: "all" | "none" | "form" | "accessibility";
  captureReplayTrace?: boolean;
  privacyControlUrls: string[];
  scenarioPlanningMode?: "legacy_sequential" | "planned_parallel";
  scenarioConcurrency?: number;
  policyPlanningDeadlineMs?: number;
  policyOutputGraceMs?: number;
  preConsentScreenshotTimeoutMs?: number;
  consentFlowDeadlineMs?: number;
  scenarioResourceMode?: "normal" | "lean";
  consentFlowScreenshotMode?: "auto" | "none";
  consentGateAuditHoldout?: boolean;
} {
  const parsed: {
    url?: string;
    profile?: ScanProfile["profileId"];
    out?: string;
    captureReplay?: boolean;
    captureReplayAuxiliaryProbes?: "all" | "none" | "form" | "accessibility";
    captureReplayTrace?: boolean;
    privacyControlUrls: string[];
    scenarioPlanningMode?: "legacy_sequential" | "planned_parallel";
    scenarioConcurrency?: number;
    policyPlanningDeadlineMs?: number;
    policyOutputGraceMs?: number;
    preConsentScreenshotTimeoutMs?: number;
    consentFlowDeadlineMs?: number;
    scenarioResourceMode?: "normal" | "lean";
    consentFlowScreenshotMode?: "auto" | "none";
    consentGateAuditHoldout?: boolean;
  } = { privacyControlUrls: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--url" && value) {
      parsed.url = value;
      index += 1;
    } else if (key === "--profile" && isProfile(value)) {
      parsed.profile = value;
      index += 1;
    } else if (key === "--out" && value) {
      parsed.out = value;
      index += 1;
    } else if (key === "--capture-replay") {
      parsed.captureReplay = true;
    } else if (key === "--capture-replay-aux-probes" && isCaptureReplayAuxiliaryProbeMode(value)) {
      parsed.captureReplayAuxiliaryProbes = value;
      index += 1;
    } else if (key === "--capture-replay-trace") {
      parsed.captureReplay = true;
      parsed.captureReplayTrace = true;
    } else if (key === "--privacy-control-url" && value) {
      parsed.privacyControlUrls.push(value);
      index += 1;
    } else if (key === "--scenario-planning-mode" && isScenarioPlanningMode(value)) {
      parsed.scenarioPlanningMode = value;
      index += 1;
    } else if (key === "--scenario-concurrency" && value) {
      parsed.scenarioConcurrency = numberArg(value);
      index += 1;
    } else if (key === "--policy-planning-deadline-ms" && value) {
      parsed.policyPlanningDeadlineMs = numberArg(value);
      index += 1;
    } else if (key === "--policy-output-grace-ms" && value) {
      parsed.policyOutputGraceMs = numberArg(value);
      index += 1;
    } else if (key === "--pre-consent-screenshot-timeout-ms" && value) {
      parsed.preConsentScreenshotTimeoutMs = numberArg(value);
      index += 1;
    } else if (key === "--consent-flow-deadline-ms" && value) {
      parsed.consentFlowDeadlineMs = numberArg(value);
      index += 1;
    } else if (key === "--scenario-resource-mode" && isScenarioResourceMode(value)) {
      parsed.scenarioResourceMode = value;
      index += 1;
    } else if (key === "--consent-flow-screenshot-mode" && isConsentFlowScreenshotMode(value)) {
      parsed.consentFlowScreenshotMode = value;
      index += 1;
    } else if (key === "--consent-gate-audit-holdout") {
      parsed.consentGateAuditHoldout = true;
    }
  }

  return parsed;
}

function isProfile(value: string | undefined): value is ScanProfile["profileId"] {
  return value === "tiny" || value === "quick" || value === "policy" || value === "standard" || value === "consent" || value === "consent_flow" || value === "full";
}

function isScenarioPlanningMode(value: string | undefined): value is "legacy_sequential" | "planned_parallel" {
  return value === "legacy_sequential" || value === "planned_parallel";
}

function numberArg(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function isScenarioResourceMode(value: string | undefined): value is "normal" | "lean" {
  return value === "normal" || value === "lean";
}

function isConsentFlowScreenshotMode(value: string | undefined): value is "auto" | "none" {
  return value === "auto" || value === "none";
}

function isCaptureReplayAuxiliaryProbeMode(value: string | undefined): value is "all" | "none" | "form" | "accessibility" {
  return value === "all" || value === "none" || value === "form" || value === "accessibility";
}
