#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WriteStream } from "node:tty";
import {
  type CanonicalEvidenceBundle,
  type ConsentFlowTraceArtifact,
  type ConsentScenarioExecutionArtifact,
  type ScanProfile,
  canonicalEvidenceBundleSchema,
  consentFlowTraceArtifactSchema,
  consentScenarioExecutionArtifactSchema,
} from "@certscore/contracts";
import {
  buildConsentScenarioShadowCompareArtifact,
  formatConsentScenarioShadowCompareMarkdown,
  type ConsentScenarioShadowSiteInput,
} from "../consent-scenario-shadow-compare.js";
import { runScan } from "../index.js";

interface ShadowTarget {
  url: string;
  privacyControlUrls?: string[];
}

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
  const targets = await resolveTargets(args);
  if (targets.length === 0) {
    console.error("Usage: node --import tsx packages/certscore-scan-core/src/cli/consent-dag-shadow.ts --url <url> | --urls <file> [--profile consent] [--out-dir artifacts/v2-consent-dag-shadow]");
    process.exit(1);
  }

  const outDir = args.outDir ?? path.join(process.cwd(), "artifacts", "v2-consent-dag-shadow");
  await mkdir(outDir, { recursive: true });
  const siteInputs: ConsentScenarioShadowSiteInput[] = [];
  const selectedTargets = args.limit ? targets.slice(0, args.limit) : targets;
  for (const target of selectedTargets) {
    const slug = safeSlug(target.url);
    const siteDir = path.join(outDir, "sites", slug);
    await mkdir(siteDir, { recursive: true });
    console.log(`Shadow scanning ${target.url}`);
    siteInputs.push(await runShadowSite({
      target,
      siteDir,
      profile: args.profile ?? "consent",
      captureReplay: args.captureReplay,
      captureReplayTrace: args.captureReplayTrace,
      scenarioConcurrency: args.scenarioConcurrency,
      policyPlanningDeadlineMs: args.policyPlanningDeadlineMs,
      consentFlowDeadlineMs: args.consentFlowDeadlineMs,
      scenarioResourceMode: args.scenarioResourceMode,
      resume: args.resume,
      refreshPlanned: args.refreshPlanned,
    }));
  }

  const artifact = buildConsentScenarioShadowCompareArtifact({
    profile: args.profile ?? "consent",
    sites: siteInputs,
  });
  await writeJson(path.join(outDir, "consent-scenario-shadow-compare.json"), artifact);
  await writeFile(
    path.join(outDir, "consent-scenario-shadow-compare.md"),
    formatConsentScenarioShadowCompareMarkdown(artifact),
  );
  console.log(`Wrote ${path.join(outDir, "consent-scenario-shadow-compare.json")}`);
  console.log(`Wrote ${path.join(outDir, "consent-scenario-shadow-compare.md")}`);
}

async function runShadowSite(input: {
  target: ShadowTarget;
  siteDir: string;
  profile: ScanProfile["profileId"];
  captureReplay?: boolean;
  captureReplayTrace?: boolean;
  scenarioConcurrency?: number;
  policyPlanningDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
  scenarioResourceMode?: "normal" | "lean";
  resume?: boolean;
  refreshPlanned?: boolean;
}): Promise<ConsentScenarioShadowSiteInput> {
  let legacy: CanonicalEvidenceBundle | undefined;
  let planned: CanonicalEvidenceBundle | undefined;
  let legacyDurationMs: number | undefined;
  let plannedDurationMs: number | undefined;
  try {
    const legacyDir = path.join(input.siteDir, "legacy_sequential");
    const plannedDir = path.join(input.siteDir, "planned_parallel");
    legacy = input.resume ? await readBundleIfExists(legacyDir) : undefined;
    planned = input.resume && !input.refreshPlanned ? await readBundleIfExists(plannedDir) : undefined;
    legacyDurationMs = legacy ? bundleDurationMs(legacy) : undefined;
    plannedDurationMs = planned ? bundleDurationMs(planned) : undefined;

    if (!legacy) {
      const legacyStartedAtMs = Date.now();
      legacy = await runScan({
        url: input.target.url,
        profile: input.profile,
        outDir: legacyDir,
        captureReplay: input.captureReplay,
        captureReplayTrace: input.captureReplayTrace,
        privacyControlUrls: input.target.privacyControlUrls,
        scenarioPlanningMode: "legacy_sequential",
        consentFlowDeadlineMs: input.consentFlowDeadlineMs,
      });
      legacyDurationMs = Date.now() - legacyStartedAtMs;
    }

    if (!planned) {
      const plannedStartedAtMs = Date.now();
      planned = await runScan({
        url: input.target.url,
        profile: input.profile,
        outDir: plannedDir,
        captureReplay: input.captureReplay,
        captureReplayTrace: input.captureReplayTrace,
        privacyControlUrls: input.target.privacyControlUrls,
        scenarioPlanningMode: "planned_parallel",
        scenarioConcurrency: input.scenarioConcurrency,
        policyPlanningDeadlineMs: input.policyPlanningDeadlineMs,
        consentFlowDeadlineMs: input.consentFlowDeadlineMs,
        scenarioResourceMode: input.scenarioResourceMode,
      });
      plannedDurationMs = Date.now() - plannedStartedAtMs;
    }
    const plannedExecution = await readInternalArtifact<ConsentScenarioExecutionArtifact>(
      planned,
      "consent_scenario_execution",
      consentScenarioExecutionArtifactSchema,
    );
    const plannedTrace = await readInternalArtifact<ConsentFlowTraceArtifact>(
      planned,
      "consent_flow_trace",
      consentFlowTraceArtifactSchema,
    );

    return {
      url: input.target.url,
      legacy,
      planned,
      legacyDurationMs,
      plannedDurationMs,
      plannedExecution,
      plannedTrace,
    };
  } catch (error) {
    return {
      url: input.target.url,
      legacy,
      planned,
      legacyDurationMs,
      plannedDurationMs,
      failureReason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readInternalArtifact<T>(
  bundle: CanonicalEvidenceBundle,
  artifactId: string,
  schema: { parse(value: unknown): T },
): Promise<T | undefined> {
  const ref = bundle.artifactRefs.find((candidate) => candidate.artifactId === artifactId);
  if (!ref?.path) {
    return undefined;
  }
  return schema.parse(JSON.parse(await readFile(ref.path, "utf8")));
}

async function resolveTargets(args: Args): Promise<ShadowTarget[]> {
  const targets: ShadowTarget[] = args.urls.map((url) => ({ url }));
  if (args.urlsFile) {
    const file = await readFile(args.urlsFile, "utf8");
    targets.push(...file.split(/\r?\n/)
      .map((line) => parseTargetLine(line.trim()))
      .filter((target): target is ShadowTarget => Boolean(target)));
  }
  const byUrl = new Map<string, ShadowTarget>();
  for (const target of targets) {
    const existing = byUrl.get(target.url);
    byUrl.set(target.url, {
      url: target.url,
      privacyControlUrls: [
        ...(existing?.privacyControlUrls ?? []),
        ...(target.privacyControlUrls ?? []),
      ].filter((value, index, values) => values.indexOf(value) === index),
    });
  }
  return [...byUrl.values()];
}

function parseTargetLine(line: string): ShadowTarget | undefined {
  if (line.length === 0 || line.startsWith("#")) {
    return undefined;
  }
  if (!line.startsWith("{")) {
    return { url: line };
  }
  try {
    const parsed = JSON.parse(line) as { url?: unknown; privacyControlUrls?: unknown };
    if (typeof parsed.url !== "string" || parsed.url.length === 0) {
      return undefined;
    }
    return {
      url: parsed.url,
      privacyControlUrls: Array.isArray(parsed.privacyControlUrls)
        ? parsed.privacyControlUrls.filter((value): value is string => typeof value === "string")
        : undefined,
    };
  } catch {
    return undefined;
  }
}

interface Args {
  urls: string[];
  urlsFile?: string;
  profile?: ScanProfile["profileId"];
  outDir?: string;
  captureReplay?: boolean;
  captureReplayTrace?: boolean;
  scenarioConcurrency?: number;
  policyPlanningDeadlineMs?: number;
  consentFlowDeadlineMs?: number;
  scenarioResourceMode?: "normal" | "lean";
  limit?: number;
  resume?: boolean;
  refreshPlanned?: boolean;
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = { urls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--url" && value) {
      parsed.urls.push(value);
      index += 1;
    } else if (key === "--urls" && value) {
      parsed.urlsFile = value;
      index += 1;
    } else if (key === "--profile" && isProfile(value)) {
      parsed.profile = value;
      index += 1;
    } else if ((key === "--out-dir" || key === "--out") && value) {
      parsed.outDir = value;
      index += 1;
    } else if (key === "--capture-replay") {
      parsed.captureReplay = true;
    } else if (key === "--capture-replay-trace") {
      parsed.captureReplay = true;
      parsed.captureReplayTrace = true;
    } else if (key === "--scenario-concurrency" && value) {
      parsed.scenarioConcurrency = numberArg(value);
      index += 1;
    } else if (key === "--policy-planning-deadline-ms" && value) {
      parsed.policyPlanningDeadlineMs = numberArg(value);
      index += 1;
    } else if (key === "--consent-flow-deadline-ms" && value) {
      parsed.consentFlowDeadlineMs = numberArg(value);
      index += 1;
    } else if (key === "--scenario-resource-mode" && isScenarioResourceMode(value)) {
      parsed.scenarioResourceMode = value;
      index += 1;
    } else if (key === "--limit" && value) {
      parsed.limit = numberArg(value);
      index += 1;
    } else if (key === "--resume") {
      parsed.resume = true;
    } else if (key === "--refresh-planned") {
      parsed.resume = true;
      parsed.refreshPlanned = true;
    }
  }
  return parsed;
}

async function readBundleIfExists(outDir: string): Promise<CanonicalEvidenceBundle | undefined> {
  try {
    const bundleJson = await readFile(path.join(outDir, "CanonicalEvidenceBundle.json"), "utf8");
    return canonicalEvidenceBundleSchema.parse(JSON.parse(bundleJson));
  } catch {
    return undefined;
  }
}

function bundleDurationMs(bundle: CanonicalEvidenceBundle): number | undefined {
  const startedAtMs = Date.parse(bundle.startedAt);
  const completedAtMs = Date.parse(bundle.completedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs)) {
    return undefined;
  }
  return Math.max(0, completedAtMs - startedAtMs);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function safeSlug(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "site";
  } catch {
    return url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "site";
  }
}

function isProfile(value: string | undefined): value is ScanProfile["profileId"] {
  return value === "tiny" || value === "quick" || value === "policy" || value === "standard" || value === "consent" || value === "consent_flow" || value === "full";
}

function numberArg(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function isScenarioResourceMode(value: string | undefined): value is "normal" | "lean" {
  return value === "normal" || value === "lean";
}

function flushOutput(stream: NodeJS.WriteStream | WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write("", () => resolve());
  });
}

void canonicalEvidenceBundleSchema;
