#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  US_WEST_LAMBDA_CHROMIUM_CONTEXT_ENV,
  chromiumLaunchOptions,
} from "../playwright-runtime.js";
import { CANONICAL_POST_REFUSAL_RECIPE_SET_ID } from "../post-refusal-cmp-recipes.js";
import { publicTestContactHoldForUrl } from "../public-test-contact-holds.js";

type CalibrationState = "eligible" | "cooldown" | "blocked" | "do_not_calibrate";
type CalibrationManifest = { targets: Array<{ url: string }> };
type EffectiveLedger = {
  entries: Record<string, { state: CalibrationState; url: string }>;
};
type CandidateSelection = {
  artifactVersion: "certscore.california_known_reject_candidate_selection.1";
  generatedAt: string;
  initiatesTargetContact: false;
  scannerRegion: "us-west-1";
  selectionComplete: boolean;
  selected: Array<{
    contactLedger: { effectiveState: "eligible" | "cooldown" };
    exactTargetUrl: string;
    normalizedDomain: string;
  }>;
};
type SingleTargetRun = {
  completedAt?: string;
  laneTimingComparison?: {
    consentProofDeltaMs?: number;
    primaryReadyAtMs?: number;
    rejectReadyBeforeConsentProof?: boolean;
    rejectReadyBeforePrimary?: boolean;
  };
  observationCount?: number;
  publicationDecision?: { mode?: string; rejectReadyDeltaMs?: number };
  refusalRegistrationReason?: string | null;
  refusalRegistrationStatus?: string;
  resolverCmpId?: string | null;
  resolverFound?: boolean;
  resolverReason?: string | null;
  runtime?: { noGoCandidate?: boolean; noGoReasons?: string[] };
  scannerRuntimeStarted?: boolean;
  startedAt?: string;
  status?: "completed" | "failed" | "skipped";
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = await repositoryRoot(process.cwd());
  const envFile = path.resolve(root, args.envFile);
  const envFileText = await readFile(envFile, "utf8");
  const openAiApiKey = envValue(envFileText, "OPENAI_API_KEY");
  if (!openAiApiKey) {
    throw new Error("--env-file does not contain a configured OPENAI_API_KEY.");
  }
  const { manifest, ledger, selectionSource } = args.candidateSelection
    ? await loadCandidateSelection(path.resolve(root, args.candidateSelection))
    : {
        manifest: await readJson<CalibrationManifest>(path.resolve(root, args.manifest)),
        ledger: await readJson<EffectiveLedger>(path.resolve(root, args.ledger)),
        selectionSource: "canonical_calibration_manifest" as const,
      };
  const outDir = path.resolve(root, args.out);
  const explicitExclusions = new Set(args.excludeUrls.map(normalizeTargetUrl));
  const priorityUrls = args.priorityUrls.map(normalizeTargetUrl);
  const excluded: Array<{ reason: string; url: string }> = [];
  const selected: string[] = [];

  for (const target of manifest.targets) {
    const url = normalizeTargetUrl(target.url);
    const entry = ledger.entries[url];
    if (!entry || entry.url !== url) {
      throw new Error(`Central contact ledger is missing the exact registry target ${url}.`);
    }
    if (explicitExclusions.has(url)) {
      excluded.push({ reason: "explicit_repository_policy_exclusion", url });
      continue;
    }
    const hold = publicTestContactHoldForUrl(url);
    if (hold) {
      excluded.push({ reason: `active_public_test_contact_hold:${hold.domain}`, url });
      continue;
    }
    if (entry.state === "blocked" || entry.state === "do_not_calibrate") {
      excluded.push({ reason: `central_ledger_${entry.state}`, url });
      continue;
    }
    selected.push(url);
  }

  for (const priorityUrl of priorityUrls) {
    if (!selected.includes(priorityUrl)) {
      throw new Error(`Priority URL is not a safe selected registry target: ${priorityUrl}.`);
    }
  }
  selected.sort((left, right) => {
    const leftPriority = priorityUrls.indexOf(left);
    const rightPriority = priorityUrls.indexOf(right);
    if (leftPriority >= 0 || rightPriority >= 0) {
      if (leftPriority < 0) return 1;
      if (rightPriority < 0) return -1;
      return leftPriority - rightPriority;
    }
    return manifest.targets.findIndex((target) => normalizeTargetUrl(target.url) === left) -
      manifest.targets.findIndex((target) => normalizeTargetUrl(target.url) === right);
  });

  if (args.onlyUrl) {
    const onlyUrl = normalizeTargetUrl(args.onlyUrl);
    if (!selected.includes(onlyUrl)) {
      throw new Error(`Single-site URL is not a safe selected target: ${onlyUrl}.`);
    }
    for (const url of selected) {
      if (url !== onlyUrl) excluded.push({ reason: "deferred_for_single_site_iteration", url });
    }
    selected.splice(0, selected.length, onlyUrl);
  }

  if (selected.length === 0) throw new Error("No safe public calibration targets remain after exclusions.");
  if (selected.length + excluded.length !== manifest.targets.length) {
    throw new Error("Public cohort plan does not account for every registry target.");
  }

  await mkdir(path.join(outDir, "targets"), { recursive: true });
  const generatedAt = new Date().toISOString();
  let localChromiumVersion: string | null = null;
  if (!args.planOnly) {
    const browser = await chromium.launch(chromiumLaunchOptions({ headless: true }));
    localChromiumVersion = browser.version();
    await browser.close();
  }
  await writeJson(path.join(outDir, "PostRefusalPublicCohortPlan.json"), {
    artifactVersion: "certscore.post_refusal_public_cohort_plan.v1",
    artifactOnly: true,
    cooldownOverrideAuthorization: "explicit_product_owner_one_time_authorization",
    egressLabel: args.egressLabel,
    generatedAt,
    registryTargetCount: manifest.targets.length,
    selectionSource,
    selected,
    excluded,
    configuration: {
      actionSearchTimeoutMs: args.actionSearchMs,
      browserContextProfile: "lambda-us-west-1_with_local_headed_transport_fallback",
      browserMode: "headless_then_bounded_headed_transport_fallback",
      childTimeoutMs: args.childTimeoutMs,
      dispatchDelayMs: args.dispatchDelayMs,
      localChromiumVersion,
      observationWindowMs: args.observationMs,
      resolverMode: CANONICAL_POST_REFUSAL_RECIPE_SET_ID,
      retries: 0,
      modelCredentialSource: "explicit_env_file_not_retained",
    },
  });
  if (args.planOnly) {
    console.log(JSON.stringify({
      event: "post_refusal_public_cohort_plan_completed",
      selectedTargetCount: selected.length,
      excluded,
    }, null, 2));
    return;
  }
  const results: Array<{
    completedAt: string;
    failureReason?: string;
    logPath: string;
    reportPath?: string;
    run?: SingleTargetRun;
    scannerRuntimeStarted: true;
    startedAt: string;
    status: "completed" | "failed";
    url: string;
  }> = [];

  for (const [index, url] of selected.entries()) {
    const slug = targetSlug(url, index + 1);
    const targetDir = path.join(outDir, "targets", slug);
    await mkdir(targetDir, { recursive: true });
    const startedAt = new Date().toISOString();
    const child = await runTarget({
      actionSearchMs: args.actionSearchMs,
      childTimeoutMs: args.childTimeoutMs,
      dispatchDelayMs: args.dispatchDelayMs,
      observationMs: args.observationMs,
      openAiApiKey,
      outDir: targetDir,
      publicAllowlistId: boundedAuthorizationId(args.runKey, slug),
      root,
      url,
    });
    const completedAt = new Date().toISOString();
    const logPath = path.join(targetDir, "PostRefusalPublicTarget.log");
    await writeFile(logPath, child.log, "utf8");
    const reportPath = path.join(targetDir, "PostRefusalThreeLaneCohort.json");
    let run: SingleTargetRun | undefined;
    let failureReason: string | undefined;
    try {
      const report = await readJson<{ runs?: SingleTargetRun[] }>(reportPath);
      run = report.runs?.[0];
      if (!run) failureReason = "single_target_report_missing_run";
    } catch {
      failureReason = child.timedOut
        ? "single_target_child_timeout"
        : `single_target_report_unavailable_exit_${child.exitCode ?? "signal"}`;
    }
    const status = child.exitCode === 0 && run && !failureReason ? "completed" : "failed";
    results.push({
      completedAt,
      ...(failureReason ? { failureReason } : {}),
      logPath,
      ...(run ? { reportPath, run } : {}),
      scannerRuntimeStarted: true,
      startedAt,
      status,
      url,
    });
    await writeOutputs({ excluded, generatedAt, manifest, outDir, results, selected });
    console.log(JSON.stringify({
      event: "post_refusal_public_target_completed",
      index: index + 1,
      total: selected.length,
      url,
      status,
      resolverFound: run?.resolverFound ?? false,
      cmpId: run?.resolverCmpId ?? null,
      registration: run?.refusalRegistrationStatus ?? null,
      observations: run?.observationCount ?? 0,
      failureReason: failureReason ?? null,
    }));
    if (status === "failed") {
      throw new Error(
        `Public cohort stopped after infrastructure failure for ${url}; no automatic retry was attempted.`,
      );
    }
  }

  await writeOutputs({ excluded, generatedAt, manifest, outDir, results, selected });
}

async function writeOutputs(input: {
  excluded: Array<{ reason: string; url: string }>;
  generatedAt: string;
  manifest: CalibrationManifest;
  outDir: string;
  results: Array<{
    completedAt: string;
    failureReason?: string;
    logPath: string;
    reportPath?: string;
    run?: SingleTargetRun;
    scannerRuntimeStarted: true;
    startedAt: string;
    status: "completed" | "failed";
    url: string;
  }>;
  selected: string[];
}): Promise<void> {
  const completeRuns = input.results.flatMap((result) => result.run ? [result.run] : []);
  const rejectDeltas = completeRuns
    .flatMap((run) => typeof run.publicationDecision?.rejectReadyDeltaMs === "number"
      ? [run.publicationDecision.rejectReadyDeltaMs]
      : [])
    .sort((left, right) => left - right);
  const summary = {
    registryTargetCount: input.manifest.targets.length,
    selectedTargetCount: input.selected.length,
    excludedTargetCount: input.excluded.length,
    attemptedCount: input.results.length,
    completedCount: input.results.filter((result) => result.status === "completed").length,
    failedCount: input.results.filter((result) => result.status === "failed").length,
    resolverFoundCount: completeRuns.filter((run) => run.resolverFound).length,
    confirmedRefusalCount: completeRuns.filter(
      (run) => run.refusalRegistrationStatus === "confirmed",
    ).length,
    neutralOrUnconfirmedCount: completeRuns.filter(
      (run) => run.refusalRegistrationStatus !== "confirmed",
    ).length,
    observationCount: completeRuns.reduce((count, run) => count + (run.observationCount ?? 0), 0),
    rejectReadyBeforeConsentProofCount: completeRuns.filter(
      (run) => run.laneTimingComparison?.rejectReadyBeforeConsentProof,
    ).length,
    rejectReadyBeforePrimaryCount: completeRuns.filter(
      (run) => run.laneTimingComparison?.rejectReadyBeforePrimary,
    ).length,
    singleReconciliationCount: completeRuns.length,
    rejectPathTimeoutCount: completeRuns.filter(
      (run) => run.publicationDecision?.mode === "single_reconciliation_limited",
    ).length,
    initialReportCount: completeRuns.length,
    lateGenerationCount: 0,
    medianRejectReadyDeltaMs: median(rejectDeltas),
  };
  await writeJson(path.join(input.outDir, "PostRefusalPublicCohort.json"), {
    artifactVersion: "certscore.post_refusal_public_cohort.v1",
    artifactOnly: true,
    productionProjectable: false,
    generatedAt: input.generatedAt,
    updatedAt: new Date().toISOString(),
    selected: input.selected,
    excluded: input.excluded,
    summary,
    results: input.results,
  });
  await writeJson(path.join(input.outDir, "Wc01V2ScanLabCohort.summary.json"), {
    artifactVersion: "certscore.post_refusal_contact_summary.v1",
    generatedAt: input.generatedAt,
    results: input.results.map((result) => ({
      completedAt: result.completedAt,
      runtime: {
        noGoCandidate: result.run?.runtime?.noGoCandidate === true,
        noGoReasons: result.run?.runtime?.noGoReasons ?? [],
      },
      scannerRuntimeStarted: result.scannerRuntimeStarted,
      startedAt: result.startedAt,
      status: result.status,
      url: result.url,
    })),
  });
}

async function runTarget(input: {
  actionSearchMs: number;
  childTimeoutMs: number;
  dispatchDelayMs: number;
  observationMs: number;
  openAiApiKey: string;
  outDir: string;
  publicAllowlistId: string;
  root: string;
  url: string;
}): Promise<{ exitCode: number | null; log: string; timedOut: boolean }> {
  const entry = path.join(
    input.root,
    "packages/certscore-scan-core/src/cli/post-refusal-cohort.ts",
  );
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    entry,
    "--target-url",
    input.url,
    "--fixtures",
    "tcf",
    "--repetitions",
    "1",
    "--dispatch-delay-ms",
    String(input.dispatchDelayMs),
    "--observation-ms",
    String(input.observationMs),
    "--action-search-ms",
    String(input.actionSearchMs),
    "--join-wait-ms",
    "0",
    "--policy-provider",
    "real",
    "--public-allowlist-id",
    input.publicAllowlistId,
    "--canonical-cmp-registry",
    "--out",
    input.outDir,
  ], {
    cwd: input.root,
    env: {
      ...process.env,
      ...US_WEST_LAMBDA_CHROMIUM_CONTEXT_ENV,
      OPENAI_API_KEY: input.openAiApiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  let timedOut = false;
  const exitCode = await new Promise<number | null>((resolve) => {
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, input.childTimeoutMs);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
    child.once("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
  return { exitCode, log: Buffer.concat(chunks).toString("utf8"), timedOut };
}

function parseArgs(argv: string[]) {
  const parsed = {
    actionSearchMs: 8_000,
    childTimeoutMs: 180_000,
    cooldownOverrideAuthorized: false,
    dispatchDelayMs: 500,
    excludeUrls: [] as string[],
    egressLabel: "unspecified",
    envFile: "",
    ledger: "",
    manifest: "docs/certscore-v2/scan-quality-calibration-manifest.json",
    candidateSelection: "",
    observationMs: 8_000,
    onlyUrl: "",
    out: "",
    planOnly: false,
    priorityUrls: [] as string[],
    runKey: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--cooldown-override-authorized") {
      parsed.cooldownOverrideAuthorized = true;
      continue;
    }
    if (key === "--plan-only") {
      parsed.planOnly = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(`Unknown or incomplete argument: ${key ?? "<missing>"}.`);
    if (key === "--action-search-ms") parsed.actionSearchMs = numberArg(value, 0, 10_000);
    else if (key === "--candidate-selection") parsed.candidateSelection = value;
    else if (key === "--child-timeout-ms") parsed.childTimeoutMs = numberArg(value, 30_000, 300_000);
    else if (key === "--dispatch-delay-ms") parsed.dispatchDelayMs = numberArg(value, 0, 10_000);
    else if (key === "--exclude-url") parsed.excludeUrls.push(value);
    else if (key === "--egress-label") parsed.egressLabel = value.trim().slice(0, 160);
    else if (key === "--env-file") parsed.envFile = value;
    else if (key === "--ledger") parsed.ledger = value;
    else if (key === "--manifest") parsed.manifest = value;
    else if (key === "--observation-ms") parsed.observationMs = numberArg(value, 0, 30_000);
    else if (key === "--only-url") parsed.onlyUrl = value;
    else if (key === "--out") parsed.out = value;
    else if (key === "--priority-url") parsed.priorityUrls.push(value);
    else if (key === "--run-key") parsed.runKey = value;
    else throw new Error(`Unknown argument: ${key}.`);
    index += 1;
  }
  if (!parsed.cooldownOverrideAuthorized) {
    throw new Error("Full-registry public calibration requires --cooldown-override-authorized.");
  }
  if (!parsed.candidateSelection && !parsed.ledger) {
    throw new Error("--ledger is required unless --candidate-selection supplies a fresh central selection.");
  }
  if (parsed.candidateSelection && parsed.ledger) {
    throw new Error("Use either --candidate-selection or --ledger, not both.");
  }
  if (parsed.candidateSelection && !parsed.onlyUrl) {
    throw new Error("--candidate-selection requires --only-url for one-site-at-a-time execution.");
  }
  if (!parsed.envFile) throw new Error("--env-file is required for the real policy provider.");
  if (!parsed.out) throw new Error("--out is required.");
  if (!parsed.runKey || !/^[A-Za-z0-9._-]+$/.test(parsed.runKey)) {
    throw new Error("--run-key is required and may contain only letters, numbers, dot, underscore, or hyphen.");
  }
  return parsed;
}

async function loadCandidateSelection(filePath: string): Promise<{
  ledger: EffectiveLedger;
  manifest: CalibrationManifest;
  selectionSource: "fresh_production_typed_reject_candidate_selection";
}> {
  const selection = await readJson<CandidateSelection>(filePath);
  if (selection.artifactVersion !== "certscore.california_known_reject_candidate_selection.1") {
    throw new Error("Unsupported Reject candidate-selection artifact.");
  }
  if (selection.initiatesTargetContact !== false || selection.scannerRegion !== "us-west-1") {
    throw new Error("Reject candidate selection has incompatible provenance.");
  }
  if (!selection.selectionComplete || selection.selected.length === 0 || selection.selected.length > 50) {
    throw new Error("Reject candidate selection is incomplete or outside the bounded cohort size.");
  }
  const generatedAtMs = Date.parse(selection.generatedAt);
  const ageMs = Date.now() - generatedAtMs;
  if (!Number.isFinite(generatedAtMs) || ageMs < -300_000 || ageMs > 4 * 60 * 60 * 1_000) {
    throw new Error("Reject candidate selection is stale or has an invalid timestamp.");
  }
  const targets: CalibrationManifest["targets"] = [];
  const entries: EffectiveLedger["entries"] = {};
  for (const candidate of selection.selected) {
    const url = normalizeTargetUrl(candidate.exactTargetUrl);
    const normalizedDomain = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    if (normalizedDomain !== candidate.normalizedDomain) {
      throw new Error(`Candidate final host is not bound to its ledger domain: ${url}.`);
    }
    if (entries[url]) throw new Error(`Duplicate Reject candidate URL: ${url}.`);
    if (candidate.contactLedger.effectiveState !== "eligible" &&
        candidate.contactLedger.effectiveState !== "cooldown") {
      throw new Error(`Unsafe contact-ledger state for Reject candidate: ${url}.`);
    }
    targets.push({ url });
    entries[url] = { state: candidate.contactLedger.effectiveState, url };
  }
  return {
    ledger: { entries },
    manifest: { targets },
    selectionSource: "fresh_production_typed_reject_candidate_selection",
  };
}

function boundedAuthorizationId(runKey: string, slug: string): string {
  return `${runKey}-${slug}`.slice(0, 160);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? Math.round(((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2)
    : values[middle] ?? 0;
}

function normalizeTargetUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function numberArg(value: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Numeric argument must be between ${minimum} and ${maximum}.`);
  }
  return Math.round(parsed);
}

function targetSlug(url: string, index: number): string {
  const hostname = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  return `${String(index).padStart(2, "0")}-${hostname}`;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function envValue(contents: string, key: string): string | undefined {
  const line = contents.split(/\r?\n/).find((candidate) =>
    new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(candidate)
  );
  if (!line) return undefined;
  const value = line.slice(line.indexOf("=") + 1).trim();
  if (!value) return undefined;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function repositoryRoot(start: string): Promise<string> {
  let candidate = path.resolve(start);
  while (true) {
    try {
      await access(path.join(candidate, "pnpm-workspace.yaml"));
      await access(path.join(candidate, "docs/certscore-v2/scan-quality-calibration-manifest.json"));
      return candidate;
    } catch {
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        throw new Error("Unable to locate the WC01 repository root.");
      }
      candidate = parent;
    }
  }
}
